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
     perenne                          la culture passe-t-elle l'hiver en place
     rusticite.tempMinTolere          °C, minimum hivernal supporté
     cycle.saisonSansGelMin           jours sans gel nécessaires
     cycle.degresJours10Min           degrés-jours base 10 jusqu'à récolte
     chaleur.seuilStressThermique     °C au-delà desquels la culture décroche
     froidHivernal.heuresFroidMin     heures sous 7,2 °C pour lever la dormance
     eau.sensibiliteDeficit           1 faible, 2 moyenne, 3 forte

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
    perenne: false,
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
      // Documenté mais non exploité par le moteur : en dessous de 25 °C le jour
      // et 17 °C la nuit, l'initiation décroche AUSSI (même source). C'est le
      // seuil qui limite réellement la patate douce en climat tempéré ; il
      // faudrait un indicateur « jours assez chauds pendant les 30 jours qui
      // suivent la plantation », que le profil de lieu ne calcule pas encore.
    },
    eau: {
      sensibiliteDeficit: { valeur: 1, unite: "1 faible – 3 forte", confiance: "moyenne",
        source: "FAO Irrigation and Drainage Paper 56, table 22 (fraction d'épuisement p = 0,65)",
        url: "https://www.fao.org/4/x0490e/x0490e0e.htm", annee: 1998,
        note: "p = 0,65 : la culture tolère un épuisement important de la réserve utile avant de souffrir — nettement plus que la pomme de terre (p = 0,35). Enracinement 1,0 à 1,5 m." },
    },
  },

  /* --- Tomate -------------------------------------------------------------
     Le seuil qui compte n'est pas la survie de la plante mais la NOUAISON :
     le pollen devient non viable bien avant que la plante ne souffre. */
  "tomate": {
    perenne: false,
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
      sensibiliteDeficit: { valeur: 3, unite: "1 faible – 3 forte", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, tables 22 et 24 (p = 0,40 ; Ky saisonnier = 1,05)",
        url: "https://www.fao.org/4/x0490e/x0490e0e.htm", annee: 1998,
        note: "Ky supérieur à 1 : la perte de rendement dépasse proportionnellement le déficit d'eau. Stades critiques : reprise après repiquage, floraison, formation du rendement — un excès d'eau à la floraison nuit aussi." },
    },
  },

  /* --- Pomme de terre -----------------------------------------------------
     Distinguer l'INITIATION des tubercules (seuil bas, nuits fraîches) de leur
     CROISSANCE (seuil haut). Les deux sont documentés, le moteur n'exploite
     aujourd'hui que le second. */
  "pomme-de-terre": {
    perenne: false,
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
      sensibiliteDeficit: { valeur: 3, unite: "1 faible – 3 forte", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, tables 22 et 24 (p = 0,35 ; Ky saisonnier = 1,1)",
        url: "https://www.fao.org/4/x0490e/x0490e0e.htm", annee: 1998,
        note: "Enracinement superficiel (0,4 à 0,6 m, dont 70 % de l'absorption dans les 30 premiers centimètres) : peu de réserve, donc sensibilité forte. Ne pas dépasser 30 à 50 % d'épuisement de la réserve utile." },
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
    perenne: true,
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
    perenne: true,
    rusticite: {
      tempMinTolere: { valeur: -24, unite: "°C", confiance: "haute",
        source: "Pagter, Andersen & Andersen, Aarhus University, AoB Plants",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4417139/", annee: 2015,
        note: "Température tuant la moitié des tiges au maximum d'endurcissement, mi-janvier : environ -24 °C pour 'Narve Viking' et -27 °C pour 'Titania' ; on retient la plus prudente. Attention, cette résistance est saisonnière : elle tombe à -5/-6 °C fin mai, et les bourgeons floraux ne se ré-endurcissent quasiment pas après un redoux." },
    },
    eau: {
      sensibiliteDeficit: { valeur: 3, unite: "1 faible – 3 forte", confiance: "moyenne",
        source: "Rolbiecki et al., Acta Horticulturae 585:649-652 (2002) ; Scientia Horticulturae (2014), irrigation déficitaire à l'initiation florale",
        url: "https://doi.org/10.17660/ActaHortic.2002.585.107", annee: 2002,
        note: "Sur sol sableux, la production est jugée impossible sans irrigation. Un déficit de quelques jours seulement au stade d'initiation florale réduit le nombre de grappes et de fleurs de l'année suivante. Aucun besoin hydrique annuel chiffré n'a été trouvé pour l'espèce." },
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
