/* =========================================================================
   Permavore — sachets de graines (photo, archive, identification)

   Pourquoi IndexedDB et pas localStorage : une photo compressée pèse 50 à
   300 Ko. localStorage est plafonné à ~5 Mo et sert déjà aux plantes, dates
   et ressources ; une dizaine de sachets suffirait à le saturer et à faire
   échouer TOUTES les sauvegardes. IndexedDB encaisse plusieurs centaines de Mo.

   Chaque sachet stocke deux tailles :
     - thumb : ~400 px, chargée en mémoire au démarrage (listes, vignettes) ;
     - full  : ~1400 px, lue à la demande (consultation plein écran).
   ========================================================================= */

const SACHETS_DB = "permavore-sachets";
const SACHETS_STORE = "sachets";
let _db = null;

// Cache mémoire : id plante -> [{id, plantId, thumb, meta}] (SANS les full)
const sachetsCache = new Map();

function ouvrirDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SACHETS_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SACHETS_STORE)) {
        const store = db.createObjectStore(SACHETS_STORE, { keyPath: "id" });
        store.createIndex("plantId", "plantId", { unique: false });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

/** Ferme la connexion : une base ne peut pas être supprimée tant qu'un onglet
    la tient ouverte (suppression de compte, tests de non-perte, montée de version). */
function fermerSachets() {
  if (_db) { try { _db.close(); } catch { /* déjà fermée */ } _db = null; }
}
if (typeof window !== "undefined") window.fermerSachets = fermerSachets;

function tx(mode) {
  return ouvrirDB().then(db => db.transaction(SACHETS_STORE, mode).objectStore(SACHETS_STORE));
}

/** Charge les vignettes en mémoire (appelé une fois au démarrage). */
async function chargerSachets() {
  sachetsCache.clear();
  try {
    const store = await tx("readonly");
    await new Promise((resolve, reject) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve();
        const { id, plantId, thumb, meta } = cur.value;   // on laisse `full` sur disque
        if (!sachetsCache.has(plantId)) sachetsCache.set(plantId, []);
        sachetsCache.get(plantId).push({ id, plantId, thumb, meta });
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    // IndexedDB indisponible (navigation privée stricte) : l'app fonctionne sans archive.
    if (typeof journaliserAvertissement === "function") {
      journaliserAvertissement("sachets_indexeddb_indisponible", { message: String(e && e.message) });
    }
  }
}

async function enregistrerSachet(sachet) {
  const store = await tx("readwrite");
  await new Promise((resolve, reject) => {
    const req = store.put(sachet);
    req.onsuccess = resolve; req.onerror = () => reject(req.error);
  });
  const { id, plantId, thumb, meta } = sachet;
  if (!sachetsCache.has(plantId)) sachetsCache.set(plantId, []);
  sachetsCache.get(plantId).push({ id, plantId, thumb, meta });
}

async function supprimerSachet(id, plantId) {
  const store = await tx("readwrite");
  await new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = resolve; req.onerror = () => reject(req.error);
  });
  const liste = sachetsCache.get(plantId) || [];
  sachetsCache.set(plantId, liste.filter(s => s.id !== id));
}

/** Image pleine résolution, lue à la demande. */
async function lireSachetComplet(id) {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function sachetsDe(plantId) { return sachetsCache.get(plantId) || []; }
function nbSachets() { let n = 0; sachetsCache.forEach(l => { n += l.length; }); return n; }

/* ---------- Traitement de l'image ---------- */

/**
 * Redimensionne et compresse une image (respecte l'orientation via createImageBitmap).
 * @returns {Promise<string>} data URL JPEG
 */
function redimensionner(fichier, maxCote, qualite) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, maxCote / Math.max(img.width, img.height));
      const w = Math.round(img.width * ratio), h = Math.round(img.height * ratio);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL("image/jpeg", qualite));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image illisible")); };
    img.src = url;
  });
}

/** Prépare les deux tailles à partir du fichier appareil photo. */
async function preparerPhoto(fichier) {
  const [full, thumb] = await Promise.all([
    redimensionner(fichier, 1400, 0.8),
    redimensionner(fichier, 400, 0.7),
  ]);
  return { full, thumb };
}
