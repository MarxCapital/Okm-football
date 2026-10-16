import { COLLECTIONS, ROLES, OPEN_REFS, canAccess } from "../public/okm/js/schema.js";
import { HttpError, json, nowIso, readJson, uuid, sha256Hex, timingSafeEqual } from "./util.js";
import { requireDb, listDocs, getDoc, insertDoc, updateDoc, deleteDoc, audit } from "./db.js";
import { supabaseEnabled, supabaseAdminEnabled, signIn, signOut, updateOwnPassword, adminCreateUser, adminSetPassword } from "./supabase.js";
import { assertSameOrigin, createSession, currentUser, destroySession, login, passwordOnly, rateLimit, verifyTurnstile, hashPassword, verifyPassword, checkPasswordPolicy } from "./auth.js";
import { validateDoc, validateRegistration, validateContact } from "./validate.js";
import { beforeSave, beforeDelete } from "./hooks.js";
import { PUBLIC_COLLECTIONS, publicCollection, publicSettings } from "./public.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

export async function handle(request, env) {
  try {
    return await route(request, env);
  } catch (e) {
    if (e instanceof HttpError) return json({ message: e.message, ...(e.extra || {}) }, e.status);
    console.error("Erreur API", e);
    return json({ message: "Une erreur est survenue sur le serveur." }, 500);
  }
}

async function route(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  let parts;
  try {
    parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new HttpError(400, "Adresse invalide.");
  }
  if (method === "OPTIONS") return new Response(null, { status: 204 });
  if (!parts.length) return json({ ok: true, service: "okm-api" });
  requireDb(env);
  const [a, b, c] = parts;

  /* ----- Lecture publique ----- */
  if (method === "GET" && parts.length === 1 && PUBLIC_COLLECTIONS.includes(a)) {
    return json(await publicCollection(env, a), 200, { "cache-control": "public, max-age=60" });
  }
  if (method === "GET" && a === "settings" && parts.length === 1) {
    return json(await publicSettings(env), 200, { "cache-control": "public, max-age=60" });
  }
  if (method === "GET" && a === "media" && parts.length >= 2) return serveMedia(env, parts.slice(1).join("/"), request);

  /* ----- Formulaires publics ----- */
  if (method === "POST" && a === "registrations" && parts.length === 1) return submitRegistration(request, env);
  if (method === "POST" && a === "contact" && parts.length === 1) return submitContact(request, env);

  /* ----- Authentification ----- */
  if (a === "auth") return authRoutes(request, env, b);
  if (a === "setup" && method === "POST") return setup(request, env);

  /* ----- Administration ----- */
  if (a === "admin") {
    const user = await currentUser(env, request);
    if (!user) throw new HttpError(401, "Connexion requise.");
    if (method !== "GET") assertSameOrigin(request);
    return adminRoutes(request, env, user, parts.slice(1));
  }

  throw new HttpError(404, "Ressource introuvable.");
}

/* ====================================================================== */
/*  Formulaires publics                                                    */
/* ====================================================================== */
async function submitRegistration(request, env) {
  const input = await readJson(request, 20_000);
  if (input.website) return json({ ok: true }, 201); // champ piège rempli : on fait semblant d'accepter
  await rateLimit(env, request, "registration", 5, 3600);
  await verifyTurnstile(env, request, input.turnstileToken);
  const data = validateRegistration(input);
  await insertDoc(env, "registration_requests", { ...data, status: "nouvelle", adminNote: "", playerId: "", submittedAt: nowIso() }, null);
  return json({ ok: true }, 201);
}

async function submitContact(request, env) {
  const input = await readJson(request, 20_000);
  if (input.website) return json({ ok: true }, 201);
  await rateLimit(env, request, "contact", 5, 3600);
  await verifyTurnstile(env, request, input.turnstileToken);
  const data = validateContact(input);
  await insertDoc(env, "contact_messages", { ...data, status: "non_lu", submittedAt: nowIso() }, null);
  return json({ ok: true }, 201);
}

/* ====================================================================== */
/*  Authentification                                                       */
/* ====================================================================== */
async function usersCount(env) {
  return (await requireDb(env).prepare("SELECT COUNT(*) AS n FROM users").first()).n;
}

