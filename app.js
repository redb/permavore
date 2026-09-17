/* =========================================================================
   Permavore — logique applicative
   Internationalisation : `t(cle, vars)`, `bi()`, `txt()` et `LANG` sont
   définis dans i18n.js (chargé avant ce fichier). Les champs éditoriaux de
   data.js (nom de plante, libellés, etc.) sont des objets bilingues qui se
   comportent comme des chaînes dès qu'on les affiche (voir data.js).
   ========================================================================= */

function MOIS_ACTIFS() { return getLang() === "en" ? MOIS_EN : MOIS_FR; }
const moisNom = m => MOIS_ACTIFS()[((m - 1) % 12 + 12) % 12];

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
  ressources: new Set(),     // ce que le jardinier possède (persisté)
  dates: {},                 // id -> "AAAA-MM-JJ" date de semis/plantation (persisté)
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

// ---------- Mes ressources (ce que le jardinier possède) ----------
const LS_RESSOURCES = "permavore.ressources";
function chargerRessources() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_RESSOURCES) || "[]");
    state.ressources = new Set(arr.filter(k => RESSOURCES_CATALOGUE[k]));
  } catch (e) { state.ressources = new Set(); }
}
function sauverRessources() {
  try { localStorage.setItem(LS_RESSOURCES, JSON.stringify([...state.ressources])); }
  catch (e) { /* ignore */ }
}
// Quand cette ressource resservira-t-elle ? (« maintenant » ou prochain mois utile)
function prochaineUtilisation(r) {
  const mois = dateDuJour().getMonth() + 1;
  if (r.mois.includes(mois)) return { maintenant: true, texte: t("ressources.maintenant") };
  for (let i = 1; i <= 12; i++) {
    const m = ((mois - 1 + i) % 12) + 1;
    if (r.mois.includes(m)) {
      return { maintenant: false,
        texte: i === 1 ? t("ressources.desmois", { mois: moisNom(m) }) : t("ressources.apartirde", { mois: moisNom(m) }) };
    }
  }
  return { maintenant: false, texte: "—" };
}

function basculerRessource(cle) {
  if (state.ressources.has(cle)) state.ressources.delete(cle);
  else state.ressources.add(cle);
  sauverRessources();
}

// Suggestions proactives : quelle ressource utiliser, maintenant, et sur quoi.
function suggestionsRessources() {
  const mois = dateDuJour().getMonth() + 1;
  const out = [];
  state.ressources.forEach(cle => {
    const r = RESSOURCES_CATALOGUE[cle];
    if (!r || !r.mois.includes(mois)) return;
    // Sur quelles plantes adoptées (ou à planter ce mois-ci) ça s'applique
    const concernees = PLANTES.filter(p => {
      let ok = false;
      try { ok = r.cible(p); } catch (e) { ok = false; }
      if (!ok) return false;
      if (estAdoptee(p.id)) return true;
      return r.auSemis && state._statut && state._statut(p) === "now";
    }).slice(0, 4);
    out.push({ cle, ...r, concernees });
  });
  return out;
}

