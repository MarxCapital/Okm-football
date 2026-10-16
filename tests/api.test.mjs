// Lancer : npm test   (Node 22+, sans dépendance)
import test from "node:test";
import assert from "node:assert/strict";
import { createEnv, client, adminClient, userClient, PASSWORD } from "./helpers.mjs";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/* ---------- Installation et connexion ---------- */
test("installation : un seul administrateur, jeton obligatoire, mot de passe solide", async () => {
  const env = createEnv();
  const c = client(env);
  assert.equal((await c.get("/api/auth/me")).data.needsSetup, true);
  assert.equal((await c.post("/api/setup", { token: "mauvais", name: "A", email: "a@okm.test", password: PASSWORD })).status, 403);
  assert.equal((await c.post("/api/setup", { token: env.SETUP_TOKEN, name: "A", email: "a@okm.test", password: "court" })).status, 422);
  assert.equal((await c.post("/api/setup", { token: env.SETUP_TOKEN, name: "A", email: "a@okm.test", password: PASSWORD })).status, 201);
  assert.equal((await c.post("/api/setup", { token: env.SETUP_TOKEN, name: "B", email: "b@okm.test", password: PASSWORD })).status, 403, "second setup refusé");
  assert.equal((await c.get("/api/auth/me")).data.needsSetup, false);
});

test("connexion : cookie HttpOnly, mauvais mot de passe, verrouillage après 5 échecs", async () => {
  const env = createEnv();
  await adminClient(env);
  const c = client(env, { ip: "9.9.9.9" });
  for (let i = 0; i < 5; i++) assert.equal((await c.post("/api/auth/login", { email: "admin@okm.test", password: "faux-faux-faux" })).status, 401);
  const locked = await c.post("/api/auth/login", { email: "admin@okm.test", password: PASSWORD });
  assert.equal(locked.status, 429, "même le bon mot de passe est refusé pendant le verrouillage");
  const ok = client(env, { ip: "8.8.8.8" });
  const res = await ok.post("/api/auth/login", { email: "admin@okm.test", password: PASSWORD });
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal((await ok.get("/api/auth/me")).data.user.role, "admin");
  await ok.post("/api/auth/logout", {});
  assert.equal((await ok.get("/api/auth/me")).data.user, null);
});

test("sécurité : l'administration exige une session, l'en-tête anti-CSRF et la même origine", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  assert.equal((await client(env).get("/api/admin/news")).status, 401);
  assert.equal((await admin.post("/api/admin/categories", { name: "U13" }, { csrf: false })).status, 403);
  const res = await admin.call("POST", "/api/admin/categories", { body: { name: "U13" }, headers: { origin: "https://evil.example" } });
  assert.equal(res.status, 403);
  assert.equal((await admin.get("/api/admin/news")).status, 200);
});

/* ---------- Rôles ---------- */
test("rôles : chaque responsable n'accède qu'à ses modules", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  const com = await userClient(env, admin, "communication");
  const sport = await userClient(env, admin, "sport");

  assert.equal((await com.get("/api/admin/news")).status, 200);
  assert.equal((await com.get("/api/admin/players")).status, 403);
  assert.equal((await com.get("/api/admin/registration_requests")).status, 403);
  assert.equal((await com.get("/api/admin/users")).status, 403);
  assert.equal((await com.get("/api/admin/audit")).status, 403);

  assert.equal((await sport.get("/api/admin/players")).status, 200);
  assert.equal((await sport.get("/api/admin/news")).status, 403);
  assert.equal((await sport.get("/api/admin/contact_messages")).status, 403);
  assert.equal((await sport.get("/api/admin/users")).status, 403);

  // Listes déroulantes : catégories lisibles par tous, joueurs réservés au sport.
  assert.equal((await com.get("/api/admin/refs/categories")).status, 200);
  assert.equal((await com.get("/api/admin/refs/players")).status, 403);
  assert.equal((await sport.get("/api/admin/refs/players")).status, 200);

  // Le tableau de bord ne contient que ce que le rôle peut voir.
  const comStats = (await com.get("/api/admin/stats")).data;
  assert.ok("newsPublished" in comStats.counts && !("players" in comStats.counts) && !("registrationsNew" in comStats.counts));
  const sportStats = (await sport.get("/api/admin/stats")).data;
  assert.ok("players" in sportStats.counts && !("newsPublished" in sportStats.counts));
});

