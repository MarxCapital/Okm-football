// En-tête, pied de page et barre mobile partagés par toutes les pages.
import { CONFIG } from "./config.js";
import { h, icon, safeUrl } from "./ui.js";

// [clé, adresse, libellé, visible dans la barre du haut sur ordinateur]. Le menu mobile affiche tout.
const NAV = [
  ["home", "/", "Accueil", false],
  ["academie", "/academie", "L'académie", true],
  ["equipes", "/equipes", "Équipes", true],
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
  return url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, text) : h("span", {}, text);
}

function buildHeader(current) {
  const burger = h("button", { type: "button", class: "burger", "aria-expanded": "false", "aria-controls": "main-nav", "aria-label": "Ouvrir le menu" }, icon("menu"));
  const nav = h(
    "div",
    { class: "nav-bar", id: "main-nav" },
    h("nav", { "aria-label": "Navigation principale" }, h("ul", {}, NAV.map(([key, href, label, primary]) => h("li", { class: primary ? "" : "nav-more" }, h("a", { href, "aria-current": key === current ? "page" : null }, label))))),
  );

  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
    burger.replaceChildren(icon(open ? "close" : "menu"));
  };
  burger.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) { setOpen(false); burger.focus(); }
  });
  window.matchMedia("(min-width: 1024px)").addEventListener("change", (e) => { if (e.matches) setOpen(false); });

  return h(
    "header",
    { class: "site-header" },
    h(
      "div",
      { class: "wrap head-main" },
      h("a", { class: "brand", href: "/", "aria-label": `${CONFIG.siteName}, accueil` }, h("span", { class: "brand-mark", "aria-hidden": "true" }, "OKM"), h("span", { class: "brand-name" }, "Football", h("br"), "Académie")),
      nav,
      h("div", { class: "head-actions" }, h("a", { class: "btn btn--dark head-cta", href: "/inscription" }, "Inscrire mon enfant"), burger),
    ),
  );
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
        h("div", { class: "stack stack--sm" }, h("p", { class: "disp foot-brand" }, CONFIG.siteName), h("p", { class: "eyebrow eyebrow--gold" }, CONFIG.motto), h("p", { class: "small" }, `Formation et développement du football des jeunes. ${CONFIG.location}.`)),
        h("div", {}, h("span", { class: "eyebrow eyebrow--gold" }, "Le site"), h("ul", {}, link("/academie", "L'académie"), link("/equipes", "Équipes"), link("/actualites", "Actualités"), link("/matchs", "Matchs et résultats"), link("/palmares", "Palmarès"), link("/galerie", "Galerie"))),
        h("div", {}, h("span", { class: "eyebrow eyebrow--gold" }, "Nous joindre"), h("ul", {}, h("li", {}, CONFIG.email), h("li", {}, facebookNode()), h("li", {}, CONFIG.location), link("/contact", "Formulaire de contact"), link("/inscription", "Inscription"))),
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
    h("div", { class: "mbar" }, h("a", { class: "btn btn--dark", href: "/inscription" }, "Inscrire mon enfant"), h("a", { class: "btn btn--outline", href: "/contact" }, "Contact")),
  );
}
