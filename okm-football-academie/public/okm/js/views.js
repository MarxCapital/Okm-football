// Écrans propres : connexion, installation, tableau de bord, compte, journal.
import { api, ApiError } from "./api.js";
import { h, toast, fmtDateTime, fmtShort } from "./dom.js";
import { COLLECTIONS, ROLES, canAccess } from "./schema.js";
import { chip } from "./crud.js";

/* ---------- Petit formulaire réutilisable ---------- */
function field(id, label, attrs = {}, hint) {
  const input = h("input", { class: "input", id, ...attrs, "aria-describedby": `err-${id}` });
  const err = h("p", { class: "field-error", id: `err-${id}`, role: "alert" });
  return { el: h("div", { class: "field" }, h("label", { for: id }, label), input, hint ? h("p", { class: "hint" }, hint) : null, err), input, err };
}

function authCard(title, intro, body) {
  return h("main", { class: "auth" }, h("div", { class: "auth-card panel stack" }, h("p", { class: "eyebrow" }, "OKM Football Académie"), h("h1", { class: "disp h2" }, title), intro ? h("p", { class: "muted" }, intro) : null, body));
}

/* ====================================================================== */
export function loginView(root, { needsSetup, notice, onSuccess }) {
  let mode = needsSetup ? "setup" : "login";
  const draw = () => root.replaceChildren(mode === "setup" ? setupCard() : loginCard());

  function loginCard() {
    const email = field("login-email", "Adresse e-mail", { type: "email", autocomplete: "username", required: true });
    const pass = field("login-password", "Mot de passe", { type: "password", autocomplete: "current-password", required: true });
    const alert = h("div", { class: "alert alert--err", role: "alert", hidden: true });
    const btn = h("button", { class: "btn btn--dark", type: "submit" }, "Se connecter");
    const form = h("form", { class: "stack", novalidate: true }, notice ? h("div", { class: "alert alert--info", role: "status" }, notice) : null, alert, email.el, pass.el, btn,
      needsSetup ? h("button", { type: "button", class: "more more--btn", onclick: () => { mode = "setup"; draw(); } }, "Première installation ?") : null);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      alert.hidden = true;
      if (!email.input.value || !pass.input.value) { alert.textContent = "Saisissez votre adresse e-mail et votre mot de passe."; alert.hidden = false; return; }
      btn.disabled = true; btn.textContent = "Connexion…";
      try {
        const res = await api("/auth/login", { method: "POST", body: { email: email.input.value, password: pass.input.value } });
        onSuccess(res.user);
      } catch (err) {
        alert.textContent = err.message; alert.hidden = false;
        pass.input.value = ""; pass.input.focus();
        btn.disabled = false; btn.textContent = "Se connecter";
      }
    });
    return authCard("Administration", "Connectez-vous pour gérer le site.", form);
  }

  function setupCard() {
    const token = field("setup-token", "Jeton d'installation", { type: "password", autocomplete: "off", required: true }, "Le jeton SETUP_TOKEN défini dans Cloudflare.");
    const name = field("setup-name", "Votre nom", { type: "text", autocomplete: "name", required: true });
    const email = field("setup-email", "Adresse e-mail", { type: "email", autocomplete: "username", required: true });
    const pass = field("setup-password", "Mot de passe", { type: "password", autocomplete: "new-password", required: true }, "12 caractères minimum.");
    const alert = h("div", { class: "alert alert--err", role: "alert", hidden: true });
    const btn = h("button", { class: "btn btn--dark", type: "submit" }, "Créer le compte administrateur");
    const map = { token, name, email, password: pass };
    const form = h("form", { class: "stack", novalidate: true }, alert, token.el, name.el, email.el, pass.el, btn,
      h("button", { type: "button", class: "more more--btn", onclick: () => { mode = "login"; draw(); } }, "J'ai déjà un compte"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      alert.hidden = true;
      Object.values(map).forEach((f) => { f.err.textContent = ""; });
      btn.disabled = true;
      try {
        await api("/setup", { method: "POST", body: { token: token.input.value, name: name.input.value, email: email.input.value, password: pass.input.value } });
        const res = await api("/auth/login", { method: "POST", body: { email: email.input.value, password: pass.input.value } });
        onSuccess(res.user);
      } catch (err) {
        btn.disabled = false;
        if (err instanceof ApiError && err.errors) for (const [k, m] of Object.entries(err.errors)) if (map[k]) map[k].err.textContent = m;
        alert.textContent = err.message; alert.hidden = false;
      }
    });
    return authCard("Première installation", "Créez le compte de l'administrateur général. Cette étape n'est possible qu'une seule fois.", form);
  }

  draw();
}

