/*
   Permavore — stockage durable du jardin (IndexedDB)

   Le problème : tout le jardin vivait dans localStorage, que Safari purge après
   quelques semaines sans visite. Un jardinier pouvait donc perdre son jardin
   sans rien faire de mal. IndexedDB n'est pas éternel non plus, mais il est
   nettement plus résistant, et il autorise des sauvegardes de sécurité.

   Stratégie choisie, volontairement peu invasive :
     - localStorage reste le magasin de travail, que le reste du code utilise
       sans rien changer ;
     - IndexedDB en est la COPIE DURABLE, mise à jour après chaque changement ;
     - au démarrage, si localStorage est vide ou incomplet alors qu'IndexedDB
       contient un jardin, on le restitue. C'est exactement le scénario de la
       purge Safari.

   Rien n'est jamais supprimé d'un côté parce que l'autre a réussi : on ajoute,
   on ne remplace qu'après vérification, et une sauvegarde de sécurité précède
   toute opération risquée.
*/

import {
  SCHEMA_VERSION, clesMetier, clesObsoletes, etatDepuisBrut, migrer, comparerJardins,
  classerEchecEcriture,
} from "./sauvegarde-core.mjs";

const NOM_BASE = "permavore-jardin";
const VERSION_BASE = 3;   // v3 : magasin des références de fichiers externes
const MAGASIN_ETAT = "etat";            // clé → valeur, le jardin lui-même
const MAGASIN_META = "meta";            // version de schéma, horodatages
const MAGASIN_JOURNAL = "journal";      // ce qui a changé, pour la synchro future
const MAGASIN_SAUVEGARDES = "sauvegardes";  // filets avant opération risquée
/*
   Cache climatique — strictement séparé des données du jardin. Il peut être
   vidé à tout moment sans qu'un jardinier perde quoi que ce soit : ce n'est
   pas sa donnée, c'est un calcul reproductible.
*/
const MAGASIN_CLIMAT = "climat";
/*
   Références de fichiers choisis par le jardinier (copie de secours). Ce ne sont
   pas des données mais des POIGNÉES vers un fichier qui lui appartient : elles
   ne valent que sur cet appareil et ne sont jamais exportées.
*/
const MAGASIN_FICHIERS = "fichiers";

let basePromesse = null;

// Échecs d'écriture rencontrés, pour que l'interface puisse en rendre compte.
const echecsEcriture = [];

/**
 * Signale un échec d'écriture. Sur une donnée souveraine, l'événement est émis
 * pour que l'interface avertisse et propose l'export ; sur un cache, on se
 * contente de le noter.
 */
function signalerEchec(cle, erreur) {
  const e = classerEchecEcriture(cle, erreur);
  echecsEcriture.push({ ...e, quand: new Date().toISOString() });
  if (echecsEcriture.length > 50) echecsEcriture.shift();
  if (e.souveraine && typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("stockage:echec", { detail: e }));
  }
  return e;
}

export const echecs = () => [...echecsEcriture];

