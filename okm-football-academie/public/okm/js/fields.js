// Construit le champ de formulaire adapté à chaque type du schéma.
import { h, fmtDateTime, fmtDate, toLocalInput, fromLocalInput, toast } from "./dom.js";
import { uploadImage, uploadVideo } from "./api.js";

const BLANK_SELECT = "Choisir…";

function imageControl(f, id, value) {
  const input = h("input", { class: "input", id, type: "text", value: value || "", placeholder: "https://… ou envoyez une image", autocomplete: "off", "aria-describedby": `hint-${f.key} err-${f.key}` });
  const preview = h("img", { class: "thumb", alt: "", hidden: !value });
  const status = h("p", { class: "hint", role: "status" });
  const file = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "visually-hidden", id: `${id}-file`, tabindex: "-1" });
  const sync = () => { preview.hidden = !input.value; if (input.value) preview.src = input.value; };
  input.addEventListener("change", sync);
  sync();
  const pick = h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => file.click() }, "Envoyer une image");
  const clear = h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => { input.value = ""; sync(); } }, "Retirer");
  file.addEventListener("change", async () => {
    const chosen = file.files[0];
    file.value = "";
    if (!chosen) return;
    status.textContent = "Envoi en cours…";
    pick.disabled = true;
    try {
      input.value = await uploadImage(chosen);
      sync();
      status.textContent = "Image envoyée.";
    } catch (e) {
      status.textContent = "";
      toast(e.message, "err");
    } finally {
      pick.disabled = false;
    }
  });
  return { control: h("div", { class: "image-field" }, preview, h("div", { class: "stack stack--sm" }, input, h("div", { class: "row" }, pick, clear), status, file)), get: () => input.value.trim(), input };
}

function videoControl(f, id, value) {
  const input = h("input", { class: "input", id, type: "text", value: value || "", placeholder: "https://… (fichier vidéo ou YouTube) ou envoyez un fichier", autocomplete: "off", "aria-describedby": `hint-${f.key} err-${f.key}` });
  const status = h("p", { class: "hint", role: "status" });
  const file = h("input", { type: "file", accept: "video/mp4,video/webm", class: "visually-hidden", id: `${id}-file`, tabindex: "-1" });
  const pick = h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => file.click() }, "Envoyer une vidéo");
  const clear = h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => { input.value = ""; status.textContent = ""; } }, "Retirer");
  file.addEventListener("change", async () => {
    const chosen = file.files[0];
    file.value = "";
    if (!chosen) return;
    status.textContent = "Envoi en cours, cela peut prendre une minute…";
    pick.disabled = true;
    try {
      input.value = await uploadVideo(chosen);
      status.textContent = "Vidéo envoyée.";
    } catch (e) {
      status.textContent = "";
      toast(e.message, "err");
    } finally {
      pick.disabled = false;
    }
  });
  return { control: h("div", { class: "stack stack--sm" }, input, h("div", { class: "row" }, pick, clear), status, file), get: () => input.value.trim(), input };
}

function galleryControl(f, value) {
  let items = (Array.isArray(value) ? value : []).map((i) => ({ src: i.src, alt: i.alt || "" }));
  const list = h("div", { class: "gallery-list" });
  const status = h("p", { class: "hint", role: "status" });
  const file = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, class: "visually-hidden", id: `f-${f.key}-file`, tabindex: "-1" });
  const urlInput = h("input", { class: "input", type: "text", placeholder: "Ou collez une adresse https://…", id: `f-${f.key}`, "aria-label": "Adresse d'une image à ajouter" });

  const render = () => {
    list.replaceChildren(
      ...(items.length
        ? items.map((item, i) =>
            h("div", { class: "gallery-row" },
              h("img", { class: "thumb", src: item.src, alt: "" }),
              h("input", { class: "input", type: "text", value: item.alt, placeholder: "Description de la photo", "aria-label": `Description de la photo ${i + 1}`, maxlength: 160, oninput: (e) => { item.alt = e.target.value; } }),
              h("button", { type: "button", class: "btn btn--outline btn--sm", "aria-label": `Retirer la photo ${i + 1}`, onclick: () => { items.splice(i, 1); render(); } }, "Retirer"),
            ),
          )
        : [h("p", { class: "hint" }, "Aucune photographie pour le moment.")]),
    );
  };
  render();

  file.addEventListener("change", async () => {
    const chosen = [...file.files];
    file.value = "";
    for (const [n, one] of chosen.entries()) {
      status.textContent = `Envoi de l'image ${n + 1} sur ${chosen.length}…`;
      try {
        items.push({ src: await uploadImage(one), alt: "" });
        render();
      } catch (e) {
        toast(`${one.name} : ${e.message}`, "err");
      }
    }
    status.textContent = "";
  });

  const add = h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => file.click() }, "Envoyer des photos");
  const addUrl = h("button", { type: "button", class: "btn btn--outline btn--sm", onclick: () => { const u = urlInput.value.trim(); if (u) { items.push({ src: u, alt: "" }); urlInput.value = ""; render(); } } }, "Ajouter l'adresse");
  return { control: h("div", { class: "stack stack--sm" }, list, h("div", { class: "row" }, add, file), h("div", { class: "row row--grow" }, urlInput, addUrl), status), get: () => items.map((i) => ({ src: i.src, alt: i.alt })), input: urlInput };
}

