/* =========================================================================
   Permavore — logique applicative
   ========================================================================= */

const MOIS = ["janvier","février","mars","avril","mai","juin","juillet",
              "août","septembre","octobre","novembre","décembre"];
const moisNom = m => MOIS[((m - 1) % 12 + 12) % 12];

// État
const state = {
  zone: "tempere",
  surface: null,
  categorie: "tous",
  cycle: "tous",
  petitsEspaces: false,
  recherche: "",
  villeCoords: null,         // {lat,lng} de la commune sélectionnée
  vue: "liste",              // "liste" (compact, par défaut) | "cartes"
  filtrePotager: false,      // n'afficher que mes plantes adoptées
  adoptees: new Set(),       // ids des plantes adoptées (persisté)
};

// ---------- Persistance "Mon potager" ----------
const LS_KEY = "permavore.adoptees";
function chargerAdoptees() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) state.adoptees = new Set(JSON.parse(raw));
  } catch (e) { /* localStorage indispo : on ignore */ }
}
function sauverAdoptees() {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...state.adoptees])); }
  catch (e) { /* ignore */ }
}
function estAdoptee(id) { return state.adoptees.has(id); }

// ---------- Plantes ajoutées par l'utilisateur (localStorage) ----------
const LS_PLANTES = "permavore.plantes";
function slug(s) {
  return normaliseVille(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "plante";
}
function chargerPlantesPerso() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_PLANTES) || "[]");
    if (!Array.isArray(arr)) throw new TypeError("Format de stockage invalide");
    arr.forEach((brut, index) => {
      const resultat = validerPlantePerso(brut);
      if (!resultat.valide) {
        journaliserAvertissement("plante_locale_rejetee", { index, erreurs: resultat.erreurs });
        return;
      }
      const p = resultat.plante;
      if (!PLANTES.some(x => x.id === p.id)) PLANTES.push(p);
    });
  } catch (erreur) {
    journaliserAvertissement("stockage_plantes_illisible", { message: erreur.message });
  }
}
function sauverPlantesPerso() {
  try { localStorage.setItem(LS_PLANTES, JSON.stringify(PLANTES.filter(p => p.perso))); }
  catch (erreur) {
    journaliserAvertissement("stockage_plantes_echec", { message: erreur.message });
  }
}
function supprimerPlante(id) {
  const i = PLANTES.findIndex(p => p.id === id);
  if (i >= 0) PLANTES.splice(i, 1);
  state.adoptees.delete(id); sauverAdoptees();
  sauverPlantesPerso();
  fermerModale(); rendre();
}
function basculerAdoption(id) {
  if (state.adoptees.has(id)) state.adoptees.delete(id);
  else state.adoptees.add(id);
  sauverAdoptees();
  majMonPotager();
}
function majMonPotager() {
  const b = $("#mon-potager");
  if (!b) return;
  const n = state.adoptees.size;
  b.hidden = n === 0 && !state.filtrePotager;
  b.textContent = `🌱 Mon potager (${n})`;
  b.classList.toggle("actif", state.filtrePotager);
}

