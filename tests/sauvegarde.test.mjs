import test from "node:test";
import assert from "node:assert/strict";
import {
  SCHEMA_VERSION, FORMAT_VERSION, CLES_JARDIN, clesMetier,
  etatDepuisBrut, migrer, MIGRATIONS, construireExport, etatDepuisExport,
  validerExport, comparerJardins, entreeJournal, creerSyncProvider, ETATS_SYNC,
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
