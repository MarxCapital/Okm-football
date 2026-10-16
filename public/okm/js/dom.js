import { TZ } from "./schema.js";

const PROPS = new Set(["value", "checked", "selected", "disabled", "hidden", "readOnly", "multiple"]);

/** Construit un élément. Aucun HTML n'est jamais interprété : tout passe par des nœuds texte. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (PROPS.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/* ---------- Annonces (toast) ---------- */
let timer;
export function toast(message, kind = "ok") {
  const box = document.getElementById("toast");
  if (!box) return;
  box.className = `toast toast--${kind}`;
  box.textContent = message;
  box.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { box.hidden = true; }, 5000);
}

/* ---------- Dates (heure de Brazzaville) ---------- */
const parts = (iso, opts) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, ...opts }).formatToParts(d);
};
const pick = (list, type) => list.find((p) => p.type === type)?.value ?? "";

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const p = parts(iso, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return p ? `${pick(p, "day")}/${pick(p, "month")}/${pick(p, "year")} ${pick(p, "hour")}:${pick(p, "minute")}` : "—";
}
export function fmtDate(value) {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
}
export function fmtShort(iso) {
  if (!iso) return "—";
  const p = parts(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return p ? `${pick(p, "day")} ${pick(p, "month")} · ${pick(p, "hour")} h ${pick(p, "minute")}` : "—";
}
/** ISO → valeur d'un <input type="datetime-local"> à l'heure de Brazzaville. */
export function toLocalInput(iso) {
  if (!iso) return "";
  const p = parts(iso, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return p ? `${pick(p, "year")}-${pick(p, "month")}-${pick(p, "day")}T${pick(p, "hour")}:${pick(p, "minute")}` : "";
}
/** Valeur d'un <input type="datetime-local"> → ISO (Brazzaville = UTC+1, sans heure d'été). */
export function fromLocalInput(value) {
  return value ? `${value}:00+01:00` : "";
}
