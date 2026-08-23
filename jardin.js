/* =========================================================================
   Permavore — plan du jardin et rotation des cultures

   GÉOMÉTRIE. La grille a une maille de 0,5 m (soit 0,25 m² par case), ce qui
   donne exactement les formes attendues :
       0,5 m²  = 2 cases  → rectangle 0,5 × 1 m
       1   m²  = 4 cases  → carré     1 × 1 m
       3   m²  = 12 cases → rectangle 1 × 3 m
   On dessine une planche en cliquant (1 m² par défaut) ou en glissant.

   ROTATION. Deux règles complémentaires, toutes deux appliquées :
     1. Famille botanique : ne pas refaire pousser la même famille au même
        endroit avant 3 ans (parasites et maladies persistent dans le sol).
     2. Cycle de fertilité : légumineuse → feuille → fruit → racine → …
        Les légumineuses fixent l'azote, les feuilles le consomment, les
        fruits sont gourmands, les racines terminent sur un sol appauvri.
   ========================================================================= */

const MAILLE_M = 0.5;                       // côté d'une case, en mètres
const M2_PAR_CASE = MAILLE_M * MAILLE_M;    // 0,25 m²
const GRILLE_COLS = 20;                     // 10 m de large
const GRILLE_LIGNES = 16;                   // 8 m de profondeur
const LS_PLAN = "permavore.plan";

// Ordre du cycle de fertilité
const CYCLE_ROTATION = ["legumineuse", "feuille", "fruit", "racine"];
const LIBELLE_ROTATION = {
  legumineuse: { label: "Légumineuse", emoji: "🫘", role: "fixe l'azote dans le sol" },
  feuille:     { label: "Feuille",     emoji: "🥬", role: "consomme l'azote laissé par les légumineuses" },
  fruit:       { label: "Fruit",       emoji: "🍅", role: "gourmand, profite d'un sol encore riche" },
  racine:      { label: "Racine",      emoji: "🥕", role: "peu exigeant, termine le cycle" },
};

/** Catégorie de rotation d'une plante (les fabacées priment). */
function typeRotation(plante) {
  if (!plante) return null;
  if (plante.famille === "Fabacées") return "legumineuse";
  const t = plante.typeLunaire;
  return CYCLE_ROTATION.includes(t) ? t : "feuille";
}

/* ---------- État et persistance ---------- */
const jardin = { planches: [] };

function chargerJardin() {
  try {
    const brut = JSON.parse(localStorage.getItem(LS_PLAN) || "null");
    jardin.planches = (brut && Array.isArray(brut.planches)) ? brut.planches : [];
  } catch (e) { jardin.planches = []; }
}
function sauverJardin() {
  try { localStorage.setItem(LS_PLAN, JSON.stringify({ planches: jardin.planches })); }
  catch (e) { /* quota : on n'interrompt pas l'utilisateur */ }
}

function surfacePlanche(p) { return p.w * p.h * M2_PAR_CASE; }
function surfaceTotale() { return jardin.planches.reduce((n, p) => n + surfacePlanche(p), 0); }

