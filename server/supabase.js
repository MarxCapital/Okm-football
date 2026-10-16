// Authentification Supabase (Supabase Auth, via l'API REST). Le navigateur ne parle JAMAIS à Supabase :
// ce sont les fonctions Cloudflare qui vérifient le mot de passe, puis ouvrent leur propre session (cookie HttpOnly).
// La clé « publishable » est publique par conception ; la clé « secret » (SUPABASE_SERVICE_KEY, facultative) reste un secret Cloudflare.
import { HttpError } from "./util.js";

export const supabaseEnabled = (env) => Boolean(env?.SUPABASE_URL && env?.SUPABASE_PUBLISHABLE_KEY);
export const supabaseAdminEnabled = (env) => supabaseEnabled(env) && Boolean(env.SUPABASE_SERVICE_KEY);

const UNAVAILABLE = "Le service d'authentification est momentanément indisponible. Réessayez dans un instant.";

async function call(env, path, { method = "POST", body, token, service = false } = {}) {
  const headers = { apikey: service ? env.SUPABASE_SERVICE_KEY : env.SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${String(env.SUPABASE_URL).replace(/\/+$/, "")}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    let data = null;
    try { data = await res.json(); } catch { /* corps vide */ }
    return { status: res.status, data };
  } catch {
    throw new HttpError(502, UNAVAILABLE);
  }
}

/** Vérifie e-mail + mot de passe. Renvoie { id, email, accessToken } ou null si les identifiants sont refusés. */
export async function signIn(env, email, password) {
  const { status, data } = await call(env, "/auth/v1/token?grant_type=password", { body: { email, password } });
  if (status === 200 && data?.user?.id && data?.access_token) return { id: data.user.id, email: String(data.user.email || email).toLowerCase(), accessToken: data.access_token };
  if (status === 400 || status === 401 || status === 422) return null;
  if (status === 429) throw new HttpError(429, "Trop de tentatives. Réessayez dans quelques minutes.");
  throw new HttpError(502, UNAVAILABLE);
}

/** Ferme la session Supabase ouverte pour la vérification (le site utilise sa propre session). Sans erreur si cela échoue. */
export async function signOut(env, accessToken) {
  try { await call(env, "/auth/v1/logout?scope=local", { token: accessToken }); } catch { /* sans importance */ }
}

/** Change le mot de passe de l'utilisateur lui-même, avec son jeton. */
export async function updateOwnPassword(env, accessToken, password) {
  const { status, data } = await call(env, "/auth/v1/user", { method: "PUT", token: accessToken, body: { password } });
  if (status === 200) return;
  if (status === 422 || status === 400) throw new HttpError(422, data?.msg || data?.message || "Ce mot de passe est refusé.", { errors: { next: data?.msg || data?.message || "Mot de passe refusé." } });
  throw new HttpError(502, UNAVAILABLE);
}

/** Création d'un compte par l'administrateur (nécessite SUPABASE_SERVICE_KEY). */
export async function adminCreateUser(env, email, password) {
  const { status, data } = await call(env, "/auth/v1/admin/users", { service: true, body: { email, password, email_confirm: true } });
  if (status === 200 || status === 201) return data.id;
  if (status === 422 || status === 400) throw new HttpError(422, "Supabase refuse ce compte (adresse déjà utilisée ou mot de passe refusé).", { errors: { email: "Adresse déjà utilisée ou refusée par Supabase." } });
  throw new HttpError(502, UNAVAILABLE);
}

export async function adminSetPassword(env, supabaseId, password) {
  const { status } = await call(env, `/auth/v1/admin/users/${encodeURIComponent(supabaseId)}`, { method: "PUT", service: true, body: { password } });
  if (status === 200) return;
  if (status === 422 || status === 400) throw new HttpError(422, "Supabase refuse ce mot de passe.", { errors: { password: "Mot de passe refusé par Supabase." } });
  throw new HttpError(502, UNAVAILABLE);
}