/**
 * Renvoie { el, get(), setError(msg), input } pour un champ du schéma.
 * ctx.refs : { collection: [{id, label}] } déjà chargées.
 */
export function buildField(f, value, ctx = {}) {
  const id = `f-${f.key}`;
  const err = h("p", { class: "field-error", id: `err-${f.key}`, role: "alert" });
  const hint = f.help ? h("p", { class: "hint", id: `hint-${f.key}` }, f.help) : null;
  const describedBy = [f.help && `hint-${f.key}`, `err-${f.key}`].filter(Boolean).join(" ");
  const req = f.required && !f.readonly ? h("span", { class: "req", "aria-hidden": "true" }, " *") : null;

  if (f.hidden) return { el: null, get: () => value ?? "", setError() {}, input: null, hidden: true };

  if (f.readonly) {
    const shown = f.type === "datetime" ? fmtDateTime(value) : f.type === "date" ? fmtDate(value) : value ?? "";
    return { el: h("div", { class: "field" }, h("span", { class: "label" }, f.label), h("div", { class: "readonly" }, String(shown) || "—")), get: () => value ?? "", setError() {}, input: null };
  }

  let control;
  let get;
  let input;
  let wrap = "label";

  switch (f.type) {
    case "checkbox": {
      input = control = h("input", { type: "checkbox", id, checked: value === undefined ? Boolean(f.default) : Boolean(value), "aria-describedby": describedBy });
      get = () => control.checked;
      const el = h("div", { class: "field" }, h("div", { class: "check" }, control, h("label", { for: id }, f.label)), hint, err);
      return { el, get, setError: (m) => { err.textContent = m || ""; }, input };
    }

    case "textarea":
      input = control = h("textarea", { class: "textarea", id, rows: f.rows || 5, maxlength: f.max, value: value ?? "", "aria-describedby": describedBy });
      get = () => control.value;
      break;

    case "select": {
      const current = value ?? f.default ?? "";
      input = control = h("select", { class: "select", id, "aria-describedby": describedBy },
        !current || !f.required ? h("option", { value: "" }, f.required ? BLANK_SELECT : "— Aucun —") : null,
        f.options.map(([v, l]) => h("option", { value: v, selected: v === current }, l)));
      control.value = current;
      get = () => control.value;
      break;
    }

    case "ref": {
      const items = [...(ctx.refs?.[f.ref] || [])].sort((a, b) => a.label.localeCompare(b.label, "fr"));
      input = control = h("select", { class: "select", id, "aria-describedby": describedBy },
        h("option", { value: "" }, f.required ? BLANK_SELECT : "— Aucun —"),
        items.map((r) => h("option", { value: r.id }, r.label)));
      control.value = value ?? "";
      get = () => control.value;
      break;
    }

    case "number":
      input = control = h("input", { class: "input", id, type: "number", value: value ?? "", min: f.min, max: f.max, step: f.int ? 1 : "any", inputmode: "numeric", "aria-describedby": describedBy });
      get = () => control.value;
      break;

    case "date":
      input = control = h("input", { class: "input", id, type: "date", value: value ?? "", "aria-describedby": describedBy });
      get = () => control.value;
      break;

    case "datetime":
      input = control = h("input", { class: "input", id, type: "datetime-local", value: toLocalInput(value), "aria-describedby": describedBy });
      get = () => fromLocalInput(control.value);
      break;

    case "lines":
      input = control = h("textarea", { class: "textarea", id, rows: 4, value: (Array.isArray(value) ? value : []).join("\n"), "aria-describedby": describedBy });
      get = () => control.value.split("\n").map((l) => l.trim()).filter(Boolean);
      break;

    case "videos":
      input = control = h("textarea", { class: "textarea", id, rows: 4, placeholder: "Titre de la vidéo | https://…", value: (Array.isArray(value) ? value : []).map((v) => `${v.title} | ${v.url}`).join("\n"), "aria-describedby": describedBy });
      get = () =>
        control.value.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
          const i = line.lastIndexOf("|");
          return i === -1 ? { title: "", url: line } : { title: line.slice(0, i).trim(), url: line.slice(i + 1).trim() };
        });
      break;

    case "image": {
      const r = imageControl(f, id, value);
      control = r.control; get = r.get; input = r.input;
      wrap = "group";
      break;
    }

    case "video": {
      const r = videoControl(f, id, value);
      control = r.control; get = r.get; input = r.input;
      wrap = "group";
      break;
    }

    case "gallery": {
      const r = galleryControl(f, value);
      control = r.control; get = r.get; input = r.input;
      wrap = "group";
      break;
    }

    case "password":
      input = control = h("input", { class: "input", id, type: "password", autocomplete: "new-password", value: "", "aria-describedby": describedBy });
      get = () => control.value;
      break;

    default:
      input = control = h("input", { class: "input", id, type: f.type === "url" ? "url" : "text", value: value ?? "", maxlength: f.max, autocomplete: "off", "aria-describedby": describedBy });
      get = () => control.value;
  }

  const label = wrap === "label" ? h("label", { for: id }, f.label, req) : h("span", { class: "label" }, f.label, req);
  const el = h("div", { class: "field" }, label, control, hint, err);
  const setError = (m) => {
    err.textContent = m || "";
    if (input) { if (m) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); }
  };
  return { el, get, setError, input };
}