/** Deux rectangles se chevauchent-ils ? (on interdit la superposition) */
function chevauche(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function placeLibre(rect, saufId) {
  return !jardin.planches.some(p => p.id !== saufId && chevauche(rect, p));
}

function creerPlanche(x, y, w, h) {
  const rect = { x, y, w, h };
  if (!placeLibre(rect)) return null;
  const p = {
    id: `pl-${Date.now().toString(36)}-${Math.floor(x)}-${Math.floor(y)}`,
    x, y, w, h,
    plantId: null,      // culture en place
    dateSemis: null,
    historique: [],     // [{plantId, famille, type, annee}] du plus ancien au plus récent
  };
  jardin.planches.push(p);
  sauverJardin();
  return p;
}

function supprimerPlanche(id) {
  jardin.planches = jardin.planches.filter(p => p.id !== id);
  sauverJardin();
}

function planterDans(planche, plantId, dateIso) {
  planche.plantId = plantId;
  planche.dateSemis = dateIso || null;
  sauverJardin();
}

/** Récolte terminée : la culture bascule dans l'historique et la planche se libère. */
function recolterPlanche(planche, plantes) {
  if (!planche.plantId) return;
  const plante = plantes.find(p => p.id === planche.plantId);
  planche.historique.push({
    plantId: planche.plantId,
    famille: plante ? plante.famille : null,
    type: typeRotation(plante),
    annee: planche.dateSemis ? Number(planche.dateSemis.slice(0, 4))
                             : new Date().getFullYear(),
  });
  planche.plantId = null;
  planche.dateSemis = null;
  sauverJardin();
}

/* ---------- Moteur de rotation ---------- */

/**
 * Propose les meilleures cultures suivantes pour une planche libérée.
 * @param planche  la planche concernée (avec son historique)
 * @param plantes  base de plantes
 * @param options  { anneeCourante, estPlantable } — estPlantable(p) filtre la saison/le climat
 * @returns [{plante, score, raisons:[], deconseille:bool, motif}]
 */
function suggestionsRotation(planche, plantes, options = {}) {
  const annee = options.anneeCourante || new Date().getFullYear();
  const estPlantable = options.estPlantable || (() => true);
  const hist = planche.historique || [];
  const dernier = hist[hist.length - 1] || null;

  // Familles présentes depuis moins de 3 ans → à éviter
  const famillesRecentes = new Map();
  hist.forEach(h => {
    if (!h.famille) return;
    const ecart = annee - h.annee;
    if (ecart < 3) famillesRecentes.set(h.famille, Math.min(ecart, famillesRecentes.get(h.famille) ?? 9));
  });

  // Étape suivante du cycle de fertilité
  const typeSuivant = dernier && CYCLE_ROTATION.includes(dernier.type)
    ? CYCLE_ROTATION[(CYCLE_ROTATION.indexOf(dernier.type) + 1) % CYCLE_ROTATION.length]
    : "legumineuse";   // planche neuve : commencer par enrichir le sol

  const resultats = plantes.map(plante => {
    if (plante.cycle === "vivace") return null;   // une vivace ne tourne pas
    const t = typeRotation(plante);
    const raisons = [];
    let score = 0;

    // 1. Famille récente = rédhibitoire
    if (famillesRecentes.has(plante.famille)) {
      const ecart = famillesRecentes.get(plante.famille);
      return { plante, score: -100, deconseille: true,
        motif: `${plante.famille} déjà cultivée ici il y a ${ecart === 0 ? "cette année" : ecart + " an(s)"}`
             + " — attendre 3 ans", raisons };
    }

    // 2. Respect du cycle de fertilité
    if (t === typeSuivant) {
      score += 50;
      raisons.push(`${LIBELLE_ROTATION[t].emoji} ${LIBELLE_ROTATION[t].label} : ${LIBELLE_ROTATION[t].role}`);
    } else if (dernier && t === dernier.type) {
      score -= 20;
      raisons.push("même catégorie que la culture précédente");
    }

    // 3. Une légumineuse après une gourmande restaure toujours le sol
    if (t === "legumineuse" && dernier && dernier.type === "fruit") {
      score += 15; raisons.push("restaure l'azote après une culture gourmande");
    }

    // 4. Plantable maintenant (saison + climat)
    if (estPlantable(plante)) { score += 30; raisons.push("se sème ou se plante en ce moment"); }
    else score -= 25;

    // 5. Petit bonus aux cultures faciles
    if (plante.diff === 1) score += 5;

    return { plante, score, deconseille: false, raisons };
  }).filter(Boolean);

  const bons = resultats.filter(r => !r.deconseille).sort((a, b) => b.score - a.score);
  const exclus = resultats.filter(r => r.deconseille);
  return { typeSuivant, dernier, suggestions: bons.slice(0, 6), exclus: exclus.slice(0, 6) };
}
