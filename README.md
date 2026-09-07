# Consensus Fuzzer — Cross-Client Differential Testing for Blockchain Nodes

Automatically detects **consensus divergence bugs** — cases where different blockchain
nodes disagree about the outcome of the same transaction. This is one of the most
dangerous bug classes in blockchain, because it can split a network's view of the
truth (chain splits, double-spends, exploitable disagreements).

This project runs 3 local EVM nodes side by side, fires the *same* transactions at
all of them, and automatically flags any case where they don't all agree. It ships
with a live, real-time dashboard.

**Cost to run: ₹0.** Everything here is free and open-source and runs entirely on
your own machine — no cloud, no API keys, no paid services.

---

## Why this matters (for your presentation)

Real blockchains rely on every node computing the exact same result for the exact
same input. When that breaks — because of a timing bug, a boundary-value bug, or a
node running an outdated client version — you get consensus divergence. This has
caused real incidents in production blockchain networks.

This project deliberately reproduces the most common real-world cause of
divergence: **client version mismatch**. Two of the three nodes run the current
Ethereum hardfork (Cancun); the third is configured to simulate an outdated client
still running the previous hardfork (Shanghai). When a transaction uses a
Cancun-only feature (transient storage, EIP-1153), the up-to-date nodes execute it
successfully while the outdated node fails — and the fuzzer catches and reports the
disagreement automatically, live, in the dashboard.

Alongside that, it runs several kinds of control tests that should *never*
diverge across identical clients — proving the harness itself is trustworthy,
not just tuned to find the one bug you planted:

- **Boundary-value arithmetic** — 0, 1, max-uint256, and other edge values through a simple vault contract
- **Gas-limit boundary tests** — transactions sent right at, above, and below the intrinsic gas floor
- **Malformed calldata** — raw transactions with garbage function selectors sent directly to the contract
- **A real reentrancy attack simulation** — a deployed attacker contract genuinely attempts to re-enter `Vault.withdraw()` mid-call; since the vault follows checks-effects-interactions, this should fail identically on every node, and the tool verifies that property automatically

### What's new: chain state visibility + auto-generated reports

- **Live Chain State panel** — shows each node's current block number, block hash, and state root in real time, purely for visibility into blockchain internals. Important honesty note (also shown in the dashboard itself): each node here is an *independent* local chain, so their block hashes differ from each other by construction, even when they fully agree on every transaction. The actual divergence detection compares transaction **outcomes**, not block hashes — the panel is educational, not the detection mechanism.
- **Auto-generated audit report** — every campaign run writes a polished, printable HTML report to `reports/audit-report-<timestamp>.html`, with an executive summary, a per-category breakdown table, and full per-node comparisons for every confirmed divergence. Open it in any browser and use "Print → Save as PDF" for a submittable PDF. A matching `results-<timestamp>.json` is also saved with the raw data.

---

## Architecture

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   Node A    │   │   Node B    │   │   Node C    │
│  (Cancun)   │   │  (Cancun)   │   │ (Shanghai)  │
│  port 8545  │   │  port 8546  │   │  port 8547  │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └────────┬────────┴────────┬────────┘
                │                 │
         same contracts    same transactions
                │                 │
                ▼                 ▼
        ┌───────────────────────────────┐
        │      Fuzzing Engine           │
        │  (engine/campaign.js)         │
        │  - deploys identically        │
        │  - sends test transactions    │
        │  - compares outcomes          │
        │  - flags divergences          │
        └───────────────┬────────────────┘
                         │  WebSocket (live)
                         ▼
                ┌─────────────────┐
                │  Dashboard (UI)  │
                │  public/index.html
                └─────────────────┘
