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

module.exports = { issueAdminToken, requireAdmin };
