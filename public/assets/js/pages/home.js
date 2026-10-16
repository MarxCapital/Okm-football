// Page d'accueil. Les données viennent des mêmes collections qu'avant (getCollection) ;
// rien n'est inventé : une section sans donnée affiche un état sobre ou disparaît.
import { getCollection } from "../api.js";
import { CONFIG } from "../config.js";
import { h, fill, safeUrl, fmtDateFull, fmtDateLong, fmtTime, trophyCard, playerCard, logoTile, videoCard } from "../ui.js";

const value = (r) => (r.status === "fulfilled" ? r.value : null);
const byDate = (dir) => (a, b) => dir * (new Date(a.datetime) - new Date(b.datetime));
const real = (list) => (list || []).filter((x) => x && !x.example);
// Ignore les textes de remplissage du type « [Présentation de l'équipe.] ».
const clean = (s) => { const t = String(s ?? "").trim(); return t && !/^\[.*\]$/.test(t) ? t : ""; };
const clip = (s, n) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, "")}…` : s);
const SHORT = CONFIG.siteName.replace(" Football Académie", "");

/* ---------- Apparition au défilement ---------- */
let observer;
function reveal(root = document) {
  const els = [...root.querySelectorAll(".reveal:not(.is-in)")];
  if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("is-in")); return; }
  observer ??= new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); observer.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  els.forEach((e) => observer.observe(e));
}

const showIf = (section, ok) => { if (section) { section.hidden = !ok; if (ok) reveal(section); } };
const pitch = () => h("div", { class: "ph-pitch", role: "img", "aria-label": "Terrain de football" });
const photoEl = (src, alt, cls) => h("img", { class: cls || null, src, alt: alt || "", loading: "lazy", decoding: "async", onerror: (e) => e.target.remove() });

/* ---------- Hero ---------- */
function renderHero(settings) {
  const box = document.getElementById("hx-media");
  const src = safeUrl(settings?.heroImage);
  if (box && src) box.append(h("img", { class: "hx-photo", src, alt: "", width: "1600", height: "900", fetchpriority: "high", decoding: "async", onerror: (e) => e.target.remove() }));
}

/* ---------- Bandeau : chiffres seulement s'ils sont réels ---------- */
function renderStats(box, { cats, results, trophies }) {
  if (!box) return;
  const items = [[real(cats).length, "catégories"], [real(results).length, "matchs enregistrés"], [real(trophies).length, "trophées au palmarès"]].filter(([n]) => n > 0);
  if (items.length < 2) return;
  box.replaceChildren(...items.map(([n, label]) => h("div", { class: "stat" }, h("strong", {}, String(n)), h("span", {}, label))));
  box.hidden = false;
}

/* ---------- L'académie ---------- */
function renderAcademy(settings, photo) {
  const text = document.getElementById("academy-text");
  const mission = (settings.academieMission || []).map(clean).filter(Boolean);
  if (text && mission.length) text.replaceChildren(...mission.slice(0, 2).map((t) => h("p", {}, t)));
  const media = document.getElementById("academy-media");
  if (media && photo) media.replaceChildren(photoEl(photo.src, photo.alt || "Les jeunes joueurs de l'académie"));
}

/* ---------- Catégories ---------- */
function categoryTile(c, teams) {
  const team = teams.find((t) => t.category === c.name && t.status !== "archive") || teams.find((t) => t.category === c.name);
  const photo = safeUrl(team?.photo);
  const desc = clean(c.description) || clean(team?.description);
  const season = clean(c.season);
  return h(
    "a",
    { class: "tile reveal", href: `/joueurs?categorie=${encodeURIComponent(c.name)}` },
    photo ? h("img", { class: "tile-img", src: photo, alt: "", loading: "lazy", decoding: "async", onerror: (e) => e.target.remove() }) : h("div", { class: "ph-pitch" }),
    h("div", { class: "tile-shade" }),
    h("div", { class: "tile-body" }, season && h("span", { class: "tile-season" }, `Saison ${season}`), h("span", { class: "tile-name" }, c.name), desc && h("p", { class: "tile-desc" }, desc), h("span", { class: "tile-go" }, "Voir les joueurs")),
  );
}

/* ---------- Actualités ---------- */
function newsTile(n) {
  const img = safeUrl(n.image);
  const body = clean(n.excerpt) || clean(Array.isArray(n.content) ? n.content[0] : n.content);
  const date = fmtDateFull(n.publishedAt);
  return h(
    "a",
    { class: "ncard reveal", href: `/actualite?slug=${encodeURIComponent(n.slug)}` },
    h("div", { class: "ncard-img" }, img ? photoEl(img, n.imageAlt || "") : h("div", { class: "ph-pitch" })),
    h("div", { class: "ncard-body" }, h("div", { class: "ncard-meta" }, h("span", { class: "ncard-cat" }, n.category || "Actualité"), date && h("span", {}, date)), h("h3", {}, n.title), body && h("p", { class: "ncard-ex" }, clip(body, 160)), h("span", { class: "ncard-more" }, "Lire l'article →")),
  );
}

/* ---------- Galerie et visionneuse ---------- */
let lightbox;
function getLightbox() {
  if (lightbox) return lightbox;
  const img = h("img", { alt: "" });
  const cap = h("figcaption", { class: "lb-cap" });
  const close = h("button", { type: "button", class: "lb-btn lb-close", "aria-label": "Fermer" }, "×");
  const prev = h("button", { type: "button", class: "lb-btn lb-prev", "aria-label": "Photo précédente" }, "‹");
  const next = h("button", { type: "button", class: "lb-btn lb-next", "aria-label": "Photo suivante" }, "›");
  const dlg = h("dialog", { class: "lb", "aria-label": "Visionneuse de photos" }, close, prev, next, h("figure", { class: "lb-fig" }, img, cap));
  document.body.append(dlg);
  const state = { items: [], i: 0 };
  const draw = () => {
    const it = state.items[state.i];
    img.src = it.src;
    img.alt = it.alt || "";
    cap.replaceChildren(it.alt ? `${it.alt} · ` : "", h("a", { href: `/galerie#${encodeURIComponent(it.album)}` }, "Voir l'album"));
    prev.hidden = next.hidden = state.items.length < 2;
  };
  const go = (d) => { state.i = (state.i + d + state.items.length) % state.items.length; draw(); };
  close.addEventListener("click", () => dlg.close());
  prev.addEventListener("click", () => go(-1));
  next.addEventListener("click", () => go(1));
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); });
  lightbox = { open(items, i) { state.items = items; state.i = i; draw(); if (dlg.showModal) dlg.showModal(); else window.open(items[i].src, "_blank", "noopener"); } };
  return lightbox;
}

