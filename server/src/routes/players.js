const express = require("express");
const { pool } = require("../db");
const { requireAdmin } = require("../auth");

const router = express.Router();

// Public: the league roster, for the "pick your name" screen.
router.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT name FROM players ORDER BY name ASC");
    res.json(rows.map((r) => r.name));
  } catch (err) {
    next(err);
  }
});

// Admin: remove someone from the roster (e.g. a typo'd duplicate). Doesn't
// touch any picks they've already made in any week.
router.delete("/:name", requireAdmin, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM players WHERE name_key = $1", [req.params.name.trim().toLowerCase()]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
