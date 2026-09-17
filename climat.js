/*
   Permavore — couche navigateur du climat.

   Règle d'or : l'affichage « Que planter chez toi ? » ne dépend jamais de ce
   module. Les recommandations sortent immédiatement ; la couche climatique
   arrive après, et si elle n'arrive pas, l'application fonctionne sans elle.

   Tout le calcul est fait au bord du réseau (functions/api/climat.js) et
   mutualisé entre utilisateurs d'un même secteur : le navigateur ne reçoit
   qu'un petit objet d'indicateurs, jamais les séries quotidiennes.
*/

import { compatibiliteActuelle, tendance, DEFINITIONS } from "./climat-core.mjs";

/*
   FRUGALITÉ. Le climat change lentement ; naviguer dans Permavore ne doit
   jamais déclencher une collecte. Ouvrir une autre culture, bouger un curseur,
   enraciner, ouvrir le plan, recharger l'application : zéro appel tant qu'un
   profil valide existe.

   Le profil appartient à la MAILLE, pas à la culture : il est calculé une fois
   et sert à toutes les cultures.

   Trois niveaux, du moins cher au plus cher :
     1. mémoire de la page ;
     2. cache IndexedDB, séparé des données du jardin et jetable ;
     3. réseau — et là, une seule requête à la fois par maille (single-flight).

   L'invalidation ne repose pas sur une minuterie mais sur la CLÉ : maille,
   version du moteur, fenêtres, modèles, variables. Publier une correction de
   style ne change pas la clé, donc ne provoque aucun appel.
*/

import { cleCacheClimat, VERSION_MOTEUR_CLIMAT } from "./climat-core.mjs";

const GRILLE = 0.1;
const grille = (v) => Math.round(v / GRILLE) * GRILLE;
const maille = (lat, lng) => `${grille(lat).toFixed(1)},${grille(lng).toFixed(1)}`;

// Un profil observé reste scientifiquement exploitable très longtemps : ces
// normales bougent à l'échelle de la décennie. La fraîcheur réelle est portée
// par la clé, pas par cette durée, qui n'est qu'un garde-fou.
const FRAICHEUR_MS = 180 * 24 * 3600 * 1000;

// Compteurs techniques — aucun suivi d'utilisateur, seulement de quoi répondre
// à « combien d'appels un millier de jardiniers produit-il ? ».
const compteurs = { memoire: 0, indexeddb: 0, reseau: 0, echecs: 0, perime: 0, attentesPartagees: 0 };

const etat = {
  donnees: null, statut: "inactif", maille: null, cle: null,
  dateCalcul: null, perime: false,
  echecs: 0, prochainEssai: 0,
};

// Requêtes en vol, par maille : dix demandes simultanées ne font qu'un appel.
const enVol = new Map();

function prevenir() {
  document.dispatchEvent(new CustomEvent("climat:maj",
    { detail: { statut: etat.statut, perime: etat.perime, dateCalcul: etat.dateCalcul } }));
}

/** Attente croissante après échec, avec un peu d'aléa pour ne pas synchroniser
    tous les navigateurs du monde sur la même seconde. */
function planifierNouvelEssai() {
  etat.echecs = Math.min(etat.echecs + 1, 6);
  const base = Math.min(60000 * 2 ** (etat.echecs - 1), 6 * 3600 * 1000);
  etat.prochainEssai = Date.now() + base * (0.75 + Math.random() * 0.5);
}

async function depuisReseau(lat, lng, cle, m) {
  if (enVol.has(m)) { compteurs.attentesPartagees++; return enVol.get(m); }
  const p = (async () => {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), 30000);
    try {
      compteurs.reseau++;
      const r = await fetch(`/api/climat?lat=${lat}&lng=${lng}`, { signal: ctrl.signal });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      if (!d?.profilClimatiqueLieu) throw new Error("profil_absent");
      const entree = {
        maille: m, cle, profil: d.profilClimatiqueLieu, projection: d.projectionClimatiqueLieu,
        climat: d.climat, zoneInterne: d.zoneInterne, tracabilite: d.tracabilite,
        dateCalcul: new Date().toISOString(), versionMoteur: VERSION_MOTEUR_CLIMAT,
      };
      const { ecrireClimatCache } = await import("./stockage.js");
      await ecrireClimatCache(cle, entree);
      return entree;
    } finally { clearTimeout(minuteur); enVol.delete(m); }
  })();
  enVol.set(m, p);
  return p;
}

function poser(entree, perime) {
  etat.donnees = {
    lieu: { latitude: Number(entree.maille.split(",")[0]), longitude: Number(entree.maille.split(",")[1]) },
    profilClimatiqueLieu: entree.profil, projectionClimatiqueLieu: entree.projection,
    climat: entree.climat, zoneInterne: entree.zoneInterne, tracabilite: entree.tracabilite,
  };
  etat.dateCalcul = entree.dateCalcul;
  etat.perime = !!perime;
  etat.statut = "pret";
  etat.echecs = 0;
}

