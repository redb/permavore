/* =========================================================================
   Permavore — module lunaire
   Calcul de la position de la Lune (algorithme simplifié de Meeus, précision
   ~0,2°, largement suffisante pour un calendrier de jardin) afin de fournir :
     - la phase (nouvelle lune → pleine lune) et lune croissante/décroissante ;
     - la lune MONTANTE / DESCENDANTE (déclinaison qui monte ou descend) ;
     - le jour RACINE / FEUILLE / FLEUR / FRUIT (constellation, biodynamie).

   Honnêteté : ces repères relèvent d'une tradition de jardinage (et, pour la
   biodynamie, d'une pratique non démontrée scientifiquement). Les calculs
   astronomiques, eux, sont exacts à la fraction de degré près.

   Libellés bilingues : voir le commentaire en tête de data.js (fonction `bi`,
   définie dans i18n.js, chargé avant ce fichier).
   ========================================================================= */

const RAD = Math.PI / 180;
const SYNODIQUE = 29.530588853;          // durée moyenne d'une lunaison (jours)

// Jour julien à partir d'une Date JS
function jourJulien(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

// Position écliptique de la Lune (longitude et latitude, en degrés)
function positionLune(date) {
  const T = (jourJulien(date) - 2451545) / 36525;
  const norm = a => ((a % 360) + 360) % 360;

  const Lp = norm(218.3164477 + 481267.88123421 * T);   // longitude moyenne
  const D  = norm(297.8501921 + 445267.1114034 * T);    // élongation moyenne
  const M  = norm(357.5291092 + 35999.0502909 * T);     // anomalie moyenne du Soleil
  const Mp = norm(134.9633964 + 477198.8675055 * T);    // anomalie moyenne de la Lune
  const F  = norm(93.272095 + 483202.0175233 * T);      // argument de latitude

  const s = a => Math.sin(a * RAD);

  const lon = norm(Lp
    + 6.289 * s(Mp)
    - 1.274 * s(2 * D - Mp)
    + 0.658 * s(2 * D)
    - 0.186 * s(M)
    - 0.059 * s(2 * Mp - 2 * D)
    - 0.057 * s(Mp - 2 * D + M)
    + 0.053 * s(Mp + 2 * D)
    + 0.046 * s(2 * D - M)
    + 0.041 * s(Mp - M)
    - 0.035 * s(D)
    - 0.031 * s(Mp + M));

  const lat = 5.128 * s(F)
    + 0.281 * s(Mp + F)
    - 0.278 * s(F - Mp)
    - 0.173 * s(F - 2 * D)
    + 0.055 * s(2 * D + F - Mp)
    - 0.046 * s(2 * D - F - Mp)
    + 0.033 * s(F + 2 * D);

  return { lon, lat };
}

// Déclinaison de la Lune (degrés) — sert à savoir si elle monte ou descend
function declinaisonLune(date) {
  const { lon, lat } = positionLune(date);
  const eps = 23.4393 * RAD;
  const sinDec = Math.sin(lat * RAD) * Math.cos(eps)
    + Math.cos(lat * RAD) * Math.sin(eps) * Math.sin(lon * RAD);
  return Math.asin(sinDec) / RAD;
}

// Âge de la lunaison (0 = nouvelle lune) et fraction de cycle
function ageLune(date) {
  // Nouvelle lune de référence : 6 janvier 2000, 18h14 UTC
  const cycles = (jourJulien(date) - 2451550.26) / SYNODIQUE;
  const frac = cycles - Math.floor(cycles);
  return { fraction: frac, age: frac * SYNODIQUE };
}

const PHASES = [
  { max: 1.0,  nom: bi("Nouvelle lune", "New moon"),               emoji: "🌑" },
  { max: 6.4,  nom: bi("Premier croissant", "Waxing crescent"),     emoji: "🌒" },
  { max: 8.4,  nom: bi("Premier quartier", "First quarter"),        emoji: "🌓" },
  { max: 13.8, nom: bi("Gibbeuse croissante", "Waxing gibbous"),    emoji: "🌔" },
  { max: 15.8, nom: bi("Pleine lune", "Full moon"),                 emoji: "🌕" },
  { max: 21.1, nom: bi("Gibbeuse décroissante", "Waning gibbous"),  emoji: "🌖" },
  { max: 23.1, nom: bi("Dernier quartier", "Last quarter"),         emoji: "🌗" },
  { max: 28.5, nom: bi("Dernier croissant", "Waning crescent"),     emoji: "🌘" },
  { max: 30.0, nom: bi("Nouvelle lune", "New moon"),                emoji: "🌑" },
];

// Constellations (sidéral) → élément → type de jour au jardin
const CONSTELLATIONS = [
  { nom: bi("Bélier", "Aries"),       type: "fruit"  }, { nom: bi("Taureau", "Taurus"),      type: "racine" },
  { nom: bi("Gémeaux", "Gemini"),     type: "fleur"  }, { nom: bi("Cancer", "Cancer"),       type: "feuille" },
  { nom: bi("Lion", "Leo"),           type: "fruit"  }, { nom: bi("Vierge", "Virgo"),        type: "racine" },
  { nom: bi("Balance", "Libra"),      type: "fleur"  }, { nom: bi("Scorpion", "Scorpio"),    type: "feuille" },
  { nom: bi("Sagittaire", "Sagittarius"), type: "fruit"  }, { nom: bi("Capricorne", "Capricorn"), type: "racine" },
  { nom: bi("Verseau", "Aquarius"),   type: "fleur"  }, { nom: bi("Poissons", "Pisces"),     type: "feuille" },
];

const TYPES_JOUR = {
  racine:  { label: bi("Jour RACINE", "ROOT day"), pictoJour: "🥕",
    cible: bi("les légumes-racines (carotte, radis, pomme de terre, ail…)", "root vegetables (carrot, radish, potato, garlic…)") },
  feuille: { label: bi("Jour FEUILLE", "LEAF day"), pictoJour: "🥬",
    cible: bi("les légumes-feuilles et aromatiques (salade, épinard, basilic…)", "leafy vegetables and herbs (lettuce, spinach, basil…)") },
  fleur:   { label: bi("Jour FLEUR", "FLOWER day"), pictoJour: "🌸",
    cible: bi("les fleurs et les brocolis / choux-fleurs", "flowers and broccoli / cauliflower") },
  fruit:   { label: bi("Jour FRUIT", "FRUIT day"), pictoJour: "🍅",
    cible: bi("les légumes-fruits et fruitiers (tomate, courgette, fraisier…)", "fruiting vegetables and fruit plants (tomato, zucchini, strawberry…)") },
};

// Ayanamsa (écart tropique → sidéral), ~24,2° pour notre époque
function ayanamsa(date) {
  const T = (jourJulien(date) - 2451545) / 36525;
  return 23.85 + 0.0139 * T * 100;
}

/**
 * Infos lunaires complètes pour une date donnée.
 * @returns {{phase, emoji, age, croissante, montante, typeJour, constellation, conseil}}
 */
function infosLune(date = new Date()) {
  const { fraction, age } = ageLune(date);
  const p = PHASES.find(x => age < x.max) || PHASES[PHASES.length - 1];

  // Montante / descendante : la déclinaison augmente-t-elle sur 24 h ?
  const decAujourdhui = declinaisonLune(date);
  const demain = new Date(date.getTime() + 86400000);
  const montante = declinaisonLune(demain) > decAujourdhui;

  // Constellation sidérale → type de jour
  const lonSiderale = ((positionLune(date).lon - ayanamsa(date)) % 360 + 360) % 360;
  const c = CONSTELLATIONS[Math.floor(lonSiderale / 30)];

  return {
    phase: p.nom,
    emoji: p.emoji,
    age: Math.round(age * 10) / 10,
    croissante: fraction < 0.5,
    montante,
    constellation: c.nom,
    typeJour: c.type,
    ...TYPES_JOUR[c.type],
    conseil: bi(
      montante
        ? "Lune montante : la sève monte — favorable aux semis, greffes et récoltes de fruits."
        : "Lune descendante : la sève redescend — favorable aux plantations, repiquages, tailles et travail du sol.",
      montante
        ? "Ascending moon: the sap rises — favorable for sowing, grafting and harvesting fruit."
        : "Descending moon: the sap goes back down — favorable for planting, transplanting, pruning and soil work."
    ),
  };
}

/** Prochaine date (dans les N jours) dont le type de jour correspond. */
function prochainJour(type, depuis = new Date(), maxJours = 30) {
  for (let i = 0; i <= maxJours; i++) {
    const d = new Date(depuis.getTime() + i * 86400000);
    if (infosLune(d).typeJour === type) return d;
  }
  return null;
}

/** Type de jour lunaire correspondant à une plante. */
function typeLunairePlante(plante) {
  if (plante.typeLunaire) return plante.typeLunaire;
  return "feuille"; // repli neutre si la donnée manque
}
