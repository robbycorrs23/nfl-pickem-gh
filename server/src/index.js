require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { pool } = require("./db");
const { syncAllPendingWeeks } = require("./espn");
const { ensureSeasonWeeks } = require("./weekAuto");
const weeksRouter = require("./routes/weeks");
const adminRouter = require("./routes/admin");
const playersRouter = require("./routes/players");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin/non-browser requests (no Origin header) and
      // anything explicitly listed in CORS_ORIGINS.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/admin", adminRouter);
app.use("/api/weeks", weeksRouter);
app.use("/api/players", playersRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error." });
});

const PORT = process.env.PORT || 3061;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`nfl-pickem-gh-api listening on 127.0.0.1:${PORT}`);
});

// Auto-grade any week with undecided games every 5 minutes. Cheap (one
// ESPN scoreboard call per pending week) and never overwrites a
// manually-set result.
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  syncAllPendingWeeks(pool).catch((err) => console.error("[espn] sync tick failed:", err));
}, SYNC_INTERVAL_MS);
// Also run once shortly after boot.
setTimeout(() => {
  syncAllPendingWeeks(pool).catch((err) => console.error("[espn] initial sync failed:", err));
}, 10 * 1000);

// Make sure weeks 1..NFL_WEEKS_TO_PROVISION exist (pulling each week's
// schedule from ESPN the first time it's needed) — this is what lets the
// pick'em page and its week dropdown show upcoming weeks with zero admin
// button-clicking. Re-running is a no-op for weeks that already exist, so
// this is safe to do on every boot and periodically thereafter (ESPN
// sometimes hasn't published a far-future week yet, so retrying catches it
// once it is).
const SEASON = Number(process.env.NFL_SEASON) || new Date().getFullYear();
const WEEKS_TO_PROVISION = Number(process.env.NFL_WEEKS_TO_PROVISION) || 18;
const PROVISION_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

function runEnsureSeasonWeeks() {
  ensureSeasonWeeks(pool, { season: SEASON, throughWeek: WEEKS_TO_PROVISION }).catch((err) =>
    console.error("[weekAuto] ensureSeasonWeeks failed:", err)
  );
}
setTimeout(runEnsureSeasonWeeks, 5 * 1000);
setInterval(runEnsureSeasonWeeks, PROVISION_INTERVAL_MS);
