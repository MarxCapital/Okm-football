// Outils de test : une base SQLite en mémoire qui imite l'API de Cloudflare D1, et un faux R2.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { handle } from "../server/router.js";

export function createD1() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(new URL("../migrations/", import.meta.url)).filter((n) => n.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8"));
  const wrap = (sql) => {
    const stmt = db.prepare(sql);
    let params = [];
    const api = {
      bind(...p) { params = p; return api; },
      async all() { return { results: stmt.all(...params).map((r) => ({ ...r })) }; },
      async first() { const r = stmt.get(...params); return r ? { ...r } : null; },
      async run() { const r = stmt.run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
    };
    return api;
  };
  return { prepare: wrap };
}

export function createR2() {
  const store = new Map();
  return {
    async put(key, bytes, opts) { store.set(key, { bytes, httpMetadata: opts?.httpMetadata }); },
    async head(key) {
      const o = store.get(key);
      return o ? { size: o.bytes.length, httpMetadata: o.httpMetadata } : null;
    },
    async get(key, opts) {
      const o = store.get(key);
      if (!o) return null;
      const r = opts?.range;
      return { body: r ? o.bytes.slice(r.offset, r.offset + r.length) : o.bytes, httpMetadata: o.httpMetadata };
    },
    _store: store,
  };
}

export function createEnv(extra = {}) {
  return { DB: createD1(), MEDIA: createR2(), SETUP_TOKEN: "jeton-de-test-0123456789", ...extra };
}

let ipCounter = 0;
/** Client HTTP de test : garde son cookie de session, comme un navigateur. */
export function client(env, { ip } = {}) {
  let cookie = "";
  const myIp = ip || `10.0.0.${++ipCounter}`;
  async function call(method, path, { body, form, headers = {}, csrf = true, raw = false } = {}) {
    const h = { "cf-connecting-ip": myIp, ...headers };
    if (csrf) h["x-requested-with"] = "okm-admin";
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { h["content-type"] = "application/json"; payload = JSON.stringify(body); }
    if (cookie) h.cookie = cookie;
    const res = await handle(new Request(`http://localhost${path}`, { method, headers: h, body: payload }), env);
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0].endsWith("=") ? "" : set.split(";")[0];
    if (raw) return res;
    let data = null;
    try { data = await res.json(); } catch { /* corps vide */ }
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (p, o) => call("GET", p, o),
    post: (p, body, o) => call("POST", p, { body, ...o }),
    put: (p, body, o) => call("PUT", p, { body, ...o }),
    del: (p, o) => call("DELETE", p, o),
    call,
    get cookie() { return cookie; },
  };
}

export const PASSWORD = "Mot-de-passe-solide-1";

/** Crée l'administrateur initial et renvoie un client connecté. */
export async function adminClient(env) {
  const c = client(env);
  const s = await c.post("/api/setup", { token: env.SETUP_TOKEN, name: "Admin Test", email: "admin@okm.test", password: PASSWORD });
  if (s.status !== 201) throw new Error(`setup: ${s.status} ${JSON.stringify(s.data)}`);
  const l = await c.post("/api/auth/login", { email: "admin@okm.test", password: PASSWORD });
  if (l.status !== 200) throw new Error(`login: ${l.status}`);
  return c;
}

/** Crée un compte avec un rôle et renvoie un client connecté. */
export async function userClient(env, admin, role) {
  const email = `${role}@okm.test`;
  const r = await admin.post("/api/admin/users", { name: `Resp ${role}`, email, role, active: true, password: PASSWORD });
  if (r.status !== 201) throw new Error(`user: ${r.status} ${JSON.stringify(r.data)}`);
  const c = client(env);
  const l = await c.post("/api/auth/login", { email, password: PASSWORD });
  if (l.status !== 200) throw new Error(`login ${role}: ${l.status}`);
  return c;
}
