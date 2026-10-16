// Données de démonstration : textes, photos (public/demo/*) et vidéos fictifs, entièrement modifiables ou supprimables
// depuis l'espace d'administration. Tous les identifiants commencent par "demo-" pour pouvoir les retirer d'un coup
// (npm run db:unseed:local / db:unseed:remote).
// Les dates sont calculées par rapport au jour où le script est lancé : il y a toujours un prochain match à afficher.

const DAY = 86400000;
const MARK = "Contenu de démonstration : modifiez-le ou supprimez-le depuis l'espace d'administration.";

export function demoData(now = new Date()) {
  const at = (days, hour = 16, minute = 0) => {
    const d = new Date(now.getTime() + days * DAY);
    d.setUTCHours(hour, minute, 0, 0); // heures de Brazzaville = UTC+1 : 16 h UTC = 17 h locale
    return d.toISOString();
  };
  const day = (days) => at(days).slice(0, 10);
  const year = now.getUTCFullYear();
  const season = now.getUTCMonth() >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  const prev = (() => { const [a, b] = season.split("-").map(Number); return `${a - 1}-${b - 1}`; })();

  const categories = [
    { id: "demo-cat-u11", name: "U11", season, description: "Initiation au football : plaisir de jouer, coordination et premiers repères collectifs.", technicalLead: "", technicalLeadPublic: false, active: true },
    { id: "demo-cat-u13", name: "U13", season, description: "Apprentissage des bases techniques et de la vie de groupe.", technicalLead: "", technicalLeadPublic: false, active: true },
    { id: "demo-cat-u15", name: "U15", season, description: "Développement tactique et physique, premières compétitions officielles.", technicalLead: "", technicalLeadPublic: false, active: true },
    { id: "demo-cat-u17", name: "U17", season, description: "Préparation au haut niveau et accompagnement du projet scolaire et sportif.", technicalLead: "", technicalLeadPublic: false, active: true },
  ];

  const teams = [
    { id: "demo-team-u11", name: "OKM U11", categoryId: "demo-cat-u11", season, status: "actif", photo: "/demo/team-u11.jpg", description: "Les plus jeunes de l'académie. " + MARK, coach: "", coachPublic: false },
    { id: "demo-team-u13", name: "OKM U13", categoryId: "demo-cat-u13", season, status: "actif", photo: "/demo/team-u13.jpg", description: "Une équipe qui apprend à jouer ensemble. " + MARK, coach: "", coachPublic: false },
    { id: "demo-team-u15", name: "OKM U15", categoryId: "demo-cat-u15", season, status: "actif", photo: "/demo/team-u15.jpg", description: "Une génération en progression. " + MARK, coach: "", coachPublic: false },
    { id: "demo-team-u17", name: "OKM U17", categoryId: "demo-cat-u17", season, status: "actif", photo: "/demo/team-u17.jpg", description: "L'équipe la plus expérimentée. " + MARK, coach: "", coachPublic: false },
    { id: "demo-team-u15-old", name: "OKM U15", categoryId: "demo-cat-u15", season: prev, status: "archive", photo: "/demo/gallery-4.jpg", description: "Équipe de la saison précédente (archive). " + MARK, coach: "", coachPublic: false },
  ];

  const competitions = [
    { id: "demo-comp-champ", name: "Championnat des jeunes", season, rules: "Exemple de règlement : 3 points pour une victoire, 1 pour un nul, 0 pour une défaite." },
    { id: "demo-comp-tournoi", name: "Tournoi de la rentrée", season, rules: "" },
  ];

  const P = (n, first, last, birth, cat, team, position, foot, stats, extra = {}) => ({
    id: `demo-player-${n}`, firstName: first, lastName: last, birthYear: birth, categoryId: cat, teamId: team, position, foot, photo: "",
    joinedAt: day(-400), sportStatus: "actif", internalId: `OKM-${String(n).padStart(4, "0")}`,
    publishProfile: true, publicName: "", statMatches: stats[0], statGoals: stats[1], statAssists: stats[2],
    guardianName: "", guardianPhone: "", internalNotes: "Fiche de démonstration, à supprimer ou à remplacer.", ...extra,
  });
  const players = [
    P(1, "Jean", "Kimbembe", year - 16, "demo-cat-u17", "demo-team-u17", "Attaquant", "Droit", [9, 7, 3]),
    P(2, "Prince", "Mavoungou", year - 16, "demo-cat-u17", "demo-team-u17", "Milieu", "Gauche", [9, 3, 6]),
    P(3, "Grâce", "Ndinga", year - 14, "demo-cat-u15", "demo-team-u15", "Défenseur", "Droit", [8, 1, 1]),
    P(4, "Merveille", "Bakala", year - 14, "demo-cat-u15", "demo-team-u15", "Gardien", "Droit", [8, 0, 0]),
    P(5, "Exaucé", "Loemba", year - 12, "demo-cat-u13", "demo-team-u13", "Milieu", "Les deux", [7, 2, 4]),
    P(6, "Chancel", "Moukala", year - 12, "demo-cat-u13", "demo-team-u13", "Attaquant", "Gauche", [7, 5, 1]),
    P(7, "Dieu-Merci", "Nzaba", year - 10, "demo-cat-u11", "demo-team-u11", "Milieu", "Droit", [6, 2, 2]),
    P(8, "Brel", "Tati", year - 10, "demo-cat-u11", "demo-team-u11", "Défenseur", "Droit", [6, 0, 1]),
  ];
  const consent_records = players.flatMap((p) => [
    { id: `demo-consent-${p.id.slice(12)}-profil`, playerId: p.id, type: "profil", grantedBy: "Parent (exemple)", grantedAt: day(-60), reference: "Autorisation de démonstration", revoked: false, notes: "" },
  ]);

  const M = (n, cat, opp, comp, days, venue, home, ours, theirs, scorers = [], notes = "") => {
    const done = ours !== null;
    return {
      id: `demo-match-${n}`, categoryId: cat, opponent: opp, competitionId: comp, datetime: at(days, 14, 0), venue, home,
      status: done ? "termine" : "programme", ourScore: ours, theirScore: theirs, scorers, notes, validated: done,
    };
  };
  const matches = [
    M(1, "demo-cat-u17", "AS Poto-Poto (exemple)", "demo-comp-champ", 4, "Stade municipal", true, null, null),
    M(2, "demo-cat-u15", "Étoile du Congo jeunes (exemple)", "demo-comp-champ", 11, "Terrain de l'académie", true, null, null),
    M(3, "demo-cat-u13", "Club Mfoa (exemple)", "demo-comp-tournoi", 18, "Complexe sportif", false, null, null),
    M(4, "demo-cat-u17", "Diables Noirs jeunes (exemple)", "demo-comp-champ", -5, "Stade municipal", true, 3, 1, ["Jean K.", "Jean K.", "Prince M."], "Belle victoire collective."),
    M(5, "demo-cat-u15", "Patronage Sainte-Anne (exemple)", "demo-comp-champ", -12, "Terrain de l'académie", true, 2, 2, ["Grâce N.", "Exaucé L."]),
    M(6, "demo-cat-u13", "Club Mfoa (exemple)", "demo-comp-tournoi", -19, "Complexe sportif", false, 1, 0, ["Chancel M."]),
    M(7, "demo-cat-u17", "AS Poto-Poto (exemple)", "demo-comp-champ", -26, "Terrain adverse", false, 0, 1, []),
    M(8, "demo-cat-u15", "Étoile du Congo jeunes (exemple)", "demo-comp-champ", -33, "Terrain de l'académie", true, 4, 0, ["Grâce N.", "Grâce N.", "Exaucé L.", "Brel T."]),
  ];

  const trophies = [
    { id: "demo-trophy-1", name: "Tournoi de la rentrée", competition: "Tournoi de la rentrée", year: year - 1, categoryId: "demo-cat-u15", result: "Vainqueur", photo: "/demo/trophy-1.jpg", description: "Exemple de trophée. " + MARK },
    { id: "demo-trophy-2", name: "Coupe des jeunes talents", competition: "Coupe des jeunes talents", year: year - 2, categoryId: "demo-cat-u13", result: "Finaliste", photo: "/demo/trophy-2.jpg", description: "Exemple de trophée. " + MARK },
    { id: "demo-trophy-3", name: "Prix du fair-play", competition: "Championnat des jeunes", year: year - 3, categoryId: "", result: "Distinction", photo: "/demo/trophy-3.jpg", description: "Exemple de distinction. " + MARK },
  ];

  const text = (...paras) => [...paras, MARK].join("\n\n");
  const N = (n, title, category, excerpt, content, image, days, status = "publie") => ({
    id: `demo-news-${n}`, slug: `demo-${n}-${title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}`,
    title, category, excerpt, content, image, imageAlt: title, status, publishedAt: status === "publie" ? at(days, 9, 0) : null, author: "Communication OKM",
  });
  const news = [
    N(1, "Victoire des U17 devant leur public", "Match", "Les U17 s'imposent 3 à 1 au stade municipal grâce à un doublé de Jean K.", text("Les U17 de l'académie ont dominé la rencontre du début à la fin. Après l'ouverture du score en première période, l'équipe a su garder la maîtrise du ballon et conclure avec un troisième but en seconde mi-temps.", "Le staff a salué l'état d'esprit du groupe : solidarité, rigueur et plaisir de jouer ensemble."), "/demo/news-match.jpg", -4),
    N(2, "Reprise des entraînements : le programme de la saison", "Académie", "Horaires, catégories et rendez-vous à noter pour la nouvelle saison.", text("La saison est lancée. Chaque catégorie retrouve son terrain d'entraînement avec un programme de travail technique, tactique et physique adapté à l'âge des joueurs.", "Les familles peuvent consulter les catégories et demander une inscription depuis le site."), "/demo/news-training.jpg", -9),
    N(3, "Le trophée de la rentrée reste à l'académie", "Événement", "Retour sur un tournoi riche en émotions et en beau jeu.", text("Le tournoi de la rentrée a réuni plusieurs clubs de jeunes de Brazzaville. Nos joueurs ont fini la compétition invaincus.", "Bravo à tous les participants et merci aux bénévoles qui ont rendu cette journée possible."), "/demo/news-trophy.jpg", -15),
    N(4, "Un nouveau partenaire rejoint l'académie", "Partenaires", "Un soutien précieux pour les équipements et les déplacements des équipes.", text("L'académie accueille un nouveau partenaire qui accompagnera les équipes de jeunes tout au long de la saison.", "Ce soutien contribuera à l'achat d'équipements et à l'organisation des déplacements."), "/demo/news-stadium.jpg", -21),
    N(5, "Séance spéciale tirs au but", "Académie", "Les gardiens et attaquants travaillent la précision et le sang-froid.", text("Une séance consacrée aux tirs au but a rassemblé les gardiens et les attaquants de plusieurs catégories.", "Objectif : apprendre à gérer la pression et à rester concentré jusqu'au dernier tir."), "/demo/news-goal.jpg", -28),
    N(6, "Journée portes ouvertes (brouillon)", "Académie", "Brouillon non publié : il n'apparaît pas sur le site.", text("Texte en préparation. Passez le statut sur « Publié » depuis l'administration pour l'afficher sur le site."), "/demo/gallery-6.jpg", 0, "brouillon"),
  ];

  const img = (n, alt) => ({ src: `/demo/gallery-${n}.jpg`, alt });
  const albums = [
    { id: "demo-album-1", title: "Match des U17 au stade municipal", date: day(-4), event: "Championnat des jeunes", categoryId: "demo-cat-u17", description: "Les meilleurs moments du match. " + MARK, cover: "/demo/gallery-1.jpg", images: [img(1, "Duel au milieu de terrain"), img(3, "Frappe cadrée"), img(4, "Les deux équipes"), img(5, "L'ambiance du stade")], videos: [], published: true },
    { id: "demo-album-2", title: "Entraînement de rentrée", date: day(-12), event: "Entraînement", categoryId: "", description: "Ateliers techniques et jeux à thème. " + MARK, cover: "/demo/gallery-2.jpg", images: [img(2, "Slalom entre les plots"), img(6, "Travail du dribble"), img(8, "Séance de tirs")], videos: [], published: true },
    { id: "demo-album-3", title: "Remise des trophées", date: day(-20), event: "Tournoi de la rentrée", categoryId: "demo-cat-u15", description: "Une journée de fête pour tout le club. " + MARK, cover: "/demo/gallery-7.jpg", images: [img(7, "Le trophée de la rentrée"), img(5, "Les tribunes")], videos: [], published: true },
  ];

  const videos = [
    { id: "demo-video-1", title: "Atelier dribbles et slalom", date: day(-6), description: "Un exemple de séance filmée. Remplacez cette vidéo par la vôtre depuis l'administration.", categoryId: "demo-cat-u13", url: "/demo/video-1.mp4", poster: "/demo/video-1-poster.jpg", featured: true, published: true },
    { id: "demo-video-2", title: "Le but de la victoire", date: day(-14), description: "Exemple de vidéo de match. " + MARK, categoryId: "demo-cat-u17", url: "/demo/video-2.mp4", poster: "/demo/video-2-poster.jpg", featured: false, published: true },
  ];

  const partners = [
    ["demo-partner-1", "Brazza Sport", "Équipements sportifs", "partner-1"],
    ["demo-partner-2", "Congo Logistique", "Transport des équipes", "partner-2"],
    ["demo-partner-3", "Pointe Énergie", "Soutien aux tournois", "partner-3"],
    ["demo-partner-4", "Marché Central", "Rafraîchissements", "partner-4"],
    ["demo-partner-5", "Kongo Médias", "Couverture médiatique", "partner-5"],
  ].map(([id, name, support, logo]) => ({ id, name, logo: `/demo/partners/${logo}.svg`, description: `Partenaire fictif. ${MARK}`, support, website: "", period: season, showPeriod: true, approved: true }));

  const settings = {
    id: "site",
    heroLead: "OKM Football Académie accompagne la formation et le développement des jeunes footballeurs de Brazzaville.",
    heroImage: "/demo/hero.jpg",
    academieMission: "OKM Football Académie forme de jeunes joueurs à Brazzaville. Notre mission : permettre à chaque enfant de progresser au football dans un cadre sûr, exigeant et bienveillant.\n\nNous croyons que le sport est une école de vie : respect, discipline, esprit d'équipe et persévérance.\n\n" + MARK,
    academieTeam: "",
    email: "okmfootballaca@gmail.com",
    facebookName: "OKM football Académie",
    facebookUrl: "",
  };

  return { categories, teams, competitions, players, consent_records, matches, trophies, news, albums, videos, partners, settings: [settings] };
}

export const DEMO_TABLES = {
  categories: "categories", teams: "teams", competitions: "competitions", players: "players", consent_records: "consent_records",
  matches: "matches", trophies: "trophies", news: "news", albums: "albums", videos: "videos", partners: "partners", settings: "site_settings",
};
