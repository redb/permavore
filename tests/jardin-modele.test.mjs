import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* instances.js et environnements.js sont des scripts classiques destinés au
   navigateur : on les exécute dans un bac à sable muni d'un localStorage
   minimal, plutôt que de dupliquer leur logique dans les tests. */
function sandbox() {
  const memoire = new Map();
  const ctx = {
    window: {},
    localStorage: {
      getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
      setItem: (k, v) => memoire.set(k, String(v)),
      removeItem: (k) => memoire.delete(k),
    },
    crypto: { randomUUID: () => Math.random().toString(36).slice(2) },
  };
  vm.createContext(ctx);
  for (const f of ["environnements.js", "instances.js"]) {
    vm.runInContext(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), ctx);
  }
  return ctx.window;
}

test("une culture placée dans une zone hérite de l'environnement de la zone", () => {
  const w = sandbox();
  const serre = w.Instances.definirZone("z-serre", { nom: "La serre", environnement: "serre_froide" });
  const i = w.Instances.enraciner("tomate", { etat: "plante", zoneId: serre.id });

  const env = w.Instances.environnementDe(i);
  assert.equal(env.type, "serre_froide");
  assert.equal(env.origine, "zone", "l'environnement vient de la zone, pas de la plante");
  assert.equal(env.nom, "La serre");
  assert.equal(i.environnement, null, "rien n'est recopié sur chaque plante");
});

test("une instance peut surcharger l'environnement de sa zone, sans le recopier partout", () => {
  const w = sandbox();
  const serre = w.Instances.definirZone("z-serre", { nom: "La serre", environnement: "serre_froide" });
  const normale = w.Instances.enraciner("tomate", { etat: "plante", zoneId: serre.id });
  const exception = w.Instances.enraciner("basilic", { etat: "plante", zoneId: serre.id,
    environnement: "interieur" });

  assert.equal(w.Instances.environnementDe(normale).type, "serre_froide");
  const env = w.Instances.environnementDe(exception);
  assert.equal(env.type, "interieur");
  assert.equal(env.origine, "instance");

  // Changer la zone change toutes celles qui en héritent, et elles seules.
  w.Instances.definirZone("z-serre", { environnement: "serre_chauffee" });
  assert.equal(w.Instances.environnementDe(normale).type, "serre_chauffee");
  assert.equal(w.Instances.environnementDe(exception).type, "interieur");
});

test("sans zone ni surcharge, on suppose la pleine terre et rien de mieux", () => {
  const w = sandbox();
  const i = w.Instances.enraciner("carotte", { etat: "seme" });
  const env = w.Instances.environnementDe(i);
  assert.equal(env.type, "pleine_terre");
  assert.equal(env.origine, "defaut");

  // Et un abri non caractérisé n'améliore jamais le climat ressenti.
  const serre = w.Environnements.environnementCulture("serre_froide");
  const profil = { minimumHivernal: -8, saisonSansGel: 220, sansGelToutelAnnee: false };
  const sous = w.Environnements.profilSousEnvironnement(profil, serre);
  assert.equal(sous.connu, false);
  assert.equal(sous.profil, null);
  assert.equal(sous.raison, "abri_non_caracterise");
});

/* ---------------------------------------------------------------------------
   Cultures mixtes sur une cellule de 0,25 m².
   Cas réel : radis, carotte et poireau semés ensemble dans le même carré.
   --------------------------------------------------------------------------- */

