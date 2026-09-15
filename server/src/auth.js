const jwt = require("jsonwebtoken");

const TOKEN_TTL = "30d";

function issueAdminToken() {
  return jwt.sign({ role: "admin" }, process.env.ADMIN_SECRET, { expiresIn: TOKEN_TTL });
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing admin token." });
  }

  try {
    const payload = jwt.verify(token, process.env.ADMIN_SECRET);
    if (payload.role !== "admin") throw new Error("wrong role");
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired admin token." });
  }
}

// Like requireAdmin, but never rejects — just sets req.isAdmin. Used on the
// public picks-submission endpoint so the admin's "import pasted picks"
// tool can bypass the kickoff lock (for corrections) while regular friend
// submissions from index.html (no token) stay locked at kickoff.
function optionalAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  req.isAdmin = false;

  if (token) {
    try {
      const payload = jwt.verify(token, process.env.ADMIN_SECRET);
      if (payload.role === "admin") req.isAdmin = true;
    } catch (err) {
      // Invalid/expired token on this soft check just means "not admin" —
      // don't block the request over it.
    }
  }

  next();
}

module.exports = { issueAdminToken, requireAdmin, optionalAdmin };
