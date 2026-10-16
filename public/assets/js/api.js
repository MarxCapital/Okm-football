import { CONFIG } from "./config.js";

export const isLive = () => Boolean(CONFIG.apiBase);

/**
 * Lit une collection (news, matches, teams, players, trophies, partners, albums).
 * Sans backend : /data/{name}.json. Avec backend : {apiBase}/{name}.
 * La réponse peut être un tableau ou un objet { items: [...] }.
 */
export async function getCollection(name) {
  const url = isLive() ? `${CONFIG.apiBase}/${name}` : `/data/${name}.json`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.items ?? [];
}

/**
 * Envoie un formulaire au backend.
 * Sans backend : renvoie { demo: true } et n'enregistre rien.
 */
export async function submitForm(endpoint, payload) {
  if (!isLive()) return { ok: true, demo: true };
  const res = await fetch(`${CONFIG.apiBase}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* réponse sans JSON */
    }
    const err = new Error(body.message || `HTTP ${res.status}`);
    err.errors = body.errors || {};
    err.status = res.status;
    throw err;
  }
  return { ok: true, demo: false };
}

/** Réglages publics du site (phrase d'accueil, textes de la page L'académie, coordonnées). */
export async function getSettings() {
  const url = isLive() ? `${CONFIG.apiBase}/settings` : "/data/settings.json";
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}
