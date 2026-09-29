# Doctrine : effet d'un abri non chauffé sur le calendrier

Décision du 29 septembre 2026 (Jean-Bruno). Remplace la règle « un abri rend le
verdict indéterminé » de `environnements.js` pour les abris NON chauffés.

## Règle

Un abri non chauffé (tunnel, serre froide, châssis, véranda, pots rentrés l'hiver)
vaut **un cran vers le chaud** sur l'échelle des zones internes de Permavore :

    montagne → continental → tempere → oceanique → mediterraneen

Concrètement, dans `ZONES` (`data.js`), un cran = la zone immédiatement plus
douce ; on ne dépasse pas `mediterraneen`. Le calendrier de la zone d'accueil
s'applique à la zone abritée. Un second abri à l'intérieur du premier (châssis
sous tunnel) vaut un second cran.

Les abris chauffés (`serre_chauffee`, `interieur`) restent hors calendrier :
on n'affiche pas de « bon moment », on affiche « possible toute l'année, selon
le chauffage » — rien n'est mesuré, on ne l'invente pas.

`veranda` : un cran, avec la réserve « lumière réduite » déjà portée par
`ENVIRONNEMENTS`.

## Source

Eliot Coleman, maraîcher dans le Maine, mesure depuis les années 1990 que
« chaque couche de protection déplace la zone couverte d'environ 500 miles vers
le sud » (Maine → New Jersey pour une serre froide, → Géorgie pour un châssis
dans la serre). Entretien : https://ecofarmingdaily.com/interview-extending-growing-season-organic-farmer-author-eliot-coleman-shares-strategies-successful-year-round-growing/
Ouvrage : *The Winter Harvest Handbook* (Chelsea Green, 2009).

500 miles sur la côte est des États-Unis correspondent à environ 1 à 1,5 zone
USDA (une zone = 10 °F ≈ 5,6 °C sur la température minimale hivernale). Le
« cran » de Permavore (≈ 1 mois de décalage au début et à la fin de saison) est
la transposition prudente de cet ordre de grandeur, arrondie vers le bas.

## Limites connues

- Ordre de grandeur, pas mesure : l'effet réel dépend de la ventilation, de
  l'exposition et de l'étanchéité. Une mesure locale (valise Art of Flux ou
  thermomètre min/max) doit pouvoir remplacer la règle, zone par zone.
- La règle porte sur le gel et la longueur de saison, pas sur la chaleur d'été :
  une serre froide en juillet est plus chaude qu'un cran, et ce n'est pas modélisé.