/**
 * Charge le profil climatique de la maille. Ne bloque rien, ne lève jamais,
 * et n'appelle la source que si aucun profil réutilisable n'existe.
 */
export async function chargerClimat(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const m = maille(lat, lng);

  const { lireClimatCache, dernierClimatPourMaille } = await import("./stockage.js");
  // La clé décrit ce qui a servi au calcul ; le serveur fait autorité sur les
  // fenêtres, mais elles sont déterministes, donc reproductibles ici.
  const annee = new Date().getUTCFullYear();
  const cle = cleCacheClimat({
    maille: m,
    fenetreObservee: `${annee - 20}-${annee - 1}`,
    fenetreFuture: `${annee + 5}-${annee + 14}`,
    modeles: ["EC_Earth3P_HR", "MRI_AGCM3_2_S"],
    variables: ["tmin", "tmax", "precip"],
  });

  // 1. mémoire de la page
  if (etat.cle === cle && etat.statut === "pret") { compteurs.memoire++; return etat.donnees; }
  etat.maille = m; etat.cle = cle;

  // 2. cache local durable
  const enCache = await lireClimatCache(cle);
  if (enCache && Date.now() - Date.parse(enCache.dateCalcul) < FRAICHEUR_MS) {
    compteurs.indexeddb++; poser(enCache, false); prevenir(); return etat.donnees;
  }

  // 3. réseau — sauf si un échec récent impose d'attendre
  if (Date.now() < etat.prochainEssai) {
    const vieux = enCache || await dernierClimatPourMaille(m);
    if (vieux) { compteurs.perime++; poser(vieux, true); prevenir(); return etat.donnees; }
    etat.statut = "indisponible"; prevenir(); return null;
  }

  etat.statut = etat.donnees ? "pret" : "chargement"; prevenir();
  try {
    const frais = await depuisReseau(lat, lng, cle, m);
    poser(frais, false);
  } catch {
    compteurs.echecs++;
    planifierNouvelEssai();
    // Un profil ancien vaut mieux qu'aucun profil : on l'affiche avec sa date.
    const vieux = enCache || await dernierClimatPourMaille(m);
    if (vieux) { compteurs.perime++; poser(vieux, true); }
    else { etat.donnees = null; etat.statut = "indisponible"; }
  }
  prevenir();
  return etat.donnees;
}

const profil = () => etat.donnees?.profilClimatiqueLieu || null;
const projection = () => etat.donnees?.projectionClimatiqueLieu || null;

/** Preuves locales autour du point courant, pour cette culture. */
function preuvesLocales(cultureId, environnement) {
  const l = etat.donnees?.lieu;
  if (!l || !window.PreuvesLocales) return [];
  return window.PreuvesLocales.preuvesPour(cultureId, l.latitude, l.longitude, { environnement });
}

/**
 * Compatibilité d'une culture DANS UN ENVIRONNEMENT donné (pleine terre par
 * défaut). Un abri dont on ne sait rien ne rend jamais le verdict meilleur :
 * il le rend indéterminé, et la raison est renvoyée telle quelle.
 */
function compatibilite(culture, cultureId, typeEnvironnement = "pleine_terre", declare = {}) {
  const p = profil();
  if (!p || !culture) return null;
  const env = window.Environnements
    ? window.Environnements.environnementCulture(typeEnvironnement, declare) : null;
  const sous = window.Environnements
    ? window.Environnements.profilSousEnvironnement(p, env) : { profil: p, connu: true };
  if (!sous.connu) {
    return { compatibilite: "indeterminee", statutLocal: "indetermine", confiance: "faible",
      dimensions: {}, dimensionsDocumentees: 0, contradiction: false,
      environnement: env, raison: sous.raison };
  }
  const r = compatibiliteActuelle(culture, sous.profil, preuvesLocales(cultureId, typeEnvironnement));
  return { ...r, environnement: env };
}

/** Tendance à +5 ans — « indisponible » tant que tout n'est pas réuni. */
function tendanceCulture(culture) {
  const p = profil();
  if (!p || !culture) return { sens: "indisponible", raison: "pas_de_projection", effets: [] };
  return tendance(culture, p, projection());
}

window.Climat = {
  charger: chargerClimat,
  profil, projection,
  compatibilite, tendance: tendanceCulture, preuvesLocales,
  climat: () => etat.donnees?.climat || null,
  zoneInterne: () => etat.donnees?.zoneInterne || null,
  tracabilite: () => etat.donnees?.tracabilite || null,
  statut: () => etat.statut,
  perime: () => etat.perime,
  dateCalcul: () => etat.dateCalcul,
  compteurs: () => ({ ...compteurs }),
  versionMoteur: VERSION_MOTEUR_CLIMAT,
  definitions: DEFINITIONS,
};
document.dispatchEvent(new CustomEvent("climat:pret"));