// ---------- Dates de semis/plantation (persisté) ----------
const LS_DATES = "permavore.dates.v1";
const RE_DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
function chargerDates() {
  try {
    const brut = JSON.parse(localStorage.getItem(LS_DATES) || "{}");
    if (!brut || typeof brut !== "object" || Array.isArray(brut)) return;
    Object.entries(brut).forEach(([id, d]) => {
      if (typeof d === "string" && RE_DATE_ISO.test(d)) state.dates[id] = d;
    });
  } catch (e) { /* stockage indispo : on ignore */ }
}
function sauverDates() {
  try { localStorage.setItem(LS_DATES, JSON.stringify(state.dates)); }
  catch (e) { /* ignore */ }
}
function dateISOAujourdhui() {
  const d = dateDuJour();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dateDepuisISO(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(a, m - 1, j);
}
function localeCourante() { return getLang() === "en" ? "en-US" : "fr-FR"; }
function fmtDateCourte(date) {
  const options = { day: "numeric", month: "long" };
  if (date.getFullYear() !== dateDuJour().getFullYear()) options.year = "numeric";
  return date.toLocaleDateString(localeCourante(), options);
}

// ---------- Étapes de culture (prévision proactive) ----------
// À partir de la date de semis/plantation, on estime : levée/reprise,
// entretien (éclaircir, pailler) et début de récolte.
// Récolte : « N à M semaines » dans la fiche → délai en jours ;
// sinon un nom de mois (« Juillet → octobre ») → prochaine occurrence de ce mois.
// Remarque : la reconnaissance du texte de récolte se fait toujours sur le
// texte FRANÇAIS de référence (`plante.recolte.fr` si bilingue), car c'est le
// format structuré ("N semaines", noms de mois) qui sert de source de vérité
// au moteur de calcul — la traduction anglaise n'est utilisée qu'à l'affichage.
function texteRecolteRef(plante) {
  const r = plante.recolte;
  return typeof r === "object" && r && "fr" in r ? r.fr : String(r || "");
}
function delaiRecolteJours(plante) {
  const texte = normaliseVille(texteRecolteRef(plante));
  const m = texte.match(/(\d+)\s*(?:a\s*(\d+)\s*)?semaines/);
  if (m) {
    const s1 = Number(m[1]), s2 = m[2] ? Number(m[2]) : s1;
    return Math.round(((s1 + s2) / 2) * 7);
  }
  return null;
}
function moisRecolte(plante) {
  const texte = normaliseVille(texteRecolteRef(plante));
  const index = MOIS_FR.findIndex(mois => texte.startsWith(normaliseVille(mois)));
  return index >= 0 ? index + 1 : null;
}
// Mois de FIN de récolte (« Juillet → octobre » → 10), sinon null.
function moisFinRecolte(plante) {
  const texte = normaliseVille(texteRecolteRef(plante));
  const morceaux = texte.split(/→|->|a fin|jusqu'a/);
  if (morceaux.length < 2) return null;
  const fin = morceaux[morceaux.length - 1].trim();
  const index = MOIS_FR.findIndex(mois => fin.startsWith(normaliseVille(mois)));
  return index >= 0 ? index + 1 : null;
}
const CLE_MODE = ["semis", "plant", "tubercule", "caieu", "rhizome"];
function libelleMode(mode) {
  return t("mode." + (CLE_MODE.includes(mode) ? mode : "semis"));
}

function etapesCulture(plante, iso) {
  const debut = dateDepuisISO(iso);
  const plus = jours => {
    const d = new Date(debut);
    d.setDate(d.getDate() + jours);
    return d;
  };
  const mode = CLE_MODE.includes(plante.mode) ? plante.mode : "semis";
  const etapes = [
    { cle: "semis", emoji: "🌱", label: libelleMode(mode), date: debut },
  ];

  // Levée : uniquement pour les plantes réellement semées, et uniquement si la
  // durée est renseignée dans la base. Pas de délai générique inventé : un radis
  // lève en 3 à 5 jours, un persil en 15 à 30 — la moyenne n'aurait aucun sens.
  if (mode === "semis" && Array.isArray(plante.levee) && plante.levee.length === 2) {
    const [min, max] = plante.levee;
    etapes.push({
      cle: "levee", emoji: "🌿",
      label: min === max ? t("etape.leveeattendue", { n: min })
        : t("etape.leveeattendue.range", { min, max }),
      date: plus(min), dateFin: plus(max),
    });
    // Éclaircissage : seulement pour les plantes qui se démarient réellement.
    // Les légumineuses (haricot, pois, fève) se sèment à l'écartement définitif.
    if (plante.eclaircir === true) {
      etapes.push({ cle: "eclaircir", emoji: "🧑‍🌾",
        label: t("etape.eclaircir", { espacement: txt(plante.espacement) }), date: plus(max + 10) });
    }
  }

  const delai = delaiRecolteJours(plante);
  if (delai) {
    etapes.push({ cle: "recolte", emoji: "🧺", label: t("etape.debutrecolte"), date: plus(delai) });
  } else {
    const mois = moisRecolte(plante);
    if (mois) {
      const fin = moisFinRecolte(plante) || mois;
      const moisMiseEnPlace = debut.getMonth() + 1;
      if (moisDansFenetre(moisMiseEnPlace, { debut: mois, fin })) {
        // Mise en place alors que la fenêtre de récolte est déjà ouverte : le
        // calendrier de référence suppose une plantation en saison, il ne dit
        // plus rien d'utile ici. On l'annonce plutôt que d'inventer une date.
        etapes.push({
          cle: "recolte", emoji: "🧺", sansDate: true,
          label: t("etape.horscalendrier", { debut: moisNom(mois), fin: moisNom(fin) }),
          date: debut,
        });
      } else {
        // Sinon : prochaine ouverture de la fenêtre.
        const annee = moisMiseEnPlace <= mois ? debut.getFullYear() : debut.getFullYear() + 1;
        etapes.push({ cle: "recolte", emoji: "🧺",
          label: t("etape.debutrecolte"), date: new Date(annee, mois - 1, 1) });
      }
    }
  }
  return etapes;
}
// Liste des étapes à venir (ou récentes) pour toutes les plantes datées.
function prochainesEtapes(horizonJours = 90) {
  const aujourdhui = dateDuJour();
  aujourdhui.setHours(0, 0, 0, 0);
  const limite = new Date(aujourdhui);
  limite.setDate(limite.getDate() + horizonJours);
  const liste = [];
  Object.entries(state.dates).forEach(([id, iso]) => {
    if (!estAdoptee(id)) return;
    const plante = PLANTES.find(p => p.id === id);
    if (!plante) return;
    etapesCulture(plante, iso).forEach(etape => {
      if (etape.cle === "semis") return; // déjà fait, c'est la date saisie
      if (etape.sansDate) return;        // information, pas une échéance
      if (etape.date >= aujourdhui && etape.date <= limite) {
        liste.push({ plante, ...etape });
      } else if (etape.cle === "recolte" && etape.date < aujourdhui) {
        // Récolte commencée : encore en cours si le mois de fin n'est pas passé.
        const fin = moisFinRecolte(plante);
        if (fin) {
          const anneeFin = fin >= etape.date.getMonth() + 1
            ? etape.date.getFullYear() : etape.date.getFullYear() + 1; // fenêtre à cheval sur l'année
          const finRecolte = new Date(anneeFin, fin, 0); // dernier jour du mois de fin
          if (finRecolte >= aujourdhui) {
            liste.push({ plante, cle: "recolte", emoji: "🧺",
              label: t("etape.recoltecours", { mois: moisNom(fin) }), date: aujourdhui });
          }
        }
      }
    });
  });
  liste.sort((a, b) => a.date - b.date);
  return liste;
}
// Accesseurs exposés au module réseau (network.js) : les `const` d'un script
// classique ne sont pas sur window, contrairement aux déclarations de fonction.
function dateSemisPlante(id) {
  return state.dates[id] || "";
}
function zoneCourante() {
  return state.zone;
}

// Prévision « porte-graines » : QUAND les graines seront récoltables, ce qui est
// une date distincte de la récolte alimentaire. Règle botanique de base :
//   annuelle    → porte-graines laissé mûrir jusqu'au bout de la fenêtre de récolte ;
//   bisannuelle → pas de graines la 1ʳᵉ année, montée en graines l'été suivant ;
//   vivace      → hors de ce modèle simple.
// Volontairement indicatif : le calendrier fin dépend de la variété et du
// protocole, qui font foi (cf. Réseau Semences Paysannes).
function previsionSemences(plante, iso) {
  if (!iso || !RE_DATE_ISO.test(iso)) return null;
  const debut = dateDepuisISO(iso);
  if (plante.cycle === "vivace") return null;

  if (plante.cycle === "bisannuelle") {
    const annee = debut.getFullYear() + 1;
    return {
      date: new Date(annee, 5, 1),                 // juin de l'année suivante
      label: t("semences.bisannuelle", { annee }),
      note: t("semences.bisannuelle.note"),
    };
  }
  const fin = moisFinRecolte(plante) || moisRecolte(plante);
  if (!fin) return null;
  const annee = fin >= debut.getMonth() + 1 ? debut.getFullYear() : debut.getFullYear() + 1;
  return {
    date: new Date(annee, fin - 1, 15),
    label: t("semences.graines", { mois: moisNom(fin), annee }),
    note: t("semences.note"),
  };
}

function definirDate(id, iso) {
  if (iso && RE_DATE_ISO.test(iso)) state.dates[id] = iso;
  else delete state.dates[id];
  sauverDates();
}

// ---------- Préférences du jardin (stockage local, sans coordonnées) ----------
const LS_JARDIN = "permavore.jardin.v1";
function chargerPreferencesJardin() {
  try {
    const brut = JSON.parse(localStorage.getItem(LS_JARDIN) || "null");
    if (!brut || typeof brut !== "object" || Array.isArray(brut)) return;

    const ville = typeof brut.ville === "string" ? brut.ville.trim().slice(0, 120) : "";
    const surface = Number(brut.surface);
    const zone = typeof brut.zone === "string" && Object.hasOwn(ZONES, brut.zone)
      ? brut.zone : "tempere";
    const vue = brut.vue === "cartes" ? "cartes" : "liste";

    state.surface = Number.isInteger(surface) && surface >= 1 && surface <= 10000
      ? surface : null;
    state.zone = zone;
    state.vue = vue;
    if (typeof brut.categorie === "string"
      && FILTRES_CAT.some(f => f.k === brut.categorie)) state.categorie = brut.categorie;
    if (typeof brut.cycle === "string"
      && (brut.cycle === "tous" || FILTRES_CYCLE.some(f => f.k === brut.cycle))) state.cycle = brut.cycle;
    state.petitsEspaces = brut.petitsEspaces === true;
    state._prefsConnues = Boolean(ville || state.surface);
    $("#ville").value = ville;
    $("#surface").value = state.surface || "";
  } catch (erreur) {
    journaliserAvertissement("preferences_jardin_illisibles", { message: erreur.message });
  }
}
function sauverPreferencesJardin() {
  try {
    localStorage.setItem(LS_JARDIN, JSON.stringify({
      ville: $("#ville")?.value.trim().slice(0, 120) || "",
      surface: state.surface,
      zone: state.zone,
      vue: state.vue,
      categorie: state.categorie,
      cycle: state.cycle,
      petitsEspaces: state.petitsEspaces,
    }));
  } catch (erreur) {
    journaliserAvertissement("preferences_jardin_echec", { message: erreur.message });
  }
}

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
  definirDate(id, null);
  sauverPlantesPerso();
  fermerModale(); rendre();
}
function basculerAdoption(id) {
  if (state.adoptees.has(id)) {
    state.adoptees.delete(id);
    definirDate(id, null);                    // on oublie la date associée
  } else {
    state.adoptees.add(id);
    if (!state.dates[id]) definirDate(id, dateISOAujourdhui()); // date du jour par défaut, modifiable dans la fiche
  }
  sauverAdoptees();
  majMonPotager();
}
function majMonPotager() {
  const b = $("#mon-potager");
  if (!b) return;
  const n = state.adoptees.size;
  b.hidden = n === 0 && !state.filtrePotager;
  b.textContent = t("mon.potager", { n });
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
    return { valide: false, erreurs: [t("valid.pasunobjet")] };
  }

  const texte = (champ, fallback, max, requis = false) => {
    if (typeof brut[champ] !== "string") {
      if (requis) erreurs.push(t("valid.doittexte", { champ }));
      return fallback;
    }
    const valeur = brut[champ].trim();
    if (requis && !valeur) erreurs.push(t("valid.requis", { champ }));
    if (valeur.length > max) erreurs.push(t("valid.tropong", { champ, max }));
    return valeur || fallback;
  };
  const choix = (champ, valeurs) => {
    const valeur = brut[champ];
    if (!Object.hasOwn(valeurs, valeur)) erreurs.push(t("valid.invalide", { champ }));
    return valeur;
  };

  const id = texte("id", "", 120, true);
  if (id && !/^[a-z0-9-]+$/.test(id)) erreurs.push(t("valid.idinvalide"));
  const nom = texte("nom", "", 80, true);
  const latin = texte("latin", "—", 120);
  const emoji = texte("emoji", "🌱", 16);
  const espacement = texte("espacement", "—", 80);
  const recolte = texte("recolte", "—", 160);
  const court = texte("court", t("plante.ajouteeparToi"), 300);
  const long = texte("long", court, 3000);
  const cat = choix("cat", CATEGORIES);
  const cycle = choix("cycle", CYCLES);
  const encombrement = choix("encombrement", ENCOMBREMENTS);
  const soleil = choix("soleil", SOLEILS);

  const diff = Number(brut.diff);
  if (!Number.isInteger(diff) || !Object.hasOwn(DIFFICULTES, diff)) {
    erreurs.push(t("valid.invalide", { champ: "diff" }));
  }
  const densite = Number(brut.densite);
  if (!Number.isFinite(densite) || densite <= 0 || densite > 1000) {
    erreurs.push(t("valid.densite"));
  }

  const semisValide = Array.isArray(brut.semis) && brut.semis.length >= 1
    && brut.semis.length <= 4 && brut.semis.every(fenetre =>
      Array.isArray(fenetre) && fenetre.length === 2
      && fenetre.every(mois => Number.isInteger(mois) && mois >= 1 && mois <= 12));
  if (!semisValide) erreurs.push(t("valid.semis"));

  const conseilsValides = Array.isArray(brut.conseils) && brut.conseils.length <= 20
    && brut.conseils.every(conseil => typeof conseil === "string"
      && conseil.trim().length <= 300);
  if (!conseilsValides) erreurs.push(t("valid.invalide", { champ: "conseils" }));

  const photoBrute = texte("photo", "", 2000);
  if (photoBrute && !estImageValide(photoBrute)) erreurs.push(t("valid.photourl"));
  const lienBrut = texte("lien", "", 2000);
  const lien = urlExterneSure(lienBrut);
  if (lienBrut && !lien) erreurs.push(t("valid.lienurl"));

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
      enracinee: Boolean(brut.enracinee),
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

// Décalage climatique applicable à UNE plante : les frileuses suivent les
// dernières gelées (décalage fort), les rustiques la température du sol (faible).
function decalageZone(zone, plante) {
  const z = ZONES[zone] || ZONES.tempere;
  const bloc = plante && plante.frileux ? z.frileux : z.rustique;
  return bloc && Number.isFinite(bloc.debut) && Number.isFinite(bloc.fin)
    ? bloc : { debut: z.debut, fin: z.fin };   // repli sur l'ancien décalage global
}

// Décale une fenêtre [debut, fin] selon la zone (et la plante si fournie).
function fenetreZone([d, f], zone, plante) {
  const z = decalageZone(zone, plante);
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
  const fenetres = plante.semis.map(w => fenetreZone(w, zone, plante));
  if (fenetres.some(f => moisDansFenetre(moisCourant, f))) return "now";
  const moisProchain = (moisCourant % 12) + 1;
  if (fenetres.some(f => moisDansFenetre(moisProchain, f))) return "soon";
  return "later";
}

// Texte lisible de la fenêtre de semis pour la zone
function texteFenetre(plante, zone) {
  return plante.semis.map(w => {
    const f = fenetreZone(w, zone, plante);
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

// Densité lisible. Un demi-pied de figuier n'existe pas : sous 1 pied/m² on
// inverse le rapport et on annonce la surface qu'il faut par pied.
function nombreFR(n) {
  return Number(n).toLocaleString(localeCourante(), { maximumFractionDigits: 1 });
}
// Texte "N pied(s)" / "N plant(s)", utilisé dans la fiche plante et les cartes.
function texteNombrePieds(n) {
  const unite = getLang() === "en" ? (n >= 2 ? "plants" : "plant") : (n >= 2 ? "pieds" : "pied");
  return `${nombreFR(n)} ${unite}`;
}
function texteDensite(plante) {
  const d = plante.densite;
  const unitePieds = getLang() === "en" ? (d >= 2 ? "plants" : "plant") : (d >= 2 ? "pieds" : "pied");
  if (d >= 1) return `${nombreFR(d)} ${unitePieds}/m²`;
  const m2 = Math.round(1 / d);
  return getLang() === "en"
    ? `1 plant per ${nombreFR(m2)} m²`
    : `1 pied pour ${nombreFR(m2)} m²`;
}

// Lien d'achat : 1) lien propre à la plante, 2) partenaire global, 3) recherche web
// Verrou lu défensivement : si un ancien data.js reste en cache, on reste non commercial.
const monetisationActive = () => typeof MONETISATION_ACTIVE !== "undefined" && MONETISATION_ACTIVE === true;
function lienAchat(plante) {
  const lienPropre = urlExterneSure(plante.lien);
  if (lienPropre) return lienPropre;
  if (monetisationActive() && typeof PARTENAIRE_DEFAUT !== "undefined" && PARTENAIRE_DEFAUT.actif) {
    const lienPartenaire = urlExterneSure(
      PARTENAIRE_DEFAUT.url.replace("{q}", encodeURIComponent(txt(plante.nom))));
    if (lienPartenaire) return lienPartenaire;
  }
  const requete = getLang() === "en" ? `organic ${txt(plante.nom)} seeds vegetable garden` : `graines ${txt(plante.nom)} bio potager`;
  const q = encodeURIComponent(requete);
  return `https://www.google.com/search?q=${q}`;
}
// Le lien est-il sponsorisé (badge "Partenaire ✦") ?
function estSponsorise(plante) {
  if (!monetisationActive()) return false;         // projet non commercial (cf. data.js)
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
    vide.textContent = t("ac.aucune");
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
  const source = `📍 ${r.nom}${r.cp ? " (" + r.cp + ")" : ""}`;
  majZone(z, source);
  sauverPreferencesJardin();
  // L'altitude arrive après coup : elle peut basculer la zone en montagne.
  appliquerAltitude(r.lat, r.lng, z, source);
}

// Applique l'altitude sans bloquer l'affichage. Une commune du dictionnaire
// déjà classée « montagne » n'est jamais rétrogradée par l'altitude.
async function appliquerAltitude(lat, lng, zoneEstimee, source) {
  const affine = await affinerZoneParAltitude(lat, lng, zoneEstimee);
  if (!affine) return;
  if (state.villeCoords && (state.villeCoords.lat !== lat || state.villeCoords.lng !== lng)) return;
  const zoneFinale = zoneEstimee === "montagne" ? "montagne" : affine.zone;
  majZone(zoneFinale, `${source} · ${affine.note}`);
}

function surlignerAc() {
  document.querySelectorAll("#ac .ac-item").forEach((el, i) =>
    el.classList.toggle("actif", i === acIndex));
}

// --- Altitude via l'API altimétrie IGN (Géoplateforme, gratuite, sans clé) ---
// Le géocodage ne renvoie que la commune : deux communes voisines peuvent être
// à 300 m et à 1 200 m. On interroge donc l'altitude du point avant de trancher.
// Borné + repli null : sans réponse, on garde la zone déduite de la position.
const ALTITUDE_MONTAGNE = 900;    // m — au-dessus, saison courte et gel tardif
const ALTITUDE_PIEMONT = 600;     // m — entre les deux, on prévient sans forcer

async function altitudePoint(lat, lng) {
  const url = `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json`
    + `?lon=${encodeURIComponent(lng)}&lat=${encodeURIComponent(lat)}`
    + `&resource=ign_rge_alti_wld`;
  const reponse = await requeteJSON(url, { cacheMs: 24 * 60 * 60 * 1000 });
  const point = reponse.ok && Array.isArray(reponse.data.elevations)
    ? reponse.data.elevations[0] : null;
  const z = point && Number(point.z);
  // L'IGN renvoie -99999 hors emprise : à écarter explicitement.
  if (!Number.isFinite(z) || z < -100 || z > 5000) return null;
  return z;
}

// Affine la zone d'après l'altitude. Renvoie {zone, note} ou null si sans effet.
async function affinerZoneParAltitude(lat, lng, zoneEstimee) {
  const alt = await altitudePoint(lat, lng);
  if (alt === null) return null;
  const altArrondie = Math.round(alt);
  if (alt >= ALTITUDE_MONTAGNE) {
    return { zone: "montagne", note: t("geo.altitudependant", { alt: altArrondie }) };
  }
  if (alt >= ALTITUDE_PIEMONT) {
    return { zone: zoneEstimee, note: t("geo.altitudepiemont", { alt: altArrondie }) };
  }
  return { zone: zoneEstimee, note: t("geo.altitude", { alt: altArrondie }) };
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
  const photo = photoPlante(plante);
  const ruban = statut === "now" ? `<span class="ruban-now">${t("carte.aplanter")}</span>`
    : statut === "soon" ? `<span class="ruban-soon">${t("carte.bientot")}</span>` : "";
  const imgTag = photo
    ? `<img src="${echapperHTML(photo)}" alt="${echapperHTML(plante.nom)}" loading="lazy" onerror="this.remove()" />` : "";
  const spons = estSponsorise(plante) ? `<span class="spons">${t("carte.partenaire")}</span>` : "";
  const nPieds = nbPieds(plante, surfaceDediee(plante, state.surface));
  const surf = state.surface
    ? `<span>${t(nPieds >= 2 ? "carte.piedsconseilles.pl" : "carte.piedsconseilles", { n: texteNombrePieds(nPieds) })}</span>`
    : `<span>🪴 ${texteDensite(plante)}</span>`;

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
        <span>${t("carte.semer")}<strong>${texteFenetre(plante, state.zone)}</strong></span>
        <span>${t("carte.recolte")}${echapperHTML(plante.recolte)}</span>
        ${surf}
      </div>
      <div class="carte-foot">
        <a class="lien-achat" href="${echapperHTML(lienAchat(plante))}" target="_blank" rel="noopener"
           onclick="event.stopPropagation()">${t("carte.trouver")} ${spons}</a>
        <button class="adopt ${estAdoptee(plante.id) ? "on" : ""}" data-adopt="${echapperHTML(plante.id)}">
          ${estAdoptee(plante.id) ? t("carte.plante") : t("carte.adopter")}</button>
      </div>
    </div>`;
}

// Ligne compacte (vue liste)
function creerLigne(plante) {
  const c = CYCLES[plante.cycle], d = DIFFICULTES[plante.diff];
  const statut = state._statut(plante);
  const semis = statut === "now"
    ? `<span class="lg-now">${t("ligne.aplanter")}</span>`
    : `🌱 ${texteFenetre(plante, state.zone)}`;
  const surf = state.surface
    ? `🪴 ≈ ${texteNombrePieds(nbPieds(plante, surfaceDediee(plante, state.surface)))}`
    : `🪴 ${texteDensite(plante)}`;
  const on = estAdoptee(plante.id);
  const photo = photoPlante(plante);

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
  return m2.toLocaleString(localeCourante(), { maximumFractionDigits: 1 });
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
  const photo = photoPlante(plante);
  const badge = statut === "now" ? `<span class="cal-badge">${t("modale.aplanter")}</span>` : "";
  const imgTag = photo
    ? `<img src="${echapperHTML(photo)}" alt="${echapperHTML(plante.nom)}" onerror="this.remove()" />` : "";

  let calc;
  if (state.surface) {
    const dediee = surfaceDediee(plante, state.surface);
    calc = `<p class="calc-res">${t("modale.calc.avecsurface", {
      surface: state.surface, dediee: fmtSurface(dediee),
      pieds: texteNombrePieds(nbPieds(plante, dediee)), densite: texteDensite(plante),
    })}</p>`;
  } else {
    calc = `<p class="calc-res">${t("modale.calc.sanssurface", { densite: texteDensite(plante) })}</p>`;
  }

  const modale = $("#modale");
  modale.innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="modale-img" style="background:${fondCarte(plante)}">
      <span class="emoji">${echapperHTML(plante.emoji)}</span>${imgTag}
    </div>
    <div class="modale-corps">
      <h2>${echapperHTML(plante.nom)}${plante.perso ? `<span class="tag-perso">${t("modale.ajouteeparToi")}</span>` : ""}${
        plante.enracinee ? `<span class="tag-enracinee">${t("modale.enracinee")}</span>` : ""}</h2>
      <p class="latin">${echapperHTML(plante.latin)} — ${CATEGORIES[plante.cat].label}</p>
      <div class="modale-pictos">
        <span class="picto" title="${c.desc}">${c.picto} ${c.label}</span>
        <span class="picto diff-${plante.diff}" title="${d.desc}">${d.picto} ${d.label}</span>
        <span class="picto">${enc.picto} ${enc.label}</span>
        <span class="picto">${sol.picto} ${sol.label}</span>
      </div>
      <p class="long">${echapperHTML(plante.long)}</p>

      <div class="bloc">
        <h4>${t("modale.calendrier", { zone: ZONES[state.zone].label })}</h4>
        <p style="margin:0">${t("modale.semerplanter")}<span class="${statut === "now" ? "cal-now" : ""}">${texteFenetre(plante, state.zone)}</span>${badge}</p>
        <p style="margin:4px 0 0">${t("modale.recolte")}${echapperHTML(plante.recolte)}</p>
      </div>

      <div class="bloc">
        <h4>${t("modale.estimation")}</h4>
        ${calc}
      </div>

      ${estAdoptee(plante.id) ? `
      <div class="bloc bloc-suivi">
        <h4>${t("modale.suivi")}</h4>
        <label class="suivi-date">${t("modale.suivi.date")}
          <input type="date" id="suivi-date" value="${echapperHTML(state.dates[plante.id] || "")}" />
        </label>
        <ul class="suivi-etapes" id="suivi-etapes"></ul>
        <p class="suivi-note">${t("modale.suivi.note")}</p>
      </div>` : ""}

      <div class="bloc">
        <h4>${t("modale.fiche")}</h4>
        <div class="fiche">
          <span class="k">${t("fiche.cycle")}</span><span class="v">${c.picto} ${c.label}</span>
          <span class="k">${t("fiche.difficulte")}</span><span class="v">${d.picto} ${d.label}</span>
          <span class="k">${t("fiche.exposition")}</span><span class="v">${sol.picto} ${sol.label}</span>
          <span class="k">${t("fiche.encombrement")}</span><span class="v">${enc.picto} ${enc.label}</span>
          <span class="k">${t("fiche.densite")}</span><span class="v">${texteDensite(plante)}</span>
          <span class="k">${t("fiche.espacement")}</span><span class="v">${echapperHTML(plante.espacement)}</span>
        </div>
      </div>

      <div class="bloc">
        <h4>${t("modale.conseils")}</h4>
        <ul class="conseils">${plante.conseils.map(x => `<li>${echapperHTML(x)}</li>`).join("")}</ul>
      </div>

      <div class="bloc" id="bloc-sachets">
        <h4>${t("modale.sachets")}</h4>
        ${blocSachetsHTML(plante)}
      </div>

      <a class="lien-achat" href="${echapperHTML(lienAchat(plante))}" target="_blank" rel="noopener">
        ${t("lien.trouvergraines")} ${estSponsorise(plante) ? `<span class="spons">${t("lien.partenaire")}</span>` : ""}</a>
      ${plante.perso ? `<button class="btn-danger" id="btn-suppr-perso" style="width:100%;margin-top:10px">${t("btn.supprplante")}</button>` : ""}
    </div>`;

  modale.querySelector(".fermer").addEventListener("click", fermerModale);

  if (modale._clicRot) modale.removeEventListener("click", modale._clicRot);
  modale._clicRot = e => {
    const v = e.target.closest("[data-sachet]");
    if (v) ouvrirSachet(v.dataset.sachet);
  };
  modale.addEventListener("click", modale._clicRot);

  // Suivi de culture : liste des étapes + changement de date
  const champDate = modale.querySelector("#suivi-date");
  if (champDate) {
    const majEtapes = () => {
      const ul = modale.querySelector("#suivi-etapes");
      if (!ul) return;
      ul.replaceChildren();
      const iso = state.dates[plante.id];
      if (!iso) {
        const li = el("li", "etape-vide");
        li.textContent = t("etape.vide");
        ul.appendChild(li);
        return;
      }
      const aujourdhui = dateDuJour(); aujourdhui.setHours(0, 0, 0, 0);
      etapesCulture(plante, iso).forEach(etape => {
        if (etape.sansDate) {
          const li = el("li", "etape etape-info");
          li.innerHTML = `<span class="etape-date">⚠️</span>
            ${etape.emoji} ${echapperHTML(etape.label)}`;
          ul.appendChild(li);
          return;
        }
        const li = el("li", etape.date < aujourdhui ? "etape passee" : "etape");
        li.innerHTML = `<span class="etape-date">${fmtDateCourte(etape.date)}</span>
          ${etape.emoji} ${echapperHTML(etape.label)}${etape.date < aujourdhui ? " ✓" : ""}`;
        ul.appendChild(li);
      });
    };
    champDate.addEventListener("change", () => {
      definirDate(plante.id, champDate.value);
      majEtapes();
      rendre();
    });
    majEtapes();
  }

  const bs = modale.querySelector("#btn-suppr-perso");
  if (bs) bs.addEventListener("click", () => {
    if (confirm(t("confirm.supprplante", { nom: txt(plante.nom) }))) supprimerPlante(plante.id);
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
  const moisOpts = def => MOIS_ACTIFS().map((m, i) =>
    `<option value="${i + 1}" ${i + 1 === def ? "selected" : ""}>${m}</option>`).join("");

  $("#modale").innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="form-ajout">
      <h2>${t("form.titre")}</h2>
      <p class="sous">${t("form.sous")}</p>
      <div class="fgrid">
        <div class="fchamp full">
          <label>${t("form.nom")}</label>
          <div class="f-auto-row">
            <input id="f-nom" value="${echapperHTML(prefill)}" placeholder="${t("form.nom.placeholder")}" />
            <button type="button" class="btn secondaire" id="f-auto">${t("form.autoremplir")}</button>
          </div>
          <span id="f-auto-statut" style="font-size:12px;color:var(--texte-doux)"></span>
        </div>
        <div class="fchamp"><label>${t("form.latin")}</label><input id="f-latin" placeholder="${t("form.facultatif")}" /></div>
        <div class="fchamp"><label>${t("form.categorie")}</label><select id="f-cat">${opts(CATEGORIES)}</select></div>
        <div class="fchamp"><label>${t("form.emoji")}</label><input id="f-emoji" maxlength="4" placeholder="🌱" /></div>
        <div class="fchamp"><label>${t("form.photo")}</label><input id="f-photo" placeholder="${t("form.photo.placeholder")}" /></div>
        <div class="fchamp"><label>${t("form.cycle")}</label><select id="f-cycle">${opts(CYCLES)}</select></div>
        <div class="fchamp"><label>${t("form.difficulte")}</label><select id="f-diff">${opts(DIFFICULTES)}</select></div>
        <div class="fchamp"><label>${t("form.encombrement")}</label><select id="f-enc">${opts(ENCOMBREMENTS)}</select></div>
        <div class="fchamp"><label>${t("form.exposition")}</label><select id="f-soleil">${opts(SOLEILS)}</select></div>
        <div class="fchamp"><label>${t("form.densite")}</label><input id="f-densite" type="number" min="0" step="0.5" value="9" /></div>
        <div class="fchamp"><label>${t("form.espacement")}</label><input id="f-espacement" placeholder="${t("form.espacement.placeholder")}" /></div>
        <div class="fchamp"><label>${t("form.semisdeb")}</label><select id="f-semis-deb">${moisOpts(3)}</select></div>
        <div class="fchamp"><label>${t("form.semisfin")}</label><select id="f-semis-fin">${moisOpts(6)}</select></div>
        <div class="fchamp full"><label>${t("form.recolte")}</label><input id="f-recolte" placeholder="${t("form.recolte.placeholder")}" /></div>
        <div class="fchamp full"><label>${t("form.court")}</label><input id="f-court" placeholder="${t("form.court.placeholder")}" /></div>
        <div class="fchamp full"><label>${t("form.long")}</label><textarea id="f-long" placeholder="${t("form.facultatif")}"></textarea></div>
        <div class="fchamp full"><label>${t("form.conseils")}</label><textarea id="f-conseils" placeholder="${t("form.conseils.placeholder")}"></textarea></div>
        <div class="fchamp full"><label>${t("form.lien")}</label><input id="f-lien" placeholder="${t("form.photo.placeholder")}" /></div>
        <div class="fchamp inline full enracinement-option">
          <input id="f-enracinee" type="checkbox" />
          <label for="f-enracinee">
            <strong>${t("form.enracinee.titre")}</strong>
            <span>${t("form.enracinee.sous")}</span>
          </label>
        </div>
        <div class="fchamp inline full"><input id="f-frileux" type="checkbox" /><label for="f-frileux">${t("form.frileux")}</label></div>
      </div>
      <div class="form-erreur" id="f-erreur" role="alert" hidden></div>
      <div class="form-actions">
        <button class="btn secondaire" id="f-annuler">${t("form.annuler")}</button>
        <button class="btn" id="f-enregistrer">${t("form.enregistrer")}</button>
      </div>
    </div>`;

  $("#modale").querySelector(".fermer").addEventListener("click", fermerModale);
  $("#f-annuler").addEventListener("click", fermerModale);
  $("#f-enregistrer").addEventListener("click", enregistrerPlante);
  $("#f-auto").addEventListener("click", autoRemplirFiche);
  g_photo_reset();
  function g_photo_reset() {
    const el = $("#f-photo");
    if (el) el.addEventListener("input", () => { el.style.borderColor = ""; el.title = ""; });
  }
  $("#overlay").classList.add("ouvert");
  document.body.style.overflow = "hidden";
  $("#f-nom").focus();

  // Auto-remplissage automatique : si un nom est déjà connu (recherche restée
  // sans résultat), on interroge Wikipédia sans attendre de clic. Non bloquant,
  // et le bouton reste disponible pour relancer après correction du nom.
  if (prefill.trim()) autoRemplirFiche();
  // Saisie manuelle : on lance dès que le nom se stabilise, une seule fois pour
  // ne pas écraser ce que l'utilisateur est en train d'écrire.
  let autoTimer = null, autoDejaFait = Boolean(prefill.trim());
  $("#f-nom").addEventListener("input", () => {
    if (autoDejaFait) return;
    clearTimeout(autoTimer);
    const nom = $("#f-nom").value.trim();
    if (nom.length < 3) return;
    autoTimer = setTimeout(() => {
      if ($("#f-nom").value.trim() !== nom) return;   // encore en train de taper
      autoDejaFait = true;
      autoRemplirFiche();
    }, 900);
  });
}

// Auto-remplissage de la fiche depuis Wikipédia (nom → résumé + photo + nom latin).
// Note : on interroge toujours la Wikipédia FRANÇAISE (source la plus fiable
// pour des variétés potagères courantes en France), quelle que soit la langue
// d'interface — seuls les messages de statut du formulaire sont traduits.
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

// Wikipédia renvoie parfois une vignette inutilisable (.ogg/.ogv/.svg d'un média,
// ou pas de vignette du tout). Repli : API pageimages, qui rend une vraie image
// matricielle. Renvoie "" si rien d'exploitable — jamais une URL non affichable.
async function fetchImageWiki(titrePage) {
  const url = `https://fr.wikipedia.org/w/api.php?action=query&prop=pageimages`
    + `&piprop=thumbnail&pithumbsize=800&redirects=1&format=json&origin=*`
    + `&titles=${encodeURIComponent(titrePage)}`;
  const data = await fetchJSON(url);
  const pages = data && data.query && data.query.pages;
  const page = pages && Object.values(pages)[0];
  const src = page && page.thumbnail && page.thumbnail.source;
  return src && estImageValide(src) ? src : "";
}

async function autoRemplirFiche() {
  const nom = $("#f-nom").value.trim();
  const statut = $("#f-auto-statut");
  if (!nom) { $("#f-nom").focus(); return; }
  statut.textContent = t("auto.recherche");
  const data = await fetchWikipedia(nom);
  if (!data || data.notFound) {
    statut.textContent = data && data.notFound ? t("auto.introuvable") : t("auto.injoignable");
    return;
  }
  if (data.type === "disambiguation") {
    statut.textContent = t("auto.homonymie", { nom });
    return;
  }
  const extrait = data.extract || "";
  const g = id => $("#f-" + id);
  const titrePage = (data.titles && data.titles.canonical) || nom;

  // Photo : vignette du résumé si exploitable, sinon image originale, sinon
  // repli pageimages (cas d'une vignette .ogg/.ogv/.svg non affichable).
  let photo = "";
  const candidats = [data.thumbnail && data.thumbnail.source,
                     data.originalimage && data.originalimage.source];
  for (const c of candidats) { if (c && estImageValide(c)) { photo = c; break; } }
  if (!photo) photo = await fetchImageWiki(titrePage);
  if (photo) { g("photo").value = photo; g("photo").style.borderColor = ""; }

  if (!g("court").value.trim()) g("court").value = (extrait.split(/(?<=[.!?])\s/)[0] || "").slice(0, 140);
  if (!g("long").value.trim()) g("long").value = extrait;

  const latin = await nomLatinWikidata(titrePage);
  if (latin && !g("latin").value.trim()) g("latin").value = latin;

  const manques = [];
  if (!latin) manques.push(t("auto.manque.latin"));
  if (!photo) manques.push(t("auto.manque.photo"));
  statut.textContent = manques.length
    ? t("auto.rempli.manque", { manques: manques.join(t("auto.et")), s: manques.length > 1 ? "s" : "" })
    : t("auto.rempli.ok");
}

// ---------- Photos manquantes : récupération automatique (Wikipédia) ----------
// Quatre plantes de la base n'ont pas de `photo:` (fève, ail, figuier, gingembre).
// Plutôt que de figer quatre URL à la main — qui casseront le jour où le fichier
// Commons sera renommé — on récupère la vignette au premier affichage et on la
// met en cache localement. Vaut pour toute plante ajoutée sans photo.
const LS_PHOTOS = "permavore.photos.v1";
const PHOTOS_CACHE_MS = 30 * 24 * 60 * 60 * 1000;   // 30 jours
let photosCache = {};
let photosEnAttente = new Set();

function chargerCachePhotos() {
  try {
    const brut = JSON.parse(localStorage.getItem(LS_PHOTOS) || "{}");
    if (brut && typeof brut === "object" && !Array.isArray(brut)) photosCache = brut;
  } catch (e) { /* stockage indispo */ }
}
function sauverCachePhotos() {
  try { localStorage.setItem(LS_PHOTOS, JSON.stringify(photosCache)); }
  catch (e) { /* ignore */ }
}
// Photo effective d'une plante : celle de la base, sinon celle retrouvée en cache.
function photoPlante(plante) {
  if (estImageValide(plante.photo) && plante.photo) return urlExterneSure(plante.photo);
  const entree = photosCache[plante.id];
  if (entree && entree.url && estImageValide(entree.url)) return urlExterneSure(entree.url);
  return photoSachetIllustration(plante.id);
}

// La photo du sachet (le légume y est imprimé) sert d'illustration de repli :
// c'est souvent la meilleure aide à l'identification pour une variété précise.
function photoSachetIllustration(plantId) {
  if (typeof sachetsDe !== "function") return "";
  const s = sachetsDe(plantId).find(x => x.meta && x.meta.illustre);
  return s ? s.thumb : "";
}
// Faut-il (re)chercher une photo pour cette plante ?
function photoARechercher(plante) {
  if (plante.photo) return false;
  const entree = photosCache[plante.id];
  if (!entree) return true;
  return Date.now() - (entree.quand || 0) > PHOTOS_CACHE_MS;   // on retente après expiration
}
async function completerPhotosManquantes() {
  const cibles = PLANTES.filter(p => photoARechercher(p) && !photosEnAttente.has(p.id)).slice(0, 8);
  if (!cibles.length) return;
  cibles.forEach(p => photosEnAttente.add(p.id));
  let trouvee = false;
  for (const plante of cibles) {
    // Le nom latin cible l'espèce sans ambiguïté ; le nom courant (français,
    // langue de la Wikipédia interrogée) sert de repli.
    const nomRef = typeof plante.nom === "object" && plante.nom && "fr" in plante.nom ? plante.nom.fr : String(plante.nom);
    const requetes = [plante.latin, nomRef].filter(t => t && t !== "—");
    let url = "";
    for (const titre of requetes) {
      const data = await fetchWikipedia(titre);
      const source = data && !data.notFound && data.type !== "disambiguation"
        && data.thumbnail && data.thumbnail.source;
      if (source && estImageValide(source)) { url = source; break; }
    }
    photosCache[plante.id] = { url, quand: Date.now() };
    if (url) trouvee = true;
    photosEnAttente.delete(plante.id);
  }
  sauverCachePhotos();
  if (trouvee) rendre();
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
    afficherErreurForm(t("erreur.nomrequis"), g("nom"));
    return;
  }
  const photoUrl = g("photo").value.trim();
  if (!estImageValide(photoUrl)) {
    g("photo").title = t("erreur.photo.title");
    afficherErreurForm(t("erreur.photo"), g("photo"));
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
    enracinee: g("enracinee").checked,
    semis: [[deb, fin]], recolte: g("recolte").value.trim() || "—",
    court: g("court").value.trim() || t("plante.ajouteeparToi"),
    long: g("long").value.trim() || g("court").value.trim() || t("plante.ajouteeparToi"),
    conseils: g("conseils").value.split("\n").map(s => s.trim()).filter(Boolean),
    lien: g("lien").value.trim() || "", sponsorise: false,
  };
  const resultat = validerPlantePerso(candidate);
  if (!resultat.valide) {
    afficherErreurForm(t("erreur.enregistrement", { erreurs: resultat.erreurs.join(" ") }));
    return;
  }
  const p = resultat.plante;
  PLANTES.push(p);
  sauverPlantesPerso();
  state.recherche = ""; $("#recherche").value = "";
  rendre();
  if (state._photoPourNouvelle && state._photoEnCours) {
    state._photoPourNouvelle = false;
    ecranDetailsSachet(p);        // on rattache d'abord la photo du sachet
    return;
  }
  demanderSiPlantee(p);           // « tu l'as déjà en terre, ou pas encore ? »
}

// Après l'ajout d'une plante : est-elle déjà en terre ? Si oui, on l'adopte et on
// enregistre la date pour alimenter les prochaines étapes ; sinon on la garde en base.
function demanderSiPlantee(p, contexte = "ajout") {
  const auj = dateDuJour().toISOString().slice(0, 10);
  const titre = contexte === "sachet"
    ? t("plantee.titre.sachet") : t("plantee.titre.ajout", { nom: echapperHTML(txt(p.nom)) });
  const sous = contexte === "sachet"
    ? t("plantee.sous.sachet", { nom: echapperHTML(txt(p.nom)) }) : t("plantee.sous.ajout");
  $("#modale").innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="modale-img" style="background:${fondCarte(p)}">
      <span class="emoji">${p.emoji}</span>${photoPlante(p)
        ? `<img src="${echapperHTML(photoPlante(p))}" alt="" onerror="this.remove()">` : ""}
    </div>
    <div class="modale-corps">
      <h2>${titre}</h2>
      <p class="latin">${sous}</p>
      <div class="bloc">
        <h4>${t("plantee.question")}</h4>
        <p style="margin:0 0 12px;font-size:14px">${t("plantee.explication")}</p>
        <div class="fchamp" id="bloc-date">
          <label for="q-date">${t("plantee.date")}</label>
          <input id="q-date" type="date" value="${auj}" max="${auj}" />
        </div>
        <div class="form-actions">
          <button class="btn secondaire" id="q-non">${t("plantee.non")}</button>
          <button class="btn" id="q-oui">${t("plantee.oui")}</button>
        </div>
      </div>
    </div>`;

  const fin = () => { fermerModale(); rendre(); ouvrirModale(p); };
  $("#modale").querySelector(".fermer").addEventListener("click", fin);
  $("#q-non").addEventListener("click", fin);
  $("#q-oui").addEventListener("click", () => {
    state.adoptees.add(p.id); sauverAdoptees();
    const d = $("#q-date").value;
    if (d && state.dates) { state.dates[p.id] = d; sauverDates && sauverDates(); }
    fin();
  });
  $("#overlay").classList.add("ouvert");
  document.body.style.overflow = "hidden";
}

// ---------- Filtres ----------
const FILTRES_CAT = [
  { k: "tous", cle: "filtre.tout" },
  { k: "legume", cle: "filtre.legumes" },
  { k: "fruit", cle: "filtre.fruits" },
  { k: "aromatique", cle: "filtre.aromatiques" },
  { k: "exotique", cle: "filtre.exotiques" },
];
const FILTRES_CYCLE = [
  { k: "annuelle", cle: "filtre.annuelles" },
  { k: "bisannuelle", cle: "filtre.bisannuelles" },
  { k: "vivace", cle: "filtre.vivaces" },
];

function construireFiltres() {
  const nav = $("#filtres");
  nav.innerHTML = "";
  FILTRES_CAT.forEach(f => {
    const chip = el("button", "chip" + (state.categorie === f.k ? " actif" : ""), t(f.cle));
    chip.addEventListener("click", () => { state.categorie = f.k; sauverPreferencesJardin(); rendre(); });
    nav.appendChild(chip);
  });
  const sep1 = el("span", null, "&nbsp;");
  nav.appendChild(sep1);
  FILTRES_CYCLE.forEach(f => {
    const actif = state.cycle === f.k;
    const chip = el("button", "chip" + (actif ? " actif" : ""), t(f.cle));
    chip.addEventListener("click", () => { state.cycle = actif ? "tous" : f.k; sauverPreferencesJardin(); rendre(); });
    nav.appendChild(chip);
  });
  const chipPe = el("button", "chip" + (state.petitsEspaces ? " actif" : ""), t("filtre.petits"));
  chipPe.addEventListener("click", () => { state.petitsEspaces = !state.petitsEspaces; sauverPreferencesJardin(); rendre(); });
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
    const cible = normaliseVille(txt(p.nom) + " " + p.latin
      + (typeof p.nom === "object" && p.nom && "en" in p.nom ? " " + p.nom.en : ""));
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
    const fmt = aujourdhui.toLocaleDateString(localeCourante(),
      { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    dj.textContent = t("datedujour", { date: fmt });
  }
  const sousNow = document.querySelector("#section-now .section-sous");
  if (sousNow) {
    const fmtCourt = aujourdhui.toLocaleDateString(localeCourante(), { day: "numeric", month: "long" });
    sousNow.textContent = t("now.sous", { date: fmtCourt });
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
  const parNom = (a, b) => a.nom.localeCompare(b.nom);
  now.sort(parNom); soon.sort(parNom); autres.sort(parNom);

  state._nowCount = now.length;
  rendreLune();
  rendreEtapes();
  remplirGrille("#grille-now", now, "#section-now", "#now-count");
  remplirGrille("#grille-soon", soon, "#section-soon", "#soon-count");
  remplirGrille("#grille-autres", autres, null, null);

  const vide = $("#vide");
  vide.hidden = visibles.length !== 0;
  if (!vide.hidden) {
    vide.innerHTML = state.recherche
      ? `${t("vide.recherche", { q: echapperHTML(state.recherche) })}<br>
         <button class="btn" id="btn-ajouter-vide" style="margin-top:10px">
           ${t("vide.ajouter", { q: echapperHTML(state.recherche) })}</button>`
      : t("vide.defaut");
    const b = $("#btn-ajouter-vide");
    if (b) b.addEventListener("click", () => ouvrirFormAjout(state.recherche));
  }
  const tc = document.querySelector("#total-count");
  if (tc) tc.textContent = t(visibles.length > 1 ? "total.count.pl" : "total.count", { n: visibles.length });

  const sousAutres = $("#autres-sous");
  if (sousAutres) sousAutres.textContent = state.surface
    ? t("autres.sous.surface", { surface: state.surface })
    : t("autres.sous.defaut");

  majMonPotager();
  if (document.body.classList.contains("configure")) majResume();
}

// ---------- Bandeau lunaire ----------
function rendreLune() {
  const b = $("#bandeau-lune");
  if (!b || typeof infosLune !== "function") return;
  const l = infosLune(dateDuJour());
  state._lune = l;
  // Le jour est-il favorable à ce que l'utilisateur cultive ?
  const miennes = [...state.adoptees].map(id => PLANTES.find(p => p.id === id)).filter(Boolean);
  const match = miennes.filter(p => typeLunairePlante(p) === l.typeJour);
  b.innerHTML = `
    <span class="lune-emoji">${l.emoji}</span>
    <span class="lune-txt">
      <span class="lune-titre">${l.phase} · lune ${l.croissante ? t("lune.croissante") : t("lune.decroissante")}
        et ${l.montante ? t("lune.montante") : t("lune.descendante")}</span>
      <span class="lune-sous">${l.conseil}${
        match.length ? t(match.length > 1 ? "lune.aprofitent" : "lune.aprofite", { n: match.length }) : ""}</span>
    </span>
    <span class="lune-jour ${match.length ? "match" : ""}">${l.pictoJour} ${l.label}</span>`;
}

function ouvrirModaleLune() {
  const l = state._lune || infosLune(dateDuJour());
  const fmt = d => d.toLocaleDateString(localeCourante(), { weekday: "long", day: "numeric", month: "long" });
  const prochains = ["racine", "feuille", "fleur", "fruit"].map(typ => {
    const d = prochainJour(typ, dateDuJour());
    const info = { racine: "🥕", feuille: "🥬", fleur: "🌸", fruit: "🍅" }[typ];
    return `<span class="k">${info} ${TYPES_JOUR[typ].label}</span><span class="v">${d ? fmt(d) : "—"}</span>`;
  }).join("");

  const favorites = PLANTES.filter(p => typeLunairePlante(p) === l.typeJour
    && state._statut && state._statut(p) === "now").slice(0, 8);

  $("#modale").innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="modale-img" style="background:linear-gradient(135deg,#3b3560,#1d1a33)">
      <span class="emoji">${l.emoji}</span>
    </div>
    <div class="modale-corps">
      <h2>${l.phase}</h2>
      <p class="latin">${t("lune.agejours", { age: l.age, constellation: l.constellation })}</p>
      <div class="modale-pictos">
        <span class="picto">${l.croissante ? t("lune.croissantelabel") : t("lune.decroissantelabel")}</span>
        <span class="picto">${l.montante ? t("lune.montantelabel") : t("lune.descendantelabel")}</span>
        <span class="picto">${l.pictoJour} ${l.label}</span>
      </div>
      <p class="long">${l.conseil}</p>

      <div class="bloc">
        <h4>${t("lune.favorise", { picto: l.pictoJour })}</h4>
        <p style="margin:0">${l.cible}</p>
        ${favorites.length ? `<p style="margin:8px 0 0">${t("lune.aplanteret", { liste: favorites.map(p => echapperHTML(txt(p.nom))).join(", ") })}</p>` : ""}
      </div>

      <div class="bloc">
        <h4>${t("lune.prochains")}</h4>
        <div class="fiche">${prochains}</div>
      </div>

      <div class="bloc">
        <h4>${t("lune.asavoir")}</h4>
        <p style="margin:0;font-size:14px">${t("lune.disclaimer")}</p>
      </div>
    </div>`;
  $("#modale").querySelector(".fermer").addEventListener("click", fermerModale);
  $("#overlay").classList.add("ouvert");
  document.body.style.overflow = "hidden";
}

// ---------- Mes ressources : modale de gestion ----------
function ouvrirModaleRessources() {
  const possedees = [...state.ressources];
  const dispo = Object.entries(RESSOURCES_CATALOGUE).filter(([k]) => !state.ressources.has(k));

  $("#modale").innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="form-ajout">
      <h2>${t("ressources.titre")}</h2>
      <p class="sous">${t("ressources.sous")}</p>

      <div class="bloc">
        <h4>${t("ressources.possede", { n: possedees.length })}</h4>
        ${possedees.length ? `<div class="res-liste">${possedees.map(k => {
          const r = RESSOURCES_CATALOGUE[k];
          const pu = prochaineUtilisation(r);
          return `<div class="res-item"><span class="res-emoji">${r.emoji}</span>
            <span class="res-nom">${r.label}<br><span class="res-quand">${r.quand}</span>
              <br><span class="res-quand" style="color:${pu.maintenant ? "var(--vert-fonce)" : "var(--texte-doux)"};font-weight:700">
                ${pu.maintenant ? "🔔 " : "🕒 "}${pu.texte}</span></span>
            <button class="res-suppr" data-suppr="${k}">${t("ressources.retirer")}</button></div>`;
        }).join("")}</div>` : `<p style="margin:0;font-size:14px;color:var(--texte-doux)">
          ${t("ressources.rien")}</p>`}
      </div>

      <div class="bloc">
        <h4>${t("ressources.ajouter")}</h4>
        <div class="res-choix">${dispo.map(([k, r]) =>
          `<button data-add="${k}"><span class="rc-emoji">${r.emoji}</span>${r.label}</button>`).join("")
          || `<p style="margin:0;font-size:14px;color:var(--texte-doux)">${t("ressources.toutajoute")}</p>`}</div>
      </div>
    </div>`;

  const modale = $("#modale");
  modale.querySelector(".fermer").addEventListener("click", fermerModale);
  if (modale._clicRot) modale.removeEventListener("click", modale._clicRot);
  modale._clicRot = e => {
    const add = e.target.closest("[data-add]"), sup = e.target.closest("[data-suppr]");
    if (add) { basculerRessource(add.dataset.add); ouvrirModaleRessources(); rendre(); }
    if (sup) { basculerRessource(sup.dataset.suppr); ouvrirModaleRessources(); rendre(); }
  };
  modale.addEventListener("click", modale._clicRot);
  $("#overlay").classList.add("ouvert");
  document.body.style.overflow = "hidden";
}

// ---------- Prochaines étapes au potager ----------
function rendreEtapes() {
  const section = $("#section-etapes");
  if (!section) return;
  const liste = prochainesEtapes();
  section.hidden = liste.length === 0;
  const compteur = $("#etapes-count");
  if (compteur) compteur.textContent = liste.length;
  const conteneur = $("#liste-etapes");
  if (!conteneur) return;
  conteneur.replaceChildren();
  liste.slice(0, 10).forEach(({ plante, emoji, label, date }) => {
    const ligne = el("button", "etape-ligne");
    ligne.innerHTML = `
      <span class="etape-date">${fmtDateCourte(date)}</span>
      <span class="etape-plante">${echapperHTML(plante.emoji)} ${echapperHTML(plante.nom)}</span>
      <span class="etape-label">${emoji} ${echapperHTML(label)}</span>
      <span class="lg-chevron">›</span>`;
    ligne.addEventListener("click", () => ouvrirModale(plante));
    conteneur.appendChild(ligne);
  });

  // Rappels proactifs : utilise ce que tu possèdes, au bon moment.
  const sugg = suggestionsRessources();
  if (sugg.length) section.hidden = false;
  if (compteur) compteur.textContent = liste.length + sugg.length;
  sugg.forEach(s => {
    const cibles = s.concernees.length
      ? t("ressource.pourliste", { liste: s.concernees.map(p => echapperHTML(txt(p.nom))).join(", ") })
      : "";
    const ligne = el("button", "etape-ligne etape-ressource");
    ligne.innerHTML = `
      <span class="etape-date">${t("etapes.cemois")}</span>
      <span class="etape-plante">${s.emoji} ${echapperHTML(s.label)}</span>
      <span class="etape-label">💡 ${echapperHTML(s.quand)}${cibles}</span>
      <span class="lg-chevron">›</span>`;
    ligne.addEventListener("click", () => ouvrirModaleRessource(s.cle));
    conteneur.appendChild(ligne);
  });
}

// Détail d'une ressource : quand et comment l'utiliser, sur quelles plantes.
function ouvrirModaleRessource(cle) {
  const r = RESSOURCES_CATALOGUE[cle];
  if (!r) return;
  const concernees = PLANTES.filter(p => { try { return r.cible(p); } catch (e) { return false; } });
  const miennes = concernees.filter(p => estAdoptee(p.id));
  const mois = r.mois.map(m => moisNom(m)).join(", ");

  $("#modale").innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="modale-img" style="background:linear-gradient(135deg,#e8dcc0,#c9ad78)">
      <span class="emoji">${r.emoji}</span>
    </div>
    <div class="modale-corps">
      <h2>${echapperHTML(r.label)}</h2>
      <p class="latin">${t("ressource.detail.souscat", { quand: echapperHTML(r.quand) })}</p>
      <p class="long">${echapperHTML(r.conseil)}</p>
      <div class="bloc">
        <h4>${t("ressource.periode")}</h4>
        <p style="margin:0">${mois}</p>
      </div>
      <div class="bloc">
        <h4>${t("ressource.surquoi")}</h4>
        <p style="margin:0">${miennes.length
          ? t("ressource.tonpotager", { liste: miennes.map(p => `${p.emoji} ${echapperHTML(txt(p.nom))}`).join(", ") })
          : t("ressource.aucune")}</p>
        <p style="margin:8px 0 0;font-size:13.5px;color:var(--texte-doux)">
          ${t("ressource.adapteesgeneral", {
            liste: concernees.slice(0, 10).map(p => echapperHTML(txt(p.nom))).join(", "),
            suite: concernees.length > 10 ? "…" : "",
          })}</p>
      </div>
    </div>`;
  $("#modale").querySelector(".fermer").addEventListener("click", fermerModale);
  $("#overlay").classList.add("ouvert");
  document.body.style.overflow = "hidden";
}

// ---------- Repli du bandeau ----------
function majResume() {
  const z = ZONES[state.zone];
  const fmt = dateDuJour().toLocaleDateString(localeCourante(), { day: "numeric", month: "long" });
  const items = [`<span class="bc-item">${z.emoji} ${z.label}</span>`];
  if (state.surface) items.push(`<span class="bc-item">📐 ${state.surface} m²</span>`);
  items.push(`<span class="bc-item">📅 ${fmt}</span>`);
  items.push(`<span class="bc-item">🌱 ${state._nowCount || 0} ${getLang() === "en" ? "to plant" : "à planter"}</span>`);
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
      else majZone(state.zone, t("ville.introuvable2", { v: q }));
    }
  }
  sauverPreferencesJardin();
  replier();
}

function setVue(v) {
  state.vue = v;
  $("#vue-liste").classList.toggle("actif", v === "liste");
  $("#vue-cartes").classList.toggle("actif", v === "cartes");
  sauverPreferencesJardin();
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
  sauverPreferencesJardin();
  rendre();
}

// ---------- Langue : sélecteur + traduction du texte statique ----------
function construireSelecteurLangue() {
  const zone = $("#lang-switch");
  if (!zone) return;
  zone.innerHTML = "";
  [["fr", "FR"], ["en", "EN"]].forEach(([code, libelle]) => {
    const b = el("button", getLang() === code ? "actif" : "", libelle);
    b.type = "button";
    b.setAttribute("aria-pressed", String(getLang() === code));
    b.title = t(code === "fr" ? "lang.fr" : "lang.en");
    b.addEventListener("click", () => setLang(code));
    zone.appendChild(b);
  });
}

// Traduit tout le texte statique de index.html (hors contenu géré par rendre()).
function traduireStatique() {
  document.documentElement.lang = getLang();
  const titre = $("#page-title"); if (titre) titre.textContent = t("page.title");
  const desc = $("#page-description"); if (desc) desc.setAttribute("content", t("page.description"));
  document.title = t("page.title");

  const set = (sel, html) => { const e = $(sel); if (e) e.innerHTML = html; };
  const attr = (sel, name, val) => { const e = $(sel); if (e) e.setAttribute(name, val); };

  set("#hero-titre", t("hero.titre"));
  set("#hero-intro", t("hero.intro"));
  set("#footer-marque", t("footer.marque"));
  set("#footer-note", t("footer.note"));
  set("#footer-credit", t("footer.credit"));
  set("#label-ville", t("champ.ville.label"));
  set("#label-surface", t("champ.surface.label"));
  set("#label-zone", t("champ.zone.label"));
  set("#plan-titre", t("plan.titre"));
  set("#plan-aide", t("plan.aide"));
  set("#etapes-titre", t("etapes.titre"));
  set("#etapes-sous", t("etapes.sous"));
  set("#now-titre", t("now.titre"));
  set("#soon-titre", t("soon.titre"));
  set("#autres-titre", t("autres.titre"));
  set("#autres-sous", t("autres.sous.defaut"));
  set("#vide", t("vide.defaut"));
  set("#btn-modifier", t("bc.modifier"));
  set("#btn-geo", t("btn.geo"));
  attr("#btn-geo", "title", t("btn.geo.title"));
  set("#btn-go", t("btn.go"));
  set("#zone-note", t("zone.note.defaut"));
  set("#btn-ajouter", t("btn.ajouter"));
  set("#btn-ressources", t("btn.ressources"));
  set("#btn-photo", t("btn.photo"));
  set("#btn-identifier", t("btn.identifier"));
  set("#btn-plan", t("btn.plan"));
  attr("#vue-liste", "title", t("vue.liste.title"));
  attr("#vue-cartes", "title", t("vue.cartes.title"));
  attr("#vue-toggle", "aria-label", t("affichage.label"));
  attr("#filtres", "aria-label", t("filtres.aria"));
  attr("#bandeau-lune", "title", t("lune.bandeau.title"));
  attr("#surface", "placeholder", t("champ.surface.placeholder"));
  attr("#ville", "placeholder", t("champ.ville.placeholder"));
  attr("#recherche", "placeholder", t("recherche.placeholder"));
  attr("#plan-taille-jardin-btn", "data-noop", "");
  const btnTaille = $("#btn-taille-jardin"); if (btnTaille) btnTaille.textContent = t("plan.taille.btn");
  majMonPotager();
}

// ---------- Init ----------
function init() {
  traduireStatique();
  construireSelecteurLangue();

  // Peupler le select des zones
  const sel = $("#zone");
  Object.entries(ZONES).forEach(([k, z]) => {
    const o = el("option"); o.value = k; o.textContent = `${z.emoji} ${z.label}`;
    sel.appendChild(o);
  });
  chargerPreferencesJardin();
  sel.value = state.zone;
  $("#vue-liste").classList.toggle("actif", state.vue === "liste");
  $("#vue-cartes").classList.toggle("actif", state.vue === "cartes");

  sel.addEventListener("change", () => majZone(sel.value, getLang() === "en" ? "Manual choice" : "Choix manuel"));

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
    sauverPreferencesJardin();
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
  chargerDates();
  chargerCachePhotos();
  chargerPlantesPerso();
  $("#btn-ajouter").addEventListener("click", () => ouvrirFormAjout(""));
  $("#btn-ressources").addEventListener("click", ouvrirModaleRessources);
  $("#btn-photo").addEventListener("click", () => $("#input-photo").click());
  $("#btn-identifier").addEventListener("click", () => $("#input-identifier").click());
  $("#input-identifier").addEventListener("change", e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";                       // permet de reprendre la même photo
    if (f) traiterPhotoIdentification(f);
  });
  $("#input-photo").addEventListener("change", e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";                       // permet de reprendre la même photo
    if (f) traiterPhotoSachet(f);
  });
  chargerSachets().then(rendre);               // vignettes en mémoire, puis re-rendu
  $("#btn-plan").addEventListener("click", basculerPlan);
  chargerJardin();
  installerDessinPlan();
  $("#btn-taille-jardin").addEventListener("click", ouvrirModaleTailleJardin);
  $("#bandeau-lune").addEventListener("click", ouvrirModaleLune);
  chargerRessources();

  $("#overlay").addEventListener("click", e => { if (e.target.id === "overlay") fermerModale(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") fermerModale(); });

  majZone(state.zone, null);
  completerPhotosManquantes();   // non bloquant : la tuile emoji reste le repli

  // Préférences déjà connues (visite précédente) : afficher directement le résumé replié.
  if (state._prefsConnues) {
    const ville = $("#ville").value.trim();
    if (ville) {
      const z = zoneDepuisVille(ville);
      if (z) majZone(z, `📍 ${ville}`);
    }
    replier();
  }
}

function appliquerVille() {
  const v = $("#ville").value;
  if (!v.trim()) return;
  const z = zoneDepuisVille(v);
  if (z) majZone(z, `📍 ${v.trim()}`);
  else majZone(state.zone, t("ville.introuvable", { v: v.trim() }));
}

function localiser() {
  const note = $("#zone-note");
  if (!navigator.geolocation) { note.textContent = t("geo.indisponible"); return; }
  note.textContent = t("geo.encours");
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude, longitude } = pos.coords;
      let z = zoneDepuisCoords(latitude, longitude);
      majZone(z, t("geo.positiondetectee"));
      note.textContent = t("geo.recherchecommune");
      const v = await reverseVille(latitude, longitude);
      let source = t("geo.positiondetectee");
      if (v) {
        $("#ville").value = v.nom;                 // on remplit la préférence "ville"
        state.villeCoords = { lat: v.lat, lng: v.lng };
        z = zoneDepuisVille(v.nom) || z;           // affine si commune connue du dico
        source = `📡 ${v.nom}${v.cp ? " (" + v.cp + ")" : ""}`;
        majZone(z, source);
        sauverPreferencesJardin();
      }
      replier();
      // Ici l'altitude est celle du GPS : c'est le cas le plus fiable, on l'utilise.
      appliquerAltitude(latitude, longitude, z, source);
    },
    () => { note.textContent = t("geo.refusee"); },
    { timeout: 8000, maximumAge: 600000 }
  );
}

document.addEventListener("DOMContentLoaded", init);

/* =========================================================================
   Sachets de graines : photo → fiche + archive
   Le sachet sert de guide (variété, dates, conseils du semencier) et
   d'archive (ce que j'ai acheté, quand). La photo du légume imprimée sur le
   sachet sert aussi d'illustration quand la plante n'en a pas.
   ========================================================================= */

// Vignettes des sachets d'une plante, pour la fiche.
function blocSachetsHTML(plante) {
  const liste = typeof sachetsDe === "function" ? sachetsDe(plante.id) : [];
  if (!liste.length) {
    return `<p style="margin:0;font-size:14px;color:var(--texte-doux)">${t("sachet.aucun")}</p>`;
  }
  return `<div class="sachets-grille">${liste.map(s => `
    <button class="sachet-vignette" data-sachet="${echapperHTML(s.id)}"
            title="${echapperHTML(s.meta.variete || txt(plante.nom))}">
      <img src="${s.thumb}" alt="${t("sachet.alt", { nom: echapperHTML(txt(plante.nom)) })}" />
      <span class="sv-date">${echapperHTML(s.meta.variete || fmtDateCourte(new Date(s.meta.ajoute)))}</span>
    </button>`).join("")}</div>`;
}

// Consultation plein écran d'un sachet + suppression.
async function ouvrirSachet(id) {
  const s = await lireSachetComplet(id);
  if (!s) return;
  const plante = PLANTES.find(p => p.id === s.plantId);
  const m = s.meta || {};
  const ligne = (k, v) => v ? `<span class="k">${k}</span><span class="v">${echapperHTML(v)}</span>` : "";

  $("#modale").innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="form-ajout">
      <h2>🌾 ${echapperHTML(m.variete || (plante ? txt(plante.nom) : t("sachet.titredefaut")))}</h2>
      <p class="sous">${plante ? echapperHTML(txt(plante.nom)) : ""} · ${t("sachet.archivele")}
        ${echapperHTML(fmtDateCourte(new Date(m.ajoute)))}</p>
      <img class="sachet-plein" src="${s.full}" alt="${t("sachet.titredefaut")}" />
      ${(m.semencier || m.annee || m.notes) ? `<div class="bloc"><h4>${t("sachet.infos")}</h4>
        <div class="fiche">${ligne(t("sachet.semencier"), m.semencier)}${ligne(t("sachet.anneedluo"), m.annee)}</div>
        ${m.notes ? `<p style="margin:8px 0 0;font-size:14px">${echapperHTML(m.notes)}</p>` : ""}
      </div>` : ""}
      <div class="form-actions">
        <button class="btn secondaire" id="s-retour">${t("sachet.retour")}</button>
        <button class="btn-danger" id="s-suppr">${t("sachet.supprimer")}</button>
      </div>
    </div>`;

  const retour = () => { if (plante) ouvrirModale(plante); else fermerModale(); };
  $("#modale").querySelector(".fermer").addEventListener("click", fermerModale);
  $("#s-retour").addEventListener("click", retour);
  $("#s-suppr").addEventListener("click", async () => {
    await supprimerSachet(id, s.plantId);
    rendre(); retour();
  });
}

// Étape 1 : l'utilisateur vient de prendre la photo → à quelle plante la rattacher ?
async function traiterPhotoSachet(fichier) {
  ouvrirAttente(t("sachet.traitement"));
  let photo;
  try {
    photo = await preparerPhoto(fichier);
  } catch (e) {
    ouvrirMessage(t("sachet.illisible.titre"), t("sachet.illisible.msg"));
    return;
  }
  state._photoEnCours = photo;
  ecranAssociation("");
}

// Écran de rattachement : préviens, cherche la plante, ou crée une fiche.
function ecranAssociation(filtre) {
  const photo = state._photoEnCours;
  if (!photo) return;
  const q = normaliseVille(filtre || "");
  const candidats = (q
    ? PLANTES.filter(p => normaliseVille(txt(p.nom) + " " + p.latin
        + (typeof p.nom === "object" && p.nom && "en" in p.nom ? " " + p.nom.en : "")).includes(q))
    : PLANTES.filter(p => estAdoptee(p.id) || (state._statut && state._statut(p) === "now"))
  ).slice(0, 12);

  $("#modale").innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="form-ajout">
      <h2>${t("sachet.photographie")}</h2>
      <p class="sous">${t("sachet.rattacher")}</p>
      <img class="photo-preview" src="${photo.thumb}" alt="${t("sachet.apercu")}" />

      <div class="fgrid" style="margin-top:14px">
        <div class="fchamp full">
          <label for="s-recherche">${t("sachet.quelleplante")}</label>
          <input id="s-recherche" type="text" value="${echapperHTML(filtre || "")}"
                 placeholder="${t("sachet.tapelenom")}" autocomplete="off" />
        </div>
      </div>
      <div class="assoc-liste">
        ${candidats.map(p => `
          <button class="assoc-item" data-plante="${echapperHTML(p.id)}">
            <span class="ai-emoji">${p.emoji}</span>
            <span class="ai-nom">${echapperHTML(txt(p.nom))}</span>
            <span class="ai-cat">${CATEGORIES[p.cat].label}</span>
          </button>`).join("")
        || `<p style="margin:0;font-size:14px;color:var(--texte-doux)">${t("sachet.aucuneconnue")}</p>`}
        <button class="assoc-item assoc-nouvelle" id="s-nouvelle">
          ${filtre ? t("sachet.creerfichepour", { filtre: echapperHTML(filtre) }) : t("sachet.creerfiche")}</button>
      </div>
    </div>`;

  $("#modale").querySelector(".fermer").addEventListener("click", fermerModale);
  const champ = $("#s-recherche");
  let tmr = null;
  champ.addEventListener("input", () => {
    clearTimeout(tmr);
    const v = champ.value;
    tmr = setTimeout(() => {
      const pos = champ.selectionStart;
      ecranAssociation(v);
      const nouveau = $("#s-recherche");
      if (nouveau) { nouveau.focus(); nouveau.setSelectionRange(pos, pos); }
    }, 250);
  });
  const modaleAssoc = $("#modale");
  if (modaleAssoc._clicRot) modaleAssoc.removeEventListener("click", modaleAssoc._clicRot);
  modaleAssoc._clicRot = e => {
    const b = e.target.closest("[data-plante]");
    if (b) ecranDetailsSachet(PLANTES.find(p => p.id === b.dataset.plante));
  };
  modaleAssoc.addEventListener("click", modaleAssoc._clicRot);
  $("#s-nouvelle").addEventListener("click", () => {
    // La photo reste en attente : elle sera rattachée à la plante créée.
    state._photoPourNouvelle = true;
    ouvrirFormAjout(champ.value.trim());
  });
  $("#overlay").classList.add("ouvert");
  document.body.style.overflow = "hidden";
}

// Étape 2 : compléter ce qui est écrit sur le sachet, puis archiver.
function ecranDetailsSachet(plante) {
  if (!plante || !state._photoEnCours) return;
  const photo = state._photoEnCours;
  const sansPhoto = !photoPlante(plante);

  $("#modale").innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="form-ajout">
      <h2>${plante.emoji} ${echapperHTML(txt(plante.nom))}</h2>
      <p class="sous">${t("sachet.recopie")}</p>
      <img class="photo-preview" src="${photo.thumb}" alt="${t("sachet.apercu")}" />
      <div class="fgrid" style="margin-top:14px">
        <div class="fchamp"><label for="s-variete">${t("sachet.variete")}</label>
          <input id="s-variete" placeholder="${t("sachet.variete.placeholder")}" /></div>
        <div class="fchamp"><label for="s-semencier">${t("sachet.semencier")}</label>
          <input id="s-semencier" placeholder="${t("sachet.semencier.placeholder")}" /></div>
        <div class="fchamp full"><label for="s-annee">${t("sachet.datelimite")}</label>
          <input id="s-annee" placeholder="${t("sachet.datelimite.placeholder")}" /></div>
        <div class="fchamp full"><label for="s-notes">${t("sachet.notes")}</label>
          <textarea id="s-notes" placeholder="${t("sachet.notes.placeholder")}"></textarea></div>
        ${sansPhoto ? `<div class="fchamp inline full">
          <input id="s-illustrer" type="checkbox" checked />
          <label for="s-illustrer">${t("sachet.illustrer")}</label>
        </div>` : ""}
      </div>
      <div class="form-actions">
        <button class="btn secondaire" id="s-retour">${t("sachet.changerplante")}</button>
        <button class="btn" id="s-archiver">${t("sachet.archiver")}</button>
      </div>
    </div>`;

  $("#modale").querySelector(".fermer").addEventListener("click", fermerModale);
  $("#s-retour").addEventListener("click", () => ecranAssociation(""));
  $("#s-archiver").addEventListener("click", () => archiverSachet(plante));
}

async function archiverSachet(plante) {
  const photo = state._photoEnCours;
  if (!photo) return;
  const val = id => { const e = $("#" + id); return e ? e.value.trim() : ""; };
  const illustrer = $("#s-illustrer") ? $("#s-illustrer").checked : false;

  const sachet = {
    id: `s-${plante.id}-${Date.now().toString(36)}`,
    plantId: plante.id,
    full: photo.full,
    thumb: photo.thumb,
    meta: {
      variete: val("s-variete"), semencier: val("s-semencier"),
      annee: val("s-annee"), notes: val("s-notes"),
      ajoute: new Date().toISOString(),
      illustre: illustrer,
    },
  };
  try {
    await enregistrerSachet(sachet);
  } catch (e) {
    ouvrirMessage(t("sachet.archimpossible.titre"), t("sachet.archimpossible.msg"));
    return;
  }
  state._photoEnCours = null;
  rendre();
  // Sachet en main mais culture pas encore lancée : proposer d'enregistrer le semis.
  if (!estAdoptee(plante.id)) demanderSiPlantee(plante, "sachet");
  else ouvrirModale(plante);
}

// Petites modales utilitaires (attente / message)
function ouvrirAttente(texte) {
  $("#modale").innerHTML = `<div class="form-ajout"><h2>⏳ ${echapperHTML(texte)}</h2>
    <p class="sous">${t("sachet.uninstant")}</p></div>`;
  $("#overlay").classList.add("ouvert");
  document.body.style.overflow = "hidden";
}
function ouvrirMessage(titre, texte) {
  $("#modale").innerHTML = `<button class="fermer" aria-label="Fermer">×</button>
    <div class="form-ajout"><h2>${echapperHTML(titre)}</h2>
    <p class="sous">${echapperHTML(texte)}</p>
    <div class="form-actions"><button class="btn" id="msg-ok">${t("msg.fermer")}</button></div></div>`;
  $("#modale").querySelector(".fermer").addEventListener("click", fermerModale);
  $("#msg-ok").addEventListener("click", fermerModale);
  $("#overlay").classList.add("ouvert");
  document.body.style.overflow = "hidden";
}

/* =========================================================================
   Plan du jardin : dessin des planches, culture, récolte et rotation
   ========================================================================= */

const TAILLE_CASE_PX = 26;          // rendu d'une maille de 0,5 m

function fmtM2(m2) {
  return `${m2.toLocaleString(localeCourante(), { maximumFractionDigits: 2 })} m²`;
}

function basculerPlan() {
  const s = $("#section-plan");
  const ouvert = s.hidden;
  s.hidden = !ouvert;
  $("#btn-plan").classList.toggle("actif", ouvert);
  if (ouvert) { rendrePlan(); s.scrollIntoView({ behavior: "smooth", block: "start" }); }
}

function rendrePlan() {
  const g = $("#plan-grille");
  if (!g) return;
  g.style.setProperty("--maille", TAILLE_CASE_PX + "px");
  g.style.width = jardin.cols * TAILLE_CASE_PX + "px";
  g.style.height = jardin.lignes * TAILLE_CASE_PX + "px";
  g.replaceChildren();

  jardin.planches.forEach(p => g.appendChild(elementPlanche(p)));

  const surf = surfaceTotale();
  $("#plan-surface").textContent = fmtM2(surf);
  $("#plan-legende").innerHTML = `
    <span><i class="lg-vide"></i> ${t("plan.legende.libre")}</span>
    <span><i class="lg-cult"></i> ${t("plan.legende.culture")}</span>
    <span><i class="lg-reco"></i> ${t("plan.legende.recolte")}</span>
    <span>${t("plan.legende.echelle")}</span>`;

  // Le plan sert aussi de source pour la surface cultivable
  if (surf > 0 && !state.surface) {
    state.surface = Math.round(surf);
    const champ = $("#surface"); if (champ) champ.value = state.surface;
  }
}

function elementPlanche(p) {
  const plante = p.plantId ? PLANTES.find(x => x.id === p.plantId) : null;
  const d = el("div", "planche" + (plante ? "" : " vide"));
  d.style.left = p.x * TAILLE_CASE_PX + "px";
  d.style.top = p.y * TAILLE_CASE_PX + "px";
  d.style.width = p.w * TAILLE_CASE_PX - 2 + "px";
  d.style.height = p.h * TAILLE_CASE_PX - 2 + "px";
  d.dataset.planche = p.id;

  const petite = p.w * p.h <= 2;
  if (plante) {
    const enRecolte = recolteCommencee(p, plante);
    if (enRecolte) d.classList.add("recolte");
    d.innerHTML = `<span class="pl-emoji">${plante.emoji}</span>
      ${petite ? "" : `<span>${echapperHTML(plante.nom)}</span>`}
      <span class="pl-surface">${fmtM2(surfacePlanche(p))}</span>
      ${enRecolte ? `<span class="pl-alerte" title="${t("planche.recolteencours")}">🧺</span>` : ""}`;
  } else {
    d.innerHTML = `<span class="pl-emoji">＋</span>
      <span class="pl-surface">${fmtM2(surfacePlanche(p))}</span>`;
  }
  return d;
}

// La récolte a-t-elle commencé pour cette planche ? (déclenche la proposition de rotation)
function recolteCommencee(planche, plante) {
  if (!plante || !planche.dateSemis) return false;
  const etapes = typeof etapesCulture === "function" ? etapesCulture(plante, planche.dateSemis) : [];
  const recolte = etapes.find(e => e.cle === "recolte" && e.date);
  return Boolean(recolte && recolte.date <= dateDuJour());
}

/* ---------- Modale : changer la taille du jardin (largeur × longueur) ---------- */
function ouvrirModaleTailleJardin() {
  const modale = $("#modale");
  const largeurActuelle = jardin.cols * MAILLE_M;
  const longueurActuelle = jardin.lignes * MAILLE_M;
  modale.innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="form-ajout">
      <h2>${t("plan.taillejardin.titre")}</h2>
      <p class="sous">${t("plan.taillejardin.sous", { pas: MAILLE_M })}</p>
      <div class="fgrid">
        <div class="fchamp"><label>${t("plan.largeur")}</label>
          <input id="tj-largeur" type="number" min="${MAILLE_M}" step="${MAILLE_M}" value="${largeurActuelle}" /></div>
        <div class="fchamp"><label>${t("plan.longueur")}</label>
          <input id="tj-longueur" type="number" min="${MAILLE_M}" step="${MAILLE_M}" value="${longueurActuelle}" /></div>
      </div>
      <div class="form-erreur" id="tj-erreur" role="alert" hidden></div>
      <div class="form-actions">
        <button class="btn secondaire" id="tj-annuler">${t("form.annuler")}</button>
        <button class="btn" id="tj-appliquer">${t("plan.appliquer")}</button>
      </div>
    </div>`;

  modale.querySelector(".fermer").addEventListener("click", fermerModale);
  $("#tj-annuler").addEventListener("click", fermerModale);
  $("#tj-appliquer").addEventListener("click", () => {
    const largeur = parseFloat($("#tj-largeur").value);
    const longueur = parseFloat($("#tj-longueur").value);
    const erreur = $("#tj-erreur");
    const resultat = redimensionnerJardin(largeur / MAILLE_M, longueur / MAILLE_M);
    if (!resultat.ok) {
      erreur.textContent = resultat.motif;
      erreur.hidden = false;
      return;
    }
    fermerModale();
    rendrePlan();
  });

  $("#overlay").classList.add("ouvert");
  document.body.style.overflow = "hidden";
}

/* ---------- Dessin : le doigt dessine, puis une validation explicite crée la planche ---------- */
function installerDessinPlan() {
  const g = $("#plan-grille");
  if (!g) return;
  let depart = null, apercu = null, actions = null, rectAttente = null;

  const caseDepuisEvent = e => {
    const r = g.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(jardin.cols - 1, Math.floor((e.clientX - r.left) / TAILLE_CASE_PX))),
      y: Math.max(0, Math.min(jardin.lignes - 1, Math.floor((e.clientY - r.top) / TAILLE_CASE_PX))),
    };
  };
  const rectEntre = (a, b) => ({
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1,
  });

  function retirerApercu() {
    if (apercu) { apercu.remove(); apercu = null; }
    if (actions) { actions.remove(); actions = null; }
    rectAttente = null;
  }

  function majApercu(r) {
    if (!apercu) return;
    apercu.style.left = r.x * TAILLE_CASE_PX + "px";
    apercu.style.top = r.y * TAILLE_CASE_PX + "px";
    apercu.style.width = r.w * TAILLE_CASE_PX + "px";
    apercu.style.height = r.h * TAILLE_CASE_PX + "px";
    apercu.textContent = fmtM2(r.w * r.h * M2_PAR_CASE);
    apercu.style.borderColor = placeLibre(r) ? "" : "#c0392b";
  }

  // Affiche le rectangle dessiné avec deux boutons ✓ / ✕ : rien n'est créé
  // tant que l'utilisateur n'a pas explicitement validé.
  function proposerValidation(r) {
    rectAttente = r;
    majApercu(r);
    apercu.classList.add("en-attente");

    actions = el("div", "plan-valider-actions");
    actions.innerHTML = `
      <button type="button" class="annuler" aria-label="${t("plan.anneuler")}">✕</button>
      <button type="button" class="valider" aria-label="${t("plan.valider")}">✓</button>`;
    g.appendChild(actions);

    const largeur = 2 * 44 + 8;
    let left = r.x * TAILLE_CASE_PX;
    left = Math.max(0, Math.min(left, jardin.cols * TAILLE_CASE_PX - largeur));
    const dessousOk = (r.y + r.h) * TAILLE_CASE_PX + 52 <= jardin.lignes * TAILLE_CASE_PX;
    const top = dessousOk ? (r.y + r.h) * TAILLE_CASE_PX + 6 : Math.max(0, r.y * TAILLE_CASE_PX - 52);
    actions.style.left = left + "px";
    actions.style.top = top + "px";

    actions.querySelector(".annuler").addEventListener("click", () => retirerApercu());
    actions.querySelector(".valider").addEventListener("click", () => {
      if (!placeLibre(rectAttente)) {
        ouvrirMessage(t("plan.occupe.titre"), t("plan.occupe.msg"));
        return;
      }
      const nouvelle = creerPlanche(rectAttente.x, rectAttente.y, rectAttente.w, rectAttente.h);
      retirerApercu();
      rendrePlan();
      if (nouvelle) ouvrirModalePlanche(nouvelle.id);
    });
  }

  g.addEventListener("pointerdown", e => {
    if (rectAttente) return;                       // une planche attend déjà d'être validée
    const surPlanche = e.target.closest("[data-planche]");
    if (surPlanche) return;                       // clic sur une planche : géré ailleurs
    depart = caseDepuisEvent(e);
    g.setPointerCapture(e.pointerId);
    apercu = el("div", "plan-apercu");
    g.appendChild(apercu);
    majApercu(rectEntre(depart, depart));
  });

  g.addEventListener("pointermove", e => {
    if (!depart) return;
    majApercu(rectEntre(depart, caseDepuisEvent(e)));
  });

  const terminer = e => {
    if (!depart) return;
    const fin = caseDepuisEvent(e);
    let r = rectEntre(depart, fin);
    // Doigt levé sans avoir bougé (tap simple) → planche d'1 m² (2 × 2 mailles)
    if (r.w === 1 && r.h === 1) {
      const carre = { x: Math.min(r.x, jardin.cols - 2), y: Math.min(r.y, jardin.lignes - 2), w: 2, h: 2 };
      if (placeLibre(carre)) r = carre;
    }
    depart = null;
    proposerValidation(r);
  };
  g.addEventListener("pointerup", terminer);
  g.addEventListener("pointercancel", () => {
    if (apercu && !rectAttente) { apercu.remove(); apercu = null; }
    depart = null;
  });

  // Clic sur une planche existante
  g.addEventListener("click", e => {
    if (e.target.closest(".plan-valider-actions")) return;
    const b = e.target.closest("[data-planche]");
    if (b) ouvrirModalePlanche(b.dataset.planche);
  });
}

