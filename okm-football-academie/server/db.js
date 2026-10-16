// Accès D1. Les noms de tables viennent UNIQUEMENT de schema.js (jamais d'une saisie utilisateur).
import { COLLECTIONS } from "../public/okm/js/schema.js";
import { HttpError, nowIso, uuid } from "./util.js";

export function requireDb(env) {
  if (!env.DB) throw new HttpError(503, "La base de données n'est pas configurée sur ce serveur.");
  return env.DB;
}

const tableOf = (key) => {
  const def = COLLECTIONS[key];
  if (!def || def.custom) throw new Error(`Collection inconnue : ${key}`);
  return def.table;
};

function toDoc(row) {
  return { id: row.id, ...JSON.parse(row.data), createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function listDocs(env, key) {
  const { results } = await requireDb(env).prepare(`SELECT id, data, created_at, updated_at FROM ${tableOf(key)} ORDER BY created_at DESC LIMIT 5000`).all();
  return results.map(toDoc);
}

export async function getDoc(env, key, id) {
  const row = await requireDb(env).prepare(`SELECT id, data, created_at, updated_at FROM ${tableOf(key)} WHERE id = ?`).bind(String(id)).first();
  return row ? toDoc(row) : null;
}

export async function insertDoc(env, key, data, userId, id = uuid()) {
  const at = nowIso();
  await requireDb(env)
    .prepare(`INSERT INTO ${tableOf(key)} (id, data, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, JSON.stringify(data), at, at, userId ?? null, userId ?? null)
    .run();
  return { id, ...data, createdAt: at, updatedAt: at };
}

export async function updateDoc(env, key, id, data, userId) {
  const at = nowIso();
  await requireDb(env).prepare(`UPDATE ${tableOf(key)} SET data = ?, updated_at = ?, updated_by = ? WHERE id = ?`).bind(JSON.stringify(data), at, userId ?? null, String(id)).run();
}

export async function deleteDoc(env, key, id) {
  await requireDb(env).prepare(`DELETE FROM ${tableOf(key)} WHERE id = ?`).bind(String(id)).run();
}

export async function docExists(env, key, id) {
  if (!id || typeof id !== "string") return false;
  return Boolean(await requireDb(env).prepare(`SELECT 1 AS ok FROM ${tableOf(key)} WHERE id = ?`).bind(id).first());
}

/** Premier document d'une autre collection qui référence cet identifiant, ou null. */
export async function findReference(env, targetKey, id, ignore = []) {
  for (const [key, def] of Object.entries(COLLECTIONS)) {
    if (def.custom || ignore.includes(key)) continue;
    for (const f of def.fields) {
      if (f.type === "ref" && f.ref === targetKey) {
        const row = await requireDb(env).prepare(`SELECT id FROM ${def.table} WHERE json_extract(data, '$.${f.key}') = ? LIMIT 1`).bind(String(id)).first();
        if (row) return { collection: key, label: def.label };
      }
    }
  }
  return null;
}

export async function audit(env, user, action, entity, entityId, summary) {
  try {
    await requireDb(env)
      .prepare("INSERT INTO audit_log (at, user_id, user_email, action, entity, entity_id, summary) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(nowIso(), user?.id ?? null, user?.email ?? null, action, entity ?? null, entityId ?? null, summary ?? null)
      .run();
  } catch (e) {
    console.error("audit", e);
  }
}
