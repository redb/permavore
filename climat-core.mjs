/* =========================================================================
   Permavore — noyau climatique (pur, sans I/O, sans DOM, sans botanique)

   Ce module ne connaît ni la France, ni les mois, ni les saisons européennes.
   Il ne reçoit que des séries quotidiennes et une latitude, et n'en tire que
   des indicateurs agroclimatiques standards, interprétables et documentés.

   Hémisphères et tropiques : aucun indicateur n'est indexé sur le calendrier.
   L'« année climatique » commence au cœur de la saison froide, détecté dans
   les données elles-mêmes. La saison sans gel est le plus long enchaînement
   de jours sans gel à l'intérieur de cette année. La « saison chaude » est la
   fenêtre de 90 jours la plus chaude, où qu'elle tombe dans l'année. Sous les
   tropiques, l'absence de gel est constatée, pas supposée.

   Séparation stricte (cf. docs/architecture-recommandation.md) :
     profilClimatique()      → ce qu'est le lieu. Aucune notion de culture.
     compatibiliteActuelle() → rapproche un lieu et une culture.
     tendance()              → rapproche un lieu, sa projection et une culture.
   Le profil d'une culture (agronomie.js) ne contient aucune projection locale.
   ========================================================================= */

/* ---------- définitions des indicateurs (affichées à l'utilisateur) ------- */

/*
   Version du MOTEUR climatique. Elle entre dans la clé de cache : la changer
   invalide naturellement tous les profils calculés, et elle ne doit donc
   changer que lorsque le CALCUL change — jamais pour une correction de style
   ou de texte, qui ne doit provoquer aucun nouvel appel à la source.
*/
export const VERSION_MOTEUR_CLIMAT = 3;   // v3 : ajout de la longueur du jour

/**
 * Clé de cache d'un profil climatique. Elle décrit exactement ce qui a servi
 * à le produire : maille, version du moteur, fenêtres, modèles et variables.
 * Deux profils portant la même clé sont interchangeables ; dès qu'un de ces
 * éléments bouge, la clé change et l'ancien profil cesse d'être réutilisé.
 */
export function cleCacheClimat({ maille, version = VERSION_MOTEUR_CLIMAT,
                                 fenetreObservee, fenetreFuture, modeles = [], variables = [] }) {
  return [
    "c", version,
    maille,
    fenetreObservee || "?",
    fenetreFuture || "?",
    [...modeles].sort().join("+") || "-",
    [...variables].sort().join("+") || "-",
  ].join("|");
}

export const DEFINITIONS = {
  minimumHivernal:
    "Moyenne, sur les années disponibles, de la température la plus basse de chaque année climatique. C'est la définition employée par l'USDA pour ses zones de rusticité.",
  zoneUSDA:
    "Zone de rusticité USDA déduite du minimum hivernal moyen : zone 1 sous -51,1 °C, puis une zone tous les 5,6 °C, chaque zone coupée en a (moitié froide) et b (moitié douce).",
  joursChauds:
    "Nombre moyen de jours par an où la température maximale dépasse 30 °C.",
  zoneChaleurAHS:
    "Zone de chaleur AHS (American Horticultural Society), définie par le nombre annuel de jours au-dessus de 30 °C.",
  saisonSansGel:
    "Plus longue période continue, à l'intérieur d'une année climatique, sans aucun jour dont la température minimale descend à 0 °C ou en dessous.",
  degresJours10:
    "Somme des degrés-jours base 10 °C — moyenne (Tmax+Tmin)/2 diminuée de 10, cumulée sur la saison sans gel, les valeurs négatives comptant pour zéro.",
  deficitHydriqueSaisonChaude:
    "Sur la fenêtre de 90 jours la plus chaude de l'année : évapotranspiration de référence moins pluie, en mm. Positif = la demande d'eau dépasse la pluie. ET0 estimée par Hargreaves-Samani (FAO-56, éq. 52), la même formule étant appliquée aux observations et aux modèles pour que la comparaison reste cohérente.",
  heuresFroid:
    "Heures passées entre 0 et 7,2 °C pendant la saison froide, estimées à partir des minima et maxima quotidiens par interpolation sinusoïdale (méthode Linvill, 1990). C'est une estimation à partir de données quotidiennes, pas une mesure horaire.",
};

export const SEUIL_GEL = 0;      // °C — tmin ≤ 0 : gelée
export const SEUIL_CHAUD = 30;   // °C — tmax > 30 : jour chaud (seuil AHS)
export const SEUIL_FROID = 7.2;  // °C — plafond des heures de froid (45 °F)
// Une culture a son propre seuil de stress (la nouaison de la tomate et la
// tubérisation de la pomme de terre ne décrochent pas à la même température) :
// le profil du lieu compte donc les dépassements à plusieurs seuils, et c'est
// le moteur de compatibilité qui choisit celui qui concerne la culture.
export const SEUILS_CHALEUR = [25, 28, 30, 32, 35, 38, 40];

/* ---------- rayonnement extraterrestre et ET0 (valables partout) --------- */

/** Rayonnement extraterrestre Ra en mm/jour (FAO-56, éq. 21 à 25). */
export function rayonnementExtraterrestre(latitude, jourAnnee) {
  const phi = (latitude * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * jourAnnee) / 365);
  const decl = 0.409 * Math.sin((2 * Math.PI * jourAnnee) / 365 - 1.39);
  // Aux latitudes polaires, tan(phi)·tan(decl) sort de [-1,1] : jour ou nuit continus.
  const x = Math.min(1, Math.max(-1, -Math.tan(phi) * Math.tan(decl)));
  const omega = Math.acos(x);
  const raMJ = ((24 * 60) / Math.PI) * 0.082 * dr *
    (omega * Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.sin(omega));
  return Math.max(0, raMJ * 0.408); // MJ·m⁻²·j⁻¹ → mm/jour
}

/**
 * Durée du jour en heures, pour une latitude et un jour de l'année (FAO-56,
 * éq. 34). Ce n'est pas une sortie de modèle : c'est de l'astronomie, exacte
 * partout et pour toujours. Elle compte parce que certaines cultures ne
 * déclenchent pas leur production sur la température mais sur la longueur du
 * jour — l'oignon en est l'exemple le plus net.
 */