function renderMosaic(box, photos) {
  box.replaceChildren();
  box.removeAttribute("aria-busy");
  if (!photos.length) { box.append(h("p", { class: "state" }, "Les photos de l'académie seront publiées prochainement.")); return; }
  const shown = photos.slice(0, 7);
  box.classList.toggle("mosaic--few", shown.length < 5);
  shown.forEach((p, i) => box.append(h("button", { type: "button", class: "mo reveal", "aria-label": `Agrandir la photo${p.alt ? ` : ${p.alt}` : ""}`, onclick: () => getLightbox().open(shown, i) }, photoEl(p.src, p.alt || ""))));
  reveal(box);
}

function renderVideo(box, videos) {
  if (!videos || !videos.length) return;
  const v = videos.find((x) => x.featured) || videos[0];
  box.replaceChildren(videoCard(v, { heading: "h3", showText: false }), h("div", { class: "gal-video-copy" }, h("p", { class: "eyebrow" }, "À la une"), h("h3", {}, v.title), v.description && h("p", {}, v.description), h("a", { class: "more-x", href: "/galerie#videos" }, "Voir toutes les vidéos →")));
  box.hidden = false;
}

/* ---------- Matchs ---------- */
function renderMatches(section, next, last) {
  const box = document.getElementById("home-match");
  if (!box || (!next && !last)) return;
  const panel = (title, ...kids) => h("div", { class: "mpanel reveal" }, h("p", { class: "eyebrow" }, title), ...kids);
  box.replaceChildren(
    panel(
      "Prochain match",
      next
        ? [h("div", { class: "mpanel-meta" }, h("span", { class: "mpanel-chip" }, next.category), next.competition && h("span", {}, next.competition)), h("p", { class: "mpanel-vs" }, h("small", {}, `${SHORT} contre`), next.opponent), h("p", { class: "mpanel-date" }, `${fmtDateLong(next.datetime)} · ${fmtTime(next.datetime)}`, next.venue ? ` · ${next.venue}` : "")]
        : h("p", { class: "mpanel-empty" }, "Aucun match programmé pour le moment."),
    ),
    panel(
      "Dernier résultat",
      last
        ? [h("div", { class: "mpanel-meta" }, h("span", { class: "mpanel-chip" }, last.category), last.competition && h("span", {}, last.competition)), h("div", { class: "mpanel-score", role: "text", "aria-label": `${SHORT} ${last.category} ${last.ourScore} à ${last.theirScore} contre ${last.opponent}` }, h("span", { class: "t" }, `${SHORT} ${last.category}`), h("span", { class: "s" }, `${last.ourScore} – ${last.theirScore}`), h("span", { class: "t" }, last.opponent)), h("p", { class: "mpanel-date" }, fmtDateLong(last.datetime))]
        : h("p", { class: "mpanel-empty" }, "Aucun résultat publié pour le moment."),
    ),
  );
  showIf(section, true);
}

