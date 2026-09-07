const fs = require("fs");
const path = require("path");
const { Wallet, ContractFactory, NonceManager } = require("ethers");

const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // hardhat account #0, same on every node (same mnemonic)

function loadArtifact(name) {
  const p = path.join(__dirname, "..", "artifacts-manual", `${name}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * Deploys `contractName` to every node using the SAME deployer key, so
 * every node produces the same contract address and identical starting
 * state. Returns a map: nodeId -> ethers Contract instance.
 */
async function deployToAll(nodes, contractName) {
  const artifact = loadArtifact(contractName);
  const contracts = {};

  for (const node of nodes) {
    const wallet = new NonceManager(new Wallet(DEPLOYER_KEY, node.provider));
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    contracts[node.id] = contract;
  }

  return contracts;
}

/**
 * Same as deployToAll, but for contracts that take constructor args which
 * differ per node (e.g. Reentrant needs each node's own Vault address).
 * `argsForNode(nodeId)` returns the constructor args array for that node.
 */
async function deployWithArgsToAll(nodes, contractName, argsForNode) {
  const artifact = loadArtifact(contractName);
  const contracts = {};

  for (const node of nodes) {
    const wallet = new NonceManager(new Wallet(DEPLOYER_KEY, node.provider));
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const contract = await factory.deploy(...argsForNode(node.id));
    await contract.waitForDeployment();
    contracts[node.id] = contract;
  }

  return contracts;
}

/**
 * Snapshots each node's latest block: number, hash, and state root. Used
 * purely for the "chain state" educational panel in the dashboard — the
 * actual divergence detection compares execution OUTCOMES (see
 * campaign.js), not these hashes, since each node is a separate local
 * chain and its block hash will differ from the others even when they
 * fully agree on every transaction's result.
 */
async function snapshotChainState(nodes) {
  const snapshot = {};
  for (const node of nodes) {
    try {
      const block = await node.provider.send("eth_getBlockByNumber", ["latest", false]);
      snapshot[node.id] = {
        number: parseInt(block.number, 16),
        hash: block.hash,
        stateRoot: block.stateRoot
      };
    } catch (e) {
      snapshot[node.id] = { number: null, hash: null, stateRoot: null };
    }
  }
  return snapshot;
}

module.exports = { deployToAll, deployWithArgsToAll, snapshotChainState, loadArtifact, DEPLOYER_KEY };
