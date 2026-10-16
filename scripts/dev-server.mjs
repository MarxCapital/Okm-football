// Serveur local SANS outil Cloudflare : sert public/ et exécute l'API (/api/*) sur une base SQLite locale.
// Utile pour essayer le site et l'administration sur votre ordinateur, ou lancer les tests de navigateur.
// Les données sont conservées dans .dev/okm.sqlite (ignoré par Git). Pour repartir de zéro : supprimez ce fichier.
// Ce n'est PAS le serveur de production : en ligne, c'est Cloudflare (Pages Functions + D1 + R2).
//
// Lancer :  npm run dev:local            puis ouvrir http://localhost:8788
// Jeton d'installation par défaut : jeton-local-0123456789 (variable SETUP_TOKEN pour le changer)
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "../server/router.js";
import { seedSql } from "./build-seed.mjs";

const root = resolve(fileURLToPath(new URL("../public/", import.meta.url)));
const dataDir = resolve(fileURLToPath(new URL("../.dev/", import.meta.url)));
const port = Number(process.env.PORT || 8788);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm", ".xml": "application/xml", ".txt": "text/plain" };

mkdirSync(dataDir, { recursive: true });
const dbFile = process.env.DB_FILE || join(dataDir, "okm.sqlite");
const fresh = !existsSync(dbFile);
const sqlite = new DatabaseSync(dbFile);
if (fresh) for (const f of readdirSync(new URL("../migrations/", import.meta.url)).filter((n) => n.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8"));

// DEMO=1 : charge les contenus de démonstration (photos, vidéos, matchs…) dans une base neuve.
if (fresh && process.env.DEMO) for (const line of seedSql().split("\n")) if (line.startsWith("INSERT")) sqlite.exec(line);

const DB = {
  prepare(sql) {
    const stmt = sqlite.prepare(sql);
    let params = [];
    const api = {
      bind(...p) { params = p; return api; },
      async all() { return { results: stmt.all(...params).map((r) => ({ ...r })) }; },
      async first() { const r = stmt.get(...params); return r ? { ...r } : null; },
      async run() { const r = stmt.run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
    };
    return api;
  },
};

// Applique les en-têtes de sécurité de public/_headers (bloc "/*"), comme le fait Cloudflare Pages.
function globalHeaders() {
  const out = {};
  let inBlock = false;
  for (const line of readFileSync(join(root, "_headers"), "utf8").split("\n")) {
    if (/^\S/.test(line) && !line.startsWith("#")) inBlock = line.trim() === "/*";
    else if (inBlock && /^\s+[\w-]+:/.test(line)) { const i = line.indexOf(":"); out[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  }
  return out;
}
const SECURITY = globalHeaders();

const files = new Map();
const MEDIA = {
  async put(key, bytes, opts) { files.set(key, { bytes, httpMetadata: opts?.httpMetadata }); },
  async head(key) { const o = files.get(key); return o ? { size: o.bytes.length, httpMetadata: o.httpMetadata } : null; },
  async get(key, opts) { const o = files.get(key); if (!o) return null; const r = opts?.range; return { body: r ? o.bytes.slice(r.offset, r.offset + r.length) : o.bytes, httpMetadata: o.httpMetadata }; },
};
const env = { DB, MEDIA, SETUP_TOKEN: process.env.SETUP_TOKEN || "jeton-local-0123456789" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith("/api")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
    const out = await handle(request, env);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
    return;
  }
  const clean = decodeURIComponent(url.pathname);
  const candidates = [clean, `${clean}.html`, join(clean, "index.html")].map((p) => join(root, p));
  const file = candidates.find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!file) {
    res.writeHead(404, { ...SECURITY, "content-type": types[".html"] });
    res.end(readFileSync(join(root, "404.html")));
    return;
  }
  res.writeHead(200, { ...SECURITY, "content-type": types[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});

server.listen(port, () => console.log(`Site local : http://localhost:${port}   Administration : http://localhost:${port}/okm/   (jeton d'installation : ${env.SETUP_TOKEN})`));
