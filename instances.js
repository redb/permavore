/* =========================================================================
   Permavore — InstanceCulture : « enraciner » une culture dans SON jardin

   Distinction fondatrice (BDR-025) :
     Culture        la connaissance générale sur l'espèce — fiche botanique,
                    seuils agronomiques, calendrier. Partagée par tous.
     InstanceCulture ce pied-là, dans ce jardin-là, à cette date-là. Propre à
                    l'utilisateur. Enraciner en crée une ; cela ne modifie
                    JAMAIS la Culture.

   Cette séparation conditionne le moteur à venir : état → occupation du jardin
   → actions → récolte → libération de surface → culture suivante.

   Le jardin d'un jardinier n'est pas un inventaire d'entrepôt : on peut avoir
   un pommier « depuis toujours », sans date, sans surface et sans emplacement.
   Rien n'est donc obligatoire en dehors de la culture et de l'état, et
   « je ne sais pas » est une réponse de plein droit, pas un champ vide.
   ========================================================================= */

const LS_INSTANCES = "permavore.instances.v1";
const LS_ZONES = "permavore.zones.v1";
const LS_OCCUPATIONS = "permavore.occupations.v1";

// Côté d'une cellule du plan, en mètres. 0,5 m de côté = 0,25 m², la plus
// petite surface qu'un jardinier occupe réellement : un carré de radis, une
// touffe de ciboulette, quelques pieds de persil.
const COTE_CELLULE_M = 0.5;
const M2_PAR_CELLULE = COTE_CELLULE_M * COTE_CELLULE_M;

// États d'une instance. L'ordre est celui du cycle de vie.
const ETATS_INSTANCE = ["prevu", "seme", "plante", "dejaPresent", "termine"];

// Précisions de date acceptées, de la plus fine à l'absence d'information.
const PRECISIONS_DATE = ["exacte", "mois", "saison", "annee", "anneeApprox", "inconnue"];

let INSTANCES = [];

/*
   Hiérarchie du jardin :

       InstanceCulture  →  Zone  →  EnvironnementCulture

   L'environnement se déclare UNE fois, sur la zone (« la serre »), et toutes
   les cultures qui y poussent en héritent. Une instance peut le surcharger si
   elle fait exception, mais on ne répète jamais les caractéristiques de la
   serre sur chaque plante.
*/
let ZONES_JARDIN = [];

/*
   Une cellule peut porter PLUSIEURS cultures en même temps :

       Cellule  →  0..N Occupations  →  InstanceCulture

   Un carré de 0,25 m² peut très bien contenir radis, carottes et poireaux
   ensemble — c'est la pratique courante, pas une exception. Le modèle ne
   suppose donc jamais qu'une cellule appartient à une seule culture.

   Conséquence importante sur les surfaces : trois cultures sur une même
   cellule n'occupent pas 0,75 m², elles occupent 0,25 m². Les surfaces se
   calculent sur l'UNION des cellules, jamais par addition des occupations.
*/
let OCCUPATIONS = [];

function chargerInstances() {
  try {
    const brut = JSON.parse(localStorage.getItem(LS_INSTANCES) || "[]");
    INSTANCES = Array.isArray(brut) ? brut.filter(i => i && i.cultureId) : [];
  } catch { INSTANCES = []; }
  return INSTANCES;
}

function chargerOccupations() {
  try {
    const brut = JSON.parse(localStorage.getItem(LS_OCCUPATIONS) || "[]");
    OCCUPATIONS = Array.isArray(brut) ? brut.filter(o => o && o.id) : [];
  } catch { OCCUPATIONS = []; }
  return OCCUPATIONS;
}

function sauverOccupations() {
  try { localStorage.setItem(LS_OCCUPATIONS, JSON.stringify(OCCUPATIONS)); }
  catch { /* stockage refusé */ }
}

/** Identifiant d'une cellule du plan. */
const cellule = (x, y) => `${Math.round(x)},${Math.round(y)}`;

/**
 * Occupe une ou plusieurs cellules avec une culture enracinée. Ne déplace ni
 * ne supprime aucune occupation existante : plusieurs cultures cohabitent.
 */