export function dureeJour(latitude, jourAnnee) {
  const phi = (latitude * Math.PI) / 180;
  const decl = 0.409 * Math.sin((2 * Math.PI * jourAnnee) / 365 - 1.39);
  const x = -Math.tan(phi) * Math.tan(decl);
  if (x <= -1) return 24;          // jour continu (été polaire)
  if (x >= 1) return 0;            // nuit continue (hiver polaire)
  return (24 / Math.PI) * Math.acos(x);
}

/** Durée du jour la plus longue de l'année, au solstice d'été local. */
export function dureeJourMax(latitude) {
  let maxi = 0;
  for (let j = 1; j <= 365; j += 1) maxi = Math.max(maxi, dureeJour(latitude, j));
  return Math.round(maxi * 10) / 10;
}

/** ET0 de référence par Hargreaves-Samani (FAO-56, éq. 52). */
export function et0Hargreaves(tmin, tmax, latitude, jourAnnee) {
  if (!Number.isFinite(tmin) || !Number.isFinite(tmax) || tmax < tmin) return null;
  const ra = rayonnementExtraterrestre(latitude, jourAnnee);
  return 0.0023 * ((tmax + tmin) / 2 + 17.8) * Math.sqrt(tmax - tmin) * ra;
}

/* ---------- classifications horticoles standards ------------------------- */

/** Zone de rusticité USDA à partir du minimum hivernal moyen (°C). */
export function zoneUSDA(tempMin) {
  if (!Number.isFinite(tempMin)) return null;
  if (tempMin < -51.1) return "1a";
  if (tempMin >= 15.6) return "13b";
  const demiZones = Math.floor((tempMin + 51.1) / 2.8);
  const zone = 1 + Math.floor(demiZones / 2);
  return `${zone}${demiZones % 2 === 0 ? "a" : "b"}`;
}

/** Zone de chaleur AHS à partir du nombre annuel de jours > 30 °C. */
export function zoneChaleurAHS(joursChauds) {
  if (!Number.isFinite(joursChauds)) return null;
  const bornes = [1, 7, 14, 30, 45, 60, 90, 120, 150, 180, 210];
  let zone = 1;
  for (const b of bornes) { if (joursChauds > b) zone++; }
  return zone;
}

/* ---------- découpage en années climatiques (sans calendrier) ------------ */

const jourDeLAnnee = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
};

/**
 * Jour de l'année le plus froid, lissé sur 31 jours : c'est le pivot de
 * l'année climatique. Hémisphère nord ≈ janvier, hémisphère sud ≈ juillet ;
 * sous les tropiques la valeur importe peu, l'année n'ayant pas de coupure.
 */
export function ancreSaisonFroide(time, tmin) {
  const somme = new Array(367).fill(0), compte = new Array(367).fill(0);
  time.forEach((iso, i) => {
    if (!Number.isFinite(tmin[i])) return;
    const j = jourDeLAnnee(iso);
    somme[j] += tmin[i]; compte[j]++;
  });
  const moyenne = somme.map((s, j) => (compte[j] ? s / compte[j] : null));
  let meilleur = 1, minimum = Infinity;
  for (let j = 1; j <= 365; j++) {
    let total = 0, n = 0;
    for (let d = -15; d <= 15; d++) {
      const k = ((j + d - 1 + 365) % 365) + 1;
      if (moyenne[k] !== null) { total += moyenne[k]; n++; }
    }
    if (n && total / n < minimum) { minimum = total / n; meilleur = j; }
  }
  return meilleur;
}

/** Regroupe les jours en années climatiques démarrant à l'ancre. */
export function anneesClimatiques(serie, ancre) {
  const groupes = new Map();
  serie.time.forEach((iso, i) => {
    const annee = Number(iso.slice(0, 4));
    const cle = jourDeLAnnee(iso) >= ancre ? annee : annee - 1;
    if (!groupes.has(cle)) groupes.set(cle, { time: [], tmin: [], tmax: [], precip: [] });
    const g = groupes.get(cle);
    g.time.push(iso);
    g.tmin.push(serie.tmin?.[i] ?? null);
    g.tmax.push(serie.tmax?.[i] ?? null);
    g.precip.push(serie.precip?.[i] ?? null);
  });
  // On écarte les années incomplètes : elles fausseraient les cumuls.
  return [...groupes.values()].filter(g => g.time.length >= 360);
}

/* ---------- indicateurs d'une année climatique --------------------------- */

export function indicateursAnnee(annee, latitude) {
  const { tmin, tmax, precip, time } = annee;
  const n = time.length;

  let minimum = null, joursChauds = 0, gelObserve = false;
  const joursAuDessus = Object.fromEntries(SEUILS_CHALEUR.map(s => [s, 0]));
  let meilleureLongueur = 0, meilleurDebut = 0, courantDebut = 0, courant = 0;
  for (let i = 0; i < n; i++) {
    const a = tmin[i];
    if (Number.isFinite(a)) {
      if (minimum === null || a < minimum) minimum = a;
      if (a <= SEUIL_GEL) {
        gelObserve = true;
        courant = 0; courantDebut = i + 1;
      } else {
        courant++;
        if (courant > meilleureLongueur) { meilleureLongueur = courant; meilleurDebut = courantDebut; }
      }
    } else { courant = 0; courantDebut = i + 1; }
    if (Number.isFinite(tmax[i])) {
      if (tmax[i] > SEUIL_CHAUD) joursChauds++;
      for (const s of SEUILS_CHALEUR) if (tmax[i] > s) joursAuDessus[s]++;
    }
  }

  // Degrés-jours base 10 cumulés sur la saison sans gel elle-même.
  let degresJours = 0;
  for (let i = meilleurDebut; i < meilleurDebut + meilleureLongueur && i < n; i++) {
    if (Number.isFinite(tmin[i]) && Number.isFinite(tmax[i])) {
      degresJours += Math.max(0, (tmax[i] + tmin[i]) / 2 - 10);
    }
  }

  // Fenêtre de 90 jours la plus chaude, puis bilan ET0 − pluie sur celle-ci.
  let deficit = null;
  if (n >= 90) {
    let meilleureSomme = -Infinity, debutChaud = 0;
    let somme = 0, valides = 0;
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(tmax[i])) { somme += tmax[i]; valides++; }
      if (i >= 90) { if (Number.isFinite(tmax[i - 90])) { somme -= tmax[i - 90]; valides--; } }
      if (i >= 89 && valides > 60 && somme / valides > meilleureSomme) {
        meilleureSomme = somme / valides; debutChaud = i - 89;
      }
    }
    if (meilleureSomme > -Infinity) {
      let bilan = 0, jours = 0;
      for (let i = debutChaud; i < debutChaud + 90 && i < n; i++) {
        const et0 = et0Hargreaves(tmin[i], tmax[i], latitude, jourDeLAnnee(time[i]));
        if (et0 === null || !Number.isFinite(precip[i])) continue;
        bilan += et0 - precip[i]; jours++;
      }
      if (jours >= 60) deficit = (bilan * 90) / jours; // ramené à 90 jours pleins
    }
  }

  return {
    saisonSansGel: gelObserve ? meilleureLongueur : n,
    sansGelToutelAnnee: !gelObserve,
    minimum, joursChauds, joursAuDessus, degresJours10: Math.round(degresJours),
    deficitHydrique: deficit === null ? null : Math.round(deficit),
    heuresFroid: heuresFroidAnnee(annee),
  };
}

