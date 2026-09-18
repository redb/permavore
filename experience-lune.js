/* =========================================================================
   Permavore — Expérience Lune

   Une expérience collective, volontaire, pour mesurer si le moment du cycle
   lunaire au semis produit un effet détectable. Permavore ne suppose pas que
   cette influence existe : il permet de la TESTER.

   Trois principes tiennent tout le reste :

   1. AVEUGLEMENT PAR CONSTRUCTION. La condition lunaire de chaque lot est
      stockée mais ne sort jamais du modèle tant que l'expérience n'est pas
      terminée. Ce n'est pas une discipline d'affichage qu'on pourrait oublier
      dans un coin d'interface : c'est `conditionsVisibles()` qui refuse.

   2. RANDOMISATION. Si le lot A tombait toujours sur la même condition, la
      comparaison entre participants serait biaisée. L'ordre est tiré au sort à
      la création, et conservé.

   3. MESURES, PAS ÉTIQUETTES. On enregistre l'âge lunaire, la fraction
      éclairée, l'altitude, le lever, le coucher et l'exposition nocturne. Une
      analyse ultérieure pourra toujours en dériver « pleine lune » ; l'inverse
      serait impossible.

   Le résultat d'un seul jardin ne démontre rien, et l'application ne le dira
   jamais. Il rejoint un ensemble.
   ========================================================================= */

const LS_EXPERIENCES = "permavore.experiences.v1";
const VERSION_PROTOCOLE = "lune-radis-1";

/*
   Cultures ouvertes à l'expérience. Le radis d'abord : cycle court, levée
   franche et comptable, récolte en une fois. L'architecture n'attend que des
   entrées supplémentaires pour en accueillir d'autres.
*/
const PROTOCOLES = {
  radis: {
    cultureId: "radis",
    version: VERSION_PROTOCOLE,
    grainesParLot: 20,
    grainesMinimum: 40,
    joursLeveeAttendue: [3, 10],
    joursRecolteAttendue: [21, 40],
    consignes: [
      "Les 40 graines doivent venir du même sachet.",
      "Deux emplacements comparables : même terre, même exposition, même arrosage.",
      "Même profondeur et même méthode de semis pour les deux lots.",
    ],
  },
};

// Les deux conditions comparées. Leurs noms ne sortent jamais avant la fin.
const CONDITIONS = ["lune_croissante_pleine", "lune_decroissante_nouvelle"];

let EXPERIENCES = [];

function chargerExperiences() {
  try {
    const brut = JSON.parse(localStorage.getItem(LS_EXPERIENCES) || "[]");
    EXPERIENCES = Array.isArray(brut) ? brut.filter(e => e && e.id) : [];
  } catch { EXPERIENCES = []; }
  return EXPERIENCES;
}

function sauverExperiences() {
  try { localStorage.setItem(LS_EXPERIENCES, JSON.stringify(EXPERIENCES)); }
  catch { /* signalé par la couche de stockage */ }
}

