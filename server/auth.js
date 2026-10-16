// Authentification : mots de passe PBKDF2, sessions en base, verrouillage anti-force-brute, protection CSRF.
import { requireDb } from "./db.js";
import { HttpError, getCookie, nowIso, randomToken, sha256Hex, timingSafeEqual, clientIp, uuid } from "./util.js";
import { supabaseEnabled, signIn, signOut } from "./supabase.js";

// Cloudflare Workers plafonne PBKDF2 à 100 000 itérations.
const ITERATIONS = 100_000;
const SESSION_HOURS = 12;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

/**
 * Variable d'environnement facultative PBKDF2_ITERATIONS (entre 10 000 et 100 000) : à baisser seulement si Cloudflare
 * signale un dépassement du temps de calcul à la connexion sur l'offre gratuite. Le nombre utilisé est stocké dans chaque
 * hachage : changer la valeur n'invalide aucun mot de passe existant.
 */
export async function hashPassword(password, env = {}) {
  const wanted = Number(env?.PBKDF2_ITERATIONS);
  const iterations = Number.isInteger(wanted) && wanted >= 10_000 && wanted <= ITERATIONS ? wanted : ITERATIONS;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(await derive(password, salt, iterations))}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored).split("$");
  if (scheme !== "pbkdf2") return false;
  const test = b64(await derive(password, unb64(salt), Number(iter)));
  return timingSafeEqual(test, hash);
}

/** Hachage factice, utilisé quand l'e-mail n'existe pas : le temps de réponse ne révèle pas si un compte existe. */
let dummyHash;
async function burn(password) {
  dummyHash ||= await hashPassword("dummy-password-for-timing");
  await verifyPassword(password, dummyHash);
}

export function checkPasswordPolicy(password, email = "") {
  if (typeof password !== "string" || password.length < 12) return "Le mot de passe doit contenir au moins 12 caractères.";
  if (password.length > 200) return "Le mot de passe est trop long.";
  if (email && password.toLowerCase() === email.toLowerCase()) return "Le mot de passe ne peut pas être l'adresse e-mail.";
  if (/^(.)\1+$/.test(password)) return "Le mot de passe est trop simple.";
  return "";
}

/* ---------- Cookie de session ---------- */
const isHttps = (request) => new URL(request.url).protocol === "https:";
const cookieName = (request) => (isHttps(request) ? "__Host-okm" : "okm");

export function sessionCookie(request, token, maxAgeSeconds) {
  const parts = [`${cookieName(request)}=${token}`, "HttpOnly", "SameSite=Strict", "Path=/", `Max-Age=${maxAgeSeconds}`];
  if (isHttps(request)) parts.push("Secure");
  return parts.join("; ");
}

/* ---------- Sessions ---------- */
export async function createSession(env, request, user) {
  const db = requireDb(env);
  const token = randomToken(32);
  const id = await sha256Hex(token);
  const created = nowIso();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
  await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(created).run();
  await db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(id, user.id, created, expires).run();
  await db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(created, user.id).run();
  return sessionCookie(request, token, SESSION_HOURS * 3600);
}

export async function destroySession(env, request) {
  const token = getCookie(request, cookieName(request));
  if (token) await requireDb(env).prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(token)).run();
  return sessionCookie(request, "", 0);
}

export async function currentUser(env, request) {
  const token = getCookie(request, cookieName(request));
  if (!token) return null;
  const row = await requireDb(env)
    .prepare("SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND u.active = 1")
    .bind(await sha256Hex(token), nowIso())
    .first();
  return row || null;
}

/* ---------- Protection CSRF (en plus de SameSite=Strict) ---------- */
export function assertSameOrigin(request) {
  if (request.headers.get("x-requested-with") !== "okm-admin") throw new HttpError(403, "Requête refusée.");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, "Requête refusée.");
}

/* ---------- Connexion ---------- */
/** Mode « mot de passe seul » : actif dès que la variable secrète ADMIN_PASSWORD existe dans Cloudflare. */
export const passwordOnly = (env) => String(env?.ADMIN_PASSWORD ?? "") !== "";
const adminEmail = (env) => String(env?.ADMIN_EMAIL || "").trim().toLowerCase() || "admin@okm.local";