/* ====================================================================== */
const row = (title, sub, tail, href) =>
  h("div", { class: "list-row" }, h("div", { class: "grow" }, href ? h("a", { class: "strong", href }, title) : h("p", { class: "strong" }, title), sub ? h("p", { class: "xsmall muted" }, sub) : null), tail || null);

export async function dashboardView(root, user) {
  root.replaceChildren(h("p", { class: "state" }, "Chargement…"));
  let stats;
  try { stats = await api("/admin/stats"); } catch (e) { root.replaceChildren(h("p", { class: "alert alert--err", role: "alert" }, e.message)); return; }
  const { counts, lists } = stats;

  const tiles = [
    ["newsPublished", "Actualités publiées", "#/news"],
    ["teamsActive", "Équipes actives", "#/teams"],
    ["players", "Fiches joueurs", "#/players"],
    ["registrationsNew", "Nouvelles inscriptions", "#/registration_requests", true],
    ["messagesUnread", "Messages non lus", "#/contact_messages", true],
    ["matchesToValidate", "Résultats à valider", "#/matches", true],
  ].filter(([k]) => k in counts);

  const quick = [["news", "Nouvelle actualité"], ["matches", "Saisir un match"], ["albums", "Nouvel album"], ["players", "Nouveau joueur"]].filter(([k]) => canAccess(user.role, k));

  const panel = (title, items, empty, render, href) =>
    h("section", { class: "panel" }, h("div", { class: "row row--between" }, h("h2", { class: "disp h3" }, title), href ? h("a", { class: "more", href }, "Tout voir") : null), items?.length ? items.map(render) : h("p", { class: "state" }, empty));

  root.replaceChildren(
    h("div", { class: "view-head" }, h("div", { class: "stack stack--sm" }, h("p", { class: "eyebrow" }, ROLES[user.role]), h("h1", { class: "disp h2" }, `Bonjour ${user.name}`))),
    quick.length ? h("div", { class: "row" }, quick.map(([k, l]) => h("a", { class: "btn btn--outline", href: `#/${k}/new` }, l))) : null,
    h("div", { class: "tiles" }, tiles.map(([k, label, href, alert]) => h("a", { class: `tile${alert && counts[k] > 0 ? " tile--alert" : ""}`, href }, h("span", { class: "eyebrow" }, label), h("span", { class: "num-big" }, String(counts[k]))))),
    h("div", { class: "adm-grid" },
      lists.upcoming ? panel("Prochains matchs", lists.upcoming, "Aucun match programmé.", (m) => row(`${m.category} contre ${m.opponent}`, fmtShort(m.datetime), chip("programme", "Programmé"), `#/matches/${m.id}`), "#/matches") : null,
      lists.toValidate ? panel("Résultats à valider", lists.toValidate, "Aucun résultat en attente.", (m) => row(`${m.category} contre ${m.opponent}`, `Score ${m.ourScore} – ${m.theirScore}`, chip("encours", "À valider", "amber"), `#/matches/${m.id}`), "#/matches") : null,
      lists.registrations ? panel("Demandes d'inscription", lists.registrations, "Aucune demande à traiter.", (r) => row(r.name, `${r.category} · ${fmtDateTime(r.submittedAt)}`, chip(r.status, r.status === "nouvelle" ? "Nouvelle" : "En cours"), `#/registration_requests/${r.id}`), "#/registration_requests") : null,
      lists.messages ? panel("Derniers messages", lists.messages, "Aucun message reçu.", (m) => row(m.subject, `${m.name} · ${fmtDateTime(m.submittedAt)}`, chip(m.status, m.status === "non_lu" ? "Non lu" : m.status === "lu" ? "Lu" : "Traité"), `#/contact_messages/${m.id}`), "#/contact_messages") : null,
      lists.results ? panel("Derniers résultats publiés", lists.results, "Aucun résultat publié.", (m) => row(`${m.category} contre ${m.opponent}`, fmtShort(m.datetime), h("span", { class: "score-sm" }, `${m.ourScore} – ${m.theirScore}`), `#/matches/${m.id}`), "#/matches") : null,
    ),
  );
  return counts;
}

