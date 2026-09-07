const { runCampaign } = require("../engine/campaign");

runCampaign({ stressCount: 15, hardforkCount: 5 }, (evt) => {
  if (evt.type === "test-result") {
    const r = evt.result;
    const tag = r.diverged ? "!! DIVERGENCE !!" : "ok";
    console.log(`[${evt.progress.ran}/${evt.progress.total}] ${r.id} (${r.kind}) -> ${tag}`);
    if (r.diverged) {
      console.log("   ", JSON.stringify(r.perNode, null, 2));
    }
  } else if (evt.type === "summary") {
    console.log("\n=== SUMMARY ===");
    console.log(evt.message);
  } else if (evt.type === "log") {
    console.log("[engine]", evt.message);
  }
})
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Campaign failed:", err);
    process.exit(1);
  });
