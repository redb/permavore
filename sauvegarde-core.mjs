/* =========================================================================
   Permavore — noyau de sauvegarde (pur : ni DOM, ni IndexedDB, ni réseau)

   Principe : LE JARDIN APPARTIENT AU JARDINIER. Une mise à jour de Permavore
   ne doit jamais pouvoir faire disparaître un jardin en silence.

   Ce module contient tout ce qui peut être testé sans navigateur : la forme
   de l'export, sa validation, les migrations de schéma et la comparaison
   avant/après restauration. L'adaptateur IndexedDB (stockage.js) reste mince
   et ne décide de rien.

   Deux versions distinctes, qu'il ne faut pas confondre :
     SCHEMA_VERSION  version des données STOCKÉES localement ;
     FORMAT_VERSION  version du FICHIER d'export remis au jardinier.
   Un fichier exporté doit rester lisible par des versions ultérieures, et
   compréhensible même sans Permavore.
   ========================================================================= */

export const SCHEMA_VERSION = 1;
export const FORMAT_VERSION = 1;

/*
   Ce qui appartient au jardinier, et doit donc survivre à tout.
   `metier: true` = donnée du jardin, à sauvegarder et à restaurer.
   `metier: false` = confort local (langue, caches) : ni exporté, ni restauré.
*/
export const CLES_JARDIN = {
  "permavore.instances.v1":    { nom: "instances",   metier: true,  type: "array" },
  "permavore.zones.v1":        { nom: "zones",       metier: true,  type: "array" },
  "permavore.occupations.v1":  { nom: "occupations", metier: true,  type: "array" },
  "permavore.plan":            { nom: "plan",        metier: true,  type: "object" },
  "permavore.plantes":         { nom: "cultures",    metier: true,  type: "array" },
  "permavore.ressources":      { nom: "ressources",  metier: true,  type: "any" },
  "permavore.jardin.v1":       { nom: "preferences", metier: true,  type: "object" },
  "permavore.dates.v1":        { nom: "dates",       metier: true,  type: "object" },
  "permavore.adoptees":        { nom: "adoptees",    metier: true,  type: "array" },
  "permavore.seedRequests.v1": { nom: "demandesGraines", metier: true, type: "array" },
  // Confort local : reconstructible, donc jamais exporté ni restauré.
  "permavore.lang":         { nom: "langue",       metier: false },
  "permavore.photos.v1":    { nom: "cachePhotos",  metier: false },
  // Reliquat : le cache climatique vit désormais dans IndexedDB (magasin
  // « climat »). La clé reste listée pour être purgée, jamais exportée.
  "permavore.climat.v2":    { nom: "cacheClimatObsolete", metier: false, obsolete: true },
  "permavore.enraciner.vu": { nom: "aideVue",      metier: false },
  // Reçu de la dernière restauration : sert à confirmer au jardinier, APRÈS le
  // rechargement, que son jardin est bien revenu. Jetable, jamais exporté.
  "permavore.restauration.v1": { nom: "recuRestauration", metier: false },
};

export const clesMetier = () =>
  Object.entries(CLES_JARDIN).filter(([, v]) => v.metier).map(([k]) => k);

/** Clés devenues inutiles, à purger sans rien demander : ce sont des caches. */
export const clesObsoletes = () =>
  Object.entries(CLES_JARDIN).filter(([, v]) => v.obsolete).map(([k]) => k);

const analyser = (brut) => {
  if (brut === null || brut === undefined) return undefined;
  try { return JSON.parse(brut); } catch { return brut; }
};

/**
 * Normalise un ensemble de valeurs brutes (telles que stockées) en un état de
 * jardin exploitable. Les valeurs illisibles sont CONSERVÉES telles quelles
 * plutôt que jetées : mieux vaut un fichier avec une anomalie qu'une donnée
 * perdue en silence.
 */
export function etatDepuisBrut(brut = {}) {
  const etat = { schemaVersion: SCHEMA_VERSION, donnees: {}, anomalies: [] };
  for (const cle of clesMetier()) {
    if (!(cle in brut) || brut[cle] === null || brut[cle] === undefined) continue;
    const valeur = analyser(brut[cle]);
    const attendu = CLES_JARDIN[cle].type;
    const conforme = attendu === "any"
      || (attendu === "array" && Array.isArray(valeur))
      || (attendu === "object" && valeur && typeof valeur === "object" && !Array.isArray(valeur));
    if (!conforme) etat.anomalies.push({ cle, attendu, recu: Array.isArray(valeur) ? "array" : typeof valeur });
    etat.donnees[cle] = valeur;
  }
  return etat;
}

/* ---------- échecs d'écriture ------------------------------------------- */

