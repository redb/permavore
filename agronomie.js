/* =========================================================================
   Permavore — profils agroclimatiques des cultures

   Ce fichier ne contient AUCUNE projection locale et AUCUNE logique de climat :
   uniquement ce qu'exige une culture, indépendamment du lieu. C'est le moteur
   (climat-core.mjs) qui rapproche ces exigences du profil d'un lieu.

   Règle absolue : chaque valeur porte sa provenance. Une valeur sans `source`
   est ignorée par le moteur (voir valeurUtilisable), donc mieux vaut laisser
   un champ absent que le remplir de mémoire. Aucun seuil n'est déduit du genre
   botanique, de la famille, du pays d'origine ni d'une culture voisine.

   Format d'une valeur :
     { valeur, unite, source, url, annee, confiance: "haute"|"moyenne"|"basse", note }

   Dimensions reconnues par le moteur :
     cultiveeComme                    "annuelle" ou "perenne" — MODE DE CULTURE,
                                      pas biologie de l'espèce. Une vivace
                                      tropicale menée en annuelle est
                                      "annuelle" : sa rusticité ne décide alors
                                      pas de sa culture ici.
     chaleur.joursMinAuDessus         nombre de jours au-dessus de
                                      seuilMinCroissance réellement exigé, S'IL
                                      EST SOURCÉ. Sans lui, le besoin thermique
                                      est documenté mais non quantifiable :
                                      le moteur le dit et ne conclut pas.
     perenne                          (hérité) la culture passe-t-elle l'hiver en place
     rusticite.tempMinTolere          °C, minimum hivernal supporté
     cycle.saisonSansGelMin           jours sans gel nécessaires
     cycle.degresJours10Min           degrés-jours base 10 jusqu'à récolte
     chaleur.seuilStressThermique     °C au-delà desquels la culture décroche
     froidHivernal.heuresFroidMin     heures sous 7,2 °C pour lever la dormance
     eau.pFAO                         fraction d'épuisement p (FAO-56 table 22).
                                      Le moteur en déduit la sensibilité selon
                                      une lecture uniforme ; on ne code jamais
                                      un niveau 1-3 à la main.
     eau.kyFAO                        facteur Ky (FAO-56 table 24). Cette table
                                      ne couvre que 23 cultures : son absence
                                      est la norme, pas une lacune.
     eau.sensibiliteDocumentee        constat qualitatif sourcé, quand aucune
                                      valeur FAO n'existe. Affiché, jamais
                                      transformé en chiffre.

   Cultures pilotes : le moteur est validé sur cinq cultures aux contraintes
   volontairement différentes (une gélive à cycle long, une à nouaison
   thermosensible, une à tubérisation thermosensible, deux pérennes à besoin
   de froid). Les 36 autres cultures restent non évaluées tant que leurs
   seuils ne sont pas documentés : c'est voulu, pas un oubli.
   ========================================================================= */

