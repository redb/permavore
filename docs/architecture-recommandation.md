# Permavore — architecture de la recommandation

Question à laquelle le produit répond en premier : **« Qu'est-ce que je peux planter
chez moi maintenant pour produire de la nourriture ? »**
Principe : **simplicité immédiate → richesse progressive.**

## 1. Parcours (itération du 2026-09-17)

| État | Déclencheur | Ce qui est visible |
|---|---|---|
| Entrée | 1re visite, aucune commune connue | Titre, commune (ou « Me localiser »), surface en 4 choix, bouton « Voir ce que je peux planter », « Réglages avancés » replié |
| Résultats | Bouton validé, ou commune mémorisée d'une visite précédente | Barre repliée, recherche + « Filtrer », « Plus d'outils » replié, puis les sections ci-dessous |

Mécanique : classe `resultats` sur `<body>` ; tout ce qui porte `.resultats-seulement`
est masqué avant. Aucun compteur n'est affiché à zéro.

Ordre des sections de résultats : **À planter maintenant** (grandes cartes, toujours) →
lune → objectif facultatif → invitation au plan → prochaines étapes → Bientôt →
Autres cultures adaptées → plan (sur demande).

Le climat est **déduit** de la commune (dictionnaire, puis coordonnées, puis altitude
IGN). Il n'est modifiable que dans « Réglages avancés ».

## 2. Culture ≠ variété

- `PLANTES` (`data.js`) = **cultures** (espèces cultivées : Tomate, Pomme de terre).
- **Variétés** (cultivars : Rose de Berne, Charlotte) = catalogue distinct, rattaché par
  `cultureId`. Existe déjà pour la tomate dans `network-data.js`.
- L'interface dit « cultures » dans les résultats ; « variété » est réservé aux cultivars
  (sachets, réseau de semences).

## 3. Atouts « jardin nourricier »

| Atout | Source | Règle |
|---|---|---|
| Facile | fiche | `diff === 1` |
| Vivace | fiche | `cycle === "vivace"` |
| Rapide | fiche | délai « N semaines » ≤ 70 j, ou écart semis → récolte ≤ 2 mois pour un semis direct |
| Nourrissant | éditorial | `ATOUTS_EDITORIAUX.nourrissant` |
| Productif | éditorial | `ATOUTS_EDITORIAUX.productif` |
| Se conserve | éditorial | `ATOUTS_EDITORIAUX.conservation` |

Les atouts éditoriaux sont **qualitatifs** et affichés comme estimations (pastille « ≈ »,
infobulle). Aucun rendement chiffré n'est affiché tant que `RENDEMENTS_SOURCES` est
vide ; la carte sait déjà afficher une entrée sourcée (`{min, max, unite, source}`).

« Avant récolte » : valeur de la fiche si elle existe, sinon estimation au mois près
(écart entre le début de la 1re fenêtre de semis et le 1er mois de récolte). Non
calculée pour les vivaces.

## 4. Objectif facultatif

Posé **après** les premiers résultats, jamais avant. Il applique des **poids** aux atouts
(`OBJECTIFS`, `app.js`) : il **réordonne** chaque section, il ne retire rien.
Signaux supplémentaires dérivés des fiches : récolte couvrant l'hiver (« toute
l'année »), plante non frileuse (« résilient »), fruit/aromatique (« plaisir »).

## 5. « Pourquoi maintenant ? »