test("comptes : au moins un admin actif, pas d'auto-désactivation, session coupée à la désactivation", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  const me = (await admin.get("/api/auth/me")).data.user;
  const self = await admin.put(`/api/admin/users/${me.id}`, { name: "Admin", email: "admin@okm.test", role: "sport", active: true });
  assert.equal(self.status, 422);
  const sport = await userClient(env, admin, "sport");
  const id = (await admin.get("/api/admin/users")).data.items.find((u) => u.role === "sport").id;
  assert.equal((await admin.put(`/api/admin/users/${id}`, { name: "Resp sport", email: "sport@okm.test", role: "sport", active: false })).status, 200);
  assert.equal((await sport.get("/api/admin/players")).status, 401, "session invalidée");
  assert.equal((await client(env).post("/api/auth/login", { email: "sport@okm.test", password: PASSWORD })).status, 401, "compte désactivé");
  assert.equal((await admin.del(`/api/admin/users/${id}`)).status, 405, "pas de suppression de compte");
  const weak = await admin.post("/api/admin/users", { name: "X", email: "x@okm.test", role: "sport", active: true, password: "123" });
  assert.equal(weak.status, 422);
});

test("changement de mot de passe : exige l'ancien, déconnecte les sessions", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  assert.equal((await admin.post("/api/auth/password", { current: "mauvais", next: "Nouveau-mot-de-passe-2" })).status, 422);
  assert.equal((await admin.post("/api/auth/password", { current: PASSWORD, next: "court" })).status, 422);
  assert.equal((await admin.post("/api/auth/password", { current: PASSWORD, next: "Nouveau-mot-de-passe-2" })).status, 200);
  assert.equal((await admin.get("/api/admin/news")).status, 401);
  assert.equal((await client(env).post("/api/auth/login", { email: "admin@okm.test", password: "Nouveau-mot-de-passe-2" })).status, 200);
});

/* ---------- Données et publication ---------- */
async function seedBasics(admin) {
  const cat = (await admin.post("/api/admin/categories", { name: "U15", season: "2026-2027", active: true })).data.item;
  const team = (await admin.post("/api/admin/teams", { name: "OKM U15", categoryId: cat.id, season: "2026-2027", status: "actif", coach: "Coach Privé", coachPublic: false })).data.item;
  return { cat, team };
}

test("catégories : nom unique ; suppression refusée tant qu'elle est utilisée", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  const { cat } = await seedBasics(admin);
  assert.equal((await admin.post("/api/admin/categories", { name: "u15" })).status, 422);
  const del = await admin.del(`/api/admin/categories/${cat.id}`);
  assert.equal(del.status, 409);
  assert.match(del.data.message, /Équipes/);
  assert.equal((await admin.post("/api/admin/teams", { name: "X", categoryId: "inexistante", season: "2026", status: "actif" })).status, 422, "référence invalide refusée");
});

test("actualités : brouillon invisible, publication, programmation, adresse unique", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  const base = { title: "Grande victoire", category: "Match", content: "Premier paragraphe.\n\nSecond paragraphe.", status: "brouillon" };
  const draft = (await admin.post("/api/admin/news", base)).data.item;
  assert.equal(draft.slug, "grande-victoire");
  assert.equal((await client(env).get("/api/news")).data.length, 0, "un brouillon n'est jamais public");

  await admin.put(`/api/admin/news/${draft.id}`, { ...base, status: "publie" });
  const pub = (await client(env).get("/api/news")).data;
  assert.equal(pub.length, 1);
  assert.deepEqual(pub[0].content, ["Premier paragraphe.", "Second paragraphe."]);
  assert.ok(pub[0].publishedAt, "date posée à la publication");
  assert.equal(pub[0].author, "Admin Test");

  const dup = (await admin.post("/api/admin/news", { ...base, status: "publie" })).data.item;
  assert.equal(dup.slug, "grande-victoire-2");

  const future = new Date(Date.now() + 7 * 86400_000).toISOString();
  await admin.post("/api/admin/news", { ...base, title: "Demain", status: "publie", publishedAt: future });
  assert.equal((await client(env).get("/api/news")).data.length, 2, "publication programmée : pas encore visible");

  await admin.put(`/api/admin/news/${draft.id}`, { ...base, status: "archive" });
  assert.equal((await client(env).get("/api/news")).data.length, 1, "archivée : retirée du public");

  const bad = await admin.post("/api/admin/news", { ...base, title: "", image: "javascript:alert(1)" });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.errors.title && bad.data.errors.image);
});

