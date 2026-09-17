import test from "node:test";
import assert from "node:assert/strict";
import {
  profilClimatique, classifierKoppen, zoneUSDA, zoneChaleurAHS, et0Hargreaves,
  compatibiliteActuelle, tendance, valeurUtilisable, ecartSignificatif,
  synthesePreuves, HEURISTIQUES_MOTEUR,
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

/** Fabrique une preuve locale de test. Par défaut : observation de jardinier. */
const preuve = (champs = {}) => ({
  type: "observationJardinier", fort: false, resultat: "pousse", distance: 3,
  date: "2026", lieu: { nom: "ici" }, source: "un jardinier", confiance: "haute",
  environnement: "pleine_terre", ...champs,
});

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
  assert.equal(r.dimensionsDocumentees, 1);
  assert.equal(r.statutLocal, "indetermine", "une seule dimension ne démontre rien");
  assert.equal(r.confiance, "faible");
});

test("une saison trop courte rend la culture incompatible, pas « expérimentale »", () => {
  const froid = profilClimatique(serie({ tmoy: 3, amplitude: 12 }), 60);
  const culture = { cycle: { saisonSansGelMin: source(200, "jours"),
                             degresJours10Min: source(2000, "dj") } };
  const r = compatibiliteActuelle(culture, froid);
  assert.equal(r.compatibilite, "incompatible");
  assert.equal(r.faisabiliteCycleAnnuel, "impossible");
  assert.equal(r.dimensions.cycle.etat, "defavorable");
  assert.equal(r.statutLocal, "indetermine", "incompatible n'est pas « expérimental »");
});