/*
   Une écriture qui échoue sur une donnée du jardinier ne doit JAMAIS être
   silencieuse : lui laisser croire que son jardin est sauvegardé alors que
   l'écriture a échoué est la pire issue possible. À l'inverse, un cache qui
   n'arrive pas à s'écrire n'intéresse personne.
*/

/** Une clé porte-t-elle une donnée souveraine (classe A) ? */
export function estSouveraine(cle) {
  if (cle === "sachets") return true;          // photos prises par le jardinier
  return !!CLES_JARDIN[cle]?.metier;
}

/**
 * Classe un échec d'écriture. `souveraine` décide si l'utilisateur doit être
 * averti ; `cause` sert au journal technique, jamais à l'affichage brut.
 */
export function classerEchecEcriture(cle, erreur) {
  const nom = erreur && (erreur.name || erreur.constructor?.name) || "Error";
  const quota = nom === "QuotaExceededError"
    || /quota/i.test(String(erreur && erreur.message))
    || nom === "NS_ERROR_DOM_QUOTA_REACHED";
  return {
    cle,
    souveraine: estSouveraine(cle),
    quota,
    cause: nom,
    message: String((erreur && erreur.message) || "").slice(0, 200),
    // Un quota dépassé se règle en exportant puis en faisant de la place ;
    // une autre panne d'écriture se règle en exportant aussi, faute de mieux.
    proposerExport: estSouveraine(cle),
  };
}

/* ---------- migrations de schéma ---------------------------------------- */

/*
   Chaque migration est versionnée, déterministe et NON DESTRUCTIVE : elle
   reçoit un état et en renvoie un nouveau, sans jamais supprimer la donnée
   d'origine avant que sa conversion n'ait été vérifiée. Une migration qui
   échoue laisse l'état précédent intact — on ne repart jamais d'un jardin vide.
*/
export const MIGRATIONS = [
  {
    version: 1,
    description: "Passage du stockage par clés localStorage à un état versionné",
    appliquer: (etat) => ({ ...etat, schemaVersion: 1 }),
    // Vérification post-migration : si elle échoue, on garde l'ancien état.
    verifier: (avant, apres) => {
      const cles = clesMetier().filter(c => c in (avant.donnees || {}));
      return cles.every(c => c in (apres.donnees || {}));
    },
  },
];

/**
 * Applique les migrations manquantes. Renvoie
 * { etat, migrationsAppliquees, echec, raison }.
 * En cas d'échec, `etat` est l'état d'ORIGINE, jamais un état partiel.
 */
export function migrer(etat, cible = SCHEMA_VERSION) {
  if (!etat || typeof etat !== "object") {
    return { etat, migrationsAppliquees: [], echec: true, raison: "etat_invalide" };
  }
  let courant = etat;
  const appliquees = [];
  for (const m of MIGRATIONS) {
    if ((courant.schemaVersion || 0) >= m.version || m.version > cible) continue;
    let suivant;
    try { suivant = m.appliquer(courant); }
    catch (e) {
      return { etat, migrationsAppliquees: appliquees, echec: true,
        raison: `migration_${m.version}_exception`, message: e && e.message };
    }
    if (typeof m.verifier === "function" && !m.verifier(courant, suivant)) {
      // La conversion n'est pas vérifiée : on ne remplace rien.
      return { etat, migrationsAppliquees: appliquees, echec: true,
        raison: `migration_${m.version}_non_verifiee` };
    }
    courant = suivant;
    appliquees.push(m.version);
  }
  // Une base plus récente que le code : on ne la rétrograde pas, on la laisse.
  if ((courant.schemaVersion || 0) > cible) {
    return { etat: courant, migrationsAppliquees: appliquees, echec: false,
      raison: "schema_plus_recent" };
  }
  return { etat: courant, migrationsAppliquees: appliquees, echec: false };
}

/* ---------- export ------------------------------------------------------ */

/**
 * Fichier d'export. Format ouvert, UTF-8, documenté par lui-même : il doit
 * rester compréhensible sans Permavore. Aucun secret, aucun jeton, aucune clé.
 */
export function construireExport(etat, meta = {}) {
  const donnees = etat?.donnees || {};
  const bloc = (cle) => (cle in donnees ? donnees[cle] : null);
  return {
    format: "permavore",
    formatVersion: FORMAT_VERSION,
    schemaVersion: etat?.schemaVersion ?? SCHEMA_VERSION,
    exportedAt: meta.exportedAt || new Date().toISOString(),
    appVersion: meta.appVersion || null,
    aPropos: "Sauvegarde d'un jardin Permavore. Fichier JSON UTF-8, lisible sans l'application. Il ne contient aucune donnée technique, aucun identifiant de connexion et aucune clé.",
    garden: {
      preferences: bloc("permavore.jardin.v1"),
      plan: bloc("permavore.plan"),
    },
    cultures: bloc("permavore.plantes"),
    instances: bloc("permavore.instances.v1"),
    zones: bloc("permavore.zones.v1"),
    occupations: bloc("permavore.occupations.v1"),
    dates: bloc("permavore.dates.v1"),
    adoptees: bloc("permavore.adoptees"),
    ressources: bloc("permavore.ressources"),
    demandesGraines: bloc("permavore.seedRequests.v1"),
    journal: Array.isArray(meta.journal) ? meta.journal : [],
    // Photos prises par le jardinier : irremplaçables, donc exportées.
    sachets: Array.isArray(meta.sachets) ? meta.sachets : [],
  };
}

