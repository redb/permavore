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
} from "./sauvegarde-core.mjs";
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

export async function exporterJardin() {
  const etat = lireLocalStorage();
  const entrees = await journal(500).catch(() => []);
  const sachets = await lireSachets().catch(() => []);
  const fichier = construireExport(etat, {
    appVersion: document.documentElement.dataset.version || null,
    journal: entrees, sachets,
  });
  const texte = JSON.stringify(fichier, null, 2);
  const blob = new Blob([texte], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const jour = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `permavore-mon-jardin-${jour}.json`;
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
  // Toute écriture du jardin passe par localStorage : on l'observe.
  const poser = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (cle, valeur) {
    poser(cle, valeur);
    if (typeof cle === "string" && cle.startsWith("permavore.")) planifier();
  };
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
      <input type="file" id="sauv-fichier" accept="application/json,.json" hidden />
      <p class="sauv-message" id="sauv-message" role="status"></p>
    </div>`;
  document.body.appendChild(p);

  const fermer = () => p.remove();
  p.addEventListener("click", (e) => { if (e.target === p) fermer(); });
  p.querySelector(".enr-fermer").addEventListener("click", fermer);
  const message = p.querySelector("#sauv-message");

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

window.Sauvegarde.ouvrirPanneau = ouvrirPanneauSauvegarde;
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-sauvegarde")?.addEventListener("click", ouvrirPanneauSauvegarde);
  demarrerSauvegarde();
});
if (document.readyState !== "loading") {
  document.getElementById("btn-sauvegarde")?.addEventListener("click", ouvrirPanneauSauvegarde);
  demarrerSauvegarde();
}
