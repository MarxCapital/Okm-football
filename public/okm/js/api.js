export class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors || {};
  }
}

/** Appel de l'API. Les en-têtes anti-CSRF sont ajoutés ici, une seule fois. */
export async function api(path, { method = "GET", body, form } = {}) {
  const headers = { Accept: "application/json", "X-Requested-With": "okm-admin" };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "Connexion impossible. Vérifiez votre accès à Internet puis réessayez.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new CustomEvent("okm:unauth"));
  if (!res.ok) throw new ApiError(res.status, data?.message || "Une erreur est survenue.", data?.errors);
  return data;
}

/* ---------- Listes déroulantes, mises en cache le temps de la session ---------- */
const refCache = new Map();
export async function loadRefs(key) {
  if (!refCache.has(key)) {
    refCache.set(key, api(`/admin/refs/${key}`).then((r) => r.items).catch((e) => { refCache.delete(key); throw e; }));
  }
  return refCache.get(key);
}
export const clearRefs = () => refCache.clear();

/* ---------- Images : réduites avant envoi pour économiser la connexion mobile ---------- */
export async function prepareImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Format non accepté. Utilisez une image JPEG, PNG ou WebP.");
  if (file.size < 150 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (blob && blob.type === "image/webp" && blob.size < file.size) return new File([blob], "image.webp", { type: "image/webp" });
  } catch {
    /* on envoie l'original */
  }
  return file;
}

export async function uploadImage(file) {
  const ready = await prepareImage(file);
  const form = new FormData();
  form.set("file", ready);
  return (await api("/admin/media", { method: "POST", form })).url;
}

export async function uploadVideo(file) {
  if (!/^video\/(mp4|webm)$/.test(file.type)) throw new Error("Format non accepté. Utilisez une vidéo MP4 ou WebM.");
  if (file.size > 20 * 1024 * 1024) throw new Error("La vidéo dépasse 20 Mo. Réduisez-la, ou collez un lien YouTube.");
  const form = new FormData();
  form.set("file", file);
  return (await api("/admin/media", { method: "POST", form })).url;
}