async function authRoutes(request, env, action) {
  const method = request.method;

  if (action === "me" && method === "GET") {
    const user = await currentUser(env, request);
    const needsSetup = !supabaseEnabled(env) && !user && Boolean(env.SETUP_TOKEN) && (await usersCount(env)) === 0;
    return json({ user: user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null, needsSetup, passwordOnly: passwordOnly(env) });
  }

  if (method !== "POST") throw new HttpError(405, "Méthode non autorisée.");
  assertSameOrigin(request);

  if (action === "login") {
    const input = await readJson(request, 5_000);
    const email = String(input.email ?? "").trim().toLowerCase();
    const password = String(input.password ?? "");
    if (passwordOnly(env)) { if (!password) throw new HttpError(422, "Saisissez le mot de passe."); }
    else if (!email || !password) throw new HttpError(422, "Saisissez votre adresse e-mail et votre mot de passe.");
    const user = await login(env, request, email, password);
    const cookie = await createSession(env, request, user);
    await audit(env, user, "connexion", "users", user.id, "");
    return json({ user }, 200, { "set-cookie": cookie });
  }

  if (action === "logout") {
    const user = await currentUser(env, request);
    const cookie = await destroySession(env, request);
    if (user) await audit(env, user, "déconnexion", "users", user.id, "");
    return json({ ok: true }, 200, { "set-cookie": cookie });
  }

  if (action === "password") {
    const user = await currentUser(env, request);
    if (!user) throw new HttpError(401, "Connexion requise.");
    const input = await readJson(request, 5_000);
    if (passwordOnly(env)) throw new HttpError(400, "Le mot de passe se change dans Cloudflare : Settings → Variables and Secrets → ADMIN_PASSWORD.");
    if (supabaseEnabled(env)) {
      const problem = checkPasswordPolicy(String(input.next ?? ""), user.email);
      if (problem) throw new HttpError(422, problem, { errors: { next: problem } });
      const sb = await signIn(env, user.email, String(input.current ?? ""));
      if (!sb) throw new HttpError(422, "Le mot de passe actuel est incorrect.", { errors: { current: "Mot de passe incorrect." } });
      await updateOwnPassword(env, sb.accessToken, String(input.next));
      await signOut(env, sb.accessToken);
    } else {
      const row = await requireDb(env).prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first();
      if (!(await verifyPassword(String(input.current ?? ""), row.password_hash))) throw new HttpError(422, "Le mot de passe actuel est incorrect.", { errors: { current: "Mot de passe incorrect." } });
      const problem = checkPasswordPolicy(String(input.next ?? ""), user.email);
      if (problem) throw new HttpError(422, problem, { errors: { next: problem } });
      await requireDb(env).prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(input.next, env), user.id).run();
    }
    await requireDb(env).prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run(); // déconnecte tous les appareils
    const cookie = await destroySession(env, request);
    await audit(env, user, "changement de mot de passe", "users", user.id, "");
    return json({ ok: true }, 200, { "set-cookie": cookie });
  }

  throw new HttpError(404, "Ressource introuvable.");
}

