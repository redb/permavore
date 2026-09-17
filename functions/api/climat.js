/*
   Proxy climatique mutualisé (Cloudflare Pages Function).

   Raison d'être : deux utilisateurs d'un même secteur ne doivent pas
   provoquer deux fois le téléchargement et le calcul des mêmes séries.
   Les coordonnées sont donc arrondies à une grille de 0,1° (~11 km, l'ordre
   de grandeur de la résolution des modèles), et le résultat — quelques
   centaines d'octets une fois les indicateurs calculés — est mis en cache
   au bord du réseau. Le navigateur ne télécharge jamais les séries brutes
   (plusieurs Mo) : elles sont consommées ici.

   En cas d'indisponibilité, cette fonction renvoie une erreur explicite et
   le client continue sans projection : jamais de valeur approchée.
*/

import { profilClimatique, classifierKoppen, zoneInterneDepuisKoppen, DEFINITIONS }
  from "../../climat-core.mjs";

const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const CLIMAT = "https://climate-api.open-meteo.com/v1/climate";
const MODELES = ["EC_Earth3P_HR", "MRI_AGCM3_2_S"];
const CACHE_S = 30 * 24 * 3600;     // 30 jours : un climat ne bouge pas en un mois
const TIMEOUT_MS = 25000;

/* Fenêtres. La fenêtre future glisse avec le temps : +5 ans, sur dix ans. */
export function fenetres(aujourdhui = new Date()) {
  const annee = aujourdhui.getUTCFullYear();
  const debutFutur = annee + 5;
  return {
    // La fenêtre de référence des modèles est la MÊME que celle des
    // observations : c'est ce qui rend la méthode « delta » valide, puisque le
    // biais propre au modèle s'annule entre deux fenêtres identiques. Cela
    // divise aussi d'un tiers le volume téléchargé, ce qui compte : trois
    // séries de trente ans en parallèle faisaient échouer la fonction sur les
    // points où la source répond lentement.
    reference: { debut: annee - 20, fin: annee - 1 },
    observee:  { debut: annee - 20, fin: annee - 1 },
    futur:     { debut: debutFutur, fin: debutFutur + 9 },
  };
}

const grille = (v) => Math.round(v * 10) / 10;

// Diagnostic renvoyé en cas d'échec : sans lui, « source indisponible » ne dit
// pas si la source a refusé, expiré ou renvoyé une charge inattendue.
const dernierEchec = { statut: null, message: null, urlType: null };

async function json(url, essais = 2, type = "?") {
  for (let i = 0; i < essais; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, { signal: ctrl.signal, cf: { cacheTtl: CACHE_S } });
      if (r.ok) {
        const d = await r.json();
        if (d && d.daily) return d;
        dernierEchec.statut = 200;
        dernierEchec.message = d && d.reason ? String(d.reason).slice(0, 200) : "charge_inattendue";
      } else {
        dernierEchec.statut = r.status;
        dernierEchec.message = (await r.text().catch(() => "")).slice(0, 200);
      }
      dernierEchec.urlType = type;
    } catch (e) {
      dernierEchec.statut = 0;
      dernierEchec.message = (e && e.name === "AbortError") ? "delai_depasse" : String(e && e.message).slice(0, 200);
      dernierEchec.urlType = type;
    }
    finally { clearTimeout(t); }
  }
  return null;
}

const serieArchive = (d) => ({
  time: d.daily.time, tmin: d.daily.temperature_2m_min,
  tmax: d.daily.temperature_2m_max, precip: d.daily.precipitation_sum,
});

const serieModele = (d, m) => ({
  time: d.daily.time, tmin: d.daily[`temperature_2m_min_${m}`],
  tmax: d.daily[`temperature_2m_max_${m}`], precip: d.daily[`precipitation_sum_${m}`],
});

