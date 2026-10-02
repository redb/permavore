/*
   Permavore — prévisions à 7 jours : noyau pur, testable.

   Rôle : transformer la réponse quotidienne d'Open-Meteo en quelques signaux
   que la fiche d'une culture peut lire — gel annoncé, gelée au sol possible,
   forte chaleur — et en un verdict court. Rien ici ne promet au-delà de la
   fenêtre de prévision : sept jours, c'est ce que les modèles savent, et un
   semis qui lève en quinze n'est couvert qu'à moitié. Le texte le dit.
*/

export const VERSION_PREVISIONS = "1";
export const SEUIL_GEL = 0;        // °C, minimale sous abri → gel annoncé
export const SEUIL_GELEE_SOL = 3;  // °C, sous 3 °C à 2 m, le sol peut geler par ciel clair
export const SEUIL_CHALEUR = 32;   // °C, maximale → semis et jeunes plants souffrent
export const SEUIL_PLUIE_MM = 5;   // mm/jour, journée marquée pluie

/** Compacte la réponse `daily` d'Open-Meteo. Renvoie null si inexploitable. */
export function compacter(daily, { source = "Open-Meteo", calculeLe = new Date().toISOString() } = {}) {
  if (!daily || !Array.isArray(daily.time)) return null;
  const n = daily.time.length;
  const num = (arr, i) => (Array.isArray(arr) && Number.isFinite(arr[i])) ? arr[i] : null;
  const jours = [];
  for (let i = 0; i < n; i++) {
    const tmin = num(daily.temperature_2m_min, i), tmax = num(daily.temperature_2m_max, i);
    if (tmin === null || tmax === null) continue;
    jours.push({
      date: daily.time[i], tmin, tmax,
      pluie: num(daily.precipitation_sum, i) ?? 0,
      proba: num(daily.precipitation_probability_max, i),
    });
  }
  if (!jours.length) return null;
  return { version: VERSION_PREVISIONS, source, calculeLe, jours, horizonJours: jours.length };
}

/** Signaux lisibles par le moteur : premier jour de gel, de gelée au sol, de chaleur. */
export function signaux(prev) {
  if (!prev || !prev.jours) return null;
  const premier = (test) => prev.jours.find(test) || null;
  return {
    gel: premier(j => j.tmin <= SEUIL_GEL),
    geleeSol: premier(j => j.tmin <= SEUIL_GELEE_SOL),
    chaleur: premier(j => j.tmax >= SEUIL_CHALEUR),
    pluieCumul: Math.round(prev.jours.reduce((s, j) => s + (j.pluie || 0), 0)),
    tminMin: Math.min(...prev.jours.map(j => j.tmin)),
    tmaxMax: Math.max(...prev.jours.map(j => j.tmax)),
    horizonJours: prev.horizonJours,
  };
}

/**
 * Verdict pour une culture donnée. `plante.frileux` : sensible au gel.
 * `statut` : "now" | "soon" | "later" (fenêtre calendaire).
 * Renvoie { code, jour } ; le libellé est à la charge de l'interface (i18n).
 *   attendre_gel   : frileuse, gel annoncé → ne sème/plante pas dehors
 *   prudence_gelee : frileuse, gelée au sol possible → voile ou attendre
 *   chaleur        : forte chaleur annoncée → semer le soir, arroser, ombrer
 *   rien           : rien d'alarmant sur l'horizon
 */
export function verdict(plante, prev, statut = "now") {
  const s = signaux(prev);
  if (!s) return { code: "inconnu", jour: null };
  if (statut === "later") return { code: "rien", jour: null };
  if (plante && plante.frileux) {
    if (s.gel) return { code: "attendre_gel", jour: s.gel };
    if (s.geleeSol) return { code: "prudence_gelee", jour: s.geleeSol };
  }
  if (s.chaleur) return { code: "chaleur", jour: s.chaleur };
  return { code: "rien", jour: null };
}
