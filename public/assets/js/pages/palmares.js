import { getCollection } from "../api.js";
import { h, fill, exampleNotice, trophyCard, pillBar, uniq } from "../ui.js";

export async function init() {
  const list = document.getElementById("trophies-list");
  const controls = document.getElementById("trophies-controls");
  let trophies;
  try {
    trophies = await getCollection("trophies");
  } catch {
    fill(list, null, trophyCard);
    return;
  }
  const state = { category: "all" };

  const draw = () => {
    list.replaceChildren();
    list.removeAttribute("aria-busy");
    const pool = trophies.filter((t) => state.category === "all" || t.category === state.category);
    if (!pool.length) {
      list.append(h("p", { class: "state" }, "Aucune distinction dans cette catégorie."));
      return;
    }
    const years = uniq(pool.map((t) => String(t.year))).sort((a, b) => Number(b) - Number(a));
    for (const year of years) {
      list.append(
        h(
          "section",
          { "aria-label": `Distinctions ${year}` },
          h("h2", { class: "timeline-year" }, year),
          h("div", { class: "grid g3" }, pool.filter((t) => String(t.year) === year).map((t) => trophyCard(t, true))),
        ),
      );
    }
  };

  const cats = uniq(trophies.map((t) => t.category));
  controls.append(pillBar("Filtrer par catégorie", [{ value: "all", text: "Toutes" }, ...cats.map((c) => ({ value: c, text: c }))], "all", (v) => { state.category = v; draw(); }));
  exampleNotice(list, trophies);
  draw();
}
