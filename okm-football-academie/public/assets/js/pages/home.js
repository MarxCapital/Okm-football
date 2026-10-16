import { getCollection } from "../api.js";
import { CONFIG } from "../config.js";
import { h, fill, safeUrl, newsCard, trophyCard, logoTile, videoCard, fmtDateLong, fmtTime } from "../ui.js";

const value = (r) => (r.status === "fulfilled" ? r.value : null);
const byDate = (dir) => (a, b) => dir * (new Date(a.datetime) - new Date(b.datetime));

function renderHeroPhoto(target, settings) {
  if (!target) return;
  const src = safeUrl(settings?.heroImage);
  target.replaceWith(src ? h("img", { class: "hero-photo", src, alt: "Les jeunes joueurs de l'académie à l'entraînement", width: "1600", height: "1200", fetchpriority: "high", decoding: "async" }) : h("div", { class: "hero-photo ph", role: "img", "aria-label": "Photo de l'académie" }, "Photo de l'accueil"));
}

function renderMatch(target, next, last) {
  target.replaceChildren();
  target.removeAttribute("aria-busy");
  target.append(h("p", { class: "eyebrow" }, "Prochain match"));
  if (next) {
    target.append(
      h("div", { class: "row" }, h("span", { class: "chip chip--ink" }, next.category), next.competition && h("span", { class: "small muted" }, next.competition)),
      h("p", { class: "disp opp" }, `${CONFIG.siteName.replace(" Football Académie", "")} contre`, h("br"), h("span", { class: "opp-sub" }, next.opponent)),
      h("p", { class: "muted" }, `${fmtDateLong(next.datetime)} · ${fmtTime(next.datetime)}`, next.venue ? h("br") : null, next.venue || null),
    );
  } else {
    target.append(h("p", { class: "muted" }, "Aucun match programmé pour le moment."));
  }
  target.append(h("hr"), h("p", { class: "eyebrow" }, "Dernier résultat"));
  if (last) target.append(h("p", { class: "result" }, `OKM ${last.category} ${last.ourScore} – ${last.theirScore} ${last.opponent}`));
  else target.append(h("p", { class: "muted" }, "Aucun résultat publié pour le moment."));
  target.append(h("a", { class: "more", href: "/matchs" }, "Tous les matchs →"));
}

function renderVideo(target, videos) {
  target.replaceChildren();
  target.removeAttribute("aria-busy");
  if (videos === null) { target.append(h("p", { class: "state state--err", role: "alert" }, "Ce contenu n'a pas pu être chargé. Réessayez dans un instant.")); return; }
  if (!videos.length) { target.append(h("p", { class: "state" }, "Les vidéos seront publiées prochainement.")); return; }
  const v = videos.find((x) => x.featured) || videos[0];
  target.append(videoCard(v, { heading: "h3", showText: false }), h("div", { class: "stack" }, h("p", { class: "eyebrow" }, "À la une"), h("h3", { class: "disp h3" }, v.title), v.description && h("p", { class: "muted" }, v.description), h("a", { class: "more", href: "/galerie#videos" }, "Voir toutes les vidéos →")));
}

export async function init(settings = {}) {
  renderHeroPhoto(document.getElementById("hero-photo"), settings);

  const [matchesR, newsR, catsR, trophiesR, partnersR, videosR, albumsR] = await Promise.allSettled(["matches", "news", "categories", "trophies", "partners", "videos", "albums"].map(getCollection));
  const matches = value(matchesR);
  const upcoming = matches && matches.filter((m) => m.status === "programme").sort(byDate(1));
  const results = matches && matches.filter((m) => m.status === "termine" && m.validated !== false).sort(byDate(-1));
  renderMatch(document.getElementById("home-match"), upcoming?.[0], results?.[0]);

  const cats = value(catsR);
  fill(
    document.getElementById("home-cats"),
    cats && [...cats].sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true })),
    (c) => h("a", { class: "cat-card", href: `/joueurs?categorie=${encodeURIComponent(c.name)}` }, h("span", { class: "cat", }, c.name), h("p", {}, c.season ? `Saison ${c.season}` : "Voir les joueurs")),
    "Les catégories seront présentées prochainement.",
  );

  const news = value(newsR);
  const published = news && news.filter((n) => n.status === "publie").sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  fill(document.getElementById("home-news"), published && published.slice(0, 4), newsCard, "Aucune actualité publiée pour le moment.");

  renderVideo(document.getElementById("home-video"), value(videosR));

  const albums = value(albumsR);
  const strip = document.getElementById("home-strip");
  const photos = (albums || []).flatMap((a) => (a.images || []).map((i) => ({ ...i, album: a.id }))).filter((i) => safeUrl(i.src)).slice(0, 4);
  photos.forEach((p) => strip.append(h("a", { href: `/galerie#${encodeURIComponent(p.album)}`, "aria-label": `${p.alt || "Photo"} (voir l'album)` }, h("img", { src: safeUrl(p.src), alt: p.alt || "", loading: "lazy", decoding: "async" }))));

  const trophies = value(trophiesR);
  const sorted = trophies && [...trophies].sort((a, b) => Number(b.year) - Number(a.year));
  fill(document.getElementById("home-trophies"), sorted && sorted.slice(0, 3), trophyCard, "Le palmarès sera publié prochainement.");

  const partners = value(partnersR);
  fill(document.getElementById("home-partners"), partners && partners.filter((p) => p.approved).slice(0, 5), logoTile, "Les partenaires seront présentés prochainement.");
}

