import { getCollection } from "../api.js";
import { h, fill, exampleNotice, logoTile, safeUrl } from "../ui.js";

export async function init() {
  const list = document.getElementById("partners-list");
  let partners;
  try {
    partners = await getCollection("partners");
  } catch {
    fill(list, null, logoTile);
    return;
  }
  // Seuls les partenaires dont la présentation a été approuvée par l'académie sont publiés.
  const approved = partners.filter((p) => p.approved === true);

  const card = (p) => {
    const url = safeUrl(p.website);
    return h(
      "article",
      { class: "partner-card" },
      logoTile({ ...p, website: "" }),
      h("h3", { class: "disp h3" }, p.name),
      p.description && h("p", {}, p.description),
      p.support && h("p", { class: "small muted" }, `Soutien : ${p.support}`),
      p.period && p.showPeriod ? h("p", { class: "small muted" }, `Partenariat : ${p.period}`) : null,
      url ? h("a", { class: "more", href: url, target: "_blank", rel: "noopener noreferrer" }, "Visiter le site (nouvel onglet)") : null,
    );
  };

  fill(list, approved, card, "Les partenaires seront présentés prochainement.");
  exampleNotice(list, approved);
}
