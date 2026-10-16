// Schéma unique, partagé par l'interface admin (navigateur) ET par le serveur (Pages Functions).
// Ajouter un champ ici le fait apparaître dans le formulaire admin ET le fait valider côté serveur.
// Aucun accès au DOM dans ce fichier.

export const TZ = "Africa/Brazzaville";

export const ROLES = {
  admin: "Administrateur général",
  communication: "Responsable de communication",
  sport: "Responsable sportif",
};

/** Couleur des pastilles de statut. */
export const CHIP = {
  publie: "green", brouillon: "muted", archive: "muted",
  actif: "green", inactif: "muted", parti: "muted",
  programme: "green", encours: "amber", termine: "ink", reporte: "red", annule: "red",
  nouvelle: "green", en_cours: "amber", acceptee: "ink", refusee: "red",
  non_lu: "green", lu: "muted", traite: "ink",
  admin: "ink", communication: "green", sport: "amber",
  oui: "green", non: "muted",
};

const THIS_YEAR = new Date().getFullYear();
const POSITIONS = [["Gardien", "Gardien"], ["Défenseur", "Défenseur"], ["Milieu", "Milieu"], ["Attaquant", "Attaquant"]];
const personName = (d) => [d.firstName, d.lastName].filter(Boolean).join(" ");

/**
 * Champ : { key, label, type, required, options, ref, max, min, int, help, group, default, readonly, hidden, private }
 * Types : text, textarea, number, date, datetime, checkbox, select, ref, image, video, gallery, lines, videos, url, password
 * roles : rôles autorisés en plus de l'administrateur général (qui a toujours accès à tout).
 */
