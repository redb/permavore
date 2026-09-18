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

/* ---------------------------------------------------------------------------
   Photopériode : certaines cultures se déclenchent sur la longueur du jour,
   pas sur la chaleur. C'est une contrainte géographique dure.
   --------------------------------------------------------------------------- */

test("la durée du jour est exacte et dépend de la latitude, pas d'un modèle", async () => {
  const { dureeJourMax, dureeJour } = await import("../climat-core.mjs");
  // À l'équateur, le jour ne s'écarte jamais de douze heures.
  assert.ok(Math.abs(dureeJourMax(0) - 12) < 0.2);
  // Symétrie des hémisphères : même latitude, même jour le plus long.
  assert.equal(dureeJourMax(45), dureeJourMax(-45));
  // Au-delà du cercle polaire, le soleil ne se couche plus.
  assert.equal(dureeJourMax(69.6), 24);
  // Et les saisons sont inversées : le 21 juin est court dans le sud.
  assert.ok(dureeJour(45, 172) > dureeJour(-45, 172));
});

test("une culture à photopériode est incompatible là où le jour est trop court", () => {
  const equateur = profilClimatique(serie({ tmoy: 27, amplitude: 2 }), 0.3);
  const tempere = profilClimatique(serie({ tmoy: 11, amplitude: 9 }), 45);
  const joursLongs = {
    cultiveeComme: "annuelle",
    cycle: { joursMaturite: source(150, "jours") },
    photoperiode: { source: source(1, "groupes"), groupes: [{ nom: "jours longs", heures: [14, 16] }] },
  };
  const sousEquateur = compatibiliteActuelle(joursLongs, equateur);
  assert.equal(sousEquateur.dimensions.photoperiode.etat, "defavorable");
  assert.deepEqual(sousEquateur.dimensions.photoperiode.groupesPossibles, []);
  assert.equal(sousEquateur.compatibilite, "incompatible",
    "aucune saison ne rattrapera un jour qui ne dépasse jamais douze heures");

  const sousTempere = compatibiliteActuelle(joursLongs, tempere);
  assert.notEqual(sousTempere.dimensions.photoperiode.etat, "defavorable");
  assert.deepEqual(sousTempere.dimensions.photoperiode.groupesPossibles, ["jours longs"]);
  assert.notEqual(sousTempere.compatibilite, "incompatible");
});

test("une culture à jours courts reste possible sous l'équateur", () => {
  const equateur = profilClimatique(serie({ tmoy: 27, amplitude: 2 }), 0.3);
  const joursCourts = {
    cultiveeComme: "annuelle",
    cycle: { joursMaturite: source(150, "jours") },
    photoperiode: { source: source(1, "groupes"), groupes: [{ nom: "jours courts", heures: [10, 12] }] },
  };
  const r = compatibiliteActuelle(joursCourts, equateur);
  assert.notEqual(r.dimensions.photoperiode.etat, "defavorable");
  assert.deepEqual(r.dimensions.photoperiode.groupesPossibles, ["jours courts"]);
});

/* ---------------------------------------------------------------------------
   Deux généralisations abusives à ne plus commettre : confondre un besoin
   VARIÉTAL avec une propriété d'espèce, et une durée liée au MODE
   D'IMPLANTATION avec une exigence universelle.
   --------------------------------------------------------------------------- */

const oignonTypique = () => ({
  cultiveeComme: "annuelle",
  cycle: {
    joursMaturite: { ...source(150, "jours"), modeImplantation: "semis_direct" },
    autresModes: [{ mode: "bulbille", dureeConnue: false }],
  },
  photoperiode: {
    source: source(1, "groupes"),
    groupes: [
      { nom: "jours courts", heures: [10, 12] },
      { nom: "jours intermédiaires", heures: [12, 14] },
      { nom: "jours longs", heures: [14, 16] },
    ],
  },
});

test("un besoin photopériodique variétal ne devient pas une propriété d'espèce", () => {
  const equateur = profilClimatique(serie({ tmoy: 27, amplitude: 2 }), 0.3);
  const r = compatibiliteActuelle(oignonTypique(), equateur);
  const ph = r.dimensions.photoperiode;

  assert.equal(ph.dependVariete, true);
  assert.notEqual(ph.etat, "favorable",
    "on ne déclare pas l'espèce favorable parce qu'UN groupe variétal convient");
  assert.equal(ph.etat, "inconnu");
  assert.equal(ph.groupesPossibles.includes("jours longs"), false,
    "à 12 h de jour, aucune variété à jours longs ne bulbera jamais");
  assert.equal(ph.groupesPossibles[0], "jours courts");
  assert.equal(ph.groupeIndique, "jours courts",
    "le groupe indiqué est celui dont la plage encadre la longueur du jour");
  // Et cette dimension non évaluable interdit de conclure « éprouvé ».
  assert.notEqual(r.statutLocal, "eprouve");
});

