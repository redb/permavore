/* =========================================================================
   Jardin Nourricier — base de données plantes + zones climatiques
   Données éditoriales (à valider / enrichir). Calendrier = France métropolitaine — HÉRITÉ, à ne pas étendre

   ATTENTION : les fenêtres de semis ci-dessous sont exprimées en mois du
   calendrier français et décalées par grandes zones. Ce mécanisme est
   conservé pour la compatibilité de l'interface existante, mais il est
   HÉRITÉ : il est faux dans l'hémisphère sud et vide de sens sous les
   tropiques. Ne pas l'étendre aux nouvelles données en le présentant comme
   mondial. Le calendrier cible doit résulter de :
       profil agroclimatique de la culture (agronomie.js)
     × climat local par coordonnées (climat-core.mjs, functions/api/climat.js)
     × conditions de la saison en cours,
   et non d'un mois inscrit en dur.
   Les fenêtres de semis/plantation sont exprimées en mois [début, fin]
   pour une zone TEMPÉRÉE de référence, puis décalées selon la zone.

   INTERNATIONALISATION (FR/EN) — voir aussi i18n.js.
   Tous les champs éditoriaux traduisibles (libellés, descriptions, conseils…)
   sont enveloppés par `bi(fr, en)`, qui renvoie un petit objet dont
   `toString()`/`valueOf()` rendent le texte dans la langue courante (`LANG`,
   définie dans i18n.js, chargé AVANT ce fichier). C'est délibérément la
   solution la moins invasive : le reste du code (app.js, jardin.js…) accède
   toujours à `plante.nom`, `cat.label`, etc. sans changement, car le moteur
   JS appelle automatiquement `toString()` dès que la valeur est utilisée
   comme une chaîne (template literal, concaténation, `textContent`,
   `innerHTML`, tri via `localeCompare`…). Seuls les noms de villes
   (VILLES_ZONES) restent de simples chaînes : ce sont des noms propres,
   jamais traduits.
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
  mediterraneen: { label: bi("Méditerranéen", "Mediterranean"), emoji: "🌞", debut: -1, fin: 1,
    frileux: { debut: -1, fin: 1 }, rustique: { debut: -1, fin: 1 },
    note: bi("Hivers doux, étés chauds et secs. Saison longue.", "Mild winters, hot dry summers. Long season.") },
  oceanique: { label: bi("Océanique (doux, humide)", "Oceanic (mild, wet)"), emoji: "🌊", debut: 0, fin: 0,
    frileux: { debut: 0, fin: 0 }, rustique: { debut: -1, fin: 0 },
    note: bi("Hivers doux, pluies fréquentes, gelées rares.", "Mild winters, frequent rain, rare frost.") },
  tempere: { label: bi("Tempéré (référence)", "Temperate (reference)"), emoji: "🍃", debut: 0, fin: 0,
    frileux: { debut: 0, fin: 0 }, rustique: { debut: 0, fin: 0 },
    note: bi("Climat de référence (Bassin parisien, Centre, Nord).", "Reference climate (most of northern & central France; similar to a US mid-Atlantic climate).") },
  continental: { label: bi("Continental (hivers froids)", "Continental (cold winters)"), emoji: "❄️", debut: 1, fin: 0,
    frileux: { debut: 1, fin: 0 }, rustique: { debut: 0, fin: 0 },
    note: bi("Hivers froids, gelées tardives : les frileuses attendent, pas les rustiques.", "Cold winters, late frosts: frost-sensitive plants wait, hardy ones don't.") },
  montagne: { label: bi("Montagne (saison courte)", "Mountain (short season)"), emoji: "⛰️", debut: 1, fin: -1,
    frileux: { debut: 2, fin: -1 }, rustique: { debut: 1, fin: -1 },
    note: bi("Saison très courte, gel possible tard. Espèces frileuses à éviter.", "Very short season, late frost possible. Avoid frost-sensitive species.") },
};

// --- Correspondance villes -> zone (échantillon élargi, minuscules sans accents) ---
// Noms de villes françaises : NE PAS TRADUIRE (noms propres).
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
  annuelle:   { label: bi("Annuelle", "Annual"), picto: "🌱", desc: bi("Une seule saison : à replanter chaque année.", "One season only: replant every year.") },
  bisannuelle:{ label: bi("Bisannuelle", "Biennial"), picto: "🔄", desc: bi("Deux ans : feuilles la 1ʳᵉ année, graines la 2ᵉ.", "Two years: leaves the 1st year, seeds the 2nd.") },
  vivace:     { label: bi("Vivace (permanente)", "Perennial (long-lived)"), picto: "♻️", desc: bi("Repousse plusieurs années : on plante une fois.", "Regrows for several years: plant it once.") },
};
const DIFFICULTES = {
  1: { label: bi("Facile", "Easy"), picto: "🟢", desc: bi("Idéal pour débuter.", "Ideal for beginners.") },
  2: { label: bi("Intermédiaire", "Intermediate"), picto: "🟡", desc: bi("Demande un peu de suivi.", "Needs a bit of attention.") },
  3: { label: bi("Exigeant", "Demanding"), picto: "🔴", desc: bi("Frileuse ou capricieuse : pour jardiniers avertis.", "Frost-sensitive or fussy: for experienced gardeners.") },
};
const ENCOMBREMENTS = {
  compact:  { label: bi("Compact", "Compact"), picto: "📦", desc: bi("Parfait en petit espace / pot.", "Great for a small space / pot.") },
  moyen:    { label: bi("Moyen", "Medium"), picto: "🪴", desc: bi("Place raisonnable.", "A reasonable amount of space.") },
  gourmand: { label: bi("Gourmand en place", "Space-hungry"), picto: "🌾", desc: bi("Réserve-lui de la surface.", "Set aside plenty of room for it.") },
};
const SOLEILS = {
  plein:     { label: bi("Plein soleil", "Full sun"), picto: "☀️" },
  "mi-ombre":{ label: bi("Mi-ombre", "Partial shade"), picto: "⛅" },
  ombre:     { label: bi("Ombre", "Shade"), picto: "🌥️" },
};
const CATEGORIES = {
  legume:     { label: bi("Légume", "Vegetable"), hue: 130 },
  fruit:      { label: bi("Fruit", "Fruit"), hue: 340 },
  aromatique: { label: bi("Aromatique", "Herb"), hue: 175 },
  exotique:   { label: bi("Exotique", "Exotic"), hue: 32 },
};

// --- Monétisation : VERROUILLÉE --------------------------------------------------
// Permavore est un projet NON COMMERCIAL. C'est la condition de la licence d'essai
// de la police Graham (Zetafonts, licence #104877) utilisée pour le nom du site.
// Tant que MONETISATION_ACTIVE vaut false : aucun lien affilié, aucun badge
// « Partenaire », seulement une recherche web neutre.
// ⚠️ AVANT de passer à true, et dès le premier euro de revenu lié à Permavore :
//    acheter la licence commerciale Graham (Web + Logo) — voir README
//    « Licences et crédits » et braincentral BDR-023.
const MONETISATION_ACTIVE = false;

// --- Liens d'achat / partenaires (sponsoring, inactif tant que verrouillé) ------
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
    label: bi("Engrais laine de mouton", "Wool pellet fertilizer"), emoji: "🐑",
    mois: [3, 4, 5, 6, 9, 10],
    auSemis: true,
    cible: p => p.encombrement === "gourmand" || p.diff >= 2 || p.cat === "fruit",
    quand: bi("À la plantation, en fond de trou (printemps ; automne pour les vivaces)",
      "At planting time, in the bottom of the hole (spring; fall for perennials)"),
    conseil: bi("Une poignée au fond du trou de plantation : la laine libère son azote "
      + "lentement sur 6 mois et retient l'eau. Idéale pour les gourmandes "
      + "(tomate, courgette, courge, chou) — inutile de renouveler en cours de saison. "
      + "À l'automne, réserve-la aux plantations de vivaces et petits fruits : sur une "
      + "planche d'annuelles vide, l'azote serait lessivé pendant l'hiver.",
      "A handful in the bottom of the planting hole: the wool releases its nitrogen "
      + "slowly over 6 months and holds moisture. Ideal for heavy feeders "
      + "(tomato, zucchini, squash, cabbage) — no need to reapply during the season. "
      + "In fall, save it for perennials and berry bushes: on an empty bed for annuals, "
      + "the nitrogen would just leach away over winter."),
  },
  compost: {
    label: bi("Compost mûr", "Finished compost"), emoji: "🍂",
    mois: [2, 3, 4, 9, 10, 11],
    auSemis: true,
    cible: p => p.encombrement !== "compact",
    quand: bi("En fond de trou au printemps, ou en surface à l'automne",
      "In the bottom of the hole in spring, or on the surface in fall"),
    conseil: bi("Incorpore-le en surface (5 cm) sans l'enfouir profondément : "
      + "la vie du sol s'en charge. Au printemps pour nourrir, à l'automne pour protéger.",
      "Spread it on the surface (5 cm / 2 in) without burying it deep: "
      + "soil life takes care of the rest. In spring to feed, in fall to protect."),
  },
  paillage: {
    label: bi("Paillage (paille, BRF, tonte)", "Mulch (straw, wood chips, grass clippings)"), emoji: "🌾",
    mois: [5, 6, 7, 8],
    auSemis: false,
    cible: p => true,
    quand: bi("Dès que le sol est réchauffé, avant les fortes chaleurs",
      "As soon as the soil has warmed up, before the peak heat"),
    conseil: bi("5 à 10 cm autour des pieds, sans toucher les tiges : "
      + "moins d'arrosage, moins de désherbage, sol vivant.",
      "2 to 4 in (5–10 cm) around the plants, without touching the stems: "
      + "less watering, less weeding, a livelier soil."),
  },
  purin_ortie: {
    label: bi("Purin d'ortie", "Nettle liquid fertilizer"), emoji: "🌿",
    mois: [4, 5, 6, 7],
    auSemis: false,
    cible: p => p.cat === "legume" && p.typeLunaire === "feuille",
    quand: bi("En croissance, dilué à 10 %", "During growth, diluted to 10%"),
    conseil: bi("Riche en azote : stimule la croissance du feuillage. "
      + "Dilué à 10 % à l'arrosoir, toutes les 2 semaines maximum.",
      "Rich in nitrogen: boosts leafy growth. "
      + "Dilute to 10% and water it in, at most every 2 weeks."),
  },
  voile_hivernage: {
    label: bi("Voile d'hivernage / forçage", "Frost cover / row cover"), emoji: "🧊",
    mois: [10, 11, 12, 1, 2, 3],
    auSemis: false,
    cible: p => p.frileux || p.cycle === "vivace",
    quand: bi("Avant les premières gelées, et sur les semis précoces",
      "Before the first frosts, and over early sowings"),
    conseil: bi("Protège les frileuses du gel et permet de semer 2 à 3 semaines plus tôt "
      + "au printemps. À retirer aux heures chaudes pour aérer.",
      "Protects frost-sensitive plants and lets you sow 2 to 3 weeks earlier "
      + "in spring. Remove it during warm hours to let air in."),
  },
  filet_protection: {
    label: bi("Filet anti-insectes / anti-oiseaux", "Insect / bird netting"), emoji: "🕸️",
    mois: [4, 5, 6, 7, 8],
    auSemis: true,
    cible: p => ["chou", "carotte", "navet", "fraisier", "groseillier", "framboisier"].includes(p.id),
    quand: bi("Dès la plantation des choux/carottes, et avant la maturité des fruits rouges",
      "As soon as cabbage/carrots are planted, and before berries ripen"),
    conseil: bi("Le seul moyen fiable contre la piéride du chou, la mouche de la carotte "
      + "et les oiseaux sur les fruits rouges. Pose-le tôt, avant l'arrivée des ravageurs.",
      "The only reliable protection against cabbage white butterflies, carrot fly "
      + "and birds on berries. Put it up early, before pests arrive."),
  },
  serre: {
    label: bi("Serre / châssis", "Greenhouse / cold frame"), emoji: "🏡",
    mois: [2, 3, 4, 9, 10],
    auSemis: true,
    cible: p => p.frileux,
    quand: bi("Semis précoces au printemps, prolongation à l'automne",
      "Early sowings in spring, extending the season in fall"),
    conseil: bi("Permet de démarrer les frileuses (tomate, poivron, aubergine) "
      + "4 à 6 semaines avant la pleine terre, et de prolonger les récoltes en automne.",
      "Lets you start frost-sensitive plants (tomato, pepper, eggplant) "
      + "4 to 6 weeks before outdoor planting, and extend the harvest into fall."),
  },
};

// --- Base plantes ---
// semis : liste de fenêtres [moisDebut, moisFin] (semis OU plantation en pleine terre)
// frileux : true => sensible au gel, exclue de la zone montagne
// --- Cultures, pas variétés -----------------------------------------------------
// Chaque entrée de PLANTES est une CULTURE (espèce cultivée : « Tomate »,
// « Pomme de terre »), jamais une variété. Les variétés (cultivars : « Rose de
// Berne », « Charlotte ») se rattacheront à leur culture par `cultureId`, dans un
// catalogue distinct — c'est déjà le cas pour la tomate dans network-data.js.
// Objectif à terme : recommander des variétés adaptées localement.
const PLANTES = [
  { id:"tomate", nom:bi("Tomate","Tomato"), latin:"Solanum lycopersicum", cat:"legume", typeLunaire:"fruit", famille:"Solanacées", emoji:"🍅", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tomato_je.jpg/960px-Tomato_je.jpg",
    cycle:"annuelle", diff:2, encombrement:"moyen", soleil:"plein", densite:2.5, espacement:bi("50 cm","20 in"),
    frileux:true, semis:[[5,6]], mode:"plant", recolte:bi("Juillet → octobre","July → October"),
    court:bi("La star du potager : généreuse, savoureuse, indispensable en été.",
      "The star of the vegetable garden: generous, tasty, essential in summer."),
    long:bi("La tomate se plante après les dernières gelées, en plein soleil et dans une terre riche. Tuteurée et arrosée au pied (sans mouiller le feuillage), elle produit tout l'été. Variétés à foison : cerise, cœur de bœuf, ancienne…",
      "Tomatoes go in after the last frost, in full sun and rich soil. Staked and watered at the base (never on the foliage), they produce all summer. Endless varieties: cherry, beefsteak, heirloom…"),
    conseils:[bi("Planter enterré jusqu'aux premières feuilles pour un enracinement fort.","Plant deep, up to the first leaves, for strong rooting."),
      bi("Tuteurer dès la plantation et supprimer les gourmands.","Stake at planting time and remove side shoots (suckers)."),
      bi("Arroser régulièrement au pied, jamais sur les feuilles (mildiou).","Water regularly at the base, never on the leaves (blight).")] },

  { id:"courgette", nom:bi("Courgette","Zucchini"), latin:"Cucurbita pepo", cat:"legume", typeLunaire:"fruit", famille:"Cucurbitacées", emoji:"🥒", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/CSA-Striped-Zucchini.jpg/960px-CSA-Striped-Zucchini.jpg",
    cycle:"annuelle", diff:1, encombrement:"gourmand", soleil:"plein", densite:1, espacement:bi("80–100 cm","32–40 in"),
    frileux:true, semis:[[5,6]], mode:"semis", levee:[6,9], recolte:bi("Juin → octobre","June → October"),
    court:bi("Ultra productive : un ou deux pieds suffisent à nourrir une famille.",
      "Extremely productive: one or two plants are enough to feed a family."),
    long:bi("La courgette pousse vite et donne en continu si on la récolte jeune. Elle aime la chaleur, une terre riche en compost et de l'eau régulière. Attention, elle prend beaucoup de place.",
      "Zucchini grows fast and keeps producing if harvested young. It likes heat, compost-rich soil and regular watering. Note that it takes up a lot of room."),
    conseils:[bi("Récolter jeune (15–20 cm) pour stimuler la production.","Harvest young (6–8 in) to keep production going."),
      bi("Pailler le pied pour garder l'humidité.","Mulch around the base to retain moisture."),
      bi("Espacer largement les pieds : feuillage envahissant.","Space plants well apart: the foliage is sprawling.")] },

  { id:"radis", nom:bi("Radis","Radish"), latin:"Raphanus sativus", cat:"legume", typeLunaire:"racine", famille:"Brassicacées", emoji:"🔴", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Radish_3371103037_4ab07db0bf_o.jpg/960px-Radish_3371103037_4ab07db0bf_o.jpg",
    cycle:"annuelle", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:100, espacement:bi("3–5 cm","1–2 in"),
    semis:[[3,9]], eclaircir:true, mode:"semis", levee:[3,5], recolte:bi("3 à 5 semaines après semis","3 to 5 weeks after sowing"),
    court:bi("Le plus rapide : de la graine à l'assiette en un mois.","The fastest of all: from seed to plate in a month."),
    long:bi("Le radis est parfait pour débuter et pour les enfants : semis direct, croissance express. Semer peu dense et régulièrement (tous les 15 jours) pour un approvisionnement continu.",
      "Radish is perfect for beginners and kids: direct sowing, express growth. Sow thinly and regularly (every 2 weeks) for a continuous supply."),
    conseils:[bi("Semer clair pour éviter d'éclaircir.","Sow thinly to avoid having to thin out."),
      bi("Arroser souvent : un radis assoiffé devient piquant et creux.","Water often: a thirsty radish turns hot and hollow."),
      bi("Échelonner les semis toutes les 2 semaines.","Stagger sowings every 2 weeks.")] },

  { id:"laitue", nom:bi("Laitue","Lettuce"), latin:"Lactuca sativa", cat:"legume", typeLunaire:"feuille", famille:"Astéracées", emoji:"🥬", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Iceberg_lettuce_in_SB.jpg/960px-Iceberg_lettuce_in_SB.jpg",
    cycle:"annuelle", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:9, espacement:bi("25–30 cm","10–12 in"),
    semis:[[3,9]], eclaircir:true, mode:"semis", levee:[4,7], recolte:bi("Mai → novembre","May → November"),
    court:bi("Salade fraîche presque toute l'année, facile et rapide.","Fresh salad almost all year round, easy and quick."),
    long:bi("La laitue se cultive du printemps à l'automne. Semis échelonnés pour récolter en continu. À la belle saison, un peu d'ombre l'aide à ne pas monter en graines.",
      "Lettuce grows from spring to fall. Stagger sowings for a continuous harvest. In warm weather, a little shade helps prevent it from bolting."),
    conseils:[bi("Échelonner les semis pour éviter tout d'un coup.","Stagger sowings to avoid getting it all at once."),
      bi("Arroser le matin pour limiter les limaces.","Water in the morning to discourage slugs."),
      bi("En été, préférer la mi-ombre.","In summer, prefer partial shade.")] },

  { id:"carotte", nom:bi("Carotte","Carrot"), latin:"Daucus carota", cat:"legume", typeLunaire:"racine", famille:"Apiacées", emoji:"🥕", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Vegetable-Carrot-Bundle-wStalks.jpg/960px-Vegetable-Carrot-Bundle-wStalks.jpg",
    cycle:"bisannuelle", diff:2, encombrement:"compact", soleil:"plein", densite:80, espacement:bi("5 cm","2 in"),
    semis:[[3,7]], eclaircir:true, mode:"semis", levee:[10,20], recolte:bi("Juin → novembre","June → November"),
    court:bi("Croquante et sucrée, elle se conserve tout l'hiver.","Crunchy and sweet, it keeps all winter."),
    long:bi("La carotte aime une terre meuble, fine et sans cailloux. La levée est lente : garder le sol humide. Un voile anti-insectes protège de la mouche de la carotte.",
      "Carrots like loose, fine, stone-free soil. Germination is slow: keep the soil moist. A mesh cover protects against carrot fly."),
    conseils:[bi("Sol meuble et affiné, sans fumier frais (racines fourchues).","Loose, fine soil, no fresh manure (it forks the roots)."),
      bi("Maintenir humide jusqu'à la levée (2–3 semaines).","Keep moist until germination (2–3 weeks)."),
      bi("Éclaircir à 5 cm pour de belles racines.","Thin to 2 in (5 cm) apart for nice roots.")] },

  { id:"haricot", nom:bi("Haricot vert","Green bean"), latin:"Phaseolus vulgaris", cat:"legume", typeLunaire:"fruit", famille:"Fabacées", emoji:"🫘", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Heaps_of_beans.jpg/960px-Heaps_of_beans.jpg",
    cycle:"annuelle", diff:1, encombrement:"moyen", soleil:"plein", densite:30, espacement:bi("10 cm","4 in"),
    frileux:true, semis:[[5,7]], mode:"semis", levee:[6,9], recolte:bi("Juillet → octobre","July → October"),
    court:bi("Productif et facile, il enrichit même le sol en azote.","Productive and easy, it even enriches the soil with nitrogen."),
    long:bi("Semé quand le sol est réchauffé (mi-mai), le haricot lève vite. Nain ou à rames selon la place. Récolte régulière pour prolonger la production.",
      "Sown once the soil has warmed up (mid-May), beans germinate quickly. Bush or pole type depending on space. Pick regularly to keep production going."),
    conseils:[bi("Attendre un sol à 12 °C minimum pour semer.","Wait for the soil to reach at least 54°F (12°C) before sowing."),
      bi("Butter légèrement les jeunes plants.","Mound soil lightly around young plants."),
      bi("Cueillir souvent et jeune.","Pick often, while young.")] },

  { id:"pomme-de-terre", nom:bi("Pomme de terre","Potato"), latin:"Solanum tuberosum", cat:"legume", typeLunaire:"racine", famille:"Solanacées", emoji:"🥔", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Patates.jpg/960px-Patates.jpg",
    cycle:"annuelle", diff:1, encombrement:"gourmand", soleil:"plein", densite:4, espacement:bi("35 cm","14 in"),
    semis:[[3,5]], mode:"tubercule", recolte:bi("Juin → septembre","June → September"),
    court:bi("Rustique et nourrissante : un basique du jardin vivrier.","Hardy and filling: a staple of the food garden."),
    long:bi("On plante des tubercules germés au printemps. Le buttage régulier augmente le rendement et protège les tubercules de la lumière. Variétés précoces pour récolte d'été.",
      "Sprouted seed potatoes are planted in spring. Regular hilling boosts yield and keeps tubers out of the light. Early varieties for a summer harvest."),
    conseils:[bi("Faire pré-germer les plants avant plantation.","Pre-sprout (chit) the seed potatoes before planting."),
      bi("Butter dès que le feuillage atteint 20 cm.","Hill up as soon as the foliage reaches 8 in (20 cm)."),
      bi("Récolter par temps sec pour une meilleure conservation.","Harvest in dry weather for better storage.")] },

  { id:"poireau", nom:bi("Poireau","Leek"), latin:"Allium porrum", cat:"legume", typeLunaire:"racine", famille:"Alliacées", emoji:"🧅", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Leek_on_white_background_-_0947.jpg/960px-Leek_on_white_background_-_0947.jpg",
    cycle:"bisannuelle", diff:2, encombrement:"moyen", soleil:"plein", densite:16, espacement:bi("15 cm","6 in"),
    semis:[[5,8]], mode:"plant", recolte:bi("Septembre → mars","September → March"),
    court:bi("Le légume d'hiver par excellence, résistant au froid.","The winter vegetable par excellence, cold-hardy."),
    long:bi("Repiqué en été, le poireau se récolte de l'automne au printemps, même sous la neige. Le buttage blanchit et allonge le fût.",
      "Transplanted in summer, leeks are harvested from fall to spring, even under snow. Hilling blanches and lengthens the shaft."),
    conseils:[bi("Habiller racines et feuilles avant repiquage.","Trim roots and leaves before transplanting."),
      bi("Butter pour blanchir le fût.","Hill up to blanch the shaft."),
      bi("Laisser en terre l'hiver et récolter au besoin.","Leave in the ground over winter and harvest as needed.")] },

  { id:"epinard", nom:bi("Épinard","Spinach"), latin:"Spinacia oleracea", cat:"legume", typeLunaire:"feuille", famille:"Amaranthacées", emoji:"🥬", photo:"https://upload.wikimedia.org/wikipedia/commons/3/37/Spinacia_oleracea_Spinazie_bloeiend.jpg",
    cycle:"annuelle", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:25, espacement:bi("10 cm","4 in"),
    semis:[[3,4],[8,9]], eclaircir:true, mode:"semis", levee:[6,12], recolte:bi("6 à 8 semaines après semis","6 to 8 weeks after sowing"),
    court:bi("Feuilles tendres au printemps et à l'automne, riche en fer.","Tender leaves in spring and fall, rich in iron."),
    long:bi("L'épinard préfère la fraîcheur : semis de printemps et d'automne. En été il monte en graines. Récolte feuille à feuille pour prolonger.",
      "Spinach prefers cool weather: sow in spring and fall. In summer it bolts to seed. Pick leaf by leaf to extend the harvest."),
    conseils:[bi("Éviter le plein été (montée à graines).","Avoid the peak of summer (it bolts)."),
      bi("Sol riche en azote (compost).","Nitrogen-rich soil (compost)."),
      bi("Récolter les feuilles extérieures d'abord.","Harvest the outer leaves first.")] },

  { id:"betterave", nom:bi("Betterave","Beet"), latin:"Beta vulgaris", cat:"legume", typeLunaire:"racine", famille:"Amaranthacées", emoji:"🟣", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Detroitdarkredbeets.png/960px-Detroitdarkredbeets.png",
    cycle:"bisannuelle", diff:1, encombrement:"compact", soleil:"plein", densite:16, espacement:bi("10 cm","4 in"),
    semis:[[4,6]], eclaircir:true, mode:"semis", levee:[8,12], recolte:bi("Juillet → octobre","July → October"),
    court:bi("Douce et colorée, délicieuse rôtie ou en salade.","Sweet and colorful, delicious roasted or in a salad."),
    long:bi("La betterave se sème en place au printemps. Chaque graine donne plusieurs plants : éclaircir. Se conserve bien en cave l'hiver.",
      "Beets are sown directly in spring. Each seed cluster gives several seedlings: thin them out. It stores well in a root cellar over winter."),
    conseils:[bi("Éclaircir après la levée (un plant tous les 10 cm).","Thin after germination (one plant every 4 in / 10 cm)."),
      bi("Arroser régulièrement pour éviter les racines fibreuses.","Water regularly to avoid woody roots."),
      bi("Récolter avant les fortes gelées.","Harvest before hard frosts.")] },

  { id:"concombre", nom:bi("Concombre","Cucumber"), latin:"Cucumis sativus", cat:"legume", typeLunaire:"fruit", famille:"Cucurbitacées", emoji:"🥒", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/ARS_cucumber.jpg/960px-ARS_cucumber.jpg",
    cycle:"annuelle", diff:2, encombrement:"gourmand", soleil:"plein", densite:1.5, espacement:bi("60 cm","24 in"),
    frileux:true, semis:[[5,6]], mode:"semis", levee:[6,9], recolte:bi("Juillet → septembre","July → September"),
    court:bi("Rafraîchissant et productif, idéal palissé.","Refreshing and productive, great trellised."),
    long:bi("Le concombre aime la chaleur et l'eau. Palissé sur un treillis, il gagne de la place et donne des fruits droits. Récolte régulière pour éviter l'amertume.",
      "Cucumbers love heat and water. Trellised, they save space and produce straighter fruit. Pick regularly to avoid bitterness."),
    conseils:[bi("Palisser pour gagner de la place et des fruits sains.","Trellis it to save space and get healthier fruit."),
      bi("Arroser abondamment et régulièrement.","Water generously and regularly."),
      bi("Récolter jeune et souvent.","Harvest young and often.")] },

  { id:"courge", nom:bi("Courge / Potiron","Winter squash / Pumpkin"), latin:"Cucurbita maxima", cat:"legume", typeLunaire:"fruit", famille:"Cucurbitacées", emoji:"🎃", photo:"https://upload.wikimedia.org/wikipedia/commons/b/bd/Squashes.jpg",
    cycle:"annuelle", diff:1, encombrement:"gourmand", soleil:"plein", densite:0.5, espacement:bi("1–1,5 m","3–5 ft"),
    frileux:true, semis:[[5,6]], mode:"semis", levee:[6,10], recolte:bi("Septembre → octobre","September → October"),
    court:bi("Se conserve tout l'hiver : un pilier du jardin vivrier.","Keeps all winter: a staple of the food garden."),
    long:bi("Les courges courent au sol et demandent beaucoup de place et de compost. Récoltées mûres à l'automne, elles se gardent des mois au sec.",
      "Squash vines run along the ground and need lots of room and compost. Harvested ripe in fall, they keep for months in a dry place."),
    conseils:[bi("Planter sur un tas de compost mûr.","Plant on top of a mound of finished compost."),
      bi("Laisser 1 à 1,5 m entre les pieds.","Leave 3 to 5 ft (1–1.5 m) between plants."),
      bi("Récolter avant les gelées, laisser ressuyer au soleil.","Harvest before frost, then let them cure in the sun.")] },

  { id:"petit-pois", nom:bi("Petit pois","Pea"), latin:"Pisum sativum", cat:"legume", typeLunaire:"fruit", famille:"Fabacées", emoji:"🫛", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Peas_in_pods_-_Studio.jpg/960px-Peas_in_pods_-_Studio.jpg",
    cycle:"annuelle", diff:1, encombrement:"moyen", soleil:"plein", densite:40, espacement:bi("5 cm","2 in"),
    semis:[[2,4]], mode:"semis", levee:[8,12], recolte:bi("Mai → juillet","May → July"),
    court:bi("Semé tôt, il donne des récoltes sucrées de printemps.","Sown early, it gives sweet spring harvests."),
    long:bi("Le pois supporte le froid et se sème dès février-mars. Il aime être ramé. Enrichit le sol en azote comme toutes les légumineuses.",
      "Peas tolerate cold and can be sown as early as February–March. They like to be staked. Like all legumes, they enrich the soil with nitrogen."),
    conseils:[bi("Semer tôt, il craint peu le froid.","Sow early, it doesn't mind the cold much."),
      bi("Installer un support / rames.","Set up a support / trellis."),
      bi("Récolter au fur et à mesure, jeunes.","Pick continuously, while young.")] },

  { id:"feve", nom:bi("Fève","Fava bean"), latin:"Vicia faba", cat:"legume", typeLunaire:"fruit", famille:"Fabacées", emoji:"🫘",
    cycle:"annuelle", diff:1, encombrement:"moyen", soleil:"plein", densite:25, espacement:bi("15 cm","6 in"),
    semis:[[10,11],[2,3]], mode:"semis", levee:[7,10], recolte:bi("Mai → juin","May → June"),
    court:bi("Rustique, se sème même à l'automne dans le Sud.","Hardy — can even be sown in fall in warmer regions."),
    long:bi("La fève se sème en automne (climat doux) ou fin d'hiver. Elle résiste au froid et améliore le sol. Pincer les têtes limite les pucerons noirs.",
      "Fava beans are sown in fall (mild climate) or late winter. They tolerate cold and improve the soil. Pinching the tops limits black aphids."),
    conseils:[bi("Semer en automne en climat doux pour une récolte précoce.","Sow in fall in mild climates for an early harvest."),
      bi("Butter les jeunes plants.","Hill up young plants."),
      bi("Pincer les extrémités contre les pucerons.","Pinch off the tips to discourage aphids.")] },

  { id:"oignon", nom:bi("Oignon","Onion"), latin:"Allium cepa", cat:"legume", typeLunaire:"racine", famille:"Alliacées", emoji:"🧅", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Mixed_onions.jpg/960px-Mixed_onions.jpg",
    cycle:"bisannuelle", diff:1, encombrement:"compact", soleil:"plein", densite:40, espacement:bi("10 cm","4 in"),
    semis:[[2,4]], eclaircir:true, mode:"semis", levee:[10,20], recolte:bi("Juillet → août","July → August"),
    court:bi("Facile en bulbilles, se conserve très longtemps.","Easy from sets, keeps for a very long time."),
    long:bi("Planté en bulbilles au printemps, l'oignon demande peu d'entretien. On arrête d'arroser quand le feuillage jaunit, puis on récolte et on fait sécher.",
      "Planted from sets in spring, onions need little care. Stop watering once the foliage yellows, then harvest and let them dry."),
    conseils:[bi("Ne pas enterrer complètement la bulbille.","Don't bury the set completely."),
      bi("Sol pauvre plutôt que fumé fraîchement.","Poor soil rather than freshly manured."),
      bi("Sécher au soleil après récolte avant stockage.","Dry in the sun after harvest before storing.")] },

  { id:"ail", nom:bi("Ail","Garlic"), latin:"Allium sativum", cat:"legume", typeLunaire:"racine", famille:"Alliacées", emoji:"🧄",
    cycle:"bisannuelle", diff:1, encombrement:"compact", soleil:"plein", densite:40, espacement:bi("12 cm","5 in"),
    semis:[[10,12],[2,3]], mode:"caieu", recolte:bi("Juin → juillet","June → July"),
    court:bi("Se plante en hiver, se récolte en été. Zéro entretien.","Planted in winter, harvested in summer. Zero maintenance."),
    long:bi("On plante les caïeux (gousses) pointe vers le haut. L'ail d'automne donne les plus grosses têtes. Arrêter l'arrosage à l'approche de la récolte.",
      "Cloves are planted pointy end up. Fall-planted garlic gives the biggest heads. Stop watering as harvest approaches."),
    conseils:[bi("Planter la gousse pointe vers le haut.","Plant the clove pointy end up."),
      bi("Sol drainant, jamais détrempé.","Well-drained soil, never waterlogged."),
      bi("Récolter quand le feuillage sèche à moitié.","Harvest when about half the foliage has dried.")] },

  { id:"poivron", nom:bi("Poivron","Bell pepper"), latin:"Capsicum annuum", cat:"legume", typeLunaire:"fruit", famille:"Solanacées", emoji:"🫑", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Green-Yellow-Red-Pepper-2009.jpg/960px-Green-Yellow-Red-Pepper-2009.jpg",
    cycle:"annuelle", diff:2, encombrement:"moyen", soleil:"plein", densite:4, espacement:bi("50 cm","20 in"),
    frileux:true, semis:[[5,6]], mode:"plant", recolte:bi("Août → octobre","August → October"),
    court:bi("Coloré et sucré, il adore la chaleur.","Colorful and sweet, it loves heat."),
    long:bi("Le poivron se plante après tout risque de gel, en situation très chaude et abritée. Il fructifie tard : privilégier le Sud ou une serre au Nord.",
      "Peppers are planted once all frost risk has passed, in a very warm, sheltered spot. They fruit late: best suited to warm regions, or a greenhouse further north."),
    conseils:[bi("Attendre une terre bien réchauffée.","Wait for the soil to be well warmed up."),
      bi("Tuteurer, les branches sont cassantes.","Stake it — the branches are brittle."),
      bi("Pailler et arroser régulièrement.","Mulch and water regularly.")] },

  { id:"aubergine", nom:bi("Aubergine","Eggplant"), latin:"Solanum melongena", cat:"legume", typeLunaire:"fruit", famille:"Solanacées", emoji:"🍆", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Solanum_melongena_24_08_2012_%281%29.JPG/960px-Solanum_melongena_24_08_2012_%281%29.JPG",
    cycle:"annuelle", diff:3, encombrement:"gourmand", soleil:"plein", densite:3, espacement:bi("60 cm","24 in"),
    frileux:true, semis:[[5,6]], mode:"plant", recolte:bi("Août → octobre","August → October"),
    court:bi("Gourmande en chaleur : superbe au Sud, exigeante au Nord.","Loves heat: superb in warm regions, demanding further north."),
    long:bi("L'aubergine réclame chaleur, soleil et une longue saison. Elle démarre lentement puis produit jusqu'aux premiers froids. Serre conseillée en climat frais.",
      "Eggplant needs heat, sun and a long season. It starts slowly then produces until the first cold snap. A greenhouse is recommended in cooler climates."),
    conseils:[bi("Ne planter qu'en terre chaude (mi-mai/juin).","Only plant once the soil is warm (mid-May/June)."),
      bi("Tuteurer et limiter à 4–5 fruits par pied au Nord.","Stake it, and limit to 4–5 fruit per plant in cooler regions."),
      bi("Arrosage régulier, sans à-coups.","Water regularly and evenly.")] },

  { id:"chou", nom:bi("Chou pommé","Cabbage"), latin:"Brassica oleracea", cat:"legume", typeLunaire:"feuille", famille:"Brassicacées", emoji:"🥬", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Cabbage_and_cross_section_on_white.jpg/960px-Cabbage_and_cross_section_on_white.jpg",
    cycle:"bisannuelle", diff:2, encombrement:"gourmand", soleil:"plein", densite:4, espacement:bi("50 cm","20 in"),
    semis:[[5,7]], mode:"plant", recolte:bi("Automne → hiver","Fall → Winter"),
    court:bi("Rustique et nourrissant, il tient tout l'hiver.","Hardy and filling, it lasts all winter."),
    long:bi("Repiqué en été, le chou pomme à l'automne. Gros besoins en eau et en azote. Surveiller les chenilles de la piéride.",
      "Transplanted in summer, cabbage heads up in fall. High water and nitrogen needs. Watch out for cabbage white caterpillars."),
    conseils:[bi("Sol riche et frais, arrosages copieux.","Rich, moist soil, generous watering."),
      bi("Poser un filet anti-piéride.","Set up netting against cabbage moths."),
      bi("Butter au pied pour stabiliser.","Hill up at the base for stability.")] },

  { id:"navet", nom:bi("Navet","Turnip"), latin:"Brassica rapa", cat:"legume", typeLunaire:"racine", famille:"Brassicacées", emoji:"⚪", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Turnip_2622027.jpg/960px-Turnip_2622027.jpg",
    cycle:"annuelle", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:30, espacement:bi("10 cm","4 in"),
    semis:[[3,4],[8,9]], eclaircir:true, mode:"semis", levee:[4,6], recolte:bi("6 à 10 semaines après semis","6 to 10 weeks after sowing"),
    court:bi("Rapide de printemps ou d'automne, doux et tendre jeune.","Quick in spring or fall, mild and tender when young."),
    long:bi("Le navet se sème au printemps et à la fin de l'été. Croissance rapide, il aime la fraîcheur et l'eau régulière pour rester tendre.",
      "Turnips are sown in spring and late summer. Fast-growing, they like cool weather and regular water to stay tender."),
    conseils:[bi("Semer clair et éclaircir.","Sow thinly and thin out."),
      bi("Arroser régulièrement (sinon piquant et fibreux).","Water regularly (otherwise it turns hot and fibrous)."),
      bi("Récolter jeune, taille d'une balle de golf à tennis.","Harvest young, golf-ball to tennis-ball size.")] },

  { id:"blette", nom:bi("Blette (bette à carde)","Swiss chard"), latin:"Beta vulgaris var. cicla", cat:"legume", typeLunaire:"feuille", famille:"Amaranthacées", emoji:"🥬", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Chard_%28Beta_vulgaris_var_cicla%29.jpg/960px-Chard_%28Beta_vulgaris_var_cicla%29.jpg",
    cycle:"bisannuelle", diff:1, encombrement:"moyen", soleil:"mi-ombre", densite:9, espacement:bi("35 cm","14 in"),
    semis:[[4,6]], eclaircir:true, mode:"semis", levee:[8,10], recolte:bi("Juillet → automne (et +)","July → Fall (and beyond)"),
    court:bi("Deux légumes en un : cardes et feuilles, très productive.","Two vegetables in one: stalks and leaves, very productive."),
    long:bi("La blette produit longtemps si on récolte feuille à feuille. Belle en carde blanche ou colorée. Peu exigeante, elle tolère la mi-ombre.",
      "Chard produces for a long time if you harvest leaf by leaf. Attractive with white or colorful stalks. Undemanding, it tolerates partial shade."),
    conseils:[bi("Récolter les feuilles extérieures au fur et à mesure.","Harvest the outer leaves as you go."),
      bi("Arroser en été pour éviter la montée à graines.","Water in summer to prevent bolting."),
      bi("Un paillage suffit à l'entretenir.","A layer of mulch is all the upkeep it needs.")] },

  { id:"mache", nom:bi("Mâche","Corn salad (mâche)"), latin:"Valerianella locusta", cat:"legume", typeLunaire:"feuille", famille:"Valérianacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Ackersalat02.jpg/960px-Ackersalat02.jpg",
    cycle:"annuelle", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:100, espacement:bi("5 cm","2 in"),
    semis:[[8,10]], eclaircir:true, mode:"semis", levee:[6,12], recolte:bi("Octobre → mars","October → March"),
    court:bi("La salade d'hiver rustique, semée en fin d'été.","The hardy winter salad green, sown in late summer."),
    long:bi("La mâche se sème d'août à octobre pour récolter tout l'hiver. Très résistante au froid, elle demande juste un sol tassé et un peu d'eau à la levée.",
      "Corn salad is sown from August to October to harvest all winter. Very cold-hardy, it just needs firmed soil and a little water at germination."),
    conseils:[bi("Tasser le sol après semis (contact graine/terre).","Firm the soil after sowing (seed-to-soil contact)."),
      bi("Arroser finement jusqu'à la levée.","Water gently with a fine spray until germination."),
      bi("Récolter la rosette entière au couteau.","Harvest the whole rosette with a knife.")] },

  { id:"roquette", nom:bi("Roquette","Arugula"), latin:"Eruca sativa", cat:"legume", typeLunaire:"feuille", famille:"Brassicacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Eruca_sativa_sl11.jpg/960px-Eruca_sativa_sl11.jpg",
    cycle:"annuelle", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:60, espacement:bi("5 cm","2 in"),
    semis:[[3,9]], eclaircir:true, mode:"semis", levee:[4,8], recolte:bi("4 à 6 semaines après semis","4 to 6 weeks after sowing"),
    court:bi("Piquante et express : coupez-la, elle repousse.","Peppery and quick: cut it and it grows back."),
    long:bi("La roquette pousse vite et se récolte en coupant les feuilles (elle repart). En été, l'ombre légère évite qu'elle devienne trop piquante et monte.",
      "Arugula grows fast and is harvested by cutting the leaves (it regrows). In summer, light shade keeps it from turning too peppery and bolting."),
    conseils:[bi("Semer échelonné toutes les 3 semaines.","Sow in successive batches every 3 weeks."),
      bi("Couper les feuilles, laisser le cœur repartir.","Cut the leaves, leave the crown to regrow."),
      bi("Arroser pour garder la douceur.","Water it to keep the flavor mild.")] },

  { id:"basilic", nom:bi("Basilic","Basil"), latin:"Ocimum basilicum", cat:"aromatique", typeLunaire:"feuille", famille:"Lamiacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Ocimum_basilicum_8zz.jpg/960px-Ocimum_basilicum_8zz.jpg",
    cycle:"annuelle", diff:2, encombrement:"compact", soleil:"plein", densite:9, espacement:bi("25 cm","10 in"),
    frileux:true, semis:[[5,6]], mode:"semis", levee:[8,12], recolte:bi("Juin → septembre","June → September"),
    court:bi("L'aromatique de l'été, reine des tomates et du pesto.","The herb of summer, queen of tomatoes and pesto."),
    long:bi("Le basilic est frileux : à installer une fois les nuits douces. Il aime le soleil, la chaleur et une terre humide. Pincer les fleurs prolonge la production de feuilles.",
      "Basil is frost-sensitive: plant it once nights are mild. It likes sun, heat and moist soil. Pinching off flowers extends leaf production."),
    conseils:[bi("Ne sortir qu'après mi-mai (craint le froid).","Only plant outside after mid-May (it dislikes cold)."),
      bi("Pincer les têtes florales régulièrement.","Pinch off flower buds regularly."),
      bi("Arroser le matin, sans mouiller le feuillage.","Water in the morning, without wetting the foliage.")] },

  { id:"persil", nom:bi("Persil","Parsley"), latin:"Petroselinum crispum", cat:"aromatique", typeLunaire:"feuille", famille:"Apiacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Petroselinum.jpg/960px-Petroselinum.jpg",
    cycle:"bisannuelle", diff:2, encombrement:"compact", soleil:"mi-ombre", densite:16, espacement:bi("15 cm","6 in"),
    semis:[[3,7]], eclaircir:true, mode:"semis", levee:[15,30], recolte:bi("Toute l'année (selon semis)","Year-round (depending on sowing)"),
    court:bi("Incontournable, mais patient : la levée est lente.","A must-have, but be patient: germination is slow."),
    long:bi("Le persil met 3 à 4 semaines à lever. Tremper les graines 24 h accélère. Bisannuel, il monte en graines la 2ᵉ année : on le ressème alors.",
      "Parsley takes 3 to 4 weeks to germinate. Soaking the seeds for 24 h speeds it up. Being biennial, it bolts to seed the 2nd year, so it's resown then."),
    conseils:[bi("Tremper les graines 24 h avant semis.","Soak the seeds for 24 h before sowing."),
      bi("Maintenir humide jusqu'à la levée (longue).","Keep moist until germination (it's slow)."),
      bi("Récolter par l'extérieur, laisser le cœur.","Harvest from the outside, leave the center.")] },

  { id:"ciboulette", nom:bi("Ciboulette","Chives"), latin:"Allium schoenoprasum", cat:"aromatique", typeLunaire:"feuille", famille:"Alliacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Allium_schoenoprasum_-_Bombus_lapidarius_-_Tootsi.jpg/960px-Allium_schoenoprasum_-_Bombus_lapidarius_-_Tootsi.jpg",
    cycle:"vivace", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:16, espacement:bi("20 cm","8 in"),
    semis:[[3,5]], mode:"semis", levee:[8,12], recolte:bi("Mars → novembre","March → November"),
    court:bi("Vivace increvable : plantée une fois, elle revient chaque année.","An indestructible perennial: plant it once and it comes back every year."),
    long:bi("La ciboulette forme une touffe qui repousse au printemps et se divise facilement. Ses fleurs roses sont comestibles et mellifères. Coupez-la à ras, elle reprend.",
      "Chives form a clump that regrows in spring and divides easily. Their pink flowers are edible and loved by bees. Cut it back hard and it regrows."),
    conseils:[bi("Diviser la touffe tous les 2–3 ans.","Divide the clump every 2–3 years."),
      bi("Couper à ras pour relancer des feuilles tendres.","Cut back hard to get tender new leaves."),
      bi("Laisser quelques fleurs pour les pollinisateurs.","Leave a few flowers for pollinators.")] },

  { id:"thym", nom:bi("Thym","Thyme"), latin:"Thymus vulgaris", cat:"aromatique", typeLunaire:"feuille", famille:"Lamiacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Thyme-Bundle.jpg/960px-Thyme-Bundle.jpg",
    cycle:"vivace", diff:1, encombrement:"compact", soleil:"plein", densite:4, espacement:bi("30 cm","12 in"),
    semis:[[3,5],[9,9]], mode:"semis", levee:[18,24], recolte:bi("Toute l'année","Year-round"),
    court:bi("Vivace méditerranéenne : soleil, sol sec, aucun soin.","A Mediterranean perennial: sun, dry soil, no care needed."),
    long:bi("Le thym adore le sec et le plein soleil. Il redoute l'humidité stagnante. Une taille après floraison le garde compact et dense.",
      "Thyme loves dry conditions and full sun. It dislikes standing moisture. A trim after flowering keeps it compact and dense."),
    conseils:[bi("Sol drainant, surtout pas détrempé.","Well-drained soil, never waterlogged."),
      bi("Tailler légèrement après la floraison.","Trim lightly after flowering."),
      bi("Aucun arrosage une fois installé.","No watering needed once established.")] },

  { id:"menthe", nom:bi("Menthe","Mint"), latin:"Mentha", cat:"aromatique", typeLunaire:"feuille", famille:"Lamiacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Mentha_aquatica_%282005_09_18%29_-_uitsnede.jpg/960px-Mentha_aquatica_%282005_09_18%29_-_uitsnede.jpg",
    cycle:"vivace", diff:1, encombrement:"moyen", soleil:"mi-ombre", densite:4, espacement:bi("30 cm","12 in"),
    semis:[[3,5],[9,9]], mode:"plant", recolte:bi("Avril → octobre","April → October"),
    court:bi("Vivace généreuse… et envahissante : à contenir en pot.","A generous perennial… and an invasive one: keep it contained in a pot."),
    long:bi("La menthe pousse toute seule et se propage par ses racines. La cultiver en pot ou en zone délimitée évite qu'elle colonise le potager. Fraîcheur et mi-ombre lui conviennent.",
      "Mint grows on its own and spreads by its roots. Growing it in a pot or a contained bed keeps it from taking over the garden. It likes coolness and partial shade."),
    conseils:[bi("La cultiver en pot / barrière pour la contenir.","Grow it in a pot / with a root barrier to contain it."),
      bi("Rabattre en été pour des feuilles tendres.","Cut it back in summer for tender new leaves."),
      bi("Diviser la touffe chaque année.","Divide the clump every year.")] },

  { id:"romarin", nom:bi("Romarin","Rosemary"), latin:"Salvia rosmarinus", cat:"aromatique", typeLunaire:"feuille", famille:"Lamiacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Rosemary_in_bloom.JPG/960px-Rosemary_in_bloom.JPG",
    cycle:"vivace", diff:1, encombrement:"moyen", soleil:"plein", densite:1, espacement:bi("80 cm","32 in"),
    semis:[[4,5],[9,9]], mode:"plant", recolte:bi("Toute l'année","Year-round"),
    court:bi("Arbuste aromatique persistant, mellifère et increvable.","An evergreen aromatic shrub, loved by bees and nearly indestructible."),
    long:bi("Le romarin devient un buste ligneux qui fleurit dès l'hiver dans le Sud. Sol sec et drainé, plein soleil. Rustique mais à protéger en climat très froid.",
      "Rosemary becomes a woody bush that flowers as early as winter in warm regions. Dry, well-drained soil, full sun. Hardy, but protect it in very cold climates."),
    conseils:[bi("Drainage impératif (craint l'humidité hivernale).","Drainage is essential (it dislikes winter moisture)."),
      bi("Tailler après floraison pour garder la forme.","Prune after flowering to keep its shape."),
      bi("Bouturage très facile au printemps.","Very easy to propagate from cuttings in spring.")] },

  { id:"fraisier", nom:bi("Fraisier","Strawberry"), latin:"Fragaria × ananassa", cat:"fruit", typeLunaire:"fruit", famille:"Rosacées", emoji:"🍓", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Garden_strawberry_%28Fragaria_%C3%97_ananassa%29_single2.jpg/960px-Garden_strawberry_%28Fragaria_%C3%97_ananassa%29_single2.jpg",
    cycle:"vivace", diff:1, encombrement:"compact", soleil:"mi-ombre", densite:6, espacement:bi("35 cm","14 in"),
    semis:[[3,4],[8,9]], mode:"plant", recolte:bi("Mai → juillet (ou remontant tout l'été)","May → July (or all summer for ever-bearing types)"),
    court:bi("Le fruit vivace parfait pour débuter et régaler les enfants.","The perfect perennial fruit for beginners, and a treat for kids."),
    long:bi("Planté au printemps ou fin d'été, le fraisier produit dès l'année suivante et se multiplie par stolons. Variétés remontantes pour des fraises tout l'été. À renouveler tous les 3–4 ans.",
      "Planted in spring or late summer, strawberries produce from the following year and multiply by runners. Ever-bearing varieties give strawberries all summer. Renew the patch every 3–4 years."),
    conseils:[bi("Ne pas enterrer le cœur (collet) du plant.","Don't bury the crown of the plant."),
      bi("Pailler pour des fruits propres et de l'humidité.","Mulch for clean fruit and moisture retention."),
      bi("Récupérer les stolons pour renouveler la fraiseraie.","Use the runners to renew the patch.")] },

  { id:"framboisier", nom:bi("Framboisier","Raspberry"), latin:"Rubus idaeus", cat:"fruit", typeLunaire:"fruit", famille:"Rosacées", emoji:"🍇", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Raspberry_-_halved_%28Rubus_idaeus%29.jpg/960px-Raspberry_-_halved_%28Rubus_idaeus%29.jpg",
    cycle:"vivace", diff:1, encombrement:"moyen", soleil:"mi-ombre", densite:3, espacement:bi("50 cm","20 in"),
    semis:[[10,12],[2,3]], mode:"plant", recolte:bi("Juin → octobre (selon variété)","June → October (depending on variety)"),
    court:bi("Vivace généreuse : une haie fruitière productive et rustique.","A generous perennial: a productive, hardy fruit hedge."),
    long:bi("Le framboisier se plante à racines nues en automne/hiver. Palissé sur des fils, il donne en début d'été (non remontant) ou jusqu'à l'automne (remontant). Il drageonne : à contenir.",
      "Raspberries are planted bare-root in fall/winter. Trellised on wires, they fruit in early summer (summer-bearing) or through fall (ever-bearing). They sucker, so keep them contained."),
    conseils:[bi("Palisser sur 2 fils pour faciliter la récolte.","Trellis on 2 wires to make harvesting easier."),
      bi("Tailler selon le type (remontant / non remontant).","Prune according to type (ever-bearing / summer-bearing)."),
      bi("Pailler généreusement, il aime la fraîcheur.","Mulch generously, it likes cool, moist soil.")] },

  { id:"rhubarbe", nom:bi("Rhubarbe","Rhubarb"), latin:"Rheum rhabarbarum", cat:"fruit", typeLunaire:"feuille", famille:"Polygonacées", emoji:"🌿", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Rheum_rhabarbarum.2006-04-27.uellue.jpg/960px-Rheum_rhabarbarum.2006-04-27.uellue.jpg",
    cycle:"vivace", diff:1, encombrement:"gourmand", soleil:"mi-ombre", densite:1, espacement:bi("1 m","3 ft"),
    semis:[[10,11],[2,3]], mode:"plant", recolte:bi("Avril → juin","April → June"),
    court:bi("Vivace robuste : un pied nourrit des années de compotes.","A tough perennial: one plant provides years of desserts."),
    long:bi("La rhubarbe s'installe pour 10 ans. Elle aime les sols riches et frais et la mi-ombre. On récolte les pétioles (les feuilles sont toxiques) sans jamais tout prélever d'un coup.",
      "Rhubarb settles in for 10 years. It likes rich, moist soil and partial shade. Harvest the stalks (the leaves are toxic) without ever taking them all at once."),
    conseils:[bi("Sol profond et riche en compost.","Deep soil, rich in compost."),
      bi("Tirer les tiges (ne pas couper), garder la moitié.","Pull the stalks (don't cut), leaving about half."),
      bi("Ne jamais consommer les feuilles (toxiques).","Never eat the leaves (toxic).")] },

  { id:"groseillier", nom:bi("Groseillier","Currant bush"), latin:"Ribes rubrum", cat:"fruit", typeLunaire:"fruit", famille:"Grossulariacées", emoji:"🍇", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Ribes_rubrum_1.jpg/960px-Ribes_rubrum_1.jpg",
    cycle:"vivace", diff:1, encombrement:"moyen", soleil:"mi-ombre", densite:1, espacement:bi("1,2 m","4 ft"),
    semis:[[10,12],[2,3]], mode:"plant", recolte:bi("Juin → juillet","June → July"),
    court:bi("Petit fruit rustique, parfait même en mi-ombre.","A hardy berry, great even in partial shade."),
    long:bi("Le groseillier se plante en repos végétatif (automne à mars). Rustique et peu exigeant, il tolère la mi-ombre. Une taille d'hiver aère la touffe et renouvelle le bois.",
      "Currant bushes are planted while dormant (fall to March). Hardy and undemanding, they tolerate partial shade. A winter prune opens up the bush and renews the wood."),
    conseils:[bi("Planter à racines nues en hiver.","Plant bare-root in winter."),
      bi("Tailler en hiver pour aérer et renouveler.","Prune in winter to open up and renew the bush."),
      bi("Filet anti-oiseaux à l'approche de la récolte.","Bird netting as harvest approaches.")] },

  { id:"cassis", nom:bi("Cassis","Blackcurrant"), latin:"Ribes nigrum", cat:"fruit", typeLunaire:"fruit", famille:"Grossulariacées", emoji:"🫐",
    cycle:"vivace", diff:1, encombrement:"moyen", soleil:"mi-ombre", densite:1, espacement:bi("1,5 m","5 ft"),
    semis:[[10,12],[2,3]], mode:"plant", recolte:bi("Juillet","July"),
    court:bi("Baie noire très riche en vitamine C, rustique et peu exigeante.","A very vitamin-C-rich black berry, hardy and undemanding."),
    long:bi("Le cassissier se plante en repos végétatif, d'octobre à mars. Ses racines sont superficielles : il souffre vite de la sécheresse, et un manque d'eau de quelques jours au moment où se forment les futures fleurs ampute la récolte de l'année suivante. La taille d'hiver renouvelle le bois, car les meilleures grappes viennent des pousses de l'année précédente.",
      "Blackcurrants are planted while dormant, from October to March. Their roots are shallow, so they suffer quickly from drought: a few dry days while next year's flowers are forming will cut the following harvest. Winter pruning renews the wood, since the best clusters come from the previous year's shoots."),
    conseils:[bi("Pailler généreusement : les racines sont superficielles.","Mulch generously — the roots are shallow."),
      bi("Arroser sans faute pendant l'été qui suit la floraison.","Water without fail during the summer after flowering."),
      bi("Tailler en hiver le bois de plus de trois ans.","In winter, cut out wood older than three years.")] },

  { id:"pommier", nom:bi("Pommier","Apple tree"), latin:"Malus domestica", cat:"fruit", typeLunaire:"fruit", famille:"Rosacées", emoji:"🍎",
    cycle:"vivace", diff:2, encombrement:"gourmand", soleil:"plein", densite:1, espacement:bi("4 m","13 ft"),
    semis:[[11,12],[1,3]], mode:"plant", recolte:bi("Août → octobre selon la variété","August → October depending on variety"),
    court:bi("L'arbre fruitier de garde par excellence, à installer une fois pour des décennies.","The keeping fruit tree par excellence — planted once, for decades."),
    long:bi("Le pommier se plante à racines nues en repos végétatif. Il lui faut un hiver assez froid pour lever sa dormance : c'est le critère qui décide où il peut pousser, bien plus que la chaleur d'été. La plupart des variétés ont besoin d'une seconde variété proche pour être pollinisées. Compter trois à cinq ans avant une vraie récolte.",
      "Apple trees are planted bare-root while dormant. They need a cold enough winter to break dormancy — that requirement, far more than summer heat, decides where they can grow. Most varieties need a second variety nearby for pollination. Expect three to five years before a real harvest."),
    conseils:[bi("Prévoir une seconde variété pour la pollinisation.","Plan a second variety for pollination."),
      bi("Choisir une variété selon le froid hivernal de ton lieu.","Choose a variety to match your winter chill."),
      bi("Tailler en hiver, hors période de gel.","Prune in winter, outside frost spells.")] },

  { id:"figuier", nom:bi("Figuier","Fig tree"), latin:"Ficus carica", cat:"exotique", typeLunaire:"fruit", famille:"Moracées", emoji:"🌳",
    cycle:"vivace", diff:1, encombrement:"gourmand", soleil:"plein", densite:0.1, espacement:bi("3–4 m","10–13 ft"),
    semis:[[10,11],[2,3]], mode:"plant", recolte:bi("Juillet → septembre","July → September"),
    court:bi("L'arbre méditerranéen par excellence : rustique et généreux.","The quintessential Mediterranean tree: hardy and generous."),
    long:bi("Le figuier pousse presque partout en France, adossé à un mur au chaud dans les régions fraîches. Peu exigeant, il fructifie vite et vit des décennies. Certaines variétés donnent deux récoltes par an.",
      "Fig trees grow almost everywhere in France, against a warm wall in cooler regions — a sheltered south-facing wall works well in cooler climates too. Undemanding, it fruits quickly and lives for decades. Some varieties give two harvests a year."),
    conseils:[bi("L'installer contre un mur exposé sud en climat frais.","Plant it against a south-facing wall in cooler climates."),
      bi("Sol drainant ; il craint surtout l'excès d'eau.","Well-drained soil; it mainly dislikes waterlogging."),
      bi("Tailler léger en fin d'hiver pour contenir le volume.","Prune lightly in late winter to keep its size in check.")] },

  { id:"kiwi", nom:bi("Kiwi","Kiwifruit"), latin:"Actinidia deliciosa", cat:"exotique", typeLunaire:"fruit", famille:"Actinidiacées", emoji:"🥝", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Actinidia_fruits.jpg/960px-Actinidia_fruits.jpg",
    cycle:"vivace", diff:2, encombrement:"gourmand", soleil:"plein", densite:0.2, espacement:bi("3–4 m","10–13 ft"),
    semis:[[10,11],[2,3]], mode:"plant", recolte:bi("Octobre → novembre","October → November"),
    court:bi("Liane vigoureuse et productive… si pied mâle ET femelle.","A vigorous, productive vine… provided you have a male AND a female plant."),
    long:bi("Le kiwi est une liane rustique qui grimpe sur pergola. Il faut en général un pied mâle pour polliniser plusieurs femelles (sauf variétés autofertiles). Récolte abondante à l'automne, à laisser mûrir après cueillette.",
      "Kiwi is a hardy vine that climbs over a pergola. You generally need one male plant to pollinate several females (except self-fertile varieties). Abundant harvest in fall — let the fruit ripen after picking."),
    conseils:[bi("Prévoir un mâle pour 3–5 femelles (ou variété autofertile).","Plan for one male per 3–5 females (or use a self-fertile variety)."),
      bi("Palisser sur une structure solide (liane lourde).","Train it on a sturdy structure — the vine gets heavy."),
      bi("Sol frais et non calcaire, arrosage régulier l'été.","Cool, lime-free soil, regular watering in summer.")] },

  { id:"grenadier", nom:bi("Grenadier","Pomegranate"), latin:"Punica granatum", cat:"exotique", typeLunaire:"fruit", famille:"Lythracées", emoji:"🔴", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Pomegranate_Juice_%282019%29.jpg/960px-Pomegranate_Juice_%282019%29.jpg",
    cycle:"vivace", diff:2, encombrement:"moyen", soleil:"plein", densite:0.3, espacement:bi("2–3 m","7–10 ft"),
    frileux:true, semis:[[3,4],[10,11]], mode:"plant", recolte:bi("Septembre → octobre","September → October"),
    court:bi("Grenades au jardin : superbe floraison rouge, fruit du Sud.","Pomegranates in the garden: gorgeous red blooms, a fruit of warm climates."),
    long:bi("Le grenadier prospère en climat doux et chaud ; ailleurs, il fleurit mais mûrit mal ses fruits. Belle floraison estivale orangée. À protéger du gel les premières années.",
      "Pomegranate thrives in a mild, warm climate; elsewhere it flowers but its fruit ripens poorly. Lovely orange-red summer blooms. Protect from frost in its first few years."),
    conseils:[bi("Réserver le plein soleil le plus chaud (mur sud).","Give it the warmest full-sun spot (a south-facing wall)."),
      bi("Protéger le pied du gel en hiver les 1res années.","Protect the base from frost in winter for the first few years."),
      bi("Variétés fruitières ('Provence') pour de vraies grenades.","Choose fruiting varieties ('Provence') for real pomegranates.")] },

  { id:"citronnier", nom:bi("Citronnier","Lemon tree"), latin:"Citrus limon", cat:"exotique", typeLunaire:"fruit", famille:"Rutacées", emoji:"🍋", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/P1030323.JPG/960px-P1030323.JPG",
    cycle:"vivace", diff:2, encombrement:"moyen", soleil:"plein", densite:0.5, espacement:bi("en pot ou 2 m","potted, or 7 ft"),
    frileux:true, semis:[[4,5]], mode:"plant", recolte:bi("Automne → hiver","Fall → Winter"),
    court:bi("Agrume en pot : soleil l'été, abri hors gel l'hiver.","A potted citrus: sun in summer, frost-free shelter in winter."),
    long:bi("Hors du littoral méditerranéen, le citronnier se cultive en grand pot : dehors au soleil d'avril à octobre, rentré en véranda ou serre froide l'hiver (il gèle dès −2 °C). Fleurs parfumées et fruits sur plusieurs mois.",
      "Outside of the warmest, mildest climates, lemon trees are grown in a large pot: outside in the sun from April to October, brought into a sunroom or cold greenhouse in winter (it's damaged by frost below about 28°F / −2°C). Fragrant flowers and fruit over several months."),
    conseils:[bi("En pot partout sauf zone méditerranéenne abritée.","Grow it in a pot everywhere except a sheltered Mediterranean-type climate."),
      bi("Rentrer hors gel dès l'automne (pièce claire et fraîche).","Bring it into a frost-free, bright, cool room starting in fall."),
      bi("Engrais agrumes en saison, arrosage à l'eau non calcaire.","Citrus fertilizer during the growing season, water with lime-free water.")] },

  { id:"patate-douce", nom:bi("Patate douce","Sweet potato"), latin:"Ipomoea batatas", cat:"exotique", typeLunaire:"racine", famille:"Convolvulacées", emoji:"🍠", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Ipomoea_batatas_006.JPG/960px-Ipomoea_batatas_006.JPG",
    cycle:"annuelle", diff:2, encombrement:"gourmand", soleil:"plein", densite:4, espacement:bi("40 cm","16 in"),
    frileux:true, semis:[[5,6]], mode:"plant", recolte:bi("Octobre (avant les gelées)","October (before frost)"),
    court:bi("Tubercule sucré et tropical, adopté par les potagers français.","A sweet, tropical tuber that's found its way into French gardens."),
    long:bi("La patate douce aime la chaleur : plantée en plants après les gelées, elle court au sol tout l'été et se récolte en octobre. Le paillage plastique noir réchauffe le sol et booste la récolte au Nord.",
      "Sweet potato likes heat: planted as slips after the last frost, it sprawls all summer and is harvested in October. Black plastic mulch warms the soil and boosts the harvest in cooler regions."),
    conseils:[bi("Planter en terre bien réchauffée (mi-mai/juin).","Plant once the soil is well warmed up (mid-May/June)."),
      bi("Pailler (plastique noir au Nord) pour la chaleur.","Mulch (black plastic in cooler regions) for extra warmth."),
      bi("Récolter avant la première gelée, laisser ressuyer.","Harvest before the first frost, then let the tubers cure.")] },

  { id:"physalis", nom:bi("Physalis (Coqueret du Pérou)","Cape gooseberry (physalis)"), latin:"Physalis peruviana", cat:"exotique", typeLunaire:"fruit", famille:"Solanacées", emoji:"🟡", photo:"https://upload.wikimedia.org/wikipedia/commons/8/87/Uchuva_2005.jpg",
    cycle:"annuelle", diff:1, encombrement:"moyen", soleil:"plein", densite:2, espacement:bi("70 cm","28 in"),
    frileux:true, semis:[[5,6]], mode:"plant", recolte:bi("Août → octobre","August → October"),
    court:bi("Petites lanternes sucrées-acidulées, faciles et originales.","Sweet-tart little paper lanterns, easy and unusual."),
    long:bi("Le physalis se cultive comme la tomate : plants installés après les gelées, en plein soleil. Chaque fruit se cache dans une lanterne de papier. Très productif, il se ressème souvent seul.",
      "Physalis is grown like tomatoes: planted after the last frost, in full sun. Each fruit is hidden inside a papery husk. Very productive, it often self-seeds."),
    conseils:[bi("Cultiver comme une tomate (soleil, tuteur léger).","Grow it like a tomato (sun, light staking)."),
      bi("Récolter quand la lanterne sèche et le fruit tombe.","Harvest when the husk dries and the fruit drops."),
      bi("Se ressème facilement : garder quelques fruits au sol.","Self-seeds easily: leave a few fruit on the ground.")] },

  { id:"kaki", nom:bi("Kaki (Plaqueminier)","Persimmon"), latin:"Diospyros kaki", cat:"exotique", typeLunaire:"fruit", famille:"Ébénacées", emoji:"🟠", photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Fuyu_persimmon_fruits%2C_one_cut_open.jpg/960px-Fuyu_persimmon_fruits%2C_one_cut_open.jpg",
    cycle:"vivace", diff:1, encombrement:"gourmand", soleil:"plein", densite:0.1, espacement:bi("4–5 m","13–16 ft"),
    semis:[[11,12],[2,3]], mode:"plant", recolte:bi("Octobre → novembre","October → November"),
    court:bi("Arbre rustique aux fruits orange qui illuminent l'automne.","A hardy tree whose orange fruit lights up the fall."),
    long:bi("Le plaqueminier est plus rustique qu'on ne le croit et pousse dans une grande moitié de la France. Il donne des kakis oranges après la chute des feuilles. Peu de maladies, peu d'entretien.",
      "Persimmon trees are hardier than people think, and grow across most of France — and in much of the US. They give orange fruit after the leaves drop. Few diseases, little upkeep."),
    conseils:[bi("Emplacement ensoleillé, sol profond et frais.","Sunny spot, deep, moist soil."),
      bi("Patienter : la mise à fruit demande quelques années.","Be patient: fruiting takes a few years to start."),
      bi("Récolter blets (variétés astringentes) ou fermes ('Fuyu').","Harvest very ripe (astringent varieties) or firm ('Fuyu' type).")] },

  { id:"gingembre", nom:bi("Gingembre","Ginger"), latin:"Zingiber officinale", cat:"exotique", typeLunaire:"racine", famille:"Zingibéracées", emoji:"🫚",
    cycle:"vivace", diff:2, encombrement:"compact", soleil:"mi-ombre", densite:4, espacement:bi("30 cm (pot)","12 in (pot)"),
    frileux:true, semis:[[3,4]], mode:"rhizome", recolte:bi("Automne (8–10 mois après)","Fall (8–10 months later)"),
    court:bi("Cultivable en pot à partir d'un rhizome du commerce.","Can be grown in a pot from a store-bought rhizome."),
    long:bi("Un morceau de rhizome bio qui bourgeonne, planté au chaud au printemps, donne un beau plant de gingembre. En pot à l'intérieur ou en serre, il se récolte à l'automne. Chaleur et humidité sont la clé.",
      "A sprouting piece of organic rhizome, planted somewhere warm in spring, grows into a fine ginger plant. In a pot indoors or in a greenhouse, it's harvested in fall. Warmth and humidity are key."),
    conseils:[bi("Partir d'un rhizome bio avec des yeux (bourgeons).","Start from an organic rhizome with visible buds ('eyes')."),
      bi("Chaleur (20–25 °C) et atmosphère humide indispensables.","Warmth (68–77°F / 20–25°C) and humidity are essential."),
      bi("Récolter quand le feuillage jaunit à l'automne.","Harvest when the foliage yellows in fall.")] },
];

// --- Atouts « jardin nourricier » ------------------------------------------------
// Deux sources, jamais mélangées à l'affichage :
//  • déduits des fiches (fiables) : FACILE (diff 1), VIVACE (cycle), RAPIDE
//    (délai de récolte court quand la fiche permet de l'estimer) → calculés dans app.js ;
//  • classement éditorial QUALITATIF ci-dessous : repères courants du jardinage
//    vivrier, sans aucune valeur chiffrée. Affichés comme des estimations.
//    À sourcer avant de les transformer en données numériques.
const ATOUTS_EDITORIAUX = {
  // Beaucoup d'énergie ou de protéines pour la surface occupée (cultures de base)
  nourrissant:  ["pomme-de-terre", "patate-douce", "courge", "feve", "petit-pois"],
  // Récolte abondante au m² sur la saison
  productif:    ["courgette", "tomate", "blette", "concombre", "pomme-de-terre", "haricot"],
  // Se stocke plusieurs mois sans transformation (cave, grenier, tresses)
  conservation: ["pomme-de-terre", "courge", "oignon", "ail", "carotte", "betterave", "patate-douce"],
};

// Rendement au m² : VOLONTAIREMENT VIDE tant qu'aucune valeur n'est sourcée.
// Une carte n'affiche un rendement que si une entrée existe ici.
// Format : { tomate: { min: 4, max: 8, unite: "kg/m²", source: "Référence, année" } }
const RENDEMENTS_SOURCES = {};

// --- Projections climatiques locales : VIDE tant qu'aucune source n'est branchée ---
// Règle : aucune projection inventée. Une recommandation ne peut être modifiée par
// une tendance climatique que si l'entrée porte sa traçabilité complète.
// Le réchauffement n'est JAMAIS présumé favorable : une culture exigeant du froid
// hivernal peut devenir moins adaptée (`tendance: "defavorable"`).
// Format attendu, par zone puis par culture :
// PROJECTIONS_CLIMAT.continental["patate-douce"] = {
//   tendance: "favorable" | "stable" | "defavorable" | "incertain",
//   confiance: "faible" | "moyenne" | "elevee",
//   resume: "L'allongement attendu de la saison chaude pourrait améliorer…",
//   facteurs: ["saison sans gel", "jours chauds"],   // indicateurs réellement utilisés
//   source: "DRIAS / Météo-France",
//   scenario: "SSP2-4.5",
//   periodeReference: "1991-2020",
//   horizon: "2031-2040",
//   resolution: "8 km",
//   miseAJour: "2026-01",
// };
// Indicateurs visés (jamais réduits à la température moyenne) : températures
// moyennes, minimales hivernales, dates de dernière et première gelée, durée de
// saison sans gel, jours chauds, vagues de chaleur, sécheresse estivale,
// disponibilité en eau, précipitations et saisonnalité, besoins en froid,
// humidité, événements extrêmes.
const PROJECTIONS_CLIMAT = {};

// --- Données agronomiques par culture : à remplir, jamais à deviner -----------------
// Champs prévus pour affiner « éprouvé / possible / expérimental » : rusticite (zone
// USDA ou °C mini), tempMin, saisonChaudeJours, besoinsThermiques, abriPossible,
// demarrageInterieur, retoursLocaux (nombre de réussites rapportées par zone).
// Tant qu'un champ manque, le statut est déduit des seules données présentes
// (catégorie, `frileux`, zone) — cf. statutCulture() dans app.js.


