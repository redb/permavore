# 🌱 Permavore

Sélecteur de cultures pour **jardin nourricier**. On saisit sa ville (ou on se
géolocalise) et la surface du jardin ; le site propose les fruits, légumes et
aromatiques adaptés au climat, en mettant en avant celles **à planter ce mois-ci**.

## Parcours

Permavore répond d'abord à une question : **« Qu'est-ce que je peux planter chez moi
maintenant ? »** L'écran d'entrée ne demande que la commune (ou « Me localiser ») et
une surface approximative ; le climat est déduit automatiquement. Les résultats
mettent en avant **À planter maintenant**, puis **Bientôt** et **Autres cultures
adaptées**. Les outils (recherche, filtres, Mon potager, ressources, ajout, photo de
sachet, identification, plan) arrivent ensuite, repliés ou quand ils deviennent utiles.

Détails, règles d'estimation et architecture cible (météo, placement, succession) :
[`docs/architecture-recommandation.md`](docs/architecture-recommandation.md).

## Fonctionnalités

- **Ville → zone climatique** : dictionnaire de villes FR + estimation par
  géolocalisation (5 zones : méditerranéen, océanique, tempéré, continental,
  montagne), **affinée par l'altitude réelle du point** via l'API altimétrie
  IGN (au-delà de 900 m la zone bascule en montagne ; entre 600 et 900 m un
  avertissement sur les gelées tardives). Sélecteur manuel de secours.
- **Surface du jardin** → estimation du nombre de pieds par variété. Sous
  1 pied/m², le rapport est inversé (« 1 pied pour 10 m² ») : un demi-figuier
  n'existe pas.
- **« À planter maintenant »** en tête : calendrier de semis/plantation décalé
  selon la zone, comparé au mois courant (+ section « Bientôt »).
  Le décalage est **différencié par variété** : une plante frileuse est calée
  sur les dernières gelées (donc fortement retardée en continental et en
  montagne), une plante rustique sur la température du sol (donc peu décalée).
  Un radis ne se sème pas un mois plus tard à Strasbourg qu'à Paris.
- **Cartes** avec photo/emoji, descriptif court, pictos **cycle**
  (🌱 annuelle · 🔄 bisannuelle · ♻️ vivace), **difficulté** (🟢🟡🔴),
  **encombrement** et **exposition**.
