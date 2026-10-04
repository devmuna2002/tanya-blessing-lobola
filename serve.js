// Invitation site + RSVP database API.
// Local: node serve.js  →  open http://localhost:8080
// Hosted (Render / Railway / VPS): start command `npm start`, port comes from process.env.PORT.
// Storage: SQLite file (rsvps.db, override with RSVP_DB_PATH). rsvps.json is kept
// as a backup export only — the database is the source of truth.
// NOTE: on ephemeral/static hosts (GitHub Pages, Netlify static, Vercel static)
// /api/* does not exist — the front-end falls back to WhatsApp, so guests can
// still RSVP.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const ROOT = __dirname;
const JSON_BACKUP = path.join(ROOT, "rsvps.json");
const DB_FILE = process.env.RSVP_DB_PATH || path.join(ROOT, "rsvps.db");
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { ".html": "text/html", ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".json": "application/json" };

// ---- SQLite RSVP database ----
const db = new DatabaseSync(DB_FILE);
db.exec(`CREATE TABLE IF NOT EXISTS rsvps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  attending TEXT NOT NULL,
  guests TEXT NOT NULL DEFAULT '1',
  message TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL
)`);
const qInsert = db.prepare("INSERT INTO rsvps (name, attending, guests, message, at) VALUES (?, ?, ?, ?, ?)");
const qAll = db.prepare("SELECT id, name, attending, guests, message, at FROM rsvps ORDER BY id ASC");
const qCount = db.prepare("SELECT COUNT(*) AS n FROM rsvps");

function loadRsvps() { return qAll.all(); }
function addRsvp({ name, attending, guests, message }) {
  const at = new Date().toISOString();
  qInsert.run(name, attending, guests, message, at);
  syncJsonBackup();
  return { name, attending, guests, message, at };
}
// Keep rsvps.json as a readable backup export (never read from it).
function syncJsonBackup() {
  try { fs.writeFileSync(JSON_BACKUP, JSON.stringify(loadRsvps(), null, 2)); } catch (e) { /* backup best-effort */ }
}
// One-time migration from the old rsvps.json store.
(function migrateFromJson() {
  try {
    if (qCount.get().n > 0) return;
    const raw = JSON.parse(fs.readFileSync(JSON_BACKUP, "utf8"));
    if (!Array.isArray(raw) || raw.length === 0) return;
    for (const r of raw) {
      const name = String(r.name || "").trim();
      const attending = String(r.attending || "").trim();
      if (!name || !attending) continue;
      qInsert.run(name, attending, String(r.guests || "1"), String(r.message || "").trim(), r.at || new Date().toISOString());
    }
    console.log("migrated " + qCount.get().n + " RSVP(s) from rsvps.json to " + DB_FILE);
  } catch (e) { /* no JSON store to migrate */ }
})();
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", c => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on("end", () => resolve(b));
    req.on("error", reject);
  });
}
http.createServer(async (req, res) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store" };
  try {
    const url = decodeURIComponent(req.url.split("?")[0]);
    if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
    if (url === "/api/rsvp" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const name = String(body.name || "").trim();
      const attending = String(body.attending || "").trim();
      if (!name || !attending) { res.writeHead(400, cors); res.end(JSON.stringify({ ok: false })); return; }
      addRsvp({ name, attending, guests: String(body.guests || "1"), message: String(body.message || "").trim() });
      res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, cors));
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url === "/api/rsvps" && req.method === "GET") {
      res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, cors));
      res.end(JSON.stringify(loadRsvps()));
      return;
    }
    if (url === "/rsvps.json" || url === "/rsvps.db" || url === "/serve.js" || url === "/server.log" || url === "/package.json" || url === "/package-lock.json") { res.writeHead(403, cors); res.end(); return; }
    const safePath = path.normalize(path.join(ROOT, url === "/" ? "/index.html" : url));
    if (!safePath.startsWith(ROOT)) { res.writeHead(403, cors); res.end(); return; }
    const file = safePath;
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, cors); res.end("not found"); return; }
      res.writeHead(200, Object.assign({ "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" }, cors));
      res.end(data);
    });
  } catch (e) { res.writeHead(500, cors); res.end(); }
}).listen(PORT, "0.0.0.0", () => console.log("serving " + ROOT + " on :" + PORT));
