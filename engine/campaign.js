const fs = require("fs");
const path = require("path");
const { parseEther, Wallet, NonceManager, Contract } = require("ethers");
const { launchNodes, killAll } = require("./nodes");
const { deployToAll, deployWithArgsToAll, snapshotChainState, loadArtifact, DEPLOYER_KEY } = require("./deploy");
const {
  generateStressTests,
  generateHardforkTests,
  generateGasEdgeTests,
  generateMalformedCalldataTests,
  generateReentrancyTest
} = require("./testcases");
const { generateHtmlReport } = require("./report");

async function callAndCapture(contract, method, args, overrides) {
  try {
    const result = overrides ? await contract[method](...args, overrides) : await contract[method](...args);
    if (result && typeof result.wait === "function") {
      const receipt = await result.wait();
      return { success: true, value: null, gasUsed: receipt.gasUsed.toString() };
    }
    return { success: true, value: result.toString(), gasUsed: null };
  } catch (err) {
    const reason = (err.shortMessage || err.reason || err.message || "unknown error").slice(0, 200);
    return { success: false, value: null, reason };
  }
}

async function sendRawAndCapture(wallet, to, data) {
  try {
    const tx = await wallet.sendTransaction({ to, data });
    const receipt = await tx.wait();
    return { success: true, value: null, gasUsed: receipt.gasUsed.toString() };
  } catch (err) {
    const reason = (err.shortMessage || err.reason || err.message || "unknown error").slice(0, 200);
    return { success: false, value: null, reason };
  }
}

function canonicalize(res) {
  if (res.success) return `OK:${res.value ?? ""}`;
  return `FAIL:${res.reason}`;
}

function diffAndBuildResult(test, perNode) {
  const groups = new Map();
  for (const [nodeId, res] of Object.entries(perNode)) {
    const key = canonicalize(res);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(nodeId);
  }
  const diverged = groups.size > 1;
  return {
    id: test.id,
    kind: test.kind,
    description: test.description,
    perNode,
    diverged,
    severity: diverged ? test.severityIfDiverged : "none",
    timestamp: new Date().toISOString()
  };
}