- **Clic sur une carte** → fiche détaillée (description longue, calendrier,
  conseils, fiche technique, estimation, lien d'achat).
- **Lien d'achat** par variété (`lien` dans `data.js`) ; le sponsoring est
  désactivé, le projet étant non commercial (voir « Licences et crédits »).
- **Filtres** : catégorie, cycle, petits espaces.
- **Réseau de semences pilote** sur la fiche Tomate : variétés reproductibles,
  disponibilité entre Primavores, protocole sourcé, aperçu des lignées et demande
  résiliente. Si l'API n'est pas disponible, les données locales et le lien
  de recherche de graines restent utilisables.
- Une plante ajoutée manuellement peut être marquée **« J’ai enraciné »** pour
  indiquer qu’elle pousse déjà dans le jardin, sans créer automatiquement une
  offre de graines.
- Les plantes cochées et les préférences du jardin (ville, surface, climat,
  affichage et filtres) sont conservées localement ; au retour, le site rouvre
  directement sur le résumé replié. Les coordonnées précises ne sont jamais
  enregistrées.
- **Suivi de culture** : à l'adoption d'une plante, la date du jour est
  enregistrée (modifiable dans la fiche). Le site en déduit les étapes à venir
  et les affiche en tête de page dans **« Prochaines étapes au potager »**
  (`permavore.dates.v1`). Les délais viennent de la base, pas d'une moyenne :
  le radis lève en 3 à 5 jours, le persil en 15 à 30 (champ `levee`). Une plante
  mise en place en plant, caïeu, tubercule ou rhizome (champ `mode`) n'affiche
  aucune levée plutôt qu'un délai inventé, et l'éclaircissage n'apparaît que
  pour les plantes qui se démarient réellement (champ `eclaircir` — pas les
  légumineuses, semées à l'écartement définitif).
- **Prévision porte-graines** : dans la fiche d'une plante du réseau, la date de
  mise en place sert à estimer **quand les graines seront récoltables** — une
  date distincte de la récolte alimentaire, et la seule qui compte pour
  anticiper une offre. Les bisannuelles sont annoncées pour l'été suivant
  (montée en graines la 2ᵉ année). Rien n'est affiché sans date saisie : le
  système ne suppose aucune disponibilité à la place du jardinier.
- **Ajout d'une fiche automatique** : une recherche sans résultat propose de
  créer la fiche, et l'auto-remplissage Wikipédia/Wikidata (résumé, photo, nom
  latin via `P225`) se déclenche **sans clic**. En saisie manuelle il part dès
  que le nom se stabilise, une seule fois, pour ne pas écraser la frappe.
- **Photos manquantes récupérées automatiquement** : une plante sans `photo:`
  voit sa vignette cherchée sur Wikipédia (par nom latin, puis nom courant) au
  premier affichage, puis mise en cache 30 jours (`permavore.photos.v1`).
  Aucune URL Commons figée à la main : elles cassent au moindre renommage.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page |
| `style.css` | Styles |
| `data.js` | Base plantes + zones + villes (éditorial) |
| `app.js` | Logique (zones, calendrier, rendu, modale) |
| `network-data.js` | Catalogue pilote des variétés et protocoles sourcés |
| `network-core.mjs` | Validation, timeouts, idempotence et retries |
| `network.js` | Intégration du réseau dans les fiches plantes |
| `network.css` | Interface responsive du réseau |
| `tests/` | Tests unitaires du socle réseau |

Site statique, aucune dépendance — à une exception près : `/api/identifier` (voir plus bas). Ouvrir `index.html` ou servir le
dossier.

## Développement local

```bash
python3 -m http.server 4173
# puis http://localhost:4173
```

Contrôles locaux :

```bash
npm test
npm run check
```

## Déploiement (Cloudflare Pages)

```bash
npx wrangler pages deploy . --project-name=permavore
```

Cible : `permavore.pages.dev`.

## Alimenter la base (ajouter une plante)

La base = le tableau `PLANTES` dans `data.js` (source de vérité, pas de back-end).
La **barre de recherche du site filtre** les plantes existantes ; elle n'en ajoute
pas. Pour ajouter une variété, copie ce gabarit dans `PLANTES` :

```js
{ id:"epinard-monstrueux", nom:"Épinard monstrueux de Viroflay",
  latin:"Spinacia oleracea", cat:"legume",           // legume | fruit | aromatique | exotique
  emoji:"🥬", photo:"https://…/photo.jpg",            // photo optionnelle (sinon tuile emoji)
  cycle:"annuelle", diff:1,                            // cycle: annuelle|bisannuelle|vivace ; diff: 1|2|3
  encombrement:"compact", soleil:"mi-ombre",          // compact|moyen|gourmand ; plein|mi-ombre|ombre
  densite:25, espacement:"10 cm", frileux:false,      // densite = pieds/m²
  semis:[[3,4],[8,9]], recolte:"6 à 8 semaines",      // semis: fenêtres [moisDebut, moisFin]
  lien:"", sponsorise:false,                           // lien d'achat (cf. ci-dessous)
  court:"…", long:"…", conseils:["…","…"] },
```

Idées d'industrialisation : import d'un CSV/JSON, ou petit script qui pré-remplit
`photo`/`latin` depuis Wikipédia (comme fait pour les 37 photos actuelles).

## Liens sponsorisés

> Désactivés tant que `MONETISATION_ACTIVE = false` (voir « Licences et crédits »).

Trois niveaux, dans `data.js` (par priorité) :

1. **Par plante** : `lien:"https://boutique.fr/…?aff=TONCODE"` + `sponsorise:true`
   → le bouton « 🛒 Trouver » pointe vers ton lien affilié, badge **Partenaire ✦**.
2. **Partenaire global** : mets `PARTENAIRE_DEFAUT.actif = true` et son `url`
   (`{q}` = nom de la plante). Tous les boutons sans `lien` propre l'utilisent.
3. **Défaut** : simple recherche web générique (non sponsorisée).

## Sourcing des durées de levée

Le champ `levee: [min, max]` (en jours) est renseigné pour les 20 plantes
réellement **semées** sur la fenêtre du calendrier, à partir de deux tableaux
de germination recoupés :

- [Temps de levée des semis de légumes — Plan de jardin / Jardin biologique](https://plandejardin-jardinbiologique.com/temps-levee-des-semis-de-graines-de-legume.html)
- [Tableau de germination des graines : temps et températures — Les Mains Dans La Terre](https://les-mains-dans-la-terre.com/2024/03/15/tableau-de-germination-des-graines-temps-et-temperatures/)

Les 21 autres plantes sont mises en place en plant, caïeu, tubercule ou rhizome
(`mode`) : elles ne lèvent pas, donc aucune durée ne leur est attribuée. Les
durées sont des ordres de grandeur à température favorable ; un sol froid les
allonge nettement.


## Sachets de graines (photo, guide et archive)

Bouton **📷 Photo sachet** : ouvre l'appareil photo (mobile), compresse l'image
en deux tailles (vignette 400 px, plein 1400 px) et la range dans **IndexedDB**
— pas localStorage, qui serait saturé par quelques photos et ferait échouer
toutes les autres sauvegardes.

Le sachet se rattache à une plante existante ou déclenche la création d'une
fiche. On y note variété, semencier, date limite de semis et consignes. Si la
plante n'a pas d'illustration, la photo du sachet lui en sert (le légume y est
imprimé : c'est une aide à l'identification de la variété).

**Limite assumée** : le texte du sachet n'est pas lu automatiquement. Un OCR
client (Tesseract.js, ~4 Mo) donnerait des résultats médiocres sur des sachets
brillants ou courbés ; les champs sont donc saisis à la main.

## Plan du jardin et rotation des cultures

`jardin.js`. La grille a une maille de **0,5 m** (0,25 m² par case), ce qui donne
exactement les formes attendues :

| Surface | Cases | Forme |
|---|---|---|
| 0,5 m² | 2 | rectangle 0,5 × 1 m |
| 1 m² | 4 | **carré** 1 × 1 m |
| 3 m² | 12 | rectangle 1 × 3 m |

Clic = planche d'1 m² ; appui + glissé = taille libre. Les chevauchements sont
refusés.

**Rotation** — deux règles cumulées quand une planche est récoltée :

1. **Famille botanique** : pas deux fois la même famille au même endroit avant
   3 ans (les parasites et maladies persistent dans le sol). L'exclusion est
   affichée avec son motif.
2. **Cycle de fertilité** : légumineuse → feuille → fruit → racine. Les
   légumineuses fixent l'azote, les feuilles le consomment, les fruits sont
   gourmands, les racines terminent sur un sol appauvri.

Les suggestions sont en plus filtrées par saison et par zone climatique, et les
vivaces sont exclues de la rotation.

## Identification d'une plante par photo (Pl@ntNet)

Bouton **🔍 Identifier une plante** : photo → choix de l'organe visible
(feuille, fleur, fruit, écorce ou « je ne sais pas ») → espèces probables avec
leur score → **« Voir la fiche »** si l'espèce est dans la base (correspondance
par nom scientifique, genre seul pour les fiches de genre comme *Mentha*), sinon
**« Ajouter à la base »** avec nom et nom latin pré-remplis.

C'est la seule partie du site qui s'exécute côté serveur :
`functions/api/identifier.js` (Pages Function) relaie vers l'API
[Pl@ntNet](https://my.plantnet.org) pour que **la clé ne soit jamais dans le
navigateur**.

| Garde-fou | Réglage |
|---|---|
| Entrées | multipart, 1 à 3 images JPEG/PNG ≤ 2 Mo, organe en liste blanche |
| Origine | requêtes d'un autre site refusées (403) |
| Délai / reprises | 15 s, 1 seule reprise sur panne ou 5xx |
| Débit | 3/min et 30/jour par visiteur (KV `RL`, IP hachée, jamais stockée en clair), décompté **après** validation |
| Réponse | champs utiles uniquement ; la clé n'apparaît jamais |
| Vie privée | photo ré-encodée dans le navigateur → EXIF et position GPS supprimés |

Quota du plan gratuit Pl@ntNet : **500 identifications/jour**. Sans clé, le
bouton répond proprement « identification pas encore activée ».

Activer (la clé ne passe jamais par le dépôt) :

```bash
npx wrangler pages secret put PLANTNET_API_KEY --project-name=permavore
```

Tester en local sans vraie clé : créer un `.dev.vars` (ignoré par git) avec
`PLANTNET_API_KEY=…` et, pour viser un faux service, `PLANTNET_URL=…`, puis
`npx wrangler pages dev .`.

Une identification automatique reste une **aide** : l'interface rappelle de ne
jamais consommer une plante sur cette seule base (sosies toxiques).

## Licences et crédits

### Police Graham (nom « Permavore »)

- **Licence actuelle** : essai Zetafonts n° 104877 (17/09/2026), personnelle et
  **non commerciale**, un seul appareil.
- **Ce qu'elle permet ici** : publier un visuel fixe, `icons/wordmark-permavore.png`,
  avec crédit visible (« Graham par Zetafonts », pied de page).
- **Ce qu'elle interdit** : mettre les fichiers de police en ligne (@font-face),
  les placer sur un serveur ou **dans ce dépôt**, ou tout usage commercial. Les
  polices restent sur le poste de JBR ; ne jamais les commiter.

> ⚠️ **Engagement : dès le premier euro de revenu lié à Permavore** (affiliation,
> publicité, dons, ventes…), acheter la licence commerciale Graham auprès de
> Zetafonts (info@zetafonts.com) **avant** d'encaisser : licence **Web** pour le
> domaine définitif, plus licence **Logo** si le nom en Graham reste le logo.
> Décision tracée dans braincentral **BDR-023**.

Ce verrou existe aussi dans le code : `MONETISATION_ACTIVE = false` (`data.js`)
désactive liens affiliés et badges « Partenaire ». Ne le passer à `true`
qu'après l'achat de la licence.

### Autres

- Logo « P » : `sources/logo-permavore.png` (création commandée par JBR).
- Photo d'aperçu : `sources/photo-pousse-og.jpg`.
- Identification des plantes : Pl@ntNet (attribution affichée).

## À enrichir

- Calendrier : les fenêtres `semis` restent des valeurs France métropole par
  espèce. Le décalage climatique est maintenant différencié frileuse/rustique,
  mais une même espèce peut avoir des variétés précoces et tardives — c'est le
  prochain cran de finesse, et il suppose une base par variété.
- Seuil « montagne » à 900 m : correct dans les Alpes et les Pyrénées, discutable
  dans le Massif central où l'effet de continentalité joue plus que l'altitude.
- La prévision porte-graines ne couvre que les annuelles et les bisannuelles ;
  les vivaces sont hors modèle.