const identifiant = () =>
  `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Prochaine occurrence d'une condition lunaire après une date donnée : le jour
 * où la fraction éclairée atteint son maximum (pleine) ou son minimum
 * (nouvelle) dans le cycle qui suit. On balaie réellement, plutôt que d'ajouter
 * quatorze jours à vue de nez.
 */
function prochaineFenetre(depuis, condition, fractionEclairee) {
  const jour = 86400000;
  const cherchePleine = condition === "lune_croissante_pleine";
  let meilleure = null, valeur = cherchePleine ? -1 : 2;
  for (let j = 1; j <= 30; j++) {
    const d = new Date(depuis.getTime() + j * jour);
    const f = fractionEclairee(d);
    if (cherchePleine ? f > valeur : f < valeur) { valeur = f; meilleure = d; }
  }
  return meilleure;
}

/**
 * Les deux fenêtres, DANS L'ORDRE TIRÉ AU SORT.
 *
 * C'est le cœur de la randomisation, et il est plus subtil qu'il n'y paraît :
 * les dates de pleine et de nouvelle lune sont imposées par le ciel. Si l'on se
 * contentait de les classer chronologiquement, le lot A porterait toujours la
 * condition qui tombe la première — et le tirage ne servirait à rien. On tire
 * donc la condition PAR LAQUELLE ON COMMENCE, puis on cherche l'autre APRÈS
 * elle. Certains participants font pleine puis nouvelle, d'autres l'inverse.
 */
function prochainesFenetres(depuis, fractionEclairee, premiere = CONDITIONS[0]) {
  const seconde = CONDITIONS.find(c => c !== premiere);
  const debut = prochaineFenetre(depuis, premiere, fractionEclairee);
  // On repart trois jours après la première fenêtre pour ne pas retomber dessus.
  const suite = prochaineFenetre(new Date(debut.getTime() + 3 * 86400000), seconde, fractionEclairee);
  return [{ condition: premiere, quand: debut }, { condition: seconde, quand: suite }];
}

/**
 * Crée une expérience. `hasard` est injectable pour que les tests soient
 * reproductibles — la randomisation reste réelle en usage.
 */
function creerExperience(cultureId, lieu, options = {}) {
  const protocole = PROTOCOLES[cultureId];
  if (!protocole) return null;
  const maintenant = options.maintenant ? new Date(options.maintenant) : new Date();
  const hasard = typeof options.hasard === "function" ? options.hasard : Math.random;
  const fraction = options.fractionEclairee
    || (typeof window !== "undefined" && window.Lune && window.Lune.fractionEclairee);
  if (typeof fraction !== "function") return null;

  // Tirage au sort de la condition PAR LAQUELLE on commence.
  const premiere = hasard() < 0.5 ? CONDITIONS[0] : CONDITIONS[1];
  const paires = prochainesFenetres(maintenant, fraction, premiere);

  const experience = {
    id: identifiant(),
    cultureId,
    versionProtocole: protocole.version,
    statut: "planned",
    cree: new Date().toISOString(),
    lieu: lieu && Number.isFinite(lieu.lat) && Number.isFinite(lieu.lng)
      ? { lat: lieu.lat, lng: lieu.lng } : null,
    lots: {
      A: lotInitial(paires[0], protocole),
      B: lotInitial(paires[1], protocole),
    },
  };
  EXPERIENCES.push(experience);
  sauverExperiences();
  return experience;
}

function lotInitial(paire, protocole) {
  return {
    // La condition est stockée dès maintenant, mais `conditionsVisibles()`
    // refusera de la livrer avant la fin.
    condition: paire.condition,
    fenetreDebut: jourISO(paire.quand, -1),
    fenetreFin: jourISO(paire.quand, 1),
    grainesSemees: protocole.grainesParLot,
    instanceCultureId: null,
    semeLe: null,
    releveLunaire: null,
    leveeLe: null, plantsLeves: null,
    recolteLe: null, nombreRecolte: null, poidsRecolteG: null,
  };
}

const jourISO = (date, decalageJours = 0) =>
  new Date(date.getTime() + decalageJours * 86400000).toISOString().slice(0, 10);

/**
 * Enregistre un semis : fige le relevé astronomique du moment et du lieu.
 * Aucune de ces données n'est demandée au jardinier.
 */
function enregistrerSemis(id, lot, options = {}) {
  const e = EXPERIENCES.find(x => x.id === id);
  if (!e || !e.lots[lot] || e.lots[lot].semeLe) return null;
  const quand = options.quand ? new Date(options.quand) : new Date();
  const releve = typeof options.releveLunaire === "function"
    ? options.releveLunaire
    : (typeof window !== "undefined" && window.Lune && window.Lune.releveLunaire);

  e.lots[lot].semeLe = quand.toISOString();
  e.lots[lot].instanceCultureId = options.instanceCultureId || null;
  if (typeof releve === "function" && e.lieu) {
    e.lots[lot].releveLunaire = releve(quand, e.lieu.lat, e.lieu.lng);
  }
  if (Number.isFinite(options.grainesSemees)) e.lots[lot].grainesSemees = options.grainesSemees;
  e.statut = "active";
  sauverExperiences();
  return e;
}

/** Levée, récolte : on n'enregistre que ce que le jardinier a réellement compté. */
function enregistrerObservation(id, lot, champs = {}) {
  const e = EXPERIENCES.find(x => x.id === id);
  if (!e || !e.lots[lot]) return null;
  const l = e.lots[lot];
  if (champs.leveeLe) l.leveeLe = new Date(champs.leveeLe).toISOString();
  if (Number.isFinite(champs.plantsLeves)) l.plantsLeves = champs.plantsLeves;
  if (champs.recolteLe) l.recolteLe = new Date(champs.recolteLe).toISOString();
  if (Number.isFinite(champs.nombreRecolte)) l.nombreRecolte = champs.nombreRecolte;
  if (Number.isFinite(champs.poidsRecolteG)) l.poidsRecolteG = champs.poidsRecolteG;

  if (lotTermine(e.lots.A) && lotTermine(e.lots.B)) e.statut = "completed";
  sauverExperiences();
  return e;
}

const lotTermine = (l) => !!l && l.recolteLe !== null && Number.isFinite(l.poidsRecolteG);

function abandonner(id) {
  const e = EXPERIENCES.find(x => x.id === id);
  if (!e) return null;
  e.statut = "abandoned";
  sauverExperiences();
  return e;
}

/**
 * LE verrou. Tant que l'expérience n'est pas terminée, les conditions lunaires
 * ne sortent pas du modèle — ni pour l'interface, ni pour l'export, ni pour
 * quoi que ce soit d'autre.
 */
function conditionsVisibles(experience) {
  return !!experience && experience.statut === "completed";
}

/** Vue destinée à l'interface : aveugle tant que l'expérience court. */
function vueExperience(experience) {
  if (!experience) return null;
  const visible = conditionsVisibles(experience);
  const lot = (cle) => {
    const l = experience.lots[cle];
    const base = {
      fenetreDebut: l.fenetreDebut, fenetreFin: l.fenetreFin,
      grainesSemees: l.grainesSemees, semeLe: l.semeLe,
      leveeLe: l.leveeLe, plantsLeves: l.plantsLeves,
      recolteLe: l.recolteLe, nombreRecolte: l.nombreRecolte,
      poidsRecolteG: l.poidsRecolteG,
      ...mesuresDerivees(l),
    };
    // La condition et le relevé lunaire ne sont livrés qu'à la fin.
    return visible ? { ...base, condition: l.condition, releveLunaire: l.releveLunaire } : base;
  };
  return {
    id: experience.id, cultureId: experience.cultureId, statut: experience.statut,
    versionProtocole: experience.versionProtocole,
    conditionsRevelees: visible,
    lots: { A: lot("A"), B: lot("B") },
  };
}

/** Taux de germination, délai de levée, rendements. Rien d'inventé : null si non mesuré. */
function mesuresDerivees(l) {
  const tauxGermination = Number.isFinite(l.plantsLeves) && l.grainesSemees
    ? Math.round((l.plantsLeves / l.grainesSemees) * 1000) / 1000 : null;
  const dureeLeveeJours = l.semeLe && l.leveeLe
    ? Math.round(((Date.parse(l.leveeLe) - Date.parse(l.semeLe)) / 86400000) * 10) / 10 : null;
  const rendementParGraine = Number.isFinite(l.poidsRecolteG) && l.grainesSemees
    ? Math.round((l.poidsRecolteG / l.grainesSemees) * 10) / 10 : null;
  const rendementParPlante = Number.isFinite(l.poidsRecolteG) && Number.isFinite(l.nombreRecolte)
    && l.nombreRecolte > 0
    ? Math.round((l.poidsRecolteG / l.nombreRecolte) * 10) / 10 : null;
  return { tauxGermination, dureeLeveeJours, rendementParGraine, rendementParPlante };
}

/**
 * Contribution destinée à l'ensemble collectif. Elle ne contient AUCUNE
 * conclusion : ce sont des mesures et leur contexte, pour qu'une analyse
 * ultérieure puisse contrôler la température, la pluie, la saison, le lieu, la
 * variété et la nébulosité. L'analyse statistique n'est pas faite ici, et
 * surtout pas sur un seul jardin.
 */
function contributionCollective(experience, contexte = {}) {
  if (!conditionsVisibles(experience)) return null;
  const lot = (cle) => {
    const l = experience.lots[cle];
    return {
      condition: l.condition,
      grainesSemees: l.grainesSemees, plantsLeves: l.plantsLeves,
      nombreRecolte: l.nombreRecolte, poidsRecolteG: l.poidsRecolteG,
      semeLe: l.semeLe, leveeLe: l.leveeLe, recolteLe: l.recolteLe,
      releveLunaire: l.releveLunaire,
      ...mesuresDerivees(l),
    };
  };
  return {
    versionProtocole: experience.versionProtocole,
    cultureId: experience.cultureId,
    // Lieu volontairement dégradé à la maille climatique : de quoi contrôler le
    // climat, pas de quoi situer un jardin.
    maille: experience.lieu
      ? `${(Math.round(experience.lieu.lat * 10) / 10).toFixed(1)},${(Math.round(experience.lieu.lng * 10) / 10).toFixed(1)}`
      : null,
    contexte: {
      climatKoppen: contexte.climatKoppen || null,
      variete: contexte.variete || null,
      environnement: contexte.environnement || null,
      temperatureMoyenneC: Number.isFinite(contexte.temperatureMoyenneC) ? contexte.temperatureMoyenneC : null,
      precipitationsMm: Number.isFinite(contexte.precipitationsMm) ? contexte.precipitationsMm : null,
    },
    lots: { A: lot("A"), B: lot("B") },
  };
}

const experiences = () => [...EXPERIENCES];
const experienceCourante = () =>
  EXPERIENCES.find(e => e.statut === "planned" || e.statut === "active") || null;

chargerExperiences();

if (typeof window !== "undefined") {
  window.ExperienceLune = {
    PROTOCOLES, CONDITIONS, VERSION_PROTOCOLE,
    creerExperience, enregistrerSemis, enregistrerObservation, abandonner,
    conditionsVisibles, vueExperience, mesuresDerivees, contributionCollective,
    prochainesFenetres, experiences, experienceCourante, charger: chargerExperiences,
  };
}
