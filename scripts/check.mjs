// Contrôles statiques : JSON valides, pas de style en ligne (CSP), liens internes existants.
// Lancer avec : npm run check
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = new URL("../public/", import.meta.url).pathname;
const errors = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const files = walk(root);

for (const f of files.filter((p) => extname(p) === ".json")) {
  try { JSON.parse(readFileSync(f, "utf8")); } catch (e) { errors.push(`JSON invalide : ${f} (${e.message})`); }
}

const resolves = (href) => {
  const clean = href.split("#")[0].split("?")[0];
  if (clean === "" || clean === "/") return true;
  const rel = clean.replace(/^\//, "");
  return [rel, `${rel}.html`, join(rel, "index.html")].some((c) => existsSync(join(root, c)) && statSync(join(root, c)).isFile());
};

for (const f of files.filter((p) => extname(p) === ".html")) {
  const html = readFileSync(f, "utf8");
  if (/\sstyle\s*=/.test(html)) errors.push(`Style en ligne interdit par la CSP : ${f}`);
  if (/<style[\s>]/.test(html)) errors.push(`Balise <style> interdite par la CSP : ${f}`);
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    if (!resolves(m[1])) errors.push(`Lien cassé dans ${f} : ${m[1]}`);
  }
}

// Pas de style en ligne produit par le JavaScript non plus (la CSP le bloquerait).
for (const f of files.filter((p) => extname(p) === ".js")) {
  const js = readFileSync(f, "utf8");
  if (/\bstyle\s*:\s*["'`]/.test(js) || /setAttribute\(\s*["']style["']/.test(js) || /\.cssText\b/.test(js)) errors.push(`Style en ligne dans le JavaScript : ${f}`);
}

// Liens produits par le JS (navigation, pied de page).
const layout = readFileSync(join(root, "assets/js/layout.js"), "utf8");
for (const m of layout.matchAll(/"(\/[a-z0-9\-/]*(?:#[a-z]+)?)"/g)) {
  if (!resolves(m[1])) errors.push(`Lien cassé dans layout.js : ${m[1]}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`OK : ${files.length} fichiers contrôlés.`);