Calculé par `pourquoiHTML()` à partir des seules données disponibles : fenêtre de
semis/plantation **décalée pour la zone**, récolte, durée estimée, sensibilité au gel,
exposition, atouts. Une phrase situe le mois courant dans la fenêtre (en plein dedans,
dernier mois, s'ouvre le mois prochain, pas encore).

Le sol n'est pas affiché : la donnée n'existe pas dans la base.

## 6. Cible météo et microclimat (non connectée)

Aujourd'hui, la recommandation = calendrier de référence × zone × altitude.
L'interface l'annonce explicitement (« la météo réelle n'est pas encore prise en
compte »). **Aucune précision météo n'est simulée.**

Architecture prévue : `pourquoiHTML()` / le statut de plantation consommeront une liste
de **signaux** produits par des fournisseurs indépendants :

```js
// Contrat d'un signal — un fournisseur sans donnée ne renvoie rien.
{ type: "gel_prevu" | "chaleur" | "sol_froid" | "secheresse" | "ombre",
  severite: "info" | "attention" | "bloquant",
  message: "Nuits à -2 °C annoncées jeudi : attends ou protège le semis.",
  source: "Météo-France / Open-Meteo …", horodatage: "…", fiabilite: 0..1 }
```

| Fournisseur | Donnée | État |
|---|---|---|
| Localisation → zone | dictionnaire + coordonnées | en place |
| Altitude | API altimétrie IGN | en place |
| Climat local / normales | séries climatiques | à brancher |
| Historique récent (températures sol/air) | API météo | à brancher |
| Prévisions 7 jours | API météo | à brancher |
| Exposition, ombre, abri | plan du jardin | à modéliser (§7) |

Règles : un signal « bloquant » ne masque jamais une culture, il **nuance** le
« Pourquoi maintenant ? » (exemple : « le calendrier permet ce semis, mais des
gelées sont annoncées »). Toute requête externe reste bornée (timeout, 1 reprise,
repli silencieux) — règles Chateaufort.

## 7. Plan du jardin → moteur de placement

Le plan n'est plus proposé à l'arrivée : l'invitation « Tu veux optimiser leur
emplacement ? » apparaît dès la 1re culture ajoutée (et se range si on l'écarte).

Modèle actuel (`jardin.js`) : grille de maille 0,5 m, planches rectangulaires, culture
en place, historique pour la rotation.

Objets à ajouter pour permettre « Mets cette culture ici » :

| Objet | Attributs utiles au placement |
|---|---|
| Limites du terrain | polygone, orientation (nord) |
| Maison, murs | emprise, hauteur → ombre portée, abri, effet radiateur (mur sud) |
| Zones cultivables / planches | surface, sol, historique de cultures |
| Arbres existants | emprise, hauteur, caduc/persistant → ombre saisonnière |
| Zones d'ombre | calculées (orientation + obstacles) ou saisies |
| Arrivée d'eau | position → distance d'arrosage |

Score de placement envisagé : exposition requise (`soleil`) × ensoleillement de la
zone × rotation (familles, cf. rotation existante) × encombrement × distance à l'eau.

## 8. Boucle de culture

DÉCOUVRIR → AJOUTER → PLACER → CULTIVER → RÉCOLTER → REMPLACER

| Étape | Existant | Manque |
|---|---|---|
| Découvrir | résultats, atouts, objectif, « Pourquoi ? » | variétés locales |
| Ajouter | « Ajouter à mon potager » + date du jour modifiable | distinguer date de semis et date de plantation |
| Placer | planches du plan | surface occupée liée à la culture ajoutée |
| Cultiver | « Prochaines étapes » (levée, éclaircissage, récolte) | signaux météo (§6) |
| Récolter | fin de récolte, marquage sur la planche | — |
| Remplacer | suggestions de rotation à la libération d'une planche | **anticipation** : « tes pommes de terre libèrent cette planche vers juillet, voici 3 cultures pour ensuite » |

Prochaine itération suggérée : relier « Ajouter » à une planche (surface occupée) et
calculer la date de libération prévue, pour proposer la succession **avant** la récolte.

## 9. Deux curseurs indépendants (2026-09-17)

| Axe | Valeur par défaut | Effet |
|---|---|---|
| 🌺 Agrément ↔ 🥔 Nourricier | 0,70 (plutôt nourricier) | pondère `scoreNourricier` / `scoreAgrement` |
| 🏡 Local éprouvé ↔ 🌍 Exotique expérimental | 0,25 (plutôt éprouvé) | pondère `scoreExperimental` / son inverse |

Ils **réordonnent** et ne filtrent jamais. Une culture manifestement incompatible avec
la zone (`adapteeZone`) reste écartée, même curseur à fond : seuil minimal de
plausibilité agronomique.

« Local éprouvé » = **réussite bien établie dans les conditions locales**, pas
« espèce d'ici ».

### Statut par zone — seulement avec les données réellement présentes

`statutCulture()` n'utilise que : catégorie éditoriale (`exotique`), `frileux`, zone.

| Condition | Statut | Message |
|---|---|---|
| non adaptée à la zone | incompatible | (écartée) |
| exotique + zone froide (continental, montagne) | expérimental | saison chaude plus courte, démarrage au chaud, réussite incertaine |
| exotique, autre zone | possible | peu courante mais climat plutôt adapté |
| frileuse + zone froide | possible | attendre le réchauffement du sol ou démarrer à l'abri |
| sinon | éprouvé | — |

**Champs manquants, à remplir sans jamais les deviner** (cf. `data.js`) : rusticité,
température minimale, durée minimale de saison chaude, besoins thermiques, culture
sous abri, démarrage en intérieur, retours d'expérience locaux. Le statut se
raffinera dès qu'ils existeront ; à terme, « éprouvé » devra pouvoir être renforcé
par les réussites rapportées par des jardiniers en conditions comparables.

## 10. Horizon 5 ans — état des sources

`PROJECTIONS_CLIMAT` est **vide**. La fiche affiche « projection non disponible ».
Aucune tendance n'est simulée, et le réchauffement n'est jamais présenté comme
favorable par défaut : une culture exigeant du froid hivernal peut recevoir
`tendance: "defavorable"`.

Toute entrée doit porter : `source`, `scenario`, `periodeReference`, `horizon`,
`resolution`, `miseAJour`, `confiance`, `facteurs` (indicateurs réellement utilisés).
Formulations imposées : « devrait devenir plus favorable », « tendance favorable »,
« incertitude importante » — jamais « dans 5 ans cette plante poussera ici ».

Sources évaluées le 2026-09-17 :

| Source | Contenu | Réutilisable ? |
|---|---|---|
| **Open-Meteo Climate API** | projections CMIP6 descendues d'échelle, par coordonnées, scénarios SSP | **Oui, testé** : réponse 200, 365 jours pour 2031 sur Rumilly (mini −7,5 °C, 12 jours > 30 °C). Gratuit, sans clé. |
| **DRIAS (Météo-France)** | projections régionalisées officielles, indicateurs agro (gelées, jours chauds, sécheresse) | À privilégier comme référence française ; téléchargement, pas d'API temps réel |
| **API Données climatologiques (Météo-France, data.gouv)** | climatologie **observée** (6 min → mensuel), Licence Ouverte 2.0, compte requis, 50 req/min | Oui, pour la période de référence et les normales — pas pour le futur |
| **AgroClimat 2050 (Serge Zaka, AZKA, PAESI)** | cartographie agroclimatique prédictive, export JPG | **Pas d'API ni de licence de réutilisation documentée**, et le site précise que les sorties n'ont « aucun caractère officiel ». À solliciter pour un accord et pour les seuils agronomiques par culture, pas à extraire automatiquement. |

Brique manquante côté agronomie : les **seuils par culture** (jours > 30 °C requis,
durée de saison sans gel, besoins en froid hivernal). Sans eux, une projection
climatique ne peut pas être traduite en « plus ou moins favorable » pour une culture
donnée — c'est là que l'expertise d'un agroclimatologue a le plus de valeur.

## 11. Tendance climatique locale — branchée (2026-09-17)

`climat.js` interroge l'**API Climate d'Open-Meteo** (CMIP6 HighResMIP, modèles
20–51 km descendus à 10 km, 1950–2050, scénario « au plus proche de RCP 8.5 »,
CC BY 4.0, sans clé pour un usage non commercial) aux coordonnées de la commune.

**Indicateurs calculés** (par année, puis moyennés par fenêtre, 2 modèles) :
durée de la saison sans gel (tmin ≤ 0 °C), jours chauds (tmax > 30 °C), minimum
hivernal. La variabilité interannuelle (écart-type) est calculée sur la référence.

**Fenêtres : 20 ans** — `2005-2024` contre `2030-2049`. À 5 ans, l'écart
climatique est plus petit que la variabilité d'une année à l'autre : l'annoncer
serait du bruit. Première version testée sur 10 ans : elle donnait à Rumilly une
saison sans gel *raccourcie* de 6 jours alors que les jours chauds augmentaient —
incohérence physique, donc bruit. L'interface le dit : « Comparaison sur 20 ans :
à 5 ans, l'écart climatique est plus petit que la variabilité entre deux années. »

**Règles de conclusion** — une tendance n'est affichée que si :
1. la culture est documentée comme craignant le gel (`frileux`), donc limitée par
   la chaleur : c'est le seul lien que les données permettent d'établir. Sinon :
   « projection non calculée — besoins thermiques non renseignés » ;
2. les deux modèles vont dans le même sens ;
3. l'écart dépasse `max(7 jours, variabilité interannuelle)`.

Sinon : « incertitude importante », avec la raison (désaccord des modèles, ou
écart dans la variabilité). Une forte hausse des jours chauds ajoute toujours la
réserve « plus de stress thermique et d'arrosage » : **le réchauffement n'est
jamais présenté comme un gain net**.

Exemples mesurés le 2026-09-17 :

| Commune | Saison sans gel | Jours > 30 °C | Verdict |
|---|---|---|---|
| Rumilly (74) | 234 → 242 j | 11,5 → 22 | favorable, avec réserve chaleur |
| Montpellier (34) | 309,5 → 317 j | 28 → 44,5 | incertain (modèles en désaccord) |

**Limites assumées** : 2 modèles seulement ; seuils de gel et de chaleur
génériques (0 °C, 30 °C) et non spécifiques à chaque culture ; aucun indicateur
de sécheresse, de précipitations ni de besoins en froid hivernal. Une entrée
saisie à la main dans `PROJECTIONS_CLIMAT` reste prioritaire sur ce calcul.

**Prochaine brique, la plus utile** : les seuils agronomiques par culture (jours
chauds nécessaires, durée de saison sans gel, besoins en froid). Sans eux, aucune
projection ne peut être traduite en « favorable » pour une culture donnée.

## 12. Copie de secours : ce que permettent réellement les navigateurs

Mesuré le 2026-09-18 avec `capacites.html`, sur les navigateurs réellement
installés — pas depuis une table de compatibilité mémorisée.

| Capacité | Safari 27 (macOS 26.7) | Chromium 152 (panneau intégré) |
|---|---|---|
| `showSaveFilePicker` | **non** | oui, mais **échoue à l'usage** |
| `createWritable` | oui (sans poignée à écrire) | oui |
| `queryPermission` / `requestPermission` | **non** | oui |
| `navigator.share` avec fichiers | **oui** | non |
| Téléchargement | oui | oui |
| **Autosauvegarde fichier** | **impossible** | annoncée possible, mais inutilisable ici |

Deux enseignements, tous deux contre-intuitifs :

1. **Safari a le partage natif mais pas le sélecteur de fichier.** C'est
   l'inverse de Chromium. La branche utile sur Safari — et donc sur iPhone —
   est la feuille de partage vers Fichiers ou iCloud Drive, pas la réécriture
   automatique. L'interface le dit désormais explicitement plutôt que
   d'afficher un message générique d'indisponibilité.

2. **La présence d'une API ne prouve pas qu'elle fonctionne.** Dans le panneau
   intégré de l'application Claude, `showSaveFilePicker` existe et se termine
   immédiatement par `AbortError`. `capacites()` ne peut pas le détecter :
   seul un essai réel le révèle. D'où le bouton d'essai de `capacites.html`,
   et d'où le fait que l'état ne passe jamais à « à jour » sans écriture
   réellement aboutie.

Non mesuré : Safari iOS et la PWA iOS. La page de diagnostic est en ligne
(`/capacites`) pour que la question se règle en dix secondes sur un vrai
téléphone, plutôt que par supposition.