// ---------- Utilitaires ----------
function normaliseVille(v) {
  return (v || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function journaliserAvertissement(code, details = {}) {
  console.warn("[permavore]", { niveau: "warning", code, ...details });
}

function echapperHTML(valeur) {
  return String(valeur ?? "").replace(/[&<>"']/g, caractere => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;",
  })[caractere]);
}

function urlExterneSure(valeur) {
  if (!valeur) return "";
  try {
    const url = new URL(valeur);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch (e) {
    return "";
  }
}

function validerPlantePerso(brut) {
  const erreurs = [];
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) {
    return { valide: false, erreurs: ["La fiche n'est pas un objet."] };
  }

  const texte = (champ, fallback, max, requis = false) => {
    if (typeof brut[champ] !== "string") {
      if (requis) erreurs.push(`${champ} doit être un texte.`);
      return fallback;
    }
    const valeur = brut[champ].trim();
    if (requis && !valeur) erreurs.push(`${champ} est requis.`);
    if (valeur.length > max) erreurs.push(`${champ} dépasse ${max} caractères.`);
    return valeur || fallback;
  };
  const choix = (champ, valeurs) => {
    const valeur = brut[champ];
    if (!Object.hasOwn(valeurs, valeur)) erreurs.push(`${champ} est invalide.`);
    return valeur;
  };

  const id = texte("id", "", 120, true);
  if (id && !/^[a-z0-9-]+$/.test(id)) erreurs.push("id contient des caractères invalides.");
  const nom = texte("nom", "", 80, true);
  const latin = texte("latin", "—", 120);
  const emoji = texte("emoji", "🌱", 16);
  const espacement = texte("espacement", "—", 80);
  const recolte = texte("recolte", "—", 160);
  const court = texte("court", "Plante ajoutée par toi.", 300);
  const long = texte("long", court, 3000);
  const cat = choix("cat", CATEGORIES);
  const cycle = choix("cycle", CYCLES);
  const encombrement = choix("encombrement", ENCOMBREMENTS);
  const soleil = choix("soleil", SOLEILS);

  const diff = Number(brut.diff);
  if (!Number.isInteger(diff) || !Object.hasOwn(DIFFICULTES, diff)) {
    erreurs.push("diff est invalide.");
  }
  const densite = Number(brut.densite);
  if (!Number.isFinite(densite) || densite <= 0 || densite > 1000) {
    erreurs.push("densite doit être comprise entre 0 et 1000.");
  }

  const semisValide = Array.isArray(brut.semis) && brut.semis.length >= 1
    && brut.semis.length <= 4 && brut.semis.every(fenetre =>
      Array.isArray(fenetre) && fenetre.length === 2
      && fenetre.every(mois => Number.isInteger(mois) && mois >= 1 && mois <= 12));
  if (!semisValide) erreurs.push("semis doit contenir de 1 à 4 périodes valides.");

  const conseilsValides = Array.isArray(brut.conseils) && brut.conseils.length <= 20
    && brut.conseils.every(conseil => typeof conseil === "string"
      && conseil.trim().length <= 300);
  if (!conseilsValides) erreurs.push("conseils est invalide.");

  const photoBrute = texte("photo", "", 2000);
  if (photoBrute && !estImageValide(photoBrute)) erreurs.push("photo doit être une URL d'image HTTP(S).");
  const lienBrut = texte("lien", "", 2000);
  const lien = urlExterneSure(lienBrut);
  if (lienBrut && !lien) erreurs.push("lien doit être une URL HTTP(S).");

  if (erreurs.length) return { valide: false, erreurs };
  return {
    valide: true,
    erreurs: [],
    plante: {
      id, perso: true, nom, latin, cat, emoji,
      photo: photoBrute ? urlExterneSure(photoBrute) : undefined,
      cycle, diff, encombrement, soleil, densite, espacement,
      frileux: Boolean(brut.frileux), semis: brut.semis, recolte,
      court, long, conseils: brut.conseils.map(conseil => conseil.trim()),
      lien, sponsorise: Boolean(brut.sponsorise && lien),
    },
  };
}

const CONFIG_RESEAU = Object.freeze({
  timeoutMs: 5000,
  retries: 1,
  cacheMs: 10 * 60 * 1000,
});
const cacheRequetes = new Map();
const requetesEnCours = new Map();

async function requeteJSON(url, options = {}) {
  const config = { ...CONFIG_RESEAU, ...options };
  const maintenant = Date.now();
  const entreeCache = cacheRequetes.get(url);
  if (entreeCache && entreeCache.expireA > maintenant) return entreeCache.resultat;
  if (requetesEnCours.has(url)) return requetesEnCours.get(url);

  const execution = (async () => {
    let dernierStatut = 0;
    for (let essai = 0; essai <= config.retries; essai++) {
      const controleur = new AbortController();
      const timeout = setTimeout(() => controleur.abort(), config.timeoutMs);
      try {
        const reponse = await fetch(url, {
          signal: controleur.signal,
          headers: config.headers || {},
        });
        dernierStatut = reponse.status;
        if (reponse.ok) {
          const resultat = { ok: true, status: reponse.status, data: await reponse.json() };
          cacheRequetes.set(url, { expireA: Date.now() + config.cacheMs, resultat });
          return resultat;
        }
        const temporaire = reponse.status === 429 || reponse.status >= 500;
        if (!temporaire || essai === config.retries) {
          return { ok: false, status: reponse.status, data: null };
        }
      } catch (erreur) {
        if (essai === config.retries) break;
      } finally {
        clearTimeout(timeout);
      }
      await new Promise(resolve => setTimeout(resolve, 150 * (essai + 1)));
    }
    const hote = (() => {
      try { return new URL(url).hostname; }
      catch (e) { return "inconnu"; }
    })();
    journaliserAvertissement("api_indisponible", { hote, status: dernierStatut });
    return { ok: false, status: dernierStatut, data: null };
  })();

  requetesEnCours.set(url, execution);
  try {
    return await execution;
  } finally {
    requetesEnCours.delete(url);
  }
}

// Décale une fenêtre [debut, fin] selon la zone. Renvoie {debut, fin}.
function fenetreZone([d, f], zone) {
  const z = ZONES[zone] || ZONES.tempere;
  const wrapOrigine = f < d;                 // fenêtre à cheval sur l'année ?
  let deb = d + z.debut;
  let fin = f + z.fin;

  if (!wrapOrigine) {
    // Fenêtre "normale" : rester dans 1..12 sans inverser début/fin.
    deb = Math.min(12, Math.max(1, deb));
    fin = Math.min(12, Math.max(1, fin));
    if (deb > fin) fin = deb;                 // décalage trop serré → 1 mois
    return { debut: deb, fin: fin, wrapAnnee: false };
  }
  // Fenêtre à cheval sur l'année : décalage cyclique.
  const wrap = m => ((m - 1) % 12 + 12) % 12 + 1;
  return { debut: wrap(deb), fin: wrap(fin), wrapAnnee: true };
}

// Un mois donné est-il dans la fenêtre (gestion du passage d'année) ?
function moisDansFenetre(mois, { debut, fin }) {
  if (debut <= fin) return mois >= debut && mois <= fin;
  return mois >= debut || mois <= fin; // fenêtre à cheval sur l'année
}

// Statut de plantation pour la zone courante : "now" | "soon" | "later"
function statutPlantation(plante, zone, moisCourant) {
  const fenetres = plante.semis.map(w => fenetreZone(w, zone));
  if (fenetres.some(f => moisDansFenetre(moisCourant, f))) return "now";
  const moisProchain = (moisCourant % 12) + 1;
  if (fenetres.some(f => moisDansFenetre(moisProchain, f))) return "soon";
  return "later";
}

// Texte lisible de la fenêtre de semis pour la zone
function texteFenetre(plante, zone) {
  return plante.semis.map(w => {
    const f = fenetreZone(w, zone);
    return f.debut === f.fin ? moisNom(f.debut)
      : `${moisNom(f.debut)} → ${moisNom(f.fin)}`;
  }).join(" · ");
}

// Plante adaptée à la zone ? (les frileuses sont exclues de la montagne)
function adapteeZone(plante, zone) {
  if (zone === "montagne" && plante.frileux) return false;
  return true;
}

// Estimation du nombre de pieds pour une surface dédiée
function nbPieds(plante, surfaceDediee) {
  return Math.max(1, Math.round(plante.densite * surfaceDediee));
}

// Lien d'achat : 1) lien propre à la plante, 2) partenaire global, 3) recherche web
function lienAchat(plante) {
  const lienPropre = urlExterneSure(plante.lien);
  if (lienPropre) return lienPropre;
  if (typeof PARTENAIRE_DEFAUT !== "undefined" && PARTENAIRE_DEFAUT.actif) {
    const lienPartenaire = urlExterneSure(
      PARTENAIRE_DEFAUT.url.replace("{q}", encodeURIComponent(plante.nom)));
    if (lienPartenaire) return lienPartenaire;
  }
  const q = encodeURIComponent(`graines ${plante.nom} bio potager`);
  return `https://www.google.com/search?q=${q}`;
}
// Le lien est-il sponsorisé (badge "Partenaire ✦") ?
function estSponsorise(plante) {
  if (urlExterneSure(plante.lien)) return plante.sponsorise === true;
  return typeof PARTENAIRE_DEFAUT !== "undefined"
    && PARTENAIRE_DEFAUT.actif && PARTENAIRE_DEFAUT.sponsorise
    && Boolean(urlExterneSure(PARTENAIRE_DEFAUT.url.replace("{q}", "plante")));
}

// ---------- Détection de zone ----------
function zoneDepuisVille(ville) {
  return VILLES_ZONES[normaliseVille(ville)] || null;
}

// --- Géocodage via l'API Base Adresse Nationale (data.gouv.fr, gratuite, sans clé) ---
// Recherche de communes : renvoie une liste {nom, cp, ctx, lat, lng}. Borné + fallback [].
async function geocodeVille(q) {
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}`
    + `&type=municipality&limit=6&autocomplete=1`;
  const reponse = await requeteJSON(url);
  if (!reponse.ok || !Array.isArray(reponse.data.features)) return [];
  return reponse.data.features.map(f => {
    const proprietes = f && f.properties;
    const coordonnees = f && f.geometry && f.geometry.coordinates;
    const nom = proprietes && (proprietes.city || proprietes.name);
    if (typeof nom !== "string" || !Array.isArray(coordonnees)
      || !Number.isFinite(coordonnees[0]) || !Number.isFinite(coordonnees[1])) return null;
    return {
      nom: nom.slice(0, 120),
      cp: typeof proprietes.postcode === "string" ? proprietes.postcode.slice(0, 12) : "",
      ctx: typeof proprietes.context === "string" ? proprietes.context.slice(0, 180) : "",
      lng: coordonnees[0],
      lat: coordonnees[1],
    };
  }).filter(Boolean).slice(0, 6);
}

// Géocodage inverse (coords → commune). Borné + fallback null.
async function reverseVille(lat, lng) {
  const url = `https://api-adresse.data.gouv.fr/reverse/?lon=${lng}&lat=${lat}&type=municipality`;
  const reponse = await requeteJSON(url);
  const f = reponse.ok && Array.isArray(reponse.data.features)
    ? reponse.data.features[0] : null;
  const proprietes = f && f.properties;
  const nom = proprietes && (proprietes.city || proprietes.name);
  if (typeof nom !== "string") return null;
  return {
    nom: nom.slice(0, 120),
    cp: typeof proprietes.postcode === "string" ? proprietes.postcode.slice(0, 12) : "",
    lat,
    lng,
  };
}

