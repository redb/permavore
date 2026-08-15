# Permavore — Architecture du réseau pair-à-pair de semences

Statut : proposition d’architecture initiale  
Date : 2026-07-25

## 1. Décision d’architecture

Conserver le moteur actuel de recommandations comme un domaine autonome et ajouter
un second domaine, « Réseau de semences », derrière les fiches plantes.

L’application publiée est actuellement une application statique en HTML, CSS et
JavaScript. Elle contient :

- un catalogue local de 41 plantes ;
- un moteur de recommandation par climat, période, surface et catégorie ;
- un potager local sauvegardé dans `localStorage` ;
- une fiche plante ouverte dans une modale ;
- un lien « Où trouver graines / plants », éventuellement partenaire ;
- des appels directs à l’API Adresse avec un timeout de 5 secondes.

La première version du réseau ne doit pas remplacer ces fonctions. Le bouton de la
fiche devient un point d’entrée vers une nouvelle route :

`/plantes/:plantSlug/semences`

Cette route affiche les lignées et lots disponibles pour la plante, puis permet de
proposer ou demander des graines après connexion.

## 2. Architecture cible

### Frontend

- Vite + TypeScript, en conservant les écrans et styles actuels.
- Modules fonctionnels sans framework pour la première migration.
- Validation Zod partagée entre formulaires et API.
- Progressive enhancement : le moteur de recommandation reste utilisable si
  l’API du réseau est indisponible.
- Cache local en lecture seule des fiches plante et des disponibilités récentes.

### Backend

- Cloudflare Pages Functions pour l’API HTTP.
- Cloudflare D1 pour les données relationnelles.
- Cloudflare R2 uniquement à partir du lot qui ajoute les photos de preuve.
- Cloudflare Turnstile sur inscription, demande, offre et don.
- Provider d’authentification compatible Workers, isolé derrière un adaptateur.
- Provider de paiement/don isolé derrière un adaptateur ; aucun paiement ne
  conditionne l’accès aux graines.

### Principes

- Les graines circulent directement entre Primavores.
- Permavore ne possède, ne stocke et n’expédie aucun lot.
- Une plante du moteur n’est pas une variété. Une plante peut référencer plusieurs
  variétés reproductibles.
- Une variété possède des lignées.
- Une lignée possède des lots successifs.
- Une transmission relie exactement un lot parent à un nouveau lot enfant.
- L’adresse postale n’est jamais publique et n’est révélée qu’après acceptation.
- Aucun calcul de réputation n’est modifiable directement par un membre.

## 3. Structure de fichiers proposée

```text
/
├── docs/
│   ├── architecture-transmission-semences.md
│   ├── api.md
│   ├── quality-rules.md
│   └── runbooks/
├── migrations/
│   ├── 0001_network_core.sql
│   └── 0002_audit_and_donations.sql
├── public/
│   └── assets/
├── src/
│   ├── app/
│   │   ├── bootstrap.ts
│   │   └── routes.ts
│   ├── config/
│   │   ├── env.ts
│   │   └── feature-flags.ts
│   ├── domains/
│   │   ├── recommendations/
│   │   │   ├── recommendation-engine.ts
│   │   │   ├── plant-catalog.ts
│   │   │   └── recommendation-engine.test.ts
│   │   ├── seeds/
│   │   │   ├── seed-schemas.ts
│   │   │   ├── seed-service.ts
│   │   │   └── seed-types.ts
│   │   ├── transmissions/
│   │   │   ├── transmission-machine.ts
│   │   │   └── transmission-machine.test.ts
│   │   └── reputation/
│   │       ├── reputation-policy.ts
│   │       └── reputation-policy.test.ts
│   ├── pages/
│   │   ├── plant-seeds-page.ts
│   │   ├── dashboard-page.ts
│   │   ├── lineage-page.ts
│   │   └── profile-page.ts
│   ├── shared/
│   │   ├── api-client.ts
│   │   ├── errors.ts
│   │   ├── logger.ts
│   │   ├── retry.ts
│   │   └── timeout.ts
│   └── styles/
├── functions/
│   ├── api/
│   │   ├── auth/
│   │   ├── plants/
│   │   ├── varieties/
│   │   ├── offers/
│   │   ├── requests/
│   │   ├── transmissions/
│   │   ├── profiles/
│   │   └── donations/
│   └── _middleware.ts
├── tests/
│   ├── integration/
│   ├── contract/
│   └── e2e/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── wrangler.toml
```

## 4. Modèle de données

### Identité

`users`

- `id`, identifiant opaque ;
- `handle`, public et unique ;
- `display_name` ;
- `email_hash`, pour unicité sans exposition ;
- `status` : `pending`, `active`, `suspended`, `deleted` ;
- `created_at`, `updated_at`.

`profiles`

