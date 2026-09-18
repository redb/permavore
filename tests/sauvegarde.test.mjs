import test from "node:test";
import assert from "node:assert/strict";
import {
  SCHEMA_VERSION, FORMAT_VERSION, CLES_JARDIN, clesMetier,
  etatDepuisBrut, migrer, MIGRATIONS, construireExport, etatDepuisExport,
  validerExport, comparerJardins, entreeJournal, creerSyncProvider, ETATS_SYNC,
  classerEchecEcriture, estSouveraine,
} from "../sauvegarde-core.mjs";

/* Un jardin volontairement complexe, celui du test de non-perte :
   pommier déjà présent, tomates plantées, radis semés, une zone, une
   ressource et des préférences. */
function jardinComplexe() {
  return {
    "permavore.instances.v1": JSON.stringify([
      { id: "i1", cultureId: "pommier", etat: "dejaPresent", zoneId: "z1",
        depuis: { precision: "inconnue", valeur: null }, environnement: null,
        cree: "2026-09-17T08:00:00.000Z", maj: "2026-09-17T08:00:00.000Z" },
      { id: "i2", cultureId: "tomate", etat: "plante", zoneId: "z1",
        depuis: { precision: "mois", valeur: "2026-05" }, surface: 2,
        cree: "2026-09-17T08:01:00.000Z", maj: "2026-09-17T08:01:00.000Z" },
      { id: "i3", cultureId: "radis", etat: "seme", zoneId: null,
        depuis: { precision: "exacte", valeur: "2026-09-10" },
        cree: "2026-09-17T08:02:00.000Z", maj: "2026-09-17T08:02:00.000Z" },
    ]),
    "permavore.zones.v1": JSON.stringify([
      { id: "z1", nom: "La serre", environnement: "serre_froide", cree: "2026-09-17T07:00:00.000Z" },
    ]),
    "permavore.ressources": JSON.stringify(["engrais-laine-mouton"]),
    "permavore.jardin.v1": JSON.stringify({ ville: "Rumilly", surface: 50, zone: "continental" }),
    "permavore.plan": JSON.stringify({ planches: [{ id: "p1", m2: 3 }] }),
    "permavore.plantes": JSON.stringify([{ id: "perso-1", perso: true, nom: "Chou de ma grand-mère" }]),
    "permavore.dates.v1": JSON.stringify({ tomate: "2026-05-12" }),
    "permavore.adoptees": JSON.stringify(["pommier", "tomate", "radis"]),
    // Confort local : ne doit PAS voyager dans l'export.
    "permavore.lang": "fr",
    "permavore.climat.v2": JSON.stringify({ gros: "cache" }),
  };
}

test("seules les données du jardinier sont exportées, jamais les caches", () => {
  const etat = etatDepuisBrut(jardinComplexe());
  assert.ok(clesMetier().includes("permavore.instances.v1"));
  assert.equal(CLES_JARDIN["permavore.lang"].metier, false);
  assert.equal("permavore.lang" in etat.donnees, false);
  assert.equal("permavore.climat.v2" in etat.donnees, false);

  const fichier = construireExport(etat, { appVersion: "test" });
  const texte = JSON.stringify(fichier);
  assert.equal(texte.includes("gros"), false, "aucun cache dans l'export");
  assert.equal(/token|apiKey|secret|password/i.test(texte), false, "aucun secret");
});

test("un aller-retour export → restauration rend un jardin identique", () => {
  const avant = etatDepuisBrut(jardinComplexe());
  const fichier = construireExport(avant);
  const apres = etatDepuisExport(JSON.parse(JSON.stringify(fichier)));
  const comparaison = comparerJardins(avant, apres);
  assert.deepEqual(comparaison.differences, []);
  assert.equal(comparaison.identique, true);
});

test("la destruction totale puis la restauration rendent le même jardin", () => {
  const avant = etatDepuisBrut(jardinComplexe());
  const fichier = JSON.parse(JSON.stringify(construireExport(avant)));

  let stockage = { ...jardinComplexe() };
  stockage = {};                                  // destruction complète
  assert.deepEqual(etatDepuisBrut(stockage).donnees, {});

  const restaure = etatDepuisExport(fichier);
  assert.equal(comparerJardins(avant, restaure).identique, true);
  const instances = restaure.donnees["permavore.instances.v1"];
  assert.equal(instances.length, 3);
  assert.equal(instances.find(i => i.cultureId === "pommier").etat, "dejaPresent");
  assert.equal(instances.find(i => i.cultureId === "tomate").zoneId, "z1");
  assert.equal(restaure.donnees["permavore.zones.v1"][0].environnement, "serre_froide");
});

