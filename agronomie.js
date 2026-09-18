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
     montaison.declencheur            "photoperiode" | "vernalisation" | "mixte".
                                      Le déclencheur diffère radicalement selon
                                      l'espèce : l'épinard part à graine sous
                                      jours longs, le poireau après un froid.
                                      La résistance est un caractère VARIÉTAL :
                                      le moteur n'en conclut jamais rien au
                                      niveau de l'espèce.
     cycle.stades                     récoltes à plusieurs stades (jeunes
                                      feuilles, jeune racine, maturité), quand
                                      les sources les distinguent.
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
        modeImplantation: "plant",
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
        modeImplantation: "semis_direct",
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
        modeImplantation: "semis_direct",
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
        modeImplantation: "semis_sous_abri_repiquage",
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
        modeImplantation: "semis_direct",
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
        modeImplantation: "semis_direct",
        source: "FAO Irrigation and Drainage Paper 56, table 11, ligne « Onion (dry) »",
        url: "https://www.fao.org/4/x0490e/x0490e0b.htm", annee: 1998,
        note: "150 à 210 jours pour l'oignon de garde SEMÉ EN PLACE ; on retient la borne basse. Cette durée vaut pour ce mode d'implantation et pour lui seul : elle ne dit rien de ce qu'exige un oignon planté en bulbilles ou en plants, qui passe bien moins de temps au champ. L'oignon botte se récolte vers 70 jours, mais c'est un autre usage." },
      // Modes couramment pratiqués dont la durée au champ n'a PAS été trouvée
      // chiffrée. Les nommer évite de faire passer la durée du semis direct
      // pour une limite de l'espèce.
      autresModes: [
        { mode: "bulbille", dureeConnue: false,
          note: "Pratique courante là où la saison est courte ; aucune durée sourcée trouvée." },
        { mode: "semis_sous_abri_repiquage", dureeConnue: false,
          note: "Une partie du cycle se fait alors hors saison extérieure ; aucune durée sourcée trouvée." },
      ],
    },
    photoperiode: {
      source: { valeur: 1, unite: "groupes variétaux", confiance: "haute",
        source: "NC State Extension, Bulb Onions ; Oregon State University, Types of Onions and Varieties",
        url: "https://content.ces.ncsu.edu/bulb-onions", annee: null,
        note: "La bulbaison se déclenche sur la longueur du jour. Le seuil dépend du GROUPE VARIÉTAL, pas de l'espèce : dire « l'oignon convient ici » parce qu'un groupe convient serait faux pour les deux autres." },
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


  /* ======================= LOT 2 ======================= */

  /* --- Radis --------------------------------------------------------------
     Introuvable : seuil de température ou d'heures de jour déclenchant la
     montaison. Les seules données chiffrées viennent d'UN SEUL cultivar
     (Erwin 2002) ; les sources d'extension ne parlent que de « hautes
     températures estivales », sans chiffre. Ky absent de la table 24. */
  "radis": {
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 25, unite: "jours", confiance: "haute",
        modeImplantation: "semis_direct",
        source: "Utah State University Extension, Radishes in the Garden (D. Drost)",
        url: "https://extension.usu.edu/yardandgarden/research/radishes-in-the-garden",
        annee: 2020,
        note: "« Roots are mature 25-45 days from seeding depending on variety » : la source formule elle-même une fourchette d'ESPÈCE, et on en retient la borne courte. Les radis d'hiver (daikon) sont un autre type, 50 à 60 jours." },
      stades: [
        { nom: "racine de printemps", jours: [25, 45], source: "Utah State University Extension, 2020" },
        { nom: "radis d'hiver / daikon", jours: [50, 60], source: "Iowa State University Extension, 2023",
          note: "Type distinct, pas un stade du même plant." },
      ],
    },
    montaison: {
      declencheur: "mixte",
      source: { valeur: 1, unite: "voies documentées", confiance: "moyenne",
        source: "Erwin, Warner & Smith, Physiologia Plantarum 115(2):298-302 ; Utah State University Extension",
        url: "https://pubmed.ncbi.nlm.nih.gov/12060249/", annee: 2002,
        note: "Le radis fleurit sous jours longs SANS aucun froid (45 % contre 3 % en jours courts), et répond aussi au froid de façon quantitative (6 °C, saturation en 4 à 8 jours). Mais ces chiffres portent sur un seul cultivar, et les sources d'extension ne donnent aucune température seuil : « hautes températures estivales », rien de plus. Aucun seuil n'est donc inscrit." },
    },
    eau: {
      pFAO: { valeur: 0.30, unite: "fraction d'épuisement de la réserve utile", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 22", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998, note: "Enracinement 0,3 à 0,5 m. Absent de la table 24 : aucun Ky." },
    },
    germination: {
      tempMinSol: { valeur: 4.4, unite: "°C (sol)", confiance: "haute",
        source: "J. F. Harrington (UC Davis), table diffusée par OSU Extension",
        url: "https://extension.oregonstate.edu/gardening/soil-compost/soil-temperature-conditions-vegetable-seed-germination",
        annee: 2013,
        note: "Désaccord sur l'optimum : 29 °C pour la germination la plus rapide selon Harrington, 13 à 24 °C pour la conduite de culture selon Utah State. Deux définitions, pas une contradiction." },
    },
  },

  /* --- Poireau ------------------------------------------------------------
     CAS LIMITE DU LOT : le poireau est ABSENT des tables 11, 12, 22 et 24 de
     la FAO — vérifié par extraction du texte, pas déduit. Ni p, ni profondeur
     d'enracinement, ni Ky, ni température de germination. Les valeurs de
     l'oignon ne sont PAS transposables et ne le seront pas. Sa durée de cycle
     varie de 50 à 180 jours selon le cultivar, soit un facteur 3,6 : parler
     d'une durée « du poireau » serait faux. */
  "poireau": {
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 60, unite: "jours", confiance: "haute",
        modeImplantation: "semis_direct",
        source: "Utah State University Extension, Leeks in the Garden (D. Drost)",
        url: "https://extension.usu.edu/yardandgarden/research/leeks-in-the-garden",
        annee: 2020,
        note: "« May be harvested as early as 60 days after seeding but generally require 100-120 days to mature. » C'est la seule source trouvée qui précise son point de départ. L'amplitude variétale va de 50 jours ('Varna') à 180 ('Laura') : cette fourchette appartient aux VARIÉTÉS, pas à l'espèce." },
      autresModes: [
        { mode: "semis_sous_abri_repiquage", dureeConnue: false,
          note: "Pratique dominante. Les durées « depuis le repiquage » trouvées (75 à 120 jours) proviennent de pages inaccessibles et n'ont pas été vérifiées." },
      ],
      stades: [
        { nom: "poireau jeune", jours: [60, 60], source: "Utah State University Extension, 2020" },
        { nom: "maturité (fût de 2,5 cm)", jours: [100, 120], source: "Utah State University Extension, 2020" },
      ],
    },
    montaison: {
      declencheur: "vernalisation",
      vernalisation: {
        temperature: { valeur: 5, unite: "°C (optimum d'induction)", confiance: "moyenne",
          source: "Wiebe H.J., Scientia Horticulturae 59(3-4):177-185",
          url: "https://www.sciencedirect.com/science/article/abs/pii/0304423894900116", annee: 1994,
          note: "Plage inductive 0 à 18 °C, optimum 5 °C, dévernalisation au-dessus de 18 °C. La phase juvénile se lève vers 2 g ou cinq feuilles. C'est le FROID qui déclenche — exactement l'inverse de l'épinard. La DURÉE de vernalisation nécessaire n'a pas été trouvée pour le poireau ; le chiffre « 10 à 15 semaines à 5 °C » qui circule concerne l'échalote et n'est pas transposé." },
      },
    },
    // eau : rien. Le poireau est absent de la table 22 de la FAO, et aucune
    // autre source sérieuse n'a été trouvée. Reprendre les valeurs de l'oignon
    // serait exactement le genre d'emprunt que ce projet s'interdit.
    // germination : rien non plus. Le poireau est absent de la table Harrington.
  },

  /* --- Épinard ------------------------------------------------------------
     Montaison pilotée par la LONGUEUR DU JOUR, la chaleur ne faisant
     qu'accélérer — « il monte en juin même si les températures sont fraîches »
     (Penn State). Aucune vernalisation : l'épinard hiverne et monte au
     printemps parce que les jours s'allongent, pas parce qu'il a eu froid.
     Introuvable : un seuil horaire citable tel quel. On inscrit les deux
     mesures de Chun (2001), pas une valeur intermédiaire fabriquée. */
  "epinard": {
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 50, unite: "jours", confiance: "moyenne",
        modeImplantation: "semis_direct",
        source: "Utah State University Extension, Spinach in the Garden (D. Drost)",
        url: "https://extension.usu.edu/yardandgarden/research/spinach-in-the-garden",
        annee: 2020,
        note: "« Semer 50 à 75 jours avant la date de maturité visée » : borne courte retenue. Les durées de 30 à 48 jours trouvées ailleurs sont strictement variétales ('Regal' 30 jours n'est pas « l'épinard »)." },
      stades: [
        { nom: "feuilles cueillies à la demande", jours: null,
          source: "Utah State University Extension, 2020",
          note: "Possible à tout moment avant la hampe florale, feuilles externes dès 7,6 cm. Aucune durée chiffrée : un repère morphologique." },
        { nom: "plant entier", jours: [50, 75], source: "Utah State University Extension, 2020" },
      ],
    },
    montaison: {
      declencheur: "photoperiode",
      heuresRisqueEleve: { valeur: 16, unite: "heures de jour", confiance: "moyenne",
        source: "Chun C., Tominaga M., Kozai T., HortScience 36(5):889-892",
        url: "https://snu.elsevierpure.com/en/publications/floral-development-and-bolting-of-spinach-as-affected-by-photoper/",
        annee: 2001,
        note: "Mesuré : 0 % de montaison à 10 heures de jour, plus de 85 % à 16 heures. La bascule se situe entre 13 et 16 heures, sans qu'aucune source ne publie de seuil unique — on inscrit donc les deux mesures et pas une valeur intermédiaire inventée. La chaleur accélère sans déclencher : Penn State note une montaison en juin même par temps frais. La résistance est un caractère variétal reconnu." },
      heuresRisqueFaible: { valeur: 10, unite: "heures de jour", confiance: "moyenne",
        source: "Chun C., Tominaga M., Kozai T., HortScience 36(5):889-892",
        url: "https://snu.elsevierpure.com/en/publications/floral-development-and-bolting-of-spinach-as-affected-by-photoper/",
        annee: 2001 },
    },
    eau: {
      pFAO: { valeur: 0.20, unite: "fraction d'épuisement de la réserve utile", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 22", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998,
        note: "La plus faible valeur de tout le catalogue : l'épinard supporte très mal le dessèchement du sol. Enracinement 0,3 à 0,5 m. Absent de la table 24 : aucun Ky." },
    },
    germination: {
      tempMinSol: { valeur: 1.7, unite: "°C (sol)", confiance: "haute",
        source: "J. F. Harrington (UC Davis), table diffusée par OSU Extension",
        url: "https://extension.oregonstate.edu/gardening/soil-compost/soil-temperature-conditions-vegetable-seed-germination",
        annee: 2013, note: "Germination réduite au-delà de 26,7 °C selon Utah State." },
    },
  },

  /* --- Betterave potagère -------------------------------------------------
     PIÈGE ÉVITÉ : la betterave sucrière figure dans la table 24 de la FAO avec
     un Ky de 1,0, et dans la table 22 avec p = 0,55. Ni l'un ni l'autre n'est
     transposable : organe récolté et base de rendement différents, cultivars
     sélectionnés sur des critères opposés — la sucrière l'est justement pour sa
     RÉSISTANCE à la montaison. La table 22 a bien une ligne « Beets, table »,
     distincte : c'est elle qui est utilisée. La table 24 n'en a pas. */
  "betterave": {
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 50, unite: "jours", confiance: "moyenne",
        modeImplantation: "semis_direct",
        source: "SDSU Extension, Table Beets: Harvest and Storage ; Oregon State University Extension",
        url: "https://extension.sdstate.edu/table-beets-harvest-and-storage", annee: 2023,
        note: "50 à 70 jours après semis pour une racine de calibre balle de golf. Utah State donne 60 à 80 jours : désaccord signalé, non moyenné — on retient la borne la plus courte documentée." },
      stades: [
        { nom: "feuilles", jours: null, source: "Utah State University Extension, 2020",
          note: "Récoltables dès 10 à 15 cm de hauteur. Aucune durée chiffrée dans les sources universitaires." },
        { nom: "racine mature", jours: [50, 80], source: "SDSU Extension 2023 ; Utah State University Extension 2020" },
      ],
    },
    montaison: {
      declencheur: "vernalisation",
      vernalisation: {
        temperature: { valeur: 7, unite: "°C (milieu de la fenêtre inductive)", confiance: "moyenne",
          source: "Michigan State University Extension, Bolting in spring vegetables",
          url: "https://www.canr.msu.edu/news/bolting-in-spring-vegetables", annee: 2020,
          note: "Fenêtre 5,0 à 8,9 °C pendant une à cinq semaines, réceptivité dès le stade semence. L'université du Maryland donne un seuil différent — sous 10 °C pendant deux à trois semaines, et seulement après plusieurs vraies feuilles : les deux sources sont incompatibles sur la borne basse et sur le stade sensible, et ne sont pas moyennées. Dévernalisation au-dessus de 17,8 °C. Verrou supplémentaire : après vernalisation, la montaison réclame encore des jours longs. Toute la quantification fine qui circule (optimum 4 °C, 14 à 15 semaines) porte sur la betterave SUCRIÈRE et n'est pas transposée." },
      },
      autresCauses: [
        { cause: "stress hydrique", quand: "six premières semaines",
          source: "Utah State University Extension, 2020",
          note: "« Water stress during the first 6 weeks of growth often leads to premature flowering. » Cause non vernalisante, à distinguer." },
      ],
    },
    chaleur: {
      seuilStressThermique: { valeur: 29.4, unite: "°C", confiance: "moyenne",
        source: "Utah State University Extension, Beets in the Garden (D. Drost)",
        url: "https://extension.usu.edu/yardandgarden/research/beets-in-the-garden", annee: 2020,
        note: "Au-delà, racines fibreuses — mais l'effet est explicitement conditionné par le stress hydrique dans la source : « hot weather AND water stress ». Ce n'est donc pas un seuil thermique pur. Le zonage clair de la racine apparaît aussi hors de la plage 10 à 18 °C, sans seuil chiffré." },
    },
    eau: {
      pFAO: { valeur: 0.50, unite: "fraction d'épuisement de la réserve utile", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 22, ligne « Beets, table »",
        url: "https://www.fao.org/4/x0490e/x0490e0e.htm", annee: 1998,
        note: "Enracinement 0,6 à 1,0 m. Absent de la table 24 : aucun Ky. Le Ky de 1,0 de la betterave sucrière n'est pas emprunté." },
    },
    germination: {
      tempMinSol: { valeur: 4.4, unite: "°C (sol)", confiance: "haute",
        source: "Utah State University Extension, Beets in the Garden (D. Drost)",
        url: "https://extension.usu.edu/yardandgarden/research/beets-in-the-garden", annee: 2020,
        note: "Optimum 12,8 à 23,9 °C, germination réduite au-delà de 26,7 °C. Le Maryland donne une plage plus large allant jusqu'à 29 °C : désaccord signalé." },
    },
  },

  /* --- Concombre ----------------------------------------------------------
     PIÈGE ÉVITÉ : la pastèque figure dans la table 24 avec un Ky de 1,1 et
     c'est la seule cucurbitacée présente. Elle n'est pas empruntée : fruit
     unique à maturité contre récolte échelonnée de fruits immatures.
     Attention aussi à ne pas mélanger deux durées qui ne mesurent pas la même
     chose : la FAO donne 105 à 130 jours pour le cycle COMPLET, les
     extensions 50 à 70 jours jusqu'à la PREMIÈRE récolte. */
  "concombre": {
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 50, unite: "jours", confiance: "haute",
        modeImplantation: "semis_direct",
        source: "UGA Cooperative Extension C1034 ; Clemson Cooperative Extension (HGIC)",
        url: "https://fieldreport.caes.uga.edu/publications/C1034/", annee: 2024,
        note: "50 à 70 jours jusqu'à la PREMIÈRE récolte, deux extensions concordantes. À ne pas confondre avec les 105 à 130 jours de la FAO, qui couvrent le cycle complet jusqu'à la fin de la récolte." },
      autresModes: [
        { mode: "plant", dureeConnue: true, ecartJours: -14,
          source: "Utah State University Extension, 2020",
          note: "« Transplants mature about 2 weeks before seeded cucumbers », pour un élevage de quatre à six semaines. L'Iowa donne deux à trois semaines d'élevage : désaccord sur la durée d'élevage, pas sur le principe." },
      ],
    },
    chaleur: {
      seuilStressThermique: { valeur: 32.2, unite: "°C", confiance: "haute",
        source: "Penn State Extension, Growing Cucumbers in High Tunnels",
        url: "https://extension.psu.edu/growing-cucumbers-in-high-tunnels", annee: 2024,
        note: "Au-delà, échec reproductif : la nouaison décroche. Effet RÉVERSIBLE — elle reprend dès que la température repasse sous le seuil, ce n'est donc pas une perte de cycle. Un second seuil, à 35 °C, concerne l'avortement du pollen (Chen et al. 2021). L'amertume n'a pas de seuil absolu documenté : la seule valeur chiffrée trouvée est une AMPLITUDE de plus de 11 °C (Clemson), pas une température." },
    },
    eau: {
      pFAO: { valeur: 0.50, unite: "fraction d'épuisement de la réserve utile", confiance: "haute",
        source: "FAO Irrigation and Drainage Paper 56, table 22", url: "https://www.fao.org/4/x0490e/x0490e0e.htm",
        annee: 1998, note: "Enracinement 0,7 à 1,2 m. Absent de la table 24 : aucun Ky, et celui de la pastèque n'est pas emprunté." },
    },
    germination: {
      tempMinSol: { valeur: 10, unite: "°C (sol)", confiance: "haute",
        source: "Clemson Cooperative Extension (HGIC), Cucumber",
        url: "https://hgic.clemson.edu/factsheet/cucumber/", annee: null,
        note: "Seuil absolu : la graine ne germe pas en dessous. En pratique les extensions recommandent d'attendre 15,6 à 21,1 °C. Germination supprimée vers 42 °C." },
    },
  },

  /* --- Tomate -------------------------------------------------------------
     Le seuil qui compte n'est pas la survie de la plante mais la NOUAISON :
     le pollen devient non viable bien avant que la plante ne souffre. */
  "tomate": {
    cultiveeComme: "annuelle", perenne: false,
    cycle: {
      joursMaturite: { valeur: 100, unite: "jours", confiance: "haute",
        modeImplantation: "plant",
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
        modeImplantation: "plant",
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
