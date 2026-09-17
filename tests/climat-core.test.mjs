import test from "node:test";
import assert from "node:assert/strict";
import {
  profilClimatique, classifierKoppen, zoneUSDA, zoneChaleurAHS, et0Hargreaves,
  compatibiliteActuelle, tendance, valeurUtilisable, ecartSignificatif,
} from "../climat-core.mjs";
import { fenetres } from "../functions/api/climat.js";

/* Générateur de série quotidienne synthétique. `dephasage` décale la saison
   chaude dans l'année : c'est ce qui distingue les deux hémisphères. */
function serie({ tmoy = 11, amplitude = 9, dephasage = 6, pluie = 2.5,
                 annees = 6, debut = 2010 } = {}) {
  const time = [], tmin = [], tmax = [], precip = [];
  const curseur = new Date(Date.UTC(debut, 0, 1));
  const fin = Date.UTC(debut + annees, 0, 1);
  while (curseur.getTime() < fin) {
    const iso = curseur.toISOString().slice(0, 10);
    const jour = Math.floor((curseur - Date.UTC(curseur.getUTCFullYear(), 0, 1)) / 86400000) + 1;
    // dephasage en mois : 6 = maximum en juillet (nord), 0 = en janvier (sud).
    const t = tmoy + amplitude * Math.cos((2 * Math.PI * (jour / 365.25 * 12 - 1 - dephasage)) / 12);
    time.push(iso); tmin.push(t - 6); tmax.push(t + 6); precip.push(pluie);
    curseur.setUTCDate(curseur.getUTCDate() + 1);
  }
  return { time, tmin, tmax, precip };
}

const source = (valeur, unite) => ({ valeur, unite, source: "test", url: "x", confiance: "haute" });

test("un même climat donne le même profil dans les deux hémisphères", () => {
  const nord = profilClimatique(serie({ dephasage: 6 }), 45);
  const sud = profilClimatique(serie({ dephasage: 0 }), -45);
  assert.ok(Math.abs(nord.saisonSansGel - sud.saisonSansGel) <= 2,
    `nord ${nord.saisonSansGel} vs sud ${sud.saisonSansGel}`);
  assert.ok(Math.abs(nord.joursChauds - sud.joursChauds) <= 2);
  assert.equal(nord.zoneUSDA, sud.zoneUSDA);
  assert.equal(nord.hemisphere, "nord");
  assert.equal(sud.hemisphere, "sud");
  // L'ancre de l'année climatique, elle, tombe bien à six mois d'écart.
  assert.ok(Math.abs(Math.abs(nord.ancreSaisonFroide - sud.ancreSaisonFroide) - 182) < 20);
});

test("la saison sans gel n'est pas coupée en deux par le 1er janvier", () => {
  // Hémisphère nord : la saison chaude est au milieu de l'année civile, donc
  // un découpage naïf ne la casse pas. Hémisphère sud : elle est à cheval sur
  // deux années civiles, et c'est là qu'un découpage calendaire échouerait.
  const sud = profilClimatique(serie({ dephasage: 0, tmoy: 10, amplitude: 11 }), -35);
  const nord = profilClimatique(serie({ dephasage: 6, tmoy: 10, amplitude: 11 }), 35);
  assert.ok(sud.saisonSansGel > 150, `saison australe tronquée : ${sud.saisonSansGel}`);
  assert.ok(Math.abs(sud.saisonSansGel - nord.saisonSansGel) <= 2);
});

test("sous les tropiques, l'absence de gel est constatée et non supposée", () => {
  const p = profilClimatique(serie({ tmoy: 27, amplitude: 2 }), 4);
  assert.equal(p.sansGelToutelAnnee, true);
  assert.ok(p.saisonSansGel >= 330);
  assert.equal(p.minimumHivernal > 15, true);
});

test("les zones USDA et AHS suivent leurs définitions publiées", () => {
  assert.equal(zoneUSDA(-51.5), "1a");
  assert.equal(zoneUSDA(-50), "1a");   // 1a va de -51,1 à -48,3 °C
  assert.equal(zoneUSDA(-47), "1b");
  assert.equal(zoneUSDA(-17.5), "7a");
  assert.equal(zoneUSDA(null), null);
  assert.equal(zoneChaleurAHS(0), 1);
  assert.equal(zoneChaleurAHS(8), 3);
  assert.equal(zoneChaleurAHS(250), 12);
});

test("Köppen classe identiquement deux hémisphères au même climat", () => {
  const nord = classifierKoppen(serie({ dephasage: 6 }));
  const sud = classifierKoppen(serie({ dephasage: 0 }));
  assert.equal(nord.code, sud.code);
  assert.equal(nord.groupe, "C");
});

test("ET0 de Hargreaves reste positive et saisonnière aux deux hémisphères", () => {
  const juinNord = et0Hargreaves(12, 24, 45, 172);
  const decNord = et0Hargreaves(-1, 6, 45, 355);
  assert.ok(juinNord > decNord);
  const juinSud = et0Hargreaves(12, 24, -45, 172);
  assert.ok(juinSud > 0 && juinSud < juinNord, "juin est l'hiver austral");
});