test("joueurs : aucune donnée privée n'est exposée et l'autorisation conditionne la publication", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  const { cat } = await seedBasics(admin);
  const player = (
    await admin.post("/api/admin/players", {
      firstName: "Jean", lastName: "Kimbembe", birthYear: 2012, categoryId: cat.id, position: "Attaquant", foot: "Droit",
      photo: "https://exemple.org/p.jpg", sportStatus: "actif", publishProfile: true, statGoals: 3,
      guardianName: "Parent Secret", guardianPhone: "+242060000000", internalNotes: "Note médicale secrète",
    })
  ).data.item;
  assert.equal(player.internalId, "OKM-0001");

  const pub = client(env);
  assert.equal((await pub.get("/api/players")).data.length, 0, "sans autorisation : invisible");

  const consent = (await admin.post("/api/admin/consent_records", { playerId: player.id, type: "profil", grantedBy: "Parent Secret", grantedAt: "2026-09-01", revoked: false })).data.item;
  let list = (await pub.get("/api/players")).data;
  assert.equal(list.length, 1);
  assert.equal(list[0].publicName, "Jean K.", "pas de nom de famille complet par défaut");
  assert.equal(list[0].photo, "", "photo masquée sans autorisation photo");
  assert.deepEqual(list[0].stats, { goals: 3 });

  const raw = JSON.stringify((await pub.get("/api/players")).data);
  for (const secret of ["Parent Secret", "060000000", "médicale", "Kimbembe", "2012", "OKM-0001", "firstName"]) assert.ok(!raw.includes(secret), `fuite : ${secret}`);

  await admin.post("/api/admin/consent_records", { playerId: player.id, type: "photo", grantedBy: "Parent Secret", grantedAt: "2026-09-01" });
  list = (await pub.get("/api/players")).data;
  assert.equal(list[0].photo, "https://exemple.org/p.jpg");

  await admin.put(`/api/admin/consent_records/${consent.id}`, { ...consent, revoked: true });
  assert.equal((await pub.get("/api/players")).data.length, 0, "révoquer retire le profil immédiatement");

  const del = await admin.del(`/api/admin/players/${player.id}`);
  assert.equal(del.status, 200);
  assert.equal((await admin.get("/api/admin/consent_records")).data.items.length, 0, "autorisations supprimées avec le joueur");
});

test("matchs : score obligatoire si terminé ; non validé = invisible ; bilan propre", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  const { cat } = await seedBasics(admin);
  const m = { categoryId: cat.id, opponent: "AS Rivale", datetime: "2026-10-17T15:30:00+01:00", status: "termine", home: true };
  const noScore = await admin.post("/api/admin/matches", m);
  assert.equal(noScore.status, 422);
  assert.ok(noScore.data.errors.ourScore);

  const created = (await admin.post("/api/admin/matches", { ...m, ourScore: 3, theirScore: 1, validated: false, scorers: ["A", " ", "B"] })).data.item;
  assert.deepEqual(created.scorers, ["A", "B"]);
  assert.equal((await client(env).get("/api/matches")).data.length, 0, "résultat non validé : invisible");

  await admin.put(`/api/admin/matches/${created.id}`, { ...created, validated: true });
  const pub = (await client(env).get("/api/matches")).data;
  assert.equal(pub.length, 1);
  assert.equal(pub[0].ourScore, 3);
  assert.equal(pub[0].category, "U15");

  const bad = await admin.post("/api/admin/matches", { ...m, status: "programme", validated: true });
  assert.equal(bad.status, 422, "seul un match terminé peut être validé");

  const sched = (await admin.post("/api/admin/matches", { ...m, status: "programme", ourScore: 9, theirScore: 9 })).data.item;
  const shown = (await client(env).get("/api/matches")).data.find((x) => x.id === sched.id);
  assert.ok(!("ourScore" in shown), "pas de score publié pour un match à venir");
});

test("équipes, partenaires, albums, trophées : règles de publication", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  const { cat } = await seedBasics(admin);
  const pub = client(env);
  let teams = (await pub.get("/api/teams")).data;
  assert.equal(teams[0].coach, "", "entraîneur non publié par défaut");
  assert.equal(teams[0].category, "U15");

  await admin.post("/api/admin/partners", { name: "Marque A", approved: false, period: "2025", showPeriod: true });
  await admin.post("/api/admin/partners", { name: "Marque B", approved: true, period: "2025", showPeriod: false, website: "https://b.example" });
  const partners = (await pub.get("/api/partners")).data;
  assert.equal(partners.length, 1);
  assert.equal(partners[0].period, "", "période non publiée sans accord");

  await admin.post("/api/admin/albums", { title: "Privé", date: "2026-09-01", published: false });
  await admin.post("/api/admin/albums", { title: "Public", date: "2026-09-02", published: true, categoryId: cat.id, images: [{ src: "https://x.example/a.jpg", alt: "photo" }], videos: [{ title: "v", url: "https://y.example/v" }] });
  const albums = (await pub.get("/api/albums")).data;
  assert.equal(albums.length, 1);
  assert.equal(albums[0].category, "U15");
  assert.equal((await admin.post("/api/admin/albums", { title: "X", date: "2026-09-02", images: [{ src: "http://non-securise.example/a.jpg" }] })).status, 422);

  await admin.post("/api/admin/trophies", { name: "Coupe", year: 2026, categoryId: cat.id });
  assert.equal((await pub.get("/api/trophies")).data[0].category, "U15");
});

