/* =========================================================================
   Permavore — POST /api/identifier (Cloudflare Pages Function)

   Proxy vers l'API Pl@ntNet (https://my.plantnet.org). Il existe pour UNE
   raison : la clé d'API ne doit jamais atteindre le navigateur.

   Garde-fous (règles Chateaufort) :
   - entrées validées : multipart, 1 à 3 images JPEG/PNG ≤ 2 Mo, organe en
     liste blanche ;
   - délai borné (15 s) et au plus 2 tentatives (1 retry sur panne/5xx) ;
   - limitation de débit : 3 req/min et 30 req/jour par visiteur, clé KV
     construite sur un hachage de l'IP (l'IP brute n'est jamais stockée) ;
   - réponse réduite aux champs utiles, jamais de corps amont brut.

   Variables d'environnement :
   - PLANTNET_API_KEY (secret, obligatoire)
   - RL (binding KV, limitation de débit ; absent = pas de limitation)
   - PLANTNET_URL (facultatif, uniquement pour les tests locaux)
   ========================================================================= */

const URL_PLANTNET = "https://my-api.plantnet.org/v2/identify/all";
const ORGANES = new Set(["auto", "leaf", "flower", "fruit", "bark"]);
const TYPES_IMAGE = new Set(["image/jpeg", "image/png"]);
const MAX_IMAGES = 3;
const MAX_OCTETS_IMAGE = 2 * 1024 * 1024;
const MAX_OCTETS_REQUETE = 7 * 1024 * 1024;
const DELAI_MS = 15000;
const LIMITE_MINUTE = 3;
const LIMITE_JOUR = 30;

function json(corps, statut = 200, entetes = {}) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { "Content-Type": "application/json; charset=utf-8",
               "Cache-Control": "no-store", ...entetes },
  });
}

async function hacher(texte) {
  const octets = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(octets)].slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Compteur KV approximatif (cohérence à terme) : suffisant pour contenir un
// abus qui épuiserait le quota gratuit, pas un contrôle d'accès.
async function depasseLimite(env, request) {
  if (!env.RL) return null;
  const ip = request.headers.get("CF-Connecting-IP") || "inconnu";
  const id = await hacher(ip);
  const maintenant = Date.now();
  const cles = [
    { cle: `id:m:${id}:${Math.floor(maintenant / 60000)}`, max: LIMITE_MINUTE, ttl: 120, attente: 60 },
    { cle: `id:j:${id}:${Math.floor(maintenant / 86400000)}`, max: LIMITE_JOUR, ttl: 90000, attente: 3600 },
  ];
  for (const c of cles) {
    const n = Number(await env.RL.get(c.cle)) || 0;
    if (n >= c.max) return c.attente;
  }
  await Promise.all(cles.map(async c => {
    const n = Number(await env.RL.get(c.cle)) || 0;
    await env.RL.put(c.cle, String(n + 1), { expirationTtl: c.ttl });
  }));
  return null;
}

async function appelerPlantNet(url, corps) {
  let derniereErreur = null;
  for (let essai = 0; essai < 2; essai++) {
    try {
      const reponse = await fetch(url, {
        method: "POST", body: corps(), signal: AbortSignal.timeout(DELAI_MS),
      });
      if (reponse.status >= 500) { derniereErreur = `amont_${reponse.status}`; continue; }
      return reponse;
    } catch (e) {
      derniereErreur = e && e.name === "TimeoutError" ? "delai_depasse" : "reseau";
    }
  }
  throw new Error(derniereErreur || "indisponible");
}

export async function onRequestPost({ request, env }) {
  if (!env.PLANTNET_API_KEY) return json({ erreur: "non_configure" }, 503);

  // Filtre d'origine : les appels viennent du site lui-même.
  const origine = request.headers.get("Origin");
  if (origine && origine !== new URL(request.url).origin) {
    return json({ erreur: "origine_refusee" }, 403);
  }

  const taille = Number(request.headers.get("Content-Length")) || 0;
  if (taille > MAX_OCTETS_REQUETE) return json({ erreur: "trop_volumineux" }, 413);
  if (!(request.headers.get("Content-Type") || "").startsWith("multipart/form-data")) {
    return json({ erreur: "format_invalide" }, 415);
  }

  let formulaire;
  try { formulaire = await request.formData(); }
  catch { return json({ erreur: "format_invalide" }, 400); }

  const images = formulaire.getAll("images").filter(f => typeof f === "object" && f !== null);
  if (images.length < 1 || images.length > MAX_IMAGES) return json({ erreur: "nombre_images" }, 400);
  for (const img of images) {
    if (!TYPES_IMAGE.has(img.type)) return json({ erreur: "type_image" }, 415);
    if (img.size <= 0 || img.size > MAX_OCTETS_IMAGE) return json({ erreur: "taille_image" }, 413);
  }
  const organe = String(formulaire.get("organe") || "auto");
  if (!ORGANES.has(organe)) return json({ erreur: "organe_invalide" }, 400);
  const lang = formulaire.get("lang") === "en" ? "en" : "fr";

  // Limitation APRÈS validation : seules les requêtes qui partiront réellement
  // vers Pl@ntNet consomment le quota du visiteur.
  const attente = await depasseLimite(env, request);
  if (attente) return json({ erreur: "trop_de_demandes" }, 429, { "Retry-After": String(attente) });

  const base = env.PLANTNET_URL || URL_PLANTNET;
  const url = `${base}?lang=${lang}&api-key=${encodeURIComponent(env.PLANTNET_API_KEY)}`;
  const corps = () => {
    const fd = new FormData();
    images.forEach(img => { fd.append("images", img); fd.append("organs", organe); });
    return fd;
  };

  let reponse;
  try { reponse = await appelerPlantNet(url, corps); }
  catch (e) { return json({ erreur: "service_indisponible", detail: e.message }, 502); }

  // Pl@ntNet renvoie 404 quand aucune espèce n'est reconnue : ce n'est pas une panne.
  if (reponse.status === 404) return json({ resultats: [], restant: null });
  if (reponse.status === 429) return json({ erreur: "quota_service_epuise" }, 429);
  if (reponse.status === 401 || reponse.status === 403) return json({ erreur: "cle_refusee" }, 502);
  if (!reponse.ok) return json({ erreur: "service_erreur", statut: reponse.status }, 502);

  let donnees;
  try { donnees = await reponse.json(); }
  catch { return json({ erreur: "service_reponse_invalide" }, 502); }

  const resultats = (Array.isArray(donnees.results) ? donnees.results : []).slice(0, 5).map(r => ({
    score: Math.round((Number(r.score) || 0) * 1000) / 1000,
    latin: String(r.species?.scientificNameWithoutAuthor || ""),
    genre: String(r.species?.genus?.scientificNameWithoutAuthor || ""),
    famille: String(r.species?.family?.scientificNameWithoutAuthor || ""),
    noms: (Array.isArray(r.species?.commonNames) ? r.species.commonNames : []).slice(0, 3).map(String),
    gbif: r.gbif?.id ? String(r.gbif.id) : null,
  })).filter(r => r.latin);

  return json({
    resultats,
    restant: Number.isFinite(donnees.remainingIdentificationRequests)
      ? donnees.remainingIdentificationRequests : null,
  });
}