/**
 * Heures entre 0 et 7,2 °C, estimées d'une journée à l'autre par interpolation
 * sinusoïdale entre tmin et tmax (Linvill, 1990). Approximation assumée : les
 * données quotidiennes ne contiennent pas le détail horaire.
 */
export function heuresFroidAnnee(annee) {
  const { tmin, tmax } = annee;
  let heures = 0, exploitables = 0;
  for (let i = 0; i < tmin.length; i++) {
    const bas = tmin[i], haut = tmax[i];
    if (!Number.isFinite(bas) || !Number.isFinite(haut) || haut < bas) continue;
    exploitables++;
    if (bas > SEUIL_FROID) continue;          // journée entière au-dessus du plafond
    if (haut <= SEUIL_FROID && bas >= 0) { heures += 24; continue; }
    const moyenne = (haut + bas) / 2, amplitude = (haut - bas) / 2;
    for (let h = 0; h < 24; h++) {
      const t = moyenne + amplitude * Math.sin((Math.PI * (h - 9)) / 12);
      if (t > 0 && t <= SEUIL_FROID) heures++;
    }
  }
  return exploitables > 300 ? Math.round(heures) : null;
}

/* ---------- profil climatique d'un lieu ---------------------------------- */

const moyenne = (xs) => xs.length ? xs.reduce((t, v) => t + v, 0) / xs.length : null;
const ecartType = (xs) => {
  if (xs.length < 2) return null;
  const m = moyenne(xs);
  return Math.sqrt(xs.reduce((t, v) => t + (v - m) ** 2, 0) / xs.length);
};
const arrondi = (v, d = 1) => v === null || v === undefined || !Number.isFinite(v)
  ? null : Math.round(v * 10 ** d) / 10 ** d;

/**
 * Profil climatique d'un lieu — aucune notion de culture n'entre ici.
 * `serie` : { time[], tmin[], tmax[], precip[] } sur plusieurs années.
 */
export function profilClimatique(serie, latitude) {
  if (!serie?.time?.length) return null;
  const ancre = ancreSaisonFroide(serie.time, serie.tmin);
  const annees = anneesClimatiques(serie, ancre).map(a => indicateursAnnee(a, latitude));
  if (annees.length < 3) return null;   // trop court pour parler de climat

  const colonne = (cle) => annees.map(a => a[cle]).filter(v => Number.isFinite(v));
  const minimumHivernal = arrondi(moyenne(colonne("minimum")));
  const joursChauds = arrondi(moyenne(colonne("joursChauds")));
  const saisonSansGel = arrondi(moyenne(colonne("saisonSansGel")), 0);
  const heuresFroid = colonne("heuresFroid").length >= 3
    ? arrondi(moyenne(colonne("heuresFroid")), 0) : null;
  const deficit = colonne("deficitHydrique").length >= 3
    ? arrondi(moyenne(colonne("deficitHydrique")), 0) : null;

  const joursAuDessus = Object.fromEntries(SEUILS_CHALEUR.map(seuil => [seuil,
    arrondi(moyenne(annees.map(a => a.joursAuDessus[seuil]).filter(Number.isFinite)))]));

  return {
    minimumHivernal, zoneUSDA: zoneUSDA(minimumHivernal),
    joursAuDessus,
    joursChauds, zoneChaleurAHS: zoneChaleurAHS(joursChauds),
    saisonSansGel,
    sansGelToutelAnnee: annees.every(a => a.sansGelToutelAnnee),
    degresJours10: arrondi(moyenne(colonne("degresJours10")), 0),
    heuresFroid,
    deficitHydriqueSaisonChaude: deficit,
    // Variabilité d'une année à l'autre : sert à refuser d'annoncer une
    // évolution plus petite que le bruit naturel du climat local.
    variabilite: {
      saisonSansGel: arrondi(ecartType(colonne("saisonSansGel"))),
      joursChauds: arrondi(ecartType(colonne("joursChauds"))),
      minimumHivernal: arrondi(ecartType(colonne("minimum"))),
      heuresFroid: arrondi(ecartType(colonne("heuresFroid")), 0),
      deficitHydriqueSaisonChaude: arrondi(ecartType(colonne("deficitHydrique")), 0),
    },
    // Longueur du jour : calcul astronomique exact, pas une donnée modélisée.
    heuresJourMax: dureeJourMax(latitude),
    latitude: arrondi(latitude, 2),
    anneesUtilisees: annees.length,
    ancreSaisonFroide: ancre,
    hemisphere: latitude >= 0 ? "nord" : "sud",
  };
}

/* ---------- classification mondiale du climat (Köppen-Geiger) ------------ */

/*
   Le climat du lieu n'est plus choisi dans une liste pensée pour la France :
   il est classé selon Köppen-Geiger, tel que formalisé par Peel, Finlayson &
   McMahon (2007), « Updated world map of the Köppen-Geiger climate
   classification », Hydrology and Earth System Sciences 11, 1633-1644.
   Valable partout, dans les deux hémisphères.

   Le « semestre chaud » n'est pas avril-septembre : c'est la moitié de l'année
   la plus chaude, déterminée dans les données. Rien n'est indexé sur le
   calendrier du nord.
*/