// --- Autocomplétion "directe dans le champ" ---
let acTimer = null, acItems = [], acIndex = -1;

function onVilleInput() {
  state.villeCoords = null;                 // toute frappe annule la sélection précédente
  const q = $("#ville").value.trim();
  clearTimeout(acTimer);
  if (q.length < 2) { hideAc(); return; }
  acTimer = setTimeout(async () => {
    const res = await geocodeVille(q);
    if ($("#ville").value.trim() !== q) return;   // réponse obsolète
    acItems = res; acIndex = -1; renderAc(res);
  }, 220);
}

function renderAc(res) {
  const ac = $("#ac");
  ac.replaceChildren();
  if (!res.length) {
    const vide = el("div", "ac-vide");
    vide.textContent = "Aucune commune trouvée";
    ac.appendChild(vide);
    ac.hidden = false; return;
  }
  res.forEach((r, i) => {
    const bouton = el("button", "ac-item");
    bouton.dataset.i = String(i);
    bouton.append(document.createTextNode(`📍 ${r.nom}`));
    const detail = el("span", "ac-cp");
    detail.textContent = `${r.cp}${r.ctx ? " · " + r.ctx : ""}`;
    bouton.appendChild(detail);
    ac.appendChild(bouton);
  });
  ac.hidden = false;
  $("#ville").setAttribute("aria-expanded", "true");
}

function hideAc() {
  const ac = $("#ac");
  if (ac) { ac.hidden = true; ac.innerHTML = ""; }
  $("#ville").setAttribute("aria-expanded", "false");
}

function choisirVille(r) {
  $("#ville").value = r.nom;
  state.villeCoords = { lat: r.lat, lng: r.lng };
  hideAc();
  const z = zoneDepuisVille(r.nom) || zoneDepuisCoords(r.lat, r.lng);
  majZone(z, `📍 ${r.nom}${r.cp ? " (" + r.cp + ")" : ""}`);
}

function surlignerAc() {
  document.querySelectorAll("#ac .ac-item").forEach((el, i) =>
    el.classList.toggle("actif", i === acIndex));
}

function zoneDepuisCoords(lat, lng) {
  // Corse
  if (lng > 8.5 && lat < 43.1) return "mediterraneen";
  // Méditerranéen (Provence, Côte d'Azur, Languedoc est / Roussillon)
  if ((lat < 44.2 && lng > 3.0) || (lat < 43.0 && lng > 2.0)) return "mediterraneen";
  // Océanique (façade atlantique)
  if (lng < -0.4) return "oceanique";
  // Continental (Est)
  if (lng > 4.7 && lat > 45.3) return "continental";
  return "tempere";
}

// ---------- Rendu ----------
const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

function fondCarte(plante) {
  const hue = CATEGORIES[plante.cat].hue;
  return `linear-gradient(135deg, hsl(${hue} 45% 82%), hsl(${hue} 40% 66%))`;
}

function carteHTML(plante) {
  const c = CYCLES[plante.cycle], d = DIFFICULTES[plante.diff];
  const enc = ENCOMBREMENTS[plante.encombrement], sol = SOLEILS[plante.soleil];
  const statut = state._statut ? state._statut(plante) : "later";
  const photo = estImageValide(plante.photo) ? urlExterneSure(plante.photo) : "";
  const ruban = statut === "now" ? `<span class="ruban-now">🌱 À planter</span>`
    : statut === "soon" ? `<span class="ruban-soon">⏳ Bientôt</span>` : "";
  const imgTag = photo
    ? `<img src="${echapperHTML(photo)}" alt="${echapperHTML(plante.nom)}" loading="lazy" onerror="this.remove()" />` : "";
  const spons = estSponsorise(plante) ? `<span class="spons">Partenaire ✦</span>` : "";
  const surf = state.surface
    ? `<span>🪴 ≈ ${nbPieds(plante, surfaceDediee(plante, state.surface))} pieds conseillés</span>`
    : `<span>🪴 ${plante.densite} pied${plante.densite >= 2 ? "s" : ""}/m²</span>`;

  return `
    <div class="carte-img" style="background:${fondCarte(plante)}">
      ${ruban}<span class="carte-cat">${CATEGORIES[plante.cat].label}</span>
      <span class="emoji">${echapperHTML(plante.emoji)}</span>${imgTag}
    </div>
    <div class="carte-corps">
      <div class="carte-pictos">
        <span class="picto" title="${c.desc}">${c.picto} ${c.label}</span>
        <span class="picto diff-${plante.diff}" title="${d.desc}">${d.picto} ${d.label}</span>
        <span class="picto" title="${enc.desc}">${enc.picto}</span>
        <span class="picto" title="${sol.label}">${sol.picto}</span>
      </div>
      <h3>${echapperHTML(plante.nom)}</h3>
      <p class="latin">${echapperHTML(plante.latin)}</p>
      <p class="court">${echapperHTML(plante.court)}</p>
      <div class="meta">
        <span>🌱 Semer / planter : <strong>${texteFenetre(plante, state.zone)}</strong></span>
        <span>🧺 Récolte : ${echapperHTML(plante.recolte)}</span>
        ${surf}
      </div>
      <div class="carte-foot">
        <a class="lien-achat" href="${echapperHTML(lienAchat(plante))}" target="_blank" rel="noopener"
           onclick="event.stopPropagation()">🛒 Trouver ${spons}</a>
        <button class="adopt ${estAdoptee(plante.id) ? "on" : ""}" data-adopt="${echapperHTML(plante.id)}">
          ${estAdoptee(plante.id) ? "✓ Planté" : "＋ Adopter"}</button>
      </div>
    </div>`;
}