/** Création du tout premier administrateur : possible une seule fois, avec le jeton secret SETUP_TOKEN. */
async function setup(request, env) {
  assertSameOrigin(request);
  if (!env.SETUP_TOKEN || supabaseEnabled(env)) throw new HttpError(404, "Ressource introuvable.");
  if ((await usersCount(env)) > 0) throw new HttpError(403, "L'installation est déjà terminée.");
  const input = await readJson(request, 5_000);
  if (!timingSafeEqual(String(input.token ?? ""), env.SETUP_TOKEN)) throw new HttpError(403, "Jeton d'installation incorrect.");
  const email = String(input.email ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim();
  if (!EMAIL_RE.test(email)) throw new HttpError(422, "Adresse e-mail invalide.", { errors: { email: "Adresse e-mail invalide." } });
  if (!name) throw new HttpError(422, "Saisissez votre nom.", { errors: { name: "Obligatoire." } });
  const problem = checkPasswordPolicy(String(input.password ?? ""), email);
  if (problem) throw new HttpError(422, problem, { errors: { password: problem } });
  const id = uuid();
  await requireDb(env).prepare("INSERT INTO users (id, email, name, role, password_hash, active, created_at) VALUES (?, ?, ?, 'admin', ?, 1, ?)").bind(id, email, name, await hashPassword(input.password, env), nowIso()).run();
  await audit(env, { id, email }, "installation", "users", id, "premier administrateur");
  return json({ ok: true }, 201);
}

/* ====================================================================== */
/*  Administration                                                         */
/* ====================================================================== */
async function adminRoutes(request, env, user, parts) {
  const method = request.method;
  const [key, id] = parts;

  if (key === "stats" && method === "GET") return json(await stats(env, user));
  if (key === "media" && method === "POST") return uploadMedia(request, env, user);
  if (key === "refs" && method === "GET" && id) return refs(env, user, id);

  if (key === "audit" && method === "GET") {
    if (user.role !== "admin") throw new HttpError(403, "Accès refusé.");
    const { results } = await requireDb(env).prepare("SELECT id, at, user_email AS userEmail, action, entity, entity_id AS entityId, summary FROM audit_log ORDER BY id DESC LIMIT 300").all();
    return json({ items: results });
  }

  if (key === "users") {
    if (user.role !== "admin") throw new HttpError(403, "Accès refusé.");
    return usersRoutes(request, env, user, id);
  }

  const def = COLLECTIONS[key];
  if (!def || def.custom) throw new HttpError(404, "Ressource introuvable.");
  if (!canAccess(user.role, key)) throw new HttpError(403, "Vous n'avez pas accès à cette section.");

  /* Réglages : un seul document, identifiant fixe */
  if (def.single) {
    if (method === "GET") return json({ item: (await getDoc(env, key, "site")) || { id: "site" } });
    if (method === "PUT") {
      const existing = await getDoc(env, key, "site");
      const data = await validateDoc(env, def, await readJson(request), { existing });
      if (existing) await updateDoc(env, key, "site", data, user.id);
      else await insertDoc(env, key, data, user.id, "site");
      await audit(env, user, "modification", key, "site", def.label);
      return json({ item: { id: "site", ...data } });
    }
    throw new HttpError(405, "Méthode non autorisée.");
  }

  if (!id) {
    if (method === "GET") return json({ items: await listDocs(env, key) });
    if (method === "POST") {
      if (def.noCreate) throw new HttpError(405, "Ces éléments sont créés par les visiteurs du site.");
      const data = await validateDoc(env, def, await readJson(request));
      await beforeSave(env, key, data, { user, existing: null });
      const item = await insertDoc(env, key, data, user.id);
      await audit(env, user, "création", key, item.id, def.personal ? "" : def.titleOf(data));
      return json({ item }, 201);
    }
    throw new HttpError(405, "Méthode non autorisée.");
  }

  const existing = await getDoc(env, key, id);
  if (!existing) throw new HttpError(404, "Élément introuvable.");

  if (method === "GET") return json({ item: existing });

  if (method === "PUT") {
    const data = await validateDoc(env, def, await readJson(request), { existing });
    await beforeSave(env, key, data, { user, existing });
    await updateDoc(env, key, id, data, user.id);
    await audit(env, user, "modification", key, id, def.personal ? "" : def.titleOf(data));
    return json({ item: { id, ...data, createdAt: existing.createdAt, updatedAt: nowIso() } });
  }

  if (method === "DELETE") {
    await beforeDelete(env, key, id);
    await deleteDoc(env, key, id);
    await audit(env, user, "suppression", key, id, def.personal ? "" : def.titleOf(existing));
    return json({ ok: true });
  }

  throw new HttpError(405, "Méthode non autorisée.");
}

/* ----- Listes déroulantes (identifiant + libellé) ----- */
async function refs(env, user, key) {
  const def = COLLECTIONS[key];
  if (!def || def.custom) throw new HttpError(404, "Ressource introuvable.");
  if (!OPEN_REFS.includes(key) && !canAccess(user.role, key)) throw new HttpError(403, "Accès refusé.");
  const items = (await listDocs(env, key)).map((d) => ({ id: d.id, label: def.titleOf(d) }));
  return json({ items });
}

/* ----- Tableau de bord, limité à ce que le rôle peut voir ----- */
async function stats(env, user) {
  const can = (k) => canAccess(user.role, k);
  const out = { counts: {}, lists: {} };
  const cats = new Map((await listDocs(env, "categories")).map((c) => [c.id, c.name]));
  const byDate = (key, dir) => (x, y) => dir * (Date.parse(x[key]) - Date.parse(y[key]));

  if (can("news")) out.counts.newsPublished = (await listDocs(env, "news")).filter((n) => n.status === "publie").length;
  if (can("teams")) out.counts.teamsActive = (await listDocs(env, "teams")).filter((t) => t.status === "actif").length;
  if (can("players")) out.counts.players = (await listDocs(env, "players")).length;
  if (can("matches")) {
    const ms = await listDocs(env, "matches");
    const now = Date.now();
    const shape = (m) => ({ id: m.id, category: cats.get(m.categoryId) || "", opponent: m.opponent, datetime: m.datetime, status: m.status, ourScore: m.ourScore, theirScore: m.theirScore, validated: m.validated });
    out.lists.upcoming = ms.filter((m) => m.status === "programme" && Date.parse(m.datetime) >= now - 86400_000).sort(byDate("datetime", 1)).slice(0, 5).map(shape);
    out.lists.toValidate = ms.filter((m) => m.status === "termine" && !m.validated).sort(byDate("datetime", -1)).slice(0, 5).map(shape);
    out.lists.results = ms.filter((m) => m.status === "termine" && m.validated).sort(byDate("datetime", -1)).slice(0, 5).map(shape);
    out.counts.matchesToValidate = ms.filter((m) => m.status === "termine" && !m.validated).length;
  }
  if (can("registration_requests")) {
    const rs = await listDocs(env, "registration_requests");
    out.counts.registrationsNew = rs.filter((r) => r.status === "nouvelle").length;
    out.lists.registrations = rs.filter((r) => r.status === "nouvelle" || r.status === "en_cours").sort(byDate("submittedAt", -1)).slice(0, 5).map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`, category: r.category, submittedAt: r.submittedAt, status: r.status }));
  }
  if (can("contact_messages")) {
    const ms = await listDocs(env, "contact_messages");
    out.counts.messagesUnread = ms.filter((m) => m.status === "non_lu").length;
    out.lists.messages = ms.sort(byDate("submittedAt", -1)).slice(0, 5).map((m) => ({ id: m.id, name: m.name, subject: m.subject, submittedAt: m.submittedAt, status: m.status }));
  }
  return out;
}

/* ====================================================================== */
/*  Comptes utilisateurs (administrateur général uniquement)               */
/* ====================================================================== */
const publicUser = (r) => ({ id: r.id, email: r.email, name: r.name, role: r.role, active: r.active === 1, createdAt: r.created_at, lastLoginAt: r.last_login_at || "" });

async function activeAdmins(env, exceptId) {
  return (await requireDb(env).prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?").bind(exceptId).first()).n;
}

async function usersRoutes(request, env, actor, id) {
  const db = requireDb(env);
  const method = request.method;

  if (!id && method === "GET") {
    const { results } = await db.prepare("SELECT id, email, name, role, active, created_at, last_login_at FROM users ORDER BY name").all();
    return json({ items: results.map(publicUser) });
  }

  if (id && method === "GET") {
    const row = await db.prepare("SELECT id, email, name, role, active, created_at, last_login_at FROM users WHERE id = ?").bind(id).first();
    if (!row) throw new HttpError(404, "Compte introuvable.");
    return json({ item: publicUser(row) });
  }

  if (method !== "POST" && method !== "PUT") throw new HttpError(405, "Méthode non autorisée. Un compte se désactive, il ne se supprime pas.");
  const input = await readJson(request, 10_000);
  const errors = {};
  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const role = String(input.role ?? "");
  const active = input.active === true || input.active === "true";
  const password = String(input.password ?? "");
  if (!name || name.length > 80) errors.name = "Nom obligatoire (80 caractères maximum).";
  if (!EMAIL_RE.test(email)) errors.email = "Adresse e-mail invalide.";
  if (!ROLES[role]) errors.role = "Rôle invalide.";

  if (method === "POST" && !id) {
    const external = supabaseEnabled(env); // mots de passe gérés par Supabase
    const problem = external && !supabaseAdminEnabled(env) ? "" : checkPasswordPolicy(password, email);
    if (problem) errors.password = problem;
    if (!errors.email && (await db.prepare("SELECT 1 AS x FROM users WHERE email = ?").bind(email).first())) errors.email = "Un compte existe déjà avec cette adresse.";
    if (Object.keys(errors).length) throw new HttpError(422, "Certains champs sont à corriger.", { errors });
    const newId = uuid();
    let supabaseId = null;
    if (supabaseAdminEnabled(env)) supabaseId = await adminCreateUser(env, email, password);
    await db.prepare("INSERT INTO users (id, email, name, role, password_hash, active, created_at, supabase_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(newId, email, name, role, external ? "supabase" : await hashPassword(password, env), active ? 1 : 0, nowIso(), supabaseId).run();
    await audit(env, actor, "création de compte", "users", newId, `${ROLES[role]}`);
    return json({ item: { id: newId, email, name, role, active } }, 201);
  }

  if (method === "PUT" && id) {
    const row = await db.prepare("SELECT id, supabase_id FROM users WHERE id = ?").bind(id).first();
    if (!row) throw new HttpError(404, "Compte introuvable.");
    if (password && supabaseEnabled(env) && !(supabaseAdminEnabled(env) && row.supabase_id)) errors.password = "Avec Supabase, le mot de passe se change dans Supabase (Authentication → Users) ou par la personne elle-même, dans « Mon compte ».";
    if (!errors.email && (await db.prepare("SELECT 1 AS x FROM users WHERE email = ? AND id != ?").bind(email, id).first())) errors.email = "Un compte existe déjà avec cette adresse.";
    if (password && !errors.password) {
      const problem = checkPasswordPolicy(password, email);
      if (problem) errors.password = problem;
    }
    if (id === actor.id && (!active || role !== "admin")) errors.active = "Vous ne pouvez pas retirer vos propres droits d'administrateur ni désactiver votre compte.";
    if (!errors.active && (!active || role !== "admin") && (await activeAdmins(env, id)) === 0) errors.active = "Il doit rester au moins un administrateur général actif.";
    if (Object.keys(errors).length) throw new HttpError(422, "Certains champs sont à corriger.", { errors });
    await db.prepare("UPDATE users SET name = ?, email = ?, role = ?, active = ? WHERE id = ?").bind(name, email, role, active ? 1 : 0, id).run();
    if (password && supabaseEnabled(env)) await adminSetPassword(env, row.supabase_id, password);
    else if (password) await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password, env), id).run();
    if (password || !active) await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
    await audit(env, actor, "modification de compte", "users", id, password ? "mot de passe réinitialisé" : "");
    return json({ item: { id, email, name, role, active } });
  }

  throw new HttpError(405, "Méthode non autorisée.");
}

/* ====================================================================== */
/*  Médias (Cloudflare R2)                                                 */
/* ====================================================================== */
function detectMedia(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg", video: false };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: "image/png", ext: "png", video: false };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { mime: "image/webp", ext: "webp", video: false };
  // MP4 : "ftyp" aux octets 4 à 7. WebM : en-tête EBML 1A 45 DF A3.
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return { mime: "video/mp4", ext: "mp4", video: true };
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { mime: "video/webm", ext: "webm", video: true };
  return null;
}

async function uploadMedia(request, env, user) {
  if (!env.MEDIA) throw new HttpError(501, "Le stockage de fichiers n'est pas configuré. Collez une adresse https:// en attendant.");
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "Aucun fichier reçu.");
  if (file.size > MAX_VIDEO_BYTES) throw new HttpError(413, "Le fichier dépasse la taille autorisée (images 3 Mo, vidéos 20 Mo).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectMedia(bytes);
  if (!kind) throw new HttpError(415, "Format non accepté. Utilisez une image JPEG, PNG ou WebP, ou une vidéo MP4 ou WebM.");
  if (!kind.video && file.size > MAX_IMAGE_BYTES) throw new HttpError(413, "L'image dépasse 3 Mo. Choisissez une image plus légère.");
  const key = `${new Date().getUTCFullYear()}/${uuid()}.${kind.ext}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: kind.mime } });
  await requireDb(env).prepare("INSERT INTO media (id, key, mime, size, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(uuid(), key, kind.mime, bytes.length, user.id, nowIso()).run();
  await audit(env, user, kind.video ? "envoi de vidéo" : "envoi d'image", "media", key, "");
  return json({ url: `/api/media/${key}` }, 201);
}

async function serveMedia(env, key, request) {
  if (!env.MEDIA || !/^\d{4}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$/.test(key)) throw new HttpError(404, "Fichier introuvable.");
  // Les navigateurs (Safari surtout) lisent une vidéo par morceaux : on honore l'en-tête Range.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request?.headers.get("range") || "");
  let obj;
  let partial = null;
  if (range && (range[1] || range[2])) {
    const head = await env.MEDIA.head?.(key);
    const size = head?.size;
    if (size) {
      let start = range[1] === "" ? Math.max(0, size - Number(range[2])) : Number(range[1]);
      let end = range[1] === "" || range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
      if (start <= end && start < size) {
        obj = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
        partial = { start, end, size };
      }
    }
  }
  if (!obj) obj = await env.MEDIA.get(key);
  if (!obj) throw new HttpError(404, "Fichier introuvable.");
  const headers = {
    "content-type": obj.httpMetadata?.contentType || "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'",
  };
  if (partial) headers["content-range"] = `bytes ${partial.start}-${partial.end}/${partial.size}`;
  return new Response(obj.body, { status: partial ? 206 : 200, headers });
}

void sha256Hex;
