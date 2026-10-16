// En-tête, pied de page et barre mobile partagés par toutes les pages.
import { CONFIG } from "./config.js";
import { h, icon, safeUrl } from "./ui.js";

// [clé, adresse, libellé, visible dans la barre du haut sur ordinateur]. Le menu mobile affiche tout.
const NAV = [
  ["home", "/", "Accueil", false],
  ["academie", "/academie", "L'académie", true],
  ["equipes", "/equipes", "Nos équipes", true],
  ["joueurs", "/joueurs", "Joueurs", false],
  ["actualites", "/actualites", "Actualités", true],
  ["matchs", "/matchs", "Matchs", true],
  ["palmares", "/palmares", "Palmarès", true],
  ["galerie", "/galerie", "Galerie", true],
  ["partenaires", "/partenaires", "Partenaires", false],
  ["contact", "/contact", "Contact", true],
];

function facebookNode() {
  const url = safeUrl(CONFIG.facebookUrl);
  const text = `Facebook : ${CONFIG.facebookName}`;
  return url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, text) : null;
}

// Sur l'accueil, la barre du haut (ordinateur) ne montre que ces rubriques ; les autres restent dans le menu mobile et le pied de page.
const HOME_PRIMARY = new Set(["home", "academie", "equipes", "actualites", "galerie", "contact"]);

// Bouton soleil / lune (accueil uniquement). Le choix est mémorisé dans le navigateur.
function themeButton() {
  const root = document.documentElement;
  const btn = h("button", { type: "button", class: "theme-btn" });
  const apply = (mode, save) => {
    const light = mode === "light";
    root.setAttribute("data-theme", mode);
    if (save) { try { localStorage.setItem("okm-theme", mode); } catch { /* stockage indisponible */ } }
    btn.replaceChildren(icon(light ? "moon" : "sun"));
    btn.setAttribute("aria-label", light ? "Passer en mode sombre" : "Passer en mode clair");
    btn.setAttribute("title", light ? "Mode sombre" : "Mode clair");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#F1EADB" : "#05080D");
  };
  apply(root.getAttribute("data-theme") === "light" ? "light" : "dark", false);
  btn.addEventListener("click", () => apply(root.getAttribute("data-theme") === "light" ? "dark" : "light", true));
  return btn;
}

function buildHeader(current) {
  const isHome = current === "home";
  const burger = h("button", { type: "button", class: "burger", "aria-expanded": "false", "aria-controls": "main-nav", "aria-label": "Ouvrir le menu" }, icon("menu"));
  const nav = h(
    "div",
    { class: "nav-bar", id: "main-nav" },
    h("nav", { "aria-label": "Navigation principale" }, h("ul", {}, NAV.map(([key, href, label, primary]) => h("li", { class: (isHome ? HOME_PRIMARY.has(key) : primary) ? "" : "nav-more" }, h("a", { href, "aria-current": key === current ? "page" : null }, label))))),
  );

  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
    burger.replaceChildren(icon(open ? "close" : "menu"));
    nav.closest("header")?.classList.toggle("menu-open", open);
  };
  burger.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) { setOpen(false); burger.focus(); }
  });
  window.matchMedia("(min-width: 1024px)").addEventListener("change", (e) => { if (e.matches) setOpen(false); });

  const header = h(
    "header",
    { class: "site-header" },
    h(
      "div",
      { class: "wrap head-main" },
      h("a", { class: "brand", href: "/", "aria-label": `${CONFIG.siteName}, accueil` }, h("img", { class: "brand-logo", src: "/assets/img/logo-96.png", alt: "", width: "44", height: "44" }), h("span", { class: "brand-name" }, "OKM Football", h("br"), "Académie")),
      nav,
      h("div", { class: "head-actions" }, isHome && themeButton(), h("a", { class: "btn btn--dark head-cta", href: "/inscription" }, "Rejoindre l'académie"), burger),
    ),
  );
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  return header;
}

function buildFooter() {
  const link = (href, text) => h("li", {}, h("a", { href }, text));
  return h(
    "footer",
    { class: "site-footer" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "foot-grid" },
        h("div", { class: "stack stack--sm" }, h("div", { class: "foot-logo" }, h("img", { src: "/assets/img/logo-192.png", alt: "", width: "64", height: "64" }), h("p", { class: "disp foot-brand" }, CONFIG.siteName)), h("p", { class: "eyebrow eyebrow--gold" }, CONFIG.motto), h("p", { class: "small" }, `Formation et développement du football des jeunes. ${CONFIG.location}.`)),
        h("div", {}, h("span", { class: "eyebrow eyebrow--gold" }, "Le site"), h("ul", {}, link("/academie", "L'académie"), link("/equipes", "Équipes"), link("/actualites", "Actualités"), link("/matchs", "Matchs et résultats"), link("/palmares", "Palmarès"), link("/galerie", "Galerie"))),
        h("div", {}, h("span", { class: "eyebrow eyebrow--gold" }, "Nous joindre"), h("ul", {}, h("li", {}, CONFIG.email), facebookNode() && h("li", {}, facebookNode()), h("li", {}, CONFIG.location), link("/contact", "Formulaire de contact"), link("/inscription", "Inscription"))),
        h("div", {}, h("span", { class: "eyebrow eyebrow--gold" }, "Informations"), h("ul", {}, link("/partenaires", "Partenaires"), link("/mentions-legales", "Mentions légales"), link("/mentions-legales#donnees", "Données personnelles"))),
      ),
      h("p", { class: "foot-legal" }, `Les photographies et les données des joueurs mineurs sont publiées avec l'autorisation de leurs parents ou responsables légaux. © ${new Date().getFullYear()} ${CONFIG.siteName}`),
    ),
  );
}

export function initLayout() {
  const current = document.body.dataset.nav || document.body.dataset.page;
  const header = document.getElementById("site-header");
  const footer = document.getElementById("site-footer");
  if (header) header.replaceWith(buildHeader(current));
  if (footer) footer.replaceWith(buildFooter());
  document.body.append(
    h("div", { class: "mbar" }, h("a", { class: "btn btn--dark", href: "/inscription" }, "Rejoindre l'académie"), h("a", { class: "btn btn--outline", href: "/contact" }, "Contact")),
  );
}