// Ligne compacte (vue liste)
function creerLigne(plante) {
  const c = CYCLES[plante.cycle], d = DIFFICULTES[plante.diff];
  const statut = state._statut(plante);
  const semis = statut === "now"
    ? `<span class="lg-now">🌱 à planter maintenant</span>`
    : `🌱 ${texteFenetre(plante, state.zone)}`;
  const surf = state.surface
    ? `🪴 ≈ ${nbPieds(plante, surfaceDediee(plante, state.surface))} pieds`
    : `🪴 ${plante.densite}/m²`;
  const on = estAdoptee(plante.id);
  const photo = estImageValide(plante.photo) ? urlExterneSure(plante.photo) : "";

  const ligne = el("div", "ligne" + (on ? " adoptee" : ""));
  ligne.innerHTML = `
    <span class="lg-emoji" style="background:${fondCarte(plante)}">${echapperHTML(plante.emoji)}${
      photo ? `<img src="${echapperHTML(photo)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>
    <div class="lg-main">
      <div class="lg-titre">${echapperHTML(plante.nom)}
        <span class="lg-latin">${CATEGORIES[plante.cat].label}</span></div>
      <div class="lg-sub"><span>${semis}</span><span>🧺 ${echapperHTML(plante.recolte)}</span><span>${surf}</span></div>
    </div>
    <div class="lg-pictos">
      <span class="p" title="${c.label}">${c.picto}</span>
      <span class="p" title="${d.label}">${d.picto}</span>
    </div>
    <div class="lg-right">
      <button class="adopt ${on ? "on" : ""}" data-adopt="${echapperHTML(plante.id)}">${on ? "✓" : "＋"}</button>
      <span class="lg-chevron">›</span>
    </div>`;
  ligne.addEventListener("click", e => {
    if (e.target.closest("[data-adopt]")) return;
    ouvrirModale(plante);
  });
  wireAdopt(ligne, plante);
  return ligne;
}

// Surface (m²) qu'on suggère de consacrer à UNE variété : croît doucement avec
// le jardin puis plafonne, pour rester réaliste (pas 600 pieds d'ail…).
function surfaceDediee(p, surface) {
  if (!surface) return 0;
  const plafond = p.encombrement === "gourmand" ? 6
    : p.encombrement === "moyen" ? 3 : 1.5;   // m² max par variété
  const base = surface * 0.06;                 // ~6 % du jardin par variété
  return Math.max(0.5, Math.min(base, plafond));
}
function fmtSurface(m2) {
  return m2.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

function creerCarte(plante) {
  const c = el("article", "carte");
  c.innerHTML = carteHTML(plante);
  c.addEventListener("click", () => ouvrirModale(plante));
  wireAdopt(c, plante);
  return c;
}

// Attache le bouton "adopter" (coche) présent dans le noeud
function wireAdopt(node, plante) {
  const b = node.querySelector("[data-adopt]");
  if (!b) return;
  b.addEventListener("click", e => {
    e.stopPropagation();
    basculerAdoption(plante.id);
    rendre();
  });
}

function ouvrirModale(plante) {
  const c = CYCLES[plante.cycle], d = DIFFICULTES[plante.diff];
  const enc = ENCOMBREMENTS[plante.encombrement], sol = SOLEILS[plante.soleil];
  const statut = state._statut(plante);
  const photo = estImageValide(plante.photo) ? urlExterneSure(plante.photo) : "";
  const badge = statut === "now" ? `<span class="cal-badge">à planter maintenant</span>` : "";
  const imgTag = photo
    ? `<img src="${echapperHTML(photo)}" alt="${echapperHTML(plante.nom)}" onerror="this.remove()" />` : "";

  let calc;
  if (state.surface) {
    const dediee = surfaceDediee(plante, state.surface);
    calc = `<p class="calc-res">Pour ton jardin de <strong>${state.surface} m²</strong>, en lui consacrant
      ~${fmtSurface(dediee)} m² (une portion raisonnable), tu peux viser
      <strong>${nbPieds(plante, dediee)} pied(s)</strong> — densité ${plante.densite}/m².</p>`;
  } else {
    calc = `<p class="calc-res">Densité : <strong>${plante.densite}</strong> pied(s)/m².
      Renseigne la surface de ton jardin pour une estimation personnalisée.</p>`;
  }

  const modale = $("#modale");
  modale.innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="modale-img" style="background:${fondCarte(plante)}">
      <span class="emoji">${echapperHTML(plante.emoji)}</span>${imgTag}
    </div>
    <div class="modale-corps">
      <h2>${echapperHTML(plante.nom)}${plante.perso ? `<span class="tag-perso">Ajoutée par toi</span>` : ""}</h2>
      <p class="latin">${echapperHTML(plante.latin)} — ${CATEGORIES[plante.cat].label}</p>
      <div class="modale-pictos">
        <span class="picto" title="${c.desc}">${c.picto} ${c.label}</span>
        <span class="picto diff-${plante.diff}" title="${d.desc}">${d.picto} ${d.label}</span>
        <span class="picto">${enc.picto} ${enc.label}</span>
        <span class="picto">${sol.picto} ${sol.label}</span>
      </div>
      <p class="long">${echapperHTML(plante.long)}</p>

      <div class="bloc">
        <h4>📅 Calendrier (zone ${ZONES[state.zone].label})</h4>
        <p style="margin:0">Semer / planter : <span class="${statut === "now" ? "cal-now" : ""}">${texteFenetre(plante, state.zone)}</span>${badge}</p>
        <p style="margin:4px 0 0">Récolte : ${echapperHTML(plante.recolte)}</p>
      </div>

      <div class="bloc">
        <h4>🌾 Estimation pour ton jardin</h4>
        ${calc}
      </div>

      <div class="bloc">
        <h4>🧭 Fiche technique</h4>
        <div class="fiche">
          <span class="k">Cycle</span><span class="v">${c.picto} ${c.label}</span>
          <span class="k">Difficulté</span><span class="v">${d.picto} ${d.label}</span>
          <span class="k">Exposition</span><span class="v">${sol.picto} ${sol.label}</span>
          <span class="k">Encombrement</span><span class="v">${enc.picto} ${enc.label}</span>
          <span class="k">Densité</span><span class="v">${plante.densite} pied(s)/m²</span>
          <span class="k">Espacement</span><span class="v">${echapperHTML(plante.espacement)}</span>
        </div>
      </div>

      <div class="bloc">
        <h4>💡 Conseils</h4>
        <ul class="conseils">${plante.conseils.map(x => `<li>${echapperHTML(x)}</li>`).join("")}</ul>
      </div>

      <a class="lien-achat" href="${echapperHTML(lienAchat(plante))}" target="_blank" rel="noopener">
        🛒 Où trouver graines / plants ${estSponsorise(plante) ? `<span class="spons">Lien partenaire ✦</span>` : ""}</a>
      ${plante.perso ? `<button class="btn-danger" id="btn-suppr-perso" style="width:100%;margin-top:10px">🗑️ Supprimer cette plante ajoutée</button>` : ""}
    </div>`;

  modale.querySelector(".fermer").addEventListener("click", fermerModale);
  const bs = modale.querySelector("#btn-suppr-perso");
  if (bs) bs.addEventListener("click", () => {
    if (confirm(`Supprimer « ${plante.nom} » de ta base ?`)) supprimerPlante(plante.id);
  });
  $("#overlay").classList.add("ouvert");
  document.body.style.overflow = "hidden";
}

