// Configuration centrale du site. À modifier ici, nulle part ailleurs.
export const CONFIG = {
  siteName: "OKM Football Académie",
  motto: "Former, éduquer et orienter",
  email: "okmfootballaca@gmail.com",
  facebookName: "OKM football Académie",
  facebookUrl: "", // Collez ici l'adresse complète de la page Facebook (https://...).
  siteUrl: "https://okmfootball.digitsolution.org",
  location: "Brazzaville, République du Congo",
  locale: "fr-FR",
  timeZone: "Africa/Brazzaville",

  // Backend (Cloudflare Pages Functions + D1) : le site lit GET {apiBase}/{collection} et envoie les formulaires en POST.
  // Mettre "" pour revenir au mode démonstration (fichiers /data/*.json, formulaires sans enregistrement).
  apiBase: "/api",

  // Clé publique Cloudflare Turnstile (anti-robots). Vide = désactivé.
  turnstileSiteKey: "",

  // Barème du bilan sportif (page Matchs et résultats).
  points: { win: 3, draw: 1, loss: 0 },

  newsPerPage: 6,
};
