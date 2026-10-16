// Validation côté serveur, pilotée par schema.js. Le navigateur n'est jamais cru sur parole.
import { HttpError } from "./util.js";
import { docExists } from "./db.js";

const URL_RE = /^(https:\/\/[^\s]+|\/(?!\/)[^\s]*)$/;
const REQUIRED = "Ce champ est obligatoire.";

const isEmpty = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

function text(f, v) {
  const s = String(v).replace(/\r\n/g, "\n").trim();
  const max = f.max ?? (f.type === "textarea" ? 5000 : 200);
  if (s.length > max) return { error: `Maximum ${max} caractères.` };
  return { value: s };
}

export async function validateDoc(env, def, input, { existing = null } = {}) {
  const errors = {};
  const data = {};

  for (const f of def.fields) {
    const key = f.key;
    if (f.readonly) {
      data[key] = existing ? existing[key] ?? "" : "";
      continue;
    }
    const raw = input[key];
    const fail = (msg) => { errors[key] = msg; };

    switch (f.type) {
      case "checkbox":
        data[key] = raw === undefined ? (existing ? Boolean(existing[key]) : Boolean(f.default)) : raw === true || raw === "true" || raw === 1;
        break;

      case "number": {
        if (isEmpty(raw)) {
          if (f.required) fail(REQUIRED);
          data[key] = null;
          break;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) fail("Saisissez un nombre.");
        else if (f.int && !Number.isInteger(n)) fail("Saisissez un nombre entier.");
        else if (f.min !== undefined && n < f.min) fail(`La valeur minimale est ${f.min}.`);
        else if (f.max !== undefined && n > f.max) fail(`La valeur maximale est ${f.max}.`);
        else data[key] = n;
        break;
      }

      case "date": {
        if (isEmpty(raw)) { if (f.required) fail(REQUIRED); data[key] = ""; break; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) fail("Date invalide.");
        else data[key] = raw;
        break;
      }

      case "datetime": {
        if (isEmpty(raw)) { if (f.required) fail(REQUIRED); data[key] = ""; break; }
        const t = Date.parse(raw);
        if (typeof raw !== "string" || Number.isNaN(t)) fail("Date et heure invalides.");
        else data[key] = new Date(t).toISOString();
        break;
      }

      case "select": {
        const value = isEmpty(raw) ? "" : String(raw);
        if (!value) { if (f.required) fail(REQUIRED); data[key] = ""; break; }
        if (!f.options.some(([v]) => v === value)) fail("Choix invalide.");
        else data[key] = value;
        break;
      }

      case "ref": {
        const value = isEmpty(raw) ? "" : String(raw);
        if (!value) { if (f.required) fail(REQUIRED); data[key] = ""; break; }
        if (!(await docExists(env, f.ref, value))) fail("Cet élément n'existe pas ou a été supprimé.");
        else data[key] = value;
        break;
      }

      case "image":
      case "video":
      case "url": {
        const value = isEmpty(raw) ? "" : String(raw).trim();
        if (!value) { if (f.required) fail(REQUIRED); data[key] = ""; break; }
        if (!URL_RE.test(value) || value.length > 500) fail("Adresse invalide : elle doit commencer par https://");
        else data[key] = value;
        break;
      }

      case "gallery": {
        const list = Array.isArray(raw) ? raw : [];
        if (list.length > 80) { fail("Maximum 80 photographies par album."); break; }
        const out = [];
        for (const item of list) {
          const src = String(item?.src ?? "").trim();
          if (!URL_RE.test(src) || src.length > 500) { fail("Une des adresses d'image est invalide."); break; }
          out.push({ src, alt: String(item?.alt ?? "").trim().slice(0, 160) });
        }
        data[key] = out;
        break;
      }

      case "videos": {
        const list = Array.isArray(raw) ? raw : [];
        if (list.length > 30) { fail("Maximum 30 vidéos."); break; }
        const out = [];
        for (const item of list) {
          const url = String(item?.url ?? "").trim();
          if (!/^https:\/\/[^\s]+$/.test(url) || url.length > 500) { fail("Une adresse de vidéo est invalide : elle doit commencer par https://"); break; }
          out.push({ title: String(item?.title ?? "").trim().slice(0, 120), url });
        }
        data[key] = out;
        break;
      }

      case "lines": {
        const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split("\n") : [];
        const out = list.map((x) => String(x).trim()).filter(Boolean);
        if (out.length > 40 || out.some((x) => x.length > 120)) fail("Liste trop longue.");
        else data[key] = out;
        break;
      }

      case "password":
        break; // géré par le code des comptes

      default: {
        // text, textarea
        if (isEmpty(raw)) { if (f.required) fail(REQUIRED); data[key] = ""; break; }
        if (typeof raw !== "string" && typeof raw !== "number") { fail("Valeur invalide."); break; }
        const r = text(f, raw);
        if (r.error) fail(r.error);
        else data[key] = r.value;
      }
    }
  }

  if (Object.keys(errors).length) throw new HttpError(422, "Certains champs sont à corriger.", { errors });
  return data;
}

/* ---------- Formulaires publics (inscription, contact) ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+0-9 ().\-]{6,20}$/;

export function validateRegistration(input) {
  const errors = {};
  const year = new Date().getFullYear();
  const s = (k, max, req) => {
    const v = String(input[k] ?? "").trim();
    if (req && !v) errors[k] = REQUIRED;
    else if (v.length > max) errors[k] = `Maximum ${max} caractères.`;
    return v;
  };
  const data = {
    firstName: s("firstName", 80, true),
    lastName: s("lastName", 80, true),
    category: s("category", 40, true),
    position: s("position", 40, false),
    guardianName: s("guardianName", 120, true),
    guardianPhone: s("guardianPhone", 20, true),
    email: s("email", 160, false),
    message: s("message", 1000, false),
  };
  const birth = Number(input.birthYear);
  if (!Number.isInteger(birth) || birth < year - 25 || birth > year - 4) errors.birthYear = "Année de naissance invalide.";
  data.birthYear = birth;
  if (data.guardianPhone && !PHONE_RE.test(data.guardianPhone)) errors.guardianPhone = "Numéro de téléphone invalide.";
  if (data.email && !EMAIL_RE.test(data.email)) errors.email = "Adresse e-mail invalide.";
  if (input.consent !== true) errors.consent = "Cette case doit être cochée.";
  if (Object.keys(errors).length) throw new HttpError(422, "Certains champs sont à corriger.", { errors });
  return data;
}

export function validateContact(input) {
  const errors = {};
  const s = (k, max, req) => {
    const v = String(input[k] ?? "").trim();
    if (req && !v) errors[k] = REQUIRED;
    else if (v.length > max) errors[k] = `Maximum ${max} caractères.`;
    return v;
  };
  const data = { name: s("name", 120, true), email: s("email", 160, false), subject: s("subject", 160, true), message: s("message", 2000, true) };
  if (data.email && !EMAIL_RE.test(data.email)) errors.email = "Adresse e-mail invalide.";
  if (Object.keys(errors).length) throw new HttpError(422, "Certains champs sont à corriger.", { errors });
  return data;
}
