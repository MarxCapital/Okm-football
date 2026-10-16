// Formulaires (inscription, contact) : validation, anti-robots, envoi.
import { CONFIG } from "./config.js";
import { getCollection, submitForm } from "./api.js";
import { uniq } from "./ui.js";

const MESSAGES = {
  valueMissing: "Ce champ est obligatoire.",
  typeMismatch: "Le format saisi n'est pas valide.",
  patternMismatch: "Le format saisi n'est pas valide.",
  rangeUnderflow: "La valeur est trop basse.",
  rangeOverflow: "La valeur est trop haute.",
  tooLong: "Le texte est trop long.",
};

function errorText(field) {
  if (field.dataset.msg) return field.dataset.msg;
  if (field.validity.valueMissing && field.type === "checkbox") return "Cette case doit être cochée.";
  if (field.validity.typeMismatch && field.type === "email") return "Saisissez une adresse e-mail valide.";
  for (const key of Object.keys(MESSAGES)) if (field.validity[key]) return MESSAGES[key];
  return field.validationMessage || "Valeur invalide.";
}

function setError(field, message) {
  const slot = field.form.querySelector(`[data-error-for="${field.name}"]`);
  if (slot) slot.textContent = message || "";
  if (message) field.setAttribute("aria-invalid", "true");
  else field.removeAttribute("aria-invalid");
}

function validate(form) {
  let first = null;
  for (const field of form.elements) {
    if (!field.name || field.name === "website" || field.disabled) continue;
    if (field.checkValidity()) { setError(field, ""); continue; }
    setError(field, errorText(field));
    first ||= field;
  }
  if (first) first.focus();
  return !first;
}

function payloadOf(form) {
  const data = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (key === "website" || key === "cf-turnstile-response") continue;
    data[key] = typeof value === "string" ? value.trim() : value;
  }
  for (const box of form.querySelectorAll('input[type="checkbox"]')) data[box.name] = box.checked;
  const token = form.querySelector('[name="cf-turnstile-response"]')?.value;
  if (token) data.turnstileToken = token;
  data.submittedAt = new Date().toISOString();
  return data;
}

function loadTurnstile(form) {
  const slot = form.querySelector(".turnstile");
  if (!slot || !CONFIG.turnstileSiteKey) return;
  const render = () => window.turnstile?.render(slot, { sitekey: CONFIG.turnstileSiteKey, language: "fr" });
  if (window.turnstile) return render();
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  s.async = true;
  s.onload = render;
  document.head.append(s);
}

async function fillCategories() {
  const selects = document.querySelectorAll("select[data-categories]");
  if (!selects.length) return;
  try {
    const categories = await getCollection("categories");
    const cats = uniq(categories.map((c) => c.name));
    for (const select of selects) {
      for (const cat of cats) select.append(new Option(cat, cat));
      select.append(new Option("Je ne sais pas encore", "a-definir"));
    }
  } catch {
    for (const select of selects) select.append(new Option("Je ne sais pas encore", "a-definir"));
  }
}

function setupBirthYear(form) {
  const input = form.querySelector('input[name="birthYear"]');
  if (!input) return;
  const year = new Date().getFullYear();
  input.min = String(year - 25);
  input.max = String(year - 4);
}

function bind(form) {
  const status = form.querySelector("[data-status]");
  const button = form.querySelector('button[type="submit"]');
  setupBirthYear(form);
  loadTurnstile(form);

  form.addEventListener("input", (e) => {
    if (e.target.name && e.target.getAttribute("aria-invalid") === "true" && e.target.checkValidity()) setError(e.target, "");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.hidden = true;
    if (form.elements.website?.value) return; // champ piège rempli : robot probable
    if (!validate(form)) return;
    if (CONFIG.turnstileSiteKey && !form.querySelector('[name="cf-turnstile-response"]')?.value) {
      show(status, "err", "Confirmez d'abord la vérification anti-robots, puis envoyez à nouveau.");
      return;
    }
    button.disabled = true;
    button.dataset.label = button.textContent;
    button.textContent = "Envoi en cours…";
    try {
      const result = await submitForm(form.dataset.endpoint, payloadOf(form));
      if (result.demo) {
        show(status, "info", "Mode démonstration : le formulaire fonctionne, mais rien n'est enregistré tant que le serveur n'est pas branché.");
      } else {
        show(status, "ok", form.dataset.success || "Votre message a bien été envoyé.");
        form.reset();
        window.turnstile?.reset();
      }
    } catch (err) {
      let first = null;
      for (const [name, message] of Object.entries(err.errors || {})) {
        const field = form.elements[name];
        if (field) { setError(field, message); first ||= field; }
      }
      if (first) first.focus();
      show(status, "err", err.status && err.status < 500 ? err.message : "L'envoi a échoué. Vérifiez votre connexion et réessayez.");
    } finally {
      button.disabled = false;
      button.textContent = button.dataset.label;
    }
  });
}

function show(node, kind, text) {
  node.className = `alert alert--${kind}`;
  node.textContent = text;
  node.hidden = false;
  node.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

export function initForms() {
  const forms = document.querySelectorAll("form[data-endpoint]");
  if (!forms.length) return;
  forms.forEach(bind);
  fillCategories();
}