test("catégories publiques : seulement les actives, responsable technique si autorisé", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  await admin.post("/api/admin/categories", { name: "U13", active: true, technicalLead: "Chef Technique", technicalLeadPublic: false });
  await admin.post("/api/admin/categories", { name: "U11", active: false });
  const list = (await client(env).get("/api/categories")).data;
  assert.equal(list.length, 1);
  assert.equal(list[0].technicalLead, "");
});

test("réglages du site : contenu public paragraphe par paragraphe", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  const com = await userClient(env, admin, "communication");
  assert.equal((await com.put("/api/admin/settings", { heroLead: "Bienvenue", academieMission: "P1\n\nP2", email: "contact@okm.test", facebookUrl: "https://facebook.com/okm" })).status, 200);
  const s = (await client(env).get("/api/settings")).data;
  assert.equal(s.heroLead, "Bienvenue");
  assert.deepEqual(s.academieMission, ["P1", "P2"]);
  assert.equal((await com.put("/api/admin/settings", { facebookUrl: "javascript:alert(1)" })).status, 422);
});

/* ---------- Formulaires publics ---------- */
test("inscription : validation, statut « nouvelle », jamais d'admission automatique, traitement par le sport", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  const sport = await userClient(env, admin, "sport");
  const { cat } = await seedBasics(admin);
  const visitor = client(env, { ip: "7.7.7.7" });
  const form = { firstName: "Paul", lastName: "Mbemba", birthYear: new Date().getFullYear() - 12, category: "U15", position: "Milieu", guardianName: "Marie Mbemba", guardianPhone: "+242 06 000 00 00", email: "marie@exemple.org", message: "Bonjour", consent: true };

  const bad = await visitor.post("/api/registrations", { ...form, consent: false, birthYear: 1900, guardianPhone: "abc" }, { csrf: false });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.errors.consent && bad.data.errors.birthYear && bad.data.errors.guardianPhone);

  assert.equal((await visitor.post("/api/registrations", form, { csrf: false })).status, 201);
  assert.equal((await visitor.post("/api/registrations", { ...form, website: "http://spam" }, { csrf: false })).status, 201, "piège à robots : accepté en apparence");

  const list = (await sport.get("/api/admin/registration_requests")).data.items;
  assert.equal(list.length, 1, "le champ piège n'enregistre rien");
  assert.equal(list[0].status, "nouvelle");
  assert.equal((await client(env).get("/api/players")).data.length, 0, "aucune admission automatique");

  // Le responsable change le statut ; les champs reçus restent intacts.
  const r = list[0];
  const upd = await sport.put(`/api/admin/registration_requests/${r.id}`, { ...r, firstName: "PIRATE", status: "acceptee", adminNote: "Test OK" });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.item.firstName, "Paul", "champs reçus non modifiables");
  assert.equal(upd.data.item.status, "acceptee");

  // On ne crée pas de demande à la main.
  assert.equal((await sport.post("/api/admin/registration_requests", form)).status, 405);
  void cat;
});

test("formulaires publics : limitation de débit (5 par heure et par visiteur)", async () => {
  const env = createEnv();
  const visitor = client(env, { ip: "6.6.6.6" });
  const msg = { name: "Visiteur", subject: "Question", message: "Bonjour" };
  for (let i = 0; i < 5; i++) assert.equal((await visitor.post("/api/contact", msg, { csrf: false })).status, 201);
  assert.equal((await visitor.post("/api/contact", msg, { csrf: false })).status, 429);
  const other = client(env, { ip: "6.6.6.7" });
  assert.equal((await other.post("/api/contact", { ...msg, email: "pas-un-email" }, { csrf: false })).status, 422);
});

