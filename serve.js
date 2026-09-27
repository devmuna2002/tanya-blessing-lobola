// Local preview server for the invitation site (serves the RSVP database API too).
// Run: node serve.js  →  open http://localhost:8080
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const DB = path.join(ROOT, "rsvps.json");
const TYPES = { ".html": "text/html", ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".json": "application/json" };
function loadRsvps() { try { const d = JSON.parse(fs.readFileSync(DB, "utf8")); return Array.isArray(d) ? d : []; } catch (e) { return []; } }
function saveRsvps(list) { fs.writeFileSync(DB, JSON.stringify(list, null, 2)); }
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
      const list = loadRsvps();
      list.push({ name, attending, guests: String(body.guests || "1"), message: String(body.message || "").trim(), at: new Date().toISOString() });
      saveRsvps(list);
      res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, cors));
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url === "/api/rsvps" && req.method === "GET") {
      res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, cors));
      res.end(JSON.stringify(loadRsvps()));
      return;
    }
    if (url === "/rsvps.json") { res.writeHead(403, cors); res.end(); return; }
    const file = path.join(ROOT, url === "/" ? "/lobola_wedding_template.html" : url);
    if (!file.startsWith(ROOT)) { res.writeHead(403, cors); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, cors); res.end("not found"); return; }
      res.writeHead(200, Object.assign({ "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" }, cors));
      res.end(data);
    });
  } catch (e) { res.writeHead(500, cors); res.end(); }
}).listen(8080, "0.0.0.0", () => console.log("serving " + ROOT + " on :8080"));
