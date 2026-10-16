// Espace d'administration : démarrage, menu, routage par adresse (#/section/id).
import { api, clearRefs } from "./api.js";
import { h, toast } from "./dom.js";
import { COLLECTIONS, MENU, MENU_LABELS, ROLES, canAccess } from "./schema.js";
import { renderList, renderForm } from "./crud.js";
import { loginView, dashboardView, accountView, auditView } from "./views.js";

const app = document.getElementById("app");
let user = null;
let main = null;
let nav = null;
let burger = null;
let badges = {};
let renderNav = () => {};

const navigate = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

/* ---------- Connexion / déconnexion ---------- */
async function boot(notice) {
  let me;
  try { me = await api("/auth/me"); }
  catch (e) { app.replaceChildren(h("main", { class: "auth" }, h("div", { class: "auth-card panel" }, h("h1", { class: "disp h2" }, "Service indisponible"), h("p", { class: "alert alert--err", role: "alert" }, e.message)))); return; }
  if (me.user) { user = me.user; shell(); route(); }
  else { user = null; loginView(app, { needsSetup: me.needsSetup, passwordOnly: me.passwordOnly, notice, onSuccess: (u) => { user = u; clearRefs(); location.hash = "#/"; shell(); route(); } }); }
}

async function logout(notice) {
  try { await api("/auth/logout", { method: "POST", body: {} }); } catch { /* déjà déconnecté */ }
  user = null; clearRefs();
  location.hash = "";
  boot(notice);
}

window.addEventListener("okm:unauth", () => { if (user) { user = null; boot("Votre session a expiré. Reconnectez-vous."); } });

/* ---------- Structure de la page ---------- */
function menuLink(key, label, href) {
  return h("li", {}, h("a", { href, "data-nav": key }, label, badges[key] ? h("span", { class: "badge", "aria-label": `${badges[key]} à traiter` }, String(badges[key])) : null));
}

function buildNav() {
  const groups = MENU.map((entry) => {
    if (entry.key === "dashboard") return h("ul", {}, menuLink("dashboard", entry.label, entry.href));
    const items = entry.items.filter((k) => canAccess(user.role, k));
    if (!items.length) return null;
    return h("div", { class: "nav-group" }, h("p", { class: "nav-title" }, entry.group), h("ul", {}, items.map((k) => menuLink(k, MENU_LABELS[k] || COLLECTIONS[k].label, `#/${k}`))));
  });
  return groups;
}

function shell() {
  main = h("main", { class: "adm-main", id: "contenu", tabindex: "-1" });
  nav = h("nav", { class: "adm-nav", id: "adm-nav", "aria-label": "Menu d'administration" });
  burger = h("button", { type: "button", class: "burger adm-burger", "aria-expanded": "false", "aria-controls": "adm-nav", "aria-label": "Ouvrir le menu", onclick: () => setMenu(!nav.classList.contains("is-open")) }, "Menu");
  renderNav = () => nav.replaceChildren(...buildNav(), h("div", { class: "nav-foot" },
    h("p", { class: "xsmall" }, user.name), h("p", { class: "xsmall muted-d" }, ROLES[user.role]),
    h("a", { href: "#/account", "data-nav": "account", class: "nav-small" }, "Mon compte"),
    h("a", { href: "/", class: "nav-small", target: "_blank", rel: "noopener" }, "Voir le site (nouvel onglet)"),
    h("button", { type: "button", class: "nav-small nav-btn", onclick: () => logout() }, "Se déconnecter")));
  renderNav();
  app.replaceChildren(
    h("a", { class: "skip-link", href: "#contenu" }, "Aller au contenu"),
    h("div", { class: "adm-shell" },
      h("header", { class: "adm-top" }, h("p", { class: "disp adm-top-title" }, "Administration"), burger),
      h("aside", { class: "adm-side" }, h("div", { class: "adm-brand" }, h("p", { class: "disp h3" }, "OKM Football Académie"), h("p", { class: "eyebrow eyebrow--gold" }, "Administration")), nav),
      main),
  );
}

function setMenu(open) {
  nav.classList.toggle("is-open", open);
  burger.setAttribute("aria-expanded", String(open));
  burger.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
}

/* ---------- Routage ---------- */
async function route() {
  if (!user || !main) return;
  setMenu(false);
  const [section = "", id] = location.hash.replace(/^#\/?/, "").split("/");
  const key = section || "dashboard";

  nav.querySelectorAll("a[data-nav]").forEach((a) => (a.dataset.nav === key ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  document.title = `${key === "dashboard" ? "Tableau de bord" : key === "account" ? "Mon compte" : MENU_LABELS[key] || COLLECTIONS[key]?.label || "Administration"} | OKM Administration`;

  if (key === "dashboard") { const counts = await dashboardView(main, user); if (counts) updateBadges(counts); }
  else if (key === "account") accountView(main, user, () => { toast("Mot de passe modifié. Reconnectez-vous."); logout("Mot de passe modifié. Reconnectez-vous avec le nouveau."); });
  else if (key === "audit") { if (user.role !== "admin") denied(); else await auditView(main); }
  else if (COLLECTIONS[key]) {
    if (!canAccess(user.role, key)) denied();
    else if (COLLECTIONS[key].single) await renderForm(main, key, "site", navigate);
    else if (id) await renderForm(main, key, id, navigate);
    else await renderList(main, key);
  } else main.replaceChildren(h("h1", { class: "disp h2" }, "Page introuvable"), h("a", { class: "btn btn--dark", href: "#/" }, "Retour au tableau de bord"));

  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function denied() {
  main.replaceChildren(h("h1", { class: "disp h2" }, "Accès refusé"), h("p", { class: "lead" }, "Votre rôle n'a pas accès à cette section."), h("a", { class: "btn btn--dark", href: "#/" }, "Retour au tableau de bord"));
}

function updateBadges(counts) {
  badges = { registration_requests: counts.registrationsNew || 0, contact_messages: counts.messagesUnread || 0 };
  renderNav();
  const current = location.hash.replace(/^#\/?/, "").split("/")[0] || "dashboard";
  nav.querySelectorAll("a[data-nav]").forEach((a) => { if (a.dataset.nav === current) a.setAttribute("aria-current", "page"); });
}

window.addEventListener("hashchange", route);
boot();
