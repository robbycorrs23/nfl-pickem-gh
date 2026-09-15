require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { pool } = require("./db");
const { syncAllPendingWeeks } = require("./espn");
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