test("messages : lisibles par la communication, pas par le sport", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  const com = await userClient(env, admin, "communication");
  const sport = await userClient(env, admin, "sport");
  await client(env).post("/api/contact", { name: "V", subject: "Sujet", message: "Texte" }, { csrf: false });
  const items = (await com.get("/api/admin/contact_messages")).data.items;
  assert.equal(items[0].status, "non_lu");
  assert.equal((await sport.get("/api/admin/contact_messages")).status, 403);
  await com.put(`/api/admin/contact_messages/${items[0].id}`, { ...items[0], status: "lu" });
  assert.equal((await com.get("/api/admin/stats")).data.counts.messagesUnread, 0);
});

/* ---------- Médias et journal ---------- */
test("images : vérifie le vrai format, la taille, et sert le fichier", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  const send = (bytes, name = "a.png") => {
    const f = new FormData();
    f.set("file", new File([bytes], name));
    return admin.call("POST", "/api/admin/media", { form: f });
  };
  const ok = await send(PNG);
  assert.equal(ok.status, 201);
  assert.match(ok.data.url, /^\/api\/media\/\d{4}\/[0-9a-f-]{36}\.png$/);
  const got = await client(env).call("GET", ok.data.url, { raw: true });
  assert.equal(got.status, 200);
  assert.equal(got.headers.get("content-type"), "image/png");
  assert.equal((await send(new TextEncoder().encode("<script>alert(1)</script>"), "x.png")).status, 415, "faux PNG refusé");
  const big = new Uint8Array(3.5 * 1024 * 1024); big.set(PNG);
  assert.equal((await send(big)).status, 413);
  assert.equal((await client(env).get("/api/media/2026/../../etc/passwd")).status, 404);
  const noR2 = createEnv({ MEDIA: undefined });
  const a2 = await adminClient(noR2);
  const f = new FormData(); f.set("file", new File([PNG], "a.png"));
  assert.equal((await a2.call("POST", "/api/admin/media", { form: f })).status, 501);
});

test("journal : actions tracées, sans données personnelles", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  const { cat } = await seedBasics(admin);
  await admin.post("/api/admin/players", { firstName: "Secret", lastName: "Personne", birthYear: 2012, categoryId: cat.id, sportStatus: "actif" });
  const log = (await admin.get("/api/admin/audit")).data.items;
  assert.ok(log.some((l) => l.action === "création" && l.entity === "players"));
  assert.ok(!JSON.stringify(log).includes("Secret"), "pas de nom de joueur dans le journal");
  assert.ok(log.every((l) => l.userEmail === "admin@okm.test" || l.userEmail === null));
});

test("API : réponses JSON propres sur les erreurs", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  assert.equal((await admin.get("/api/nimporte-quoi")).status, 404);
  assert.equal((await admin.get("/api/admin/news/inexistant")).status, 404);
  const res = await admin.call("POST", "/api/admin/news", { headers: { "content-type": "text/plain" }, body: undefined });
  assert.equal(res.status, 415);
  const noDb = await (await import("../server/router.js")).handle(new Request("http://localhost/api/news"), {});
  assert.equal(noDb.status, 503);
});

test("vidéos : envoi MP4, lecture par morceaux, publication", async () => {
  const env = createEnv();
  const admin = await adminClient(env);
  const mp4 = new Uint8Array(2048);
  mp4.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 0);
  mp4.fill(7, 12);
  const form = new FormData();
  form.set("file", new File([mp4], "v.mp4", { type: "video/mp4" }));
  const up = await admin.call("POST", "/api/admin/media", { form });
  assert.equal(up.status, 201);
  assert.match(up.data.url, /\.mp4$/);
  const full = await admin.get(up.data.url, { raw: true });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), "video/mp4");
  const part = await admin.get(up.data.url, { raw: true, headers: { range: "bytes=100-199" } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), "bytes 100-199/2048");
  assert.equal((await part.arrayBuffer()).byteLength, 100);
  const bad = new FormData();
  bad.set("file", new File([new Uint8Array(500)], "x.mp4", { type: "video/mp4" }));
  assert.equal((await admin.call("POST", "/api/admin/media", { form: bad })).status, 415);

  const hidden = await admin.post("/api/admin/videos", { title: "Brouillon", date: "2026-10-01", url: up.data.url, published: false });
  assert.equal(hidden.status, 201);
  const shown = await admin.post("/api/admin/videos", { title: "Publiée", date: "2026-10-02", url: up.data.url, published: true, featured: true });
  assert.equal(shown.status, 201);
  const pub = (await client(env).get("/api/videos")).data;
  assert.deepEqual(pub.map((v) => v.title), ["Publiée"]);
  const sportUser = await userClient(env, admin, "sport");
  assert.equal((await sportUser.post("/api/admin/videos", { title: "x", date: "2026-10-02", url: up.data.url })).status, 403);
});
