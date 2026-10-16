import { getCollection } from "../api.js";
import { CONFIG } from "../config.js";
import { h, media, fmtDateFull } from "../ui.js";

export async function init() {
  const root = document.getElementById("article");
  const slug = new URLSearchParams(location.search).get("slug");
  let news;
  try {
    news = await getCollection("news");
  } catch {
    root.replaceChildren(h("p", { class: "state state--err", role: "alert" }, "Cette actualité n'a pas pu être chargée. Réessayez dans un instant."));
    return;
  }
  const published = news.filter((n) => n.status === "publie").sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  const index = published.findIndex((n) => n.slug === slug);
  if (index === -1) {
    root.replaceChildren(h("h1", { class: "disp h2" }, "Actualité introuvable"), h("p", { class: "lead" }, "Cette publication n'existe pas ou n'est plus en ligne."), h("a", { class: "btn btn--dark", href: "/actualites" }, "Voir toutes les actualités"));
    document.title = `Actualité introuvable | ${CONFIG.siteName}`;
    return;
  }
  const n = published[index];
  document.title = `${n.title} | ${CONFIG.siteName}`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc && n.excerpt) desc.setAttribute("content", n.excerpt);

  const newer = published[index - 1];
  const older = published[index + 1];
  const paragraphs = Array.isArray(n.content) ? n.content : [String(n.content || "")];

  root.replaceChildren(
    h("div", { class: "row" }, h("span", { class: "chip chip--green" }, n.category || "Actualité"), h("span", { class: "muted small" }, fmtDateFull(n.publishedAt)), n.author && h("span", { class: "muted small" }, `Par ${n.author}`)),
    h("h1", { class: "disp h2" }, n.title),
    media(n.image, n.imageAlt || "", "ratio-1610", "Image principale"),
    h("div", { class: "article-body" }, paragraphs.map((p) => h("p", {}, p))),
    h(
      "nav",
      { class: "article-nav", "aria-label": "Autres actualités" },
      older ? h("a", { class: "more", href: `/actualite?slug=${encodeURIComponent(older.slug)}` }, `← ${older.title}`) : h("span", {}),
      newer ? h("a", { class: "more", href: `/actualite?slug=${encodeURIComponent(newer.slug)}` }, `${newer.title} →`) : h("a", { class: "more", href: "/actualites" }, "Toutes les actualités →"),
    ),
  );
}