test("plus le jour s'allonge, plus de groupes variétaux deviennent possibles", () => {
  const tempere = profilClimatique(serie({ tmoy: 11, amplitude: 9 }), 45);
  const ph = compatibiliteActuelle(oignonTypique(), tempere).dimensions.photoperiode;
  assert.ok(ph.lieu > 15, `jour le plus long à 45° : ${ph.lieu} h`);
  assert.deepEqual(ph.groupesPossibles, ["jours courts", "jours intermédiaires", "jours longs"]);
  assert.equal(ph.groupeIndique, "jours longs");
  assert.equal(ph.etat, "inconnu", "toujours pas « favorable » : la variété reste inconnue");
});

test("aucun groupe variétal possible rend la culture incompatible", () => {
  // Cas théorique : une culture qui exigerait plus de jour qu'il n'y en a.
  const equateur = profilClimatique(serie({ tmoy: 27, amplitude: 2 }), 0.3);
  const exigeante = {
    cultiveeComme: "annuelle",
    cycle: { joursMaturite: { ...source(100, "jours"), modeImplantation: "semis_direct" } },
    photoperiode: { source: source(1, "groupes"), groupes: [{ nom: "jours longs", heures: [14, 16] }] },
  };
  const r = compatibiliteActuelle(exigeante, equateur);
  assert.equal(r.dimensions.photoperiode.etat, "defavorable");
  assert.deepEqual(r.dimensions.photoperiode.groupesPossibles, []);
  assert.equal(r.compatibilite, "incompatible");
});

test("une durée de cycle porte son mode d'implantation et ne vaut que pour lui", () => {
  const court = profilClimatique(serie({ tmoy: 7, amplitude: 13 }), 50);
  const r = compatibiliteActuelle(oignonTypique(), court);
  assert.equal(r.dimensions.cycle.modeImplantation, "semis_direct");
  assert.ok(Array.isArray(r.dimensions.cycle.autresModes));
  assert.equal(r.dimensions.cycle.autresModes[0].mode, "bulbille");
  assert.equal(r.dimensions.cycle.autresModes[0].dureeConnue, false,
    "d'autres modes existent, leur durée n'est pas documentée — et on le dit");
});

test("la même culture installée autrement n'est pas jugée sur la mauvaise durée", () => {
  const court = profilClimatique(serie({ tmoy: 8, amplitude: 12 }), 50);
  const semeEnPlace = oignonTypique();
  const enBulbilles = {
    ...semeEnPlace,
    cycle: { joursMaturite: { ...source(90, "jours"), modeImplantation: "bulbille" } },
  };
  const a = compatibiliteActuelle(semeEnPlace, court).dimensions.cycle;
  const b = compatibiliteActuelle(enBulbilles, court).dimensions.cycle;
  assert.equal(a.requis, 150);
  assert.equal(b.requis, 90);
  assert.equal(a.modeImplantation, "semis_direct");
  assert.equal(b.modeImplantation, "bulbille");
  // Une saison qui ne suffit pas au semis direct peut suffire aux bulbilles.
  const rang = { defavorable: 0, limite: 1, inconnu: 1, favorable: 2 };
  assert.ok(rang[b.etat] >= rang[a.etat],
    `installer autrement ne doit jamais dégrader le verdict (${a.etat} → ${b.etat}, saison ${a.lieu} j)`);
});

/* ---------------------------------------------------------------------------
   Montaison : le déclencheur diffère radicalement selon l'espèce. Un seuil
   unique aurait été faux pour au moins deux des cinq cultures du lot 2.
   --------------------------------------------------------------------------- */

test("la montaison de l'épinard se lit sur la longueur du jour", () => {
  const nordique = profilClimatique(serie({ tmoy: 8, amplitude: 12 }), 55);
  const equateur = profilClimatique(serie({ tmoy: 27, amplitude: 2 }), 0.3);
  const epinard = {
    cultiveeComme: "annuelle",
    cycle: { joursMaturite: { ...source(50, "jours"), modeImplantation: "semis_direct" } },
    montaison: { declencheur: "photoperiode", heuresRisqueEleve: source(16, "heures de jour") },
  };
  const haut = compatibiliteActuelle(epinard, nordique).dimensions.montaison;
  assert.equal(haut.declencheur, "photoperiode");
  assert.ok(haut.heuresJourMax > 16, `à 55°, le jour atteint ${haut.heuresJourMax} h`);
  assert.equal(haut.atteintSeuilEleve, true, "le risque de montaison existe bien là-haut");

  const bas = compatibiliteActuelle(epinard, equateur).dimensions.montaison;
  assert.equal(bas.atteintSeuilEleve, false, "sous l'équateur, le jour ne dépasse jamais douze heures");
});

test("la montaison du poireau se lit sur le froid, pas sur le jour", () => {
  const froid = profilClimatique(serie({ tmoy: 6, amplitude: 13 }), 50);
  const poireau = {
    cultiveeComme: "annuelle",
    cycle: { joursMaturite: { ...source(60, "jours"), modeImplantation: "semis_direct" } },
    montaison: { declencheur: "vernalisation",
      vernalisation: { temperature: source(5, "°C") } },
  };
  const m = compatibiliteActuelle(poireau, froid).dimensions.montaison;
  assert.equal(m.declencheur, "vernalisation");
  assert.equal(Number.isFinite(m.minimumHivernal), true, "c'est l'hiver qui est regardé");
  assert.equal(m.heuresJourMax, undefined, "et surtout pas la longueur du jour");
});