export const COLLECTIONS = {
  news: {
    label: "Actualités", singular: "actualité", table: "news", roles: ["communication"],
    titleOf: (d) => d.title,
    sort: { key: "publishedAt", dir: -1 },
    statusField: "status",
    columns: [
      { key: "title", label: "Titre" },
      { key: "category", label: "Catégorie" },
      { key: "status", label: "Statut", type: "chip" },
      { key: "publishedAt", label: "Publication", type: "datetime" },
    ],
    fields: [
      { key: "title", label: "Titre", type: "text", required: true, max: 160, group: "Contenu" },
      { key: "category", label: "Rubrique", type: "select", required: true, options: [["Match", "Match"], ["Académie", "Académie"], ["Partenaires", "Partenaires"], ["Événement", "Événement"], ["Autre", "Autre"]], group: "Contenu" },
      { key: "excerpt", label: "Résumé", type: "textarea", max: 300, rows: 3, help: "Deux lignes affichées dans la liste des actualités.", group: "Contenu" },
      { key: "content", label: "Texte", type: "textarea", required: true, max: 20000, rows: 12, help: "Séparez les paragraphes par une ligne vide.", group: "Contenu" },
      { key: "image", label: "Image principale", type: "image", group: "Contenu" },
      { key: "imageAlt", label: "Description de l'image", type: "text", max: 160, help: "Lue par les lecteurs d'écran.", group: "Contenu" },
      { key: "status", label: "Statut", type: "select", required: true, default: "brouillon", options: [["brouillon", "Brouillon"], ["publie", "Publié"], ["archive", "Archivé"]], group: "Publication" },
      { key: "publishedAt", label: "Date de publication", type: "datetime", help: "Vide : la date du jour est utilisée à la publication. Une date future programme la publication.", group: "Publication" },
      { key: "slug", label: "Adresse de la page", type: "text", max: 90, help: "Laissez vide : elle est créée à partir du titre.", group: "Publication" },
      { key: "author", label: "Auteur", type: "text", max: 80, help: "Vide : votre nom.", group: "Publication" },
    ],
  },

  categories: {
    label: "Catégories", singular: "catégorie", table: "categories", roles: ["sport"],
    titleOf: (d) => d.name,
    sort: { key: "name", dir: 1 },
    columns: [
      { key: "name", label: "Nom" },
      { key: "season", label: "Saison" },
      { key: "active", label: "Active", type: "bool" },
    ],
    fields: [
      { key: "name", label: "Nom", type: "text", required: true, max: 40, help: "Par exemple U13, U15, U17 : les catégories réellement présentes dans l'académie." },
      { key: "season", label: "Saison", type: "text", max: 20, help: "Par exemple 2026-2027." },
      { key: "description", label: "Description", type: "textarea", max: 500, rows: 3 },
      { key: "technicalLead", label: "Responsable technique", type: "text", max: 80 },
      { key: "technicalLeadPublic", label: "Publier le nom du responsable technique sur le site", type: "checkbox" },
      { key: "active", label: "Catégorie active", type: "checkbox", default: true },
    ],
  },

  teams: {
    label: "Équipes", singular: "équipe", table: "teams", roles: ["sport"],
    titleOf: (d) => d.name,
    sort: { key: "season", dir: -1 },
    statusField: "status",
    columns: [
      { key: "name", label: "Équipe" },
      { key: "categoryId", label: "Catégorie", type: "ref", ref: "categories" },
      { key: "season", label: "Saison" },
      { key: "status", label: "Statut", type: "chip" },
    ],
    fields: [
      { key: "name", label: "Nom de l'équipe", type: "text", required: true, max: 80 },
      { key: "categoryId", label: "Catégorie", type: "ref", ref: "categories", required: true },
      { key: "season", label: "Saison", type: "text", required: true, max: 20 },
      { key: "status", label: "Statut", type: "select", required: true, default: "actif", options: [["actif", "En cours"], ["archive", "Archivée (saison terminée)"]] },
      { key: "photo", label: "Photographie officielle", type: "image" },
      { key: "description", label: "Présentation", type: "textarea", max: 1000, rows: 4 },
      { key: "coach", label: "Entraîneur", type: "text", max: 80 },
      { key: "coachPublic", label: "Publier le nom de l'entraîneur sur le site", type: "checkbox" },
    ],
  },

  players: {
    label: "Joueurs", singular: "joueur", table: "players", roles: ["sport"], personal: true,
    titleOf: personName,
    sort: { key: "lastName", dir: 1 },
    statusField: "sportStatus",
    columns: [
      { key: "internalId", label: "N° interne" },
      { key: "name", label: "Joueur", get: personName },
      { key: "categoryId", label: "Catégorie", type: "ref", ref: "categories" },
      { key: "position", label: "Poste" },
      { key: "sportStatus", label: "Statut", type: "chip" },
      { key: "publishProfile", label: "Publié", type: "bool" },
    ],
    fields: [
      { key: "firstName", label: "Prénom", type: "text", required: true, max: 80, group: "Identité sportive" },
      { key: "lastName", label: "Nom", type: "text", required: true, max: 80, group: "Identité sportive" },
      { key: "birthYear", label: "Année de naissance", type: "number", int: true, required: true, min: 1990, max: THIS_YEAR, group: "Identité sportive" },
      { key: "categoryId", label: "Catégorie", type: "ref", ref: "categories", required: true, group: "Identité sportive" },
      { key: "teamId", label: "Équipe", type: "ref", ref: "teams", group: "Identité sportive" },
      { key: "position", label: "Poste", type: "select", options: POSITIONS, group: "Identité sportive" },
      { key: "foot", label: "Pied dominant", type: "select", options: [["Droit", "Droit"], ["Gauche", "Gauche"], ["Les deux", "Les deux"]], group: "Identité sportive" },
      { key: "photo", label: "Photographie", type: "image", group: "Identité sportive", help: "Elle ne s'affiche sur le site que si une autorisation « photo » est enregistrée." },
      { key: "joinedAt", label: "Date d'intégration", type: "date", group: "Identité sportive" },
      { key: "sportStatus", label: "Statut sportif", type: "select", required: true, default: "actif", options: [["actif", "Actif"], ["inactif", "Inactif"], ["parti", "Parti"]], group: "Identité sportive" },
      { key: "internalId", label: "Identifiant sportif interne", type: "text", max: 20, help: "Vide : créé automatiquement (OKM-0001…).", group: "Identité sportive" },

      { key: "publishProfile", label: "Publier le profil sur le site", type: "checkbox", group: "Profil public", help: "Le profil n'apparaît que si une autorisation « profil » non révoquée est enregistrée dans le menu Autorisations." },
      { key: "publicName", label: "Nom affiché sur le site", type: "text", max: 80, group: "Profil public", help: "Vide : prénom et initiale du nom, par exemple « Jean K. »." },
      { key: "statMatches", label: "Matchs joués", type: "number", int: true, min: 0, max: 999, group: "Profil public" },
      { key: "statGoals", label: "Buts", type: "number", int: true, min: 0, max: 999, group: "Profil public" },
      { key: "statAssists", label: "Passes décisives", type: "number", int: true, min: 0, max: 999, group: "Profil public" },

      { key: "guardianName", label: "Parent ou responsable légal", type: "text", max: 120, group: "Informations internes, jamais publiées" },
      { key: "guardianPhone", label: "Téléphone du responsable", type: "text", max: 30, group: "Informations internes, jamais publiées" },
      { key: "internalNotes", label: "Notes internes", type: "textarea", max: 3000, rows: 4, group: "Informations internes, jamais publiées" },
    ],
  },

  consent_records: {
    label: "Autorisations", singular: "autorisation", table: "consent_records", roles: ["sport"], personal: true,
    titleOf: (d) => d.type,
    sort: { key: "grantedAt", dir: -1 },
    columns: [
      { key: "playerId", label: "Joueur", type: "ref", ref: "players" },
      { key: "type", label: "Autorisation", type: "option" },
      { key: "grantedBy", label: "Accordée par" },
      { key: "grantedAt", label: "Date", type: "date" },
      { key: "revoked", label: "Révoquée", type: "bool" },
    ],
    fields: [
      { key: "playerId", label: "Joueur", type: "ref", ref: "players", required: true },
      { key: "type", label: "Type d'autorisation", type: "select", required: true, options: [["profil", "Publication du profil et des statistiques"], ["photo", "Publication de la photographie"]] },
      { key: "grantedBy", label: "Accordée par (parent ou responsable légal)", type: "text", required: true, max: 120 },
      { key: "grantedAt", label: "Date de l'autorisation", type: "date", required: true },
      { key: "reference", label: "Référence du document", type: "text", max: 160, help: "Par exemple : formulaire papier n° 12, rangé dans le classeur des autorisations." },
      { key: "revoked", label: "Autorisation révoquée", type: "checkbox", help: "Cocher retire immédiatement le profil ou la photo du site." },
      { key: "notes", label: "Notes", type: "textarea", max: 1000, rows: 3 },
    ],
  },

  competitions: {
    label: "Compétitions", singular: "compétition", table: "competitions", roles: ["sport"],
    titleOf: (d) => d.name,
    sort: { key: "name", dir: 1 },
    columns: [{ key: "name", label: "Compétition" }, { key: "season", label: "Saison" }],
    fields: [
      { key: "name", label: "Nom", type: "text", required: true, max: 100 },
      { key: "season", label: "Saison", type: "text", max: 20 },
      { key: "rules", label: "Règlement et critères de classement", type: "textarea", max: 3000, rows: 5 },
    ],
  },

  matches: {
    label: "Matchs et résultats", singular: "match", table: "matches", roles: ["sport"],
    titleOf: (d) => `Match contre ${d.opponent}`,
    sort: { key: "datetime", dir: -1 },
    statusField: "status",
    columns: [
      { key: "datetime", label: "Date", type: "datetime" },
      { key: "categoryId", label: "Catégorie", type: "ref", ref: "categories" },
      { key: "opponent", label: "Adversaire" },
      { key: "score", label: "Score", get: (d) => (d.status === "termine" ? `${d.ourScore} – ${d.theirScore}` : "") },
      { key: "status", label: "Statut", type: "chip" },
      { key: "validated", label: "Validé", type: "bool" },
    ],
    fields: [
      { key: "categoryId", label: "Catégorie", type: "ref", ref: "categories", required: true, group: "Rencontre" },
      { key: "opponent", label: "Adversaire", type: "text", required: true, max: 100, group: "Rencontre" },
      { key: "competitionId", label: "Compétition", type: "ref", ref: "competitions", group: "Rencontre" },
      { key: "datetime", label: "Date et heure", type: "datetime", required: true, group: "Rencontre", help: "Heure de Brazzaville." },
      { key: "venue", label: "Lieu", type: "text", max: 120, group: "Rencontre" },
      { key: "home", label: "Match à domicile", type: "checkbox", default: true, group: "Rencontre" },
      { key: "status", label: "Statut", type: "select", required: true, default: "programme", options: [["programme", "Programmé"], ["encours", "En cours"], ["termine", "Terminé"], ["reporte", "Reporté"], ["annule", "Annulé"]], group: "Rencontre" },
      { key: "ourScore", label: "Buts de OKM Football Académie", type: "number", int: true, min: 0, max: 99, group: "Résultat", help: "Obligatoire quand le match est terminé." },
      { key: "theirScore", label: "Buts de l'adversaire", type: "number", int: true, min: 0, max: 99, group: "Résultat" },
      { key: "scorers", label: "Buteurs", type: "lines", help: "Un nom par ligne.", group: "Résultat" },
      { key: "notes", label: "Observations sportives", type: "textarea", max: 1000, rows: 3, group: "Résultat" },
      { key: "validated", label: "Résultat validé : publier sur le site", type: "checkbox", group: "Résultat", help: "Un match terminé non validé reste invisible du public et exclu du bilan." },
    ],
  },

  trophies: {
    label: "Trophées", singular: "trophée", table: "trophies", roles: ["sport"],
    titleOf: (d) => d.name,
    sort: { key: "year", dir: -1 },
    columns: [
      { key: "name", label: "Trophée" },
      { key: "competition", label: "Compétition" },
      { key: "year", label: "Année" },
      { key: "categoryId", label: "Catégorie", type: "ref", ref: "categories" },
      { key: "result", label: "Résultat" },
    ],
    fields: [
      { key: "name", label: "Nom du trophée", type: "text", required: true, max: 120 },
      { key: "competition", label: "Compétition", type: "text", max: 120 },
      { key: "year", label: "Année", type: "number", int: true, required: true, min: 1950, max: THIS_YEAR + 1 },
      { key: "categoryId", label: "Catégorie concernée", type: "ref", ref: "categories" },
      { key: "result", label: "Résultat obtenu", type: "text", max: 80, help: "Par exemple : Vainqueur, finaliste." },
      { key: "photo", label: "Photographie du trophée", type: "image" },
      { key: "description", label: "Description", type: "textarea", max: 1000, rows: 3 },
    ],
  },

  albums: {
    label: "Galerie", singular: "album", table: "albums", roles: ["communication"],
    titleOf: (d) => d.title,
    sort: { key: "date", dir: -1 },
    columns: [
      { key: "title", label: "Album" },
      { key: "date", label: "Date", type: "date" },
      { key: "event", label: "Événement" },
      { key: "published", label: "Publié", type: "bool" },
    ],
    fields: [
      { key: "title", label: "Titre", type: "text", required: true, max: 120 },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "event", label: "Événement", type: "text", max: 120 },
      { key: "categoryId", label: "Catégorie", type: "ref", ref: "categories" },
      { key: "description", label: "Description", type: "textarea", max: 1000, rows: 3 },
      { key: "cover", label: "Image de couverture", type: "image" },
      { key: "images", label: "Photographies", type: "gallery", help: "Les images sont réduites automatiquement pour les connexions mobiles lentes. Publiez uniquement des photos de mineurs avec l'autorisation de leurs responsables." },
      { key: "videos", label: "Vidéos (liens externes)", type: "videos", help: "Une vidéo par ligne : titre | adresse https://…" },
      { key: "published", label: "Publier cet album sur le site", type: "checkbox" },
    ],
  },

  videos: {
    label: "Vidéos", singular: "vidéo", table: "videos", roles: ["communication"],
    titleOf: (d) => d.title,
    sort: { key: "date", dir: -1 },
    columns: [
      { key: "title", label: "Titre" },
      { key: "date", label: "Date", type: "date" },
      { key: "featured", label: "À la une", type: "bool" },
      { key: "published", label: "Publiée", type: "bool" },
    ],
    fields: [
      { key: "title", label: "Titre", type: "text", required: true, max: 120 },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "description", label: "Description", type: "textarea", max: 500, rows: 3 },
      { key: "categoryId", label: "Catégorie", type: "ref", ref: "categories" },
      { key: "url", label: "Vidéo", type: "video", required: true, help: "Envoyez un fichier MP4 ou WebM (20 Mo maximum), ou collez une adresse https:// vers un fichier vidéo ou un lien YouTube." },
      { key: "poster", label: "Image d'aperçu", type: "image", help: "Affichée avant la lecture." },
      { key: "featured", label: "Mettre à la une de l'accueil", type: "checkbox" },
      { key: "published", label: "Publier cette vidéo sur le site", type: "checkbox" },
    ],
  },

  partners: {
    label: "Partenaires", singular: "partenaire", table: "partners", roles: ["communication"],
    titleOf: (d) => d.name,
    sort: { key: "name", dir: 1 },
    columns: [
      { key: "name", label: "Partenaire" },
      { key: "support", label: "Soutien" },
      { key: "approved", label: "Publié", type: "bool" },
    ],
    fields: [
      { key: "name", label: "Nom", type: "text", required: true, max: 120 },
      { key: "logo", label: "Logo", type: "image" },
      { key: "description", label: "Description", type: "textarea", max: 1000, rows: 4 },
      { key: "support", label: "Nature du soutien", type: "text", max: 160 },
      { key: "website", label: "Site officiel", type: "url", max: 200 },
      { key: "period", label: "Période du partenariat", type: "text", max: 60 },
      { key: "showPeriod", label: "Publier la période sur le site", type: "checkbox" },
      { key: "approved", label: "Présentation approuvée par l'académie : publier sur le site", type: "checkbox" },
    ],
  },

  registration_requests: {
    label: "Inscriptions", singular: "demande d'inscription", table: "registration_requests", roles: ["sport"], personal: true, noCreate: true,
    titleOf: personName,
    sort: { key: "submittedAt", dir: -1 },
    statusField: "status",
    columns: [
      { key: "submittedAt", label: "Reçue le", type: "datetime" },
      { key: "name", label: "Candidat", get: personName },
      { key: "category", label: "Catégorie souhaitée" },
      { key: "birthYear", label: "Naissance" },
      { key: "status", label: "Statut", type: "chip" },
    ],
    fields: [
      { key: "firstName", label: "Prénom", type: "text", readonly: true, group: "Demande reçue" },
      { key: "lastName", label: "Nom", type: "text", readonly: true, group: "Demande reçue" },
      { key: "birthYear", label: "Année de naissance", type: "number", readonly: true, group: "Demande reçue" },
      { key: "category", label: "Catégorie souhaitée", type: "text", readonly: true, group: "Demande reçue" },
      { key: "position", label: "Poste", type: "text", readonly: true, group: "Demande reçue" },
      { key: "guardianName", label: "Responsable légal", type: "text", readonly: true, group: "Demande reçue" },
      { key: "guardianPhone", label: "Téléphone", type: "text", readonly: true, group: "Demande reçue" },
      { key: "email", label: "Adresse e-mail", type: "text", readonly: true, group: "Demande reçue" },
      { key: "message", label: "Message", type: "textarea", readonly: true, group: "Demande reçue" },
      { key: "submittedAt", label: "Reçue le", type: "datetime", readonly: true, group: "Demande reçue" },
      { key: "status", label: "Statut de la demande", type: "select", required: true, default: "nouvelle", options: [["nouvelle", "Nouvelle"], ["en_cours", "En cours d'étude"], ["acceptee", "Acceptée"], ["refusee", "Refusée"]], group: "Traitement", help: "Recevoir une demande n'est jamais une admission automatique." },
      { key: "adminNote", label: "Note interne", type: "textarea", max: 2000, rows: 4, group: "Traitement" },
      { key: "playerId", label: "Fiche joueur créée", type: "text", hidden: true, max: 60 },
    ],
  },

  contact_messages: {
    label: "Messages", singular: "message", table: "contact_messages", roles: ["communication"], personal: true, noCreate: true,
    titleOf: (d) => d.subject,
    sort: { key: "submittedAt", dir: -1 },
    statusField: "status",
    columns: [
      { key: "submittedAt", label: "Reçu le", type: "datetime" },
      { key: "name", label: "Expéditeur" },
      { key: "subject", label: "Objet" },
      { key: "status", label: "Statut", type: "chip" },
    ],
    fields: [
      { key: "name", label: "Expéditeur", type: "text", readonly: true, group: "Message reçu" },
      { key: "email", label: "Adresse e-mail", type: "text", readonly: true, group: "Message reçu" },
      { key: "subject", label: "Objet", type: "text", readonly: true, group: "Message reçu" },
      { key: "message", label: "Message", type: "textarea", readonly: true, group: "Message reçu" },
      { key: "submittedAt", label: "Reçu le", type: "datetime", readonly: true, group: "Message reçu" },
      { key: "status", label: "Statut", type: "select", required: true, default: "non_lu", options: [["non_lu", "Non lu"], ["lu", "Lu"], ["traite", "Traité"]], group: "Traitement" },
    ],
  },

  settings: {
    label: "Contenus du site", singular: "réglages", table: "site_settings", roles: ["communication"], single: true,
    titleOf: () => "Contenus du site",
    fields: [
      { key: "heroLead", label: "Phrase d'accueil (page d'accueil)", type: "textarea", max: 300, rows: 3, group: "Accueil" },
      { key: "heroImage", label: "Photo de l'accueil", type: "image", group: "Accueil", help: "Grande image affichée à côté du titre de la page d'accueil. Format paysage conseillé." },
      { key: "academieMission", label: "Notre mission (page L'académie)", type: "textarea", max: 6000, rows: 8, help: "Séparez les paragraphes par une ligne vide.", group: "Page L'académie" },
      { key: "academieTeam", label: "Équipe d'encadrement (page L'académie)", type: "textarea", max: 6000, rows: 6, help: "Publiez uniquement les noms des personnes qui ont donné leur accord.", group: "Page L'académie" },
      { key: "email", label: "Adresse électronique publique", type: "text", max: 120, group: "Coordonnées" },
      { key: "facebookName", label: "Nom de la page Facebook", type: "text", max: 80, group: "Coordonnées" },
      { key: "facebookUrl", label: "Adresse de la page Facebook", type: "url", max: 200, group: "Coordonnées" },
    ],
  },

  // Géré par un code serveur dédié (mots de passe, sessions) ; décrit ici pour le formulaire admin.
  users: {
    label: "Comptes", singular: "compte", table: "users", roles: [], adminOnly: true, personal: true, custom: true,
    titleOf: (d) => d.name,
    sort: { key: "name", dir: 1 },
    columns: [
      { key: "name", label: "Nom" },
      { key: "email", label: "E-mail" },
      { key: "role", label: "Rôle", type: "chip", options: Object.entries(ROLES) },
      { key: "active", label: "Actif", type: "bool" },
      { key: "lastLoginAt", label: "Dernière connexion", type: "datetime" },
    ],
    fields: [
      { key: "name", label: "Nom", type: "text", required: true, max: 80 },
      { key: "email", label: "Adresse e-mail (identifiant)", type: "text", required: true, max: 160 },
      { key: "role", label: "Rôle", type: "select", required: true, options: Object.entries(ROLES) },
      { key: "active", label: "Compte actif", type: "checkbox", default: true },
      { key: "password", label: "Mot de passe", type: "password", help: "12 caractères minimum. À la modification : laissez vide pour ne pas le changer." },
    ],
  },
};

/** Menu de l'administration. */
export const MENU = [
  { key: "dashboard", label: "Tableau de bord", href: "#/" },
  { group: "Communication", items: ["news", "albums", "videos", "partners", "settings", "contact_messages"] },
  { group: "Vie sportive", items: ["categories", "teams", "players", "consent_records", "competitions", "matches", "trophies", "registration_requests"] },
  { group: "Administration", items: ["users", "audit"] },
];

export const MENU_LABELS = { audit: "Journal des actions" };

export function canAccess(role, key) {
  if (key === "audit") return role === "admin";
  const def = COLLECTIONS[key];
  if (!def) return false;
  if (role === "admin") return true;
  return !def.adminOnly && def.roles.includes(role);
}

/** Collections dont la liste (id + libellé) est lisible par tous les rôles connectés, pour remplir les listes déroulantes. */
export const OPEN_REFS = ["categories", "teams", "competitions"];

export function optionLabel(field, value) {
  const opt = (field.options || []).find(([v]) => v === value);
  return opt ? opt[1] : value;
}