function occuper(instanceCultureId, cellules, options = {}) {
  const liste = (Array.isArray(cellules) ? cellules : [cellules])
    .map(c => (typeof c === "string" ? c : cellule(c.x, c.y)))
    .filter(Boolean);
  if (!instanceCultureId || !liste.length) return null;
  const o = {
    id: nouvelIdentifiant().replace("inst_", "occ_"),
    instanceCultureId,
    zoneId: options.zoneId || null,
    cellules: [...new Set(liste)],
    debut: options.debut || new Date().toISOString().slice(0, 10),
    fin: null,
    etat: "active",
    cree: new Date().toISOString(),
    maj: new Date().toISOString(),
  };
  OCCUPATIONS.push(o);
  sauverOccupations();
  return o;
}

/**
 * Récolte ou fin de culture : l'occupation devient terminée et libère ses
 * cellules, mais elle n'est PAS supprimée — l'historique d'une planche est ce
 * qui permettra de proposer la culture suivante.
 */
function terminerOccupation(id, fin) {
  const o = OCCUPATIONS.find(x => x.id === id);
  if (!o) return null;
  o.etat = "terminee";
  o.fin = fin || new Date().toISOString().slice(0, 10);
  o.maj = new Date().toISOString();
  sauverOccupations();
  return o;
}

function supprimerOccupation(id) {
  const i = OCCUPATIONS.findIndex(x => x.id === id);
  if (i < 0) return false;
  OCCUPATIONS.splice(i, 1);
  sauverOccupations();
  return true;
}

/** Occupations actives d'une cellule — souvent plusieurs. */
function occupationsDe(x, y) {
  const c = typeof x === "string" ? x : cellule(x, y);
  return OCCUPATIONS.filter(o => o.etat === "active" && o.cellules.includes(c));
}

/** Historique d'une cellule, terminées comprises, de la plus ancienne à la plus récente. */
function historiqueCellule(x, y) {
  const c = typeof x === "string" ? x : cellule(x, y);
  return OCCUPATIONS.filter(o => o.cellules.includes(c))
    .sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
}

const occupationsActives = () => OCCUPATIONS.filter(o => o.etat === "active");

/**
 * Surface physiquement occupée, en m². On compte l'UNION des cellules : trois
 * cultures sur la même cellule occupent 0,25 m², pas 0,75 m².
 */
function surfacePhysique(occupations) {
  const liste = occupations || occupationsActives();
  const cellules = new Set();
  for (const o of liste) for (const c of o.cellules) cellules.add(c);
  return Math.round(cellules.size * M2_PAR_CELLULE * 100) / 100;
}

/** Surface d'une occupation, toujours dérivée de ses cellules. */
const surfaceOccupation = (o) =>
  Math.round((o?.cellules?.length || 0) * M2_PAR_CELLULE * 100) / 100;

/** Une cellule est libre quand plus aucune occupation active ne la porte. */
const celluleLibre = (x, y) => occupationsDe(x, y).length === 0;

/**
 * Reprise des anciennes planches rectangulaires du plan.
 *
 * Une planche est un rectangle de cellules : la conversion est donc exacte,
 * sans rien inventer. On ne convertit QUE les planches portant une culture, et
 * on ne touche jamais aux planches d'origine — elles restent lisibles, et la
 * reprise est idempotente : la relancer ne crée pas de doublon.
 */