/** Moyennes mensuelles (12 cases) de température et de pluie. */
export function climatologieMensuelle(serie) {
  const t = Array.from({ length: 12 }, () => ({ somme: 0, n: 0 }));
  const p = Array.from({ length: 12 }, () => ({ somme: 0, n: 0, annees: new Set() }));
  serie.time.forEach((iso, i) => {
    const m = Number(iso.slice(5, 7)) - 1;
    const tmin = serie.tmin?.[i], tmax = serie.tmax?.[i];
    if (Number.isFinite(tmin) && Number.isFinite(tmax)) {
      t[m].somme += (tmin + tmax) / 2; t[m].n++;
    }
    if (Number.isFinite(serie.precip?.[i])) {
      p[m].somme += serie.precip[i]; p[m].n++; p[m].annees.add(iso.slice(0, 4));
    }
  });
  return {
    temperature: t.map(x => (x.n ? x.somme / x.n : null)),
    // Pluie : cumul mensuel moyen, donc divisé par le nombre d'années couvertes.
    pluie: p.map(x => (x.annees.size ? x.somme / x.annees.size : null)),
  };
}

export function classifierKoppen(serie) {
  const { temperature, pluie } = climatologieMensuelle(serie);
  if (temperature.some(v => v === null) || pluie.some(v => v === null)) return null;

  const Tann = temperature.reduce((a, b) => a + b, 0) / 12;
  const Pann = pluie.reduce((a, b) => a + b, 0);
  const Tchaud = Math.max(...temperature), Tfroid = Math.min(...temperature);
  const Pmin = Math.min(...pluie);

  // Semestre chaud : les 6 mois consécutifs les plus chauds, trouvés dans les
  // données. Aucun mois n'est déclaré « estival » a priori.
  let debutChaud = 0, meilleure = -Infinity;
  for (let d = 0; d < 12; d++) {
    let s = 0;
    for (let k = 0; k < 6; k++) s += temperature[(d + k) % 12];
    if (s > meilleure) { meilleure = s; debutChaud = d; }
  }
  const moisChauds = [], moisFroids = [];
  for (let k = 0; k < 12; k++) {
    ((k < 6) ? moisChauds : moisFroids).push(pluie[(debutChaud + k) % 12]);
  }
  const Pete = moisChauds.reduce((a, b) => a + b, 0);
  const Phiver = moisFroids.reduce((a, b) => a + b, 0);
  const PsMin = Math.min(...moisChauds), PsMax = Math.max(...moisChauds);
  const PwMin = Math.min(...moisFroids), PwMax = Math.max(...moisFroids);

  let seuil = 2 * Tann + 14;
  if (Phiver >= 0.7 * Pann) seuil = 2 * Tann;
  else if (Pete >= 0.7 * Pann) seuil = 2 * Tann + 28;

  let code;
  if (Pann < 10 * seuil) {
    code = "B" + (Pann < 5 * seuil ? "W" : "S") + (Tann >= 18 ? "h" : "k");
  } else if (Tfroid >= 18) {
    code = "A" + (Pmin >= 60 ? "f" : (Pmin >= 100 - Pann / 25 ? "m" : "w"));
  } else if (Tchaud <= 10) {
    code = Tchaud > 0 ? "ET" : "EF";
  } else {
    const groupe = Tfroid > 0 ? "C" : "D";
    let pluies = "f";
    if (PsMin < 40 && PsMin < PwMax / 3) pluies = "s";
    else if (PwMin < PsMax / 10) pluies = "w";
    const moisDoux = temperature.filter(v => v >= 10).length;
    let chaleur = "c";
    if (Tchaud >= 22) chaleur = "a";
    else if (moisDoux >= 4) chaleur = "b";
    if (groupe === "D" && Tfroid < -38) chaleur = "d";
    code = groupe + pluies + chaleur;
  }

  return {
    code, groupe: code[0],
    temperatureMoyenne: arrondi(Tann), pluieAnnuelle: arrondi(Pann, 0),
    moisLePlusChaud: arrondi(Tchaud), moisLePlusFroid: arrondi(Tfroid),
    source: "Köppen-Geiger, formalisation de Peel, Finlayson & McMahon (2007), HESS 11:1633-1644",
  };
}

/*
   Correspondance vers les zones internes historiques de Permavore
   (oceanique / continental / mediterraneen / montagne). Ces zones sont un
   héritage du catalogue français : elles restent utilisées par les 41 fiches
   existantes, tant que leurs calendriers sont exprimés en mois. La
   classification Köppen, elle, est mondiale. Cette table est donc un pont
   provisoire, pas une vérité agronomique — et c'est pourquoi elle est isolée
   ici plutôt que dispersée dans le code.
*/
export function zoneInterneDepuisKoppen(koppen, profil) {
  if (!koppen) return null;
  const g = koppen.groupe, code = koppen.code;
  if (g === "E") return "montagne";
  if (code.startsWith("Cs") || code.startsWith("BSh") || code.startsWith("BWh")) return "mediterraneen";
  if (g === "D" || code === "BSk" || code === "BWk") return "continental";
  if (g === "A") return "mediterraneen";   // le plus proche des quatre, faute de mieux
  // Climats tempérés : l'hiver tranche entre océanique et continental.
  if (Number.isFinite(profil?.minimumHivernal) && profil.minimumHivernal <= -12) return "continental";
  return "oceanique";
}

/* =========================================================================
   Moteur de compatibilité — rapproche un profil de lieu et un profil de culture

   Éprouvé ↔ Expérimental est ici relatif au LIEU, jamais à une origine
   géographique ni à une liste nationale. Une espèce venue d'ailleurs mais
   confortablement dans ses seuils est éprouvée ; une espèce indigène hors de
   ses seuils ne l'est pas.

   Aucune valeur n'est déduite du genre, de la famille ou de la catégorie
   « exotique ». Une dimension sans seuil sourcé est « inconnue », et une
   culture trop peu documentée n'est pas évaluée du tout.
   ========================================================================= */

/** Une valeur agronomique n'est exploitable que si elle porte sa provenance. */
export function valeurUtilisable(v) {
  return !!v && Number.isFinite(v.valeur) && typeof v.source === "string" && v.source.length > 0;
}

