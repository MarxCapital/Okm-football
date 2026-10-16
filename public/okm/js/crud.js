// Liste et formulaire génériques, générés à partir de schema.js.
import { COLLECTIONS, CHIP, ROLES, optionLabel } from "./schema.js";
import { api, ApiError, loadRefs, clearRefs } from "./api.js";
import { h, toast, fmtDateTime, fmtDate } from "./dom.js";
import { buildField } from "./fields.js";

const META = new Set(["id", "createdAt", "updatedAt"]);
const apiBase = (key) => (COLLECTIONS[key].single ? "/admin/settings" : `/admin/${key}`);

export const chip = (value, label, color) => h("span", { class: `chip chip--${color || CHIP[value] || "muted"}` }, label ?? value);

/* ---------- Libellés des colonnes ---------- */
async function refMaps(def) {
  const maps = {};
  const keys = new Set(def.columns?.filter((c) => c.type === "ref").map((c) => c.ref));
  await Promise.all([...keys].map(async (k) => { maps[k] = new Map((await loadRefs(k).catch(() => [])).map((r) => [r.id, r.label])); }));
  return maps;
}

function cell(def, col, doc, maps) {
  const raw = col.get ? col.get(doc) : doc[col.key];
  const field = def.fields.find((f) => f.key === col.key);
  switch (col.type) {
    case "chip": {
      const opts = col.options || field?.options || [];
      const label = (opts.find(([v]) => v === raw) || [])[1] ?? raw;
      return raw ? chip(raw, label) : "—";
    }
    case "bool": return raw ? chip("oui", "Oui") : chip("non", "Non");
    case "ref": return maps[col.ref]?.get(raw) ?? "—";
    case "datetime": return fmtDateTime(raw);
    case "date": return fmtDate(raw);
    case "option": return optionLabel(field, raw);
    default: return raw === undefined || raw === null || raw === "" ? "—" : String(raw);
  }
}

const searchText = (def, doc) => def.columns.map((c) => (c.get ? c.get(doc) : doc[c.key])).filter((v) => typeof v === "string" || typeof v === "number").join(" ").toLowerCase();

/* ====================================================================== */
/*  Liste                                                                  */
/* ====================================================================== */
export async function renderList(root, key) {
  const def = COLLECTIONS[key];
  root.replaceChildren(h("p", { class: "state" }, "Chargement…"));
  let items, maps;
  try {
    [items, maps] = await Promise.all([api(`/admin/${key}`).then((r) => r.items), refMaps(def)]);
  } catch (e) {
    root.replaceChildren(h("p", { class: "alert alert--err", role: "alert" }, e.message));
    return;
  }

  if (def.sort) items.sort((a, b) => def.sort.dir * (String(a[def.sort.key] ?? "").localeCompare(String(b[def.sort.key] ?? ""), "fr", { numeric: true })));

  const state = { q: "", status: "" };
  const search = h("input", { class: "input", id: "list-search", type: "search", placeholder: "Rechercher…", "aria-label": "Rechercher dans la liste", oninput: (e) => { state.q = e.target.value.toLowerCase(); draw(); } });
  const statusField = def.statusField && def.fields.find((f) => f.key === def.statusField);
  const status = statusField
    ? h("select", { class: "select", id: "list-status", "aria-label": "Filtrer par statut", onchange: (e) => { state.status = e.target.value; draw(); } }, h("option", { value: "" }, "Tous les statuts"), statusField.options.map(([v, l]) => h("option", { value: v }, l)))
    : null;
  const body = h("div", {});
  const count = h("p", { class: "hint", role: "status" });

  const draw = () => {
    const shown = items.filter((d) => (!state.q || searchText(def, d).includes(state.q)) && (!state.status || d[def.statusField] === state.status));
    count.textContent = `${shown.length} sur ${items.length}`;
    if (!items.length) {
      body.replaceChildren(h("div", { class: "empty" }, h("p", {}, def.noCreate ? "Rien à afficher pour le moment." : `Aucun élément pour le moment.`), def.noCreate ? null : h("a", { class: "btn btn--dark", href: `#/${key}/new` }, `Ajouter : ${def.singular}`)));
      return;
    }
    if (!shown.length) { body.replaceChildren(h("p", { class: "state" }, "Aucun résultat pour cette recherche.")); return; }
    body.replaceChildren(
      h("div", { class: "table-wrap" },
        h("table", {},
          h("caption", { class: "visually-hidden" }, def.label),
          h("thead", {}, h("tr", {}, def.columns.map((c) => h("th", { scope: "col" }, c.label)), h("th", { scope: "col" }, h("span", { class: "visually-hidden" }, "Action")))),
          h("tbody", {}, shown.map((d) => h("tr", {}, def.columns.map((c) => h("td", {}, cell(def, c, d, maps))), h("td", {}, h("a", { class: "more", href: `#/${key}/${d.id}`, "aria-label": `Ouvrir : ${def.titleOf(d) || def.singular}` }, "Ouvrir"))))),
        ),
      ),
    );
  };

  root.replaceChildren(
    h("div", { class: "view-head" },
      h("h1", { class: "disp h2" }, def.label),
      def.noCreate ? null : h("a", { class: "btn btn--dark", href: `#/${key}/new` }, `Ajouter : ${def.singular}`),
    ),
    items.length ? h("div", { class: "filters" }, h("div", { class: "field" }, h("label", { for: "list-search" }, "Rechercher"), search), status ? h("div", { class: "field" }, h("label", { for: "list-status" }, "Statut"), status) : null, count) : null,
    body,
  );
  draw();
}

