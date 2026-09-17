import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// climat.js est un script classique (pas un module) : on l'évalue dans un bac à sable.
const contexte = vm.createContext({ console, URLSearchParams, Date, Math, Number, Array, JSON });
vm.runInContext(readFileSync(new URL("../climat.js", import.meta.url), "utf8"), contexte);
const { indicateursAnnee, moyenneIndicateurs, indicateursFenetre, tendanceChaleur, modelesDaccord } = contexte;

// Année type : gelées jusqu'au 31 mars, reprise le 1er novembre, 12 jours > 30 °C en juillet.
function anneeType({ derniereGelee = 90, premiereGelee = 305, chauds = 12 } = {}) {
  const jours = [];
  for (let i = 0; i < 365; i++) {
    const mois = Math.min(12, Math.floor(i / 30.4) + 1);
    const gel = i <= derniereGelee || i >= premiereGelee;
    jours.push({ mois, index: i, tmin: gel ? -2 : 8, tmax: (i >= 180 && i < 180 + chauds) ? 32 : 20 });
  }
  return jours;
}

test("saison sans gel = écart entre dernière gelée de printemps et première d'automne", () => {
  const r = indicateursAnnee(anneeType());
  assert.equal(r.saisonSansGel, 305 - 90);
  assert.equal(r.joursChauds, 12);
  assert.equal(r.minimum, -2);
});

test("une année sans aucune gelée n'invente pas de dates", () => {
  const jours = anneeType({ derniereGelee: -1, premiereGelee: 999 });
  const r = indicateursAnnee(jours);
  assert.equal(r.saisonSansGel, 364);       // borné par l'année, pas extrapolé
  assert.equal(r.minimum, 8);
});

test("les valeurs manquantes ne sont pas comptées comme des gelées", () => {
  const jours = anneeType().map((j, i) => i < 10 ? { ...j, tmin: null, tmax: null } : j);
  const r = indicateursAnnee(jours);
  assert.equal(r.joursChauds, 12);
  assert.ok(Number.isFinite(r.minimum));
});

test("indicateursFenetre découpe correctement par année civile", () => {
  const dates = [], tmin = [], tmax = [];
  for (const annee of ["2031", "2032"]) {
    for (let m = 1; m <= 12; m++) {
      dates.push(`${annee}-${String(m).padStart(2, "0")}-15`);
      tmin.push(m <= 2 || m === 12 ? -3 : 9);
      tmax.push(m === 7 ? 31 : 20);
    }
  }
  const r = indicateursFenetre(dates, tmin, tmax);
  assert.equal(r.annees, 2);
  assert.equal(r.joursChauds, 1);
  assert.equal(r.minimum, -3);
});

test("tendance : gain de saison sans gel = favorable, avec réserve si forte hausse des jours chauds", () => {
  const ref = { saisonSansGel: 200, joursChauds: 10 };
  const favorable = tendanceChaleur(ref, { saisonSansGel: 215, joursChauds: 14 }, true);
  assert.equal(favorable.tendance, "favorable");
  assert.equal(favorable.exces, false);
  const chaud = tendanceChaleur(ref, { saisonSansGel: 215, joursChauds: 25 }, true);
  assert.equal(chaud.exces, true);
});

test("tendance : perte de saison = défavorable, le réchauffement n'est pas présumé favorable", () => {
  const r = tendanceChaleur({ saisonSansGel: 200, joursChauds: 10 }, { saisonSansGel: 190, joursChauds: 30 }, true);
  assert.equal(r.tendance, "defavorable");
});

test("modèles en désaccord : aucune conclusion", () => {
  assert.equal(modelesDaccord([5, -4]), false);
  assert.equal(modelesDaccord([5, 2]), true);
  const r = tendanceChaleur({ saisonSansGel: 200, joursChauds: 10 }, { saisonSansGel: 220, joursChauds: 12 }, false);
  assert.equal(r.tendance, "incertain");
  assert.equal(r.confiance, "faible");
});
