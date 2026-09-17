/* =========================================================================
   Permavore — retours de jardiniers

   Un seuil agronomique dit ce qu'une culture réclame « en général ». Un
   jardinier qui la cultive dit ce qu'elle fait ICI. Quand les deux existent,
   l'observation locale l'emporte sur le modèle pour ce lieu : c'est la
   définition même d'« éprouvé » (réussite établie localement), et c'est
   souvent la seule information disponible là où la littérature se tait.

   Ce n'est PAS de la science, et ce fichier ne prétend pas le contraire :
   chaque retour est attribué à quelqu'un, daté, situé, et affiché comme un
   témoignage — jamais transformé en valeur agronomique chiffrée. On n'écrit
   ici que ce que la personne a dit, sans l'extrapoler : « pousse » ne devient
   pas « rendement abondant », et un retour ne vaut que dans son voisinage.

   Portée volontairement mondiale : un lieu est un couple de coordonnées et un
   rayon, pas une commune française.
   ========================================================================= */

// Rayon par défaut d'un retour : au-delà, le climat peut être franchement
// différent (vallée, altitude, littoral). Volontairement modeste.
const RAYON_RETOUR_KM = 25;

// Ce qu'un retour peut affirmer, du plus faible au plus fort.
const RESULTATS_RETOUR = ["echec", "pousse", "recolte", "recolteReguliere"];

const RETOURS_LOCAUX = [
  {
    cultureId: "patate-douce",
    lieu: { nom: "Rumilly (Haute-Savoie, France)", lat: 45.866, lng: 5.941, altitude: 340 },
    resultat: "pousse",
    annee: 2026,
    source: "Jean-Bruno Ricard, jardinier sur place",
    confiance: "haute",
    note: "Retour direct du jardinier : la patate douce pousse à Rumilly. Le retour porte sur la croissance, pas sur un niveau de rendement — il n'est donc pas présenté comme une garantie de récolte abondante.",
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
 * Retours concernant une culture, à proximité d'un point, du plus proche au
 * plus lointain. Sans coordonnées, on ne renvoie rien : un retour hors de son
 * voisinage ne veut rien dire.
 */
function retoursPour(cultureId, lat, lng, rayonKm = RAYON_RETOUR_KM) {
  if (!cultureId || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return RETOURS_LOCAUX
    .filter(r => r.cultureId === cultureId)
    .map(r => ({ ...r, distance: Math.round(distanceKm(lat, lng, r.lieu.lat, r.lieu.lng)) }))
    .filter(r => r.distance <= rayonKm)
    .sort((a, b) => a.distance - b.distance);
}

if (typeof window !== "undefined") {
  window.RetoursLocaux = { retoursPour, distanceKm, RAYON_RETOUR_KM, RESULTATS_RETOUR, tous: RETOURS_LOCAUX };
}
