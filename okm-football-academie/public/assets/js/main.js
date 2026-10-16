import { CONFIG } from "./config.js";
import { getSettings } from "./api.js";
import { initLayout } from "./layout.js";
import { initForms } from "./forms.js";

const PAGES = ["home", "academie", "equipes", "joueurs", "actualites", "actualite", "matchs", "palmares", "galerie", "partenaires"];
const page = document.body.dataset.page;

/** Réglages modifiables depuis l'administration. Un délai court évite de retarder l'affichage si le réseau est lent. */
async function loadSettings() {
  try {
    const s = await Promise.race([getSettings(), new Promise((_, no) => setTimeout(no, 2500))]);
    if (s.email) CONFIG.email = s.email;
    if (s.facebookName) CONFIG.facebookName = s.facebookName;
    if (s.facebookUrl) CONFIG.facebookUrl = s.facebookUrl;
    return s;
  } catch {
    return {};
  }
}

const settings = await loadSettings();
initLayout();
initForms();

const lead = document.getElementById("hero-lead");
if (lead && settings.heroLead) lead.textContent = settings.heroLead;

if (PAGES.includes(page)) {
  import(`./pages/${page}.js`)
    .then((mod) => mod.init(settings))
    .catch((err) => console.error(`Erreur sur la page « ${page} » :`, err));
}
