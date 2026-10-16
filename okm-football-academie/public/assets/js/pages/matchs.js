import { getCollection } from "../api.js";
import { CONFIG } from "../config.js";
import { h, fill, exampleNotice, matchRow, selectField, uniq } from "../ui.js";

const TABS = [
  ["calendrier", "Calendrier"],
  ["resultats", "Résultats"],
  ["bilan", "Bilan"],
];

/** Bilan de l'académie par compétition et catégorie, à partir des seuls matchs terminés et validés. */
export function computeBilan(matches, points = CONFIG.points) {
  const rows = new Map();
  for (const m of matches) {
    if (m.status !== "termine" || m.validated === false) continue;
    const a = Number(m.ourScore);
    const b = Number(m.theirScore);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const key = `${m.competition || "Hors compétition"}||${m.category}`;
    const r = rows.get(key) || { competition: m.competition || "Hors compétition", category: m.category, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 };
    r.played += 1;
    r.gf += a;
    r.ga += b;
    if (a > b) { r.won += 1; r.pts += points.win; }
    else if (a < b) { r.lost += 1; r.pts += points.loss; }
    else { r.drawn += 1; r.pts += points.draw; }
    rows.set(key, r);
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.gf - y.ga - (x.gf - x.ga));
}

function bilanTable(rows) {
  if (!rows.length) return h("p", { class: "state" }, "Aucun match validé pour le moment.");
  const head = ["Compétition", "Cat.", "J", "V", "N", "D", "BP", "BC", "Diff.", "Pts"];
  return h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      {},
      h("caption", { class: "visually-hidden" }, "Bilan de OKM Football Académie par compétition"),
      h("thead", {}, h("tr", {}, head.map((t, i) => h("th", { scope: "col", class: i > 1 ? "num" : "" }, t)))),
      h(
        "tbody",
        {},
        rows.map((r) =>
          h("tr", {}, h("td", {}, r.competition), h("td", {}, r.category), [r.played, r.won, r.drawn, r.lost, r.gf, r.ga, r.gf - r.ga, r.pts].map((v, i) => h("td", { class: `num${i === 7 ? " strong" : ""}` }, String(v)))),
        ),
      ),
    ),
  );
}

export async function init() {
  const panel = document.getElementById("matches-panel");
  const tabsEl = document.getElementById("matches-tabs");
  const controls = document.getElementById("matches-controls");
  let matches;
  try {
    matches = await getCollection("matches");
  } catch {
    fill(panel, null, matchRow);
    return;
  }
  const state = { tab: "calendrier", category: "all", competition: "all" };
  const byDate = (dir) => (a, b) => dir * (new Date(a.datetime) - new Date(b.datetime));
  const filtered = () => matches.filter((m) => (state.category === "all" || m.category === state.category) && (state.competition === "all" || m.competition === state.competition));

  const draw = () => {
    panel.setAttribute("aria-labelledby", `tab-${state.tab}`);
    const pool = filtered();
    if (state.tab === "calendrier") {
      const items = pool.filter((m) => ["programme", "encours", "reporte", "annule"].includes(m.status)).sort(byDate(1));
      const wrap = h("div", {});
      fill(wrap, items, matchRow, "Aucun match à venir pour ce filtre.");
      panel.replaceChildren(wrap);
    } else if (state.tab === "resultats") {
      const items = pool.filter((m) => m.status === "termine" && m.validated !== false).sort(byDate(-1));
      const wrap = h("div", {});
      fill(wrap, items, matchRow, "Aucun résultat pour ce filtre.");
      panel.replaceChildren(wrap);
    } else {
      panel.replaceChildren(
        bilanTable(computeBilan(pool)),
        h("p", { class: "small muted", id: "bilan-note" }, "Ce tableau est le bilan de l'académie, calculé avec les seuls matchs terminés et validés. Un classement complet de compétition sera ajouté quand les résultats de toutes les équipes seront enregistrés."),
      );
    }
  };

  const setTab = (id, focus) => {
    state.tab = id;
    tabsEl.querySelectorAll('[role="tab"]').forEach((t) => {
      const on = t.dataset.tab === id;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    draw();
  };

  tabsEl.replaceChildren(...TABS.map(([id, label]) => h("button", { type: "button", role: "tab", class: "tab", id: `tab-${id}`, "aria-controls": "matches-panel", "data-tab": id, onclick: () => setTab(id) }, label)));
  tabsEl.addEventListener("keydown", (e) => {
    const i = TABS.findIndex(([id]) => id === state.tab);
    if (e.key === "ArrowRight") setTab(TABS[(i + 1) % TABS.length][0], true);
    if (e.key === "ArrowLeft") setTab(TABS[(i + TABS.length - 1) % TABS.length][0], true);
  });

  const opts = (label, values) => [{ value: "all", text: label }, ...values.map((v) => ({ value: v, text: v }))];
  controls.append(
    selectField("m-cat", "Catégorie", opts("Toutes les catégories", uniq(matches.map((m) => m.category))), "all", (v) => { state.category = v; draw(); }),
    selectField("m-comp", "Compétition", opts("Toutes les compétitions", uniq(matches.map((m) => m.competition))), "all", (v) => { state.competition = v; draw(); }),
  );
  exampleNotice(tabsEl, matches);
  setTab("calendrier");
}