const PROFILS_AGROCLIMATIQUES = {

  /* --- Patate douce -------------------------------------------------------
     Culture gélive à cycle long : le cas d'école de la culture « limite » en
     climat tempéré. Introuvable : température de base et somme de degrés-jours
     (les valeurs qui circulent viennent de sources secondaires non ouvrables),
     et besoin hydrique en climat tempéré. */
  "patate-douce": {
    // Vivace tropicale à l'origine, menée en annuelle sous climat tempéré : elle
    // n'a pas besoin de survivre à l'hiver pour produire. Sa rusticité ne décide
    // donc PAS de sa culture ici.
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 120, unite: "jours", confiance: "haute",
        source: "Clemson Cooperative Extension (HGIC), Sweetpotato",
        url: "https://hgic.clemson.edu/factsheet/sweet-potato/", annee: 2022,
        note: "90 à 120 jours du plant à la récolte selon le cultivar ; on retient la borne haute, prudente. Aucune source institutionnelle n'exprime le besoin en jours SANS GEL : il est ici déduit de la durée du cycle." },
    },
    chaleur: {
      seuilStressThermique: { valeur: 40, unite: "°C", confiance: "haute",
        source: "Mississippi State University Extension, P2809 — Sweetpotato Storage Root Initiation",
        url: "https://extension.msstate.edu/publications/sweetpotato-storage-root-initiation", annee: 2023,
        note: "Au-delà de 40 °C le jour (32 °C la nuit), l'initiation des racines de réserve décroche. L'optimum est 29–32 °C le jour." },
      seuilMinCroissance: { valeur: 25, unite: "°C", confiance: "haute",
        source: "Mississippi State University Extension, P2809 — Sweetpotato Storage Root Initiation",
        url: "https://extension.msstate.edu/publications/sweetpotato-storage-root-initiation", annee: 2023,
        note: "En dessous de 25 °C le jour et 17 °C la nuit, l'initiation des racines de réserve décroche — c'est le facteur qui limite réellement la patate douce en climat tempéré, bien plus que le gel. Aucune source ne dit COMBIEN de jours au-dessus de ce seuil sont nécessaires : le moteur affiche donc la mesure locale sans en tirer de verdict, et s'interdit de classer la culture « éprouvée »." },
    },
    eau: {
      pFAO: { valeur: 0.65, unite: "fraction d'épuisement de la réserve utile", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 22", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998,
        note: "La culture tolère un épuisement important de la réserve utile avant de souffrir — nettement plus que la pomme de terre (p = 0,35). Enracinement 1,0 à 1,5 m. Aucun Ky : la table 24 de la FAO ne couvre que 23 cultures et pas celle-ci." },
    },
  },

  /* --- Tomate -------------------------------------------------------------
     Le seuil qui compte n'est pas la survie de la plante mais la NOUAISON :
     le pollen devient non viable bien avant que la plante ne souffre. */
  "tomate": {
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 100, unite: "jours", confiance: "haute",
        source: "FAO Land & Water, Crop Information — Tomato (d'après Irrigation and Drainage Paper 33)",
        url: "https://web.archive.org/web/2023id_/https://www.fao.org/land-water/databases-and-software/crop-information/tomato/en/",
        annee: 2002,
        note: "100 à 140 jours jusqu'à la première récolte, dont 25 à 35 jours de pépinière ; on retient 100 jours après repiquage. La page d'origine de la FAO renvoie aujourd'hui une erreur 404, d'où le lien d'archive." },
    },
    chaleur: {
      seuilStressThermique: { valeur: 29.4, unite: "°C", confiance: "haute",
        source: "University of Missouri IPM, D. Trinklein — Understanding Tomato Fruit Set",
        url: "https://ipm.missouri.edu/mpg/index.cfm?ID=7", annee: 2013,
        note: "Au-delà de 29,4 °C le jour, le pollen devient collant et non viable. Retenu parce que c'est le seuil le plus bas et le plus prudent ; d'autres sources donnent 32,2 °C (échec du développement du fruit, UGA B1312) ou 35-38 °C (atteinte de la microsporogenèse) — ces valeurs ne décrivent pas le même processus et ne doivent pas être empilées." },
    },
    eau: {
      pFAO: { valeur: 0.40, unite: "fraction d'épuisement de la réserve utile", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 22", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998,
        note: "Stades critiques : reprise après repiquage, floraison, formation du rendement. Un excès d'eau à la floraison nuit aussi." },
      kyFAO: { valeur: 1.05, unite: "facteur de réponse du rendement à l'eau", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 24", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998, note: "Supérieur à 1 : la perte de rendement dépasse proportionnellement le déficit d'eau." },
    },
  },

  /* --- Pomme de terre -----------------------------------------------------
     Distinguer l'INITIATION des tubercules (seuil bas, nuits fraîches) de leur
     CROISSANCE (seuil haut). Les deux sont documentés, le moteur n'exploite
     aujourd'hui que le second. */
  "pomme-de-terre": {
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 120, unite: "jours", confiance: "haute",
        source: "FAO Land & Water, Crop Information — Potato",
        url: "https://web.archive.org/web/2023id_/https://www.fao.org/land-water/databases-and-software/crop-information/potato/en/",
        annee: 2002,
        note: "Variétés précoces 90 à 120 jours, demi-saison 120 à 150, tardives 150 à 180 ; on retient 120 jours, le cas d'une variété de jardin courante." },
    },
    chaleur: {
      seuilStressThermique: { valeur: 30, unite: "°C", confiance: "haute",
        source: "FAO Land & Water, Crop Information — Potato",
        url: "https://web.archive.org/web/2023id_/https://www.fao.org/land-water/databases-and-software/crop-information/potato/en/",
        annee: 2002,
        note: "La croissance du tubercule est fortement inhibée au-delà de 30 °C (et en dessous de 10 °C). L'initiation demande en outre des nuits sous 15 °C — seuil non exploité par le moteur faute d'indicateur nocturne." },
    },
    eau: {
      pFAO: { valeur: 0.35, unite: "fraction d'épuisement de la réserve utile", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 22", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998,
        note: "Enracinement superficiel (0,4 à 0,6 m, dont 70 % de l'absorption dans les 30 premiers centimètres) : peu de réserve, donc sensibilité forte." },
      kyFAO: { valeur: 1.1, unite: "facteur de réponse du rendement à l'eau", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 24", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998 },
    },
  },

  /* --- Pommier ------------------------------------------------------------
     Seule dimension solide : le besoin en froid. La rusticité n'a PAS été
     retenue : la seule valeur trouvée (survie sous -51 °C, NMSU) est
     incompatible avec les mortalités observées vers -30 °C, et aucune zone
     USDA de Malus domestica n'existe dans une source institutionnelle.
     Le seuil de coup de soleil est documenté en température de SURFACE DU
     FRUIT (46-49 °C), pas en température de l'air : la conversion varie de
     11 à 27 °C selon les sources de la WSU elle-même, donc l'inscrire ici
     reviendrait à fabriquer un seuil. */
  "pommier": {
    cultiveeComme: "perenne", perenne: true,
    froidHivernal: {
      heuresFroidMin: { valeur: 700, unite: "heures sous 7,2 °C", confiance: "moyenne",
        source: "CTIFL — réseau Besoins en froid, fruits à pépins",
        url: "https://besoinsenfroid.ctifl.fr/pages/fruitsapepins/Besoins.aspx", annee: null,
        note: "Valeur pivot du CTIFL, qui affiche sur la même page une amplitude variétale de 400 à 1000 heures sans expliciter l'articulation entre les deux. Ordre de grandeur cohérent avec la littérature internationale (218 heures pour 'Anna', 1050 à 1200 pour 'Golden Delicious'). Le choix du modèle de froid change fortement le diagnostic : les modèles Utah et Dynamique ne sont PAS convertibles en heures." },
    },
  },

  /* --- Cassis -------------------------------------------------------------
     Cas exemplaire du refus d'inventer : le besoin en froid du cassis n'est
     PAS exprimable en heures sous 7,2 °C. Jones et al. (2014, James Hutton
     Institute) montrent que ce modèle est inadapté à l'espèce parce qu'il
     ignore le froid négatif, qui compte chez le cassis — l'optimum
     d'accumulation peut même être négatif (-3,4 °C pour 'Ben Tirran',
     Rose & Cameron 2009). Les valeurs « 800 à 1500 heures » qui circulent
     proviennent uniquement de blogs et de sites marchands. Le champ reste
     donc vide, et l'application affiche « projection non disponible ».
     Introuvable également : tout seuil de stress thermique estival chiffré. */
  "cassis": {
    cultiveeComme: "perenne", perenne: true,
    rusticite: {
      tempMinTolere: { valeur: -24, unite: "°C", confiance: "haute",
        source: "Pagter, Andersen & Andersen, Aarhus University, AoB Plants",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4417139/", annee: 2015,
        note: "Température tuant la moitié des tiges au maximum d'endurcissement, mi-janvier : environ -24 °C pour 'Narve Viking' et -27 °C pour 'Titania' ; on retient la plus prudente. Attention, cette résistance est saisonnière : elle tombe à -5/-6 °C fin mai, et les bourgeons floraux ne se ré-endurcissent quasiment pas après un redoux." },
    },
    eau: {
      // Aucune valeur FAO pour Ribes nigrum : la table 22 ne le couvre pas. On
      // conserve donc le constat documenté, affiché mais non transformé en
      // niveau de sensibilité chiffré — ce serait fabriquer un p qui n'existe pas.
      sensibiliteDocumentee: { texte: "forte, sans valeur chiffrée disponible", confiance: "moyenne",
        source: "Rolbiecki et al., Acta Horticulturae 585:649-652 (2002) ; Scientia Horticulturae (2014), irrigation déficitaire à l'initiation florale",
        url: "https://doi.org/10.17660/ActaHortic.2002.585.107", annee: 2002,
        note: "Sur sol sableux, la production est jugée impossible sans irrigation. Un déficit de quelques jours au stade d'initiation florale réduit le nombre de grappes de l'année suivante. Ni p FAO, ni Ky, ni besoin annuel chiffré n'existent pour cette espèce." },
    },
  },
};

/** Profil d'une culture, ou null si elle n'est pas documentée. */
function profilAgro(id) {
  return Object.prototype.hasOwnProperty.call(PROFILS_AGROCLIMATIQUES, id)
    ? PROFILS_AGROCLIMATIQUES[id] : null;
}

/** Sources citées par un profil, dédoublonnées, pour affichage. */
function sourcesProfil(profil) {
  if (!profil) return [];
  const vues = new Map();
  const explorer = (o) => {
    if (!o || typeof o !== "object") return;
    if (typeof o.source === "string" && Number.isFinite(o.valeur)) {
      if (!vues.has(o.source)) vues.set(o.source, { source: o.source, url: o.url || null, annee: o.annee || null });
      return;
    }
    Object.values(o).forEach(explorer);
  };
  explorer(profil);
  return [...vues.values()];
}

if (typeof window !== "undefined") {
  window.PROFILS_AGROCLIMATIQUES = PROFILS_AGROCLIMATIQUES;
  window.profilAgro = profilAgro;
  window.sourcesProfil = sourcesProfil;
}