function ouvrir() {
  if (basePromesse) return basePromesse;
  basePromesse = new Promise((resoudre, rejeter) => {
    if (typeof indexedDB === "undefined") return rejeter(new Error("indexeddb_absent"));
    const req = indexedDB.open(NOM_BASE, VERSION_BASE);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Créations seulement : une montée de version ne supprime jamais un magasin.
      if (!db.objectStoreNames.contains(MAGASIN_ETAT)) db.createObjectStore(MAGASIN_ETAT);
      if (!db.objectStoreNames.contains(MAGASIN_META)) db.createObjectStore(MAGASIN_META);
      if (!db.objectStoreNames.contains(MAGASIN_JOURNAL)) {
        db.createObjectStore(MAGASIN_JOURNAL, { keyPath: "seq", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(MAGASIN_SAUVEGARDES)) {
        db.createObjectStore(MAGASIN_SAUVEGARDES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(MAGASIN_CLIMAT)) {
        db.createObjectStore(MAGASIN_CLIMAT);      // clé = cleCacheClimat
      }
      if (!db.objectStoreNames.contains(MAGASIN_FICHIERS)) {
        db.createObjectStore(MAGASIN_FICHIERS);    // références de fichiers choisis
      }
    };
    req.onsuccess = () => resoudre(req.result);
    req.onerror = () => rejeter(req.error || new Error("ouverture_impossible"));
  }).catch(e => { basePromesse = null; throw e; });
  return basePromesse;
}

const promesse = (requete) => new Promise((ok, ko) => {
  requete.onsuccess = () => ok(requete.result);
  requete.onerror = () => ko(requete.error);
});

async function avecMagasin(nom, mode, action) {
  const db = await ouvrir();
  return new Promise((resoudre, rejeter) => {
    const tx = db.transaction(nom, mode);
    let resultat;
    try { resultat = action(tx.objectStore(nom)); }
    catch (e) { rejeter(e); return; }
    // Quand l'action renvoie une promesse (une lecture), c'est SA valeur qui
    // compte. La version précédente la jetait, ce qui vidait silencieusement
    // toutes les lectures — cache climatique et version de schéma compris.
    tx.oncomplete = () => {
      if (resultat && typeof resultat.then === "function") resultat.then(resoudre, rejeter);
      else resoudre(resultat);
    };
    tx.onerror = () => rejeter(tx.error);
    tx.onabort = () => rejeter(tx.error || new Error("transaction_annulee"));
  });
}

/* ---------- lecture / écriture de l'état -------------------------------- */

export async function lireEtat() {
  const db = await ouvrir();
  const donnees = {};
  await new Promise((ok, ko) => {
    const tx = db.transaction(MAGASIN_ETAT, "readonly");
    const store = tx.objectStore(MAGASIN_ETAT);
    const req = store.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      donnees[c.key] = c.value;
      c.continue();
    };
    tx.oncomplete = ok; tx.onerror = () => ko(tx.error);
  });
  const meta = await avecMagasin(MAGASIN_META, "readonly", s => promesse(s.get("schema")));
  return { schemaVersion: (meta && meta.schemaVersion) || 0, donnees, anomalies: [] };
}

export async function ecrireEtat(etat) {
  const db = await ouvrir();
  const cles = Object.keys(etat.donnees || {});
  await new Promise((ok, ko) => {
    const tx = db.transaction([MAGASIN_ETAT, MAGASIN_META], "readwrite");
    const store = tx.objectStore(MAGASIN_ETAT);
    for (const [cle, valeur] of Object.entries(etat.donnees || {})) store.put(valeur, cle);
    tx.objectStore(MAGASIN_META).put(
      { schemaVersion: etat.schemaVersion ?? SCHEMA_VERSION, maj: new Date().toISOString() },
      "schema");
    tx.oncomplete = ok;
    tx.onerror = () => {
      // Une écriture durable qui échoue concerne des données souveraines :
      // l'utilisateur doit le savoir, et pouvoir exporter tout de suite.
      signalerEchec(cles.find(c => c !== "permavore.lang") || "instances", tx.error || new Error("ecriture_durable"));
      ko(tx.error);
    };
  });
}

/* ---------- sauvegardes de sécurité ------------------------------------- */

/** Filet posé AVANT toute opération risquée (migration, restauration). */
export async function sauvegardeSecurite(motif) {
  const etat = await lireEtat().catch(() => null);
  if (!etat) return null;
  const entree = { id: `${Date.now()}-${motif}`, motif, cree: new Date().toISOString(), etat };
  await avecMagasin(MAGASIN_SAUVEGARDES, "readwrite", s => { s.put(entree); });
  // On garde les cinq dernières : assez pour revenir en arrière, pas assez
  // pour saturer le quota du navigateur.
  const liste = await avecMagasin(MAGASIN_SAUVEGARDES, "readonly", s => promesse(s.getAll()));
  if (Array.isArray(liste) && liste.length > 5) {
    const aSupprimer = liste.sort((a, b) => a.cree.localeCompare(b.cree)).slice(0, liste.length - 5);
    await avecMagasin(MAGASIN_SAUVEGARDES, "readwrite", s => aSupprimer.forEach(x => s.delete(x.id)));
  }
  return entree.id;
}

export async function sauvegardes() {
  const tout = await avecMagasin(MAGASIN_SAUVEGARDES, "readonly", s => promesse(s.getAll()));
  return (Array.isArray(tout) ? tout : []).sort((a, b) => b.cree.localeCompare(a.cree));
}

export async function restaurerSauvegarde(id) {
  const toutes = await sauvegardes();
  const s = toutes.find(x => x.id === id);
  if (!s) return false;
  await ecrireEtat(s.etat);
  appliquerVersLocalStorage(s.etat);
  return true;
}

/* ---------- cache climatique --------------------------------------------- */

export async function lireClimatCache(cle) {
  try {
    return (await avecMagasin(MAGASIN_CLIMAT, "readonly", s => promesse(s.get(cle)))) || null;
  } catch { return null; }
}

export async function ecrireClimatCache(cle, entree) {
  try { await avecMagasin(MAGASIN_CLIMAT, "readwrite", s => { s.put(entree, cle); }); return true; }
  catch { return false; }
}

/**
 * Dernière entrée connue pour une maille, quelle que soit la version du
 * moteur. Sert de repli « périmé mais exploitable » quand la source est
 * indisponible : mieux vaut un profil daté qu'aucun profil.
 */
export async function dernierClimatPourMaille(maille) {
  try {
    const db = await ouvrir();
    return await new Promise((ok, ko) => {
      const tx = db.transaction(MAGASIN_CLIMAT, "readonly");
      const store = tx.objectStore(MAGASIN_CLIMAT);
      const req = store.openCursor();
      let meilleur = null;
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        if (c.value && c.value.maille === maille) {
          if (!meilleur || String(c.value.dateCalcul) > String(meilleur.dateCalcul)) meilleur = c.value;
        }
        c.continue();
      };
      tx.oncomplete = () => ok(meilleur);
      tx.onerror = () => ko(tx.error);
    });
  } catch { return null; }
}

