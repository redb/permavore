/*
   Banc d'essai multi-climats.

   Six lieux volontairement contrastés, dont un dans l'hémisphère sud et un
   sous les tropiques. Leur rôle n'est PAS de produire un verdict partout :
   « indéterminé » est un résultat correct. Il est de faire apparaître les
   absurdités — inversion d'hémisphère, rusticité confondue avec le cycle
   annuel, chaleur nécessaire confondue avec chaleur tolérée, réchauffement
   présenté comme un bénéfice.

   Les profils sont mis en cache sur disque après un premier appel réel à
   l'API, pour que la suite de tests reste rapide et reproductible.
*/

export const LIEUX_TEST = [
  { id: "rumilly",    nom: "Rumilly (Haute-Savoie, France)", lat: 45.87,  lng: 5.94,   attendu: "Cfb" },
  { id: "montpellier",nom: "Montpellier (France)",            lat: 43.61,  lng: 3.88,   attendu: "Csa" },
  { id: "brest",      nom: "Brest (France)",                  lat: 48.39,  lng: -4.49,  attendu: "Cfb" },
  { id: "winnipeg",   nom: "Winnipeg (Canada)",               lat: 49.90,  lng: -97.14, attendu: "Dfb" },
  { id: "kampala",    nom: "Kampala (Ouganda)",               lat: 0.31,   lng: 32.58,  attendu: "Af" },
  { id: "melbourne",  nom: "Melbourne (Australie)",           lat: -37.81, lng: 144.96, attendu: "Cfb" },
];

const CACHE = new URL("./.climats-cache.json", import.meta.url);

export async function profilsDeReference({ forcer = false } = {}) {
  const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
  if (!forcer && existsSync(CACHE)) {
    try { return JSON.parse(readFileSync(CACHE, "utf8")); } catch { /* on recalcule */ }
  }
  const base = process.env.PERMAVORE_API || "https://permavore.pages.dev";
  const resultats = {};
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  for (const l of LIEUX_TEST) {
    // Open-Meteo limite le débit par minute : constituer le banc d'essai d'un
    // seul élan déclenche la limite. On espace, et on réessaie une fois.
    let d = null;
    for (let essai = 0; essai < 5 && !d; essai++) {
      if (essai) await pause(65000);      // la limite d'Open-Meteo est par minute
      const r = await fetch(`${base}/api/climat?lat=${l.lat}&lng=${l.lng}`);
      if (r.ok) d = await r.json();
      else if (r.status !== 429 && r.status !== 503) {
        throw new Error(`climat refusé pour ${l.id} (${r.status})`);
      }
    }
    if (!d) throw new Error(`climat indisponible pour ${l.id} après cinq tentatives`);
    resultats[l.id] = { lieu: l, profil: d.profilClimatiqueLieu,
      climat: d.climat, projection: d.projectionClimatiqueLieu };
    await pause(3000);
  }
  writeFileSync(CACHE, JSON.stringify(resultats, null, 2));
  return resultats;
}