export async function onRequestGet({ request }) {
  const u = new URL(request.url);
  const lat = Number(u.searchParams.get("lat")), lng = Number(u.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ erreur: "coordonnees_invalides" }, { status: 400 });
  }
  const la = grille(lat), lo = grille(lng);

  // Clé de cache : la grille, pas les coordonnées exactes de l'utilisateur.
  const cleCache = new Request(`https://permavore.pages.dev/api/climat?lat=${la}&lng=${lo}`,
    { method: "GET" });
  const cache = caches.default;
  const enCache = await cache.match(cleCache);
  if (enCache) return enCache;

  const f = fenetres();
  const q = (base, params) => `${base}?${new URLSearchParams(params)}`;
  const communModele = {
    latitude: String(la), longitude: String(lo), models: MODELES.join(","),
    daily: "temperature_2m_min,temperature_2m_max,precipitation_sum",
  };

  // Séquentiel et non parallèle : chaque série pèse plusieurs dizaines de
  // méga-octets une fois analysée, et les charger toutes ensemble faisait
  // échouer la fonction là où la source répond lentement (Brest, Melbourne).
  const obs = await json(q(ARCHIVE, { latitude: String(la), longitude: String(lo),
    start_date: `${f.observee.debut}-01-01`, end_date: `${f.observee.fin}-12-31`,
    daily: "temperature_2m_min,temperature_2m_max,precipitation_sum", timezone: "UTC" }), 2, "archive");
  if (!obs) {
    // Une limite de débit n'est pas une panne : elle se réessaie. On le
    // distingue pour que le client patiente au lieu de conclure à un échec.
    if (dernierEchec.statut === 429) {
      return Response.json({ erreur: "limite_debit", diagnostic: dernierEchec },
        { status: 429, headers: { "Retry-After": "60" } });
    }
    return Response.json({ erreur: "source_indisponible", diagnostic: dernierEchec }, { status: 503 });
  }

  const ref = await json(q(CLIMAT, { ...communModele,
    start_date: `${f.reference.debut}-01-01`, end_date: `${f.reference.fin}-12-31` }));
  const fut = ref ? await json(q(CLIMAT, { ...communModele,
    start_date: `${f.futur.debut}-01-01`, end_date: `${f.futur.fin}-12-31` })) : null;

  const serieObs = serieArchive(obs);
  const profil = profilClimatique(serieObs, la);
  if (!profil) return Response.json({ erreur: "donnees_insuffisantes" }, { status: 503 });
  const koppen = classifierKoppen(serieObs);

  // Projection : delta entre deux fenêtres du MÊME modèle, ce qui annule son
  // biais propre, puis appliqué au profil observé (méthode « delta change »).
  let projection = null;
  if (ref && fut) {
    const parModele = MODELES.map(m => {
      const a = profilClimatique(serieModele(ref, m), la);
      const b = profilClimatique(serieModele(fut, m), la);
      return (a && b) ? { modele: m, deltas: {
        saisonSansGel: b.saisonSansGel - a.saisonSansGel,
        joursChauds: b.joursChauds - a.joursChauds,
        minimumHivernal: b.minimumHivernal - a.minimumHivernal,
        heuresFroid: (Number.isFinite(b.heuresFroid) && Number.isFinite(a.heuresFroid))
          ? b.heuresFroid - a.heuresFroid : null,
        deficitHydriqueSaisonChaude:
          (Number.isFinite(b.deficitHydriqueSaisonChaude) && Number.isFinite(a.deficitHydriqueSaisonChaude))
            ? b.deficitHydriqueSaisonChaude - a.deficitHydriqueSaisonChaude : null,
      } } : null;
    }).filter(Boolean);

    if (parModele.length) {
      const cles = ["saisonSansGel", "joursChauds", "minimumHivernal", "heuresFroid",
        "deficitHydriqueSaisonChaude"];
      const deltas = {}, accord = {};
      for (const c of cles) {
        const vs = parModele.map(x => x.deltas[c]).filter(v => Number.isFinite(v));
        if (vs.length !== parModele.length) { deltas[c] = null; accord[c] = false; continue; }
        deltas[c] = Math.round((vs.reduce((t, v) => t + v, 0) / vs.length) * 10) / 10;
        accord[c] = vs.every(v => v >= 0) || vs.every(v => v <= 0);
      }
      const projete = {};
      for (const c of cles) {
        projete[c] = (Number.isFinite(profil[c]) && Number.isFinite(deltas[c]))
          ? Math.round((profil[c] + deltas[c]) * 10) / 10 : null;
      }
      projection = { deltas, accord, projete, modeles: MODELES,
        modelesExploitables: parModele.length };
    }
  }

  const corps = {
    lieu: { latitude: la, longitude: lo, grille: 0.1 },
    profilClimatiqueLieu: profil,
    climat: koppen,
    zoneInterne: zoneInterneDepuisKoppen(koppen, profil),
    projectionClimatiqueLieu: projection,
    tracabilite: {
      sourceObservations: "Open-Meteo Historical Weather API (réanalyse ERA5 / ERA5-Land)",
      sourceProjections: projection ? "Open-Meteo Climate API (CMIP6 HighResMIP)" : null,
      modeles: projection ? MODELES : null,
      scenario: projection ? "au plus proche de RCP 8.5" : null,
      periodeObservee: `${f.observee.debut}-${f.observee.fin}`,
      periodeReferenceModeles: projection ? `${f.reference.debut}-${f.reference.fin}` : null,
      note: projection
        ? "La fenêtre de référence des modèles est la même que celle des observations, afin que le biais propre au modèle s'annule dans l'écart."
        : null,
      periodeFuture: projection ? `${f.futur.debut}-${f.futur.fin}` : null,
      methodeProjection: projection
        ? "delta entre deux fenêtres du même modèle, appliqué au profil observé"
        : null,
      resolution: "environ 10 km",
      licence: "CC BY 4.0 (Open-Meteo)",
      recupere: new Date().toISOString().slice(0, 10),
      definitions: DEFINITIONS,
    },
  };

  const reponse = Response.json(corps, {
    headers: { "Cache-Control": `public, max-age=86400, s-maxage=${CACHE_S}` },
  });
  await cache.put(cleCache, reponse.clone());
  return reponse;
}