export async function viderClimatCache() {
  try { await avecMagasin(MAGASIN_CLIMAT, "readwrite", s => { s.clear(); }); return true; }
  catch { return false; }
}

/* ---------- référence du fichier de secours ------------------------------- */

export async function lireReference(cle = "secours") {
  try { return (await avecMagasin(MAGASIN_FICHIERS, "readonly", s => promesse(s.get(cle)))) || null; }
  catch { return null; }
}

export async function ecrireReference(entree, cle = "secours") {
  try { await avecMagasin(MAGASIN_FICHIERS, "readwrite", s => { s.put(entree, cle); }); return true; }
  catch (e) { signalerEchec("reference_fichier", e); return false; }
}

export async function oublierReference(cle = "secours") {
  try { await avecMagasin(MAGASIN_FICHIERS, "readwrite", s => { s.delete(cle); }); return true; }
  catch { return false; }
}

/* ---------- journal ------------------------------------------------------ */

export async function journaliser(entree) {
  try { await avecMagasin(MAGASIN_JOURNAL, "readwrite", s => { s.add(entree); }); }
  catch { /* le journal est un confort, jamais un point de blocage */ }
}

export async function journal(limite = 200) {
  const tout = await avecMagasin(MAGASIN_JOURNAL, "readonly", s => promesse(s.getAll()));
  return (Array.isArray(tout) ? tout : []).slice(-limite);
}

/* ---------- photos de sachets de graines ---------------------------------- */

/*
   Les sachets vivent dans leur propre base (`permavore-sachets`, écrite par
   sachets.js). Ce sont des photos prises par le jardinier : irremplaçables, et
   jusqu'ici absentes de l'export. Elles y entrent désormais.
*/
const BASE_SACHETS = "permavore-sachets";
const STORE_SACHETS = "sachets";

// Connexion réutilisée : ouvrir une base à chaque appel sans la refermer
// laissait des connexions ouvertes, ce qui empêche ensuite toute suppression
// de la base (et bloquerait une montée de version).
let sachetsPromesse = null;

function ouvrirSachets() {
  if (sachetsPromesse) return sachetsPromesse;
  sachetsPromesse = new Promise((ok, ko) => {
    if (typeof indexedDB === "undefined") return ko(new Error("indexeddb_absent"));
    const req = indexedDB.open(BASE_SACHETS, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SACHETS)) {
        const st = db.createObjectStore(STORE_SACHETS, { keyPath: "id" });
        st.createIndex("plantId", "plantId", { unique: false });
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  }).catch(e => { sachetsPromesse = null; throw e; });
  return sachetsPromesse;
}

export async function lireSachets() {
  try {
    const db = await ouvrirSachets();
    return await new Promise((ok, ko) => {
      const tx = db.transaction(STORE_SACHETS, "readonly");
      const req = tx.objectStore(STORE_SACHETS).getAll();
      req.onsuccess = () => ok(Array.isArray(req.result) ? req.result : []);
      tx.onerror = () => ko(tx.error);
    });
  } catch { return []; }
}

export async function ecrireSachets(liste) {
  if (!Array.isArray(liste) || !liste.length) return 0;
  try {
    const db = await ouvrirSachets();
    return await new Promise((ok, ko) => {
      const tx = db.transaction(STORE_SACHETS, "readwrite");
      const store = tx.objectStore(STORE_SACHETS);
      let n = 0;
      for (const s of liste) { if (s && s.id) { store.put(s); n++; } }
      tx.oncomplete = () => ok(n);
      tx.onerror = () => ko(tx.error);
    });
  } catch (e) {
    signalerEchec("sachets", e);   // photos du jardinier : jamais en silence
    return 0;
  }
}

export async function effacerSachetsPourTest() {
  try {
    const db = await ouvrirSachets();
    await new Promise((ok, ko) => {
      const tx = db.transaction(STORE_SACHETS, "readwrite");
      tx.objectStore(STORE_SACHETS).clear();
      tx.oncomplete = ok; tx.onerror = () => ko(tx.error);
    });
    return true;
  } catch { return false; }
}

/* ---------- pont avec localStorage --------------------------------------- */