- `user_id` ;
- `bio` ;
- `country_code` ;
- `region_code` ;
- `location_precision` : région ou département seulement ;
- `experience_level` ;
- `public_stats_enabled`.

`private_addresses`

- `user_id` ;
- adresse chiffrée applicativement ;
- version de clé ;
- jamais retournée par les endpoints publics.

### Catalogue botanique

`plants`

- correspond à la plante générique du moteur existant ;
- `legacy_id` conserve l’identifiant actuel ;
- `slug`, `name`, `scientific_name`.

`varieties`

- `plant_id` ;
- `name`, `slug` ;
- `reproducible` ;
- `status` : `draft`, `verified`, `disputed`, `archived` ;
- `source_url` obligatoire ;
- `quality_protocol_id`.

`quality_protocols`

- espèce ou groupe concerné ;
- difficulté 1 à 3 ;
- population minimale ;
- distance ou méthode d’isolement ;
- cycle annuel ou bisannuel ;
- durée de conservation indicative ;
- sources datées.

### Réseau

`lineages`

- `variety_id` ;
- `root_lot_id` ;
- `status` : `active`, `at_risk`, `paused`, `closed` ;
- `created_by`.

`seed_lots`

- `lineage_id` ;
- `custodian_user_id` ;
- `parent_lot_id`, nullable seulement pour la racine ;
- année et zone de récolte ;
- quantité déclarée sous forme de classe, pas de comptage précis obligatoire ;
- taux de germination et taille d’échantillon ;
- risque d’hybridation déclaré ;
- statut qualité ;
- nombre maximal de transmissions ouvertes.

`offers`

- `lot_id`, `owner_user_id` ;
- nombre de lots disponibles ;
- pays et zone d’expédition ;
- statut et date d’expiration.

`seed_requests`

- `requester_user_id`, `variety_id` ;
- offre ciblée facultative ;
- motivation courte ;
- pays et zone ;
- statut ;
- clé d’idempotence.

`sponsorship_edges`

- relation « Racine » entre le transmetteur et le receveur ;
- créée uniquement après réception confirmée ;
- liée à une transmission réelle, jamais à une simple inscription.

`transmissions`

- `offer_id`, `request_id`, `sender_user_id`, `receiver_user_id` ;
- `parent_lot_id`, `child_lot_id` ;
- machine d’état :
  `requested → accepted → address_shared → sent → received → cultivated → harvested`;
- sorties terminales :
  `declined`, `cancelled`, `lost`, `failed_quality`, `disputed`.

`transmission_events`

- journal append-only des changements d’état ;
- acteur, date, ancien état, nouvel état, motif ;
- métadonnées bornées et sans adresse.

### Confiance et financement

`reviews`

- une évaluation par participant et par transmission terminée ;
- critères factuels : communication, conformité, réception ;
- commentaire modéré.

`reputation_snapshots`

- score dérivé versionné ;
- détails publics limités à des compteurs explicables ;
- aucun score opaque utilisé comme sanction automatique.

`donations`

- identifiant du provider ;
- montant, devise, statut ;
- utilisateur facultatif ;
- aucune contrepartie en graines ou en réputation.

`audit_log`

- actions sensibles des modérateurs et mutations critiques ;
- rétention définie et accès restreint.

## 5. API v1

Toutes les mutations exigent authentification, validation Zod, clé d’idempotence
et protection CSRF. Les listes utilisent une pagination par curseur.

```text
GET    /api/v1/plants/:plantSlug/varieties
GET    /api/v1/varieties/:slug
GET    /api/v1/varieties/:slug/lineages
GET    /api/v1/lineages/:id

POST   /api/v1/offers
GET    /api/v1/offers/mine
PATCH  /api/v1/offers/:id

POST   /api/v1/requests
GET    /api/v1/requests/mine
POST   /api/v1/requests/:id/accept
POST   /api/v1/requests/:id/decline

GET    /api/v1/transmissions/mine
POST   /api/v1/transmissions/:id/events
POST   /api/v1/transmissions/:id/review

GET    /api/v1/profiles/:handle
PATCH  /api/v1/profile

POST   /api/v1/donations/checkout
POST   /api/v1/webhooks/donations
```

