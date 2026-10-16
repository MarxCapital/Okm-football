// Mode Supabase : l'API Supabase est simulée (aucun accès réseau).
import test from "node:test";
import assert from "node:assert/strict";
import { createEnv, client } from "./helpers.mjs";

const URL_ = "https://exemple.supabase.co";
const KEY = "sb_publishable_test";

function fakeSupabase(accounts) {
  const calls = [];
  const tokens = new Map();
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (!url.startsWith(URL_)) return original(input, init);
    const path = url.slice(URL_.length);
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : {};
    calls.push({ method: init.method, path, apikey: headers.get("apikey"), authorization: headers.get("authorization"), body });
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (path.startsWith("/auth/v1/token")) {
      const a = accounts.get(String(body.email).toLowerCase());
      if (!a || a.password !== body.password) return reply(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
      const t = `tok-${a.id}-${tokens.size}`;
      tokens.set(t, a);
      return reply(200, { access_token: t, user: { id: a.id, email: a.email } });
    }
    if (path.startsWith("/auth/v1/logout")) return reply(204, {});
    if (path === "/auth/v1/user" && init.method === "PUT") {
      const a = tokens.get((headers.get("authorization") || "").replace("Bearer ", ""));
      if (!a) return reply(401, {});
      a.password = body.password;
      return reply(200, { id: a.id });
    }
    if (path === "/auth/v1/admin/users" && init.method === "POST") {
      if (headers.get("apikey") !== "sb_secret_test") return reply(401, {});
      const id = `sb-${accounts.size + 1}`;
      accounts.set(body.email, { id, email: body.email, password: body.password });
      return reply(200, { id });
    }
    if (path.startsWith("/auth/v1/admin/users/") && init.method === "PUT") {
      const a = [...accounts.values()].find((x) => x.id === path.split("/").pop());
      if (!a) return reply(404, {});
      a.password = body.password;
      return reply(200, {});
    }
    return reply(404, {});
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const mkEnv = (extra = {}) => createEnv({ SUPABASE_URL: URL_, SUPABASE_PUBLISHABLE_KEY: KEY, ADMIN_EMAIL: "Chef@Okm.test", SETUP_TOKEN: undefined, ...extra });

test("Supabase : le compte ADMIN_EMAIL se connecte et devient administrateur", async () => {
  const accounts = new Map([["chef@okm.test", { id: "sb-1", email: "chef@okm.test", password: "Mdp-de-test-123" }]]);
  const sb = fakeSupabase(accounts);
  try {
    const env = mkEnv();
    const c = client(env);
    const bad = await c.post("/api/auth/login", { email: "chef@okm.test", password: "faux" });
    assert.equal(bad.status, 401);
    const ok = await c.post("/api/auth/login", { email: "Chef@okm.test", password: "Mdp-de-test-123" });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.user.role, "admin");
    assert.equal((await c.get("/api/auth/me")).data.user.email, "chef@okm.test");
    assert.equal((await c.get("/api/admin/stats")).status, 200);
    // La clé publique part dans l'en-tête apikey, jamais dans Authorization ; le mot de passe n'est jamais journalisé.
    const login = sb.calls.find((x) => x.path.startsWith("/auth/v1/token"));
    assert.equal(login.apikey, KEY);
    assert.equal(login.authorization, null);
    const audit = await c.get("/api/admin/audit");
    assert.ok(!JSON.stringify(audit.data).includes("Mdp-de-test-123"));
    // L'installation par jeton n'existe pas en mode Supabase.
    assert.equal((await client(env).post("/api/setup", { token: "x", name: "a", email: "a@b.co", password: "x".repeat(14) })).status, 404);
    assert.equal((await client(env).get("/api/auth/me")).data.needsSetup, false);
  } finally { sb.restore(); }
});

test("Supabase : un compte Supabase non autorisé est refusé, et le verrouillage reste actif", async () => {
  const accounts = new Map([
    ["chef@okm.test", { id: "sb-1", email: "chef@okm.test", password: "Mdp-de-test-123" }],
    ["intrus@exemple.com", { id: "sb-9", email: "intrus@exemple.com", password: "Intrus-Mdp-123456" }],
  ]);
  const sb = fakeSupabase(accounts);
  try {
    const env = mkEnv();
    const intrus = client(env);
    const r = await intrus.post("/api/auth/login", { email: "intrus@exemple.com", password: "Intrus-Mdp-123456" });
    assert.equal(r.status, 403);
    assert.equal((await intrus.get("/api/admin/stats")).status, 401);
    const c = client(env, { ip: "10.9.9.9" });
    for (let i = 0; i < 5; i++) assert.equal((await c.post("/api/auth/login", { email: "chef@okm.test", password: "nope" })).status, 401);
    assert.equal((await c.post("/api/auth/login", { email: "chef@okm.test", password: "Mdp-de-test-123" })).status, 429, "même le bon mot de passe est bloqué pendant le verrouillage");
  } finally { sb.restore(); }
});

test("Supabase : changement de mot de passe et création de comptes", async () => {
  const accounts = new Map([["chef@okm.test", { id: "sb-1", email: "chef@okm.test", password: "Mdp-de-test-123" }]]);
  const sb = fakeSupabase(accounts);
  try {
    const env = mkEnv({ SUPABASE_SERVICE_KEY: "sb_secret_test" });
    const c = client(env);
    assert.equal((await c.post("/api/auth/login", { email: "chef@okm.test", password: "Mdp-de-test-123" })).status, 200);
    // Nouveau mot de passe trop court : refusé avant tout appel à Supabase.
    assert.equal((await c.post("/api/auth/password", { current: "Mdp-de-test-123", next: "court" })).status, 422);
    assert.equal((await c.post("/api/auth/password", { current: "mauvais", next: "Nouveau-mdp-solide-1" })).status, 422);
    assert.equal((await c.post("/api/auth/password", { current: "Mdp-de-test-123", next: "Nouveau-mdp-solide-1" })).status, 200);
    assert.equal(accounts.get("chef@okm.test").password, "Nouveau-mdp-solide-1");
    assert.equal((await c.get("/api/admin/stats")).status, 401, "toutes les sessions sont fermées");
    const c2 = client(env);
    assert.equal((await c2.post("/api/auth/login", { email: "chef@okm.test", password: "Nouveau-mdp-solide-1" })).status, 200);

    // Création d'un compte « sport » (clé secrète présente : le compte est aussi créé dans Supabase).
    const created = await c2.post("/api/admin/users", { name: "Resp Sport", email: "sport@okm.test", role: "sport", active: true, password: "Mot-de-passe-solide-1" });
    assert.equal(created.status, 201);
    assert.ok(accounts.has("sport@okm.test"));
    const sport = client(env);
    assert.equal((await sport.post("/api/auth/login", { email: "sport@okm.test", password: "Mot-de-passe-solide-1" })).status, 200);
    assert.equal((await sport.get("/api/admin/users")).status, 403);
    // Réinitialisation par l'administrateur.
    const id = created.data.item.id;
    assert.equal((await c2.put(`/api/admin/users/${id}`, { name: "Resp Sport", email: "sport@okm.test", role: "sport", active: true, password: "Autre-mdp-solide-12" })).status, 200);
    assert.equal(accounts.get("sport@okm.test").password, "Autre-mdp-solide-12");
    // Désactivation : l'accès est coupé même si le mot de passe Supabase reste valable.
    assert.equal((await c2.put(`/api/admin/users/${id}`, { name: "Resp Sport", email: "sport@okm.test", role: "sport", active: false })).status, 200);
    assert.equal((await client(env).post("/api/auth/login", { email: "sport@okm.test", password: "Autre-mdp-solide-12" })).status, 403);
  } finally { sb.restore(); }
});

test("Supabase sans clé secrète : le compte est autorisé localement, le mot de passe se gère dans Supabase", async () => {
  const accounts = new Map([
    ["chef@okm.test", { id: "sb-1", email: "chef@okm.test", password: "Mdp-de-test-123" }],
    ["com@okm.test", { id: "sb-2", email: "com@okm.test", password: "Mdp-com-123456" }],
  ]);
  const sb = fakeSupabase(accounts);
  try {
    const env = mkEnv();
    const c = client(env);
    await c.post("/api/auth/login", { email: "chef@okm.test", password: "Mdp-de-test-123" });
    const created = await c.post("/api/admin/users", { name: "Com", email: "com@okm.test", role: "communication", active: true });
    assert.equal(created.status, 201);
    const com = client(env);
    assert.equal((await com.post("/api/auth/login", { email: "com@okm.test", password: "Mdp-com-123456" })).status, 200);
    const bad = await c.put(`/api/admin/users/${created.data.item.id}`, { name: "Com", email: "com@okm.test", role: "communication", active: true, password: "Un-autre-mdp-1234" });
    assert.equal(bad.status, 422);
  } finally { sb.restore(); }
});

test("Supabase indisponible : erreur claire, pas de session", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("network"); };
  try {
    const env = mkEnv();
    const c = client(env);
    const r = await c.post("/api/auth/login", { email: "chef@okm.test", password: "Mdp-de-test-123" });
    assert.equal(r.status, 502);
    assert.equal((await c.get("/api/admin/stats")).status, 401);
  } finally { globalThis.fetch = original; }
});