function fermerModale() {
  $("#overlay").classList.remove("ouvert");
  document.body.style.overflow = "";
}

// ---------- Formulaire d'ajout d'une plante ----------
function ouvrirFormAjout(prefill = "") {
  const opts = o => Object.entries(o)
    .map(([k, v]) => `<option value="${k}">${(v.picto ? v.picto + " " : "") + (v.label || k)}</option>`).join("");
  const moisOpts = def => MOIS.map((m, i) =>
    `<option value="${i + 1}" ${i + 1 === def ? "selected" : ""}>${m}</option>`).join("");

  $("#modale").innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="form-ajout">
      <h2>➕ Ajouter une plante</h2>
      <p class="sous">Enregistrée dans ton navigateur, elle apparaîtra comme les autres.</p>
      <div class="fgrid">
        <div class="fchamp full">
          <label>Nom *</label>
          <div class="f-auto-row">
            <input id="f-nom" value="${echapperHTML(prefill)}" placeholder="Ex. Topinambour" />
            <button type="button" class="btn secondaire" id="f-auto">✨ Auto-remplir</button>
          </div>
          <span id="f-auto-statut" style="font-size:12px;color:var(--texte-doux)"></span>
        </div>
        <div class="fchamp"><label>Nom latin</label><input id="f-latin" placeholder="Facultatif" /></div>
        <div class="fchamp"><label>Catégorie</label><select id="f-cat">${opts(CATEGORIES)}</select></div>
        <div class="fchamp"><label>Emoji</label><input id="f-emoji" maxlength="4" placeholder="🌱" /></div>
        <div class="fchamp"><label>Photo (URL)</label><input id="f-photo" placeholder="https://… (facultatif)" /></div>
        <div class="fchamp"><label>Cycle</label><select id="f-cycle">${opts(CYCLES)}</select></div>
        <div class="fchamp"><label>Difficulté</label><select id="f-diff">${opts(DIFFICULTES)}</select></div>
        <div class="fchamp"><label>Encombrement</label><select id="f-enc">${opts(ENCOMBREMENTS)}</select></div>
        <div class="fchamp"><label>Exposition</label><select id="f-soleil">${opts(SOLEILS)}</select></div>
        <div class="fchamp"><label>Densité (pieds/m²)</label><input id="f-densite" type="number" min="0" step="0.5" value="9" /></div>
        <div class="fchamp"><label>Espacement</label><input id="f-espacement" placeholder="Ex. 30 cm" /></div>
        <div class="fchamp"><label>Semer/planter — début</label><select id="f-semis-deb">${moisOpts(3)}</select></div>
        <div class="fchamp"><label>Semer/planter — fin</label><select id="f-semis-fin">${moisOpts(6)}</select></div>
        <div class="fchamp full"><label>Période de récolte</label><input id="f-recolte" placeholder="Ex. Juillet → octobre" /></div>
        <div class="fchamp full"><label>Description courte</label><input id="f-court" placeholder="Une phrase d'accroche" /></div>
        <div class="fchamp full"><label>Description longue</label><textarea id="f-long" placeholder="Facultatif"></textarea></div>
        <div class="fchamp full"><label>Conseils (un par ligne)</label><textarea id="f-conseils" placeholder="Un conseil par ligne"></textarea></div>
        <div class="fchamp full"><label>Lien d'achat (affilié possible)</label><input id="f-lien" placeholder="https://… (facultatif)" /></div>
        <div class="fchamp inline full"><input id="f-frileux" type="checkbox" /><label for="f-frileux">Frileuse (sensible au gel — exclue en montagne)</label></div>
        <div class="fchamp inline full"><input id="f-sponsorise" type="checkbox" /><label for="f-sponsorise">Lien sponsorisé (badge « Partenaire »)</label></div>
      </div>
      <div class="form-erreur" id="f-erreur" role="alert" hidden></div>
      <div class="form-actions">
        <button class="btn secondaire" id="f-annuler">Annuler</button>
        <button class="btn" id="f-enregistrer">Enregistrer la plante</button>
      </div>
    </div>`;

  $("#modale").querySelector(".fermer").addEventListener("click", fermerModale);
  $("#f-annuler").addEventListener("click", fermerModale);
  $("#f-enregistrer").addEventListener("click", enregistrerPlante);
  $("#f-auto").addEventListener("click", autoRemplirFiche);
  const lien = $("#f-lien"), sponsorise = $("#f-sponsorise");
  const majOptionSponsor = () => {
    const disponible = Boolean(urlExterneSure(lien.value.trim()));
    sponsorise.disabled = !disponible;
    if (!disponible) sponsorise.checked = false;
  };
  lien.addEventListener("input", majOptionSponsor);
  majOptionSponsor();
  g_photo_reset();
  function g_photo_reset() {
    const el = $("#f-photo");
    if (el) el.addEventListener("input", () => { el.style.borderColor = ""; el.title = ""; });
  }
  $("#overlay").classList.add("ouvert");
  document.body.style.overflow = "hidden";
  $("#f-nom").focus();
}

// Auto-remplissage de la fiche depuis Wikipédia (nom → résumé + photo + nom latin).
// Borné, mis en cache et non bloquant : échec avec message clair dans le formulaire.
async function fetchWikipedia(titre) {
  const url = `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titre.replace(/ /g, "_"))}?redirect=true`;
  const reponse = await requeteJSON(url, {
    headers: { Accept: "application/json" },
    cacheMs: 60 * 60 * 1000,
  });
  if (reponse.status === 404) return { notFound: true };
  return reponse.ok ? reponse.data : null;
}

// Nom latin FIABLE via Wikidata (P225 = "taxon name"), plutôt qu'un regex sur du texte
// libre (qui peut accrocher une espèce mentionnée en passant, ex. "même genre que Y").
// 1) page Wikipédia → item Wikidata (Qxxxx)  2) item → réclamation P225.
// Borné : timeout 5 s par appel, échec = chaîne vide (pas de fausse donnée affichée).
async function fetchJSON(url, timeoutMs = 5000) {
  const reponse = await requeteJSON(url, {
    timeoutMs,
    cacheMs: 60 * 60 * 1000,
  });
  return reponse.ok ? reponse.data : null;
}
async function nomLatinWikidata(titrePage) {
  const qUrl = `https://fr.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item`
    + `&titles=${encodeURIComponent(titrePage)}&format=json&origin=*`;
  const qData = await fetchJSON(qUrl);
  const pages = qData && qData.query && qData.query.pages;
  const page = pages && Object.values(pages)[0];
  const qid = page && page.pageprops && page.pageprops.wikibase_item;
  if (!qid) return "";

  const cUrl = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${qid}`
    + `&property=P225&format=json&origin=*`;
  const cData = await fetchJSON(cUrl);
  const claim = cData && cData.claims && cData.claims.P225 && cData.claims.P225[0];
  const val = claim && claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value;
  return typeof val === "string" ? val : "";
}

async function autoRemplirFiche() {
  const nom = $("#f-nom").value.trim();
  const statut = $("#f-auto-statut");
  if (!nom) { $("#f-nom").focus(); return; }
  statut.textContent = "Recherche sur Wikipédia…";
  const data = await fetchWikipedia(nom);
  if (!data || data.notFound) {
    statut.textContent = data && data.notFound
      ? "Aucune page Wikipédia trouvée pour ce nom — remplis à la main."
      : "Wikipédia injoignable pour le moment — remplis à la main.";
    return;
  }
  if (data.type === "disambiguation") {
    statut.textContent = `« ${nom} » désigne plusieurs choses sur Wikipédia (homonymie) — `
      + `précise (ex. « ${nom} commun », « ${nom} (plante) ») puis relance Auto-remplir.`;
    return;
  }
  const extrait = data.extract || "";
  const g = id => $("#f-" + id);
  if (data.thumbnail && data.thumbnail.source && estImageValide(data.thumbnail.source)) {
    g("photo").value = data.thumbnail.source; g("photo").style.borderColor = "";
  }
  if (!g("court").value.trim()) g("court").value = (extrait.split(/(?<=[.!?])\s/)[0] || "").slice(0, 140);
  if (!g("long").value.trim()) g("long").value = extrait;

  const titrePage = (data.titles && data.titles.canonical) || nom;
  const latin = await nomLatinWikidata(titrePage);
  if (latin && !g("latin").value.trim()) g("latin").value = latin;

  statut.textContent = latin
    ? "✓ Rempli depuis Wikipédia + Wikidata — relis avant d'enregistrer."
    : "✓ Rempli depuis Wikipédia (nom latin non trouvé sur Wikidata) — relis avant d'enregistrer.";
}

// Rejette les fichiers non-image (ex. .ogg/.ogv audio de prononciation Wikipédia,
// .svg de partition, .webm/.mp4 vidéo) qui pourraient se glisser dans une URL "photo".
const EXT_IMAGE_OK = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;
function estImageValide(url) {
  if (!url) return true; // champ vide = pas de photo, c'est valide (fallback emoji)
  try {
    const sure = urlExterneSure(url);
    return Boolean(sure) && EXT_IMAGE_OK.test(new URL(sure).pathname);
  }
  catch (e) { return false; }
}

function afficherErreurForm(message, champ) {
  const erreur = $("#f-erreur");
  erreur.textContent = message;
  erreur.hidden = false;
  if (champ) {
    champ.setAttribute("aria-invalid", "true");
    champ.focus();
  }
}

function enregistrerPlante() {
  const g = id => $("#f-" + id);
  const nom = g("nom").value.trim();
  $("#f-erreur").hidden = true;
  $("#modale").querySelectorAll("[aria-invalid=true]")
    .forEach(champ => champ.removeAttribute("aria-invalid"));
  if (!nom) {
    afficherErreurForm("Le nom de la plante est obligatoire.", g("nom"));
    return;
  }
  const photoUrl = g("photo").value.trim();
  if (!estImageValide(photoUrl)) {
    g("photo").title = "URL non reconnue comme image (jpg/png/webp/gif attendu — pas de .ogg/.svg/vidéo)";
    afficherErreurForm(
      "La photo doit utiliser une URL HTTP(S) vers une image JPG, PNG, WebP, GIF ou AVIF.",
      g("photo"));
    return;
  }
  let deb = +g("semis-deb").value, fin = +g("semis-fin").value;
  const candidate = {
    id: slug(nom) + "-" + Date.now().toString(36),
    perso: true,
    nom, latin: g("latin").value.trim() || "—", cat: g("cat").value,
    emoji: g("emoji").value.trim() || "🌱",
    photo: photoUrl || undefined,
    cycle: g("cycle").value, diff: +g("diff").value,
    encombrement: g("enc").value, soleil: g("soleil").value,
    densite: +g("densite").value || 1, espacement: g("espacement").value.trim() || "—",
    frileux: g("frileux").checked,
    semis: [[deb, fin]], recolte: g("recolte").value.trim() || "—",
    court: g("court").value.trim() || "Plante ajoutée par toi.",
    long: g("long").value.trim() || g("court").value.trim() || "Plante ajoutée par toi.",
    conseils: g("conseils").value.split("\n").map(s => s.trim()).filter(Boolean),
    lien: g("lien").value.trim() || "", sponsorise: g("sponsorise").checked,
  };
  const resultat = validerPlantePerso(candidate);
  if (!resultat.valide) {
    afficherErreurForm(`Impossible d'enregistrer : ${resultat.erreurs.join(" ")}`);
    return;
  }
  const p = resultat.plante;
  PLANTES.push(p);
  sauverPlantesPerso();
  fermerModale();
  state.recherche = ""; $("#recherche").value = "";
  rendre();
  ouvrirModale(p);
}

