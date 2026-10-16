import { getCollection } from "../api.js";
import { h, fill, exampleNotice, playerCard, selectField, uniq } from "../ui.js";

export async function init() {
  const list = document.getElementById("players-list");
  const controls = document.getElementById("players-controls");
  let players;
  try {
    players = await getCollection("players");
  } catch {
    fill(list, null, playerCard);
    return;
  }
  // Seuls les profils validés par l'académie ET dont l'autorisation de publication existe sont affichés.
  const visible = players.filter((p) => p.published === true && p.consent === true);
  const params = new URLSearchParams(location.search);
  const state = { category: params.get("categorie") || "all", position: "all" };

  const draw = () => {
    const shown = visible.filter((p) => (state.category === "all" || p.category === state.category) && (state.position === "all" || p.position === state.position));
    fill(list, shown, playerCard, "Aucun joueur ne correspond à ce filtre.");
  };

  const opts = (label, values) => [{ value: "all", text: label }, ...values.map((v) => ({ value: v, text: v }))];
  controls.append(
    selectField("f-cat", "Catégorie", opts("Toutes les catégories", uniq(visible.map((p) => p.category))), state.category, (v) => { state.category = v; draw(); }),
    selectField("f-pos", "Poste", opts("Tous les postes", uniq(visible.map((p) => p.position))), state.position, (v) => { state.position = v; draw(); }),
  );
  exampleNotice(list, visible);
  draw();
}