/* ---------- Modale d'une planche ---------- */
function ouvrirModalePlanche(id) {
  const p = jardin.planches.find(x => x.id === id);
  if (!p) return;
  const plante = p.plantId ? PLANTES.find(x => x.id === p.plantId) : null;
  const hist = (p.historique || []).slice(-4).reverse();

  const histHTML = hist.length
    ? `<ul class="conseils">${hist.map(h => {
        const pl = PLANTES.find(x => x.id === h.plantId);
        return `<li>${h.annee} — ${echapperHTML(pl ? txt(pl.nom) : h.plantId)}
          <span style="color:var(--texte-doux)">(${echapperHTML(h.famille || t("planche.inconnue"))})</span></li>`;
      }).join("")}</ul>`
    : `<p style="margin:0;font-size:14px;color:var(--texte-doux)">${t("planche.aucunhistorique")}</p>`;

  $("#modale").innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="form-ajout">
      <h2>${plante ? plante.emoji + " " + echapperHTML(txt(plante.nom)) : t("planche.libre")}</h2>
      <p class="sous">${fmtM2(surfacePlanche(p))} · ${p.w * MAILLE_M} × ${p.h * MAILLE_M} m</p>

      ${plante ? `<div class="bloc">
        <h4>${t("planche.cultureenplace")}</h4>
        <p style="margin:0">${t("planche.semeele")}
          <strong>${p.dateSemis ? echapperHTML(fmtDateCourte(new Date(p.dateSemis))) : "—"}</strong>.</p>
        <p style="margin:6px 0 0;font-size:13.5px;color:var(--texte-doux)">
          ${t("planche.famille", { famille: echapperHTML(plante.famille || t("planche.inconnue")) })}
          ${LIBELLE_ROTATION[typeRotation(plante)].emoji} ${LIBELLE_ROTATION[typeRotation(plante)].label}</p>
        <div class="form-actions">
          <button class="btn" id="pl-recolte">${t("planche.recolteterminee")}</button>
        </div>
      </div>` : `<div class="bloc">
        <h4>${t("planche.quecultiver")}</h4>
        ${blocRotationHTML(p)}
      </div>`}

      <div class="bloc">
        <h4>${t("planche.historique")}</h4>
        ${histHTML}
      </div>

      <div class="form-actions">
        <button class="btn secondaire" id="pl-fermer">${t("planche.fermer")}</button>
        <button class="btn-danger" id="pl-suppr">${t("planche.supprimer")}</button>
      </div>
    </div>`;

  const modale = $("#modale");
  modale.querySelector(".fermer").addEventListener("click", fermerModale);
  $("#pl-fermer").addEventListener("click", fermerModale);
  $("#pl-suppr").addEventListener("click", () => {
    supprimerPlanche(p.id); rendrePlan(); fermerModale();
  });
  const btnRec = $("#pl-recolte");
  if (btnRec) btnRec.addEventListener("click", () => {
    recolterPlanche(p, PLANTES);
    rendrePlan();
    ouvrirModalePlanche(p.id);        // enchaîne sur les suggestions de rotation
  });
  if (modale._clicRot) modale.removeEventListener("click", modale._clicRot);
  modale._clicRot = e => {
    const b = e.target.closest("[data-rot]");
    if (!b) return;
    planterDans(p, b.dataset.rot, dateDuJour().toISOString().slice(0, 10));
    const pl = PLANTES.find(x => x.id === b.dataset.rot);
    if (pl && !estAdoptee(pl.id)) { state.adoptees.add(pl.id); sauverAdoptees(); }
    if (pl) { state.dates[pl.id] = dateDuJour().toISOString().slice(0, 10); sauverDates(); }
    rendrePlan(); rendre(); ouvrirModalePlanche(p.id);
  };
  modale.addEventListener("click", modale._clicRot);

  $("#overlay").classList.add("ouvert");
  document.body.style.overflow = "hidden";
}

// Suggestions de rotation pour une planche libre
function blocRotationHTML(p) {
  const estPlantable = pl => state._statut && state._statut(pl) === "now";
  const r = suggestionsRotation(p, PLANTES.filter(pl => adapteeZone(pl, state.zone)),
    { anneeCourante: dateDuJour().getFullYear(), estPlantable });

  const cycle = CYCLE_ROTATION.map(typ =>
    `<span class="rc-etape ${typ === r.typeSuivant ? "actif" : ""}">${LIBELLE_ROTATION[typ].emoji} ${LIBELLE_ROTATION[typ].label}</span>`
  ).join(" → ");

  const intro = r.dernier
    ? t("rotation.apres", {
        precedent: echapperHTML(txt((PLANTES.find(x => x.id === r.dernier.plantId) || {}).nom) || t("rotation.precedentedefaut")),
        suivant: LIBELLE_ROTATION[r.typeSuivant].label,
      })
    : t("rotation.neuve");

  const liste = r.suggestions.map(s => `
    <button class="rot-item" data-rot="${echapperHTML(s.plante.id)}">
      <span style="font-size:20px">${s.plante.emoji}</span>
      <span class="ri-nom">${echapperHTML(txt(s.plante.nom))}
        <span class="ri-pourquoi">${echapperHTML(s.raisons.join(" · ") || t("rotation.compatible"))}</span></span>
      <span class="lg-chevron">›</span>
    </button>`).join("");

  const exclus = r.exclus.length
    ? `<p style="margin:10px 0 4px;font-size:12.5px;font-weight:700;color:var(--texte-doux)">${t("rotation.aeviter")}</p>`
      + r.exclus.slice(0, 3).map(e =>
        `<div class="rot-exclu">🚫 ${echapperHTML(txt(e.plante.nom))} — ${echapperHTML(e.motif)}</div>`).join("")
    : "";

  return `<p style="margin:0 0 8px;font-size:14px">${intro}</p>
    <div class="rot-cycle">${cycle}</div>
    ${liste || `<p style="margin:0;font-size:14px;color:var(--texte-doux)">${t("rotation.aucune")}</p>`}
    ${exclus}`;
}

/* =========================================================================
   Identification d'une plante par photo — Pl@ntNet via /api/identifier
   La clé d'API reste côté serveur (functions/api/identifier.js).
   La photo est ré-encodée dans le navigateur avant l'envoi : le passage par
   un canvas supprime les métadonnées EXIF, dont la position GPS.
   ========================================================================= */

const ORGANES_ID = ["auto", "leaf", "flower", "fruit", "bark"];
const SEUIL_CONFIANCE = 0.3;

// Nom scientifique normalisé : sans auteur, hybride (×) ni rang infraspécifique.
function normLatin(s) {
  return String(s || "").toLowerCase()
    .replace(/\s(var|subsp|ssp|cv)\.?\s.*$/, "")
    .replace(/×/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

// Plantes de la base qui correspondent à une espèce (sinon au genre seul,
// pour les fiches décrites au niveau du genre comme « Mentha »).
function plantesPourLatin(latin) {
  const [genre, espece] = normLatin(latin).split(" ");
  if (!genre) return [];
  const exactes = PLANTES.filter(p => {
    const [g, e] = normLatin(p.latin).split(" ");
    return g === genre && e && e === espece;
  });
  if (exactes.length) return exactes;
  return PLANTES.filter(p => {
    const parts = normLatin(p.latin).split(" ");
    return parts.length === 1 && parts[0] === genre;
  });
}

function afficherModale() {
  $("#overlay").classList.add("ouvert");
  document.body.style.overflow = "hidden";
}

async function traiterPhotoIdentification(fichier) {
  let dataUrl;
  try { dataUrl = await redimensionner(fichier, 1280, 0.85); }
  catch (e) { ouvrirMessage(t("id.err.titre"), t("id.err.photo")); return; }
  ecranOrganeIdentification(dataUrl);
}

function ecranOrganeIdentification(dataUrl) {
  let organe = "auto";
  $("#modale").innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="form-ajout">
      <h2>${t("id.titre")}</h2>
      <p class="sous">${t("id.sous")}</p>
      <img class="photo-preview" src="${dataUrl}" alt="" />
      <div class="id-organes">${ORGANES_ID.map(o =>
        `<button type="button" class="chip ${o === "auto" ? "actif" : ""}" data-organe="${o}">${t("id.organe." + o)}</button>`
      ).join("")}</div>
      <div class="form-actions">
        <button type="button" class="btn" id="id-lancer">${t("id.lancer")}</button>
      </div>
    </div>`;
  const modale = $("#modale");
  modale.querySelector(".fermer").addEventListener("click", fermerModale);
  const puces = modale.querySelectorAll("[data-organe]");
  puces.forEach(b => b.addEventListener("click", () => {
    organe = b.dataset.organe;
    puces.forEach(x => x.classList.toggle("actif", x === b));
  }));
  $("#id-lancer").addEventListener("click", () => lancerIdentification(dataUrl, organe));
  afficherModale();
}

