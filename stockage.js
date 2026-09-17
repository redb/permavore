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
  SCHEMA_VERSION, clesMetier, etatDepuisBrut, migrer, comparerJardins,
} from "./sauvegarde-core.mjs";

const NOM_BASE = "permavore-jardin";
const VERSION_BASE = 1;
const MAGASIN_ETAT = "etat";            // clé → valeur, le jardin lui-même
const MAGASIN_META = "meta";            // version de schéma, horodatages
const MAGASIN_JOURNAL = "journal";      // ce qui a changé, pour la synchro future
const MAGASIN_SAUVEGARDES = "sauvegardes";  // filets avant opération risquée

let basePromesse = null;

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
    const resultat = action(tx.objectStore(nom));
    tx.oncomplete = () => resoudre(resultat && resultat.then ? undefined : resultat);
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
  const version = await meta;
  return { schemaVersion: (version && version.schemaVersion) || 0, donnees, anomalies: [] };
}

export async function ecrireEtat(etat) {
  const db = await ouvrir();
  await new Promise((ok, ko) => {
    const tx = db.transaction([MAGASIN_ETAT, MAGASIN_META], "readwrite");
    const store = tx.objectStore(MAGASIN_ETAT);
    for (const [cle, valeur] of Object.entries(etat.donnees || {})) store.put(valeur, cle);
    tx.objectStore(MAGASIN_META).put(
      { schemaVersion: etat.schemaVersion ?? SCHEMA_VERSION, maj: new Date().toISOString() },
      "schema");
    tx.oncomplete = ok; tx.onerror = () => ko(tx.error);
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
  const toutes = await avecMagasin(MAGASIN_SAUVEGARDES, "readonly", s => promesse(s.getAll()));
  const liste = await toutes;
  if (Array.isArray(liste) && liste.length > 5) {
    const aSupprimer = liste.sort((a, b) => a.cree.localeCompare(b.cree)).slice(0, liste.length - 5);
    await avecMagasin(MAGASIN_SAUVEGARDES, "readwrite", s => aSupprimer.forEach(x => s.delete(x.id)));
  }
  return entree.id;
}

export async function sauvegardes() {
  const liste = await avecMagasin(MAGASIN_SAUVEGARDES, "readonly", s => promesse(s.getAll()));
  const tout = await liste;
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

/* ---------- journal ------------------------------------------------------ */

export async function journaliser(entree) {
  try { await avecMagasin(MAGASIN_JOURNAL, "readwrite", s => { s.add(entree); }); }
  catch { /* le journal est un confort, jamais un point de blocage */ }
}

export async function journal(limite = 200) {
  const liste = await avecMagasin(MAGASIN_JOURNAL, "readonly", s => promesse(s.getAll()));
  const tout = await liste;
  return (Array.isArray(tout) ? tout : []).slice(-limite);
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
  for (const [cle, valeur] of Object.entries(etat.donnees || {})) {
    try {
      localStorage.setItem(cle, typeof valeur === "string" ? valeur : JSON.stringify(valeur));
    } catch { /* quota : on continue, IndexedDB reste la copie durable */ }
  }
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
  } catch { return false; }
}

/** Efface la copie durable — réservé aux tests de non-perte. */
export async function effacerToutPourTest() {
  const db = await ouvrir();
  await new Promise((ok, ko) => {
    const tx = db.transaction([MAGASIN_ETAT, MAGASIN_META, MAGASIN_JOURNAL, MAGASIN_SAUVEGARDES], "readwrite");
    [MAGASIN_ETAT, MAGASIN_META, MAGASIN_JOURNAL, MAGASIN_SAUVEGARDES]
      .forEach(n => tx.objectStore(n).clear());
    tx.oncomplete = ok; tx.onerror = () => ko(tx.error);
  });
  for (const cle of clesMetier()) { try { localStorage.removeItem(cle); } catch { /* */ } }
  return true;
}
