import test from "node:test";
import assert from "node:assert/strict";
import { cleCacheClimat, VERSION_MOTEUR_CLIMAT } from "../climat-core.mjs";

const base = {
  maille: "45.9,5.9",
  fenetreObservee: "2006-2025",
  fenetreFuture: "2031-2040",
  modeles: ["EC_Earth3P_HR", "MRI_AGCM3_2_S"],
  variables: ["tmin", "tmax", "precip"],
};

test("la clé de cache est stable : rien ne change si rien ne change", () => {
  assert.equal(cleCacheClimat(base), cleCacheClimat({ ...base }));
  // L'ordre des modèles ou des variables ne doit pas créer une nouvelle clé.
  assert.equal(cleCacheClimat(base),
    cleCacheClimat({ ...base, modeles: ["MRI_AGCM3_2_S", "EC_Earth3P_HR"] }));
  assert.equal(cleCacheClimat(base),
    cleCacheClimat({ ...base, variables: ["precip", "tmax", "tmin"] }));
});

test("la clé change quand — et seulement quand — le calcul change", () => {
  const differentes = [
    { ...base, maille: "45.8,5.9" },
    { ...base, version: VERSION_MOTEUR_CLIMAT + 1 },
    { ...base, fenetreObservee: "2007-2026" },
    { ...base, fenetreFuture: "2032-2041" },
    { ...base, modeles: ["EC_Earth3P_HR"] },
    { ...base, variables: ["tmin", "tmax"] },
  ];
  for (const d of differentes) {
    assert.notEqual(cleCacheClimat(d), cleCacheClimat(base), JSON.stringify(d).slice(0, 60));
  }
});

test("la fenêtre glissante invalide le cache au changement d'année, pas avant", () => {
  const cle2026 = cleCacheClimat({ ...base, fenetreObservee: "2006-2025", fenetreFuture: "2031-2040" });
  const memeAnnee = cleCacheClimat({ ...base, fenetreObservee: "2006-2025", fenetreFuture: "2031-2040" });
  const anneeSuivante = cleCacheClimat({ ...base, fenetreObservee: "2007-2026", fenetreFuture: "2032-2041" });
  assert.equal(cle2026, memeAnnee, "pendant l'année, aucun recalcul");
  assert.notEqual(cle2026, anneeSuivante, "au changement d'année, recalcul légitime");
});

test("le profil appartient à la maille, pas à la culture", () => {
  // Deux points distincts à moins de 11 km tombent sur la même maille et
  // partagent donc le même profil : c'est ce qui borne le nombre d'appels.
  const g = (v) => (Math.round(v / 0.1) * 0.1).toFixed(1);
  const m1 = `${g(45.866)},${g(5.941)}`;
  const m2 = `${g(45.872)},${g(5.949)}`;
  assert.equal(m1, m2, "deux jardins voisins = une seule collecte");
  assert.equal(cleCacheClimat({ ...base, maille: m1 }), cleCacheClimat({ ...base, maille: m2 }));
});

/*
   Simulation du comportement de la couche navigateur, sans navigateur : on
   reproduit la logique de décision (mémoire → cache → réseau) pour vérifier le
   nombre d'appels réellement déclenchés par un usage courant.
*/
function simulateur({ cacheInitial = null, reseauEchoue = false } = {}) {
  const compteurs = { memoire: 0, cache: 0, reseau: 0, perime: 0 };
  let memoire = null;
  let cache = cacheInitial;
  const enVol = new Map();
  return {
    compteurs,
    async charger(cle, m) {
      if (memoire && memoire.cle === cle) { compteurs.memoire++; return memoire; }
      if (cache && cache.cle === cle) { compteurs.cache++; memoire = cache; return cache; }
      if (enVol.has(m)) return enVol.get(m);
      const p = (async () => {
        compteurs.reseau++;
        if (reseauEchoue) {
          if (cache) { compteurs.perime++; memoire = { ...cache, perime: true }; return memoire; }
          throw new Error("indisponible");
        }
        const frais = { cle, maille: m, dateCalcul: new Date().toISOString() };
        cache = frais; memoire = frais;
        return frais;
      })().finally(() => enVol.delete(m));
      enVol.set(m, p);
      return p;
    },
  };
}

test("consulter quarante cultures ne déclenche qu'un seul appel", async () => {
  const s = simulateur();
  const cle = cleCacheClimat(base);
  for (let i = 0; i < 40; i++) await s.charger(cle, base.maille);
  assert.equal(s.compteurs.reseau, 1, "une seule collecte pour tout le jardin");
  assert.equal(s.compteurs.memoire, 39);
});