test("la montaison ne conclut jamais au niveau de l'espèce", () => {
  // La résistance à la montaison est un caractère variétal dans les trois
  // espèces où les sources se prononcent : le moteur ne tranche donc pas.
  const lieu = profilClimatique(serie({ tmoy: 11, amplitude: 9 }), 45);
  for (const declencheur of ["photoperiode", "vernalisation", "mixte"]) {
    const culture = {
      cultiveeComme: "annuelle",
      cycle: { joursMaturite: { ...source(50, "jours"), modeImplantation: "semis_direct" } },
      montaison: { declencheur, heuresRisqueEleve: source(16, "heures"),
        vernalisation: { temperature: source(5, "°C") } },
    };
    const r = compatibiliteActuelle(culture, lieu);
    assert.equal(r.dimensions.montaison.etat, "inconnu", declencheur);
    assert.equal(r.dimensions.montaison.dependVariete, true);
    assert.equal(r.dimensions.montaison.bloquant, false,
      "un risque de montaison ne rend jamais une culture impossible");
  }
});

test("une culture sans montaison documentée n'a tout simplement pas la dimension", () => {
  const lieu = profilClimatique(serie({ tmoy: 11, amplitude: 9 }), 45);
  const concombre = {
    cultiveeComme: "annuelle",
    cycle: { joursMaturite: { ...source(50, "jours"), modeImplantation: "semis_direct" } },
  };
  assert.equal(compatibiliteActuelle(concombre, lieu).dimensions.montaison, undefined);
});

test("les cultures du lot 2 se comportent identiquement dans les deux hémisphères", async () => {
  // La validation en conditions réelles sur Melbourne reste bloquée par la
  // limite de débit d'Open-Meteo. Ce test la remplace sans la contourner : il
  // vérifie l'invariance exacte sur des séries synthétiques miroir, ce qu'un
  // relevé unique ne prouverait de toute façon pas.
  const { readFileSync } = await import("node:fs");
  const vmMod = await import("node:vm");
  const ctx = { window: {} };
  vmMod.createContext(ctx);
  vmMod.runInContext(readFileSync(new URL("../agronomie.js", import.meta.url), "utf8"), ctx);
  const profils = ctx.window.PROFILS_AGROCLIMATIQUES;

  const nord = profilClimatique(serie({ tmoy: 11, amplitude: 9, dephasage: 6 }), 45);
  const sud = profilClimatique(serie({ tmoy: 11, amplitude: 9, dephasage: 0 }), -45);
  assert.equal(nord.hemisphere, "nord");
  assert.equal(sud.hemisphere, "sud");
  assert.equal(nord.heuresJourMax, sud.heuresJourMax, "même latitude, même jour le plus long");

  for (const id of ["radis", "poireau", "epinard", "betterave", "concombre"]) {
    const a = compatibiliteActuelle(profils[id], nord);
    const b = compatibiliteActuelle(profils[id], sud);
    assert.equal(a.compatibilite, b.compatibilite, `${id} : compatibilité`);
    assert.equal(a.statutLocal, b.statutLocal, `${id} : statut local`);
    assert.deepEqual(Object.keys(a.dimensions).sort(), Object.keys(b.dimensions).sort(),
      `${id} : mêmes dimensions évaluées`);
    if (a.dimensions.montaison) {
      assert.equal(a.dimensions.montaison.declencheur, b.dimensions.montaison.declencheur);
      assert.equal(a.dimensions.montaison.atteintSeuilEleve,
        b.dimensions.montaison.atteintSeuilEleve, `${id} : risque de montaison`);
    }
  }
});

test("le poireau, absent de la FAO, n'emprunte rien à l'oignon", async () => {
  const { readFileSync } = await import("node:fs");
  const vmMod = await import("node:vm");
  const ctx = { window: {} };
  vmMod.createContext(ctx);
  vmMod.runInContext(readFileSync(new URL("../agronomie.js", import.meta.url), "utf8"), ctx);
  const P = ctx.window.PROFILS_AGROCLIMATIQUES;

  // Le poireau est absent des tables 11, 12, 22 et 24 de la FAO. Ni p, ni
  // profondeur d'enracinement, ni Ky, ni température de germination.
  assert.equal(P.poireau.eau, undefined, "aucune valeur d'eau ne doit apparaître");
  assert.equal(P.poireau.germination, undefined, "ni température de germination");
  // Et surtout, rien ne doit venir de l'oignon.
  assert.ok(P.oignon.eau.pFAO.valeur, "l'oignon, lui, a bien ses valeurs");
  const lieu = profilClimatique(serie(), 45);
  const r = compatibiliteActuelle(P.poireau, lieu);
  assert.equal(r.dimensions.eau, undefined);
  assert.equal(r.dimensionsDocumentees, 2, "seulement le cycle et la montaison");
});
