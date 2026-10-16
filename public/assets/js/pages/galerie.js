import { getCollection } from "../api.js";
import { h, fill, exampleNotice, media, safeUrl, fmtDateFull, videoCard } from "../ui.js";

export async function init() {
  const list = document.getElementById("albums-list");
  const videosSection = document.getElementById("videos");
  const view = document.getElementById("album-view");
  let albums;
  try {
    albums = await getCollection("albums");
  } catch {
    fill(list, null, () => h("div"));
    return;
  }

  const card = (a) =>
    h(
      "button",
      { type: "button", class: "album-card", onclick: () => { location.hash = a.id; } },
      media(a.cover, a.title, "ratio-43", "Couverture de l'album"),
      h("h3", {}, a.title),
      h("p", { class: "small muted" }, [fmtDateFull(a.date), a.event].filter(Boolean).join(" · ")),
    );

  const renderAlbum = (a) => {
    const images = Array.isArray(a.images) ? a.images : [];
    const videos = Array.isArray(a.videos) ? a.videos : [];
    view.replaceChildren(
      h("button", { type: "button", class: "more", onclick: () => { location.hash = ""; } }, "← Tous les albums"),
      h("h2", { class: "disp h2" }, a.title),
      h("p", { class: "muted" }, [fmtDateFull(a.date), a.event, a.category].filter(Boolean).join(" · ")),
      a.description && h("p", { class: "prose" }, a.description),
      images.length
        ? h("div", { class: "media-grid" }, images.map((img) => {
            const url = safeUrl(img.src);
            return url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer", "aria-label": `${img.alt || "Photo"} (nouvel onglet)` }, h("img", { src: url, alt: img.alt || "", class: "ratio-43", loading: "lazy", decoding: "async" })) : null;
          }))
        : h("p", { class: "state" }, "Les photographies de cet album seront ajoutées prochainement."),
      videos.length
        ? h("div", { class: "row" }, videos.map((v) => safeUrl(v.url) && h("a", { class: "btn btn--outline", href: safeUrl(v.url), target: "_blank", rel: "noopener noreferrer" }, `Voir la vidéo : ${v.title || "vidéo"}`)))
        : null,
    );
  };

  const route = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const album = albums.find((a) => a.id === id);
    list.hidden = Boolean(album);
    if (videosSection) videosSection.hidden = Boolean(album);
    view.hidden = !album;
    if (album) {
      renderAlbum(album);
      document.title = `${album.title} | Galerie | OKM Football Académie`;
      view.scrollIntoView({ block: "start" });
    } else {
      document.title = "Galerie | OKM Football Académie";
    }
  };

  fill(list, albums, card, "Aucun album pour le moment.");
  getCollection("videos")
    .then((videos) => fill(document.getElementById("videos-list"), [...videos].sort((a, b) => String(b.date).localeCompare(String(a.date))), (v) => videoCard(v), "Aucune vidéo pour le moment."))
    .catch(() => fill(document.getElementById("videos-list"), null, () => h("div")));
  exampleNotice(list, albums);
  window.addEventListener("hashchange", route);
  route();
}
