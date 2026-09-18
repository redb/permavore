import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function sandbox() {
  const memoire = new Map();
  const ctx = {
    window: {}, navigator: { language: "fr" },
    document: { documentElement: {} },
    localStorage: {
      getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
      setItem: (k, v) => memoire.set(k, String(v)),
      removeItem: (k) => memoire.delete(k),
    },
  };
  vm.createContext(ctx);
  for (const f of ["i18n.js", "lune.js", "experience-lune.js"]) {
    vm.runInContext(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), ctx);
  }
  return ctx.window;
}

const LIEU = { lat: 45.87, lng: 5.94 };
const DEPART = "2026-09-18T08:00:00Z";

/** Crée une expérience avec un tirage imposé, pour que le test soit reproductible. */
function experience(w, { hasard = () => 0.1 } = {}) {
  return w.ExperienceLune.creerExperience("radis", LIEU,
    { maintenant: DEPART, hasard, fractionEclairee: w.Lune.fractionEclairee });
}

test("les deux lots sont programmés à des moments lunaires opposés", () => {
  const w = sandbox();
  const e = experience(w);
  assert.equal(e.lots.A.grainesSemees, 20);
  assert.equal(e.lots.B.grainesSemees, 20);
  assert.notEqual(e.lots.A.condition, e.lots.B.condition, "deux conditions différentes");
  // A est toujours le premier à semer, quelle que soit la condition tirée.
  assert.ok(e.lots.A.fenetreDebut < e.lots.B.fenetreDebut,
    `A ${e.lots.A.fenetreDebut} doit précéder B ${e.lots.B.fenetreDebut}`);
  // Les fenêtres sont bien des fenêtres, pas des dates au couteau.
  assert.notEqual(e.lots.A.fenetreDebut, e.lots.A.fenetreFin);
});

test("l'ordre des conditions est tiré au sort, sinon la comparaison serait biaisée", () => {
  const avec = (h) => experience(sandbox(), { hasard: () => h }).lots.A.condition;
  assert.notEqual(avec(0.1), avec(0.9),
    "le lot A ne doit pas porter toujours la même condition");
});

test("la condition lunaire reste invisible tant que l'expérience court", () => {
  const w = sandbox();
  const e = experience(w);
  const vue = w.ExperienceLune.vueExperience(e);
  assert.equal(vue.conditionsRevelees, false);
  assert.equal(vue.lots.A.condition, undefined, "la condition ne doit pas fuir");
  assert.equal(vue.lots.A.releveLunaire, undefined, "ni le relevé, qui la trahirait");
  // Les informations utiles au jardinier, elles, sont bien là.
  assert.ok(vue.lots.A.fenetreDebut);
  assert.equal(vue.lots.A.grainesSemees, 20);
});

test("un semis fige le relevé astronomique du moment et du lieu", () => {
  const w = sandbox();
  const e = experience(w);
  w.ExperienceLune.enregistrerSemis(e.id, "A", {
    quand: "2026-09-21T09:00:00Z", instanceCultureId: "inst-1",
    releveLunaire: w.Lune.releveLunaire,
  });
  const l = w.ExperienceLune.experiences()[0].lots.A;
  assert.equal(l.instanceCultureId, "inst-1", "le lot est rattaché à une InstanceCulture");
  assert.ok(l.releveLunaire, "relevé figé");
  assert.ok(l.releveLunaire.ageJours >= 0);
  assert.equal(typeof l.releveLunaire.fractionEclairee, "number");
  assert.equal(typeof l.releveLunaire.expositionNocturneHeures, "number");
  assert.equal(l.releveLunaire.couvertureNuageusePct, null);
  assert.equal(w.ExperienceLune.experiences()[0].statut, "active");
});

test("les mesures dérivées ne sont calculées que sur ce qui a été compté", () => {
  const w = sandbox();
  const partiel = w.ExperienceLune.mesuresDerivees({ grainesSemees: 20, plantsLeves: 17 });
  assert.equal(partiel.tauxGermination, 0.85);
  assert.equal(partiel.dureeLeveeJours, null, "pas de date, pas de durée");
  assert.equal(partiel.rendementParGraine, null);

  const complet = w.ExperienceLune.mesuresDerivees({
    grainesSemees: 20, plantsLeves: 17, semeLe: "2026-09-21T09:00:00Z",
    leveeLe: "2026-09-26T09:00:00Z", nombreRecolte: 16, poidsRecolteG: 684,
  });
  assert.equal(complet.dureeLeveeJours, 5);
  assert.equal(complet.rendementParGraine, 34.2);
  assert.equal(complet.rendementParPlante, 42.8);
});