// ---------- Filtres ----------
const FILTRES_CAT = [
  { k: "tous", label: "Tout" },
  { k: "legume", label: "🥕 Légumes" },
  { k: "fruit", label: "🍓 Fruits" },
  { k: "aromatique", label: "🌿 Aromatiques" },
  { k: "exotique", label: "🥭 Exotiques" },
];
const FILTRES_CYCLE = [
  { k: "annuelle", label: "🌱 Annuelles" },
  { k: "bisannuelle", label: "🔄 Bisannuelles" },
  { k: "vivace", label: "♻️ Vivaces" },
];

function construireFiltres() {
  const nav = $("#filtres");
  nav.innerHTML = "";
  FILTRES_CAT.forEach(f => {
    const chip = el("button", "chip" + (state.categorie === f.k ? " actif" : ""), f.label);
    chip.addEventListener("click", () => { state.categorie = f.k; rendre(); });
    nav.appendChild(chip);
  });
  const sep1 = el("span", null, "&nbsp;");
  nav.appendChild(sep1);
  FILTRES_CYCLE.forEach(f => {
    const actif = state.cycle === f.k;
    const chip = el("button", "chip" + (actif ? " actif" : ""), f.label);
    chip.addEventListener("click", () => { state.cycle = actif ? "tous" : f.k; rendre(); });
    nav.appendChild(chip);
  });
  const chipPe = el("button", "chip" + (state.petitsEspaces ? " actif" : ""), "📦 Petits espaces");
  chipPe.addEventListener("click", () => { state.petitsEspaces = !state.petitsEspaces; rendre(); });
  nav.appendChild(chipPe);

  nav.appendChild(el("span", "sep"));
  nav.appendChild(el("span", "compteur", `<span id="total-count"></span>`));
}