function migrerPlanchesVersOccupations(planches, options = {}) {
  if (!Array.isArray(planches)) return { reprises: 0, ignorees: 0 };
  let reprises = 0, ignorees = 0;
  for (const p of planches) {
    if (!p || !p.plantId) { ignorees++; continue; }
    const marque = `planche:${p.id}`;
    if (OCCUPATIONS.some(o => o.origine === marque)) { ignorees++; continue; }

    const cellules = [];
    for (let dx = 0; dx < (p.w || 1); dx++) {
      for (let dy = 0; dy < (p.h || 1); dy++) cellules.push(cellule(p.x + dx, p.y + dy));
    }
    // Rattacher à une instance existante de cette culture, sinon en créer une :
    // la planche affirme que la culture est en place, on ne perd pas cette
    // information sous prétexte qu'aucune instance n'existait avant.
    let inst = INSTANCES.find(i => i.cultureId === p.plantId && i.etat !== "termine");
    if (!inst) {
      inst = enraciner(p.plantId, {
        etat: "plante",
        depuis: p.dateSemis ? { precision: "exacte", valeur: p.dateSemis } : { precision: "inconnue" },
        zoneId: options.zoneId || null,
      });
    }
    const o = occuper(inst.id, cellules, { zoneId: options.zoneId || null, debut: p.dateSemis || null });
    if (o) { o.origine = marque; reprises++; }
  }
  if (reprises) sauverOccupations();
  return { reprises, ignorees };
}

function chargerZones() {
  try {
    const brut = JSON.parse(localStorage.getItem(LS_ZONES) || "[]");
    ZONES_JARDIN = Array.isArray(brut) ? brut.filter(z => z && z.id) : [];
  } catch { ZONES_JARDIN = []; }
  return ZONES_JARDIN;
}

function sauverZones() {
  try { localStorage.setItem(LS_ZONES, JSON.stringify(ZONES_JARDIN)); }
  catch { /* stockage refusé */ }
}

/** Crée ou met à jour une zone et son environnement. */
function definirZone(id, champs = {}) {
  let z = ZONES_JARDIN.find(x => x.id === id);
  if (!z) { z = { id: id || nouvelIdentifiant(), cree: new Date().toISOString() }; ZONES_JARDIN.push(z); }
  if ("nom" in champs) z.nom = champs.nom || null;
  if ("environnement" in champs) z.environnement = champs.environnement || null;
  if ("proprietes" in champs) z.proprietes = champs.proprietes || null;
  z.maj = new Date().toISOString();
  sauverZones();
  return z;
}

const zone = (id) => ZONES_JARDIN.find(z => z.id === id) || null;

/**
 * Environnement effectif d'une instance : sa surcharge si elle en a une, sinon
 * celui de sa zone, sinon la pleine terre. On ne suppose jamais mieux.
 */
function environnementDe(instance) {
  if (!instance) return { type: "pleine_terre", origine: "defaut", proprietes: null };
  if (instance.environnement) {
    return { type: instance.environnement, origine: "instance", proprietes: instance.proprietesEnv || null };
  }
  const z = zone(instance.zoneId);
  if (z && z.environnement) {
    return { type: z.environnement, origine: "zone", zoneId: z.id, nom: z.nom || null,
             proprietes: z.proprietes || null };
  }
  return { type: "pleine_terre", origine: "defaut", proprietes: null };
}

function sauverInstances() {
  try { localStorage.setItem(LS_INSTANCES, JSON.stringify(INSTANCES)); }
  catch { /* stockage refusé : l'app reste utilisable pour la session */ }
}

