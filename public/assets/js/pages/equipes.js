import { getCollection } from "../api.js";
import { h, fill, exampleNotice, teamCard, pillBar, uniq } from "../ui.js";

export async function init() {
  const list = document.getElementById("teams-list");
  const controls = document.getElementById("teams-controls");
  let teams;
  try {
    teams = await getCollection("teams");
  } catch {
    fill(list, null, teamCard);
    return;
  }
  const state = { category: "all", archived: false };

  const draw = () => {
    const shown = teams.filter((t) => (state.category === "all" || t.category === state.category) && (state.archived ? t.status === "archive" : t.status !== "archive"));
    fill(list, shown, teamCard, state.archived ? "Aucune équipe archivée." : "Aucune équipe dans cette catégorie.");
  };

  const cats = uniq(teams.map((t) => t.category));
  controls.append(
    pillBar("Filtrer par catégorie", [{ value: "all", text: "Toutes" }, ...cats.map((c) => ({ value: c, text: c }))], "all", (v) => { state.category = v; draw(); }),
    pillBar("Saison", [{ value: "active", text: "Saison en cours" }, { value: "archive", text: "Archives" }], "active", (v) => { state.archived = v === "archive"; draw(); }),
  );
  exampleNotice(list, teams);
  draw();
}