/* ====================================================================== */
/*  Formulaire                                                             */
/* ====================================================================== */
export async function renderForm(root, key, id, navigate) {
  const def = COLLECTIONS[key];
  const isNew = id === "new";
  const single = Boolean(def.single);
  root.replaceChildren(h("p", { class: "state" }, "Chargement…"));

  let doc;
  const refs = {};
  try {
    const needed = [...new Set(def.fields.filter((f) => f.type === "ref").map((f) => f.ref))];
    if (key === "registration_requests") needed.push("categories"); // pour créer la fiche joueur d'une demande acceptée
    await Promise.all(needed.map(async (k) => { refs[k] = await loadRefs(k); }));
    if (isNew) doc = {};
    else doc = (await api(`${apiBase(key)}${single ? "" : `/${id}`}`)).item;
  } catch (e) {
    root.replaceChildren(h("p", { class: "alert alert--err", role: "alert" }, e.message), h("a", { class: "more", href: `#/${key}` }, "← Retour à la liste"));
    return;
  }

  const fields = def.fields.map((f) => buildField(f, isNew ? (f.default !== undefined ? f.default : undefined) : doc[f.key], { refs }));
  const byKey = Object.fromEntries(fields.map((f, i) => [def.fields[i].key, f]));
  const summary = h("div", { class: "alert alert--err", role: "alert", hidden: true });

  // Regroupement par section
  const groups = [];
  def.fields.forEach((f, i) => {
    if (!fields[i].el) return;
    const name = f.group || "";
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, els: [] }));
    g.els.push(fields[i].el);
  });

  const saveBtn = h("button", { type: "submit", class: "btn btn--dark" }, "Enregistrer");
  const actions = h("div", { class: "row form-actions" }, saveBtn, single ? null : h("a", { class: "btn btn--outline", href: `#/${key}` }, "Annuler"));

  /* Suppression en deux temps, sans boîte de dialogue du navigateur */
  const canDelete = !isNew && !single && key !== "users";
  if (canDelete) {
    const area = h("div", { class: "delete-area" });
    const ask = () => {
      area.replaceChildren(
        h("p", { class: "alert alert--err", role: "alert" }, "Supprimer définitivement cet élément ? Cette action est irréversible."),
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn btn--danger", onclick: async () => {
            try { await api(`/admin/${key}/${id}`, { method: "DELETE" }); clearRefs(); toast("Élément supprimé."); navigate(`#/${key}`); }
            catch (e) { area.replaceChildren(h("p", { class: "alert alert--err", role: "alert" }, e.message), h("button", { type: "button", class: "btn btn--outline", onclick: reset }, "Fermer")); }
          } }, "Oui, supprimer"),
          h("button", { type: "button", class: "btn btn--outline", onclick: reset }, "Annuler")),
      );
    };
    const reset = () => area.replaceChildren(h("button", { type: "button", class: "btn btn--outline btn--danger-text", onclick: ask }, "Supprimer…"));
    reset();
    actions.append(area);
  }

  const form = h("form", { class: "form", novalidate: true },
    summary,
    groups.map((g) => h("fieldset", {}, g.name ? h("legend", {}, g.name) : null, g.els)),
    ...extraPanels(key, doc, refs, navigate),
    actions,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    summary.hidden = true;
    fields.forEach((f) => f.setError(""));
    const payload = {};
    for (const [k, v] of Object.entries(doc)) if (!META.has(k)) payload[k] = v;
    def.fields.forEach((f, i) => { payload[f.key] = fields[i].get(); });
    saveBtn.disabled = true;
    saveBtn.textContent = "Enregistrement…";
    try {
      const res = await api(`${apiBase(key)}${isNew || single ? "" : `/${id}`}`, { method: isNew ? "POST" : "PUT", body: payload });
      clearRefs();
      toast(`Enregistré : ${def.titleOf(res.item) || def.singular}`);
      if (single) { doc = res.item; saveBtn.disabled = false; saveBtn.textContent = "Enregistrer"; }
      else navigate(`#/${key}`);
    } catch (e) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Enregistrer";
      if (e instanceof ApiError && e.errors && Object.keys(e.errors).length) {
        let first;
        for (const [k, msg] of Object.entries(e.errors)) { byKey[k]?.setError(msg); first ||= byKey[k]; }
        summary.textContent = "Certains champs sont à corriger. Ils sont signalés en rouge.";
        summary.hidden = false;
        first?.input?.focus();
      } else {
        summary.textContent = e.message;
        summary.hidden = false;
        summary.scrollIntoView({ block: "nearest" });
      }
    }
  });

  root.replaceChildren(
    h("div", { class: "view-head" },
      h("div", { class: "stack stack--sm" },
        single ? null : h("a", { class: "more", href: `#/${key}` }, `← ${def.label}`),
        h("h1", { class: "disp h2" }, single ? def.label : isNew ? `Ajouter : ${def.singular}` : def.titleOf(doc) || def.singular)),
    ),
    form,
  );

  // Ouvrir un message le marque comme lu.
  if (key === "contact_messages" && doc.status === "non_lu") {
    api(`/admin/${key}/${id}`, { method: "PUT", body: { ...doc, status: "lu" } }).then(() => { byKey.status.input.value = "lu"; doc.status = "lu"; }).catch(() => {});
  }
}

