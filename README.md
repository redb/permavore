# 🌱 Permavore

Sélecteur de cultures pour **jardin nourricier**. On saisit sa ville (ou on se
géolocalise) et la surface du jardin ; le site propose les fruits, légumes et
aromatiques adaptés au climat, en mettant en avant ceux **à planter ce mois-ci**.

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
- **Lien d'achat sponsorisable** par variété (`lien` + `sponsorise` dans
  `data.js`).
- **Filtres** : catégorie, cycle, petits espaces.
- **Réseau de semences pilote** sur la fiche Tomate : variétés reproductibles,
  disponibilité entre Primavores, protocole sourcé, aperçu des lignées et demande
  résiliente. Si l'API n'est pas disponible, les données locales et le lien
  partenaire restent utilisables.
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

Site **100 % statique**, aucune dépendance. Ouvrir `index.html` ou servir le
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

## À enrichir

- Calendrier : les fenêtres `semis` restent des valeurs France métropole par
  espèce. Le décalage climatique est maintenant différencié frileuse/rustique,
  mais une même espèce peut avoir des variétés précoces et tardives — c'est le
  prochain cran de finesse, et il suppose une base par variété.
- Seuil « montagne » à 900 m : correct dans les Alpes et les Pyrénées, discutable
  dans le Massif central où l'effet de continentalité joue plus que l'altitude.
- La prévision porte-graines ne couvre que les annuelles et les bisannuelles ;
  les vivaces sont hors modèle.