```

- `contracts/Vault.sol` — baseline contract for boundary-value arithmetic and gas-limit fuzzing (control group)
- `contracts/TransientCounter.sol` — uses Cancun-only opcodes; the guaranteed real divergence trigger
- `contracts/Reentrant.sol` — attacker contract used to verify the vault resists reentrancy on every node
- `engine/nodes.js` — boots the 3 local nodes and waits for them to be ready
- `engine/deploy.js` — deploys identical bytecode to all 3 nodes from the same deployer key; also snapshots each node's chain state
- `engine/testcases.js` — generates every test type (boundary arithmetic, hardfork-sensitive, gas-edge, malformed calldata, reentrancy)
- `engine/campaign.js` — runs every test against all 3 nodes, compares results, and triggers report generation
- `engine/report.js` — builds the auto-generated HTML audit report
- `server.js` — Express + WebSocket server that runs a campaign and streams results live
- `public/index.html` — the dashboard UI (no build step, plain HTML/CSS/JS)
- `scripts/compile.js` — compiles the Solidity contracts using `solc` directly (avoids Hardhat's compiler auto-downloader, which some restricted networks block)
- `scripts/run-cli.js` — runs a campaign straight from the terminal, no dashboard, useful for quick checks
- `reports/` — generated after each run: a JSON results log and a printable HTML audit report

---

## Setup (one time)

You need **Node.js 18+** installed. Then, from inside the project folder:

```bash
npm install
npm run compile
```

`npm run compile` compiles the two Solidity contracts and writes their ABI/bytecode
into `artifacts-manual/` — this is what gets deployed identically to all three
nodes.

---

## Running it

### Option A — Live dashboard (recommended for your demo)

```bash
npm run dashboard
```

Then open **http://localhost:4000** in your browser and click **Run Campaign**.
You'll see:
- the 3 nodes come online
- a live-scrolling stream of every test as it runs
- a running divergence counter and agreement rate
- a "Confirmed Divergences" panel showing exactly what each node returned, side by side

### Option B — Plain terminal run

```bash
npm run fuzz:cli
```

Runs a campaign straight in your terminal with no browser needed — good for a quick
sanity check or for logging output to a file.

---

## What a real run looks like

In testing, a campaign of 20 transactions (15 boundary-arithmetic + 5
hardfork-sensitive) produced:

- **15/15** boundary tests agreed across all nodes (correct — proves the harness
  has no false positives)
- **5/5** hardfork-sensitive tests diverged exactly as expected: Node A and Node B
  succeeded, Node C failed with a revert because it doesn't recognize the
  transient storage opcode

That's the core result to show live: a reproducible, real, catchable consensus bug.

---

## Windows notes

This has been tested and confirmed working on Windows. A couple of
Windows-specific things are handled for you already:

- Node process spawning uses `cross-spawn`, which resolves the `.cmd` wrapper
  npm creates for binaries on Windows (plain `child_process.spawn` fails with
  `ENOENT` on Windows without this).
- Process cleanup uses `tree-kill`, which correctly kills the whole process
  tree on Windows (a plain `.kill()` can leave orphaned node processes behind
  on Windows because of how it wraps child processes).

If you ever see leftover `node.exe` processes after a crash, open Task Manager
and end any `hardhat` / `node` processes bound to ports 8545–8547, or run:
```
taskkill /IM node.exe /F
```
(only if you're sure nothing else important is using Node on your machine).

---

## Extending this further (optional, for a stronger writeup)

- Swap the EVM nodes for real heterogeneous clients (e.g. Geth vs Erigon) once you
  have the compute for it — same comparison logic applies unchanged
- Add more test-case generators in `engine/testcases.js`: malformed calldata,
  gas-limit edge cases, reentrancy attempts
- Point the same harness at TRON (`java-tron`) if you want to tie it back to a
  real vulnerability class you've already found there — the architecture doesn't
  change, only `engine/nodes.js` and the contract ABI would need to target TRON's
  RPC instead of an EVM JSON-RPC endpoint
- Log every divergence to a persistent file/database so you can show trend data
  over a longer fuzzing run in your report

---

## Notes

- All accounts use Hardhat's well-known test mnemonic — funds have no real value,
  this is a local sandboxed environment only.
- Everything shuts down cleanly: closing the dashboard or letting a campaign finish
  kills all 3 local node processes automatically.
