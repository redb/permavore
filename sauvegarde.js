/*
   Permavore — « Exporter mon jardin » et « Restaurer un jardin ».

   Une restauration ne remplace jamais un jardin sans filet : on valide le
   fichier, on montre ce qui va être restauré, on sauvegarde l'existant, on
   restaure, on vérifie l'intégrité — et en cas d'échec on revient tout seul à
   l'état précédent. Aucune restauration ne peut transformer silencieusement un
   jardin existant en jardin vide.
*/

import {
  construireExport, etatDepuisExport, validerExport, comparerJardins, FORMAT_VERSION,
  clesMetier,
} from "./sauvegarde-core.mjs";
import * as Secours from "./fichier-secours.js";
import {
  initialiserStockage, lireLocalStorage, appliquerVersLocalStorage, ecrireEtat,
  sauvegardeSecurite, restaurerSauvegarde, sauvegardes, synchroniserCopieDurable,
  journal, lireSachets, ecrireSachets,
} from "./stockage.js";

const etatStockage = { pret: false, resultat: null };

/* ---------- indicateur d'état -------------------------------------------- */

/*
   On n'affiche jamais « Synchronisé » : aucune sauvegarde distante n'existe.
   Dire la vérité — « sauvegardé sur cet appareil » — vaut mieux qu'une promesse.
*/
function messageEtat() {
  const r = etatStockage.resultat;
  if (!r) return { cle: "sauv.etat.inconnu", ton: "neutre" };
  if (!r.ok && r.migrationEchouee) return { cle: "sauv.etat.migrationEchouee", ton: "alerte" };
  if (!r.ok) return { cle: "sauv.etat.fragile", ton: "alerte" };
  if (r.restaure) return { cle: "sauv.etat.restaure", ton: "bon" };
  if (r.source === "vide") return { cle: "sauv.etat.vide", ton: "neutre" };
  return { cle: "sauv.etat.appareil", ton: "bon" };
}

/* ---------- export -------------------------------------------------------- */

/** Contenu de sauvegarde COMPLET : c'est lui qui garantit ORIGINAL ≡ RESTAURÉ. */
export async function contenuSauvegarde() {
  const etat = lireLocalStorage();
  const entrees = await journal(500).catch(() => []);
  const sachets = await lireSachets().catch(() => []);
  const fichier = construireExport(etat, {
    appVersion: document.documentElement.dataset.version || null,
    journal: entrees, sachets,
  });
  return JSON.stringify(fichier, null, 2);
}

/** Nom tiré du lieu quand il est connu, pour que le fichier se reconnaisse. */
function lieuDuJardin() {
  try { return JSON.parse(localStorage.getItem("permavore.jardin.v1") || "{}").ville || null; }
  catch { return null; }
}

