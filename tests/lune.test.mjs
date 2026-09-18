import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* lune.js est un script classique destiné au navigateur : on l'exécute dans un
   bac à sable plutôt que de dupliquer sa logique. Il dépend de bi() (i18n). */
function chargerLune() {
  const ctx = {
    window: {}, navigator: { language: "fr" },
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { documentElement: {} },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../i18n.js", import.meta.url), "utf8"), ctx);
  vm.runInContext(readFileSync(new URL("../lune.js", import.meta.url), "utf8"), ctx);
  return ctx.window.Lune;
}

const L = chargerLune();

test("la fraction éclairée va de zéro à un et suit le cycle", () => {
  // On balaie une lunaison complète : le minimum doit friser zéro, le maximum un.
  let mini = 1, maxi = 0;
  const depart = Date.UTC(2026, 0, 1);
  for (let j = 0; j < 30; j += 0.25) {
    const f = L.fractionEclairee(new Date(depart + j * 86400000));
    mini = Math.min(mini, f); maxi = Math.max(maxi, f);
    assert.ok(f >= 0 && f <= 1, `fraction hors bornes : ${f}`);
  }
  assert.ok(mini < 0.02, `nouvelle lune jamais atteinte (min ${mini})`);
  assert.ok(maxi > 0.98, `pleine lune jamais atteinte (max ${maxi})`);
});

test("la fraction éclairée concorde avec la phase annoncée", () => {
  // Pleine lune du 3 janvier 2026 (référence externe) : le disque doit être
  // presque entièrement éclairé, et presque éteint deux semaines plus tard.
  const pleine = new Date("2026-01-03T12:00:00Z");
  const nouvelle = new Date(pleine.getTime() + 14.77 * 86400000);
  assert.ok(L.fractionEclairee(pleine) > 0.9,
    `fraction à la pleine lune : ${L.fractionEclairee(pleine)}`);
  assert.ok(L.fractionEclairee(nouvelle) < 0.1,
    `fraction à la nouvelle lune : ${L.fractionEclairee(nouvelle)}`);
});

test("l'altitude reste physique et dépend du lieu", () => {
  const quand = new Date("2026-09-18T22:00:00Z");
  for (const [lat, lng] of [[45.87, 5.94], [-37.81, 144.96], [0.31, 32.58], [69.6, 18.9]]) {
    const a = L.altitudeLune(quand, lat, lng);
    assert.ok(a >= -90 && a <= 90, `altitude aberrante à ${lat} : ${a}`);
  }
  // Au même instant, deux lieux opposés ne voient pas la Lune au même endroit.
  const ici = L.altitudeLune(quand, 45.87, 5.94);
  const antipode = L.altitudeLune(quand, -45.87, -174.06);
  assert.notEqual(Math.round(ici), Math.round(antipode));
});

test("le Soleil est bien haut à midi et sous l'horizon à minuit", () => {
  // Contrôle de bon sens sur la fonction solaire, qui sert à isoler la nuit.
  const midi = new Date("2026-06-21T12:00:00Z");     // Greenwich, solstice
  const minuit = new Date("2026-06-21T00:00:00Z");
  assert.ok(L.altitudeSoleil(midi, 51.48, 0) > 50, "midi au solstice : soleil haut");
  assert.ok(L.altitudeSoleil(minuit, 51.48, 0) < 0, "minuit : soleil couché");
});

test("la Lune se lève et se couche à des heures qui changent chaque jour", () => {
  const heures = [];
  for (let j = 0; j < 5; j++) {
    const d = new Date(Date.UTC(2026, 8, 10 + j));
    const { lever } = L.leverCoucherLune(d, 45.87, 5.94);
    if (lever) heures.push(lever.getTime() - Date.UTC(2026, 8, 10 + j));
  }
  assert.ok(heures.length >= 4, "la Lune doit se lever presque chaque jour à cette latitude");
  // Elle se lève environ cinquante minutes plus tard chaque jour : les heures
  // relevées ne doivent surtout pas être identiques.
  assert.notEqual(heures[0], heures[1]);
});

test("l'exposition nocturne ne compte que la Lune levée pendant la nuit", () => {
  const quand = new Date("2026-09-18T00:00:00Z");
  const h = L.expositionNocturne(quand, 45.87, 5.94);
  assert.ok(h >= 0 && h <= 24, `exposition hors bornes : ${h}`);
  // Elle ne peut pas dépasser la durée de la nuit elle-même.
  let nuit = 0;
  for (let t = 0; t < 86400000; t += 600000) {
    if (L.altitudeSoleil(new Date(quand.getTime() + t), 45.87, 5.94) < -6) nuit += 1 / 6;
  }
  assert.ok(h <= nuit + 0.2, `exposition ${h} h supérieure à la nuit ${nuit.toFixed(1)} h`);
});

test("une pleine lune sous l'horizon n'éclaire rien : le relevé le distingue", () => {
  // C'est tout l'intérêt d'enregistrer l'altitude et l'exposition plutôt qu'une
  // étiquette : deux semis « en pleine lune » peuvent être très différents.
  const jour = new Date("2026-01-03T12:00:00Z");
  const releve = L.releveLunaire(jour, 45.87, 5.94);
  assert.ok(releve.fractionEclairee > 0.9);
  assert.equal(typeof releve.altitudeDeg, "number");
  assert.equal(typeof releve.expositionNocturneHeures, "number");
  assert.ok(releve.expositionNocturneHeures < 24);
});

test("le relevé fige des mesures, jamais une catégorie", () => {
  const r = L.releveLunaire(new Date("2026-09-18T09:00:00Z"), 45.87, 5.94);
  for (const champ of ["quand", "latitude", "longitude", "ageJours", "fractionEclairee",
                       "altitudeDeg", "declinaisonDeg", "expositionNocturneHeures"]) {
    assert.ok(r[champ] !== undefined, `champ manquant : ${champ}`);
  }
  assert.ok(r.ageJours >= 0 && r.ageJours < L.SYNODIQUE);
  // Aucune étiquette de phase : une analyse pourra toujours en dériver une,
  // l'inverse serait impossible.
  assert.equal(r.phase, undefined);
  assert.equal(r.couvertureNuageusePct, null, "à renseigner plus tard, jamais inventée");
});

test("aux hautes latitudes, un jour sans lever ni coucher est dit tel quel", () => {
  // Cela arrive réellement : on renvoie null plutôt que d'inventer une heure.
  let auMoinsUnNull = false;
  for (let j = 0; j < 28; j++) {
    const { lever, coucher } = L.leverCoucherLune(new Date(Date.UTC(2026, 0, 1 + j)), 78, 15);
    if (lever === null || coucher === null) auMoinsUnNull = true;
  }
  assert.equal(auMoinsUnNull, true, "au Svalbard, la Lune ne franchit pas l'horizon tous les jours");
});
