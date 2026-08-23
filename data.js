/* =========================================================================
   Jardin Nourricier — base de données plantes + zones climatiques
   Données éditoriales (à valider / enrichir). Calendrier = France métropole.
   Les fenêtres de semis/plantation sont exprimées en mois [début, fin]
   pour une zone TEMPÉRÉE de référence, puis décalées selon la zone.
   ========================================================================= */

// --- Zones climatiques (décalage en mois appliqué à la fenêtre de référence) ---
// debut : décale le début de la fenêtre (négatif = plus tôt, positif = plus tard)
// fin   : décale la fin de la fenêtre
//
// Affinage par variété : le décalage n'est PAS le même pour toutes les plantes.
// Une plante frileuse (tomate, basilic, haricot…) est calée sur la date des
// dernières gelées, qui varie fortement d'une zone à l'autre. Une plante
// rustique (radis, mâche, épinard, fève…) est calée sur la température du sol
// et la lumière, qui varient beaucoup moins : elle ne doit pas être retardée
// d'un mois entier sous prétexte qu'on est en Alsace.
//   frileux  : décalage appliqué aux plantes `frileux:true`
//   rustique : décalage appliqué aux autres
// `debut`/`fin` restent le repli si l'un des deux blocs manque.
const ZONES = {
  mediterraneen: { label: "Méditerranéen", emoji: "🌞", debut: -1, fin: 1,
    frileux: { debut: -1, fin: 1 }, rustique: { debut: -1, fin: 1 },
    note: "Hivers doux, étés chauds et secs. Saison longue." },
  oceanique: { label: "Océanique (doux, humide)", emoji: "🌊", debut: 0, fin: 0,
    frileux: { debut: 0, fin: 0 }, rustique: { debut: -1, fin: 0 },
    note: "Hivers doux, pluies fréquentes, gelées rares." },
  tempere: { label: "Tempéré (référence)", emoji: "🍃", debut: 0, fin: 0,
    frileux: { debut: 0, fin: 0 }, rustique: { debut: 0, fin: 0 },
    note: "Climat de référence (Bassin parisien, Centre, Nord)." },
  continental: { label: "Continental (hivers froids)", emoji: "❄️", debut: 1, fin: 0,
    frileux: { debut: 1, fin: 0 }, rustique: { debut: 0, fin: 0 },
    note: "Hivers froids, gelées tardives : les frileuses attendent, pas les rustiques." },
  montagne: { label: "Montagne (saison courte)", emoji: "⛰️", debut: 1, fin: -1,
    frileux: { debut: 2, fin: -1 }, rustique: { debut: 1, fin: -1 },
    note: "Saison très courte, gel possible tard. Espèces frileuses à éviter." },
};

// --- Correspondance villes -> zone (échantillon élargi, minuscules sans accents) ---
const VILLES_ZONES = {
  // Méditerranéen
  "marseille": "mediterraneen", "nice": "mediterraneen", "toulon": "mediterraneen",
  "montpellier": "mediterraneen", "perpignan": "mediterraneen", "nimes": "mediterraneen",
  "aix-en-provence": "mediterraneen", "aix en provence": "mediterraneen", "avignon": "mediterraneen",
  "cannes": "mediterraneen", "antibes": "mediterraneen", "beziers": "mediterraneen",
  "arles": "mediterraneen", "frejus": "mediterraneen", "hyeres": "mediterraneen",
  "menton": "mediterraneen", "bastia": "mediterraneen", "ajaccio": "mediterraneen",
  "sete": "mediterraneen", "narbonne": "mediterraneen", "carcassonne": "mediterraneen",
  // Océanique
  "brest": "oceanique", "rennes": "oceanique", "nantes": "oceanique", "lorient": "oceanique",
  "quimper": "oceanique", "vannes": "oceanique", "saint-nazaire": "oceanique",
  "la rochelle": "oceanique", "bordeaux": "oceanique", "bayonne": "oceanique",
  "biarritz": "oceanique", "saint-malo": "oceanique", "cherbourg": "oceanique",
  "la roche-sur-yon": "oceanique", "les sables-d'olonne": "oceanique", "arcachon": "oceanique",
  "lannion": "oceanique", "saint-brieuc": "oceanique", "pau": "oceanique", "angouleme": "oceanique",
  // Tempéré
  "paris": "tempere", "orleans": "tempere", "tours": "tempere", "le mans": "tempere",
  "angers": "tempere", "poitiers": "tempere", "lille": "tempere", "amiens": "tempere",
  "rouen": "tempere", "le havre": "tempere", "caen": "tempere", "chartres": "tempere",
  "blois": "tempere", "bourges": "tempere", "chateauroux": "tempere", "versailles": "tempere",
  "cergy": "tempere", "evry": "tempere", "melun": "tempere", "limoges": "tempere",
  "niort": "tempere", "laval": "tempere", "beauvais": "tempere",
  // Continental
  "strasbourg": "continental", "metz": "continental", "nancy": "continental",
  "mulhouse": "continental", "colmar": "continental", "dijon": "continental",
  "besancon": "continental", "reims": "continental", "troyes": "continental",
  "epinal": "continental", "belfort": "continental", "lyon": "continental",
  "grenoble": "continental", "clermont-ferrand": "continental", "chalon-sur-saone": "continental",
  "auxerre": "continental", "macon": "continental",
  // Montagne
  "chamonix": "montagne", "briancon": "montagne", "gap": "montagne", "albertville": "montagne",
  "megeve": "montagne", "font-romeu": "montagne", "barcelonnette": "montagne",
  "bourg-saint-maurice": "montagne", "modane": "montagne", "val-d'isere": "montagne",
  "morzine": "montagne", "les gets": "montagne", "saint-lary": "montagne", "embrun": "montagne",
};

