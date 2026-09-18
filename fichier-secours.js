/*
   Permavore — copie de secours dans un fichier du jardinier.

   Troisième couche de protection, après l'état de travail (localStorage) et la
   copie durable (IndexedDB) :

       Jardin actif → localStorage → IndexedDB → fichier choisi par le jardinier

   Le fichier ne remplace pas IndexedDB : il en est indépendant. Si le navigateur
   purge son stockage, si l'application est désinstallée, si l'appareil change,
   le fichier reste — parce qu'il appartient au jardinier, pas au navigateur.

   RÈGLE : on ne prétend jamais disposer d'une capacité que la plateforme ne
   donne pas. Tout est détecté, rien n'est supposé. Là où la réécriture
   automatique n'existe pas, on le DIT et on propose un téléchargement ou le
   partage natif — pas une pseudo-autosauvegarde qui échouerait en silence.
*/

// Délai de regroupement : on n'écrit pas le disque à chaque frappe, mais une
// fois les modifications rapprochées retombées.
const DELAI_REGROUPEMENT_MS = 5000;

/** Ce que la plateforme permet RÉELLEMENT. Aucune hypothèse. */
export function capacites() {
  const fh = typeof window !== "undefined" ? window.FileSystemFileHandle : undefined;
  const hh = typeof window !== "undefined" ? window.FileSystemHandle : undefined;
  const choisir = typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
  const reecrire = !!(fh && fh.prototype && typeof fh.prototype.createWritable === "function");
  const permissions = !!(hh && hh.prototype
    && typeof hh.prototype.queryPermission === "function"
    && typeof hh.prototype.requestPermission === "function");
  let partage = false;
  try {
    partage = typeof navigator !== "undefined" && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [new File(["{}"], "t.json", { type: "application/json" })] });
  } catch { partage = false; }
  return {
    // Autosauvegarde fiable : il faut pouvoir choisir le fichier, le réécrire,
    // ET vérifier qu'on en a encore le droit après un redémarrage.
    autosauvegarde: choisir && reecrire && permissions,
    choisirFichier: choisir,
    reecrire, permissions, partageNatif: partage,
    // Dernier recours, disponible partout : produire le fichier et laisser le
    // navigateur l'enregistrer ou le partager.
    telechargement: true,
  };
}

const etat = {
  statut: "nonConfiguree",   // nonSupportee | nonConfiguree | aJour | aMettreAJour | ecriture | echec
  nom: null,
  derniereEcriture: null,
  derniereErreur: null,
  enAttente: false,
};

let minuteur = null;
let poignee = null;
let fabriquerContenu = null;   // fourni par sauvegarde.js : () => Promise<string>

function prevenir() {
  document.dispatchEvent(new CustomEvent("secours:etat", { detail: { ...etat } }));
}

