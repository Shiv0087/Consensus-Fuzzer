function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function severityRank(s) {
  return { critical: 3, high: 2, medium: 1, low: 0, none: -1 }[s] ?? -1;
}

function generateHtmlReport({ total, divergenceCount, results, generatedAt }) {
  const findings = results.filter((r) => r.diverged).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const byKind = {};
  for (const r of results) {
    byKind[r.kind] = byKind[r.kind] || { total: 0, diverged: 0 };
    byKind[r.kind].total++;
    if (r.diverged) byKind[r.kind].diverged++;
  }

  const kindLabels = {
    "boundary-arithmetic": "Boundary-Value Arithmetic",
    "hardfork-sensitive-opcode": "Hardfork-Sensitive Opcode (EIP-1153)",
    "gas-limit-boundary": "Gas-Limit Boundary",
    "malformed-calldata": "Malformed Calldata / Invalid Selector",
    "reentrancy-attack": "Reentrancy Attack Simulation"
  };

  const kindRows = Object.entries(byKind)
    .map(([kind, s]) => {
      const rate = s.total ? (((s.total - s.diverged) / s.total) * 100).toFixed(1) : "—";
      return `<tr>
        <td>${esc(kindLabels[kind] || kind)}</td>
        <td>${s.total}</td>
        <td>${s.diverged}</td>
        <td>${rate}%</td>
      </tr>`;
    })
    .join("\n");

  const findingBlocks = findings
    .map((f) => {
      const cells = Object.entries(f.perNode)
        .map(([nodeId, r]) => {
          const status = r.success ? "AGREE / OK" : "REVERT";
          const detail = r.success ? `gas ${r.gasUsed || "—"}${r.value ? " · " + esc(r.value) : ""}` : esc(r.reason || "unknown");
          return `<div class="cell ${r.success ? "pass" : "fail"}">
            <div class="cell-node">${esc(nodeId)}</div>
            <div class="cell-status">${status}</div>
            <div class="cell-detail">${detail}</div>
          </div>`;
        })
        .join("\n");
      return `<div class="finding">
        <div class="finding-head">
          <span class="finding-id">${esc(f.id)}</span>
          <span class="sev sev-${esc(f.severity)}">${esc(f.severity).toUpperCase()}</span>
        </div>
        <div class="finding-desc">${esc(f.description)}</div>
        <div class="diff-grid">${cells}</div>
      </div>`;
    })
    .join("\n");

  const agreementRate = total ? (((total - divergenceCount) / total) * 100).toFixed(1) : "0.0";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Consensus Fuzzer — Audit Report</title>
<style>
  body{ font-family: 'Georgia', 'Times New Roman', serif; color:#0b0e14; max-width:860px; margin:0 auto; padding:48px 32px 80px; background:#fff; }
  h1{ font-size:26px; margin-bottom:4px; }
  .subtitle{ color:#6b7280; font-family: monospace; font-size:13px; margin-bottom:32px; }
  h2{ font-size:16px; text-transform:uppercase; letter-spacing:.06em; border-bottom:2px solid #0b0e14; padding-bottom:6px; margin-top:40px; }
  .stat-row{ display:flex; gap:24px; margin:20px 0 30px; }
  .stat{ border:1px solid #e2e5ea; border-radius:8px; padding:14px 18px; flex:1; }
  .stat .label{ font-family:monospace; font-size:11px; text-transform:uppercase; color:#6b7280; }
  .stat .value{ font-family:monospace; font-size:26px; font-weight:bold; margin-top:4px; }
  .stat.alarm .value{ color:#c81e3a; }
  .stat.ok .value{ color:#0f7b6c; }
  table{ width:100%; border-collapse:collapse; font-family:monospace; font-size:13px; margin:16px 0; }
  th,td{ text-align:left; padding:8px 10px; border-bottom:1px solid #e2e5ea; }
  th{ color:#6b7280; text-transform:uppercase; font-size:11px; letter-spacing:.04em; }
  .finding{ border:1px solid #e2e5ea; border-radius:8px; padding:16px 18px; margin-bottom:14px; page-break-inside:avoid; }
  .finding-head{ display:flex; justify-content:space-between; margin-bottom:8px; }
  .finding-id{ font-family:monospace; font-weight:bold; }
  .sev{ font-family:monospace; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:4px; }
  .sev-critical{ background:#fdecef; color:#c81e3a; }
  .sev-high{ background:#fff3e0; color:#b8860b; }
  .finding-desc{ font-size:13px; color:#374151; margin-bottom:10px; }
  .diff-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  .cell{ border:1px solid #e2e5ea; border-radius:6px; padding:8px 10px; font-family:monospace; font-size:11.5px; }
  .cell.pass{ background:#e9f6f3; border-color:#bfe6de; }
  .cell.fail{ background:#fdecef; border-color:#f3c3cd; }
  .cell-node{ font-size:10px; text-transform:uppercase; color:#6b7280; margin-bottom:3px; }
  .cell-status{ font-weight:bold; margin-bottom:2px; }
  .footer{ margin-top:48px; font-size:12px; color:#6b7280; font-family:monospace; line-height:1.7; border-top:1px solid #e2e5ea; padding-top:16px; }
  @media print { body{ padding:24px; } }
</style>
</head>
<body>
  <h1>Consensus Fuzzer — Audit Report</h1>
  <div class="subtitle">Cross-client differential testing · generated ${esc(generatedAt.toISOString())}</div>

  <h2>Executive Summary</h2>
  <div class="stat-row">
    <div class="stat"><div class="label">Tests Executed</div><div class="value">${total}</div></div>
    <div class="stat alarm"><div class="label">Divergences Found</div><div class="value">${divergenceCount}</div></div>
    <div class="stat ok"><div class="label">Agreement Rate</div><div class="value">${agreementRate}%</div></div>
  </div>
  <p>This report summarizes a differential testing campaign run across three local EVM nodes: two running the
  current Ethereum hardfork (Cancun) and one deliberately configured to run an outdated hardfork (Shanghai),
  simulating a lagging client version still present on a live network. Every test transaction was sent
  identically to all three nodes and their outcomes compared automatically.</p>

  <h2>Results by Test Category</h2>
  <table>
    <tr><th>Category</th><th>Tests Run</th><th>Divergences</th><th>Agreement Rate</th></tr>
    ${kindRows}
  </table>

  <h2>Confirmed Divergences (${findings.length})</h2>
  ${findings.length ? findingBlocks : "<p>No divergences were found in this run.</p>"}

  <div class="footer">
    Methodology: identical bytecode deployed from the same deployer key to all three nodes, guaranteeing
    identical starting state. Divergence is determined by comparing each node's execution OUTCOME
    (success/failure, return value, revert reason) for the same transaction — not raw block hashes, since
    each node is an independent local chain and its block hash differs from the others by construction even
    when every transaction outcome fully agrees.
  </div>
</body>
</html>`;
}

module.exports = { generateHtmlReport };