/*
   HEURISTIQUES DU MOTEUR — ce ne sont PAS des données agronomiques.

   Aucune de ces valeurs ne provient d'une source scientifique. Ce sont des
   règles de prudence du moteur : « tenir tout juste » n'est pas « tenir
   confortablement ». Elles ne créent jamais un seuil, elles nuancent un seuil
   déjà sourcé, et elles sont identiques pour toutes les cultures — ce qui est
   précisément leur défaut.

   TODO architectural : remplacer progressivement ces marges globales par des
   incertitudes propres à chaque indicateur, à chaque culture et à chaque source
   (intervalle de confiance de la mesure, amplitude variétale, désaccord entre
   sources) dès que ces informations existent dans la base. Tant qu'elles
   n'existent pas, ces heuristiques restent visibles et remplaçables ici, en un
   seul endroit, plutôt que dispersées dans le code.
*/
export const HEURISTIQUES_MOTEUR = {
  margeDureeRelative: 0.15,        // durées : 15 % au-delà du requis = confortable
  margeTemperatureC: 3,            // rusticité : 3 °C de battement
  margeFroidRelative: 0.20,        // besoin en froid : 20 % au-delà du requis
  margeChaleurRelative: 0.25,      // besoin de chaleur quantifié : 25 %
  observationsPourConclure: 3,     // nombre d'observations concordantes exigé
  partPourConcordance: 0.75,       // part d'observations allant dans le même sens
  /*
     Lecture de la fraction d'épuisement p de la FAO-56 (table 22) en niveau de
     sensibilité. p est la part de la réserve utile qu'une culture supporte de
     perdre avant de souffrir : plus p est bas, plus elle est sensible. Le
     découpage en trois niveaux est une lecture UNIFORME du moteur, identique
     pour toutes les cultures — ce n'est pas une donnée agronomique.
  */
  pSensibiliteForte: 0.35,         // p ≤ 0,35 → sensibilité forte
  pSensibiliteMoyenne: 0.55,       // p ≤ 0,55 → moyenne ; au-delà → faible
  origine: "heuristique du moteur Permavore, non sourcée, remplaçable",
};

const etatDepuisMarges = (valeurLieu, requis, margeConfort) => {
  if (valeurLieu >= requis + margeConfort) return "favorable";
  if (valeurLieu >= requis) return "limite";
  return "defavorable";
};

/**
 * Compatibilité d'une culture avec un lieu, dimension par dimension.
 * `profilLieu` : sortie de profilClimatique(). `culture` : profil agronomique.
 */
/*
   Trois axes ORTHOGONAUX, qu'il ne faut jamais confondre :

     compatibilite  « cette culture peut-elle accomplir ici un cycle
                      productif ? »  → compatible | incompatible | indeterminee
     statutLocal    « sa réussite ici est-elle établie ? »
                      → eprouve | experimental | indetermine
     confiance      « que vaut ce que nous savons ? » → haute | moyenne | faible

   Règle cardinale : UNE DONNÉE MANQUANTE N'EST PAS UNE PROPRIÉTÉ AGRONOMIQUE.
   Ne pas savoir ne rend pas une culture expérimentale : cela la rend
   indéterminée. « Expérimental » décrit une relation réelle entre une culture
   et un lieu — marginale mais plausible — et réclame donc des éléments
   POSITIFS, pas un trou dans la base.

   Autre confusion à éviter : la rusticité hivernale ne décide que du sort
   d'une plante qu'on laisse en place. Une culture menée en annuelle n'a pas
   besoin de survivre à l'hiver pour produire — c'est le cas de la patate
   douce sous nos latitudes. On évalue donc séparément :
     survieVivaceAuFroid     pertinent seulement si on la garde en place ;
     faisabiliteCycleAnnuel  pertinent dès qu'on la replante chaque année.
*/

const CONFORTABLE = "favorable", LIMITE = "limite", HORS = "defavorable", INCONNU = "inconnu";

