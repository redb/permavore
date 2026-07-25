# 🌱 Permavore

Sélecteur de cultures pour **jardin nourricier**. On saisit sa ville (ou on se
géolocalise) et la surface du jardin ; le site propose les fruits, légumes et
aromatiques adaptés au climat, en mettant en avant ceux **à planter ce mois-ci**.

## Fonctionnalités

- **Ville → zone climatique** : dictionnaire de villes FR + estimation par
  géolocalisation (5 zones : méditerranéen, océanique, tempéré, continental,
  montagne). Sélecteur manuel de secours.
- **Surface du jardin** → estimation du nombre de pieds par variété.
- **« À planter maintenant »** en tête : calendrier de semis/plantation décalé
  selon la zone, comparé au mois courant (+ section « Bientôt »).
- **Cartes** avec photo/emoji, descriptif court, pictos **cycle**
  (🌱 annuelle · 🔄 bisannuelle · ♻️ vivace), **difficulté** (🟢🟡🔴),
  **encombrement** et **exposition**.
- **Clic sur une carte** → fiche détaillée (description longue, calendrier,
  conseils, fiche technique, estimation, lien d'achat).
- **Lien d'achat sponsorisable** par variété (`lien` + `sponsorise` dans
  `data.js`).
- **Filtres** : catégorie, cycle, petits espaces.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page |
| `style.css` | Styles |
| `data.js` | Base plantes + zones + villes (éditorial) |
| `app.js` | Logique (zones, calendrier, rendu, modale) |

Site **100 % statique**, aucune dépendance. Ouvrir `index.html` ou servir le
dossier.

## Développement local

```bash
python3 -m http.server 4173
# puis http://localhost:4173
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

## À enrichir

- Calendrier indicatif (France métropolitaine) : à affiner par variété/zone.
- 4 plantes sans photo (fève, ail, figuier, gingembre) : ajouter un `photo:` manuel.
- Détection « montagne » par altitude (le géocodage ne donne que la commune).