/* ====================================================================== */
export function accountView(root, user, onPasswordChanged) {
  const current = field("acc-current", "Mot de passe actuel", { type: "password", autocomplete: "current-password" });
  const next = field("acc-next", "Nouveau mot de passe", { type: "password", autocomplete: "new-password" }, "12 caractères minimum.");
  const alert = h("div", { class: "alert alert--err", role: "alert", hidden: true });
  const btn = h("button", { class: "btn btn--dark", type: "submit" }, "Changer le mot de passe");
  const map = { current, next };
  const form = h("form", { class: "form", novalidate: true }, alert, current.el, next.el, h("div", { class: "row" }, btn));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alert.hidden = true;
    Object.values(map).forEach((f) => { f.err.textContent = ""; });
    btn.disabled = true;
    try {
      await api("/auth/password", { method: "POST", body: { current: current.input.value, next: next.input.value } });
      onPasswordChanged();
    } catch (err) {
      btn.disabled = false;
      if (err.errors) for (const [k, m] of Object.entries(err.errors)) if (map[k]) map[k].err.textContent = m;
      alert.textContent = err.message; alert.hidden = false;
    }
  });
  root.replaceChildren(
    h("div", { class: "view-head" }, h("h1", { class: "disp h2" }, "Mon compte")),
    h("dl", { class: "contact-list panel" }, h("div", {}, h("dt", {}, "Nom"), h("dd", {}, user.name)), h("div", {}, h("dt", {}, "Adresse e-mail"), h("dd", {}, user.email)), h("div", {}, h("dt", {}, "Rôle"), h("dd", {}, ROLES[user.role]))),
    h("section", { class: "panel stack" }, h("h2", { class: "disp h3" }, "Mot de passe"), h("p", { class: "muted" }, "Après le changement, vous serez déconnecté de tous vos appareils."), form),
  );
}

/* ====================================================================== */
export async function auditView(root) {
  root.replaceChildren(h("p", { class: "state" }, "Chargement…"));
  let items;
  try { items = (await api("/admin/audit")).items; } catch (e) { root.replaceChildren(h("p", { class: "alert alert--err", role: "alert" }, e.message)); return; }
  const label = (k) => COLLECTIONS[k]?.label || (k === "users" ? "Comptes" : k === "media" ? "Images" : k || "");
  root.replaceChildren(
    h("div", { class: "view-head" }, h("h1", { class: "disp h2" }, "Journal des actions")),
    h("p", { class: "muted" }, "Les 300 dernières opérations importantes. Aucune donnée personnelle n'y est enregistrée."),
    items.length
      ? h("div", { class: "table-wrap" }, h("table", {}, h("caption", { class: "visually-hidden" }, "Journal des actions"),
          h("thead", {}, h("tr", {}, ["Date", "Personne", "Action", "Section", "Détail"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", {}, items.map((i) => h("tr", {}, h("td", {}, fmtDateTime(i.at)), h("td", {}, i.userEmail || "Visiteur"), h("td", {}, i.action), h("td", {}, label(i.entity)), h("td", {}, i.summary || "—"))))))
      : h("p", { class: "state" }, "Aucune action enregistrée."),
  );
}
