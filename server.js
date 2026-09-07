const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");
const { runCampaign } = require("./engine/campaign");

const PORT = process.env.PORT || 4000;

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use("/reports", express.static(path.join(__dirname, "reports")));

const server = app.listen(PORT, () => {
  console.log(`\nDashboard running at http://localhost:${PORT}\n`);
});

const wss = new WebSocketServer({ server });

let clients = [];
let campaignRunning = false;
let history = [];

wss.on("connection", (ws) => {
  clients.push(ws);
  // Replay history so a client that connects mid-run (or reconnects) sees everything so far
  ws.send(JSON.stringify({ type: "replay", events: history }));
  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
  });
});

function broadcast(evt) {
  history.push(evt);
  const payload = JSON.stringify(evt);
  for (const c of clients) {
    if (c.readyState === c.OPEN) c.send(payload);
  }
}

app.post("/api/start", express.json(), async (req, res) => {
  if (campaignRunning) {
    return res.status(409).json({ error: "Campaign already running" });
  }
  campaignRunning = true;
  history = [];
  broadcast({ type: "reset" });
  res.json({ ok: true });

  const stressCount = Number(req.body?.stressCount) || 60;
  const hardforkCount = Number(req.body?.hardforkCount) || 15;
  const gasEdgeCount = Number(req.body?.gasEdgeCount) || 8;
  const calldataCount = Number(req.body?.calldataCount) || 8;

  try {
    await runCampaign({ stressCount, hardforkCount, gasEdgeCount, calldataCount }, broadcast);
  } catch (err) {
    broadcast({ type: "log", message: `ERROR: ${err.message}` });
  } finally {
    campaignRunning = false;
  }
});

app.get("/api/status", (req, res) => {
  res.json({ running: campaignRunning });
});