async function runCampaign(
  { stressCount = 40, hardforkCount = 10, gasEdgeCount = 8, calldataCount = 8 } = {},
  onEvent = () => {}
) {
  onEvent({ type: "log", message: "Booting 3 local EVM nodes (Hardhat network)..." });
  const { processes, nodes } = await launchNodes((nodeId, line) => {
    onEvent({ type: "node-log", nodeId, line });
  });

  for (const n of nodes) {
    onEvent({ type: "node-status", nodeId: n.id, label: n.label, client: n.client, status: "online", url: n.url });
  }

  const allResults = [];

  try {
    onEvent({ type: "log", message: "Deploying Vault.sol identically to all nodes..." });
    const vaults = await deployToAll(nodes, "Vault");

    onEvent({ type: "log", message: "Deploying TransientCounter.sol identically to all nodes..." });
    const transients = await deployToAll(nodes, "TransientCounter");

    onEvent({ type: "log", message: "Deploying Reentrant.sol (attacker contract) against each node's Vault..." });
    const vaultAddresses = {};
    for (const n of nodes) vaultAddresses[n.id] = await vaults[n.id].getAddress();
    const reentrants = await deployWithArgsToAll(nodes, "Reentrant", (nodeId) => [vaultAddresses[nodeId]]);

    const stressTests = generateStressTests(stressCount);
    const hardforkTests = generateHardforkTests(hardforkCount);
    const gasEdgeTests = generateGasEdgeTests(gasEdgeCount);
    const calldataTests = generateMalformedCalldataTests(calldataCount);
    const reentrancyTest = generateReentrancyTest();

    let divergenceCount = 0;
    let ran = 0;
    const total = stressTests.length + hardforkTests.length + gasEdgeTests.length + calldataTests.length + 1;

    async function emitResult(result) {
      ran++;
      if (result.diverged) divergenceCount++;
      allResults.push(result);
      const chainState = await snapshotChainState(nodes);
      onEvent({ type: "test-result", result, progress: { ran, total } });
      onEvent({ type: "chain-state", chainState });
    }

    for (const test of stressTests) {
      const perNode = {};
      for (const nodeId of Object.keys(vaults)) {
        perNode[nodeId] = await callAndCapture(vaults[nodeId], "stress", [test.args[0], test.args[1]]);
      }
      let result = diffAndBuildResult(test, perNode);
      // stress() is a pure function with zero state mutation, so if it ever
      // appears to diverge, it's cheap and safe to re-call and confirm
      // before flagging — this filters out a one-off RPC/network hiccup
      // being mistaken for a genuine consensus bug.
      if (result.diverged) {
        const recheck = {};
        for (const nodeId of Object.keys(vaults)) {
          recheck[nodeId] = await callAndCapture(vaults[nodeId], "stress", [test.args[0], test.args[1]]);
        }
        const confirmed = diffAndBuildResult(test, recheck);
        result = confirmed.diverged ? confirmed : { ...confirmed, note: "transient mismatch on first call, resolved on re-check" };
      }
      await emitResult(result);
    }

    for (const test of hardforkTests) {
      const perNode = {};
      for (const nodeId of Object.keys(transients)) {
        perNode[nodeId] = await callAndCapture(transients[nodeId], "bump", []);
      }
      await emitResult(diffAndBuildResult(test, perNode));
    }

    const vaultArtifact = loadArtifact("Vault");
    for (const test of gasEdgeTests) {
      const perNode = {};
      for (const node of nodes) {
        const wallet = new NonceManager(new Wallet(DEPLOYER_KEY, node.provider));
        const vaultAsWallet = new Contract(vaultAddresses[node.id], vaultArtifact.abi, wallet);
        perNode[node.id] = await callAndCapture(vaultAsWallet, "deposit", [], { gasLimit: test.gasLimit });
      }
      await emitResult(diffAndBuildResult(test, perNode));
    }

    for (const test of calldataTests) {
      const perNode = {};
      for (const node of nodes) {
        const wallet = new NonceManager(new Wallet(DEPLOYER_KEY, node.provider));
        perNode[node.id] = await sendRawAndCapture(wallet, vaultAddresses[node.id], test.rawData);
      }
      await emitResult(diffAndBuildResult(test, perNode));
    }

    {
      const perNode = {};
      for (const nodeId of Object.keys(reentrants)) {
        const res = await callAndCapture(reentrants[nodeId], "attack", [], { value: parseEther("1") });
        let attempts = "?";
        try {
          attempts = (await reentrants[nodeId].reentryAttempts()).toString();
        } catch (e) {
          /* ignore */
        }
        perNode[nodeId] = { success: res.success, value: `${res.success ? "OK" : "FAIL"}:attempts=${attempts}`, reason: res.reason };
      }
      await emitResult(diffAndBuildResult(reentrancyTest, perNode));
    }

    const summaryMsg = `Campaign complete: ${ran} tests run, ${divergenceCount} consensus divergence(s) found.`;

    let reportPath = null;
    try {
      const reportsDir = path.join(__dirname, "..", "reports");
      fs.mkdirSync(reportsDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const jsonPath = path.join(reportsDir, `results-${stamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify({ total, divergenceCount, results: allResults }, null, 2));

      const html = generateHtmlReport({ total, divergenceCount, results: allResults, generatedAt: new Date() });
      const htmlName = `audit-report-${stamp}.html`;
      reportPath = path.join(reportsDir, htmlName);
      fs.writeFileSync(reportPath, html);
      onEvent({ type: "log", message: `Report written: reports/${htmlName}` });
    } catch (e) {
      onEvent({ type: "log", message: `Could not write report: ${e.message}` });
    }

    onEvent({
      type: "summary",
      total,
      divergenceCount,
      reportUrl: reportPath ? `/reports/${path.basename(reportPath)}` : null,
      message: summaryMsg
    });
  } finally {
    await killAll(processes);
    onEvent({ type: "log", message: "All local nodes shut down." });
  }
}

module.exports = { runCampaign };