export async function login(env, request, email, password) {
  const db = requireDb(env);
  if (passwordOnly(env)) email = adminEmail(env);
  const key = `${String(email).toLowerCase()}|${(await sha256Hex(clientIp(request))).slice(0, 16)}`;
  const now = Date.now();

  const attempt = await db.prepare("SELECT count, first_at FROM login_attempts WHERE key = ?").bind(key).first();
  if (attempt && now - Date.parse(attempt.first_at) < LOCK_MINUTES * 60_000 && attempt.count >= MAX_ATTEMPTS) {
    throw new HttpError(429, `Trop de tentatives. Réessayez dans ${LOCK_MINUTES} minutes.`);
  }

  let user = null;
  let ok = false;
  if (passwordOnly(env)) {
    // Un seul mot de passe (variable secrète ADMIN_PASSWORD) donne accès à l'administration, sans e-mail ni Supabase.
    if (timingSafeEqual(password, env.ADMIN_PASSWORD)) {
      user = await db.prepare("SELECT id, email, name, role, active FROM users WHERE email = ?").bind(email).first();
      if (!user) {
        const id = uuid();
        const name = String(env.ADMIN_NAME || "").trim() || "Administrateur";
        await db.prepare("INSERT INTO users (id, email, name, role, password_hash, active, created_at) VALUES (?, ?, ?, 'admin', 'mot-de-passe-unique', 1, ?)").bind(id, email, name, nowIso()).run();
        user = { id, email, name, role: "admin", active: 1 };
      }
      if (user.active !== 1) throw new HttpError(403, "Ce compte est désactivé.");
      ok = true;
    }
  } else if (supabaseEnabled(env)) {
    // Supabase vérifie le mot de passe ; la table users dit si ce compte a le droit d'entrer, et avec quel rôle.
    const sb = await signIn(env, String(email).toLowerCase(), password);
    if (sb) {
      user = await db.prepare("SELECT id, email, name, role, active, supabase_id FROM users WHERE email = ?").bind(String(email).toLowerCase()).first();
      const bootstrap = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
      if (!user && bootstrap && bootstrap === String(email).toLowerCase()) {
        const id = uuid();
        const name = String(env.ADMIN_NAME || "").trim() || String(email).split("@")[0];
        await db.prepare("INSERT INTO users (id, email, name, role, password_hash, active, created_at, supabase_id) VALUES (?, ?, ?, 'admin', 'supabase', 1, ?, ?)").bind(id, String(email).toLowerCase(), name, nowIso(), sb.id).run();
        user = { id, email: String(email).toLowerCase(), name, role: "admin", active: 1, supabase_id: sb.id };
      }
      if (!user || user.active !== 1) {
        await signOut(env, sb.accessToken);
        throw new HttpError(403, "Ce compte n'est pas autorisé à accéder à l'espace d'administration.");
      }
      if (user.supabase_id !== sb.id) await db.prepare("UPDATE users SET supabase_id = ? WHERE id = ?").bind(sb.id, user.id).run();
      await signOut(env, sb.accessToken);
      ok = true;
    }
  } else {
    user = await db.prepare("SELECT id, email, name, role, password_hash, active FROM users WHERE email = ?").bind(String(email).toLowerCase()).first();
    if (user && user.active === 1) ok = await verifyPassword(password, user.password_hash);
    else await burn(password);
  }

  if (!ok) {
    const fresh = !attempt || now - Date.parse(attempt.first_at) >= LOCK_MINUTES * 60_000;
    await db
      .prepare("INSERT INTO login_attempts (key, count, first_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN ? THEN 1 ELSE count + 1 END, first_at = CASE WHEN ? THEN excluded.first_at ELSE first_at END")
      .bind(key, nowIso(), fresh ? 1 : 0, fresh ? 1 : 0)
      .run();
    throw new HttpError(401, passwordOnly(env) ? "Mot de passe incorrect." : "Adresse e-mail ou mot de passe incorrect.");
  }

  await db.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/* ---------- Limitation de débit (formulaires publics) ---------- */
export async function rateLimit(env, request, action, max, windowSeconds) {
  const db = requireDb(env);
  const key = `${action}|${(await sha256Hex(clientIp(request))).slice(0, 16)}`;
  const row = await db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").bind(key).first();
  const now = Date.now();
  if (!row || now - Date.parse(row.window_start) >= windowSeconds * 1000) {
    await db.prepare("INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start").bind(key, nowIso()).run();
    return;
  }
  if (row.count >= max) throw new HttpError(429, "Trop d'envois en peu de temps. Réessayez plus tard.");
  await db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
}

/* ---------- Cloudflare Turnstile ---------- */
export async function verifyTurnstile(env, request, token) {
  if (!env.TURNSTILE_SECRET) return;
  if (!token) throw new HttpError(400, "La vérification anti-robots est obligatoire.");
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token), remoteip: clientIp(request) });
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const out = await res.json().catch(() => ({}));
  if (!out.success) throw new HttpError(400, "La vérification anti-robots a échoué. Réessayez.");
}