test("un fichier corrompu est refusé proprement, sans rien toucher", () => {
  for (const mauvais of [null, "texte", 42, [], {}, { format: "autre", formatVersion: 1 }]) {
    const r = validerExport(mauvais);
    assert.equal(r.valide, false, `accepté à tort : ${JSON.stringify(mauvais)}`);
    assert.ok(r.erreurs.length > 0);
  }
  const mauvaisTableau = validerExport({ format: "permavore", formatVersion: 1, instances: "oups" });
  assert.equal(mauvaisTableau.valide, false);
  assert.ok(mauvaisTableau.erreurs.includes("instances_invalide"));
});

test("un export d'une version future est accepté avec réserve, pas rejeté", () => {
  const futur = {
    format: "permavore", formatVersion: FORMAT_VERSION + 5,
    instances: [{ id: "x", cultureId: "tomate", etat: "plante", nouveauChamp: "?" }],
    zones: [], cultures: [], champInconnu: { quelque: "chose" },
  };
  const r = validerExport(futur);
  assert.equal(r.valide, true, "on ne refuse pas de rendre son jardin à quelqu'un");
  assert.ok(r.reserves.includes("version_plus_recente"));
  const etat = etatDepuisExport(futur);
  assert.equal(etat.donnees["permavore.instances.v1"].length, 1);
  assert.equal(etat.donnees["permavore.instances.v1"][0].nouveauChamp, "?",
    "les champs inconnus sont conservés, pas effacés");
});

test("une donnée illisible est conservée et signalée, jamais jetée", () => {
  const etat = etatDepuisBrut({
    "permavore.instances.v1": "{ceci n'est pas du JSON",
    "permavore.zones.v1": JSON.stringify({ pasUnTableau: true }),
  });
  assert.equal(etat.anomalies.length, 2);
  assert.ok("permavore.instances.v1" in etat.donnees, "la donnée brute est gardée");
});

test("une migration réussie est appliquée et vérifiée", () => {
  const etat = { schemaVersion: 0, donnees: etatDepuisBrut(jardinComplexe()).donnees };
  const r = migrer(etat);
  assert.equal(r.echec, false);
  assert.deepEqual(r.migrationsAppliquees, [1]);
  assert.equal(r.etat.schemaVersion, SCHEMA_VERSION);
  assert.equal(r.etat.donnees["permavore.instances.v1"].length, 3);
});

test("une migration qui échoue laisse le jardin d'origine intact", () => {
  const cassee = {
    version: 99, description: "migration volontairement cassée",
    appliquer: () => { throw new Error("boum"); },
  };
  MIGRATIONS.push(cassee);
  try {
    const etat = { schemaVersion: 1, donnees: etatDepuisBrut(jardinComplexe()).donnees };
    const r = migrer(etat, 99);
    assert.equal(r.echec, true);
    assert.match(r.raison, /migration_99/);
    assert.equal(r.etat.donnees["permavore.instances.v1"].length, 3,
      "le jardin est intact, pas vide");
  } finally { MIGRATIONS.pop(); }
});

test("une migration dont la conversion n'est pas vérifiée est annulée", () => {
  const perdante = {
    version: 98, description: "perd des données sans le dire",
    appliquer: (e) => ({ ...e, donnees: {} }),
    verifier: (avant, apres) => Object.keys(apres.donnees).length >= Object.keys(avant.donnees).length,
  };
  MIGRATIONS.push(perdante);
  try {
    const etat = { schemaVersion: 1, donnees: etatDepuisBrut(jardinComplexe()).donnees };
    const r = migrer(etat, 98);
    assert.equal(r.echec, true);
    assert.equal(r.raison, "migration_98_non_verifiee");
    assert.equal(r.etat.donnees["permavore.instances.v1"].length, 3);
  } finally { MIGRATIONS.pop(); }
});

test("une base plus récente que le code n'est jamais rétrogradée", () => {
  const futur = { schemaVersion: SCHEMA_VERSION + 3, donnees: { "permavore.zones.v1": [] } };
  const r = migrer(futur);
  assert.equal(r.echec, false);
  assert.equal(r.raison, "schema_plus_recent");
  assert.equal(r.etat.schemaVersion, SCHEMA_VERSION + 3);
});

test("le journal identifie ce qui a changé, pour ne pas tout renvoyer", () => {
  const e = entreeJournal("InstanceCulture", "i2", "UPDATE", 4);
  assert.equal(e.entityType, "InstanceCulture");
  assert.equal(e.operation, "UPDATE");
  assert.equal(e.version, 4);
  assert.ok(Date.parse(e.timestamp) > 0);
});

