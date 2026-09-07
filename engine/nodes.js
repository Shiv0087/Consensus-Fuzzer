const spawn = require("cross-spawn");
const treeKill = require("tree-kill");
const path = require("path");
const { JsonRpcProvider } = require("ethers");

const ROOT = path.join(__dirname, "..");

const NODE_DEFS = [
  { id: "node-a", label: "Node A", client: "hardfork: cancun (current)", config: "hardhat.nodeA.config.js", port: 8545 },
  { id: "node-b", label: "Node B", client: "hardfork: cancun (current)", config: "hardhat.nodeB.config.js", port: 8546 },
  { id: "node-c", label: "Node C", client: "hardfork: shanghai (outdated)", config: "hardhat.nodeC.config.js", port: 8547 }
];

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function waitForRpc(url, timeoutMs = 20000) {
  const start = Date.now();
  const provider = new JsonRpcProvider(url);
  while (Date.now() - start < timeoutMs) {
    try {
      await provider.getBlockNumber();
      return true;
    } catch (e) {
      await sleep(300);
    }
  }
  throw new Error(`Node at ${url} did not become ready in time`);
}

/**
 * Launches all configured local nodes as child processes.
 * Returns { processes, nodes } where nodes[i] has .provider ready to use.
 */
const HARDHAT_BIN = path.join(ROOT, "node_modules", ".bin", "hardhat");

async function launchNodes(onLog) {
  const processes = [];
  const nodes = [];

  for (const def of NODE_DEFS) {
    const proc = spawn(
      HARDHAT_BIN,
      ["node", "--config", def.config, "--port", String(def.port)],
      { cwd: ROOT, env: process.env }
    );
    proc.stdout.on("data", (d) => onLog && onLog(def.id, d.toString()));
    proc.stderr.on("data", (d) => onLog && onLog(def.id, d.toString()));
    proc.on("error", (err) => {
      onLog && onLog(def.id, `FAILED TO START: ${err.message}`);
    });
    processes.push(proc);
  }

  // Wait for all RPC endpoints to come up
  for (const def of NODE_DEFS) {
    const url = `http://127.0.0.1:${def.port}`;
    await waitForRpc(url);
    nodes.push({
      ...def,
      url,
      provider: new JsonRpcProvider(url)
    });
  }

  return { processes, nodes };
}

function killAll(processes) {
  return Promise.all(
    processes.map(
      (p) =>
        new Promise((resolve) => {
          if (!p.pid) return resolve();
          treeKill(p.pid, "SIGKILL", () => resolve());
        })
    )
  );
}

module.exports = { NODE_DEFS, launchNodes, killAll, sleep };