// --- Référentiels d'affichage ---
const CYCLES = {
  annuelle:   { label: "Annuelle", picto: "🌱", desc: "Une seule saison : à replanter chaque année." },
  bisannuelle:{ label: "Bisannuelle", picto: "🔄", desc: "Deux ans : feuilles la 1ʳᵉ année, graines la 2ᵉ." },
  vivace:     { label: "Vivace (permanente)", picto: "♻️", desc: "Repousse plusieurs années : on plante une fois." },
};
const DIFFICULTES = {
  1: { label: "Facile", picto: "🟢", desc: "Idéal pour débuter." },
  2: { label: "Intermédiaire", picto: "🟡", desc: "Demande un peu de suivi." },
  3: { label: "Exigeant", picto: "🔴", desc: "Frileuse ou capricieuse : pour jardiniers avertis." },
};
const ENCOMBREMENTS = {
  compact:  { label: "Compact", picto: "📦", desc: "Parfait en petit espace / pot." },
  moyen:    { label: "Moyen", picto: "🪴", desc: "Place raisonnable." },
  gourmand: { label: "Gourmand en place", picto: "🌾", desc: "Réserve-lui de la surface." },
};
const SOLEILS = {
  plein:     { label: "Plein soleil", picto: "☀️" },
  "mi-ombre":{ label: "Mi-ombre", picto: "⛅" },
  ombre:     { label: "Ombre", picto: "🌥️" },
};
const CATEGORIES = {
  legume:     { label: "Légume", hue: 130 },
  fruit:      { label: "Fruit", hue: 340 },
  aromatique: { label: "Aromatique", hue: 175 },
  exotique:   { label: "Exotique", hue: 32 },
};

// --- Liens d'achat / partenaires (sponsoring) ---------------------------------
// 3 façons de gérer un lien sponsorisé, par ordre de priorité :
//   1. Sur une plante : `lien:"https://…?aff=TONCODE"` + `sponsorise:true`
//      → bouton "🛒 Trouver" pointant vers ton lien affilié, badge "Partenaire ✦".
//   2. Partenaire global par défaut ci-dessous (actif:true) : {q} = nom de la plante.
//   3. Sinon : simple recherche web générique (non sponsorisée).
const PARTENAIRE_DEFAUT = {
  actif: false,                                   // passe à true pour l'activer
  nom: "Graines partenaire",
  url: "https://exemple-graines.fr/recherche?q={q}&aff=PERMAVORE",
  sponsorise: true,                               // affiche le badge "Partenaire ✦"
};

// --- Ressources du jardinier (ce que tu possèdes déjà) ------------------------
// L'app s'en sert pour être PROACTIVE : elle te rappelle d'utiliser ce que tu as
// au bon moment. `mois` = mois d'emploi conseillés ; `cible` = à quelles plantes
// ça s'applique (fonction évaluée sur la plante) ; `auSemis` = à proposer au
// moment de planter la plante concernée.
const RESSOURCES_CATALOGUE = {
  engrais_laine: {
    label: "Engrais laine de mouton", emoji: "🐑",
    mois: [3, 4, 5, 6, 9, 10],
    auSemis: true,
    cible: p => p.encombrement === "gourmand" || p.diff >= 2 || p.cat === "fruit",
    quand: "À la plantation, en fond de trou (printemps ; automne pour les vivaces)",
    conseil: "Une poignée au fond du trou de plantation : la laine libère son azote "
      + "lentement sur 6 mois et retient l'eau. Idéale pour les gourmandes "
      + "(tomate, courgette, courge, chou) — inutile de renouveler en cours de saison. "
      + "À l'automne, réserve-la aux plantations de vivaces et petits fruits : sur une "
      + "planche d'annuelles vide, l'azote serait lessivé pendant l'hiver.",
  },
  compost: {
    label: "Compost mûr", emoji: "🍂",
    mois: [2, 3, 4, 9, 10, 11],
    auSemis: true,
    cible: p => p.encombrement !== "compact",
    quand: "En fond de trou au printemps, ou en surface à l'automne",
    conseil: "Incorpore-le en surface (5 cm) sans l'enfouir profondément : "
      + "la vie du sol s'en charge. Au printemps pour nourrir, à l'automne pour protéger.",
  },
  paillage: {
    label: "Paillage (paille, BRF, tonte)", emoji: "🌾",
    mois: [5, 6, 7, 8],
    auSemis: false,
    cible: p => true,
    quand: "Dès que le sol est réchauffé, avant les fortes chaleurs",
    conseil: "5 à 10 cm autour des pieds, sans toucher les tiges : "
      + "moins d'arrosage, moins de désherbage, sol vivant.",
  },
  purin_ortie: {
    label: "Purin d'ortie", emoji: "🌿",
    mois: [4, 5, 6, 7],
    auSemis: false,
    cible: p => p.cat === "legume" && p.typeLunaire === "feuille",
    quand: "En croissance, dilué à 10 %",
    conseil: "Riche en azote : stimule la croissance du feuillage. "
      + "Dilué à 10 % à l'arrosoir, toutes les 2 semaines maximum.",
  },
  voile_hivernage: {
    label: "Voile d'hivernage / forçage", emoji: "🧊",
    mois: [10, 11, 12, 1, 2, 3],
    auSemis: false,
    cible: p => p.frileux || p.cycle === "vivace",
    quand: "Avant les premières gelées, et sur les semis précoces",
    conseil: "Protège les frileuses du gel et permet de semer 2 à 3 semaines plus tôt "
      + "au printemps. À retirer aux heures chaudes pour aérer.",
  },
  filet_protection: {
    label: "Filet anti-insectes / anti-oiseaux", emoji: "🕸️",
    mois: [4, 5, 6, 7, 8],
    auSemis: true,
    cible: p => ["chou", "carotte", "navet", "fraisier", "groseillier", "framboisier"].includes(p.id),
    quand: "Dès la plantation des choux/carottes, et avant la maturité des fruits rouges",
    conseil: "Le seul moyen fiable contre la piéride du chou, la mouche de la carotte "
      + "et les oiseaux sur les fruits rouges. Pose-le tôt, avant l'arrivée des ravageurs.",
  },
  serre: {
    label: "Serre / châssis", emoji: "🏡",
    mois: [2, 3, 4, 9, 10],
    auSemis: true,
    cible: p => p.frileux,
    quand: "Semis précoces au printemps, prolongation à l'automne",
    conseil: "Permet de démarrer les frileuses (tomate, poivron, aubergine) "
      + "4 à 6 semaines avant la pleine terre, et de prolonger les récoltes en automne.",
  },
};