test("sans fournisseur, l'état de synchronisation reste LOCAL_ONLY", async () => {
  const p = creerSyncProvider(null);
  assert.equal(p.disponible, false);
  assert.equal(p.etat(), ETATS_SYNC.LOCAL_ONLY);
  assert.notEqual(p.etat(), ETATS_SYNC.SYNCED, "jamais « synchronisé » sans sauvegarde distante");
  assert.equal((await p.pousser()).ok, false);
});

test("un conflit ne fait jamais gagner le serveur aveuglément", () => {
  const p = creerSyncProvider({ etat: () => ETATS_SYNC.SYNCED, pousser: async () => ({ ok: true }), tirer: async () => ({ ok: true }) });
  const local = { id: "i1", updatedAt: "2026-09-17T10:00:00.000Z" };
  const distant = { id: "i1", updatedAt: "2026-09-16T10:00:00.000Z" };
  assert.equal(p.resoudreConflit(local, distant).choix, "local",
    "une modification locale plus récente n'est pas écrasée");
  const memeDate = { id: "i1", updatedAt: local.updatedAt };
  assert.equal(p.resoudreConflit(local, memeDate).choix, "conserver_les_deux");
});

test("une culture mixte survit à l'export et à la restauration", () => {
  // Une seule cellule, trois cultures, dont une déjà récoltée.
  const brut = {
    "permavore.instances.v1": JSON.stringify([
      { id: "i-radis", cultureId: "radis", etat: "seme", zoneId: "z1" },
      { id: "i-carotte", cultureId: "carotte", etat: "seme", zoneId: "z1" },
      { id: "i-poireau", cultureId: "poireau", etat: "plante", zoneId: "z1" },
    ]),
    "permavore.zones.v1": JSON.stringify([{ id: "z1", nom: "Planche", environnement: "pleine_terre" }]),
    "permavore.occupations.v1": JSON.stringify([
      { id: "o1", instanceCultureId: "i-radis", zoneId: "z1", cellules: ["3,4"],
        debut: "2026-09-01", fin: "2026-10-15", etat: "terminee" },
      { id: "o2", instanceCultureId: "i-carotte", zoneId: "z1", cellules: ["3,4"],
        debut: "2026-09-01", fin: null, etat: "active" },
      { id: "o3", instanceCultureId: "i-poireau", zoneId: "z1", cellules: ["3,4"],
        debut: "2026-09-01", fin: null, etat: "active" },
    ]),
  };
  const avant = etatDepuisBrut(brut);
  const fichier = JSON.parse(JSON.stringify(construireExport(avant)));
  assert.equal(fichier.occupations.length, 3);

  const apres = etatDepuisExport(fichier);
  assert.equal(comparerJardins(avant, apres).identique, true);

  const occ = apres.donnees["permavore.occupations.v1"];
  const actives = occ.filter(o => o.etat === "active");
  assert.equal(actives.length, 2, "carotte et poireau restent actifs");
  assert.equal(occ.find(o => o.id === "o1").fin, "2026-10-15", "l'historique du radis est conservé");
  const cellules = new Set(occ.flatMap(o => o.cellules));
  assert.equal(cellules.size, 1, "une seule cellule physique");
});

/* ---------------------------------------------------------------------------
   Migrations : le bug du schemaVersion lu comme 0 les relançait à chaque
   démarrage. Ces tests garantissent qu'elles s'exécutent une fois et une seule.
   --------------------------------------------------------------------------- */

/** Faux magasin durable : reproduit le cycle démarrage → migration → écriture. */
function magasinDurable(etatInitial) {
  let contenu = JSON.parse(JSON.stringify(etatInitial));
  const journalMigrations = [];
  return {
    lire: () => JSON.parse(JSON.stringify(contenu)),
    demarrer() {
      const avant = this.lire();
      if ((avant.schemaVersion || 0) >= SCHEMA_VERSION) {
        return { migrationsAppliquees: [], deja: true };
      }
      const r = migrer(avant);
      if (!r.echec) { contenu = r.etat; journalMigrations.push(...r.migrationsAppliquees); }
      return r;
    },
    journalMigrations,
  };
}