export function compatibiliteActuelle(culture, profilLieu, retours = []) {
  const dimensions = {};
  const vide = {
    compatibilite: "indeterminee", statutLocal: "indetermine", confiance: "faible",
    dimensions, dimensionsDocumentees: 0, contradiction: false,
    faisabiliteCycleAnnuel: "indeterminee", survieVivaceAuFroid: "sansObjet",
  };
  if (!culture || !profilLieu) return vide;

  const c = culture;
  // Une culture est menée en annuelle par défaut : c'est le cas le plus courant,
  // et cela n'affirme rien sur sa biologie — seulement sur la façon de la cultiver.
  const gardeeEnPlace = c.cultiveeComme === "perenne" || c.perenne === true;

  // --- durée de saison sans gel exigée par le cycle
  const sourceSaison = valeurUtilisable(c.cycle?.saisonSansGelMin) ? c.cycle.saisonSansGelMin
    : (valeurUtilisable(c.cycle?.joursMaturite) ? c.cycle.joursMaturite : null);
  const saisonDerivee = sourceSaison === c.cycle?.joursMaturite && !!sourceSaison;
  if (sourceSaison && Number.isFinite(profilLieu.saisonSansGel)) {
    const requis = sourceSaison.valeur;
    dimensions.cycle = {
      etat: profilLieu.sansGelToutelAnnee ? CONFORTABLE
        : etatDepuisMarges(profilLieu.saisonSansGel, requis, Math.max(20, requis * HEURISTIQUES_MOTEUR.margeDureeRelative)),
      lieu: profilLieu.saisonSansGel, requis, unite: "jours",
      bloquant: true, source: sourceSaison, derive: saisonDerivee,
      axe: "cycleAnnuel",
    };
  }

  // --- chaleur accumulée sur la saison
  if (valeurUtilisable(c.cycle?.degresJours10Min) && Number.isFinite(profilLieu.degresJours10)) {
    const requis = c.cycle.degresJours10Min.valeur;
    dimensions.chaleurCumulee = {
      etat: etatDepuisMarges(profilLieu.degresJours10, requis, requis * HEURISTIQUES_MOTEUR.margeDureeRelative),
      lieu: profilLieu.degresJours10, requis, unite: "degrés-jours base 10",
      bloquant: true, source: c.cycle.degresJours10Min, axe: "cycleAnnuel",
    };
  }

  // --- rusticité : ne concerne QUE ce qu'on laisse passer l'hiver en place.
  // Ne jamais s'en servir pour juger une culture menée en annuelle.
  if (gardeeEnPlace && valeurUtilisable(c.rusticite?.tempMinTolere)
      && Number.isFinite(profilLieu.minimumHivernal)) {
    const requis = c.rusticite.tempMinTolere.valeur;
    dimensions.rusticite = {
      etat: etatDepuisMarges(profilLieu.minimumHivernal, requis, HEURISTIQUES_MOTEUR.margeTemperatureC),
      lieu: profilLieu.minimumHivernal, requis, unite: "°C",
      bloquant: true, source: c.rusticite.tempMinTolere, axe: "survieHiver",
    };
  }

  // --- besoin de froid hivernal (levée de dormance) : idem, seulement en place
  if (gardeeEnPlace && valeurUtilisable(c.froidHivernal?.heuresFroidMin)
      && Number.isFinite(profilLieu.heuresFroid)) {
    const requis = c.froidHivernal.heuresFroidMin.valeur;
    dimensions.froidHivernal = {
      etat: etatDepuisMarges(profilLieu.heuresFroid, requis, requis * HEURISTIQUES_MOTEUR.margeFroidRelative),
      lieu: profilLieu.heuresFroid, requis, unite: "heures sous 7,2 °C",
      bloquant: true, source: c.froidHivernal.heuresFroidMin,
      estimation: true, axe: "survieHiver",
    };
  }

  // --- chaleur excessive : trop chaud nuit. C'est une TOLÉRANCE, pas un besoin.
  // On sait à partir de quelle température la culture décroche ; on ne sait pas
  // combien de jours au-dessus compromettent la récolte. Inventer ce nombre
  // serait fabriquer un seuil agronomique — on ne le fait pas : on affiche la
  // mesure, et on ne conclut que si une source donne le nombre de jours toléré.
  if (valeurUtilisable(c.chaleur?.seuilStressThermique)) {
    const d = dimensionSeuilChaleur(c.chaleur.seuilStressThermique, profilLieu);
    if (d) {
      const tolere = c.chaleur?.joursMaxAuDessus;
      dimensions.stressThermique = valeurUtilisable(tolere)
        ? { ...d, bloquant: false, axe: "cycleAnnuel", requis: tolere.valeur,
            source: tolere, etat: d.jours > tolere.valeur ? HORS
              : d.jours > tolere.valeur * 0.75 ? LIMITE : CONFORTABLE }
        : { ...d, bloquant: false, axe: "cycleAnnuel", etat: INCONNU, quantifiable: false };
    }
  }

  // --- chaleur nécessaire : une culture peut en manquer.
  // ATTENTION : la zone de chaleur AHS dit ce que le LIEU inflige, jamais ce
  // qu'une culture RÉCLAME. Elle ne sert donc pas ici.
  if (valeurUtilisable(c.chaleur?.seuilMinCroissance)) {
    const d = dimensionSeuilChaleur(c.chaleur.seuilMinCroissance, profilLieu);
    if (d) {
      const requis = c.chaleur?.joursMinAuDessus;
      if (valeurUtilisable(requis)) {
        dimensions.besoinChaleur = { ...d, bloquant: true, axe: "cycleAnnuel",
          requis: requis.valeur, unite: "jours",
          etat: etatDepuisMarges(d.jours, requis.valeur, requis.valeur * HEURISTIQUES_MOTEUR.margeChaleurRelative),
          source: requis };
      } else {
        // Exigence documentée, mais aucune source ne la quantifie : on le dit,
        // et cela n'enlève rien à la faisabilité du cycle — cela abaisse la
        // confiance, pas le verdict.
        dimensions.besoinChaleur = { ...d, bloquant: false, axe: "cycleAnnuel",
          etat: INCONNU, quantifiable: false };
      }
    }
  }

  // --- photopériode : certaines cultures ne déclenchent pas leur production
  // sur la chaleur mais sur la longueur du jour. C'est une contrainte
  // géographique dure : sous l'équateur, le jour ne dépasse jamais ~12 h, et
  // aucune variété à jours longs n'y bulbera jamais, quelle que soit la saison.
  if (valeurUtilisable(c.photoperiode?.heuresMin) && Number.isFinite(profilLieu.heuresJourMax)) {
    const requis = c.photoperiode.heuresMin.valeur;
    dimensions.photoperiode = {
      etat: etatDepuisMarges(profilLieu.heuresJourMax, requis, 0.5),
      lieu: profilLieu.heuresJourMax, requis, unite: "heures de jour",
      bloquant: true, axe: "cycleAnnuel", source: c.photoperiode.heuresMin,
      groupes: c.photoperiode.groupes || null,
    };
  }

  // --- eau : une réserve, jamais un verdict — presque tout se corrige en arrosant
  // Aucune source ne dit à partir de quel déficit en millimètres une culture
  // sensible décroche — et de toute façon presque tout se corrige en arrosant.
  // On affiche donc la sensibilité déduite de la FAO et la mesure locale, sans
  // verdict. La table Ky de la FAO ne couvre pas toutes les cultures : quand
  // elle manque, elle manque, et p suffit à situer la sensibilité.
  const sourceEau = valeurUtilisable(c.eau?.pFAO) ? c.eau.pFAO : null;
  if (Number.isFinite(profilLieu.deficitHydriqueSaisonChaude) && sourceEau) {
    dimensions.eau = {
      etat: INCONNU, quantifiable: false,
      sensibilite: sensibiliteDepuisFAO(sourceEau.valeur, c.eau?.kyFAO?.valeur),
      p: sourceEau.valeur, ky: valeurUtilisable(c.eau?.kyFAO) ? c.eau.kyFAO.valeur : null,
      lieu: profilLieu.deficitHydriqueSaisonChaude, unite: "mm sur 90 jours",
      bloquant: false, source: sourceEau, sourceKy: c.eau?.kyFAO || null,
      axe: "cycleAnnuel",
    };
  }

  // --- preuves locales : couche de connaissance distincte des données
  // agronomiques. Une preuve est une donnée ; ce qu'on en conclut vient de la
  // SYNTHÈSE de l'ensemble, jamais d'une anecdote isolée.
  const synthese = synthesePreuves(retours);
  if (synthese.total) {
    dimensions.preuvesLocales = {
      etat: synthese.demontrePositif ? CONFORTABLE
        : synthese.demontreNegatif ? HORS : INCONNU,
      quantifiable: synthese.conclut,
      ...synthese, bloquant: false, temoignage: true, axe: "observation",
    };
  }

  const liste = Object.values(dimensions);
  const agronomiques = liste.filter(d => !d.temoignage);

  /* ----- axe 1 : faisabilité, séparée selon l'usage ----- */
  const verdictAxe = (axe) => {
    const dims = agronomiques.filter(d => d.axe === axe && d.bloquant);
    if (!dims.length) return "indeterminee";
    if (dims.some(d => d.etat === HORS)) return "impossible";
    if (dims.some(d => d.etat === INCONNU)) return "indeterminee";
    return "possible";
  };
  const faisabiliteCycleAnnuel = verdictAxe("cycleAnnuel");
  const survieVivaceAuFroid = gardeeEnPlace ? verdictAxe("survieHiver") : "sansObjet";

  // Une culture menée en annuelle ne dépend que de son cycle ; une culture
  // gardée en place dépend des deux, et l'hiver prime.
  let compatibilite;
  if (gardeeEnPlace) {
    compatibilite = survieVivaceAuFroid === "impossible" || faisabiliteCycleAnnuel === "impossible"
      ? "incompatible"
      : (survieVivaceAuFroid === "possible" ? "compatible" : "indeterminee");
  } else {
    compatibilite = faisabiliteCycleAnnuel === "impossible" ? "incompatible"
      : faisabiliteCycleAnnuel === "possible" ? "compatible" : "indeterminee";
  }

  /* ----- axe 2 : statut local. Il exige des éléments POSITIFS ----- */
  const quantifiees = agronomiques.filter(d => d.bloquant && d.etat !== INCONNU);
  const toutesConfortables = quantifiees.length >= 2 && quantifiees.every(d => d.etat === CONFORTABLE);
  const auMoinsUneLimite = quantifiees.some(d => d.etat === LIMITE);
  const inconnuesRestantes = agronomiques.some(d => d.etat === INCONNU);

  let statutLocal = "indetermine";
  if (compatibilite === "incompatible" || synthese.contradictoire) {
    // Des preuves qui se contredisent ne produisent pas une conclusion moyenne :
    // elles produisent une absence de conclusion, et on le dit.
    statutLocal = "indetermine";
  } else if (synthese.demontrePositif) {
    statutLocal = "eprouve";               // réussite établie par un faisceau de preuves
  } else if (synthese.demontreNegatif) {
    statutLocal = "experimental";          // échecs répétés ou source sérieuse le disant
  } else if (auMoinsUneLimite && compatibilite !== "indeterminee") {
    statutLocal = "experimental";          // marginal mais mesuré, pas supposé
  } else if (toutesConfortables && !inconnuesRestantes) {
    statutLocal = "eprouve";               // toutes les exigences connues, toutes tenues
  }

  /* ----- axe 3 : confiance dans ce que nous savons ----- */
  let confiance = "faible";
  if (agronomiques.length >= 3 && !inconnuesRestantes) confiance = "haute";
  else if (agronomiques.length >= 2) confiance = "moyenne";
  if (synthese.positives && confiance === "faible") confiance = "moyenne";

  // Le modèle dit non, quelqu'un la cultive pourtant : on l'affiche, on ne
  // l'efface pas. Ce sont nos seuils qu'il faut suspecter.
  const contradiction = compatibilite === "incompatible" && synthese.positives > 0;

  return {
    compatibilite, statutLocal, confiance,
    faisabiliteCycleAnnuel, survieVivaceAuFroid, gardeeEnPlace,
    dimensions, dimensionsDocumentees: agronomiques.length, contradiction,
  };
}