/** Chemin inverse : d'un fichier d'export vers un état stockable. */
export function etatDepuisExport(fichier) {
  const d = {};
  const poser = (cle, valeur) => { if (valeur !== null && valeur !== undefined) d[cle] = valeur; };
  poser("permavore.jardin.v1", fichier?.garden?.preferences);
  poser("permavore.plan", fichier?.garden?.plan);
  poser("permavore.plantes", fichier?.cultures);
  poser("permavore.instances.v1", fichier?.instances);
  poser("permavore.zones.v1", fichier?.zones);
  poser("permavore.occupations.v1", fichier?.occupations);
  poser("permavore.dates.v1", fichier?.dates);
  poser("permavore.adoptees", fichier?.adoptees);
  poser("permavore.ressources", fichier?.ressources);
  poser("permavore.seedRequests.v1", fichier?.demandesGraines);
  return { schemaVersion: fichier?.schemaVersion ?? SCHEMA_VERSION, donnees: d, anomalies: [] };
}

/* ---------- validation d'un fichier reçu -------------------------------- */

/**
 * Valide un fichier avant toute restauration. Refuse proprement, sans jamais
 * toucher au jardin existant. Un fichier d'une version FUTURE n'est pas rejeté :
 * il est accepté avec réserve, en ne reprenant que ce qui est compris — perdre
 * une nouveauté vaut mieux que refuser de rendre son jardin à quelqu'un.
 */
export function validerExport(fichier) {
  const erreurs = [], reserves = [];
  if (!fichier || typeof fichier !== "object" || Array.isArray(fichier)) {
    return { valide: false, erreurs: ["fichier_illisible"], reserves, resume: null };
  }
  if (fichier.format !== "permavore") erreurs.push("format_inconnu");
  const version = Number(fichier.formatVersion);
  if (!Number.isFinite(version) || version < 1) erreurs.push("version_absente");
  else if (version > FORMAT_VERSION) reserves.push("version_plus_recente");

  // Un fichier invalide peut contenir n'importe quoi à la place d'un tableau :
  // la validation doit l'encaisser, pas s'y casser.
  const tableau = (v) => (Array.isArray(v) ? v : []);
  const estTableau = (v, nom) => {
    if (v === null || v === undefined) return true;
    if (!Array.isArray(v)) { erreurs.push(`${nom}_invalide`); return false; }
    return true;
  };
  estTableau(fichier.instances, "instances");
  estTableau(fichier.zones, "zones");
  estTableau(fichier.occupations, "occupations");
  estTableau(fichier.cultures, "cultures");

  if (Array.isArray(fichier.instances)) {
    const mauvaises = fichier.instances.filter(i => !i || !i.cultureId).length;
    if (mauvaises) reserves.push(`instances_incompletes:${mauvaises}`);
  }

  // L'aperçu ne montre QUE ce que le fichier contient réellement : un champ
  // absent reste absent, il n'est pas remplacé par un zéro rassurant.
  const prefs = fichier.garden?.preferences || null;
  const cultures = new Set(tableau(fichier.instances).map(i => i && i.cultureId).filter(Boolean));
  const resume = {
    lieu: (prefs && typeof prefs.ville === "string" && prefs.ville.trim()) || null,
    surface: prefs && Number.isFinite(Number(prefs.surface)) ? Number(prefs.surface) : null,
    instances: tableau(fichier.instances).length,
    culturesDistinctes: cultures.size,
    zones: tableau(fichier.zones).length,
    occupations: tableau(fichier.occupations).length,
    cultures: tableau(fichier.cultures).length,
    photos: tableau(fichier.sachets).length,
    ressources: fichier.ressources ? "présentes" : "absentes",
    plan: fichier.garden?.plan ? "présent" : "absent",
    preferences: prefs ? "présentes" : "absentes",
    exportedAt: fichier.exportedAt || null,
    formatVersion: fichier.formatVersion ?? null,
  };
  return { valide: erreurs.length === 0, erreurs, reserves, resume };
}

/* ---------- reçu de restauration ----------------------------------------- */

/**
 * Ce qu'on affiche au jardinier après une restauration. Les nombres sont RELUS
 * dans l'état effectivement écrit, pas recopiés du fichier : le reçu doit
 * attester de ce qui est là, pas de ce qu'on espérait y mettre.
 */
