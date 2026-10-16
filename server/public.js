// Projections publiques : la SEULE porte de sortie des données vers les visiteurs.
// Chaque collection renvoie une liste blanche de champs ; tout champ non cité ici reste privé.
import { listDocs, getDoc } from "./db.js";

const paragraphs = (text) => String(text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

async function categoryNames(env) {
  const map = new Map();
  for (const c of await listDocs(env, "categories")) map.set(c.id, c.name);
  return map;
}

const PROJECTIONS = {
  async categories(env) {
    return (await listDocs(env, "categories"))
      .filter((c) => c.active)
      .map((c) => ({ id: c.id, name: c.name, season: c.season || "", description: c.description || "", technicalLead: c.technicalLeadPublic ? c.technicalLead || "" : "" }));
  },

  async news(env) {
    const now = Date.now();
    return (await listDocs(env, "news"))
      .filter((n) => n.status === "publie" && n.publishedAt && Date.parse(n.publishedAt) <= now)
      .map((n) => ({
        id: n.id, slug: n.slug, status: "publie", category: n.category, title: n.title, excerpt: n.excerpt || "",
        content: paragraphs(n.content), image: n.image || "", imageAlt: n.imageAlt || "", author: n.author || "", publishedAt: n.publishedAt,
      }));
  },

  async teams(env) {
    const cats = await categoryNames(env);
    return (await listDocs(env, "teams")).map((t) => ({
      id: t.id, name: t.name, category: cats.get(t.categoryId) || "", season: t.season, status: t.status, photo: t.photo || "",
      coach: t.coachPublic ? t.coach || "" : "", coachPublic: Boolean(t.coachPublic && t.coach), description: t.description || "",
    }));
  },

  async players(env) {
    const cats = await categoryNames(env);
    const consents = new Set();
    for (const c of await listDocs(env, "consent_records")) if (!c.revoked) consents.add(`${c.playerId}:${c.type}`);
    return (await listDocs(env, "players"))
      .filter((p) => p.publishProfile && p.sportStatus === "actif" && consents.has(`${p.id}:profil`))
      .map((p) => {
        const stats = {};
        if (p.statMatches !== null && p.statMatches !== undefined) stats.matches = p.statMatches;
        if (p.statGoals !== null && p.statGoals !== undefined) stats.goals = p.statGoals;
        if (p.statAssists !== null && p.statAssists !== undefined) stats.assists = p.statAssists;
        return {
          id: p.id,
          publicName: p.publicName || `${p.firstName} ${(p.lastName || "").charAt(0).toUpperCase()}.`,
          category: cats.get(p.categoryId) || "",
          position: p.position || "",
          foot: p.foot || "",
          photo: consents.has(`${p.id}:photo`) ? p.photo || "" : "",
          ...(Object.keys(stats).length ? { stats } : {}),
          published: true,
          consent: true,
        };
      });
  },

  async matches(env) {
    const cats = await categoryNames(env);
    const comps = new Map((await listDocs(env, "competitions")).map((c) => [c.id, c.name]));
    return (await listDocs(env, "matches"))
      .filter((m) => m.status !== "termine" || m.validated)
      .map((m) => {
        const done = m.status === "termine";
        return {
          id: m.id, category: cats.get(m.categoryId) || "", opponent: m.opponent, competition: comps.get(m.competitionId) || "",
          datetime: m.datetime, venue: m.venue || "", home: m.home !== false, status: m.status, validated: done ? true : false,
          ...(done ? { ourScore: m.ourScore, theirScore: m.theirScore, scorers: m.scorers || [], notes: m.notes || "" } : {}),
        };
      });
  },

  async trophies(env) {
    const cats = await categoryNames(env);
    return (await listDocs(env, "trophies")).map((t) => ({
      id: t.id, name: t.name, competition: t.competition || "", year: t.year, category: cats.get(t.categoryId) || "", result: t.result || "", photo: t.photo || "", description: t.description || "",
    }));
  },

  async partners(env) {
    return (await listDocs(env, "partners"))
      .filter((p) => p.approved)
      .map((p) => ({ id: p.id, name: p.name, logo: p.logo || "", description: p.description || "", support: p.support || "", website: p.website || "", period: p.showPeriod ? p.period || "" : "", showPeriod: Boolean(p.showPeriod && p.period), approved: true }));
  },

  async videos(env) {
    const cats = await categoryNames(env);
    return (await listDocs(env, "videos"))
      .filter((v) => v.published)
      .map((v) => ({ id: v.id, title: v.title, description: v.description || "", date: v.date, category: cats.get(v.categoryId) || "", url: v.url, poster: v.poster || "", featured: Boolean(v.featured) }));
  },

  async albums(env) {
    const cats = await categoryNames(env);
    return (await listDocs(env, "albums"))
      .filter((a) => a.published)
      .map((a) => ({ id: a.id, title: a.title, description: a.description || "", date: a.date, event: a.event || "", category: cats.get(a.categoryId) || "", cover: a.cover || "", images: a.images || [], videos: a.videos || [] }));
  },
};

export const PUBLIC_COLLECTIONS = Object.keys(PROJECTIONS);

export async function publicCollection(env, name) {
  return PROJECTIONS[name](env);
}

export async function publicSettings(env) {
  const s = (await getDoc(env, "settings", "site")) || {};
  return {
    heroLead: s.heroLead || "",
    heroImage: s.heroImage || "",
    academieMission: paragraphs(s.academieMission),
    academieTeam: paragraphs(s.academieTeam),
    email: s.email || "",
    facebookName: s.facebookName || "",
    facebookUrl: s.facebookUrl || "",
  };
}
