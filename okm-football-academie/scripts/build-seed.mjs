// Fabrique le SQL de démonstration (seed/demo.sql) ou son retrait (seed/demo-remove.sql).
//   node scripts/build-seed.mjs            -> seed/demo.sql
//   node scripts/build-seed.mjs remove     -> seed/demo-remove.sql
import { writeFileSync } from "node:fs";
import { demoData, DEMO_TABLES } from "../seed/demo-data.mjs";

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

export function seedSql(now = new Date()) {
  const iso = now.toISOString();
  const lines = ["-- Données de démonstration (générées par scripts/build-seed.mjs). Réexécutable : les lignes déjà présentes ne sont pas touchées."];
  for (const [key, rows] of Object.entries(demoData(now))) {
    for (const { id, ...rest } of rows) {
      lines.push(`INSERT OR IGNORE INTO ${DEMO_TABLES[key]} (id, data, created_at, updated_at, created_by, updated_by) VALUES (${q(id)}, ${q(JSON.stringify({ ...rest }))}, ${q(iso)}, ${q(iso)}, NULL, NULL);`);
    }
  }
  return lines.join("\n") + "\n";
}

export function removeSql() {
  const lines = ["-- Retire les données de démonstration (identifiants commençant par demo-). Vos propres contenus ne sont pas touchés."];
  for (const table of Object.values(DEMO_TABLES)) {
    if (table === "site_settings") continue; // les réglages du site sont conservés : modifiez-les depuis l'administration
    lines.push(`DELETE FROM ${table} WHERE id LIKE 'demo-%';`);
  }
  return lines.join("\n") + "\n";
}

if (process.argv[1] && process.argv[1].endsWith("build-seed.mjs")) {
  const remove = process.argv[2] === "remove";
  const out = new URL(remove ? "../seed/demo-remove.sql" : "../seed/demo.sql", import.meta.url);
  writeFileSync(out, remove ? removeSql() : seedSql());
  console.log(`Écrit : ${out.pathname}`);
}