const nouvelIdentifiant = () =>
  `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Enracine une culture : crée une instance dans le jardin de l'utilisateur.
 * Seuls `cultureId` et `etat` comptent ; tout le reste est facultatif.
 */
function enraciner(cultureId, options = {}) {
  if (!cultureId) return null;
  const etat = ETATS_INSTANCE.includes(options.etat) ? options.etat : "plante";
  const depuis = normaliserDepuis(options.depuis);
  const instance = {
    id: nouvelIdentifiant(),
    cultureId,
    etat,
    depuis,
    // Où pousse-t-elle réellement : pleine terre, serre, intérieur… Le moteur
    // en a besoin, car une culture difficile dehors peut être évidente sous abri.
    // Rien par défaut : l'environnement vient de la zone. Une valeur ici est
    // une surcharge explicite, pas une supposition.
    environnement: options.environnement || null,
    zoneId: options.zoneId || null,
    emplacement: options.emplacement || null,
    surface: Number.isFinite(options.surface) ? options.surface : null,
    quantite: Number.isFinite(options.quantite) ? options.quantite : null,
    cree: new Date().toISOString(),
    maj: new Date().toISOString(),
  };
  INSTANCES.push(instance);
  sauverInstances();
  return instance;
}

/** Une date peut être précise, vague, ou inconnue — les trois sont valides. */
function normaliserDepuis(depuis) {
  if (!depuis || !PRECISIONS_DATE.includes(depuis.precision)) {
    return { precision: "inconnue", valeur: null };
  }
  if (depuis.precision === "inconnue") return { precision: "inconnue", valeur: null };
  const valeur = typeof depuis.valeur === "string" ? depuis.valeur.trim() : null;
  return { precision: depuis.precision, valeur: valeur || null };
}

function majInstance(id, champs = {}) {
  const i = INSTANCES.find(x => x.id === id);
  if (!i) return null;
  if (champs.etat && ETATS_INSTANCE.includes(champs.etat)) i.etat = champs.etat;
  if (champs.depuis) i.depuis = normaliserDepuis(champs.depuis);
  if ("environnement" in champs) i.environnement = champs.environnement || null;
  if ("zoneId" in champs) i.zoneId = champs.zoneId || null;
  if ("emplacement" in champs) i.emplacement = champs.emplacement || null;
  if ("surface" in champs) i.surface = Number.isFinite(champs.surface) ? champs.surface : null;
  if ("quantite" in champs) i.quantite = Number.isFinite(champs.quantite) ? champs.quantite : null;
  i.maj = new Date().toISOString();
  sauverInstances();
  return i;
}

function deraciner(id) {
  const i = INSTANCES.findIndex(x => x.id === id);
  if (i < 0) return false;
  INSTANCES.splice(i, 1);
  sauverInstances();
  return true;
}

/** Toutes les instances d'une culture, ou tout le jardin si cultureId est omis. */
function instancesDe(cultureId) {
  return cultureId ? INSTANCES.filter(i => i.cultureId === cultureId) : [...INSTANCES];
}

/** Une culture est enracinée dès qu'elle a au moins une instance non terminée. */
function estEnracinee(cultureId) {
  return INSTANCES.some(i => i.cultureId === cultureId && i.etat !== "termine");
}

/** Cultures présentes dans le jardin — la vue dont le reste de l'app a besoin. */
function culturesEnracinees() {
  return [...new Set(INSTANCES.filter(i => i.etat !== "termine").map(i => i.cultureId))];
}

/**
 * Reprise de l'ancien stockage : `permavore.adoptees` ne savait dire que
 * « présente ou pas », avec une date unique. Chaque entrée devient une
 * instance plantée, en conservant la date quand elle existait.
 */
function migrerAdoptees(adoptees, dates) {
  if (!Array.isArray(adoptees) || !adoptees.length) return 0;
  let reprises = 0;
  for (const cultureId of adoptees) {
    if (instancesDe(cultureId).length) continue;
    const iso = dates && dates[cultureId];
    enraciner(cultureId, {
      etat: "plante",
      // L'ancien stockage ne disait pas où : on ne suppose donc rien de plus
      // que le cas le plus courant, et le jardinier pourra corriger.
      environnement: null,          // inconnu : la zone décidera, à défaut pleine terre
      depuis: iso ? { precision: "exacte", valeur: iso } : { precision: "inconnue" },
    });
    reprises++;
  }
  return reprises;
}

chargerInstances();
chargerZones();
chargerOccupations();

if (typeof window !== "undefined") {
  window.Instances = {
    enraciner, majInstance, deraciner, instancesDe, estEnracinee,
    culturesEnracinees, migrerAdoptees, charger: chargerInstances,
    definirZone, zone, zones: () => [...ZONES_JARDIN], environnementDe,
    occuper, terminerOccupation, supprimerOccupation, occupationsDe,
    historiqueCellule, occupationsActives, occupations: () => [...OCCUPATIONS],
    surfacePhysique, surfaceOccupation, celluleLibre, cellule,
    migrerPlanchesVersOccupations,
    M2_PAR_CELLULE, COTE_CELLULE_M,
    ETATS: ETATS_INSTANCE, PRECISIONS: PRECISIONS_DATE,
  };
}
