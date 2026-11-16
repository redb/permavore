# Sources de données — candidates

Sources repérées **non branchées** dans l'app. Une source n'entre dans le code qu'avec une licence de réutilisation écrite (ou un accord de l'éditeur) et un accès stable (API ou fichier), jamais par aspiration de pages.

## Agrométéorologie (agrometeorologie.com)

- Lien : https://agrometeorologie.com/ (variante suisse : https://agrometeorologie.ch/)
- Éditeur : AgroClimat2050, bureau d'études de Serge Zaka (agroclimatologue).
- Contenu : environ 1 000 indicateurs agroclimatiques (gel, dernière gelée de printemps, degrés-jours, pousse de l'herbe, mildiou, Huglin/Winkler, sécheresse, pollens, ravageurs…) sur une grille de 8 km couvrant la France métropolitaine ; prévisions à 10 jours ; historique depuis 1958-1959.
- Données d'entrée déclarées : Météo-France (AROME, ARPEGE, SIM2), DWD ICON, NOAA GFS, DMI HARMONIE, Copernicus (EFFIS, CAMS).
- Accès : carte libre, compte gratuit ; page « Données et API » sans format ni tarif publiés — accès sur demande.
- Licence : non publiée sur la page d'accueil (CGU à lire). **Réutilisation non autorisée par défaut.**

### Intérêt pour Permavore

- Recoupement des calculs maison (gel, degrés-jours base 10, saison sans gel) avec un calcul tiers sur la même commune.
- Indicateurs absents de Permavore : dernière gelée de printemps statistique, pression maladie (mildiou), ravageurs.

### Limites

- Les données brutes (SIM2, AROME, ARPEGE) sont ouvertes chez Météo-France et en partie déjà servies par Open-Meteo : la valeur ajoutée tient aux indicateurs calculés, pas à la météo.
- Couverture France seule ; l'app vise aussi d'autres pays.
- Dépendance à un acteur privé unique, sans contrat de service publié.

### Avant tout branchement

1. Lire les CGU et la page « Données et API ».
2. Demander à l'éditeur : licence (réutilisation gratuite/non commerciale ?), format, quotas, attribution exigée.
3. Si refus ou silence : lien sortant « Voir les indicateurs de ta commune » seulement, sans reprise de données.