export async function exporterJardin() {
  const texte = await contenuSauvegarde();
  const fichier = JSON.parse(texte);
  const blob = new Blob([texte], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = Secours.nomPropose(lieuDuJardin());
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { octets: blob.size, instances: (fichier.instances || []).length };
}

/* ---------- restauration -------------------------------------------------- */

/**
 * Restaure un fichier. Procédure en neuf temps, dont deux points de non-retour
 * volontairement tardifs : on ne touche au jardin existant qu'après validation
 * ET sauvegarde, et on revient en arrière si la vérification échoue.
 */
export async function restaurerJardin(fichier, confirmer) {
  const validation = validerExport(fichier);
  if (!validation.valide) return { ok: false, etape: "validation", ...validation };

  const accepte = await confirmer(validation);
  if (!accepte) return { ok: false, etape: "annule" };

  const avant = lireLocalStorage();
  const idFilet = await sauvegardeSecurite("avant-restauration").catch(() => null);

  const cible = etatDepuisExport(fichier);
  try {
    appliquerVersLocalStorage(cible);
    await ecrireEtat(cible).catch(() => null);
    // Photos de sachets : restaurées aussi, sinon le jardinier perd ses clichés.
    if (Array.isArray(fichier.sachets) && fichier.sachets.length) {
      await ecrireSachets(fichier.sachets).catch(() => 0);
    }
  } catch (e) {
    await rembobiner(avant, idFilet);
    return { ok: false, etape: "ecriture", message: e && e.message };
  }

  // Vérification d'intégrité : ce qu'on vient d'écrire est-il bien ce qu'on
  // voulait écrire ? Sinon, retour automatique au jardin précédent.
  const relu = lireLocalStorage();
  const controle = comparerJardins(cible, relu);
  if (!controle.identique) {
    await rembobiner(avant, idFilet);
    return { ok: false, etape: "integrite", differences: controle.differences };
  }

  return { ok: true, resume: validation.resume, reserves: validation.reserves,
    sauvegardePrecedente: idFilet };
}

async function rembobiner(avant, idFilet) {
  try {
    if (idFilet) await restaurerSauvegarde(idFilet);
    else appliquerVersLocalStorage(avant);
  } catch { appliquerVersLocalStorage(avant); }
}

/* ---------- démarrage ------------------------------------------------------ */

export async function demarrerSauvegarde() {
  etatStockage.resultat = await initialiserStockage().catch(
    (e) => ({ ok: false, raison: "exception", message: e && e.message }));
  etatStockage.pret = true;
  document.dispatchEvent(new CustomEvent("sauvegarde:etat", { detail: etatStockage.resultat }));

  // La copie durable suit les changements, sans ralentir l'interface.
  let enAttente = null;
  const planifier = () => {
    clearTimeout(enAttente);
    enAttente = setTimeout(() => synchroniserCopieDurable(), 1200);
  };
  document.addEventListener("climat:maj", planifier);
  window.addEventListener("pagehide", () => synchroniserCopieDurable());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") synchroniserCopieDurable();
  });
  // Toute écriture du jardin passe par localStorage : on l'observe. On ne
  // réagit QUE aux clés métier — un cache climatique ou une préférence
  // d'affichage ne doit déclencher aucune écriture disque.
  const metier = new Set(clesMetier());
  const poser = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (cle, valeur) {
    poser(cle, valeur);
    if (typeof cle === "string" && metier.has(cle)) {
      planifier();
      Secours.jardinModifie();
    }
  };
  window.addEventListener("pagehide", () => Secours.ecrireAvantFermeture());

  // Copie de secours : on détecte ce que la plateforme permet, on n'invente rien.
  const capacites = Secours.initialiser(contenuSauvegarde);
  document.addEventListener("secours:etat", () => majPanneauSecours());
  etatStockage.capacitesFichier = capacites;
  return etatStockage.resultat;
}

/* ---------- alerte visible en cas d'échec d'écriture ---------------------- */

/*
   Le cas le plus grave n'est pas de perdre une écriture : c'est de laisser le
   jardinier croire que son jardin est enregistré alors qu'il ne l'est pas. Une
   bannière s'affiche donc, et propose l'export tout de suite — c'est la seule
   action qui règle réellement le problème.
*/
function alerterEchecStockage(detail) {
  if (document.getElementById("sauv-alerte")) return;
  const b = document.createElement("div");
  b.id = "sauv-alerte";
  b.className = "sauv-alerte";
  b.setAttribute("role", "alert");
  b.innerHTML = `
    <span>${detail.quota ? tr("sauv.alerte.quota") : tr("sauv.alerte.echec")}</span>
    <button type="button" class="btn-principal" id="sauv-alerte-exporter">${tr("sauv.exporter")}</button>
    <button type="button" class="sauv-alerte-fermer" aria-label="${tr("enr.fermer")}">✕</button>`;
  document.body.appendChild(b);
  b.querySelector("#sauv-alerte-exporter").addEventListener("click", async () => {
    try { await exporterJardin(); b.remove(); } catch { /* le message reste */ }
  });
  b.querySelector(".sauv-alerte-fermer").addEventListener("click", () => b.remove());
}

