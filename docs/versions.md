# Versions de Permavore

Chaque version majeure porte un nom de plante en latin, de la plus commune à la
plus rare. Le numéro reste `MAJEURE.MINEURE` (`package.json` : `version`,
`codename`) ; le pied de page affiche « Nom vMAJEURE.MINEURE ».

| Majeure | Nom de code | Plante | Pourquoi là |
|---|---|---|---|
| 1 | Taraxacum | pissenlit | partout, pousse dans une fissure |
| 2 | Plantago | plantain | trottoirs, prés, jamais semé |
| 3 | Urtica | ortie | tout terrain riche, mal aimée |
| 4 | Trifolium | trèfle | toute pelouse |
| 5 | Bellis | pâquerette | toute pelouse, mais on la remarque |
| 6 | Achillea | achillée | prairies et talus |
| 7 | Primula | primevère | lisières, début de printemps |
| 8 | Symphytum | consoude | bords d'eau, plante du jardinier |
| 9 | Salvia pratensis | sauge des prés | prairies maigres, en recul |
| 10 | Gentiana | gentiane | alpages, cueillette réglementée |
| 11 | Leontopodium | edelweiss | rochers d'altitude, protégée |
| 12 | Cypripedium calceolus | sabot de Vénus | orchidée protégée, quelques stations |

Passage de version : modifier `version` et `codename` dans `package.json`,
puis `npm run deploy`. Le commit et la date sont ajoutés automatiquement
(`scripts/version.sh`) et visibles au survol du pied de page.