test("les conditions ne sont révélées qu'une fois les DEUX lots récoltés", () => {
  const w = sandbox();
  const e = experience(w);
  const E = w.ExperienceLune;
  E.enregistrerSemis(e.id, "A", { quand: "2026-09-21T09:00:00Z", releveLunaire: w.Lune.releveLunaire });
  E.enregistrerSemis(e.id, "B", { quand: "2026-10-05T09:00:00Z", releveLunaire: w.Lune.releveLunaire });
  E.enregistrerObservation(e.id, "A", { leveeLe: "2026-09-26", plantsLeves: 17 });
  E.enregistrerObservation(e.id, "A", { recolteLe: "2026-10-18", nombreRecolte: 16, poidsRecolteG: 684 });

  // Un seul lot terminé : toujours aveugle.
  let vue = E.vueExperience(E.experiences()[0]);
  assert.equal(vue.conditionsRevelees, false);
  assert.equal(vue.lots.A.condition, undefined);

  E.enregistrerObservation(e.id, "B", { leveeLe: "2026-10-11", plantsLeves: 15 });
  E.enregistrerObservation(e.id, "B", { recolteLe: "2026-11-01", nombreRecolte: 14, poidsRecolteG: 611 });

  vue = E.vueExperience(E.experiences()[0]);
  assert.equal(vue.statut, "completed");
  assert.equal(vue.conditionsRevelees, true);
  assert.ok(vue.lots.A.condition, "révélée à la fin, pas avant");
  assert.ok(vue.lots.A.releveLunaire);
  assert.equal(vue.lots.A.tauxGermination, 0.85);
  assert.equal(vue.lots.B.tauxGermination, 0.75);
});

test("la contribution collective ne porte aucune conclusion, et ne situe pas le jardin", () => {
  const w = sandbox();
  const E = w.ExperienceLune;
  const e = experience(w);
  E.enregistrerSemis(e.id, "A", { quand: "2026-09-21T09:00:00Z", releveLunaire: w.Lune.releveLunaire });
  E.enregistrerSemis(e.id, "B", { quand: "2026-10-05T09:00:00Z", releveLunaire: w.Lune.releveLunaire });
  for (const lot of ["A", "B"]) {
    E.enregistrerObservation(e.id, lot, { leveeLe: "2026-09-26", plantsLeves: 16,
      recolteLe: "2026-10-18", nombreRecolte: 15, poidsRecolteG: 600 });
  }
  const c = E.contributionCollective(E.experiences()[0], { climatKoppen: "Cfb", variete: "Cherry Belle" });
  assert.ok(c);
  assert.equal(c.maille, "45.9,5.9", "maille climatique, pas les coordonnées du jardin");
  assert.equal(c.contexte.climatKoppen, "Cfb");
  assert.equal(c.contexte.temperatureMoyenneC, null, "non mesuré, donc null, jamais inventé");
  // Aucun verdict, aucune p-valeur, aucune conclusion : ce sont des mesures.
  const texte = JSON.stringify(c);
  assert.equal(/prouve|démontre|significatif|conclusion/i.test(texte), false);
});

test("une expérience en cours ne contribue pas à l'ensemble collectif", () => {
  const w = sandbox();
  const e = experience(w);
  assert.equal(w.ExperienceLune.contributionCollective(e), null,
    "tant qu'elle court, elle ne sort pas — sinon l'aveuglement ne servirait à rien");
});

test("on peut abandonner une expérience sans perdre ce qui a été observé", () => {
  const w = sandbox();
  const E = w.ExperienceLune;
  const e = experience(w);
  E.enregistrerSemis(e.id, "A", { quand: "2026-09-21T09:00:00Z", releveLunaire: w.Lune.releveLunaire });
  E.enregistrerObservation(e.id, "A", { plantsLeves: 17 });
  E.abandonner(e.id);
  const garde = E.experiences()[0];
  assert.equal(garde.statut, "abandoned");
  assert.equal(garde.lots.A.plantsLeves, 17, "l'observation reste");
  assert.equal(E.experienceCourante(), null, "elle ne réclame plus rien au jardinier");
});

test("un second semis du même lot ne peut pas écraser le premier", () => {
  const w = sandbox();
  const E = w.ExperienceLune;
  const e = experience(w);
  E.enregistrerSemis(e.id, "A", { quand: "2026-09-21T09:00:00Z", releveLunaire: w.Lune.releveLunaire });
  const premier = E.experiences()[0].lots.A.semeLe;
  assert.equal(E.enregistrerSemis(e.id, "A", { quand: "2026-09-25T09:00:00Z" }), null);
  assert.equal(E.experiences()[0].lots.A.semeLe, premier, "la date de semis ne se réécrit pas");
});

