import test from "node:test";
import assert from "node:assert/strict";
import { createEnv, client } from "./helpers.mjs";
import { seedSql, removeSql } from "../scripts/build-seed.mjs";
import { demoData } from "../seed/demo-data.mjs";
import { COLLECTIONS } from "../public/okm/js/schema.js";
import { validateDoc } from "../server/validate.js";
import { existsSync } from "node:fs";

async function seeded() {
  const env = createEnv();
  for (const line of seedSql().split("\n")) if (line.startsWith("INSERT")) await env.DB.prepare(line).run();
  return env;
}

test("chaque donnée de démonstration respecte le schéma de l'administration", async () => {
  const env = await seeded();
  for (const [key, rows] of Object.entries(demoData())) {
    const def = COLLECTIONS[key === "settings" ? "settings" : key];
    for (const { id, ...doc } of rows) {
      try {
        await validateDoc(env, def, doc);
      } catch (e) {
        assert.fail(`${key}/${id} : ${JSON.stringify(e.errors ?? e.details ?? e.message)}`);
      }
    }
  }
});

test("les fichiers de démonstration référencés existent", () => {
  const paths = new Set();
  const scan = (v) => {
    if (typeof v === "string" && v.startsWith("/demo/")) paths.add(v);
    else if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === "object") Object.values(v).forEach(scan);
  };
  scan(demoData());
  assert.ok(paths.size > 20);
  for (const p of paths) assert.ok(existsSync(new URL(`../public${p}`, import.meta.url)), `fichier manquant : ${p}`);
});

test("l'API publique expose la démonstration sans donnée privée", async () => {
  const env = await seeded();
  const c = client(env);
  const players = (await c.get("/api/players")).data;
  assert.equal(players.length, 8);
  assert.ok(players.every((p) => p.publicName.endsWith(".") && !("guardianName" in p) && !("internalNotes" in p) && p.photo === ""));
  const news = (await c.get("/api/news")).data;
  assert.equal(news.length, 5, "le brouillon reste invisible");
  const matches = (await c.get("/api/matches")).data;
  assert.equal(matches.filter((m) => m.status === "programme").length, 3);
  assert.equal(matches.filter((m) => m.status === "termine").length, 5);
  const videos = (await c.get("/api/videos")).data;
  assert.equal(videos.length, 2);
  assert.equal(videos.filter((v) => v.featured).length, 1);
  assert.equal((await c.get("/api/partners")).data.length, 5);
  assert.equal((await c.get("/api/albums")).data.length, 3);
  const settings = (await c.get("/api/settings")).data;
  assert.equal(settings.heroImage, "/demo/hero.jpg");
});

test("le retrait supprime la démonstration mais pas les contenus ajoutés", async () => {
  const env = await seeded();
  await env.DB.prepare("INSERT INTO news (id, data, created_at, updated_at) VALUES ('mon-article', '{}', 'x', 'x')").run();
  for (const line of removeSql().split("\n")) if (line.startsWith("DELETE")) await env.DB.prepare(line).run();
  const left = await env.DB.prepare("SELECT id FROM news").all();
  assert.deepEqual(left.results.map((r) => r.id), ["mon-article"]);
  assert.equal((await env.DB.prepare("SELECT id FROM players").all()).results.length, 0);
});
