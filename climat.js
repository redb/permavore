/* =========================================================================
   Permavore — indicateurs agro-climatiques et tendance climatique locale

   Source : API Climate d'Open-Meteo (CMIP6 HighResMIP, modèles 20–51 km
   descendus à 10 km, 1950–2050, scénario « au plus proche de RCP 8.5 »,
   licence CC BY 4.0, sans clé pour un usage non commercial).

   Ce que fait ce module :
   - télécharge les séries quotidiennes (tmin, tmax) sur deux fenêtres de 20 ans,
     l'une représentant le climat récent, l'autre l'horizon (2030-2049) ;
     20 ans, parce qu'à 5 ans l'écart climatique reste plus petit que la
     variabilité d'une année à l'autre — l'annoncer serait du bruit ;
   - en tire trois indicateurs par année, puis leur moyenne par fenêtre :
       • durée de la saison sans gel (entre dernière gelée de printemps et
         première gelée d'automne, seuil tmin ≤ 0 °C) ;
       • nombre de jours chauds (tmax > 30 °C) ;
       • minimum hivernal (tmin la plus basse de l'année).
   - compare les deux fenêtres, modèle par modèle, et ne conclut que si les
     modèles vont dans le même sens ET que l'écart dépasse la variabilité
     interannuelle mesurée sur la période de référence.

   Ce qu'il ne fait pas :
   - il ne dit RIEN d'une culture dont les besoins thermiques ne sont pas
     renseignés dans la base. Une tendance n'est produite que pour les cultures
     documentées comme craignant le gel (`frileux`), donc limitées par la
     chaleur — le seul lien que les données permettent d'établir honnêtement.
   - il ne présente jamais le réchauffement comme favorable en soi : plus de
     jours chauds, c'est aussi plus de stress thermique et de besoins en eau,
     et une culture exigeant du froid hivernal peut y perdre.
   ========================================================================= */

const CLIMAT_API = "https://climate-api.open-meteo.com/v1/climate";
// Deux modèles pour éviter l'artefact d'un modèle unique, sans alourdir la requête.
const CLIMAT_MODELES = ["EC_Earth3P_HR", "MRI_AGCM3_2_S"];
// Fenêtres de 20 ans : sur 5 ou 10 ans, l'écart entre deux périodes reste noyé
// dans la variabilité d'une année à l'autre. On compare donc le climat récent à
// la période 2030-2049 (centrée ~2040), et on le DIT dans la source affichée.
const CLIMAT_FENETRES = {
  reference: { debut: "2005-01-01", fin: "2024-12-31", libelle: "2005-2024" },
  horizon:   { debut: "2030-01-01", fin: "2049-12-31", libelle: "2030-2049" },
};
const CLIMAT_META = {
  source: "Open-Meteo Climate API (CMIP6 HighResMIP)",
  scenario: "au plus proche de RCP 8.5",
  resolution: "10 km (modèles 20–51 km descendus d'échelle)",
  licence: "CC BY 4.0",
};
const SEUIL_GEL = 0;        // °C — tmin ≤ 0 : gelée
const SEUIL_CHAUD = 30;     // °C — tmax > 30 : jour chaud

/** Indicateurs d'une année à partir de ses séries quotidiennes. */
function indicateursAnnee(jours) {
  // jours : [{ mois, tmin, tmax, index }] triés dans l'ordre du calendrier
  let derniereGeleePrintemps = null, premiereGeleeAutomne = null;
  let joursChauds = 0, minimum = null;
  jours.forEach(j => {
    if (Number.isFinite(j.tmin)) {
      if (minimum === null || j.tmin < minimum) minimum = j.tmin;
      if (j.tmin <= SEUIL_GEL) {
        if (j.mois <= 6) derniereGeleePrintemps = j.index;
        else if (premiereGeleeAutomne === null) premiereGeleeAutomne = j.index;
      }
    }
    if (Number.isFinite(j.tmax) && j.tmax > SEUIL_CHAUD) joursChauds++;
  });
  // Sans gelée relevée : on borne par l'année, plutôt que d'inventer une date.
  const debut = derniereGeleePrintemps === null ? 0 : derniereGeleePrintemps;
  const fin = premiereGeleeAutomne === null ? jours.length - 1 : premiereGeleeAutomne;
  return { saisonSansGel: Math.max(0, fin - debut), joursChauds, minimum };
}

/** Moyenne des indicateurs annuels sur une fenêtre, et variabilité interannuelle. */
function moyenneIndicateurs(annees) {
  const n = annees.length || 1;
  const valeurs = cle => annees.map(a => Number.isFinite(a[cle]) ? a[cle] : 0);
  const moyenne = cle => valeurs(cle).reduce((t, v) => t + v, 0) / n;
  const ecartType = cle => {
    const m = moyenne(cle);
    return Math.sqrt(valeurs(cle).reduce((t, v) => t + (v - m) ** 2, 0) / n);
  };
  return {
    saisonSansGel: Math.round(moyenne("saisonSansGel")),
    joursChauds: Math.round(moyenne("joursChauds")),
    minimum: Math.round(moyenne("minimum") * 10) / 10,
    variabilite: {
      saisonSansGel: Math.round(ecartType("saisonSansGel") * 10) / 10,
      joursChauds: Math.round(ecartType("joursChauds") * 10) / 10,
    },
    annees: n,
  };
}