async function lancerIdentification(dataUrl, organe) {
  ouvrirAttente(t("id.analyse"));
  let reponse, donnees;
  try {
    const fd = new FormData();
    fd.append("images", await (await fetch(dataUrl)).blob(), "plante.jpg");
    fd.append("organe", organe);
    fd.append("lang", getLang());
    reponse = await fetch("/api/identifier", {
      method: "POST", body: fd, signal: AbortSignal.timeout(35000),
    });
    donnees = await reponse.json();
  } catch (e) {
    ouvrirMessage(t("id.err.titre"), t("id.err.reseau"));
    return;
  }
  if (!reponse.ok) {
    const cles = {
      non_configure: "id.err.non_configure",
      trop_de_demandes: "id.err.trop_de_demandes",
      quota_service_epuise: "id.err.quota",
    };
    ouvrirMessage(t("id.err.titre"), t(cles[donnees && donnees.erreur] || "id.err.reseau"));
    return;
  }
  ecranResultatsIdentification(dataUrl, Array.isArray(donnees.resultats) ? donnees.resultats : []);
}

function ecranResultatsIdentification(dataUrl, resultats) {
  const top = resultats.slice(0, 3);
  const incertain = !top.length || top[0].score < SEUIL_CONFIANCE;

  const blocs = top.map((r, i) => {
    const pct = Math.round((Number(r.score) || 0) * 100);
    const nom = (r.noms && r.noms[0]) || r.latin;
    const correspondances = plantesPourLatin(r.latin);
    const actions = correspondances.length
      ? correspondances.map(p =>
          `<button type="button" class="btn secondaire" data-fiche="${echapperHTML(p.id)}">
             ${p.emoji} ${t("id.voirfiche")} : ${echapperHTML(p.nom)}</button>`).join("")
      : `<button type="button" class="btn secondaire" data-ajout="${i}">➕ ${t("id.ajouter")}</button>`;
    return `<div class="id-resultat">
      <div class="id-tete"><strong>${echapperHTML(nom)}</strong><em>${echapperHTML(r.latin)}</em>
        <span class="id-score">${t("id.confiance", { pct })}</span></div>
      <div class="id-barre"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>
      ${r.famille ? `<div class="id-famille">${echapperHTML(r.famille)}</div>` : ""}
      <div class="id-actions">${actions}</div>
    </div>`;
  }).join("");

  $("#modale").innerHTML = `
    <button class="fermer" aria-label="Fermer">×</button>
    <div class="form-ajout">
      <h2>${t("id.titre")}</h2>
      <img class="photo-preview" src="${dataUrl}" alt="" />
      ${incertain ? `<p class="id-alerte">${t(top.length ? "id.incertain" : "id.aucun")}</p>` : ""}
      ${blocs}
      <p class="id-securite">${t("id.securite")}</p>
      <p class="id-source"><a href="https://plantnet.org" target="_blank" rel="noopener">${t("id.source")}</a></p>
      <div class="form-actions">
        <button type="button" class="btn secondaire" id="id-reprendre">📷 ${t("id.reprendre")}</button>
      </div>
    </div>`;

  const modale = $("#modale");
  modale.querySelector(".fermer").addEventListener("click", fermerModale);
  modale.querySelectorAll("[data-fiche]").forEach(b => b.addEventListener("click", () => {
    const p = PLANTES.find(x => x.id === b.dataset.fiche);
    if (p) ouvrirModale(p);
  }));
  modale.querySelectorAll("[data-ajout]").forEach(b => b.addEventListener("click", () => {
    const r = top[Number(b.dataset.ajout)];
    if (!r) return;
    ouvrirFormAjout((r.noms && r.noms[0]) || r.latin);
    const champLatin = $("#f-latin");
    if (champLatin && !champLatin.value.trim()) champLatin.value = r.latin;
  }));
  $("#id-reprendre").addEventListener("click", () => $("#input-identifier").click());
  afficherModale();
}