export function recuRestauration(etatRestaure, options = {}) {
  const d = etatRestaure?.donnees || {};
  const liste = (cle) => (Array.isArray(d[cle]) ? d[cle] : []);
  const prefs = d["permavore.jardin.v1"] || null;
  return {
    quand: new Date().toISOString(),
    verifie: options.verifie !== false,
    lieu: (prefs && typeof prefs.ville === "string" && prefs.ville.trim()) || null,
    instances: liste("permavore.instances.v1").length,
    zones: liste("permavore.zones.v1").length,
    occupations: liste("permavore.occupations.v1").length,
    photos: Number.isFinite(options.photos) ? options.photos : 0,
    sauvegardeDu: options.sauvegardeDu || null,
  };
}

/* ---------- comparaison avant / après ----------------------------------- */

const trier = (v) => {
  if (Array.isArray(v)) return v.map(trier);
  if (v && typeof v === "object") {
    return Object.keys(v).sort().reduce((acc, k) => { acc[k] = trier(v[k]); return acc; }, {});
  }
  return v;
};

/**
 * Deux jardins sont-ils fonctionnellement identiques ? On compare les données
 * métier après normalisation, en ignorant l'ordre des clés. Les horodatages de
 * dernière modification ne sont pas comparés : ils changent sans que le jardin
 * change.
 */
export function comparerJardins(avant, apres) {
  const differences = [];
  const nettoyer = (v) => {
    const copie = trier(v);
    const retirerMaj = (x) => {
      if (Array.isArray(x)) return x.map(retirerMaj);
      if (x && typeof x === "object") {
        const { maj, ...reste } = x;
        return Object.fromEntries(Object.entries(reste).map(([k, y]) => [k, retirerMaj(y)]));
      }
      return x;
    };
    return retirerMaj(copie);
  };
  for (const cle of clesMetier()) {
    const a = nettoyer(avant?.donnees?.[cle] ?? null);
    const b = nettoyer(apres?.donnees?.[cle] ?? null);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      differences.push({ cle, nom: CLES_JARDIN[cle].nom });
    }
  }
  return { identique: differences.length === 0, differences };
}

/* ---------- journal des modifications ----------------------------------- */

/**
 * Entrée de journal, en vue d'une synchronisation incrémentale : on doit
 * pouvoir savoir QUOI a changé sans renvoyer tout le jardin.
 */
export function entreeJournal(entityType, entityId, operation, version = 1) {
  return { entityType, entityId, operation, version, timestamp: new Date().toISOString() };
}

/* ---------- abstraction de synchronisation ------------------------------ */

/*
   États de synchronisation. Règle : on n'affiche JAMAIS « Synchronisé » sans
   qu'une sauvegarde distante ait été réellement confirmée. Tant qu'aucun
   fournisseur n'est branché, l'état reste LOCAL_ONLY — ce qui est la vérité.
*/
export const ETATS_SYNC = {
  LOCAL_ONLY: "LOCAL_ONLY",
  PENDING_SYNC: "PENDING_SYNC",
  SYNCING: "SYNCING",
  SYNCED: "SYNCED",
  SYNC_ERROR: "SYNC_ERROR",
};

/**
 * Contrat qu'un futur fournisseur devra remplir. Aucun fournisseur n'est choisi
 * aujourd'hui : l'application doit fonctionner entièrement sans.
 */
export function creerSyncProvider(implementation = null) {
  if (!implementation) {
    return {
      disponible: false,
      etat: () => ETATS_SYNC.LOCAL_ONLY,
      pousser: async () => ({ ok: false, raison: "aucun_fournisseur" }),
      tirer: async () => ({ ok: false, raison: "aucun_fournisseur" }),
      resoudreConflit: null,
    };
  }
  return {
    disponible: true,
    etat: implementation.etat,
    pousser: implementation.pousser,
    tirer: implementation.tirer,
    /*
       Stratégie de conflit : jamais « le serveur gagne » aveuglément. À version
       égale on garde la version locale la plus récente ; en cas de divergence
       réelle, on conserve les deux et on demande — on ne supprime pas une
       modification locale plus récente sans le dire.
    */
    resoudreConflit: implementation.resoudreConflit || ((local, distant) => {
      if (!distant) return { choix: "local", raison: "distant_absent" };
      if (!local) return { choix: "distant", raison: "local_absent" };
      const tl = Date.parse(local.updatedAt || 0), td = Date.parse(distant.updatedAt || 0);
      if (Number.isFinite(tl) && Number.isFinite(td) && tl !== td) {
        return { choix: tl > td ? "local" : "distant", raison: "plus_recent" };
      }
      return { choix: "conserver_les_deux", raison: "conflit_non_resolu" };
    }),
  };
}