test("une migration s'exécute exactement une fois, même après redémarrage", () => {
  const depart = { schemaVersion: 0, donnees: etatDepuisBrut(jardinComplexe()).donnees };
  const m = magasinDurable(depart);

  const premier = m.demarrer();
  assert.deepEqual(premier.migrationsAppliquees, [1], "appliquée au premier démarrage");
  assert.equal(m.lire().schemaVersion, SCHEMA_VERSION);

  // Redémarrages suivants : plus rien à faire. C'est précisément ce que le bug
  // du schemaVersion cassait.
  for (let i = 0; i < 5; i++) {
    const suivant = m.demarrer();
    assert.deepEqual(suivant.migrationsAppliquees, [], `redémarrage ${i + 2}`);
  }
  assert.deepEqual(m.journalMigrations, [1], "une seule exécution au total");
});

test("une migration conserve zones, cellules, occupations et instances", () => {
  const brut = {
    ...jardinComplexe(),
    "permavore.occupations.v1": JSON.stringify([
      { id: "o1", instanceCultureId: "i1", zoneId: "z1", cellules: ["3,4"], etat: "active", debut: "2026-09-01" },
      { id: "o2", instanceCultureId: "i2", zoneId: "z1", cellules: ["3,4", "3,5"], etat: "active", debut: "2026-09-01" },
    ]),
  };
  const depart = { schemaVersion: 0, donnees: etatDepuisBrut(brut).donnees };
  const m = magasinDurable(depart);
  m.demarrer();
  const apres = m.lire();

  assert.equal(apres.donnees["permavore.zones.v1"][0].environnement, "serre_froide");
  assert.equal(apres.donnees["permavore.instances.v1"].length, 3);
  const occ = apres.donnees["permavore.occupations.v1"];
  assert.equal(occ.length, 2);
  assert.deepEqual(occ[1].cellules, ["3,4", "3,5"], "les cellules sont intactes");
  assert.equal(occ[0].instanceCultureId, "i1", "les liens vers les instances tiennent");
});

test("une migration est idempotente : la relancer ne change rien", () => {
  const etat = { schemaVersion: 0, donnees: etatDepuisBrut(jardinComplexe()).donnees };
  const une = migrer(etat);
  const deux = migrer(une.etat);
  assert.deepEqual(deux.migrationsAppliquees, []);
  assert.deepEqual(comparerJardins(une.etat, deux.etat).differences, []);
});

test("les photos de sachets du jardinier entrent dans l'export", () => {
  const etat = etatDepuisBrut(jardinComplexe());
  const sachets = [
    { id: "s1", plantId: "tomate", thumb: "data:image/jpeg;base64,AAAA", meta: { date: "2026-03-01" } },
    { id: "s2", plantId: "radis", thumb: "data:image/jpeg;base64,BBBB", meta: {} },
  ];
  const fichier = construireExport(etat, { sachets });
  assert.equal(fichier.sachets.length, 2);
  assert.equal(fichier.sachets[0].plantId, "tomate");
  // Et le cache climatique n'y entre jamais, même s'il traîne encore en local.
  assert.equal(JSON.stringify(fichier).includes("cacheClimat"), false);
});

/* ---------------------------------------------------------------------------
   Échecs d'écriture : visibles sur une donnée du jardinier, silencieux sur un
   cache. Le pire scénario serait de laisser croire que le jardin est sauvegardé.
   --------------------------------------------------------------------------- */

/** Reproduit l'erreur que lève un navigateur à court de place. */
function quotaDepasse() {
  const e = new Error("The quota has been exceeded.");
  e.name = "QuotaExceededError";
  return e;
}

test("un QuotaExceededError sur une donnée souveraine est signalé, jamais avalé", () => {
  const r = classerEchecEcriture("permavore.instances.v1", quotaDepasse());
  assert.equal(r.souveraine, true);
  assert.equal(r.quota, true);
  assert.equal(r.cause, "QuotaExceededError");
  assert.equal(r.proposerExport, true, "l'export est la seule action qui règle le problème");
});

test("les photos de sachets sont traitées comme une donnée souveraine", () => {
  const r = classerEchecEcriture("sachets", quotaDepasse());
  assert.equal(r.souveraine, true);
  assert.equal(r.proposerExport, true);
});

test("chaque donnée de classe A est reconnue comme souveraine", () => {
  for (const cle of clesMetier()) {
    assert.equal(estSouveraine(cle), true, `${cle} doit être souveraine`);
  }
  assert.equal(estSouveraine("sachets"), true);
});

test("un échec sur un cache reste non bloquant et n'alerte personne", () => {
  for (const cache of ["permavore.climat.v2", "permavore.photos.v1", "permavore.lang"]) {
    const r = classerEchecEcriture(cache, quotaDepasse());
    assert.equal(r.souveraine, false, `${cache} ne doit pas alerter`);
    assert.equal(r.proposerExport, false);
  }
});

