import test from "node:test";
import assert from "node:assert/strict";
import { compacter, signaux, verdict } from "../previsions-core.mjs";

const daily = {
  time: ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"],
  temperature_2m_min: [8, 6, 2, -1, 3, 5, 7],
  temperature_2m_max: [18, 17, 14, 12, 15, 19, 33],
  precipitation_sum: [0, 6.2, 0, 0, 1, 0, 0],
  precipitation_probability_max: [10, 80, 5, 0, 20, 0, 0],
};

test("compacter garde sept jours et ignore les trous", () => {
  const p = compacter(daily);
  assert.equal(p.jours.length, 7);
  assert.equal(p.horizonJours, 7);
  const troue = compacter({ ...daily, temperature_2m_min: [8, null, 2, -1, 3, 5, 7] });
  assert.equal(troue.jours.length, 6);
  assert.equal(compacter(null), null);
  assert.equal(compacter({ time: [] }), null);
});

test("signaux : premier gel, première gelée au sol, chaleur, cumul", () => {
  const s = signaux(compacter(daily));
  assert.equal(s.gel.date, "2026-10-05");
  assert.equal(s.geleeSol.date, "2026-10-04");
  assert.equal(s.chaleur.date, "2026-10-08");
  assert.equal(s.pluieCumul, 7);
});

test("verdict : frileuse attend le gel, rustique ne voit que la chaleur", () => {
  const p = compacter(daily);
  assert.equal(verdict({ frileux: true }, p, "now").code, "attendre_gel");
  assert.equal(verdict({ frileux: false }, p, "now").code, "chaleur");
  assert.equal(verdict({ frileux: true }, p, "later").code, "rien");
  assert.equal(verdict({ frileux: true }, null).code, "inconnu");
  const doux = compacter({ ...daily, temperature_2m_min: [8, 6, 5, 4, 5, 6, 7], temperature_2m_max: [18, 17, 14, 12, 15, 19, 21] });
  assert.equal(verdict({ frileux: true }, doux, "now").code, "rien");
  const frais = compacter({ ...daily, temperature_2m_min: [8, 6, 2, 4, 5, 6, 7], temperature_2m_max: [18, 17, 14, 12, 15, 19, 21] });
  assert.equal(verdict({ frileux: true }, frais, "now").code, "prudence_gelee");
});