document.addEventListener("stockage:echec", (e) => {
  const d = e.detail || {};
  // Journal technique : la cause exacte, pour pouvoir diagnostiquer plus tard.
  console.warn("[permavore] écriture refusée", { cle: d.cle, cause: d.cause, quota: d.quota });
  if (d.souveraine) alerterEchecStockage(d);
});

window.Sauvegarde = {
  exporter: exporterJardin,
  restaurer: restaurerJardin,
  etat: () => etatStockage.resultat,
  messageEtat, alerterEchecStockage,
  sauvegardes,
  restaurerSauvegarde,
  FORMAT_VERSION,
};
document.dispatchEvent(new CustomEvent("sauvegarde:pret"));

/* ---------- interface : Mon jardin → Sauvegarde --------------------------- */

const tr = (cle, vars) => (typeof t === "function" ? t(cle, vars) : cle);
const echapper = (s) => String(s ?? "").replace(/[<>&"]/g,
  c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

export function ouvrirPanneauSauvegarde() {
  document.getElementById("sauv-panneau")?.remove();
  const m = messageEtat();
  const p = document.createElement("div");
  p.id = "sauv-panneau";
  p.className = "enr-panneau";
  p.setAttribute("role", "dialog");
  p.setAttribute("aria-modal", "true");
  p.setAttribute("aria-label", tr("sauv.titre"));
  p.innerHTML = `
    <div class="enr-boite">
      <div class="enr-entete">
        <strong>${tr("sauv.titre")}</strong>
        <button type="button" class="enr-fermer" aria-label="${tr("enr.fermer")}">✕</button>
      </div>
      <p class="sauv-etat sauv-${m.ton}">${tr(m.cle)}</p>
      <p class="sauv-explication">${tr("sauv.explication")}</p>
      <div class="sauv-actions">
        <button type="button" class="btn-principal" id="sauv-exporter">${tr("sauv.exporter")}</button>
        <button type="button" class="enr-chip" id="sauv-importer">${tr("sauv.restaurer")}</button>
      </div>
      <div class="sauv-secours" id="sauv-secours"></div>
      <input type="file" id="sauv-fichier" accept="application/json,.json" hidden />
      <p class="sauv-message" id="sauv-message" role="status"></p>
    </div>`;
  document.body.appendChild(p);

  const fermer = () => p.remove();
  p.addEventListener("click", (e) => { if (e.target === p) fermer(); });
  p.querySelector(".enr-fermer").addEventListener("click", fermer);
  const message = p.querySelector("#sauv-message");
  majPanneauSecours();

  p.querySelector("#sauv-exporter").addEventListener("click", async () => {
    try {
      const r = await exporterJardin();
  message.textContent = tr("sauv.exporte", { n: r.instances, ko: Math.max(1, Math.round(r.octets / 1024)) });
    } catch (e) {
      message.textContent = tr("sauv.echecExport");
    }
  });

  const champ = p.querySelector("#sauv-fichier");
  p.querySelector("#sauv-importer").addEventListener("click", () => champ.click());
  champ.addEventListener("change", async () => {
    const f = champ.files && champ.files[0];
    if (!f) return;
    let contenu;
    try { contenu = JSON.parse(await f.text()); }
    catch { message.textContent = tr("sauv.illisible"); return; }

    const resultat = await restaurerJardin(contenu, (validation) => new Promise((resoudre) => {
      // On montre ce qui va être restauré AVANT de toucher au jardin existant.
      const r = validation.resume;
      const detail = tr("sauv.apercu", {
        instances: r.instances, zones: r.zones, cultures: r.cultures,
        date: r.exportedAt ? r.exportedAt.slice(0, 10) : "?",
      });
      const reserve = validation.reserves.includes("version_plus_recente")
        ? "\n\n" + tr("sauv.versionRecente") : "";
      resoudre(window.confirm(`${detail}${reserve}\n\n${tr("sauv.confirmer")}`));
    }));

    if (resultat.ok) {
      message.textContent = tr("sauv.restaure");
      setTimeout(() => { fermer(); location.reload(); }, 1200);
    } else if (resultat.etape === "annule") {
      message.textContent = tr("sauv.annule");
    } else if (resultat.etape === "validation") {
      message.textContent = tr("sauv.invalide", { raisons: resultat.erreurs.join(", ") });
    } else {
      message.textContent = tr("sauv.echecRestauration");
    }
    champ.value = "";
  });
}

/* ---------- bloc « copie de secours » ------------------------------------- */

/*
   Les états sont distingués sans complaisance : « à jour » n'est affiché que si
   une écriture a réellement abouti, et « non prise en charge » est dit
   franchement plutôt que masqué derrière une fausse autosauvegarde.
*/
const LIBELLE_SECOURS = {
  nonSupportee: "secours.etat.nonSupportee",
  nonConfiguree: "secours.etat.nonConfiguree",
  aJour: "secours.etat.aJour",
  aMettreAJour: "secours.etat.aMettreAJour",
  ecriture: "secours.etat.ecriture",
  echec: "secours.etat.echec",
};

function majPanneauSecours() {
  const hote = document.getElementById("sauv-secours");
  if (!hote) return;
  const e = Secours.etatSecours();
  const c = Secours.capacites();
  const ton = e.statut === "aJour" ? "bon"
    : (e.statut === "echec" ? "alerte" : "neutre");
  const quand = e.derniereEcriture
    ? ` <em>${tr("secours.le", { date: e.derniereEcriture.slice(0, 16).replace("T", " ") })}</em>` : "";

  let actions = "";
  if (e.statut === "nonSupportee") {
    // Deux actions distinctes plutôt qu'une heuristique de plateforme : sur
    // macOS la feuille de partage ne propose pas d'enregistrer un fichier,
    // sur iOS elle mène à Fichiers et iCloud Drive. Le jardinier choisit.
    actions = `<button type="button" class="btn-principal" id="secours-telecharger">${tr("secours.telecharger")}</button>`
      + (c.partageNatif
        ? `<button type="button" class="enr-chip" id="secours-partager">${tr("secours.partager")}</button>` : "");
  } else if (e.statut === "nonConfiguree") {
    actions = `<button type="button" class="enr-chip" id="secours-creer">${tr("secours.creer")}</button>`;
  } else {
    actions = `<button type="button" class="enr-chip" id="secours-ecrire">${tr("secours.mettreAJour")}</button>
      <button type="button" class="enr-chip" id="secours-oublier">${tr("secours.oublier")}</button>`;
  }

  hote.innerHTML = `
    <p class="sauv-etat sauv-${ton}">${tr(LIBELLE_SECOURS[e.statut] || "secours.etat.nonConfiguree")}${quand}</p>
    ${e.nom ? `<p class="sauv-explication">${tr("secours.fichier", { nom: echapper(e.nom) })}</p>` : ""}
    <p class="sauv-explication">${c.autosauvegarde ? tr("secours.auto")
      : (c.partageNatif ? tr("secours.partage") : tr("secours.manuel"))}</p>
    <div class="sauv-actions">${actions}</div>`;

  hote.querySelector("#secours-creer")?.addEventListener("click", async () => {
    const r = await Secours.configurer(lieuDuJardin());
    const m = document.getElementById("sauv-message");
    if (m) {
      m.textContent = r.ok ? tr("secours.cree", { ko: Math.max(1, Math.round(r.octets / 1024)) })
        : r.raison === "annule" ? tr("secours.annule") : tr("secours.echecCreation");
    }
  });
  hote.querySelector("#secours-ecrire")?.addEventListener("click", async () => {
    let r = await Secours.ecrireMaintenant();
    // Le droit d'écrire a pu expirer : il se redemande sur ce geste, pas en silence.
    if (!r.ok && r.raison === "droit_a_redemander") r = await Secours.redemanderDroit();
    const m = document.getElementById("sauv-message");
    if (m) m.textContent = r.ok ? tr("secours.misAJour") : tr("secours.echecEcriture");
  });
  hote.querySelector("#secours-oublier")?.addEventListener("click", async () => {
    await Secours.oublier();
  });
  hote.querySelector("#secours-telecharger")?.addEventListener("click", () => exporterJardin());
  hote.querySelector("#secours-partager")?.addEventListener("click", async () => {
    const contenu = await contenuSauvegarde();
    const partage = await Secours.partager(contenu, Secours.nomPropose(lieuDuJardin()));
    const m = document.getElementById("sauv-message");
    if (m && !partage.ok && partage.raison !== "annule") m.textContent = tr("secours.echecPartage");
  });
}

/* ---------- reprise d'un jardin depuis l'accueil --------------------------- */

/*
   Un jardinier qui change de téléphone, réinstalle l'application ou perd son
   stockage doit retrouver son jardin AVANT toute configuration : sans créer un
   jardin neuf, sans ressaisir sa commune, sans aller fouiller dans les
   réglages. D'où cette reprise sur le premier écran.

   Elle passe par un `<input type="file">` ordinaire — le seul mécanisme
   disponible partout, Safari iOS compris, qui ouvre Fichiers, iCloud Drive ou
   « Sur mon iPhone ». Elle ne dépend EN RIEN de la copie de secours
   automatique : ce sont deux capacités indépendantes.

   Et elle emprunte exactement le même moteur de restauration que les réglages :
   validation, aperçu, sauvegarde de sécurité, contrôle d'intégrité, retour
   arrière. Pas de seconde implémentation.
*/

/** Y a-t-il déjà un jardin sur cet appareil ? */
function jardinPresent() {
  const etat = lireLocalStorage();
  const instances = etat.donnees["permavore.instances.v1"];
  const prefs = etat.donnees["permavore.jardin.v1"];
  return (Array.isArray(instances) && instances.length > 0)
    || !!(prefs && typeof prefs === "object" && prefs.ville);
}

/** Aperçu : uniquement ce que le fichier contient vraiment. */
function apercuHTML(resume, reserves) {
  const lignes = [];
  if (resume.lieu) lignes.push(`<strong>${echapper(resume.lieu)}</strong>`);
  if (Number.isFinite(resume.surface)) lignes.push(tr("reprise.surface", { n: resume.surface }));
  if (resume.instances) lignes.push(tr("reprise.cultures", { n: resume.instances, d: resume.culturesDistinctes }));
  if (resume.zones) lignes.push(tr("reprise.zones", { n: resume.zones }));
  if (resume.occupations) lignes.push(tr("reprise.occupations", { n: resume.occupations }));
  if (resume.exportedAt) {
    const d = new Date(resume.exportedAt);
    lignes.push(tr("reprise.date", { date: Number.isNaN(d.getTime())
      ? echapper(resume.exportedAt) : d.toLocaleDateString(document.documentElement.lang === "en" ? "en" : "fr",
        { day: "numeric", month: "long", year: "numeric" }) }));
  }
  const photos = resume.photos
    ? `<p class="reprise-photos">📷 ${tr("reprise.photos", { n: resume.photos })}</p>`
    : `<p class="reprise-photos reprise-sans">${tr("reprise.sansPhotos")}</p>`;
  const alerte = reserves.includes("version_plus_recente")
    ? `<p class="reprise-reserve">${tr("sauv.versionRecente")}</p>` : "";
  return `<div class="reprise-apercu">
    <p class="reprise-titre">${tr("reprise.trouve")}</p>
    <ul>${lignes.map(l => `<li>${l}</li>`).join("")}</ul>
    ${photos}${alerte}</div>`;
}

/**
 * Ouvre le sélecteur de fichiers puis, si le fichier est valide, montre un
 * aperçu avant d'écrire quoi que ce soit.
 */
export function reprendreJardinDepuisFichier(champ, surSucces) {
  champ.value = "";           // pour que choisir deux fois le même fichier marche
  champ.onchange = async () => {
    const f = champ.files && champ.files[0];
    if (!f) return;            // sélecteur annulé : rien à faire, rien d'écrit
    let contenu;
    try { contenu = JSON.parse(await f.text()); }
    catch { afficherPanneauReprise(null, null, champ); return; }

    // On vérifie le CONTENU, pas l'extension : un fichier peut être renommé.
    const validation = validerExport(contenu);
    if (!validation.valide) { afficherPanneauReprise(null, validation, champ); return; }
    afficherPanneauReprise(contenu, validation, champ, surSucces);
  };
  champ.click();
}

function afficherPanneauReprise(fichier, validation, champ, surSucces) {
  document.getElementById("reprise-panneau")?.remove();
  const p = document.createElement("div");
  p.id = "reprise-panneau";
  p.className = "enr-panneau";
  p.setAttribute("role", "dialog");
  p.setAttribute("aria-modal", "true");

  const invalide = !fichier;
  p.innerHTML = `
    <div class="enr-boite">
      <div class="enr-entete">
        <strong>${tr(invalide ? "reprise.invalideTitre" : "reprise.titre")}</strong>
        <button type="button" class="enr-fermer" aria-label="${tr("enr.fermer")}">✕</button>
      </div>
      ${invalide
        ? `<p class="reprise-invalide">${tr("reprise.invalide")}</p>`
        : apercuHTML(validation.resume, validation.reserves)}
      ${!invalide && jardinPresent() ? `<p class="reprise-reserve">${tr("reprise.remplace")}</p>` : ""}
      <div class="sauv-actions">
        ${invalide
          ? `<button type="button" class="btn-principal" id="reprise-autre">${tr("reprise.autreFichier")}</button>`
          : `<button type="button" class="btn-principal" id="reprise-valider">${tr("reprise.valider")}</button>
             <button type="button" class="enr-chip" id="reprise-annuler">${tr("reprise.annuler")}</button>`}
      </div>
      <p class="sauv-message" id="reprise-message" role="status"></p>
    </div>`;
  document.body.appendChild(p);

  const fermer = () => p.remove();
  p.querySelector(".enr-fermer").addEventListener("click", fermer);
  p.addEventListener("click", (e) => { if (e.target === p) fermer(); });
  p.querySelector("#reprise-annuler")?.addEventListener("click", fermer);
  p.querySelector("#reprise-autre")?.addEventListener("click", () => {
    fermer();
    reprendreJardinDepuisFichier(champ, surSucces);
  });

  p.querySelector("#reprise-valider")?.addEventListener("click", async () => {
    const message = p.querySelector("#reprise-message");
    message.textContent = tr("reprise.enCours");
    // Exactement le même moteur que depuis les réglages : l'aperçu ayant déjà
    // été montré et accepté, la confirmation est immédiate.
    const r = await restaurerJardin(fichier, () => Promise.resolve(true));
    if (r.ok) {
      message.textContent = tr("sauv.restaure");
      if (typeof surSucces === "function") surSucces(r);
      setTimeout(() => location.reload(), 1000);
    } else {
      message.textContent = r.etape === "integrite"
        ? tr("reprise.echecIntegrite") : tr("sauv.echecRestauration");
    }
  });
}

/** Le point d'entrée de l'accueil n'apparaît que s'il n'y a pas déjà un jardin. */
function brancherRepriseAccueil() {
  const bloc = document.getElementById("entree-reprise");
  const bouton = document.getElementById("btn-restaurer-accueil");
  const champ = document.getElementById("fichier-restauration-accueil");
  if (!bloc || !bouton || !champ) return;
  bloc.hidden = jardinPresent();
  bouton.addEventListener("click", () => reprendreJardinDepuisFichier(champ));
}

window.Sauvegarde.ouvrirPanneau = ouvrirPanneauSauvegarde;
window.Sauvegarde.reprendre = reprendreJardinDepuisFichier;
window.Sauvegarde.jardinPresent = jardinPresent;
window.Sauvegarde.secours = Secours;
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-sauvegarde")?.addEventListener("click", ouvrirPanneauSauvegarde);
  brancherRepriseAccueil();
  demarrerSauvegarde();
});
if (document.readyState !== "loading") {
  document.getElementById("btn-sauvegarde")?.addEventListener("click", ouvrirPanneauSauvegarde);
  brancherRepriseAccueil();
  demarrerSauvegarde();
}