test("une panne d'écriture qui n'est pas un quota reste signalée", () => {
  const autre = new Error("transaction aborted");
  autre.name = "AbortError";
  const r = classerEchecEcriture("permavore.occupations.v1", autre);
  assert.equal(r.souveraine, true);
  assert.equal(r.quota, false, "la cause est distinguée");
  assert.equal(r.cause, "AbortError");
  assert.equal(r.proposerExport, true);
});

test("l'écriture continue sur les autres clés après un échec partiel", () => {
  // Un localStorage qui refuse une clé précise : les autres doivent passer,
  // et l'échec doit être remonté plutôt que masqué.
  const ecrites = {};
  const faux = {
    setItem(cle, valeur) {
      if (cle === "permavore.occupations.v1") throw quotaDepasse();
      ecrites[cle] = valeur;
    },
  };
  const rates = [];
  for (const [cle, valeur] of Object.entries({
    "permavore.instances.v1": "[]", "permavore.occupations.v1": "[]", "permavore.zones.v1": "[]",
  })) {
    try { faux.setItem(cle, valeur); }
    catch (e) { rates.push(classerEchecEcriture(cle, e)); }
  }
  assert.equal(Object.keys(ecrites).length, 2, "les deux autres clés sont écrites");
  assert.equal(rates.length, 1);
  assert.equal(rates[0].souveraine, true);
});

/* ---------------------------------------------------------------------------
   Reprise d'un jardin depuis l'accueil : c'est le parcours d'un jardinier qui
   passe de Safari macOS à Safari iOS, ou qui change de téléphone.
   --------------------------------------------------------------------------- */

test("l'aperçu ne montre que ce que le fichier contient vraiment", () => {
  const etat = etatDepuisBrut(jardinComplexe());
  const fichier = construireExport(etat, {
    sachets: [{ id: "s1", plantId: "tomate", thumb: "data:image/jpeg;base64,AAAA" }],
  });
  const r = validerExport(fichier);
  assert.equal(r.valide, true);
  assert.equal(r.resume.lieu, "Rumilly");
  assert.equal(r.resume.surface, 50);
  assert.equal(r.resume.instances, 3);
  assert.equal(r.resume.culturesDistinctes, 3);
  assert.equal(r.resume.photos, 1, "les photos présentes sont annoncées");

  // Un fichier sans préférences n'invente ni lieu ni surface.
  const nu = validerExport({ format: "permavore", formatVersion: 1, instances: [] });
  assert.equal(nu.valide, true);
  assert.equal(nu.resume.lieu, null);
  assert.equal(nu.resume.surface, null);
  assert.equal(nu.resume.photos, 0);
});

test("un fichier renommé est jugé sur son contenu, pas sur son extension", () => {
  // Le nom ne compte pas : seul le contenu est examiné.
  const vrai = construireExport(etatDepuisBrut(jardinComplexe()));
  assert.equal(validerExport(vrai).valide, true);
  // Un JSON quelconque renommé .permavore.json reste refusé.
  assert.equal(validerExport({ notes: ["liste de courses"] }).valide, false);
  assert.equal(validerExport({ format: "autre-appli", formatVersion: 1 }).valide, false);
});

test("la validation encaisse un fichier structurellement abîmé sans lever", () => {
  const abimes = [
    { format: "permavore", formatVersion: 1, instances: "oups" },
    { format: "permavore", formatVersion: 1, zones: 42 },
    { format: "permavore", formatVersion: 1, occupations: { a: 1 } },
    { format: "permavore", formatVersion: 1, cultures: null, instances: undefined },
  ];
  for (const f of abimes) {
    const r = validerExport(f);          // ne doit jamais jeter d'exception
    assert.equal(typeof r.valide, "boolean");
    assert.ok(r.resume === null || typeof r.resume === "object");
  }
});

test("restaurer par-dessus un jardin existant se fait après sauvegarde de sécurité", () => {
  // L'état existant doit pouvoir être reconstitué à l'identique en cas d'échec.
  const existant = etatDepuisBrut(jardinComplexe());
  const filet = JSON.parse(JSON.stringify(existant));
  const nouveau = etatDepuisExport(construireExport(
    etatDepuisBrut({ "permavore.instances.v1": JSON.stringify([{ id: "x", cultureId: "ail" }]) })));

  assert.notDeepEqual(comparerJardins(existant, nouveau).differences, []);
  // Retour arrière : le filet redonne exactement le jardin de départ.
  assert.equal(comparerJardins(existant, filet).identique, true);
});
