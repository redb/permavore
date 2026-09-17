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
