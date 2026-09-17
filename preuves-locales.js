/* =========================================================================
   Permavore — preuves locales

   Une observation est une DONNÉE : succès ou échec, année, lieu, environnement,
   variété, source. Le statut local, lui, est une CONCLUSION tirée d'un ensemble
   de preuves. Les deux ne doivent jamais être confondus :

       un échec isolé ne rend pas une culture « expérimentale » ;
       un succès isolé ne la rend pas « éprouvée ».

   Les observations de jardiniers ne sont pas la vérité de référence : elles
   forment UNE couche de preuve parmi d'autres. Une référence d'institut
   technique, un essai variétal ou un historique horticole documenté pèsent
   davantage, parce qu'ils reposent déjà sur une répétition.

   Portée mondiale : une preuve est située par coordonnées et ne vaut que dans
   son voisinage, jamais par commune ou par pays.
   ========================================================================= */

// Rayon au-delà duquel une preuve ne dit plus rien du lieu considéré : vallée,
// altitude ou littoral changent la donne. Heuristique du moteur, pas une donnée.
const RAYON_PREUVE_KM = 25;

// Types de preuve, du plus institutionnel au plus individuel. Les types
// « forts » reposent déjà sur une répétition ou un protocole ; une observation
// de jardinier vaut par le nombre.
const TYPES_PREUVE = {
  litteratureAgronomique:  { fort: true },
  essaiVarietal:           { fort: true },
  institutTechnique:       { fort: true },
  universite:              { fort: true },
  serviceAgricole:         { fort: true },
  referenceProfessionnelle:{ fort: true },
  historiqueHorticole:     { fort: true },
  observationJardinier:    { fort: false },
};

// Ce qu'une preuve peut établir.
const RESULTATS_PREUVE = ["echec", "pousse", "recolte", "recolteReguliere"];

const PREUVES_LOCALES = [
  {
    type: "observationJardinier",
    cultureId: "patate-douce",
    lieu: { nom: "Rumilly (Haute-Savoie, France)", lat: 45.866, lng: 5.941, altitude: 340 },
    environnement: "pleine_terre",
    variete: null,
    resultat: "pousse",
    date: "2026",
    source: "Jean-Bruno Ricard, jardinier sur place",
    confiance: "haute",
    note: "Observation directe : la patate douce pousse à Rumilly. Elle porte sur la croissance, pas sur un niveau de rendement, et n'est donc pas présentée comme une garantie de récolte.",
  },
];

/** Distance orthodromique en kilomètres (formule de haversine). */
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Preuves concernant une culture autour d'un point, de la plus proche à la plus
 * lointaine. Sans coordonnées, rien : une preuve hors de son voisinage ne dit
 * rien du lieu.
 */
function preuvesPour(cultureId, lat, lng, options = {}) {
  const rayon = Number.isFinite(options.rayonKm) ? options.rayonKm : RAYON_PREUVE_KM;
  if (!cultureId || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return PREUVES_LOCALES
    .filter(p => p.cultureId === cultureId)
    .filter(p => !options.environnement || !p.environnement || p.environnement === options.environnement)
    .map(p => ({ ...p, fort: !!TYPES_PREUVE[p.type]?.fort,
                 distance: Math.round(distanceKm(lat, lng, p.lieu.lat, p.lieu.lng)) }))
    .filter(p => p.distance <= rayon)
    .sort((a, b) => (b.fort - a.fort) || (a.distance - b.distance));
}

if (typeof window !== "undefined") {
  window.PreuvesLocales = {
    preuvesPour, distanceKm, RAYON_PREUVE_KM, TYPES_PREUVE, RESULTATS_PREUVE,
    toutes: PREUVES_LOCALES,
  };
}
