const MAX_UINT256 = (1n << 256n) - 1n;

function randUint(maxBits = 256) {
  // Bias generator: mostly returns interesting boundary-ish values,
  // occasionally a fully random value, to behave like a real fuzzer
  // rather than pure random noise.
  const boundaryPool = [
    0n,
    1n,
    2n,
    (1n << 8n) - 1n,
    1n << 8n,
    (1n << 64n) - 1n,
    1n << 128n,
    MAX_UINT256 - 1n,
    MAX_UINT256
  ];
  if (Math.random() < 0.6) {
    return boundaryPool[Math.floor(Math.random() * boundaryPool.length)];
  }
  // random value up to maxBits
  let v = 0n;
  for (let i = 0; i < maxBits; i += 30) {
    v = (v << 30n) | BigInt(Math.floor(Math.random() * (1 << 30)));
  }
  return v & MAX_UINT256;
}

/**
 * Generates `count` boundary-arithmetic test cases against Vault.stress(a,b).
 * These should NEVER diverge across identical EVM implementations — they
 * act as the control group proving the harness itself works correctly.
 */
function generateStressTests(count) {
  const tests = [];
  for (let i = 0; i < count; i++) {
    tests.push({
      id: `stress-${i}`,
      kind: "boundary-arithmetic",
      description: "Vault.stress(a, b) — unchecked overflow/underflow arithmetic at boundary values",
      severityIfDiverged: "critical",
      args: [randUint(), randUint()]
    });
  }
  return tests;
}

/**
 * Generates `count` calls to TransientCounter.bump(), which relies on
 * EIP-1153 transient storage opcodes only valid from the Cancun hardfork
 * onward. This is the guaranteed, real divergence trigger.
 */
function generateHardforkTests(count) {
  const tests = [];
  for (let i = 0; i < count; i++) {
    tests.push({
      id: `transient-${i}`,
      kind: "hardfork-sensitive-opcode",
      description: "TransientCounter.bump() — uses TSTORE/TLOAD (EIP-1153, Cancun-only)",
      severityIfDiverged: "high",
      args: []
    });
  }
  return tests;
}

/**
 * Generates `count` deposit calls sent with deliberately extreme gas limits
 * (just above the intrinsic minimum, and absurdly high). Identical clients
 * should reject/accept these identically — another control group, this
 * time targeting gas-accounting logic instead of arithmetic.
 */
function generateGasEdgeTests(count) {
  const tests = [];
  const gasLimits = [21001n, 21064n, 30000n, 10000000n];
  for (let i = 0; i < count; i++) {
    tests.push({
      id: `gasedge-${i}`,
      kind: "gas-limit-boundary",
      description: `Vault.deposit() sent with an extreme gas limit (${gasLimits[i % gasLimits.length]}) to probe gas-accounting edge cases`,
      severityIfDiverged: "critical",
      gasLimit: gasLimits[i % gasLimits.length],
      args: []
    });
  }
  return tests;
}

/**
 * A single, real reentrancy attack attempt against Vault.withdraw() via a
 * deployed attacker contract. This is a genuine security property test —
 * Vault uses checks-effects-interactions, so this should fail identically
 * on every node. Included once per campaign (not repeated — it's a
 * deterministic security check, not a fuzz target).
 */
function generateReentrancyTest() {
  return {
    id: "reentrancy-0",
    kind: "reentrancy-attack",
    description: "Reentrant.attack() — attempts to re-enter Vault.withdraw() mid-call via a malicious receive() hook",
    severityIfDiverged: "critical",
    args: []
  };
}

/**
 * Generates `count` raw transactions with garbage/invalid function
 * selectors sent directly to the Vault contract address (bypassing the
 * ABI entirely). Vault has no fallback function, so every client should
 * reject these identically — a control test targeting call-dispatch
 * logic rather than arithmetic or gas accounting.
 */
function generateMalformedCalldataTests(count) {
  const tests = [];
  for (let i = 0; i < count; i++) {
    const junkBytes = Math.floor(Math.random() * 4) + 4; // 4-7 random bytes
    let data = "0x";
    for (let b = 0; b < junkBytes; b++) {
      data += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
    }
    tests.push({
      id: `calldata-${i}`,
      kind: "malformed-calldata",
      description: `Raw transaction with invalid function selector (${data}) sent directly to Vault`,
      severityIfDiverged: "high",
      rawData: data
    });
  }
  return tests;
}

module.exports = {
  generateStressTests,
  generateHardforkTests,
  generateGasEdgeTests,
  generateReentrancyTest,
  generateMalformedCalldataTests,
  randUint,
  MAX_UINT256
};