test("une valeur sans source n'est jamais exploitée", () => {
  assert.equal(valeurUtilisable({ valeur: 120, unite: "jours" }), false);
  assert.equal(valeurUtilisable({ valeur: 120, unite: "jours", source: "INRAE" }), true);
  const lieu = profilClimatique(serie(), 45);
  const c = { cycle: { saisonSansGelMin: { valeur: 120, unite: "jours" } },
              chaleur: { seuilStressThermique: { valeur: 34, source: "test" } } };
  const r = compatibiliteActuelle(c, lieu);
  assert.equal(r.dimensions.cycle, undefined, "le seuil sans source doit être ignoré");
});

test("une culture trop peu documentée n'est pas classée", () => {
  const lieu = profilClimatique(serie(), 45);
  const r = compatibiliteActuelle({ cycle: { saisonSansGelMin: source(100, "jours") } }, lieu);
  assert.equal(r.statut, "nonEvalue");
  assert.equal(r.dimensionsDocumentees, 1);
});

test("une saison trop courte rend la culture incompatible, pas « expérimentale »", () => {
  const froid = profilClimatique(serie({ tmoy: 3, amplitude: 12 }), 60);
  const culture = { cycle: { saisonSansGelMin: source(200, "jours"),
                             degresJours10Min: source(2000, "dj") } };
  const r = compatibiliteActuelle(culture, froid);
  assert.equal(r.statut, "incompatible");
  assert.equal(r.dimensions.cycle.etat, "defavorable");
});

test("éprouvé se juge sur le lieu, pas sur l'origine de la plante", () => {
  const doux = profilClimatique(serie({ tmoy: 16, amplitude: 8 }), 40);
  const exotique = { cycle: { saisonSansGelMin: source(120, "jours"),
                              degresJours10Min: source(1200, "dj") } };
  assert.equal(compatibiliteActuelle(exotique, doux).statut, "eprouve");
});

test("un écart plus petit que la variabilité locale n'est pas une tendance", () => {
  assert.equal(ecartSignificatif(4, 12, 7), false);
  assert.equal(ecartSignificatif(15, 12, 7), true);
  const lieu = profilClimatique(serie(), 45);
  const culture = { cycle: { saisonSansGelMin: source(120, "jours"),
                             degresJours10Min: source(1000, "dj") } };
  const t = tendance(culture, { ...lieu, variabilite: { ...lieu.variabilite, saisonSansGel: 20 } },
    { deltas: { saisonSansGel: 8 }, accord: { saisonSansGel: true }, projete: {} });
  assert.equal(t.sens, "indisponible");
  assert.equal(t.raison, "sous_la_variabilite");
});

test("des modèles en désaccord ne produisent aucune tendance", () => {
  const lieu = profilClimatique(serie(), 45);
  const culture = { cycle: { saisonSansGelMin: source(120, "jours"),
                             degresJours10Min: source(1000, "dj") } };
  const t = tendance(culture, lieu,
    { deltas: { saisonSansGel: 30 }, accord: { saisonSansGel: false }, projete: {} });
  assert.equal(t.sens, "indisponible");
  assert.equal(t.raison, "modeles_en_desaccord");
});

test("sans seuils sourcés, aucune projection n'est produite", () => {
  const lieu = profilClimatique(serie(), 45);
  const t = tendance({ cycle: {} }, lieu,
    { deltas: { saisonSansGel: 30 }, accord: { saisonSansGel: true }, projete: {} });
  assert.equal(t.sens, "indisponible");
  assert.equal(t.raison, "seuils_absents");
});

test("le réchauffement n'est pas favorable quand il fait perdre le froid hivernal", () => {
  // Cas du fruitier : la saison s'allonge, mais les heures de froid passent
  // sous le besoin de dormance. Le gain ne doit pas l'emporter.
  const lieu = profilClimatique(serie({ tmoy: 11, amplitude: 9 }), 45);
  lieu.heuresFroid = 1100; lieu.variabilite.heuresFroid = 80;
  const fruitier = {
    perenne: true,
    cycle: { saisonSansGelMin: source(150, "jours") },
    froidHivernal: { heuresFroidMin: source(1000, "heures") },
    rusticite: { tempMinTolere: source(-30, "°C") },
  };
  const t = tendance(fruitier, lieu, {
    deltas: { saisonSansGel: 20, heuresFroid: -250 },
    accord: { saisonSansGel: true, heuresFroid: true },
    projete: { saisonSansGel: 210, heuresFroid: 850 },
  });
  assert.equal(t.sens, "defavorable");
  assert.ok(t.reserves.includes("froidHivernal"));
});

test("la fenêtre future glisse avec le temps", () => {
  assert.deepEqual(fenetres(new Date("2026-06-01")).futur, { debut: 2031, fin: 2040 });
  assert.deepEqual(fenetres(new Date("2031-06-01")).futur, { debut: 2036, fin: 2045 });
});
