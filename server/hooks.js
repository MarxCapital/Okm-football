// Règles métier appliquées avant l'enregistrement. Elles lèvent une HttpError 422 si une règle n'est pas respectée.
import { HttpError, slugify, nowIso } from "./util.js";
import { listDocs, findReference, deleteDoc, requireDb } from "./db.js";
import { COLLECTIONS } from "../public/okm/js/schema.js";

const fieldError = (errors) => new HttpError(422, "Certains champs sont à corriger.", { errors });

export async function beforeSave(env, key, data, { user, existing }) {
  if (key === "news") {
    if (!data.author) data.author = user.name;
    if (data.status === "publie" && !data.publishedAt) data.publishedAt = nowIso();
    const base = slugify(data.slug || data.title);
    const others = (await listDocs(env, "news")).filter((n) => n.id !== existing?.id);
    const taken = new Set(others.map((n) => n.slug));
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    data.slug = slug;
  }

  if (key === "categories") {
    const dup = (await listDocs(env, "categories")).find((c) => c.id !== existing?.id && c.name.toLowerCase() === data.name.toLowerCase());
    if (dup) throw fieldError({ name: "Une catégorie porte déjà ce nom." });
  }

  if (key === "players") {
    const all = await listDocs(env, "players");
    if (!data.internalId) {
      const max = all.reduce((m, p) => Math.max(m, Number(/^OKM-(\d+)$/.exec(p.internalId || "")?.[1] || 0)), 0);
      data.internalId = `OKM-${String(max + 1).padStart(4, "0")}`;
    } else if (all.some((p) => p.id !== existing?.id && p.internalId === data.internalId)) {
      throw fieldError({ internalId: "Cet identifiant est déjà utilisé." });
    }
  }

  if (key === "matches") {
    const errors = {};
    if (data.status === "termine") {
      if (data.ourScore === null) errors.ourScore = "Saisissez le score pour un match terminé.";
      if (data.theirScore === null) errors.theirScore = "Saisissez le score pour un match terminé.";
    }
    if (data.validated && data.status !== "termine") errors.validated = "Seul un match terminé peut être validé.";
    if (Object.keys(errors).length) throw fieldError(errors);
  }

  if (key === "consent_records" && existing && existing.playerId !== data.playerId) {
    throw fieldError({ playerId: "Le joueur d'une autorisation ne peut pas être modifié : créez une nouvelle autorisation." });
  }
}

/** Refuse la suppression d'un élément encore utilisé ; nettoie les données liées quand c'est voulu. */
export async function beforeDelete(env, key, id) {
  // Les autorisations d'un joueur ne bloquent pas sa suppression : elles sont supprimées avec lui.
  const used = await findReference(env, key, id, key === "players" ? ["consent_records"] : []);
  if (used) throw new HttpError(409, `Suppression impossible : cet élément est encore utilisé dans « ${used.label} ». Modifiez ou supprimez d'abord ces éléments.`);

  if (key === "players") {
    // Suppression d'un joueur : ses autorisations sont supprimées avec lui (droit à l'effacement).
    const consents = (await listDocs(env, "consent_records")).filter((c) => c.playerId === id);
    for (const c of consents) await deleteDoc(env, "consent_records", c.id);
    // La demande d'inscription liée perd son lien.
    const db = requireDb(env);
    await db.prepare(`UPDATE registration_requests SET data = json_set(data, '$.playerId', '') WHERE json_extract(data, '$.playerId') = ?`).bind(id).run();
  }
  return COLLECTIONS[key];
}