/** Découpe les séries d'un modèle par année civile et calcule les indicateurs. */
function indicateursFenetre(dates, tmin, tmax) {
  const parAnnee = new Map();
  dates.forEach((iso, i) => {
    const annee = iso.slice(0, 4);
    if (!parAnnee.has(annee)) parAnnee.set(annee, []);
    const liste = parAnnee.get(annee);
    liste.push({ mois: Number(iso.slice(5, 7)), tmin: tmin[i], tmax: tmax[i], index: liste.length });
  });
  return moyenneIndicateurs([...parAnnee.values()].map(indicateursAnnee));
}

/**
 * Tendance pour une culture limitée par la chaleur (craint le gel).
 * Une tendance n'est annoncée que si l'écart dépasse la variabilité d'une année
 * à l'autre ET que les modèles vont dans le même sens. Sinon : « incertain »,
 * avec la raison. Le réchauffement n'est jamais présumé favorable : une hausse
 * marquée des jours chauds est signalée comme un risque, pas comme un gain.
 */
function tendanceChaleur(ref, horizon, accordModeles) {
  const dSaison = horizon.saisonSansGel - ref.saisonSansGel;
  const dChauds = horizon.joursChauds - ref.joursChauds;
  const variabilite = (ref.variabilite && ref.variabilite.saisonSansGel) || 0;
  const seuil = Math.max(7, variabilite);       // au moins une semaine, et au-delà du bruit
  const base = { dSaison, dChauds, seuil: Math.round(seuil * 10) / 10,
    exces: dChauds >= Math.max(10, (ref.joursChauds || 0) * 0.5) };
  if (!accordModeles) return { ...base, tendance: "incertain", confiance: "faible", raison: "desaccord" };
  if (Math.abs(dSaison) < seuil) {
    return { ...base, tendance: "incertain", confiance: "faible", raison: "variabilite" };
  }
  return { ...base, tendance: dSaison > 0 ? "favorable" : "defavorable", confiance: "faible" };
}

/** Les modèles vont-ils dans le même sens sur la saison sans gel ? */
function modelesDaccord(ecarts) {
  if (ecarts.length < 2) return false;
  return ecarts.every(e => e >= 0) || ecarts.every(e => e <= 0);
}

/** Construit l'URL d'une fenêtre. */
function urlClimat(lat, lng, fenetre) {
  const p = new URLSearchParams({
    latitude: String(lat), longitude: String(lng),
    start_date: fenetre.debut, end_date: fenetre.fin,
    models: CLIMAT_MODELES.join(","),
    daily: "temperature_2m_min,temperature_2m_max",
  });
  return `${CLIMAT_API}?${p}`;
}

/**
 * Indicateurs des deux fenêtres pour un point. Borné et mis en cache par
 * requeteJSON (app.js). Renvoie null en cas d'échec : aucune projection
 * approximative n'est fabriquée.
 */
async function projectionLocale(lat, lng) {
  const reponses = await Promise.all([
    requeteJSON(urlClimat(lat, lng, CLIMAT_FENETRES.reference), { timeoutMs: 20000, cacheMs: 30 * 24 * 3600 * 1000 }),
    requeteJSON(urlClimat(lat, lng, CLIMAT_FENETRES.horizon), { timeoutMs: 20000, cacheMs: 30 * 24 * 3600 * 1000 }),
  ]);
  if (reponses.some(r => !r.ok || !r.data || !r.data.daily)) return null;

  const parModele = CLIMAT_MODELES.map(m => {
    const lire = (data) => {
      const d = data.daily;
      const tmin = d[`temperature_2m_min_${m}`], tmax = d[`temperature_2m_max_${m}`];
      return (Array.isArray(tmin) && Array.isArray(tmax)) ? indicateursFenetre(d.time, tmin, tmax) : null;
    };
    const ref = lire(reponses[0].data), hor = lire(reponses[1].data);
    return (ref && hor) ? { modele: m, ref, hor } : null;
  }).filter(Boolean);
  if (!parModele.length) return null;

  const moyenne = (cle, champ) => Math.round(
    parModele.reduce((t, x) => t + x[cle][champ], 0) / parModele.length * 10) / 10;
  const reference = { saisonSansGel: moyenne("ref", "saisonSansGel"), joursChauds: moyenne("ref", "joursChauds"), minimum: moyenne("ref", "minimum") };
  const horizon = { saisonSansGel: moyenne("hor", "saisonSansGel"), joursChauds: moyenne("hor", "joursChauds"), minimum: moyenne("hor", "minimum") };
  const accord = modelesDaccord(parModele.map(x => x.hor.saisonSansGel - x.ref.saisonSansGel));

  return {
    reference, horizon, accord,
    modeles: parModele.map(x => x.modele),
    meta: {
      ...CLIMAT_META,
      periodeReference: CLIMAT_FENETRES.reference.libelle,
      horizonPeriode: CLIMAT_FENETRES.horizon.libelle,
      miseAJour: new Date().toISOString().slice(0, 7),
    },
  };
}