export function lireLocalStorage() {
  const brut = {};
  for (const cle of clesMetier()) {
    try { const v = localStorage.getItem(cle); if (v !== null) brut[cle] = v; } catch { /* refusé */ }
  }
  return etatDepuisBrut(brut);
}

export function appliquerVersLocalStorage(etat) {
  const rates = [];
  for (const [cle, valeur] of Object.entries(etat.donnees || {})) {
    try {
      localStorage.setItem(cle, typeof valeur === "string" ? valeur : JSON.stringify(valeur));
    } catch (e) {
      // On continue les autres clés — sauver ce qui peut l'être — mais on ne
      // fait jamais comme si de rien n'était.
      rates.push(signalerEchec(cle, e));
    }
  }
  return rates;
}

/* ---------- démarrage ----------------------------------------------------- */

/**
 * À appeler une fois au lancement. Ne supprime jamais rien :
 *   - migre le schéma si nécessaire, en conservant l'état d'origine en cas d'échec ;
 *   - si localStorage a un jardin, il fait foi et alimente la copie durable ;
 *   - si localStorage est vide et qu'IndexedDB a un jardin, on le restitue
 *     (cas de la purge Safari ou d'un stockage effacé).
 */
export async function initialiserStockage() {
  // Purge des clés devenues inutiles. Ce sont des caches : rien à demander,
  // rien à sauvegarder, et cela évite qu'un ancien format traîne des années.
  for (const cle of clesObsoletes()) { try { localStorage.removeItem(cle); } catch { /* */ } }

  let durable;
  try { durable = await lireEtat(); }
  catch (e) { return { ok: false, raison: "indexeddb_indisponible", message: e && e.message }; }

  const local = lireLocalStorage();
  const localVide = Object.keys(local.donnees).length === 0;
  const durableVide = Object.keys(durable.donnees).length === 0;

  // Migration de schéma, avec filet et vérification.
  if (!durableVide && (durable.schemaVersion || 0) < SCHEMA_VERSION) {
    await sauvegardeSecurite("avant-migration");
    const r = migrer(durable);
    if (r.echec) {
      return { ok: false, raison: r.raison, migrationEchouee: true,
        message: "Migration refusée : le jardin précédent est conservé intact." };
    }
    await ecrireEtat(r.etat);
    durable = r.etat;
  }

  if (!localVide) {
    // Le magasin de travail fait foi : on met la copie durable à jour.
    const aMigrer = migrer(local);
    await ecrireEtat(aMigrer.echec ? local : aMigrer.etat);
    return { ok: true, source: "localStorage", restaure: false };
  }

  if (!durableVide) {
    // localStorage a été vidé : on rend son jardin au jardinier.
    appliquerVersLocalStorage(durable);
    const verification = comparerJardins(durable, lireLocalStorage());
    return { ok: true, source: "indexeddb", restaure: true,
      integre: verification.identique, differences: verification.differences };
  }

  return { ok: true, source: "vide", restaure: false };
}

/** Recopie l'état de travail vers la copie durable. Silencieux et non bloquant. */
export async function synchroniserCopieDurable() {
  try {
    const local = lireLocalStorage();
    if (!Object.keys(local.donnees).length) return false;
    await ecrireEtat(local);
    return true;
  } catch {
    // ecrireEtat a déjà signalé l'échec ; on ne prétend pas que c'est bon.
    return false;
  }
}

/**
 * Ferme les connexions aux bases. Nécessaire pour qu'une suppression de base
 * aboutisse : une connexion ouverte la bloque. Utile aussi quand un autre
 * onglet doit reprendre la main sur une montée de version.
 */
export async function fermerBases() {
  try { const db = await basePromesse; if (db) db.close(); } catch { /* déjà fermée */ }
  basePromesse = null;
  try { const db = await sachetsPromesse; if (db) db.close(); } catch { /* déjà fermée */ }
  sachetsPromesse = null;
  // sachets.js garde sa propre connexion : elle a son fermerSachets().
  if (typeof window !== "undefined" && typeof window.fermerSachets === "function") {
    window.fermerSachets();
  }
}

/** Efface la copie durable — réservé aux tests de non-perte. */
export async function effacerToutPourTest() {
  const db = await ouvrir();
  await new Promise((ok, ko) => {
    const magasins = [MAGASIN_ETAT, MAGASIN_META, MAGASIN_JOURNAL, MAGASIN_SAUVEGARDES,
      MAGASIN_CLIMAT, MAGASIN_FICHIERS];
    const tx = db.transaction(magasins, "readwrite");
    magasins.forEach(n => tx.objectStore(n).clear());
    tx.oncomplete = ok; tx.onerror = () => ko(tx.error);
  });
  for (const cle of clesMetier()) { try { localStorage.removeItem(cle); } catch { /* */ } }
  return true;
}
