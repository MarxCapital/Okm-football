// Applique le thème choisi (clair ou sombre) AVANT l'affichage, pour éviter un clignotement.
// Fichier externe obligatoire : la CSP interdit les scripts en ligne.
(function () {
  var mode = "dark";
  try { if (localStorage.getItem("okm-theme") === "light") mode = "light"; } catch (e) { /* stockage indisponible : sombre par défaut */ }
  document.documentElement.setAttribute("data-theme", mode);
})();
