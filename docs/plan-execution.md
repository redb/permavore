# Permavore — Plan d’exécution

## État initial vérifié

Le site public est une application statique sans framework. Le dossier de travail
fourni ne contient toutefois pas le dépôt source, son historique Git, sa
configuration Cloudflare ni ses secrets de développement. Il n’est donc pas
possible d’implémenter ou de déployer de façon sûre dans le vrai projet à partir
de ce dossier seul.

## Lot 0 — Rattacher le vrai dépôt

Livrables :

- dépôt Git Permavore disponible dans le workspace ;
- branche `feat/seed-network-foundation` ;
- inventaire des fichiers, dépendances et pipeline ;
- sauvegarde ou tag de la version actuellement déployée ;
- environnement preview Cloudflare distinct de la production.

Critères de sortie :

- build reproductible ;
- tests ou smoke test du moteur actuel ;
- preview identique fonctionnellement à `permavore.pages.dev` ;
- aucun fichier synchronisé sous `sources/` modifié.

## Lot 1 — Stabiliser l’existant

Objectif : rendre le moteur actuel testable avant d’ajouter le réseau.

- introduire Vite + TypeScript sans changer l’interface ;
- extraire catalogue, calendrier, climat et densité en modules ;
- valider le catalogue avec Zod au démarrage ;
- ajouter tests unitaires du moteur ;
- encapsuler géocodage, timeout et fallback ;
- centraliser config et variables d’environnement ;
- ajouter logs structurés pour les erreurs applicatives.

Critères :

- mêmes 41 plantes et mêmes résultats sur un jeu de cas figé ;
- aucune régression mobile ;
- géocodage limité à 5 secondes ;
- build, lint, tests et audit d’accessibilité passent.

Commit proposé :

`refactor(recommendations): modularize and validate plant engine`

## Lot 2 — Socle réseau en lecture seule

- migrations D1 : plantes, variétés, protocoles, lignées, lots, offres ;
- seed de trois variétés pilotes sourcées ;
- API publique paginée ;
- client API borné avec cache et fallback ;
- route `/plantes/:slug/semences` ;
- disponibilité ajoutée aux fiches existantes derrière un feature flag.

Critères :

- moteur actuel utilisable sans D1 ;
- aucun contenu botanique non sourcé ;
- p95 de lecture mesuré en preview ;
- absence d’adresse ou donnée privée dans les réponses publiques.

Commit proposé :

`feat(seed-network): add read-only varieties and lineage catalog`

## Lot 3 — Comptes Primavore

- provider d’authentification choisi par ADR ;
- inscription et connexion ;
- profil public minimal ;
- profil privé et adresse chiffrée ;
- consentement, export et suppression ;
- Turnstile et rate limiting.

Critères :

- contrôle d’accès testé ;
- sessions révocables ;
- aucun secret dans le client ou les logs ;
- suppression réversible pendant une période de grâce définie.

Commit proposé :

`feat(auth): add secure Primavore accounts and profiles`

## Lot 4 — Offres et demandes

- créer, suspendre et expirer une offre ;
- demander une variété ;
- matching simple par pays, zone et disponibilité ;
- accepter ou refuser ;
- révéler l’adresse uniquement après acceptation ;
- idempotence sur toutes les mutations.

Critères :

- aucune double allocation du dernier lot ;
- limites journalières testées ;
- fallback clair si aucun lot n’est disponible ;
- erreurs utilisateur récupérables.

Commit proposé :

`feat(seed-exchange): add offers requests and private matching`

## Lot 5 — Transmissions, Racines et lignées

- machine d’état serveur ;
- journal append-only ;
- création du lot enfant à réception ;
- relation Racine créée à réception, jamais à l’inscription ;
- arbre de lignée paginé ;
- rappels non bloquants.

Critères :

- transitions illégales rejetées ;
- événements concurrents idempotents ;
- lignée reconstruisible depuis le journal ;
- aucune graine ni relation inventée par le système.

Commit proposé :

`feat(lineages): track verified peer-to-peer seed transmissions`

## Lot 6 — Qualité et réputation

- protocoles sourcés ;
- déclaration récolte, isolement et germination ;
- quarantaine et signalement ;
- évaluations post-transmission ;
- réputation factuelle et explicable ;
- interface de modération.

Critères :

- taux de germination impossible sans taille d’échantillon ;
- alertes d’hybridation propagées à la lignée ;
- sanctions manuelles auditées ;
- pas de score opaque.

Commit proposé :

`feat(quality): enforce sourced protocols and transparent reputation`

## Lot 7 — Dons

- provider de paiement sélectionné par ADR ;
- checkout ponctuel ;
- webhook signé et idempotent ;
- reçu et statuts ;
- page de transparence ;
- aucun avantage réseau lié au montant.

Critères :

- tests des événements doublés et désordonnés ;
- échec du provider sans blocage du réseau ;
- aucun stockage de donnée de carte.

Commit proposé :

`feat(donations): add optional funding with resilient webhooks`

## Lot 8 — Pilote et déploiement

- feature flag par compte ;
- 20 à 50 Primavores pilotes ;
- trois groupes botaniques maximum ;
- preview, canary, puis activation progressive ;
- sauvegarde D1 et procédure de retour arrière ;
- tableaux de bord d’erreurs et runbooks.

Critères :

- zéro incident critique de vie privée ;
- taux de transmissions bloquées suivi ;
- revue qualité hebdomadaire ;
- rollback documenté et testé ;
- activation publique soumise à décision explicite.

Commit proposé :

`chore(release): prepare seed network pilot rollout`

## Stratégie de pull requests

Une PR par lot, limitée et réversible :

1. contexte et décision ;
2. périmètre et hors périmètre ;
3. migrations et compatibilité ;
4. sécurité et données personnelles ;
5. tests exécutés ;
6. captures desktop/mobile ;
7. métriques et logs ;
8. procédure de rollback ;
9. checklist de déploiement.

Les migrations destructrices, la production et l’activation publique exigent un
accord explicite.

## Prochaine action bloquante

Fournir le chemin local du vrai dépôt Permavore ou le connecter à ce workspace.
Le lot 0 pourra alors être exécuté sans reconstruire un faux dépôt depuis les
fichiers publics minifiés ou perdre l’historique de déploiement.