Réponse d’erreur stable :

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "La demande est invalide.",
    "requestId": "req_opaque",
    "fields": {}
  }
}
```

## 6. Écrans

### Extension de la fiche plante actuelle

- conserver le contenu de recommandation ;
- remplacer le lien unique par deux actions distinctes :
  - « Recevoir des graines entre jardiniers » ;
  - « Acheter auprès d’un partenaire » en repli explicite ;
- afficher un état non bloquant : disponibilité, chargement, indisponibilité ;
- ne jamais masquer le lien partenaire si aucune offre n’existe.

### Route plante → semences

- liste de variétés reproductibles ;
- nombre d’offres actives par zone ;
- niveau de difficulté de reproduction ;
- accès au protocole qualité sourcé ;
- demande de graines.

### Tableau de bord Primavore

- actions requises en premier ;
- offres actives ;
- demandes reçues et envoyées ;
- transmissions en cours ;
- récoltes à déclarer ;
- alertes qualité.

### Lignée

- arbre borné et paginé ;
- lots, régions approximatives et générations ;
- événements qualité ;
- aucune adresse ni position précise.

### Profil public

- contributions vérifiées ;
- variétés maintenues ;
- transmissions reçues et terminées ;
- indicateurs factuels ;
- bouton de signalement.

### Don

- page indépendante ;
- explication des coûts couverts ;
- don ponctuel ;
- reçu du provider ;
- échec ou annulation sans effet sur les graines.

## 7. Règles de qualité

- N’accepter que des variétés reproductibles et documentées par une source.
- Bloquer l’offre si le protocole de l’espèce n’est pas publié.
- Exiger année de récolte, zone approximative, méthode et risque d’hybridation.
- Afficher une mention « données déclaratives » tant qu’aucun test n’est vérifié.
- Exiger taille d’échantillon avec tout taux de germination.
- Ne pas fusionner automatiquement deux lignées homonymes.
- Placer en quarantaine une lignée signalée pour hybridation.
- Conserver l’historique ; corriger par nouvel événement, pas par effacement.
- Démarrer le pilote avec tomate, haricot et pois, après validation experte des
  protocoles. Ne pas ouvrir immédiatement courges, choux, carottes ou betteraves.

## 8. Sécurité et vie privée

- Rate limiting par IP pseudonymisée, compte et action.
- Limites initiales configurables :
  - lecture publique : 120 requêtes/minute ;
  - mutations : 20/minute ;
  - demandes de graines : 5/jour ;
  - messages ou changements d’état : 30/heure.
- Timeout API interne : 3 secondes ; provider externe : 5 secondes.
- Deux retries maximum, seulement sur erreurs transitoires et opérations
  idempotentes, avec jitter.
- Corps JSON limité à 32 Ko ; images via URL signée et taille/type contrôlés.
- CSP stricte, HSTS, cookies `Secure`, `HttpOnly`, `SameSite=Lax`.
- Turnstile sur les actions exposées aux abus.
- Adresse chiffrée, accès journalisé, suppression après la fenêtre nécessaire.
- Blocage des identifiants séquentiels dans les URL.
- Autorisation contrôlée côté serveur sur chaque ressource.
- Webhooks signés, horodatés et idempotents.
- Logs JSON structurés : `requestId`, route, statut, durée, acteur opaque,
  code d’erreur ; jamais d’adresse, email, token ou contenu privé.

## 9. Cache, timeouts et fallback

- Catalogue botanique : cache public versionné, 24 heures.
- Disponibilités : cache 60 secondes avec `stale-while-revalidate`.
- Profil public : cache 5 minutes, invalidé après événement confirmé.
- Tableau de bord privé : `no-store`.
- Client API : timeout 4 secondes, un retry maximum pour les lectures.
- Si l’API réseau échoue :
  - le moteur de recommandations continue ;
  - la fiche affiche « Réseau temporairement indisponible » ;
  - le lien partenaire reste accessible ;
  - une action utilisateur n’est jamais perdue silencieusement.

## 10. Observabilité

- Logs JSON structurés et corrélés par `requestId`.
- Mesures : taux d’erreur, latence p95, demandes sans offre, délais d’acceptation,
  transmissions bloquées par état, litiges, webhooks en échec.
- Alertes sur hausse des erreurs d’authentification, abus, erreurs D1 et webhooks.
- Runbooks pour indisponibilité D1, provider d’authentification et provider de don.

## 11. Limites de la V1

- France métropolitaine uniquement.
- Trois groupes botaniques pilotes maximum.
- Pas de messagerie libre ; messages transactionnels structurés.
- Pas d’étiquette d’expédition payée par Permavore.
- Pas de carte précise.
- Pas de monnaie interne.
- Pas d’IA. Les contenus botaniques doivent être sourcés et validés humainement.
- Pas de score de réputation global opaque.

## 12. Risques architecturaux

1. Confondre plante générique et variété détruirait la traçabilité.
2. Une arborescence de parrainage sans transmission réelle deviendrait un mécanisme
   de recrutement et non de conservation.
3. Une adresse exposée trop tôt créerait un risque de vie privée majeur.
4. Un lancement multi-espèces sans protocoles fiables diffuserait des graines
   potentiellement hybridées ou non conformes.
5. Un backend ajouté directement dans le fichier JavaScript actuel deviendrait
   rapidement non testable. La migration TypeScript modulaire est un préalable.