test("les deux semis se suivent réellement, dans l'ordre tiré au sort", () => {
  const w = sandbox();
  for (const h of [0.1, 0.9]) {
    const e = w.ExperienceLune.creerExperience("radis", LIEU,
      { maintenant: DEPART, hasard: () => h, fractionEclairee: w.Lune.fractionEclairee });
    const debutA = Date.parse(e.lots.A.fenetreDebut);
    const debutB = Date.parse(e.lots.B.fenetreDebut);
    assert.ok(debutB > debutA, "B vient après A");
    const ecartJours = (debutB - debutA) / 86400000;
    // Une demi-lunaison sépare une pleine lune de la nouvelle qui suit.
    assert.ok(ecartJours > 8 && ecartJours < 22,
      `écart invraisemblable entre les deux semis : ${ecartJours} jours`);
    // Et la première fenêtre tombe dans le mois qui vient, pas dans six mois.
    assert.ok((debutA - Date.parse(DEPART)) / 86400000 < 32);
  }
});

test("sur de nombreux participants, les deux ordres apparaissent également", () => {
  // Sans cela, la condition du lot A serait confondue avec l'ordre temporel,
  // et l'ensemble collectif serait biaisé dès la collecte.
  const w = sandbox();
  const compte = {};
  for (let i = 0; i < 200; i++) {
    const e = w.ExperienceLune.creerExperience("radis", LIEU,
      { maintenant: DEPART, fractionEclairee: w.Lune.fractionEclairee });
    compte[e.lots.A.condition] = (compte[e.lots.A.condition] || 0) + 1;
  }
  const valeurs = Object.values(compte);
  assert.equal(valeurs.length, 2, "les deux conditions doivent apparaître en premier");
  const [a, b] = valeurs;
  assert.ok(Math.min(a, b) / Math.max(a, b) > 0.6,
    `répartition trop déséquilibrée : ${JSON.stringify(compte)}`);
});

/* ---------------------------------------------------------------------------
   Relances : Permavore doit venir vers le jardinier. Mais le silence est le cas
   normal — on ne réclame rien tant qu'il n'y a rien à faire.
   --------------------------------------------------------------------------- */

test("rien n'est demandé tant que la fenêtre de semis n'est pas ouverte", () => {
  const w = sandbox();
  const e = experience(w);
  const veille = new Date(Date.parse(e.lots.A.fenetreDebut) - 5 * 86400000);
  const etape = w.ExperienceLune.etapeDue(veille);
  assert.equal(etape.quoi, "attendre", "on n'interrompt pas le jardinier pour rien");
  assert.equal(etape.urgence, "aVenir");
});

test("la fenêtre ouverte déclenche la demande de semis, et son dépassement le dit", () => {
  const w = sandbox();
  const e = experience(w);
  const pendant = new Date(Date.parse(e.lots.A.fenetreDebut) + 43200000);
  assert.deepEqual(
    (({ quoi, urgence, lot }) => ({ quoi, urgence, lot }))(w.ExperienceLune.etapeDue(pendant)),
    { quoi: "semer", urgence: "maintenant", lot: "A" });

  const apres = new Date(Date.parse(e.lots.A.fenetreFin) + 3 * 86400000);
  const tard = w.ExperienceLune.etapeDue(apres);
  assert.equal(tard.quoi, "semer");
  assert.equal(tard.urgence, "passee", "on le dit franchement plutôt que de faire comme si");
});

test("après le semis, la levée n'est demandée qu'une fois plausible", () => {
  const w = sandbox();
  const E = w.ExperienceLune;
  const e = experience(w);
  E.enregistrerSemis(e.id, "A", { quand: "2026-09-21T09:00:00Z", releveLunaire: w.Lune.releveLunaire });

  // Deux jours après : trop tôt, un radis ne lève pas en deux jours.
  assert.equal(E.etapeDue(new Date("2026-09-23T09:00:00Z")), null);
  // Quatre jours : la question a du sens.
  const etape = E.etapeDue(new Date("2026-09-25T09:00:00Z"));
  assert.equal(etape.quoi, "levee");
  assert.equal(etape.lot, "A");
});

test("la récolte n'est proposée qu'après le délai du protocole", () => {
  const w = sandbox();
  const E = w.ExperienceLune;
  const e = experience(w);
  E.enregistrerSemis(e.id, "A", { quand: "2026-09-21T09:00:00Z", releveLunaire: w.Lune.releveLunaire });
  E.enregistrerObservation(e.id, "A", { leveeLe: "2026-09-26", plantsLeves: 17 });

  assert.equal(E.etapeDue(new Date("2026-10-01T09:00:00Z")), null, "dix jours : trop tôt");
  const etape = E.etapeDue(new Date("2026-10-15T09:00:00Z"));
  assert.equal(etape.quoi, "recolte");
});

test("une expérience abandonnée ne réclame plus jamais rien", () => {
  const w = sandbox();
  const E = w.ExperienceLune;
  const e = experience(w);
  E.abandonner(e.id);
  assert.equal(E.etapeDue(new Date("2027-01-01T00:00:00Z")), null);
});
