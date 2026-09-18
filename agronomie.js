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
     photoperiode.heuresMin           longueur de jour minimale pour déclencher
                                      la production. Contrainte géographique
                                      dure : sous l'équateur le jour ne dépasse
                                      jamais ~12 h.
     germination.tempMinSol           température minimale de germination.
                                      Documentée, pas encore exploitée par le
                                      moteur — à ne pas confondre avec un seuil
                                      de croissance.

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


  /* ======================= LOT 1 ======================= */

  /* --- Courgette ----------------------------------------------------------
     Introuvable : Ky (la table 24 de la FAO ne compte que 23 cultures, et la
     courgette n'y est pas), seuil physiologique d'avortement floral, et
     température de dégât par le gel (qualification « tender » seulement). */
  "courgette": {
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 55, unite: "jours", confiance: "moyenne",
        source: "Clemson Cooperative Extension (HGIC), Summer Squash",
        url: "https://hgic.clemson.edu/factsheet/summer-squash/", annee: 2023,
        note: "Première récolte environ 55 jours après plantation. La FAO donne 90 à 100 jours, mais pour le cycle COMPLET incluant toute la période de récolte : les deux ne mesurent pas la même chose. On retient la durée la plus courte documentée jusqu'à la première récolte, puisque c'est elle qui dit si le cycle tient dans la saison." },
    },
    chaleur: {
      seuilStressThermique: { valeur: 32.2, unite: "°C", confiance: "moyenne",
        source: "University of Minnesota Extension, « Vegetables not yielding well? Blame the heat »",
        url: "https://blog-fruit-vegetable-ipm.extension.umn.edu/2021/07/vegetables-not-yielding-well-blame-heat.html",
        annee: 2021,
        note: "Au-delà de 32 °C le jour (et 21 °C la nuit), la floraison bascule vers les fleurs mâles : beaucoup de fleurs, peu de fruits. Au-delà de ce même seuil l'activité des pollinisateurs chute aussi. C'est un défaut de RENDEMENT, pas un dégât sur la plante." },
    },
    eau: {
      pFAO: { valeur: 0.50, unite: "fraction d'épuisement de la réserve utile", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 22", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998, note: "Enracinement 0,6 à 1,0 m. Aucun Ky : la courgette est absente de la table 24." },
    },
    germination: {
      tempMinSol: { valeur: 15.6, unite: "°C (sol)", confiance: "haute",
        source: "J. F. Harrington (UC Davis), table diffusée par OSU Extension",
        url: "https://extension.oregonstate.edu/gardening/soil-compost/soil-temperature-conditions-vegetable-seed-germination",
        annee: 2013, note: "Confirmé indépendamment par OSU Horticulture. Optimum 21 à 35 °C. Seuil de germination, à ne pas confondre avec un seuil de croissance." },
    },
  },

  /* --- Carotte ------------------------------------------------------------
     Introuvable : tout seuil de chaleur CHIFFRÉ. Les sources décrivent l'effet
     ("longues périodes de chaleur : saveur forte, racines courtes et épaisses")
     sans jamais donner de température. On ne la fabrique pas. Ky absent. */
  "carotte": {
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 90, unite: "jours", confiance: "haute",
        source: "University of Georgia Extension, Bulletin 1175",
        url: "https://fieldreport.caes.uga.edu/publications/B1175/commercial-production-and-management-of-carrots/",
        annee: 2012,
        note: "Trois à cinq mois du semis à la récolte : on retient trois mois, la durée la plus courte documentée. La FAO donne 150 jours en Méditerranée, cohérent avec la borne haute." },
    },
    eau: {
      pFAO: { valeur: 0.35, unite: "fraction d'épuisement de la réserve utile", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 22", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998, note: "Enracinement 0,5 à 1,0 m. Aucun Ky : la carotte est absente de la table 24." },
      sensibiliteDocumentee: { texte: "la chaleur prolongée dégrade la RACINE avant la plante", confiance: "haute",
        source: "University of Georgia Extension, Bulletin 1175",
        url: "https://fieldreport.caes.uga.edu/publications/B1175/commercial-production-and-management-of-carrots/",
        annee: 2012,
        note: "Optimum 15,6 à 21,1 °C. Au-dessus : saveur terpénoïde forte, amertume, racines courtes et épaisses. La source ne donne AUCUNE température de seuil — elle n'est donc pas inscrite ici." },
    },
    germination: {
      tempMinSol: { valeur: 4.4, unite: "°C (sol)", confiance: "haute",
        source: "J. F. Harrington (UC Davis), table diffusée par OSU Extension",
        url: "https://extension.oregonstate.edu/gardening/soil-compost/soil-temperature-conditions-vegetable-seed-germination",
        annee: 2013, note: "Clemson donne une plage optimale plus étroite (12,8 à 23,9 °C) : désaccord signalé, non moyenné." },
    },
  },

  /* --- Laitue -------------------------------------------------------------
     Introuvable : seuil de montaison chiffré à l'échelle de l'ESPÈCE. Les
     chiffres disponibles sont soit un haut d'optimum (Cornell), soit propres au
     type Bibb (Clemson, 23,9 °C), soit obtenus en enceinte sur un cultivar
     réputé montant (33/25 °C). Aucun ne vaut pour Lactuca sativa en général :
     le champ reste vide. Ky absent. */
  "laitue": {
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 55, unite: "jours", confiance: "moyenne",
        source: "Clemson Cooperative Extension (HGIC), Lettuce",
        url: "https://hgic.clemson.edu/factsheet/lettuce/", annee: 2023,
        note: "Laitue pommée dès 55 jours selon la variété ; laitue à couper environ 75 jours. On retient la plus courte durée documentée. La FAO donne 75 à 140 jours selon la date de plantation, sans préciser si le décompte part du semis ou du repiquage — imprécision qui interdit de s'en servir seule." },
    },
    eau: {
      pFAO: { valeur: 0.30, unite: "fraction d'épuisement de la réserve utile", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 22", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998, note: "Enracinement 0,3 à 0,5 m, le plus superficiel du lot : très peu de réserve, donc arrosages courts et fréquents. Aucun Ky : la laitue est absente de la table 24." },
      sensibiliteDocumentee: { texte: "monte à graine et devient amère à la chaleur, sans seuil chiffré pour l'espèce", confiance: "haute",
        source: "Clemson Cooperative Extension (HGIC), Lettuce ; Cornell Cooperative Extension",
        url: "https://hgic.clemson.edu/factsheet/lettuce/", annee: 2023,
        note: "Croissance optimale entre 12,8 et 18,3 °C. Le type Bibb devient amer au-delà de 23,9 °C, mais cette valeur est propre à ce type et n'est pas généralisée ici." },
    },
    germination: {
      tempMinSol: { valeur: 1.7, unite: "°C (sol)", confiance: "haute",
        source: "J. F. Harrington (UC Davis), table diffusée par OSU Extension",
        url: "https://extension.oregonstate.edu/gardening/soil-compost/soil-temperature-conditions-vegetable-seed-germination",
        annee: 2013, note: "La graine germe au froid mais entre en thermodormance vers 32 à 35 °C selon les sources — désaccord signalé, non moyenné." },
    },
  },

  /* --- Haricot ------------------------------------------------------------
     Désaccord notable et non résolu : l'extension grand public pointe la
     température DIURNE (32,2 °C), la littérature récente la température
     NOCTURNE (au-delà de 20 à 21 °C sur les boutons floraux). Le moteur ne
     dispose que des maxima diurnes : on retient le seuil diurne publié à
     comité de lecture, et on note que la part nocturne n'est pas évaluée. */
  "haricot": {
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 55, unite: "jours", confiance: "moyenne",
        source: "Clemson Cooperative Extension (HGIC), Bush & Pole-Type Snap Beans",
        url: "https://hgic.clemson.edu/factsheet/bush-pole-type-snap-beans/", annee: null,
        note: "Première cueillette vers 55 jours. La FAO donne 75 à 90 jours pour le cycle complet, période de récolte comprise : définitions différentes, pas un conflit." },
    },
    chaleur: {
      seuilStressThermique: { valeur: 30, unite: "°C", confiance: "haute",
        source: "Rose T., Lowe C. et al., Plants (Basel) 12(13):2491",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10347029/", annee: 2023,
        note: "Au-delà de 30 °C le jour, stérilité pollinique et nouaison réduite. La même source ajoute un seuil nocturne de 20 °C, et l'université du Delaware montre que les boutons floraux en formation sont plus sensibles encore que les fleurs ouvertes : cette part nocturne N'EST PAS évaluée par le moteur, qui ne dispose que des maxima diurnes. Clemson donne 32,2 °C — désaccord signalé, non moyenné." },
    },
    eau: {
      pFAO: { valeur: 0.45, unite: "fraction d'épuisement de la réserve utile", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 22", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998, note: "Enracinement 0,5 à 0,7 m. L'exemple 39 du même document utilise 0,40 : incohérence interne de la FAO, signalée et non arbitrée." },
      kyFAO: { valeur: 1.15, unite: "facteur de réponse du rendement à l'eau", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 24", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998, note: "Supérieur à 1 : la perte de rendement dépasse proportionnellement le déficit d'eau." },
    },
    germination: {
      tempMinSol: { valeur: 15.6, unite: "°C (sol)", confiance: "haute",
        source: "J. F. Harrington (UC Davis), table diffusée par OSU Extension",
        url: "https://extension.oregonstate.edu/gardening/soil-compost/soil-temperature-conditions-vegetable-seed-germination",
        annee: 2013, note: "Confirmé par Clemson : ne pas semer avant 15,6 °C à 10 cm de profondeur." },
    },
  },

  /* --- Oignon -------------------------------------------------------------
     Cas qui a révélé une insuffisance du moteur : la bulbaison de l'oignon ne
     se déclenche pas sur la température mais sur la LONGUEUR DU JOUR. Sous
     l'équateur, où le jour ne dépasse jamais environ 12 h, aucune variété à
     jours longs ne bulbera, quelle que soit la saison. La photopériode est donc
     devenue une dimension du moteur.
     Introuvable : tout seuil de stress thermique chiffré affectant la
     bulbaison. Les sources ne donnent que des optimums — on ne les transforme
     pas en seuils. */
  "oignon": {
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 150, unite: "jours", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 11, ligne « Onion (dry) »",
        url: "https://www.fao.org/4/x0490e/x0490e0b.htm", annee: 1998,
        note: "150 à 210 jours du semis à la fin de récolte pour l'oignon de garde ; on retient la borne basse. L'oignon botte se récolte bien plus tôt (70 jours), mais c'est un autre usage." },
    },
    photoperiode: {
      heuresMin: { valeur: 10, unite: "heures de jour", confiance: "haute",
        source: "NC State Extension, Bulb Onions ; Oregon State University, Types of Onions and Varieties",
        url: "https://content.ces.ncsu.edu/bulb-onions", annee: null,
        note: "Seuil le plus bas toutes variétés confondues : en dessous d'environ 10 heures de jour, aucune variété ne bulbe. Ce n'est PAS une garantie que n'importe quelle variété conviendra — voir les groupes ci-dessous." },
      groupes: [
        { nom: "jours courts", heures: [10, 12], ou: "basses latitudes" },
        { nom: "jours intermédiaires", heures: [12, 14], ou: "latitudes moyennes" },
        { nom: "jours longs", heures: [14, 16], ou: "hautes latitudes" },
      ],
    },
    eau: {
      pFAO: { valeur: 0.30, unite: "fraction d'épuisement de la réserve utile", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 22", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998, note: "L'une des plus basses de la table, combinée à un enracinement de 0,3 à 0,6 m : très peu de réserve, donc irrigations fréquentes et légères." },
      kyFAO: { valeur: 1.1, unite: "facteur de réponse du rendement à l'eau", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 24", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998 },
    },
    germination: {
      tempMinSol: { valeur: 1.7, unite: "°C (sol)", confiance: "haute",
        source: "J. F. Harrington (UC Davis), table diffusée par OSU Extension",
        url: "https://extension.oregonstate.edu/gardening/soil-compost/soil-temperature-conditions-vegetable-seed-germination",
        annee: 2013 },
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
