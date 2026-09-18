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

/* =========================================================================
   Position apparente de la Lune pour un observateur, et exposition nocturne.

   Ces calculs servent l'« Expérience Lune » : pour comparer honnêtement deux
   semis, il faut enregistrer ce que la Lune faisait RÉELLEMENT au-dessus du
   jardin — pas seulement une étiquette « pleine lune ». Une pleine lune qui
   reste sous l'horizon n'éclaire rien.

   Tout est calculé en local, sans aucun appel réseau.
   ========================================================================= */

/** Temps sidéral apparent à Greenwich, en degrés. */
function tempsSideralGreenwich(date) {
  const jj = jourJulien(date);
  const T = (jj - 2451545) / 36525;
  const theta = 280.46061837 + 360.98564736629 * (jj - 2451545)
    + 0.000387933 * T * T - (T * T * T) / 38710000;
  return ((theta % 360) + 360) % 360;
}

/** Ascension droite et déclinaison de la Lune, en degrés. */
function equatorialesLune(date) {
  const { lon, lat } = positionLune(date);
  const eps = 23.4393 * RAD;
  const l = lon * RAD, b = lat * RAD;
  const ad = Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l));
  return { ascensionDroite: (((ad / RAD) % 360) + 360) % 360, declinaison: dec / RAD };
}

/** Hauteur de la Lune au-dessus de l'horizon, en degrés (négative = couchée). */
function altitudeLune(date, latitude, longitude) {
  const { ascensionDroite, declinaison } = equatorialesLune(date);
  const angleHoraire = (tempsSideralGreenwich(date) + longitude - ascensionDroite) * RAD;
  const phi = latitude * RAD, dec = declinaison * RAD;
  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(angleHoraire);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
}

/** Hauteur du Soleil, pour distinguer la nuit du jour. */
function altitudeSoleil(date, latitude, longitude) {
  const jj = jourJulien(date);
  const n = jj - 2451545;
  const L = ((280.46 + 0.9856474 * n) % 360 + 360) % 360;
  const g = (((357.528 + 0.9856003 * n) % 360 + 360) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = 23.4393 * RAD;
  const ad = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const angleHoraire = (tempsSideralGreenwich(date) + longitude - ((ad / RAD) % 360 + 360) % 360) * RAD;
  const phi = latitude * RAD;
  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(angleHoraire);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
}

/**
 * Fraction du disque lunaire éclairée, de 0 (nouvelle lune) à 1 (pleine lune).
 * Dérivée de l'âge de la lunaison : suffisante pour caractériser un semis, et
 * cohérente avec le reste du module.
 */
function fractionEclairee(date) {
  const { age } = ageLune(date);
  return (1 - Math.cos((2 * Math.PI * age) / SYNODIQUE)) / 2;
}

/**
 * Lever et coucher de la Lune autour d'une date, par balayage au pas de dix
 * minutes. Renvoie null quand l'astre ne franchit pas l'horizon ce jour-là —
 * cela arrive réellement aux hautes latitudes, et on ne l'invente pas.
 */
function leverCoucherLune(date, latitude, longitude) {
  const debut = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const pas = 10 * 60000;
  let lever = null, coucher = null;
  let precedente = altitudeLune(debut, latitude, longitude);
  for (let t = pas; t <= 86400000; t += pas) {
    const instant = new Date(debut.getTime() + t);
    const courante = altitudeLune(instant, latitude, longitude);
    if (precedente < 0 && courante >= 0 && !lever) lever = instant;
    if (precedente >= 0 && courante < 0 && !coucher) coucher = instant;
    precedente = courante;
  }
  return { lever, coucher };
}

/**
 * Heures pendant lesquelles la Lune est au-dessus de l'horizon ALORS QUE le
 * Soleil est couché. C'est la seule durée qui a un sens pour une hypothèse
 * d'influence lumineuse : une pleine lune en plein jour n'éclaire pas un semis.
 */
function expositionNocturne(date, latitude, longitude) {
  const debut = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const pas = 10 * 60000;
  let minutes = 0;
  for (let t = 0; t < 86400000; t += pas) {
    const instant = new Date(debut.getTime() + t);
    if (altitudeLune(instant, latitude, longitude) > 0
      && altitudeSoleil(instant, latitude, longitude) < -6) {   // crépuscule civil
      minutes += 10;
    }
  }
  return Math.round((minutes / 60) * 10) / 10;
}

/**
 * Photographie astronomique complète d'un instant et d'un lieu. C'est ce qu'on
 * fige au moment d'un semis : des mesures, pas une catégorie. Une analyse
 * ultérieure pourra toujours en tirer des catégories ; l'inverse est impossible.
 */
function releveLunaire(date, latitude, longitude) {
  const { age } = ageLune(date);
  const { lever, coucher } = leverCoucherLune(date, latitude, longitude);
  return {
    quand: date.toISOString(),
    latitude, longitude,
    ageJours: Math.round(age * 1000) / 1000,
    fractionEclairee: Math.round(fractionEclairee(date) * 1000) / 1000,
    altitudeDeg: Math.round(altitudeLune(date, latitude, longitude) * 10) / 10,
    declinaisonDeg: Math.round(declinaisonLune(date) * 10) / 10,
    lever: lever ? lever.toISOString() : null,
    coucher: coucher ? coucher.toISOString() : null,
    expositionNocturneHeures: expositionNocturne(date, latitude, longitude),
    cycleSynodiqueJours: SYNODIQUE,
    // La couverture nuageuse déciderait de l'exposition RÉELLE, mais elle
    // demanderait un appel réseau par date : elle reste à renseigner plus tard.
    couvertureNuageusePct: null,
  };
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

if (typeof window !== "undefined") {
  window.Lune = {
    infosLune, prochainJour, typeLunairePlante,
    ageLune, fractionEclairee, altitudeLune, altitudeSoleil,
    leverCoucherLune, expositionNocturne, releveLunaire,
    SYNODIQUE,
  };
}