test("une cellule de 0,25 m² porte plusieurs cultures, et sa surface ne s'additionne pas", () => {
  const w = sandbox();
  const planche = w.Instances.definirZone("z-planche", { nom: "Planche aromatiques", environnement: "pleine_terre" });
  const c = w.Instances.cellule(3, 4);

  const radis = w.Instances.enraciner("radis", { etat: "seme", zoneId: planche.id });
  const carotte = w.Instances.enraciner("carotte", { etat: "seme", zoneId: planche.id });
  const poireau = w.Instances.enraciner("poireau", { etat: "plante", zoneId: planche.id });

  const oRadis = w.Instances.occuper(radis.id, [c], { zoneId: planche.id, debut: "2026-09-01" });
  w.Instances.occuper(carotte.id, [c], { zoneId: planche.id, debut: "2026-09-01" });
  w.Instances.occuper(poireau.id, [c], { zoneId: planche.id, debut: "2026-09-01" });

  assert.equal(w.Instances.occupationsDe(3, 4).length, 3, "trois cultures sur la même cellule");
  assert.equal(w.Instances.surfaceOccupation(oRadis), 0.25, "une cellule = 0,25 m²");
  assert.equal(w.Instances.surfacePhysique(), 0.25,
    "trois cultures sur une cellule occupent 0,25 m², jamais 0,75");

  // Récolte des radis : leur occupation se termine, les autres continuent.
  w.Instances.terminerOccupation(oRadis.id, "2026-10-15");
  assert.equal(w.Instances.occupationsDe(3, 4).length, 2, "carotte et poireau restent en place");
  assert.equal(w.Instances.celluleLibre(3, 4), false, "la cellule n'est pas libérée");
  assert.equal(w.Instances.surfacePhysique(), 0.25);

  // L'historique des radis est conservé : c'est lui qui permettra la rotation.
  const histoire = w.Instances.historiqueCellule(3, 4);
  assert.equal(histoire.length, 3);
  const trace = histoire.find(o => o.id === oRadis.id);
  assert.equal(trace.etat, "terminee");
  assert.equal(trace.fin, "2026-10-15");
  assert.equal(trace.debut, "2026-09-01");
});

test("la surface se calcule sur l'union des cellules, jamais par addition", () => {
  const w = sandbox();
  const a = w.Instances.enraciner("laitue", { etat: "plante" });
  const b = w.Instances.enraciner("radis", { etat: "seme" });
  // Deux cultures se chevauchant partiellement : 3 cellules distinctes en tout.
  w.Instances.occuper(a.id, [w.Instances.cellule(0, 0), w.Instances.cellule(0, 1)]);
  w.Instances.occuper(b.id, [w.Instances.cellule(0, 1), w.Instances.cellule(0, 2)]);
  assert.equal(w.Instances.surfacePhysique(), 0.75, "3 cellules distinctes × 0,25");
  assert.equal(w.Instances.occupationsActives().length, 2);
});

test("une cellule se libère quand toutes ses occupations sont terminées", () => {
  const w = sandbox();
  const i = w.Instances.enraciner("radis", { etat: "seme" });
  const o = w.Instances.occuper(i.id, [w.Instances.cellule(5, 5)]);
  assert.equal(w.Instances.celluleLibre(5, 5), false);
  w.Instances.terminerOccupation(o.id);
  assert.equal(w.Instances.celluleLibre(5, 5), true, "0,25 m² redeviennent disponibles");
  assert.equal(w.Instances.historiqueCellule(5, 5).length, 1, "sans perdre l'historique");
});

test("les anciennes planches se convertissent en cellules sans rien inventer", () => {
  const w = sandbox();
  // Ancien plan : une planche 2×2 (soit 1 m²) plantée en tomates, une planche vide.
  const anciennes = [
    { id: "pl-1", x: 2, y: 3, w: 2, h: 2, plantId: "tomate", dateSemis: "2026-05-12", historique: [] },
    { id: "pl-2", x: 6, y: 1, w: 4, h: 1, plantId: null, dateSemis: null, historique: [] },
  ];
  const r = w.Instances.migrerPlanchesVersOccupations(anciennes);
  assert.equal(r.reprises, 1);
  assert.equal(r.ignorees, 1, "une planche vide ne produit pas d'occupation fictive");

  const occ = w.Instances.occupationsActives();
  assert.equal(occ.length, 1);
  assert.equal(occ[0].cellules.length, 4, "2 × 2 cellules");
  assert.equal(w.Instances.surfaceOccupation(occ[0]), 1, "soit 1 m², comme la planche d'origine");
  assert.equal(occ[0].debut, "2026-05-12", "la date de semis est conservée");
  assert.deepEqual(w.Instances.occupationsDe(3, 4).length, 1);

  // Idempotence : relancer la reprise ne duplique rien.
  const r2 = w.Instances.migrerPlanchesVersOccupations(anciennes);
  assert.equal(r2.reprises, 0);
  assert.equal(w.Instances.occupationsActives().length, 1);

  // Et les planches d'origine sont intactes.
  assert.equal(anciennes[0].plantId, "tomate");
  assert.equal(anciennes[0].w, 2);
});