// --- Base plantes ---
// semis : liste de fenêtres [moisDebut, moisFin] (semis OU plantation en pleine terre)
// frileux : true => sensible au gel, exclue de la zone montagne
const PLANTES = [
  { id:"tomate", nom:"Tomate", latin:"Solanum lycopersicum", cat:"legume", typeLunaire:"fruit", famille:"Solanacées", emoji:"🍅", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tomato_je.jpg/960px-Tomato_je.jpg",
    cycle:"annuelle", diff:2, encombrement:"moyen", soleil:"plein", densite:2.5, espacement:"50 cm",
    frileux:true, semis:[[5,6]], mode:"plant", recolte:"Juillet → octobre",
    court:"La star du potager : généreuse, savoureuse, indispensable en été.",
    long:"La tomate se plante après les dernières gelées, en plein soleil et dans une terre riche. Tuteurée et arrosée au pied (sans mouiller le feuillage), elle produit tout l'été. Variétés à foison : cerise, cœur de bœuf, ancienne…",
    conseils:["Planter enterré jusqu'aux premières feuilles pour un enracinement fort.","Tuteurer dès la plantation et supprimer les gourmands.","Arroser régulièrement au pied, jamais sur les feuilles (mildiou)."] },

  { id:"courgette", nom:"Courgette", latin:"Cucurbita pepo", cat:"legume", typeLunaire:"fruit", famille:"Cucurbitacées", emoji:"🥒", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/CSA-Striped-Zucchini.jpg/960px-CSA-Striped-Zucchini.jpg",
    cycle:"annuelle", diff:1, encombrement:"gourmand", soleil:"plein", densite:1, espacement:"80–100 cm",
    frileux:true, semis:[[5,6]], mode:"semis", levee:[6,9], recolte:"Juin → octobre",
    court:"Ultra productive : un ou deux pieds suffisent à nourrir une famille.",
    long:"La courgette pousse vite et donne en continu si on la récolte jeune. Elle aime la chaleur, une terre riche en compost et de l'eau régulière. Attention, elle prend beaucoup de place.",
    conseils:["Récolter jeune (15–20 cm) pour stimuler la production.","Pailler le pied pour garder l'humidité.","Espacer largement les pieds : feuillage envahissant."] },

  { id:"radis", nom:"Radis", latin:"Raphanus sativus", cat:"legume", typeLunaire:"racine", famille:"Brassicacées", emoji:"🔴", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Radish_3371103037_4ab07db0bf_o.jpg/960px-Radish_3371103037_4ab07db0bf_o.jpg",
    cycle:"annuelle", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:100, espacement:"3–5 cm",
    semis:[[3,9]], eclaircir:true, mode:"semis", levee:[3,5], recolte:"3 à 5 semaines après semis",
    court:"Le plus rapide : de la graine à l'assiette en un mois.",
    long:"Le radis est parfait pour débuter et pour les enfants : semis direct, croissance express. Semer peu dense et régulièrement (tous les 15 jours) pour un approvisionnement continu.",
    conseils:["Semer clair pour éviter d'éclaircir.","Arroser souvent : un radis assoiffé devient piquant et creux.","Échelonner les semis toutes les 2 semaines."] },

  { id:"laitue", nom:"Laitue", latin:"Lactuca sativa", cat:"legume", typeLunaire:"feuille", famille:"Astéracées", emoji:"🥬", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Iceberg_lettuce_in_SB.jpg/960px-Iceberg_lettuce_in_SB.jpg",
    cycle:"annuelle", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:9, espacement:"25–30 cm",
    semis:[[3,9]], eclaircir:true, mode:"semis", levee:[4,7], recolte:"Mai → novembre",
    court:"Salade fraîche presque toute l'année, facile et rapide.",
    long:"La laitue se cultive du printemps à l'automne. Semis échelonnés pour récolter en continu. À la belle saison, un peu d'ombre l'aide à ne pas monter en graines.",
    conseils:["Échelonner les semis pour éviter tout d'un coup.","Arroser le matin pour limiter les limaces.","En été, préférer la mi-ombre."] },

  { id:"carotte", nom:"Carotte", latin:"Daucus carota", cat:"legume", typeLunaire:"racine", famille:"Apiacées", emoji:"🥕", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Vegetable-Carrot-Bundle-wStalks.jpg/960px-Vegetable-Carrot-Bundle-wStalks.jpg",
    cycle:"bisannuelle", diff:2, encombrement:"compact", soleil:"plein", densite:80, espacement:"5 cm",
    semis:[[3,7]], eclaircir:true, mode:"semis", levee:[10,20], recolte:"Juin → novembre",
    court:"Croquante et sucrée, elle se conserve tout l'hiver.",
    long:"La carotte aime une terre meuble, fine et sans cailloux. La levée est lente : garder le sol humide. Un voile anti-insectes protège de la mouche de la carotte.",
    conseils:["Sol meuble et affiné, sans fumier frais (racines fourchues).","Maintenir humide jusqu'à la levée (2–3 semaines).","Éclaircir à 5 cm pour de belles racines."] },

  { id:"haricot", nom:"Haricot vert", latin:"Phaseolus vulgaris", cat:"legume", typeLunaire:"fruit", famille:"Fabacées", emoji:"🫘", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Heaps_of_beans.jpg/960px-Heaps_of_beans.jpg",
    cycle:"annuelle", diff:1, encombrement:"moyen", soleil:"plein", densite:30, espacement:"10 cm",
    frileux:true, semis:[[5,7]], mode:"semis", levee:[6,9], recolte:"Juillet → octobre",
    court:"Productif et facile, il enrichit même le sol en azote.",
    long:"Semé quand le sol est réchauffé (mi-mai), le haricot lève vite. Nain ou à rames selon la place. Récolte régulière pour prolonger la production.",
    conseils:["Attendre un sol à 12 °C minimum pour semer.","Butter légèrement les jeunes plants.","Cueillir souvent et jeune."] },

  { id:"pomme-de-terre", nom:"Pomme de terre", latin:"Solanum tuberosum", cat:"legume", typeLunaire:"racine", famille:"Solanacées", emoji:"🥔", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Patates.jpg/960px-Patates.jpg",
    cycle:"annuelle", diff:1, encombrement:"gourmand", soleil:"plein", densite:4, espacement:"35 cm",
    semis:[[3,5]], mode:"tubercule", recolte:"Juin → septembre",
    court:"Rustique et nourrissante : un basique du jardin vivrier.",
    long:"On plante des tubercules germés au printemps. Le buttage régulier augmente le rendement et protège les tubercules de la lumière. Variétés précoces pour récolte d'été.",
    conseils:["Faire pré-germer les plants avant plantation.","Butter dès que le feuillage atteint 20 cm.","Récolter par temps sec pour une meilleure conservation."] },

  { id:"poireau", nom:"Poireau", latin:"Allium porrum", cat:"legume", typeLunaire:"racine", famille:"Alliacées", emoji:"🧅", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Leek_on_white_background_-_0947.jpg/960px-Leek_on_white_background_-_0947.jpg",
    cycle:"bisannuelle", diff:2, encombrement:"moyen", soleil:"plein", densite:16, espacement:"15 cm",
    semis:[[5,8]], mode:"plant", recolte:"Septembre → mars",
    court:"Le légume d'hiver par excellence, résistant au froid.",
    long:"Repiqué en été, le poireau se récolte de l'automne au printemps, même sous la neige. Le buttage blanchit et allonge le fût.",
    conseils:["Habiller racines et feuilles avant repiquage.","Butter pour blanchir le fût.","Laisser en terre l'hiver et récolter au besoin."] },

  { id:"epinard", nom:"Épinard", latin:"Spinacia oleracea", cat:"legume", typeLunaire:"feuille", famille:"Amaranthacées", emoji:"🥬", photo:"https://upload.wikimedia.org/wikipedia/commons/3/37/Spinacia_oleracea_Spinazie_bloeiend.jpg",
    cycle:"annuelle", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:25, espacement:"10 cm",
    semis:[[3,4],[8,9]], eclaircir:true, mode:"semis", levee:[6,12], recolte:"6 à 8 semaines après semis",
    court:"Feuilles tendres au printemps et à l'automne, riche en fer.",
    long:"L'épinard préfère la fraîcheur : semis de printemps et d'automne. En été il monte en graines. Récolte feuille à feuille pour prolonger.",
    conseils:["Éviter le plein été (montée à graines).","Sol riche en azote (compost).","Récolter les feuilles extérieures d'abord."] },

  { id:"betterave", nom:"Betterave", latin:"Beta vulgaris", cat:"legume", typeLunaire:"racine", famille:"Amaranthacées", emoji:"🟣", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Detroitdarkredbeets.png/960px-Detroitdarkredbeets.png",
    cycle:"bisannuelle", diff:1, encombrement:"compact", soleil:"plein", densite:16, espacement:"10 cm",
    semis:[[4,6]], eclaircir:true, mode:"semis", levee:[8,12], recolte:"Juillet → octobre",
    court:"Douce et colorée, délicieuse rôtie ou en salade.",
    long:"La betterave se sème en place au printemps. Chaque graine donne plusieurs plants : éclaircir. Se conserve bien en cave l'hiver.",
    conseils:["Éclaircir après la levée (un plant tous les 10 cm).","Arroser régulièrement pour éviter les racines fibreuses.","Récolter avant les fortes gelées."] },

  { id:"concombre", nom:"Concombre", latin:"Cucumis sativus", cat:"legume", typeLunaire:"fruit", famille:"Cucurbitacées", emoji:"🥒", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/ARS_cucumber.jpg/960px-ARS_cucumber.jpg",
    cycle:"annuelle", diff:2, encombrement:"gourmand", soleil:"plein", densite:1.5, espacement:"60 cm",
    frileux:true, semis:[[5,6]], mode:"semis", levee:[6,9], recolte:"Juillet → septembre",
    court:"Rafraîchissant et productif, idéal palissé.",
    long:"Le concombre aime la chaleur et l'eau. Palissé sur un treillis, il gagne de la place et donne des fruits droits. Récolte régulière pour éviter l'amertume.",
    conseils:["Palisser pour gagner de la place et des fruits sains.","Arroser abondamment et régulièrement.","Récolter jeune et souvent."] },

  { id:"courge", nom:"Courge / Potiron", latin:"Cucurbita maxima", cat:"legume", typeLunaire:"fruit", famille:"Cucurbitacées", emoji:"🎃", photo:"https://upload.wikimedia.org/wikipedia/commons/b/bd/Squashes.jpg",
    cycle:"annuelle", diff:1, encombrement:"gourmand", soleil:"plein", densite:0.5, espacement:"1–1,5 m",
    frileux:true, semis:[[5,6]], mode:"semis", levee:[6,10], recolte:"Septembre → octobre",
    court:"Se conserve tout l'hiver : un pilier du jardin vivrier.",
    long:"Les courges courent au sol et demandent beaucoup de place et de compost. Récoltées mûres à l'automne, elles se gardent des mois au sec.",
    conseils:["Planter sur un tas de compost mûr.","Laisser 1 à 1,5 m entre les pieds.","Récolter avant les gelées, laisser ressuyer au soleil."] },

  { id:"petit-pois", nom:"Petit pois", latin:"Pisum sativum", cat:"legume", typeLunaire:"fruit", famille:"Fabacées", emoji:"🫛", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Peas_in_pods_-_Studio.jpg/960px-Peas_in_pods_-_Studio.jpg",
    cycle:"annuelle", diff:1, encombrement:"moyen", soleil:"plein", densite:40, espacement:"5 cm",
    semis:[[2,4]], mode:"semis", levee:[8,12], recolte:"Mai → juillet",
    court:"Semé tôt, il donne des récoltes sucrées de printemps.",
    long:"Le pois supporte le froid et se sème dès février-mars. Il aime être ramé. Enrichit le sol en azote comme toutes les légumineuses.",
    conseils:["Semer tôt, il craint peu le froid.","Installer un support / rames.","Récolter au fur et à mesure, jeunes."] },

  { id:"feve", nom:"Fève", latin:"Vicia faba", cat:"legume", typeLunaire:"fruit", famille:"Fabacées", emoji:"🫘",
    cycle:"annuelle", diff:1, encombrement:"moyen", soleil:"plein", densite:25, espacement:"15 cm",
    semis:[[10,11],[2,3]], mode:"semis", levee:[7,10], recolte:"Mai → juin",
    court:"Rustique, se sème même à l'automne dans le Sud.",
    long:"La fève se sème en automne (climat doux) ou fin d'hiver. Elle résiste au froid et améliore le sol. Pincer les têtes limite les pucerons noirs.",
    conseils:["Semer en automne en climat doux pour une récolte précoce.","Butter les jeunes plants.","Pincer les extrémités contre les pucerons."] },

  { id:"oignon", nom:"Oignon", latin:"Allium cepa", cat:"legume", typeLunaire:"racine", famille:"Alliacées", emoji:"🧅", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Mixed_onions.jpg/960px-Mixed_onions.jpg",
    cycle:"bisannuelle", diff:1, encombrement:"compact", soleil:"plein", densite:40, espacement:"10 cm",
    semis:[[2,4]], eclaircir:true, mode:"semis", levee:[10,20], recolte:"Juillet → août",
    court:"Facile en bulbilles, se conserve très longtemps.",
    long:"Planté en bulbilles au printemps, l'oignon demande peu d'entretien. On arrête d'arroser quand le feuillage jaunit, puis on récolte et on fait sécher.",
    conseils:["Ne pas enterrer complètement la bulbille.","Sol pauvre plutôt que fumé fraîchement.","Sécher au soleil après récolte avant stockage."] },

  { id:"ail", nom:"Ail", latin:"Allium sativum", cat:"legume", typeLunaire:"racine", famille:"Alliacées", emoji:"🧄",
    cycle:"bisannuelle", diff:1, encombrement:"compact", soleil:"plein", densite:40, espacement:"12 cm",
    semis:[[10,12],[2,3]], mode:"caieu", recolte:"Juin → juillet",
    court:"Se plante en hiver, se récolte en été. Zéro entretien.",
    long:"On plante les caïeux (gousses) pointe vers le haut. L'ail d'automne donne les plus grosses têtes. Arrêter l'arrosage à l'approche de la récolte.",
    conseils:["Planter la gousse pointe vers le haut.","Sol drainant, jamais détrempé.","Récolter quand le feuillage sèche à moitié."] },

  { id:"poivron", nom:"Poivron", latin:"Capsicum annuum", cat:"legume", typeLunaire:"fruit", famille:"Solanacées", emoji:"🫑", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Green-Yellow-Red-Pepper-2009.jpg/960px-Green-Yellow-Red-Pepper-2009.jpg",
    cycle:"annuelle", diff:2, encombrement:"moyen", soleil:"plein", densite:4, espacement:"50 cm",
    frileux:true, semis:[[5,6]], mode:"plant", recolte:"Août → octobre",
    court:"Coloré et sucré, il adore la chaleur.",
    long:"Le poivron se plante après tout risque de gel, en situation très chaude et abritée. Il fructifie tard : privilégier le Sud ou une serre au Nord.",
    conseils:["Attendre une terre bien réchauffée.","Tuteurer, les branches sont cassantes.","Pailler et arroser régulièrement."] },

  { id:"aubergine", nom:"Aubergine", latin:"Solanum melongena", cat:"legume", typeLunaire:"fruit", famille:"Solanacées", emoji:"🍆", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Solanum_melongena_24_08_2012_%281%29.JPG/960px-Solanum_melongena_24_08_2012_%281%29.JPG",
    cycle:"annuelle", diff:3, encombrement:"gourmand", soleil:"plein", densite:3, espacement:"60 cm",
    frileux:true, semis:[[5,6]], mode:"plant", recolte:"Août → octobre",
    court:"Gourmande en chaleur : superbe au Sud, exigeante au Nord.",
    long:"L'aubergine réclame chaleur, soleil et une longue saison. Elle démarre lentement puis produit jusqu'aux premiers froids. Serre conseillée en climat frais.",
    conseils:["Ne planter qu'en terre chaude (mi-mai/juin).","Tuteurer et limiter à 4–5 fruits par pied au Nord.","Arrosage régulier, sans à-coups."] },

  { id:"chou", nom:"Chou pommé", latin:"Brassica oleracea", cat:"legume", typeLunaire:"feuille", famille:"Brassicacées", emoji:"🥬", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Cabbage_and_cross_section_on_white.jpg/960px-Cabbage_and_cross_section_on_white.jpg",
    cycle:"bisannuelle", diff:2, encombrement:"gourmand", soleil:"plein", densite:4, espacement:"50 cm",
    semis:[[5,7]], mode:"plant", recolte:"Automne → hiver",
    court:"Rustique et nourrissant, il tient tout l'hiver.",
    long:"Repiqué en été, le chou pomme à l'automne. Gros besoins en eau et en azote. Surveiller les chenilles de la piéride.",
    conseils:["Sol riche et frais, arrosages copieux.","Poser un filet anti-piéride.","Butter au pied pour stabiliser."] },

  { id:"navet", nom:"Navet", latin:"Brassica rapa", cat:"legume", typeLunaire:"racine", famille:"Brassicacées", emoji:"⚪", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Turnip_2622027.jpg/960px-Turnip_2622027.jpg",
    cycle:"annuelle", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:30, espacement:"10 cm",
    semis:[[3,4],[8,9]], eclaircir:true, mode:"semis", levee:[4,6], recolte:"6 à 10 semaines après semis",
    court:"Rapide de printemps ou d'automne, doux et tendre jeune.",
    long:"Le navet se sème au printemps et à la fin de l'été. Croissance rapide, il aime la fraîcheur et l'eau régulière pour rester tendre.",
    conseils:["Semer clair et éclaircir.","Arroser régulièrement (sinon piquant et fibreux).","Récolter jeune, taille d'une balle de golf à tennis."] },

  { id:"blette", nom:"Blette (bette à carde)", latin:"Beta vulgaris var. cicla", cat:"legume", typeLunaire:"feuille", famille:"Amaranthacées", emoji:"🥬", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Chard_%28Beta_vulgaris_var_cicla%29.jpg/960px-Chard_%28Beta_vulgaris_var_cicla%29.jpg",
    cycle:"bisannuelle", diff:1, encombrement:"moyen", soleil:"mi-ombre", densite:9, espacement:"35 cm",
    semis:[[4,6]], eclaircir:true, mode:"semis", levee:[8,10], recolte:"Juillet → automne (et +)",
    court:"Deux légumes en un : cardes et feuilles, très productive.",
    long:"La blette produit longtemps si on récolte feuille à feuille. Belle en carde blanche ou colorée. Peu exigeante, elle tolère la mi-ombre.",
    conseils:["Récolter les feuilles extérieures au fur et à mesure.","Arroser en été pour éviter la montée à graines.","Un paillage suffit à l'entretenir."] },

  { id:"mache", nom:"Mâche", latin:"Valerianella locusta", cat:"legume", typeLunaire:"feuille", famille:"Valérianacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Ackersalat02.jpg/960px-Ackersalat02.jpg",
    cycle:"annuelle", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:100, espacement:"5 cm",
    semis:[[8,10]], eclaircir:true, mode:"semis", levee:[6,12], recolte:"Octobre → mars",
    court:"La salade d'hiver rustique, semée en fin d'été.",
    long:"La mâche se sème d'août à octobre pour récolter tout l'hiver. Très résistante au froid, elle demande juste un sol tassé et un peu d'eau à la levée.",
    conseils:["Tasser le sol après semis (contact graine/terre).","Arroser finement jusqu'à la levée.","Récolter la rosette entière au couteau."] },

  { id:"roquette", nom:"Roquette", latin:"Eruca sativa", cat:"legume", typeLunaire:"feuille", famille:"Brassicacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Eruca_sativa_sl11.jpg/960px-Eruca_sativa_sl11.jpg",
    cycle:"annuelle", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:60, espacement:"5 cm",
    semis:[[3,9]], eclaircir:true, mode:"semis", levee:[4,8], recolte:"4 à 6 semaines après semis",
    court:"Piquante et express : coupez-la, elle repousse.",
    long:"La roquette pousse vite et se récolte en coupant les feuilles (elle repart). En été, l'ombre légère évite qu'elle devienne trop piquante et monte.",
    conseils:["Semer échelonné toutes les 3 semaines.","Couper les feuilles, laisser le cœur repartir.","Arroser pour garder la douceur."] },

  { id:"basilic", nom:"Basilic", latin:"Ocimum basilicum", cat:"aromatique", typeLunaire:"feuille", famille:"Lamiacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Ocimum_basilicum_8zz.jpg/960px-Ocimum_basilicum_8zz.jpg",
    cycle:"annuelle", diff:2, encombrement:"compact", soleil:"plein", densite:9, espacement:"25 cm",
    frileux:true, semis:[[5,6]], mode:"semis", levee:[8,12], recolte:"Juin → septembre",
    court:"L'aromatique de l'été, reine des tomates et du pesto.",
    long:"Le basilic est frileux : à installer une fois les nuits douces. Il aime le soleil, la chaleur et une terre humide. Pincer les fleurs prolonge la production de feuilles.",
    conseils:["Ne sortir qu'après mi-mai (craint le froid).","Pincer les têtes florales régulièrement.","Arroser le matin, sans mouiller le feuillage."] },

  { id:"persil", nom:"Persil", latin:"Petroselinum crispum", cat:"aromatique", typeLunaire:"feuille", famille:"Apiacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Petroselinum.jpg/960px-Petroselinum.jpg",
    cycle:"bisannuelle", diff:2, encombrement:"compact", soleil:"mi-ombre", densite:16, espacement:"15 cm",
    semis:[[3,7]], eclaircir:true, mode:"semis", levee:[15,30], recolte:"Toute l'année (selon semis)",
    court:"Incontournable, mais patient : la levée est lente.",
    long:"Le persil met 3 à 4 semaines à lever. Tremper les graines 24 h accélère. Bisannuel, il monte en graines la 2ᵉ année : on le ressème alors.",
    conseils:["Tremper les graines 24 h avant semis.","Maintenir humide jusqu'à la levée (longue).","Récolter par l'extérieur, laisser le cœur."] },

  { id:"ciboulette", nom:"Ciboulette", latin:"Allium schoenoprasum", cat:"aromatique", typeLunaire:"feuille", famille:"Alliacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Allium_schoenoprasum_-_Bombus_lapidarius_-_Tootsi.jpg/960px-Allium_schoenoprasum_-_Bombus_lapidarius_-_Tootsi.jpg",
    cycle:"vivace", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:16, espacement:"20 cm",
    semis:[[3,5]], mode:"semis", levee:[8,12], recolte:"Mars → novembre",
    court:"Vivace increvable : plantée une fois, elle revient chaque année.",
    long:"La ciboulette forme une touffe qui repousse au printemps et se divise facilement. Ses fleurs roses sont comestibles et mellifères. Coupez-la à ras, elle reprend.",
    conseils:["Diviser la touffe tous les 2–3 ans.","Couper à ras pour relancer des feuilles tendres.","Laisser quelques fleurs pour les pollinisateurs."] },

  { id:"thym", nom:"Thym", latin:"Thymus vulgaris", cat:"aromatique", typeLunaire:"feuille", famille:"Lamiacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Thyme-Bundle.jpg/960px-Thyme-Bundle.jpg",
    cycle:"vivace", diff:1, encombrement:"compact", soleil:"plein", densite:4, espacement:"30 cm",
    semis:[[3,5],[9,9]], mode:"semis", levee:[18,24], recolte:"Toute l'année",
    court:"Vivace méditerranéenne : soleil, sol sec, aucun soin.",
    long:"Le thym adore le sec et le plein soleil. Il redoute l'humidité stagnante. Une taille après floraison le garde compact et dense.",
    conseils:["Sol drainant, surtout pas détrempé.","Tailler légèrement après la floraison.","Aucun arrosage une fois installé."] },

  { id:"menthe", nom:"Menthe", latin:"Mentha", cat:"aromatique", typeLunaire:"feuille", famille:"Lamiacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Mentha_aquatica_%282005_09_18%29_-_uitsnede.jpg/960px-Mentha_aquatica_%282005_09_18%29_-_uitsnede.jpg",
    cycle:"vivace", diff:1, encombrement:"moyen", soleil:"mi-ombre", densite:4, espacement:"30 cm",
    semis:[[3,5],[9,9]], mode:"plant", recolte:"Avril → octobre",
    court:"Vivace généreuse… et envahissante : à contenir en pot.",
    long:"La menthe pousse toute seule et se propage par ses racines. La cultiver en pot ou en zone délimitée évite qu'elle colonise le potager. Fraîcheur et mi-ombre lui conviennent.",
    conseils:["La cultiver en pot / barrière pour la contenir.","Rabattre en été pour des feuilles tendres.","Diviser la touffe chaque année."] },

  { id:"romarin", nom:"Romarin", latin:"Salvia rosmarinus", cat:"aromatique", typeLunaire:"feuille", famille:"Lamiacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Rosemary_in_bloom.JPG/960px-Rosemary_in_bloom.JPG",
    cycle:"vivace", diff:1, encombrement:"moyen", soleil:"plein", densite:1, espacement:"80 cm",
    semis:[[4,5],[9,9]], mode:"plant", recolte:"Toute l'année",
    court:"Arbuste aromatique persistant, mellifère et increvable.",
    long:"Le romarin devient un buste ligneux qui fleurit dès l'hiver dans le Sud. Sol sec et drainé, plein soleil. Rustique mais à protéger en climat très froid.",
    conseils:["Drainage impératif (craint l'humidité hivernale).","Tailler après floraison pour garder la forme.","Bouturage très facile au printemps."] },

  { id:"fraisier", nom:"Fraisier", latin:"Fragaria × ananassa", cat:"fruit", typeLunaire:"fruit", famille:"Rosacées", emoji:"🍓", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Garden_strawberry_%28Fragaria_%C3%97_ananassa%29_single2.jpg/960px-Garden_strawberry_%28Fragaria_%C3%97_ananassa%29_single2.jpg",
    cycle:"vivace", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:6, espacement:"35 cm",
    semis:[[3,4],[8,9]], mode:"plant", recolte:"Mai → juillet (ou remontant tout l'été)",
    court:"Le fruit vivace parfait pour débuter et régaler les enfants.",
    long:"Planté au printemps ou fin d'été, le fraisier produit dès l'année suivante et se multiplie par stolons. Variétés remontantes pour des fraises tout l'été. À renouveler tous les 3–4 ans.",
    conseils:["Ne pas enterrer le cœur (collet) du plant.","Pailler pour des fruits propres et de l'humidité.","Récupérer les stolons pour renouveler la fraiseraie."] },

  { id:"framboisier", nom:"Framboisier", latin:"Rubus idaeus", cat:"fruit", typeLunaire:"fruit", famille:"Rosacées", emoji:"🍇", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Raspberry_-_halved_%28Rubus_idaeus%29.jpg/960px-Raspberry_-_halved_%28Rubus_idaeus%29.jpg",
    cycle:"vivace", diff:1, encombrement:"moyen", soleil:"mi-ombre", densite:3, espacement:"50 cm",
    semis:[[10,12],[2,3]], mode:"plant", recolte:"Juin → octobre (selon variété)",
    court:"Vivace généreuse : une haie fruitière productive et rustique.",
    long:"Le framboisier se plante à racines nues en automne/hiver. Palissé sur des fils, il donne en début d'été (non remontant) ou jusqu'à l'automne (remontant). Il drageonne : à contenir.",
    conseils:["Palisser sur 2 fils pour faciliter la récolte.","Tailler selon le type (remontant / non remontant).","Pailler généreusement, il aime la fraîcheur."] },

  { id:"rhubarbe", nom:"Rhubarbe", latin:"Rheum rhabarbarum", cat:"fruit", typeLunaire:"feuille", famille:"Polygonacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Rheum_rhabarbarum.2006-04-27.uellue.jpg/960px-Rheum_rhabarbarum.2006-04-27.uellue.jpg",
    cycle:"vivace", diff:1, encombrement:"gourmand", soleil:"mi-ombre", densite:1, espacement:"1 m",
    semis:[[10,11],[2,3]], mode:"plant", recolte:"Avril → juin",
    court:"Vivace robuste : un pied nourrit des années de compotes.",
    long:"La rhubarbe s'installe pour 10 ans. Elle aime les sols riches et frais et la mi-ombre. On récolte les pétioles (les feuilles sont toxiques) sans jamais tout prélever d'un coup.",
    conseils:["Sol profond et riche en compost.","Tirer les tiges (ne pas couper), garder la moitié.","Ne jamais consommer les feuilles (toxiques)."] },

  { id:"groseillier", nom:"Groseillier", latin:"Ribes rubrum", cat:"fruit", typeLunaire:"fruit", famille:"Grossulariacées", emoji:"🍇", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Ribes_rubrum_1.jpg/960px-Ribes_rubrum_1.jpg",
    cycle:"vivace", diff:1, encombrement:"moyen", soleil:"mi-ombre", densite:1, espacement:"1,2 m",
    semis:[[10,12],[2,3]], mode:"plant", recolte:"Juin → juillet",
    court:"Petit fruit rustique, parfait même en mi-ombre.",
    long:"Le groseillier se plante en repos végétatif (automne à mars). Rustique et peu exigeant, il tolère la mi-ombre. Une taille d'hiver aère la touffe et renouvelle le bois.",
    conseils:["Planter à racines nues en hiver.","Tailler en hiver pour aérer et renouveler.","Filet anti-oiseaux à l'approche de la récolte."] },

  { id:"figuier", nom:"Figuier", latin:"Ficus carica", cat:"exotique", typeLunaire:"fruit", famille:"Moracées", emoji:"🌳",
    cycle:"vivace", diff:1, encombrement:"gourmand", soleil:"plein", densite:0.1, espacement:"3–4 m",
    semis:[[10,11],[2,3]], mode:"plant", recolte:"Juillet → septembre",
    court:"L'arbre méditerranéen par excellence : rustique et généreux.",
    long:"Le figuier pousse presque partout en France, adossé à un mur au chaud dans les régions fraîches. Peu exigeant, il fructifie vite et vit des décennies. Certaines variétés donnent deux récoltes par an.",
    conseils:["L'installer contre un mur exposé sud en climat frais.","Sol drainant ; il craint surtout l'excès d'eau.","Tailler léger en fin d'hiver pour contenir le volume."] },

  { id:"kiwi", nom:"Kiwi", latin:"Actinidia deliciosa", cat:"exotique", typeLunaire:"fruit", famille:"Actinidiacées", emoji:"🥝", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Actinidia_fruits.jpg/960px-Actinidia_fruits.jpg",
    cycle:"vivace", diff:2, encombrement:"gourmand", soleil:"plein", densite:0.2, espacement:"3–4 m",
    semis:[[10,11],[2,3]], mode:"plant", recolte:"Octobre → novembre",
    court:"Liane vigoureuse et productive… si pied mâle ET femelle.",
    long:"Le kiwi est une liane rustique qui grimpe sur pergola. Il faut en général un pied mâle pour polliniser plusieurs femelles (sauf variétés autofertiles). Récolte abondante à l'automne, à laisser mûrir après cueillette.",
    conseils:["Prévoir un mâle pour 3–5 femelles (ou variété autofertile).","Palisser sur une structure solide (liane lourde).","Sol frais et non calcaire, arrosage régulier l'été."] },

  { id:"grenadier", nom:"Grenadier", latin:"Punica granatum", cat:"exotique", typeLunaire:"fruit", famille:"Lythracées", emoji:"🔴", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Pomegranate_Juice_%282019%29.jpg/960px-Pomegranate_Juice_%282019%29.jpg",
    cycle:"vivace", diff:2, encombrement:"moyen", soleil:"plein", densite:0.3, espacement:"2–3 m",
    frileux:true, semis:[[3,4],[10,11]], mode:"plant", recolte:"Septembre → octobre",
    court:"Grenades au jardin : superbe floraison rouge, fruit du Sud.",
    long:"Le grenadier prospère en climat doux et chaud ; ailleurs, il fleurit mais mûrit mal ses fruits. Belle floraison estivale orangée. À protéger du gel les premières années.",
    conseils:["Réserver le plein soleil le plus chaud (mur sud).","Protéger le pied du gel en hiver les 1res années.","Variétés fruitières (‘Provence’) pour de vraies grenades."] },

  { id:"citronnier", nom:"Citronnier", latin:"Citrus limon", cat:"exotique", typeLunaire:"fruit", famille:"Rutacées", emoji:"🍋", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/P1030323.JPG/960px-P1030323.JPG",
    cycle:"vivace", diff:2, encombrement:"moyen", soleil:"plein", densite:0.5, espacement:"en pot ou 2 m",
    frileux:true, semis:[[4,5]], mode:"plant", recolte:"Automne → hiver",
    court:"Agrume en pot : soleil l'été, abri hors gel l'hiver.",
    long:"Hors du littoral méditerranéen, le citronnier se cultive en grand pot : dehors au soleil d'avril à octobre, rentré en véranda ou serre froide l'hiver (il gèle dès −2 °C). Fleurs parfumées et fruits sur plusieurs mois.",
    conseils:["En pot partout sauf zone méditerranéenne abritée.","Rentrer hors gel dès l'automne (pièce claire et fraîche).","Engrais agrumes en saison, arrosage à l'eau non calcaire."] },

  { id:"patate-douce", nom:"Patate douce", latin:"Ipomoea batatas", cat:"exotique", typeLunaire:"racine", famille:"Convolvulacées", emoji:"🍠", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Ipomoea_batatas_006.JPG/960px-Ipomoea_batatas_006.JPG",
    cycle:"annuelle", diff:2, encombrement:"gourmand", soleil:"plein", densite:4, espacement:"40 cm",
    frileux:true, semis:[[5,6]], mode:"plant", recolte:"Octobre (avant les gelées)",
    court:"Tubercule sucré et tropical, adopté par les potagers français.",
    long:"La patate douce aime la chaleur : plantée en plants après les gelées, elle court au sol tout l'été et se récolte en octobre. Le paillage plastique noir réchauffe le sol et booste la récolte au Nord.",
    conseils:["Planter en terre bien réchauffée (mi-mai/juin).","Pailler (plastique noir au Nord) pour la chaleur.","Récolter avant la première gelée, laisser ressuyer."] },

  { id:"physalis", nom:"Physalis (Coqueret du Pérou)", latin:"Physalis peruviana", cat:"exotique", typeLunaire:"fruit", famille:"Solanacées", emoji:"🟡", photo:"https://upload.wikimedia.org/wikipedia/commons/8/87/Uchuva_2005.jpg",
    cycle:"annuelle", diff:1, encombrement:"moyen", soleil:"plein", densite:2, espacement:"70 cm",
    frileux:true, semis:[[5,6]], mode:"plant", recolte:"Août → octobre",
    court:"Petites lanternes sucrées-acidulées, faciles et originales.",
    long:"Le physalis se cultive comme la tomate : plants installés après les gelées, en plein soleil. Chaque fruit se cache dans une lanterne de papier. Très productif, il se ressème souvent seul.",
    conseils:["Cultiver comme une tomate (soleil, tuteur léger).","Récolter quand la lanterne sèche et le fruit tombe.","Se ressème facilement : garder quelques fruits au sol."] },

  { id:"kaki", nom:"Kaki (Plaqueminier)", latin:"Diospyros kaki", cat:"exotique", typeLunaire:"fruit", famille:"Ébénacées", emoji:"🟠", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Fuyu_persimmon_fruits%2C_one_cut_open.jpg/960px-Fuyu_persimmon_fruits%2C_one_cut_open.jpg",
    cycle:"vivace", diff:1, encombrement:"gourmand", soleil:"plein", densite:0.1, espacement:"4–5 m",
    semis:[[11,12],[2,3]], mode:"plant", recolte:"Octobre → novembre",
    court:"Arbre rustique aux fruits orange qui illuminent l'automne.",
    long:"Le plaqueminier est plus rustique qu'on ne le croit et pousse dans une grande moitié de la France. Il donne des kakis oranges après la chute des feuilles. Peu de maladies, peu d'entretien.",
    conseils:["Emplacement ensoleillé, sol profond et frais.","Patienter : la mise à fruit demande quelques années.","Récolter blets (variétés astringentes) ou fermes (‘Fuyu’)."] },

  { id:"gingembre", nom:"Gingembre", latin:"Zingiber officinale", cat:"exotique", typeLunaire:"racine", famille:"Zingibéracées", emoji:"🫚",
    cycle:"vivace", diff:2, encombrement:"compact", soleil:"mi-ombre", densite:4, espacement:"30 cm (pot)",
    frileux:true, semis:[[3,4]], mode:"rhizome", recolte:"Automne (8–10 mois après)",
    court:"Cultivable en pot à partir d'un rhizome du commerce.",
    long:"Un morceau de rhizome bio qui bourgeonne, planté au chaud au printemps, donne un beau plant de gingembre. En pot à l'intérieur ou en serre, il se récolte à l'automne. Chaleur et humidité sont la clé.",
    conseils:["Partir d'un rhizome bio avec des yeux (bourgeons).","Chaleur (20–25 °C) et atmosphère humide indispensables.","Récolter quand le feuillage jaunit à l'automne."] },
];