/* ====================================================================== */
/*  Panneaux spécifiques                                                   */
/* ====================================================================== */
const POSITIONS = ["Gardien", "Défenseur", "Milieu", "Attaquant"];

function extraPanels(key, doc, refs, navigate) {
  // Inscription acceptée : créer la fiche joueur (brouillon non publié).
  if (key === "registration_requests" && doc.id) {
    if (doc.playerId) {
      return [h("div", { class: "panel" }, h("p", {}, "Une fiche joueur a été créée à partir de cette demande."), h("a", { class: "more", href: `#/players/${doc.playerId}` }, "Ouvrir la fiche joueur →"))];
    }
    if (doc.status === "acceptee") {
      const cats = refs.categories || (refs.categories = []);
      const match = cats.find((c) => c.label.toLowerCase() === String(doc.category).toLowerCase());
      const select = h("select", { class: "select", id: "create-cat", "aria-label": "Catégorie de la fiche joueur" }, h("option", { value: "" }, "Choisir une catégorie…"), cats.map((c) => h("option", { value: c.id, selected: match?.id === c.id }, c.label)));
      const msg = h("p", { class: "field-error", role: "alert" });
      const btn = h("button", { type: "button", class: "btn btn--dark", onclick: async () => {
        msg.textContent = "";
        if (!select.value) { msg.textContent = "Choisissez la catégorie du joueur."; select.focus(); return; }
        btn.disabled = true;
        try {
          const player = await api("/admin/players", { method: "POST", body: {
            firstName: doc.firstName, lastName: doc.lastName, birthYear: doc.birthYear, categoryId: select.value,
            position: POSITIONS.includes(doc.position) ? doc.position : "", sportStatus: "actif", publishProfile: false,
            guardianName: doc.guardianName, guardianPhone: doc.guardianPhone, joinedAt: new Date().toISOString().slice(0, 10),
            internalNotes: "Fiche créée depuis une demande d'inscription acceptée.",
          } });
          const { id: rid, createdAt, updatedAt, ...rest } = doc;
          await api(`/admin/registration_requests/${rid}`, { method: "PUT", body: { ...rest, playerId: player.item.id } });
          clearRefs();
          toast("Fiche joueur créée. Le profil n'est pas publié.");
          navigate(`#/players/${player.item.id}`);
        } catch (e) { msg.textContent = e.message; btn.disabled = false; }
      } }, "Créer la fiche joueur");
      return [h("div", { class: "panel stack stack--sm" }, h("h2", { class: "disp h3" }, "Admission"), h("p", { class: "hint" }, "La demande est acceptée. Enregistrez d'abord vos modifications, puis créez la fiche. Le profil créé n'est pas publié sur le site."), h("div", { class: "field" }, h("label", { for: "create-cat" }, "Catégorie"), select, msg), btn)];
    }
  }
  if (key === "users") return [h("p", { class: "hint" }, `Rôles : ${Object.values(ROLES).join(" · ")}. Un compte ne se supprime pas : il se désactive.`)];
  return [];
}