/**
 * Synthèse d'un faisceau de preuves locales.
 *
 * Une preuve forte (institut technique, essai variétal, université, service
 * agricole, littérature agronomique locale, historique horticole documenté)
 * repose déjà sur une répétition : elle peut conclure seule. Une observation de
 * jardinier ne vaut que par le nombre et la concordance. Des preuves qui se
 * contredisent ne concluent pas — on ne fabrique pas une moyenne.
 */
export function synthesePreuves(preuves) {
  const liste = Array.isArray(preuves) ? preuves.filter(Boolean) : [];
  const vide = { total: 0, positives: 0, negatives: 0, fortes: 0,
    demontrePositif: false, demontreNegatif: false, contradictoire: false,
    conclut: false, exemples: [] };
  if (!liste.length) return vide;

  const positive = (p) => p.resultat && p.resultat !== "echec";
  const positives = liste.filter(positive);
  const negatives = liste.filter(p => p.resultat === "echec");
  const fortePositive = positives.find(p => p.fort);
  const forteNegative = negatives.find(p => p.fort);

  const seuil = HEURISTIQUES_MOTEUR.observationsPourConclure;
  const part = HEURISTIQUES_MOTEUR.partPourConcordance;
  const concordantes = (sous) => sous.length >= seuil && sous.length >= liste.length * part;

  // Contradiction : deux camps sérieux, ou des observations partagées.
  const contradictoire = (!!fortePositive && !!forteNegative)
    || (positives.length > 0 && negatives.length > 0
        && !concordantes(positives) && !concordantes(negatives));

  const demontrePositif = !contradictoire && (!!fortePositive || concordantes(positives));
  const demontreNegatif = !contradictoire && !demontrePositif
    && (!!forteNegative || concordantes(negatives));

  return {
    total: liste.length, positives: positives.length, negatives: negatives.length,
    fortes: liste.filter(p => p.fort).length,
    demontrePositif, demontreNegatif, contradictoire,
    conclut: demontrePositif || demontreNegatif,
    exemples: liste.slice(0, 3).map(p => ({
      type: p.type, resultat: p.resultat, source: p.source, date: p.date,
      lieu: p.lieu?.nom, distance: p.distance, environnement: p.environnement,
      fort: !!p.fort, confiance: p.confiance, note: p.note, url: p.url || null,
    })),
  };
}

/**
 * Sensibilité au déficit hydrique, lue depuis les valeurs FAO-56 : la fraction
 * d'épuisement p (table 22) et, quand elle existe, le facteur Ky (table 24).
 * Un Ky supérieur à 1 signifie que la perte de rendement dépasse le déficit
 * d'eau : il relève la sensibilité d'un cran. La table 24 ne couvrant que 23
 * cultures, son absence est la norme, pas une lacune.
 */