/* ---------- Appel à l'inscription ---------- */
function renderCta(photoSrc, alt) {
  const media = document.getElementById("cta-media");
  if (media && photoSrc) media.append(photoEl(photoSrc, ""));
}

export async function init(settings = {}) {
  document.body.classList.add("has-reveal");
  renderHero(settings);
  reveal();

  const names = ["matches", "news", "categories", "teams", "trophies", "partners", "videos", "albums", "players"];
  const res = await Promise.allSettled(names.map(getCollection));
  const [matches, news, cats, teams, trophies, partners, videos, albums, players] = res.map(value);

  const upcoming = matches && matches.filter((m) => m.status === "programme").sort(byDate(1));
  const results = matches && matches.filter((m) => m.status === "termine" && m.validated !== false).sort(byDate(-1));

  // Photos réelles de la galerie (réutilisées pour l'académie et l'appel final).
  const photos = (albums || []).flatMap((a) => (a.images || []).map((i) => ({ src: safeUrl(i.src), alt: i.alt || "", album: a.id }))).filter((i) => i.src);
  const covers = (albums || []).map((a) => ({ src: safeUrl(a.cover), alt: a.title || "", album: a.id })).filter((i) => i.src);
  const pool = photos.length ? photos : covers;

  renderStats(document.getElementById("home-stats"), { cats, results, trophies });
  renderAcademy(settings, pool[0]);

  const sortedCats = cats && [...cats].sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
  fill(document.getElementById("home-cats"), sortedCats, (c) => categoryTile(c, teams || []), "Les catégories seront présentées prochainement.");
  const catBox = document.getElementById("home-cats");
  if (sortedCats?.length === 4) catBox.classList.add("tiles--n4");
  if (sortedCats?.length === 2) catBox.classList.add("tiles--n2");
  reveal(catBox);

  const published = news && news.filter((n) => n.status === "publie").sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  fill(document.getElementById("home-news"), published && published.slice(0, 3), newsTile, "Aucune actualité publiée pour le moment.");
  reveal(document.getElementById("home-news"));

  renderMosaic(document.getElementById("home-mosaic"), pool);
  renderVideo(document.getElementById("home-video"), videos);

  renderMatches(document.getElementById("home-match-section"), upcoming?.[0], results?.[0]);

  const pl = players && players.slice(0, 4);
  if (pl?.length) { fill(document.getElementById("home-players"), pl, playerCard); showIf(document.getElementById("home-players-section"), true); }

  const tr = trophies && [...trophies].sort((a, b) => Number(b.year) - Number(a.year)).slice(0, 3);
  if (tr?.length) { fill(document.getElementById("home-trophies"), tr, trophyCard); showIf(document.getElementById("home-trophies-section"), true); }

  const pa = partners && partners.filter((p) => p.approved).slice(0, 10);
  if (pa?.length) { fill(document.getElementById("home-partners"), pa, logoTile); showIf(document.getElementById("home-partners-section"), true); }

  const ctaPhoto = pool[1] || pool[0];
  renderCta(ctaPhoto?.src || safeUrl(settings.heroImage));
  reveal();
}
