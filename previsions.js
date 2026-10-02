/*
   Permavore — couche navigateur des prévisions à 7 jours.

   Même règle d'or que le climat : la fiche s'affiche sans attendre ; les
   prévisions arrivent ensuite et, si elles n'arrivent pas, la fiche garde sa
   note générique. Un appel par maille et par tranche de trois heures, mémoire
   de page puis localStorage (clé de confort, jamais exportée).
*/

import { signaux, verdict } from "./previsions-core.mjs";

const CLE = "permavore.previsions.v1";
const DUREE_MS = 3 * 3600 * 1000;
const maille = (lat, lng) => `${Math.round(lat * 10) / 10},${Math.round(lng * 10) / 10}`;
const etat = { parMaille: new Map(), enVol: new Map() };

function lireLocal() {
  try { return JSON.parse(localStorage.getItem(CLE) || "{}"); } catch { return {}; }
}
function ecrireLocal(m, entree) {
  try {
    const tout = lireLocal();
    tout[m] = entree;
    // On ne garde que les quatre dernières mailles : un jardinier, un ou deux lieux.
    const cles = Object.keys(tout).sort((a, b) => (tout[b].recuLe || 0) - (tout[a].recuLe || 0)).slice(0, 4);
    localStorage.setItem(CLE, JSON.stringify(Object.fromEntries(cles.map(k => [k, tout[k]]))));
  } catch { /* confort seulement */ }
}

function valide(entree) { return entree && entree.prev && (Date.now() - (entree.recuLe || 0)) < DUREE_MS; }

export async function chargerPrevisions(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const m = maille(lat, lng);
  const enMemoire = etat.parMaille.get(m);
  if (valide(enMemoire)) return enMemoire.prev;
  const local = lireLocal()[m];
  if (valide(local)) { etat.parMaille.set(m, local); return local.prev; }
  if (etat.enVol.has(m)) return etat.enVol.get(m);
  const p = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(`/api/previsions?lat=${m.split(",")[0]}&lng=${m.split(",")[1]}`, { signal: ctrl.signal });
      if (!r.ok) return null;
      const prev = await r.json();
      if (!prev || !prev.jours) return null;
      const entree = { prev, recuLe: Date.now() };
      etat.parMaille.set(m, entree);
      ecrireLocal(m, entree);
      document.dispatchEvent(new CustomEvent("previsions:maj", { detail: { maille: m, prev } }));
      return prev;
    } catch { return null; }
    finally { clearTimeout(t); etat.enVol.delete(m); }
  })();
  etat.enVol.set(m, p);
  return p;
}

/** Lecture synchrone : ce qu'on a déjà, sans appel. */
export function previsionsConnues(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const e = etat.parMaille.get(maille(lat, lng));
  return valide(e) ? e.prev : null;
}

window.Previsions = { charger: chargerPrevisions, connues: previsionsConnues, signaux, verdict };
