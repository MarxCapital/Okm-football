// Outils d'affichage partagés. Tout le contenu dynamique passe par textContent :
// aucune donnée n'est injectée comme HTML.
import { CONFIG } from "./config.js";

/* ---------- Construction du DOM ---------- */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const ICONS = {
  trophy:
    '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 6h20v12a10 10 0 0 1-20 0V6z"/><path d="M14 10H6v4a8 8 0 0 0 8 8M34 10h8v4a8 8 0 0 1-8 8"/><path d="M24 28v8M18 36h12v6H18z"/></svg>',
  former:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 3v18M4 7.5l8 4.5 8-4.5"/></svg>',
  eduquer:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 9l9-5 9 5-9 5zM7 11.5V16c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.5"/></svg>',
  orienter:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v18M12 3l6 5H6zM5 21h14"/></svg>',
  menu:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 5l14 14M19 5L5 19"/></svg>',
};
export function icon(name) {
  const tpl = document.createElement("template");
  tpl.innerHTML = ICONS[name] || "";
  return tpl.content.firstElementChild;
}

/* ---------- Sécurité des liens et images ---------- */
export function safeUrl(url) {
  if (typeof url !== "string") return "";
  const u = url.trim();
  return /^(https:\/\/|\/(?!\/))/.test(u) ? u : "";
}