test("éprouvé se juge sur le lieu, pas sur l'origine de la plante", () => {
  const doux = profilClimatique(serie({ tmoy: 16, amplitude: 8 }), 40);
  const exotique = { cycle: { saisonSansGelMin: source(120, "jours"),
                              degresJours10Min: source(1200, "dj") } };
  const r = compatibiliteActuelle(exotique, doux);
  assert.equal(r.compatibilite, "compatible");
  assert.equal(r.statutLocal, "eprouve");
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

test("une exigence documentée mais non mesurable interdit le classement « éprouvé »", () => {
  // Cas de la patate douce en climat tempéré : la saison sans gel suffit
  // largement, mais la culture réclame une chaleur dont aucune source ne dit
  // combien de jours elle exige. Conclure « éprouvé » serait un faux positif.
  const tempere = profilClimatique(serie({ tmoy: 11, amplitude: 9 }), 45);
  const culture = {
    cycle: { joursMaturite: source(120, "jours") },
    chaleur: { seuilMinCroissance: source(25, "°C") },
    eau: { sensibiliteDeficit: source(1, "1-3") },
  };
  const r = compatibiliteActuelle(culture, tempere);
  assert.equal(r.compatibilite, "compatible", "le cycle est faisable");
  assert.equal(r.statutLocal, "indetermine", "ne pas savoir n'est pas « expérimental »");
  assert.equal(r.dimensions.besoinChaleur.etat, "inconnu");
  assert.equal(r.dimensions.besoinChaleur.quantifiable, false);
  assert.equal(r.dimensions.cycle.etat, "favorable", "le gel n'est pas le facteur limitant");
  // Trois dimensions documentées, mais l'une n'est pas quantifiable : la
  // confiance ne peut pas être « haute », sans tomber pour autant au plus bas.
  assert.notEqual(r.confiance, "haute");
  assert.equal(r.confiance, "moyenne");
});

test("un succès local isolé ne produit pas « éprouvé »", () => {
  const tempere = profilClimatique(serie({ tmoy: 11, amplitude: 9 }), 45);
  const culture = {
    cultiveeComme: "annuelle",
    cycle: { joursMaturite: source(120, "jours") },
    chaleur: { seuilMinCroissance: source(25, "°C") },
    eau: { sensibiliteDeficit: source(1, "1-3") },
  };
  const un = [preuve({ resultat: "pousse" })];
  const r = compatibiliteActuelle(culture, tempere, un);
  assert.equal(r.compatibilite, "compatible");
  assert.equal(r.statutLocal, "indetermine", "une observation n'est pas une conclusion");
  assert.equal(r.dimensions.preuvesLocales.conclut, false);

  // Trois observations concordantes, en revanche, démontrent quelque chose.
  const trois = [0, 1, 2].map(i => preuve({ resultat: "pousse", distance: 3 + i }));
  assert.equal(compatibiliteActuelle(culture, tempere, trois).statutLocal, "eprouve");
});

test("un échec local isolé ne produit pas « expérimental »", () => {
  const doux = profilClimatique(serie({ tmoy: 16, amplitude: 8 }), 40);
  const culture = { cultiveeComme: "annuelle",
    cycle: { joursMaturite: source(120, "jours"), degresJours10Min: source(1200, "dj") } };
  const r = compatibiliteActuelle(culture, doux, [preuve({ resultat: "echec" })]);
  assert.equal(r.statutLocal, "eprouve",
    "un échec isolé ne renverse pas des exigences quantifiées toutes tenues");
  assert.equal(r.dimensions.preuvesLocales.conclut, false);

  // Des échecs répétés, eux, comptent.
  const echecs = [0, 1, 2].map(i => preuve({ resultat: "echec", distance: 2 + i }));
  assert.equal(compatibiliteActuelle(culture, doux, echecs).statutLocal, "experimental");
});

test("des observations contradictoires ne fabriquent aucune conclusion", () => {
  const doux = profilClimatique(serie({ tmoy: 16, amplitude: 8 }), 40);
  const culture = { cultiveeComme: "annuelle",
    cycle: { joursMaturite: source(120, "jours"), degresJours10Min: source(1200, "dj") } };
  const melange = [preuve({ resultat: "recolte" }), preuve({ resultat: "echec", distance: 4 }),
                   preuve({ resultat: "pousse", distance: 6 }), preuve({ resultat: "echec", distance: 8 })];
  const r = compatibiliteActuelle(culture, doux, melange);
  assert.equal(r.dimensions.preuvesLocales.contradictoire, true);
  assert.equal(r.statutLocal, "indetermine", "pas de moyenne artificielle");
});

test("une preuve agronomique locale solide peut suffire à établir « éprouvé »", () => {
  const tempere = profilClimatique(serie({ tmoy: 11, amplitude: 9 }), 45);
  const culture = {
    cultiveeComme: "annuelle",
    cycle: { joursMaturite: source(120, "jours") },
    chaleur: { seuilMinCroissance: source(25, "°C") },   // non quantifiable
  };
  assert.equal(compatibiliteActuelle(culture, tempere).statutLocal, "indetermine");
  const essai = [preuve({ type: "essaiVarietal", fort: true, resultat: "recolteReguliere",
    source: "essai variétal d'un institut technique" })];
  const r = compatibiliteActuelle(culture, tempere, essai);
  assert.equal(r.statutLocal, "eprouve");
  assert.equal(r.dimensions.preuvesLocales.fortes, 1);
});

test("les heuristiques du moteur sont nommées et centralisées, jamais des données", () => {
  assert.equal(typeof HEURISTIQUES_MOTEUR.margeDureeRelative, "number");
  assert.equal(HEURISTIQUES_MOTEUR.margeTemperatureC, 3);
  assert.match(HEURISTIQUES_MOTEUR.origine, /non sourcée/);
  // Aucune heuristique ne doit porter de champ « source » : ce ne sont pas des
  // données agronomiques, et rien ne doit pouvoir les confondre avec.
  assert.equal(valeurUtilisable(HEURISTIQUES_MOTEUR), false);
});

test("la synthèse distingue le nombre, la force et la contradiction", () => {
  assert.equal(synthesePreuves([]).total, 0);
  assert.equal(synthesePreuves([preuve({ resultat: "pousse" })]).conclut, false);
  const fortes = synthesePreuves([preuve({ type: "institutTechnique", fort: true, resultat: "recolte" })]);
  assert.equal(fortes.demontrePositif, true);
  const opposees = synthesePreuves([
    preuve({ type: "institutTechnique", fort: true, resultat: "recolte" }),
    preuve({ type: "universite", fort: true, resultat: "echec" })]);
  assert.equal(opposees.contradictoire, true);
  assert.equal(opposees.conclut, false);
});

test("un retour positif ne masque pas un seuil bloquant : il le met en doute", () => {
  const froid = profilClimatique(serie({ tmoy: 3, amplitude: 12 }), 60);
  const culture = {
    cycle: { joursMaturite: source(200, "jours"), degresJours10Min: source(2000, "dj") },
  };
  const r = compatibiliteActuelle(culture, froid, [preuve({ resultat: "recolte", distance: 5 })]);
  assert.equal(r.compatibilite, "incompatible", "le seuil bloquant reste affiché");
  assert.equal(r.contradiction, true, "mais la contradiction est signalée");
});

test("un échec rapporté sur place empêche le classement « éprouvé »", () => {
  const doux = profilClimatique(serie({ tmoy: 16, amplitude: 8 }), 40);
  const culture = { cycle: { joursMaturite: source(120, "jours"),
                             degresJours10Min: source(1200, "dj") } };
  assert.equal(compatibiliteActuelle(culture, doux).statutLocal, "eprouve");
  const echecs = [0, 1, 2].map(i => preuve({ resultat: "echec", distance: 2 + i }));
  const r = compatibiliteActuelle(culture, doux, echecs);
  assert.equal(r.statutLocal, "experimental", "des échecs répétés retirent « éprouvé »");
  assert.equal(r.compatibilite, "compatible", "sans rendre la culture impossible");
});

/* ---------------------------------------------------------------------------
   Les six cas conceptuels : ne jamais confondre rusticité, tolérance à la
   chaleur, besoin de chaleur, durée de cycle, besoin en froid, faisabilité
   annuelle, survie vivace, niveau de confiance et statut local.
   --------------------------------------------------------------------------- */

const climatTempere = () => profilClimatique(serie({ tmoy: 11, amplitude: 9 }), 45);

test("CAS 1 — une vivace tropicale menée en annuelle n'est pas jugée sur sa rusticité", () => {
  const lieu = climatTempere();
  const culture = {
    cultiveeComme: "annuelle",
    rusticite: { tempMinTolere: source(10, "°C") },   // ne survivrait jamais à l'hiver
    cycle: { joursMaturite: source(120, "jours") },
    eau: { sensibiliteDeficit: source(1, "1-3") },
  };
  const r = compatibiliteActuelle(culture, lieu);
  assert.equal(r.compatibilite, "compatible");
  assert.equal(r.survieVivaceAuFroid, "sansObjet");
  assert.equal(r.dimensions.rusticite, undefined, "la rusticité ne doit pas être évaluée");
});

test("CAS 2 — un besoin thermique non quantifiable donne « indéterminé », pas « expérimental »", () => {
  const lieu = climatTempere();
  const culture = {
    cultiveeComme: "annuelle",
    cycle: { joursMaturite: source(120, "jours") },
    chaleur: { seuilMinCroissance: source(25, "°C") },   // sans joursMinAuDessus
  };
  const r = compatibiliteActuelle(culture, lieu);
  assert.equal(r.dimensions.besoinChaleur.quantifiable, false);
  assert.notEqual(r.statutLocal, "experimental", "l'ignorance n'est pas une propriété agronomique");
  assert.equal(r.statutLocal, "indetermine");
  assert.equal(r.compatibilite, "compatible", "le cycle reste faisable");
});

test("CAS 3 — un besoin quantifié tout juste atteint peut donner « expérimental »", () => {
  const lieu = climatTempere();
  const dispo = lieu.joursAuDessus[25];
  const culture = {
    cultiveeComme: "annuelle",
    cycle: { joursMaturite: source(120, "jours") },
    chaleur: { seuilMinCroissance: source(25, "°C"),
               joursMinAuDessus: source(Math.round(dispo * 0.9), "jours") },
  };
  const r = compatibiliteActuelle(culture, lieu);
  assert.equal(r.dimensions.besoinChaleur.etat, "limite");
  assert.equal(r.statutLocal, "experimental");
  assert.equal(r.compatibilite, "compatible");
});

test("CAS 4 — conditions largement suffisantes : compatible, et « éprouvé » justifié", () => {
  const lieu = climatTempere();
  const culture = {
    cultiveeComme: "annuelle",
    cycle: { joursMaturite: source(80, "jours"), degresJours10Min: source(600, "dj") },
  };
  const r = compatibiliteActuelle(culture, lieu);
  assert.equal(r.compatibilite, "compatible");
  assert.equal(r.statutLocal, "eprouve");
  assert.equal(r.dimensions.cycle.etat, "favorable");
});

test("CAS 5 — une vivace qui ne survit pas à l'hiver local est incompatible EN VIVACE", () => {
  const lieu = climatTempere();
  const culture = {
    cultiveeComme: "perenne",
    rusticite: { tempMinTolere: source(5, "°C") },
    cycle: { joursMaturite: source(120, "jours") },
  };
  const r = compatibiliteActuelle(culture, lieu);
  assert.equal(r.compatibilite, "incompatible");
  assert.equal(r.survieVivaceAuFroid, "impossible");
});

test("CAS 6 — la même espèce menée en annuelle est réévaluée, pas condamnée d'office", () => {
  const lieu = climatTempere();
  const commeVivace = { cultiveeComme: "perenne",
    rusticite: { tempMinTolere: source(5, "°C") },
    cycle: { joursMaturite: source(120, "jours") } };
  const commeAnnuelle = { ...commeVivace, cultiveeComme: "annuelle" };
  assert.equal(compatibiliteActuelle(commeVivace, lieu).compatibilite, "incompatible");
  assert.equal(compatibiliteActuelle(commeAnnuelle, lieu).compatibilite, "compatible");
});

test("un seul retour « ça pousse » ne suffit pas à démontrer « éprouvé »", () => {
  const lieu = climatTempere();
  const culture = {
    cultiveeComme: "annuelle",
    cycle: { joursMaturite: source(120, "jours") },
    chaleur: { seuilMinCroissance: source(25, "°C") },
  };
  const r = compatibiliteActuelle(culture, lieu, [preuve({ resultat: "pousse", distance: 5 })]);
  assert.equal(r.compatibilite, "compatible");
  assert.equal(r.statutLocal, "indetermine", "« pousse » n'est pas « réussit régulièrement »");
  assert.equal(r.confiance, "moyenne");

  const trois = [0, 1, 2].map(i => preuve({ resultat: "recolte", distance: 5 + i }));
  assert.equal(compatibiliteActuelle(culture, lieu, trois).statutLocal, "eprouve");
});

test("un abri dont on ne sait rien ne rend jamais le verdict meilleur", async () => {
  const { environnementCulture, profilSousEnvironnement } = await chargerEnvironnements();
  const lieu = profilClimatique(serie({ tmoy: 11, amplitude: 9 }), 45);

  const dehors = profilSousEnvironnement(lieu, environnementCulture("pleine_terre"));
  assert.equal(dehors.connu, true);
  assert.equal(dehors.profil.saisonSansGel, lieu.saisonSansGel);

  const serreInconnue = profilSousEnvironnement(lieu, environnementCulture("serre_froide"));
  assert.equal(serreInconnue.connu, false, "aucun bonus supposé");
  assert.equal(serreInconnue.profil, null);
  assert.equal(serreInconnue.raison, "abri_non_caracterise");

  // Le jardinier déclare que sa serre ne descend pas sous 2 °C : on n'utilise
  // que cela, et rien d'autre — pas de gain de chaleur estivale inventé.
  const serreDeclaree = profilSousEnvironnement(lieu,
    environnementCulture("serre_froide", { temperatureMinConnue: 2 }));
  assert.equal(serreDeclaree.connu, true);
  assert.equal(serreDeclaree.profil.sansGelToutelAnnee, true);
  assert.equal(serreDeclaree.profil.joursChauds, lieu.joursChauds, "l'été n'est pas modifié");
});

async function chargerEnvironnements() {
  const { readFileSync } = await import("node:fs");
  const vm = await import("node:vm");
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../environnements.js", import.meta.url), "utf8"), ctx);
  return ctx.window.Environnements;
}