/** Nom de fichier proposé, tiré du lieu quand il est connu. */
export function nomPropose(lieu) {
  const propre = String(lieu || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return propre ? `jardin-${propre}.permavore.json` : "mon-jardin-permavore.json";
}

export function etatSecours() { return { ...etat }; }

export function initialiser(fabrique) {
  fabriquerContenu = fabrique;
  const c = capacites();
  if (!c.choisirFichier) {
    etat.statut = "nonSupportee";
    prevenir();
    return c;
  }
  reprendrePoignee();
  return c;
}

/** Au démarrage : retrouve le fichier choisi, sans jamais y écrire en silence. */
async function reprendrePoignee() {
  const { lireReference } = await import("./stockage.js");
  const ref = await lireReference();
  if (!ref || !ref.poignee) { etat.statut = "nonConfiguree"; prevenir(); return; }
  poignee = ref.poignee;
  etat.nom = ref.nom || null;
  etat.derniereEcriture = ref.derniereEcriture || null;
  // Le droit d'écrire peut avoir expiré : il faut alors un geste de
  // l'utilisateur. On ne réclame rien tout seul, et on ne prétend pas être à jour.
  const droit = await interrogerDroit();
  etat.statut = droit === "granted" ? "aJour" : "aMettreAJour";
  prevenir();
}

async function interrogerDroit() {
  if (!poignee || typeof poignee.queryPermission !== "function") return "inconnu";
  try { return await poignee.queryPermission({ mode: "readwrite" }); }
  catch { return "inconnu"; }
}

/**
 * Crée la copie de secours. Doit être appelée depuis un geste de l'utilisateur :
 * choisir un fichier est une décision qui lui appartient.
 */
export async function configurer(lieu) {
  const c = capacites();
  if (!c.choisirFichier) return { ok: false, raison: "non_supportee" };
  try {
    poignee = await window.showSaveFilePicker({
      suggestedName: nomPropose(lieu),
      types: [{ description: "Sauvegarde Permavore", accept: { "application/json": [".json"] } }],
    });
  } catch (e) {
    // L'utilisateur a refusé ou annulé : ce n'est pas une erreur.
    return { ok: false, raison: e && e.name === "AbortError" ? "annule" : "refuse" };
  }
  etat.nom = poignee.name || null;
  const ecrit = await ecrireMaintenant();
  if (!ecrit.ok) return ecrit;
  const { ecrireReference } = await import("./stockage.js");
  await ecrireReference({ poignee, nom: etat.nom, derniereEcriture: etat.derniereEcriture,
    cree: new Date().toISOString() });
  return { ok: true, nom: etat.nom, octets: ecrit.octets, autosauvegarde: c.autosauvegarde };
}

/** Écrit le fichier tout de suite. Ne ment jamais sur le résultat. */
export async function ecrireMaintenant() {
  if (!poignee || !fabriquerContenu) return { ok: false, raison: "non_configuree" };
  const droit = await interrogerDroit();
  if (droit === "prompt" || droit === "denied") {
    etat.statut = "aMettreAJour"; prevenir();
    return { ok: false, raison: "droit_a_redemander" };
  }
  etat.statut = "ecriture"; prevenir();
  try {
    const contenu = await fabriquerContenu();
    const flux = await poignee.createWritable();
    await flux.write(contenu);
    await flux.close();
    etat.derniereEcriture = new Date().toISOString();
    etat.derniereErreur = null;
    etat.statut = "aJour";
    etat.enAttente = false;
    prevenir();
    const { ecrireReference } = await import("./stockage.js");
    await ecrireReference({ poignee, nom: etat.nom, derniereEcriture: etat.derniereEcriture });
    return { ok: true, octets: contenu.length };
  } catch (e) {
    etat.derniereErreur = (e && e.name) || "Error";
    etat.statut = "echec";
    prevenir();
    return { ok: false, raison: "echec_ecriture", cause: etat.derniereErreur };
  }
}

/** Redemande le droit d'écrire : exige un geste de l'utilisateur. */
export async function redemanderDroit() {
  if (!poignee || typeof poignee.requestPermission !== "function") {
    return { ok: false, raison: "non_supportee" };
  }
  try {
    const r = await poignee.requestPermission({ mode: "readwrite" });
    if (r !== "granted") return { ok: false, raison: "refuse" };
    return ecrireMaintenant();
  } catch { return { ok: false, raison: "refuse" }; }
}

/**
 * À appeler quand le JARDIN change — jamais pour un cache, un mouvement
 * d'interface ou l'ouverture d'une fiche. Les modifications rapprochées sont
 * regroupées en une seule écriture.
 */
export function jardinModifie() {
  if (!poignee || !capacites().autosauvegarde) return;
  etat.enAttente = true;
  if (etat.statut === "aJour") { etat.statut = "aMettreAJour"; prevenir(); }
  clearTimeout(minuteur);
  minuteur = setTimeout(() => { ecrireMaintenant(); }, DELAI_REGROUPEMENT_MS);
}

/** Dernière chance d'écrire avant que la page disparaisse. */
export function ecrireAvantFermeture() {
  if (etat.enAttente && poignee) { clearTimeout(minuteur); ecrireMaintenant(); }
}

export async function oublier() {
  const { oublierReference } = await import("./stockage.js");
  await oublierReference();
  poignee = null;
  etat.statut = capacites().choisirFichier ? "nonConfiguree" : "nonSupportee";
  etat.nom = null; etat.derniereEcriture = null;
  prevenir();
}

/**
 * Partage natif du fichier — le chemin des plateformes sans réécriture, iOS en
 * particulier : la feuille de partage permet d'envoyer vers Fichiers ou iCloud
 * Drive. Disponible uniquement si le navigateur le déclare.
 */
export async function partager(contenu, nom) {
  if (!capacites().partageNatif) return { ok: false, raison: "non_supportee" };
  try {
    const fichier = new File([contenu], nom, { type: "application/json" });
    await navigator.share({ files: [fichier], title: "Sauvegarde Permavore" });
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: e && e.name === "AbortError" ? "annule" : "echec" };
  }
}
