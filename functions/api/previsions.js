/*
   Prévisions à 7 jours, mutualisées (Cloudflare Pages Function).

   Même principe que /api/climat : maille de 0,1°, un seul appel à la source
   par maille et par tranche de trois heures, quel que soit le nombre de
   visiteurs. Le navigateur reçoit un objet de quelques centaines d'octets.
   Source : Open-Meteo (gratuit, sans clé, licence CC BY 4.0).
*/

import { compacter, VERSION_PREVISIONS } from "../../previsions-core.mjs";

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const CACHE_S = 3 * 3600;          // 3 h : une prévision ne change pas plus vite
const TIMEOUT_MS = 12000;
const JOURS = 7;

const grille = (v) => Math.round(v * 10) / 10;

export function urlCacheEdge(la, lo, version = VERSION_PREVISIONS) {
  return `https://permavore.pages.dev/api/previsions?v=${version}&lat=${la}&lng=${lo}`;
}

export async function onRequestGet({ request }) {
  const u = new URL(request.url);
  const lat = Number(u.searchParams.get("lat")), lng = Number(u.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ erreur: "coordonnees_invalides" }, { status: 400 });
  }
  const la = grille(lat), lo = grille(lng);
  const cleCache = new Request(urlCacheEdge(la, lo), { method: "GET" });
  const cache = caches.default;
  const enCache = await cache.match(cleCache);
  if (enCache) return enCache;

  const url = `${FORECAST}?${new URLSearchParams({
    latitude: String(la), longitude: String(lo),
    daily: "temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max",
    timezone: "auto", forecast_days: String(JOURS),
  })}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let donnees = null, statut = 0;
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    statut = r.status;
    if (r.ok) donnees = await r.json();
  } catch (e) { statut = 0; }
  finally { clearTimeout(t); }

  const prev = donnees ? compacter(donnees.daily, { calculeLe: new Date().toISOString() }) : null;
  if (!prev) {
    return Response.json({ erreur: statut === 429 ? "limite_debit" : "source_indisponible", statut },
      { status: statut === 429 ? 429 : 503, headers: { "Cache-Control": "no-store" } });
  }
  prev.maille = { lat: la, lng: lo };
  prev.fuseau = donnees.timezone || null;
  const reponse = Response.json(prev, {
    headers: { "Cache-Control": `public, max-age=${CACHE_S}`, "Access-Control-Allow-Origin": "*" },
  });
  await cache.put(cleCache, reponse.clone());
  return reponse;
}
