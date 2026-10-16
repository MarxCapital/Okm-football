import { getCollection } from "../api.js";
import { CONFIG } from "../config.js";
import { h, fill, exampleNotice, newsCard, pillBar, uniq } from "../ui.js";

export async function init() {
  const list = document.getElementById("news-list");
  const controls = document.getElementById("news-controls");
  const moreWrap = document.getElementById("news-more");
  let news;
  try {
    news = await getCollection("news");
  } catch {
    fill(list, null, newsCard);
    return;
  }
  const published = news.filter((n) => n.status === "publie").sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  const state = { category: "all", count: CONFIG.newsPerPage };

  const draw = () => {
    const pool = published.filter((n) => state.category === "all" || n.category === state.category);
    fill(list, pool.slice(0, state.count), newsCard, "Aucune actualité dans cette catégorie.");
    moreWrap.replaceChildren();
    if (pool.length > state.count) {
      moreWrap.append(h("button", { type: "button", class: "btn btn--outline", onclick: () => { state.count += CONFIG.newsPerPage; draw(); } }, "Voir les publications précédentes"));
    }
  };

  const cats = uniq(published.map((n) => n.category));
  controls.append(pillBar("Filtrer par catégorie", [{ value: "all", text: "Toutes" }, ...cats.map((c) => ({ value: c, text: c }))], "all", (v) => { state.category = v; state.count = CONFIG.newsPerPage; draw(); }));
  exampleNotice(list, published);
  draw();
}