function planteVisible(p) {
  if (state.filtrePotager && !estAdoptee(p.id)) return false;
  if (!adapteeZone(p, state.zone)) return false;
  if (state.categorie !== "tous" && p.cat !== state.categorie) return false;
  if (state.cycle !== "tous" && p.cycle !== state.cycle) return false;
  if (state.petitsEspaces && p.encombrement === "gourmand") return false;
  if (state.recherche) {
    const q = normaliseVille(state.recherche);
    const cible = normaliseVille(p.nom + " " + p.latin);
    if (!cible.includes(q)) return false;
  }
  return true;
}

// ---------- Rendu principal ----------
function dateDuJour() {
  // Date réelle de l'appareil (aucune saisie requise)
  return new Date();
}

function rendre() {
  const aujourdhui = dateDuJour();
  const moisCourant = aujourdhui.getMonth() + 1;
  state._statut = p => statutPlantation(p, state.zone, moisCourant);

  // Bandeau date visible
  const dj = $("#date-jour");
  if (dj) {
    const fmt = aujourdhui.toLocaleDateString("fr-FR",
      { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    dj.textContent = `📅 Aujourd'hui : ${fmt}`;
  }
  const sousNow = document.querySelector("#section-now .section-sous");
  if (sousNow) {
    const fmtCourt = aujourdhui.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    sousNow.textContent = `Nous sommes le ${fmtCourt} : c'est le bon moment pour semer ou planter ces variétés dans ta zone.`;
  }

  construireFiltres();

  const visibles = PLANTES.filter(planteVisible);
  const now = [], soon = [], autres = [];
  visibles.forEach(p => {
    const s = state._statut(p);
    if (s === "now") now.push(p);
    else if (s === "soon") soon.push(p);
    else autres.push(p);
  });
  const parNom = (a, b) => a.nom.localeCompare(b.nom, "fr");
  now.sort(parNom); soon.sort(parNom); autres.sort(parNom);

  state._nowCount = now.length;
  remplirGrille("#grille-now", now, "#section-now", "#now-count");
  remplirGrille("#grille-soon", soon, "#section-soon", "#soon-count");
  remplirGrille("#grille-autres", autres, null, null);

  const vide = $("#vide");
  vide.hidden = visibles.length !== 0;
  if (!vide.hidden) {
    vide.innerHTML = state.recherche
      ? `Aucune plante ne correspond à « ${echapperHTML(state.recherche)} ».<br>
         <button class="btn" id="btn-ajouter-vide" style="margin-top:10px">
           ➕ Ajouter « ${echapperHTML(state.recherche)} » à la base</button>`
      : "Aucune variété ne correspond à ces filtres.";
    const b = $("#btn-ajouter-vide");
    if (b) b.addEventListener("click", () => ouvrirFormAjout(state.recherche));
  }
  const tc = document.querySelector("#total-count");
  if (tc) tc.textContent = `${visibles.length} variété${visibles.length > 1 ? "s" : ""} adaptée${visibles.length > 1 ? "s" : ""}`;

  const sousAutres = $("#autres-sous");
  if (sousAutres) sousAutres.textContent = state.surface
    ? `Estimations calculées pour un jardin de ${state.surface} m².`
    : "Toutes les cultures qui s'accommodent de ton climat.";

  majMonPotager();
  if (document.body.classList.contains("configure")) majResume();
}

// ---------- Repli du bandeau ----------
function majResume() {
  const z = ZONES[state.zone];
  const fmt = dateDuJour().toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const items = [`<span class="bc-item">${z.emoji} ${z.label}</span>`];
  if (state.surface) items.push(`<span class="bc-item">📐 ${state.surface} m²</span>`);
  items.push(`<span class="bc-item">📅 ${fmt}</span>`);
  items.push(`<span class="bc-item">🌱 ${state._nowCount || 0} à planter</span>`);
  const r = $("#bc-resume"); if (r) r.innerHTML = items.join("");
}
function replier() {
  document.body.classList.add("configure");
  $("#barre-compacte").hidden = false;
  majResume();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function deplier() {
  document.body.classList.remove("configure");
  $("#barre-compacte").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
async function commit() {
  const q = $("#ville").value.trim();
  if (q) {
    if (state.villeCoords) {
      const z = zoneDepuisVille(q) || zoneDepuisCoords(state.villeCoords.lat, state.villeCoords.lng);
      majZone(z, `📍 ${q}`);
    } else {
      // Pas de sélection dans la liste : on géocode le texte saisi.
      const res = await geocodeVille(q);
      if (res.length) choisirVille(res[0]);
      else majZone(state.zone, `« ${q} » introuvable — ajuste le climat`);
    }
  }
  replier();
}

function setVue(v) {
  state.vue = v;
  $("#vue-liste").classList.toggle("actif", v === "liste");
  $("#vue-cartes").classList.toggle("actif", v === "cartes");
  rendre();
}

function remplirGrille(sel, liste, sectionSel, countSel) {
  const g = $(sel); g.innerHTML = "";
  g.className = state.vue === "liste" ? "liste" : "grille";
  const build = state.vue === "liste" ? creerLigne : creerCarte;
  liste.forEach(p => g.appendChild(build(p)));
  if (sectionSel) $(sectionSel).hidden = liste.length === 0;
  if (countSel) $(countSel).textContent = liste.length;
}

// ---------- Zone : maj UI ----------
function majZone(zone, source) {
  state.zone = zone;
  const z = ZONES[zone];
  $("#zone").value = zone;
  $("#badge-zone").innerHTML = `${z.emoji} ${z.label}`;
  $("#zone-note").textContent = (source ? source + " · " : "") + z.note;
  rendre();
}

// ---------- Init ----------
function init() {
  // Peupler le select des zones
  const sel = $("#zone");
  Object.entries(ZONES).forEach(([k, z]) => {
    const o = el("option"); o.value = k; o.textContent = `${z.emoji} ${z.label}`;
    sel.appendChild(o);
  });
  sel.value = state.zone;

  sel.addEventListener("change", () => majZone(sel.value, "Choix manuel"));

  // Autocomplétion de ville (BAN)
  const inputVille = $("#ville");
  inputVille.addEventListener("input", onVilleInput);
  inputVille.addEventListener("keydown", e => {
    const ac = $("#ac");
    const ouvert = ac && !ac.hidden && acItems.length;
    if (e.key === "ArrowDown" && ouvert) {
      e.preventDefault(); acIndex = Math.min(acIndex + 1, acItems.length - 1); surlignerAc();
    } else if (e.key === "ArrowUp" && ouvert) {
      e.preventDefault(); acIndex = Math.max(acIndex - 1, 0); surlignerAc();
    } else if (e.key === "Enter") {
      if (ouvert && acIndex >= 0) { e.preventDefault(); choisirVille(acItems[acIndex]); }
      else commit();
    } else if (e.key === "Escape") { hideAc(); }
  });
  inputVille.addEventListener("blur", () => setTimeout(hideAc, 150));
  $("#ac").addEventListener("mousedown", e => {
    const b = e.target.closest(".ac-item");
    if (b) { e.preventDefault(); choisirVille(acItems[+b.dataset.i]); }
  });
  $("#btn-go").addEventListener("click", commit);
  $("#btn-modifier").addEventListener("click", deplier);
  $("#surface").addEventListener("input", e => {
    const v = parseInt(e.target.value, 10);
    state.surface = (v && v > 0) ? v : null;
    rendre();
  });
  $("#btn-geo").addEventListener("click", localiser);

  // Recherche
  $("#recherche").addEventListener("input", e => {
    state.recherche = e.target.value;
    rendre();
  });

  // Bascule de vue Liste / Cartes
  $("#vue-liste").addEventListener("click", () => setVue("liste"));
  $("#vue-cartes").addEventListener("click", () => setVue("cartes"));

  // Mon potager (filtre)
  $("#mon-potager").addEventListener("click", () => {
    state.filtrePotager = !state.filtrePotager;
    rendre();
  });

  chargerAdoptees();
  chargerPlantesPerso();
  $("#btn-ajouter").addEventListener("click", () => ouvrirFormAjout(""));

  $("#overlay").addEventListener("click", e => { if (e.target.id === "overlay") fermerModale(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") fermerModale(); });

  majZone(state.zone, null);
}

function appliquerVille() {
  const v = $("#ville").value;
  if (!v.trim()) return;
  const z = zoneDepuisVille(v);
  if (z) majZone(z, `📍 ${v.trim()}`);
  else majZone(state.zone, `“${v.trim()}” non reconnue — ajuste le climat`);
}

function localiser() {
  const note = $("#zone-note");
  if (!navigator.geolocation) { note.textContent = "Géolocalisation non disponible sur ce navigateur."; return; }
  note.textContent = "Localisation en cours…";
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude, longitude } = pos.coords;
      let z = zoneDepuisCoords(latitude, longitude);
      majZone(z, "📡 Position détectée (estimation)");
      note.textContent = "Recherche de ta ville…";
      const v = await reverseVille(latitude, longitude);
      if (v) {
        $("#ville").value = v.nom;                 // on remplit la préférence "ville"
        state.villeCoords = { lat: v.lat, lng: v.lng };
        z = zoneDepuisVille(v.nom) || z;           // affine si commune connue du dico
        majZone(z, `📡 ${v.nom}${v.cp ? " (" + v.cp + ")" : ""}`);
      }
      replier();
    },
    () => { note.textContent = "Localisation refusée. Saisis ta ville ou choisis le climat."; },
    { timeout: 8000, maximumAge: 600000 }
  );
}

document.addEventListener("DOMContentLoaded", init);