export function sensibiliteDepuisFAO(p, ky) {
  if (!Number.isFinite(p)) return null;
  let niveau = p <= HEURISTIQUES_MOTEUR.pSensibiliteForte ? 3
    : p <= HEURISTIQUES_MOTEUR.pSensibiliteMoyenne ? 2 : 1;
  if (Number.isFinite(ky) && ky > 1) niveau = Math.min(3, niveau + 1);
  return niveau;
}

/** Compte les jours au-dessus d'un seuil, au seuil mesuré le plus proche. */
function dimensionSeuilChaleur(valeurSeuil, profilLieu) {
  const seuil = valeurSeuil.valeur;
  const dispo = Object.keys(profilLieu.joursAuDessus || {}).map(Number);
  if (!dispo.length) return null;
  const proche = dispo.reduce((a, b) => Math.abs(b - seuil) < Math.abs(a - seuil) ? b : a);
  const jours = profilLieu.joursAuDessus[proche];
  if (!Number.isFinite(jours)) return null;
  return { jours, lieu: jours, seuilCulture: seuil, seuilMesure: proche,
    unite: "jours", source: valeurSeuil, approximation: proche !== seuil };
}

/* ---------- tendance à +5 ans ------------------------------------------- */

/** Un écart projeté ne compte que s'il dépasse le bruit interannuel du lieu. */
export function ecartSignificatif(delta, variabilite, planche) {
  if (!Number.isFinite(delta)) return false;
  const seuil = Math.max(planche, Number.isFinite(variabilite) ? variabilite : 0);
  return Math.abs(delta) >= seuil;
}

const PLANCHERS = {
  saisonSansGel: 7, joursChauds: 5, minimumHivernal: 1,
  heuresFroid: 100, deficitHydriqueSaisonChaude: 30,
};

/**
 * Tendance de compatibilité à l'horizon de la fenêtre future.
 * Ne produit un sens que si : la projection existe, les modèles s'accordent,
 * l'écart dépasse la variabilité locale, ET la culture porte des seuils
 * sourcés sur la dimension concernée. Sinon : « projection non disponible ».
 *
 * Le réchauffement n'est jamais favorable par principe : une dimension qui se
 * dégrade annule une dimension qui s'améliore.
 */
export function tendance(culture, profilLieu, projection) {
  if (!culture || !profilLieu || !projection?.deltas) {
    return { sens: "indisponible", raison: "pas_de_projection", effets: [] };
  }
  const actuelle = compatibiliteActuelle(culture, profilLieu);
  if (actuelle.dimensionsDocumentees < 1) {
    return { sens: "indisponible", raison: "seuils_absents", effets: [] };
  }

  // On retient POURQUOI une dimension est écartée : « les modèles ne sont pas
  // d'accord » et « l'écart est plus petit que la variabilité » sont deux
  // messages différents pour l'utilisateur, et deux limites différentes.
  const rejets = [];
  const lire = (cle) => {
    const delta = projection.deltas[cle];
    if (!Number.isFinite(delta)) return null;
    if (!projection.accord[cle]) { rejets.push("desaccord"); return null; }
    if (!ecartSignificatif(delta, profilLieu.variabilite?.[cle], PLANCHERS[cle])) {
      rejets.push("variabilite"); return null;
    }
    return delta;
  };

  const effets = [];
  const projete = (cle) => projection.projete?.[cle];

  // Saison sans gel : compte si le cycle de la culture est documenté.
  const dSaison = lire("saisonSansGel");
  if (dSaison !== null && actuelle.dimensions.cycle) {
    const apres = projete("saisonSansGel");
    const requis = actuelle.dimensions.cycle.requis;
    const avantOK = actuelle.dimensions.cycle.etat !== "defavorable";
    const apresOK = Number.isFinite(apres) ? apres >= requis : avantOK;
    effets.push({ dimension: "cycle", delta: dSaison,
      sens: apresOK && !avantOK ? "gain"
        : (!apresOK && avantOK) ? "perte"
        : (dSaison > 0 ? "amelioration" : "degradation") });
  }

  // Froid hivernal : le réchauffement peut faire perdre la dormance.
  const dFroid = lire("heuresFroid");
  if (dFroid !== null && actuelle.dimensions.froidHivernal) {
    const apres = projete("heuresFroid");
    const requis = actuelle.dimensions.froidHivernal.requis;
    const suffit = Number.isFinite(apres) ? apres >= requis : null;
    effets.push({ dimension: "froidHivernal", delta: dFroid,
      sens: suffit === false ? "perte" : (dFroid < 0 ? "degradation" : "amelioration") });
  }

  // Stress thermique : plus de chaleur n'est pas un progrès.
  const dChauds = lire("joursChauds");
  if (dChauds !== null && actuelle.dimensions.stressThermique) {
    effets.push({ dimension: "stressThermique", delta: dChauds,
      sens: dChauds > 0 ? "degradation" : "amelioration" });
  }

  // Eau : une aggravation compte comme réserve pour une culture sensible.
  const dEau = lire("deficitHydriqueSaisonChaude");
  if (dEau !== null && actuelle.dimensions.eau) {
    effets.push({ dimension: "eau", delta: dEau,
      sens: dEau > 0 ? "degradation" : "amelioration" });
  }

  if (!effets.length) {
    const raison = rejets.includes("desaccord") ? "modeles_en_desaccord"
      : rejets.includes("variabilite") ? "sous_la_variabilite"
      : "pas_de_projection";
    return { sens: "indisponible", effets: [], raison };
  }

  const pertes = effets.filter(e => e.sens === "perte" || e.sens === "degradation");
  const gains = effets.filter(e => e.sens === "gain" || e.sens === "amelioration");
  let sens = "stable";
  if (pertes.some(e => e.sens === "perte")) sens = "defavorable";
  else if (gains.some(e => e.sens === "gain") && !pertes.length) sens = "favorable";
  else if (gains.length && !pertes.length) sens = "favorable";
  else if (pertes.length && !gains.length) sens = "defavorable";
  else if (gains.length && pertes.length) sens = "contraste";

  return { sens, effets, reserves: pertes.map(p => p.dimension) };
}