/* ---------- Dates (fuseau de Brazzaville) ---------- */
const dtf = (opts) => new Intl.DateTimeFormat(CONFIG.locale, { timeZone: CONFIG.timeZone, ...opts });
const toDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function fmtDateLong(iso) {
  const d = toDate(iso);
  return d ? cap(dtf({ weekday: "long", day: "numeric", month: "long" }).format(d)) : "Date à confirmer";
}
export function fmtDateFull(iso) {
  const d = toDate(iso);
  return d ? dtf({ day: "numeric", month: "long", year: "numeric" }).format(d) : "";
}
export function fmtDateShort(iso) {
  const d = toDate(iso);
  return d ? dtf({ day: "numeric", month: "short" }).format(d) : "";
}
export function fmtTime(iso) {
  const d = toDate(iso);
  if (!d) return "";
  const parts = dtf({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${Number(hh)} h ${mm}`;
}
export function dayNum(iso) {
  const d = toDate(iso);
  return d ? dtf({ day: "numeric" }).format(d) : "–";
}
export function monthShort(iso) {
  const d = toDate(iso);
  return d ? dtf({ month: "short" }).format(d).replace(".", "") : "";
}

/* ---------- Matchs ---------- */
const STATUS = {
  programme: ["Programmé", "chip--green"],
  encours: ["En cours", "chip--amber"],
  termine: ["Terminé", "chip--ink"],
  reporte: ["Reporté", "chip--red"],
  annule: ["Annulé", "chip--red"],
};
export const statusLabel = (s) => (STATUS[s] || [s || "", "chip--muted"])[0];
export const statusClass = (s) => (STATUS[s] || [s || "", "chip--muted"])[1];

export function outcome(m) {
  const a = Number(m.ourScore);
  const b = Number(m.theirScore);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a > b) return { letter: "V", label: "Victoire", cls: "chip--green" };
  if (a < b) return { letter: "D", label: "Défaite", cls: "chip--red" };
  return { letter: "N", label: "Match nul", cls: "chip--muted" };
}

export function matchRow(m) {
  const done = m.status === "termine";
  const sub = [fmtTime(m.datetime), m.home === false ? "Extérieur" : "Domicile", m.venue, m.competition].filter(Boolean).join(" · ");
  const res = outcome(m);
  const tail = done
    ? h(
        "div",
        { class: "mrow-tail" },
        h("span", { class: "score", "aria-label": `Score ${m.ourScore} à ${m.theirScore}` }, `${m.ourScore} – ${m.theirScore}`),
        res && h("span", { class: `chip ${res.cls}`, title: res.label }, res.letter),
      )
    : h("div", { class: "mrow-tail" }, h("span", { class: `chip ${statusClass(m.status)}` }, `${m.category} · ${statusLabel(m.status)}`));
  const scorers = done && Array.isArray(m.scorers) && m.scorers.length ? h("p", { class: "scorers" }, `Buteurs : ${m.scorers.join(", ")}`) : null;
  return h(
    "div",
    { class: "mrow" },
    h("div", { class: "date" }, h("span", { class: "date-d disp" }, dayNum(m.datetime)), h("span", { class: "date-m" }, monthShort(m.datetime))),
    h(
      "div",
      {},
      h("p", { class: "mrow-title" }, `${CONFIG.siteName} contre ${m.opponent}`),
      h("p", { class: "small muted" }, done ? `${m.category} · ${sub}` : sub),
      scorers,
      done && m.notes ? h("p", { class: "small muted" }, m.notes) : null,
    ),
    tail,
  );
}

/* ---------- Images ---------- */
export function media(src, alt, ratioClass, label) {
  const url = safeUrl(src);
  if (url) return h("img", { src: url, alt: alt || "", class: ratioClass, loading: "lazy", decoding: "async" });
  return h("div", { class: `ph ${ratioClass}`, role: "img", "aria-label": alt || label || "Image à venir" }, label || "Image");
}

/* ---------- Cartes ---------- */
const articleUrl = (n) => `/actualite?slug=${encodeURIComponent(n.slug)}`;

export function newsCard(n) {
  return h(
    "a",
    { class: "news-card", href: articleUrl(n) },
    media(n.image, n.imageAlt || "", "ratio-1610", "Image principale"),
    h(
      "div",
      { class: "body" },
      h("div", { class: "card-meta" }, h("span", { class: "chip chip--green" }, n.category || "Actualité"), h("span", {}, fmtDateFull(n.publishedAt) || "[Date de publication]")),
      h("h3", {}, n.title),
      n.excerpt ? h("p", { class: "small muted" }, n.excerpt) : null,
    ),
  );
}

export function teamCard(t) {
  const archived = t.status === "archive";
  return h(
    "a",
    { class: "team-card", href: `/joueurs?categorie=${encodeURIComponent(t.category)}` },
    media(t.photo, `Photo de l'équipe ${t.category}`, "ratio-43", "Photo officielle de l'équipe"),
    h("div", { class: "name-row" }, h("span", { class: "cat disp" }, t.category), h("span", { class: `chip ${archived ? "chip--muted" : "chip--green"}` }, archived ? "Archivée" : "Active")),
    h("p", { class: "muted" }, [`Saison ${t.season || "[saison]"}`, t.coachPublic && t.coach ? `Entraîneur : ${t.coach}` : null].filter(Boolean).join(" · ")),
    t.description ? h("p", { class: "small" }, t.description) : null,
  );
}

export function trophyCard(t) {
  const photo = safeUrl(t.photo) ? h("img", { src: safeUrl(t.photo), alt: "", class: "ratio-43", loading: "lazy", decoding: "async" }) : null;
  return h(
    "div",
    { class: "cup" },
    photo,
    h(
      "div",
      { class: "cup-body" },
      photo ? null : icon("trophy"),
      h("p", { class: "name disp" }, t.name),
      h("p", {}, [t.competition, t.year].filter(Boolean).join(" · ")),
      h("div", { class: "row" }, t.category && h("span", { class: "chip chip--gold" }, t.category), t.result && h("span", { class: "chip chip--ink" }, t.result)),
      t.description ? h("p", {}, t.description) : null,
    ),
  );
}

/* ---------- Vidéos ---------- */
export function youtubeId(url) {
  const m = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})(?:[?&#].*)?$/.exec(url || "");
  return m ? m[1] : null;
}

export function videoCard(v, { heading = "h3", showText = true } = {}) {
  const url = safeUrl(v.url);
  const yt = youtubeId(url);
  const poster = safeUrl(v.poster);
  let frame;
  if (yt) {
    frame = h("iframe", { src: `https://www.youtube-nocookie.com/embed/${yt}`, title: v.title, loading: "lazy", allow: "encrypted-media; picture-in-picture", allowfullscreen: true, referrerpolicy: "strict-origin-when-cross-origin" });
  } else if (url) {
    frame = h("video", { controls: true, preload: "metadata", playsinline: true, poster: poster || null, "aria-label": v.title }, h("source", { src: url }), "Votre navigateur ne peut pas lire cette vidéo.");
  } else {
    frame = h("div", { class: "ph" }, "Vidéo à venir");
  }
  return h(
    "article",
    { class: "video-card" },
    h("div", { class: "video-frame" }, frame),
    showText ? h(heading, {}, v.title) : null,
    showText && v.description ? h("p", { class: "small muted" }, v.description) : null,
    showText && (v.date || v.category) ? h("p", { class: "xsmall muted" }, [fmtDateFull(v.date), v.category].filter(Boolean).join(" · ")) : null,
  );
}

export function logoTile(p) {
  const url = safeUrl(p.logo);
  const inner = url ? h("img", { src: url, alt: p.name, loading: "lazy", decoding: "async" }) : h("span", {}, p.name);
  const link = safeUrl(p.website);
  return link ? h("a", { class: "logo-tile", href: link, target: "_blank", rel: "noopener noreferrer", "aria-label": `${p.name} (nouvel onglet)` }, inner) : h("div", { class: "logo-tile" }, inner);
}

export function playerCard(p) {
  const initials = (p.publicName || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const photo = safeUrl(p.photo)
    ? h("img", { src: safeUrl(p.photo), alt: `Photo de ${p.publicName}`, class: "ratio-43", loading: "lazy", decoding: "async" })
    : h("div", { class: "ph ratio-43 initials", role: "img", "aria-label": `Photo de ${p.publicName} à venir` }, initials);
  const s = p.stats || {};
  const stats = ["matches", "goals", "assists"].some((k) => Number.isFinite(Number(s[k])))
    ? h(
        "dl",
        { class: "stats" },
        h("div", {}, h("dt", {}, "Matchs"), h("dd", {}, String(s.matches ?? "–"))),
        h("div", {}, h("dt", {}, "Buts"), h("dd", {}, String(s.goals ?? "–"))),
        h("div", {}, h("dt", {}, "Passes"), h("dd", {}, String(s.assists ?? "–"))),
      )
    : null;
  return h(
    "article",
    { class: "player-card" },
    photo,
    h(
      "div",
      { class: "body" },
      h("div", { class: "row" }, h("span", { class: "chip chip--green" }, p.category), p.position && h("span", { class: "chip chip--muted" }, p.position)),
      h("h3", {}, p.publicName),
      p.foot ? h("p", { class: "small muted" }, `Pied : ${p.foot}`) : null,
      stats,
    ),
  );
}

/* ---------- États et remplissage ---------- */
export function fill(target, items, render, empty = "Rien à afficher pour le moment.") {
  if (!target) return;
  target.replaceChildren();
  target.removeAttribute("aria-busy");
  if (items === null) {
    target.append(h("p", { class: "state state--err", role: "alert" }, "Ce contenu n'a pas pu être chargé. Réessayez dans un instant."));
    return;
  }
  if (!items.length) {
    target.append(h("p", { class: "state" }, empty));
    return;
  }
  items.forEach((item) => target.append(render(item)));
}

export function exampleNotice(target, items) {
  if (!target || !Array.isArray(items) || !items.some((i) => i && i.example)) return;
  target.before(h("p", { class: "notice-example" }, "Contenu d'exemple. Il sera remplacé par les informations de l'académie."));
}

/* ---------- Contrôles ---------- */
export function pillBar(label, options, current, onChange) {
  const bar = h("div", { class: "pillbar", role: "group", "aria-label": label });
  const draw = (value) => {
    bar.replaceChildren(
      ...options.map(({ value: v, text }) =>
        h("button", { type: "button", class: "pill", "aria-pressed": String(v === value), onclick: () => { onChange(v); draw(v); } }, text),
      ),
    );
  };
  draw(current);
  return bar;
}

export function selectField(id, label, options, current, onChange) {
  const select = h("select", { id, class: "select", onchange: (e) => onChange(e.target.value) }, options.map(({ value, text }) => h("option", { value, selected: value === current }, text)));
  return h("div", { class: "field" }, h("label", { for: id }, label), select);
}

export const uniq = (arr) => [...new Set(arr.filter(Boolean))];
