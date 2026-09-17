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

const CLE_CACHE = "permavore.climat.v2";
const DUREE_CACHE = 30 * 24 * 3600 * 1000;
const GRILLE = 0.1;
const grille = (v) => Math.round(v / GRILLE) * GRILLE;

const etat = {
  donnees: null,        // { profilClimatiqueLieu, projectionClimatiqueLieu, climat, tracabilite }
  statut: "inactif",    // inactif | chargement | pret | indisponible
  cle: null,
  dernierEchec: 0,
};

function lireCache(cle) {
  try {
    const brut = localStorage.getItem(`${CLE_CACHE}.${cle}`);
    if (!brut) return null;
    const { t, d } = JSON.parse(brut);
    if (!t || Date.now() - t > DUREE_CACHE) return null;
    return d;
  } catch { return null; }
}

function ecrireCache(cle, d) {
  try {
    localStorage.setItem(`${CLE_CACHE}.${cle}`, JSON.stringify({ t: Date.now(), d }));
  } catch { /* quota plein ou stockage refusé : le cache est un confort */ }
}

function prevenir() {
  document.dispatchEvent(new CustomEvent("climat:maj", { detail: { statut: etat.statut } }));
}

/**
 * Charge le profil climatique du lieu. Ne bloque rien, ne lève jamais.
 * Un échec est réessayable au bout d'une minute : une panne passagère ne doit
 * pas condamner la session entière.
 */
export async function chargerClimat(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cle = `${grille(lat).toFixed(1)},${grille(lng).toFixed(1)}`;
  if (etat.cle === cle && (etat.statut === "pret" || etat.statut === "chargement")) {
    return etat.donnees;
  }
  if (etat.statut === "indisponible" && Date.now() - etat.dernierEchec < 60000) return null;

  const enCache = lireCache(cle);
  if (enCache) {
    etat.donnees = enCache; etat.cle = cle; etat.statut = "pret";
    prevenir(); return enCache;
  }

  etat.cle = cle; etat.statut = "chargement"; prevenir();
  try {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), 30000);
    const r = await fetch(`/api/climat?lat=${lat}&lng=${lng}`, { signal: ctrl.signal });
    clearTimeout(minuteur);
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    if (!d?.profilClimatiqueLieu) throw new Error("profil_absent");
    etat.donnees = d; etat.statut = "pret";
    ecrireCache(cle, d);
  } catch {
    etat.donnees = null; etat.statut = "indisponible"; etat.dernierEchec = Date.now();
  }
  prevenir();
  return etat.donnees;
}

const profil = () => etat.donnees?.profilClimatiqueLieu || null;
const projection = () => etat.donnees?.projectionClimatiqueLieu || null;

/** Retours de jardiniers autour du point courant, pour cette culture. */
function retoursLocaux(cultureId) {
  const l = etat.donnees?.lieu;
  if (!l || !window.RetoursLocaux) return [];
  return window.RetoursLocaux.retoursPour(cultureId, l.latitude, l.longitude);
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
  const r = compatibiliteActuelle(culture, sous.profil, retoursLocaux(cultureId));
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
  compatibilite, tendance: tendanceCulture, retoursLocaux,
  climat: () => etat.donnees?.climat || null,
  zoneInterne: () => etat.donnees?.zoneInterne || null,
  tracabilite: () => etat.donnees?.tracabilite || null,
  statut: () => etat.statut,
  definitions: DEFINITIONS,
};
document.dispatchEvent(new CustomEvent("climat:pret"));