test("bouger les curseurs, enraciner, ouvrir le plan : zéro appel", async () => {
  const s = simulateur();
  const cle = cleCacheClimat(base);
  await s.charger(cle, base.maille);
  const avant = s.compteurs.reseau;
  for (const action of ["curseurNourricier", "curseurExperimental", "enraciner",
                        "ouvrirPlan", "changerPage", "ouvrirFiche"]) {
    await s.charger(cle, base.maille);
  }
  assert.equal(s.compteurs.reseau, avant, "aucune de ces actions ne touche la source");
});

test("rouvrir l'application avec un cache valide ne rappelle pas la source", async () => {
  const cle = cleCacheClimat(base);
  const s = simulateur({ cacheInitial: { cle, maille: base.maille, dateCalcul: new Date().toISOString() } });
  await s.charger(cle, base.maille);
  assert.equal(s.compteurs.reseau, 0, "zéro appel au redémarrage");
  assert.equal(s.compteurs.cache, 1);
});

test("dix demandes simultanées sur une maille ne font qu'un appel", async () => {
  const s = simulateur();
  const cle = cleCacheClimat(base);
  const resultats = await Promise.all(
    Array.from({ length: 10 }, () => s.charger(cle, base.maille)));
  assert.equal(s.compteurs.reseau, 1, "single-flight : une seule collecte partagée");
  assert.equal(resultats.length, 10);
});

test("source indisponible : on garde le profil ancien plutôt que de marteler", async () => {
  const cle = cleCacheClimat(base);
  const ancien = { cle: cleCacheClimat({ ...base, version: VERSION_MOTEUR_CLIMAT - 1 }),
    maille: base.maille, dateCalcul: "2026-01-01T00:00:00.000Z" };
  const s = simulateur({ cacheInitial: ancien, reseauEchoue: true });
  const r = await s.charger(cle, base.maille);
  assert.equal(r.perime, true, "le profil est servi, marqué comme daté");
  assert.equal(s.compteurs.reseau, 1, "un seul essai, pas une boucle");
});

test("l'attente après échec croît et n'est jamais identique pour tous", () => {
  const attente = (echecs) => {
    const base = Math.min(60000 * 2 ** (echecs - 1), 6 * 3600 * 1000);
    return { min: base * 0.75, max: base * 1.25 };
  };
  assert.equal(attente(1).min, 45000);
  assert.ok(attente(3).min > attente(2).min, "l'attente croît");
  assert.ok(attente(6).max <= 6 * 3600 * 1000 * 1.25, "et reste bornée");
  // Le facteur aléatoire évite que tous les navigateurs réessaient ensemble.
  assert.notEqual(attente(2).min, attente(2).max);
});

/* ---------------------------------------------------------------------------
   Non-régression : un changement du moteur susceptible de modifier le profil
   doit invalider le cache correspondant — celui du navigateur ET celui du bord
   du réseau. Le second manquait, et servait l'ancien profil trente jours.
   --------------------------------------------------------------------------- */

test("changer la version du moteur invalide l'entrée du cache au bord du réseau", async () => {
  const { urlCacheEdge } = await import("../functions/api/climat.js");
  const v3 = urlCacheEdge(45.9, 5.9, 3);
  const v4 = urlCacheEdge(45.9, 5.9, 4);
  assert.notEqual(v3, v4, "un nouveau moteur ne réutilise pas l'ancien profil");
  assert.equal(urlCacheEdge(45.9, 5.9, 3), v3, "à version égale, la clé est stable");
  assert.ok(v3.includes("v=3") && v3.includes("lat=45.9") && v3.includes("lng=5.9"));
});

test("la version du moteur invalide aussi le cache du navigateur", () => {
  const avec = (version) => cleCacheClimat({ ...base, version });
  assert.notEqual(avec(3), avec(4));
  assert.equal(avec(3), avec(3));
});

test("les deux caches s'invalident ensemble, jamais l'un sans l'autre", async () => {
  const { urlCacheEdge } = await import("../functions/api/climat.js");
  // Même maille, deux versions : les deux niveaux doivent changer de clé en
  // même temps, sinon un profil neuf côté navigateur lirait un profil périmé
  // côté réseau, ou l'inverse.
  const edgeChange = urlCacheEdge(45.9, 5.9, 3) !== urlCacheEdge(45.9, 5.9, 4);
  const localChange = cleCacheClimat({ ...base, version: 3 }) !== cleCacheClimat({ ...base, version: 4 });
  assert.equal(edgeChange, localChange);
  assert.equal(edgeChange, true);
});
