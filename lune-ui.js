/*
   Permavore — interface de l'Expérience Lune.

   Module ES : aucune variable globale ajoutée, donc aucun risque de collision
   avec les scripts classiques. Toute la logique vit dans experience-lune.js ;
   ici, on n'affiche que ce que `vueExperience()` accepte de livrer — c'est ce
   qui garantit qu'aucune interface ne pourra révéler la condition lunaire par
   inadvertance.

   Ton recherché : une petite expérience amusante à laquelle on participe, pas
   un protocole universitaire à remplir.
*/

const T = (cle, vars) => (typeof t === "function" ? t(cle, vars) : cle);
const echapper = (s) => String(s ?? "").replace(/[<>&"]/g,
  c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

const E = () => window.ExperienceLune;
const jour = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso)
    : d.toLocaleDateString(document.documentElement.lang === "en" ? "en" : "fr",
        { day: "numeric", month: "long" });
};

function fermerPanneau() { document.getElementById("lune-panneau")?.remove(); }

function panneau(titre, corps) {
  fermerPanneau();
  const p = document.createElement("div");
  p.id = "lune-panneau";
  p.className = "enr-panneau";
  p.setAttribute("role", "dialog");
  p.setAttribute("aria-modal", "true");
  p.innerHTML = `<div class="enr-boite lune-boite">
    <div class="enr-entete">
      <strong>${titre}</strong>
      <button type="button" class="enr-fermer" aria-label="${T("enr.fermer")}">✕</button>
    </div>
    ${corps}</div>`;
  document.body.appendChild(p);
  p.querySelector(".enr-fermer").addEventListener("click", fermerPanneau);
  p.addEventListener("click", (e) => { if (e.target === p) fermerPanneau(); });
  return p;
}

/* ---------- présentation et entrée dans l'expérience ---------------------- */

function presenter() {
  const p = panneau(`🌙 ${T("lune.titre")}`, `
    <p class="lune-accroche">${T("lune.accroche")}</p>
    <p class="sauv-explication">${T("lune.presentation")}</p>
    <ul class="lune-consignes">${E().PROTOCOLES.radis.consignes
      .map(c => `<li>${echapper(c)}</li>`).join("")}</ul>
    <p class="lune-honnete">${T("lune.honnete")}</p>
    <div class="sauv-actions">
      <button type="button" class="btn-principal" id="lune-participer">${T("lune.participer")}</button>
    </div>`);
  p.querySelector("#lune-participer").addEventListener("click", demarrer);
}

function demarrer() {
  const lieu = typeof window.coordonneesJardin === "function"
    ? window.coordonneesJardin() : null;
  if (!lieu) {
    panneau(`🌙 ${T("lune.titre")}`, `<p class="reprise-invalide">${T("lune.sansLieu")}</p>`);
    return;
  }
  const exp = E().creerExperience("radis", lieu);
  if (!exp) { fermerPanneau(); return; }
  afficherExperience();
}

/* ---------- suivi ---------------------------------------------------------- */

function ligneLot(cle, lot, statut) {
  const attendu = !lot.semeLe;
  const titre = `${T("lune.lot", { lot: cle })}`;
  if (attendu) {
    return `<div class="lune-lot lune-attente">
      <strong>${titre}</strong>
      <p>${T("lune.aSemer", { debut: jour(lot.fenetreDebut), fin: jour(lot.fenetreFin) })}</p>
      <p class="lune-graines">${T("lune.graines", { n: lot.grainesSemees })}</p>
      <button type="button" class="enr-chip" data-semer="${cle}">${T("lune.jaiSeme")}</button>
    </div>`;
  }
  const mesures = [];
  if (Number.isFinite(lot.plantsLeves)) {
    mesures.push(T("lune.leves", { n: lot.plantsLeves, total: lot.grainesSemees,
      taux: Math.round((lot.tauxGermination || 0) * 100) }));
  }
  if (Number.isFinite(lot.poidsRecolteG)) {
    mesures.push(T("lune.recolte", { n: lot.nombreRecolte ?? "?", g: lot.poidsRecolteG }));
  }
  const actions = [];
  if (!Number.isFinite(lot.plantsLeves)) actions.push(`<button type="button" class="enr-chip" data-levee="${cle}">${T("lune.declarerLevee")}</button>`);
  else if (!Number.isFinite(lot.poidsRecolteG)) actions.push(`<button type="button" class="enr-chip" data-recolte="${cle}">${T("lune.declarerRecolte")}</button>`);

  const revele = statut === "completed" && lot.condition
    ? `<p class="lune-revele">🌙 ${T("lune.condition." + lot.condition)}
        ${lot.releveLunaire ? `<em>${T("lune.releve", {
          fraction: Math.round(lot.releveLunaire.fractionEclairee * 100),
          heures: lot.releveLunaire.expositionNocturneHeures })}</em>` : ""}</p>`
    : "";

  return `<div class="lune-lot">
    <strong>${titre}</strong>
    <p class="lune-date">${T("lune.semeLe", { date: jour(lot.semeLe) })}</p>
    ${mesures.map(m => `<p>${m}</p>`).join("")}
    ${revele}
    <div class="sauv-actions">${actions.join("")}</div>
  </div>`;
}

function afficherExperience() {
  const courante = E().experienceCourante()
    || E().experiences().filter(x => x.statut === "completed").slice(-1)[0];
  if (!courante) { presenter(); return; }
  const vue = E().vueExperience(courante);

  const fin = vue.conditionsRevelees
    ? `<div class="lune-fin">
        <p class="lune-titre-fin">${T("lune.terminee")}</p>
        <p class="lune-prudence">${T("lune.prudence")}</p>
        <p class="lune-collectif">${T("lune.rejointCollectif")}</p>
      </div>` : "";

  const p = panneau(`🌙 ${T("lune.titre")}`, `
    ${vue.conditionsRevelees ? "" : `<p class="lune-aveugle">${T("lune.aveugle")}</p>`}
    ${ligneLot("A", vue.lots.A, vue.statut)}
    ${ligneLot("B", vue.lots.B, vue.statut)}
    ${fin}
    ${vue.statut !== "completed" ? `<div class="sauv-actions">
      <button type="button" class="lien-discret" id="lune-abandonner">${T("lune.abandonner")}</button>
    </div>` : ""}`);

  p.querySelectorAll("[data-semer]").forEach(b => b.addEventListener("click", () => {
    const lot = b.dataset.semer;
    // Le semis crée une InstanceCulture ordinaire : l'expérience vit dans le
    // jardin du jardinier, elle n'est pas un objet à part.
    let instanceId = null;
    if (window.Instances) {
      const i = window.Instances.enraciner("radis", {
        etat: "seme", depuis: { precision: "exacte", valeur: new Date().toISOString().slice(0, 10) },
      });
      instanceId = i ? i.id : null;
    }
    E().enregistrerSemis(courante.id, lot, { instanceCultureId: instanceId });
    afficherExperience();
    afficherRappel();
  }));

  p.querySelectorAll("[data-levee]").forEach(b => b.addEventListener("click", () => {
    demanderNombre(T("lune.combienLeves"), (n) => {
      E().enregistrerObservation(courante.id, b.dataset.levee, {
        plantsLeves: n, leveeLe: new Date().toISOString().slice(0, 10) });
      afficherExperience();
    });
  }));

  p.querySelectorAll("[data-recolte]").forEach(b => b.addEventListener("click", () => {
    demanderNombre(T("lune.combienRecoltes"), (n) => {
      demanderNombre(T("lune.poidsTotal"), (g) => {
        E().enregistrerObservation(courante.id, b.dataset.recolte, {
          nombreRecolte: n, poidsRecolteG: g, recolteLe: new Date().toISOString().slice(0, 10) });
        afficherExperience();
      });
    });
  }));

  p.querySelector("#lune-abandonner")?.addEventListener("click", () => {
    E().abandonner(courante.id);
    fermerPanneau();
  });
}

/** Une seule question à la fois, chiffrée : on ne fait pas remplir un formulaire. */
function demanderNombre(question, suite) {
  const reponse = window.prompt(question);
  if (reponse === null) return;
  const n = Number(String(reponse).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return;
  suite(Math.round(n));
}

/* ---------- branchement ---------------------------------------------------- */

/*
   Rappel discret dans la page : Permavore doit venir vers le jardinier, pas
   attendre qu'il pense à ouvrir un panneau. Une seule ligne, refermable, et
   rien du tout quand il n'y a rien à faire.
*/
function afficherRappel() {
  document.getElementById("lune-rappel")?.remove();
  if (!E()) return;
  const etape = E().etapeDue();
  if (!etape || etape.quoi === "attendre") return;

  const messages = {
    semer: etape.urgence === "passee"
      ? T("lune.rappel.semerRetard", { lot: etape.lot })
      : T("lune.rappel.semer", { lot: etape.lot }),
    levee: T("lune.rappel.levee", { lot: etape.lot, jours: etape.jours }),
    recolte: T("lune.rappel.recolte", { lot: etape.lot, jours: etape.jours }),
  };
  const b = document.createElement("div");
  b.id = "lune-rappel";
  b.className = "lune-rappel";
  b.setAttribute("role", "status");
  b.innerHTML = `<span>🌙 ${messages[etape.quoi]}</span>
    <button type="button" class="enr-chip" id="lune-rappel-ouvrir">${T("lune.rappel.ouvrir")}</button>
    <button type="button" class="recu-fermer" aria-label="${T("enr.fermer")}">✕</button>`;
  const hote = document.querySelector("main") || document.body;
  hote.prepend(b);
  b.querySelector("#lune-rappel-ouvrir").addEventListener("click", () => {
    b.remove(); afficherExperience();
  });
  b.querySelector(".recu-fermer").addEventListener("click", () => b.remove());
}

function brancher() {
  const bouton = document.getElementById("btn-experience-lune");
  if (!bouton) return;
  bouton.addEventListener("click", () => {
    if (!E()) return;
    const encours = E().experienceCourante()
      || E().experiences().some(x => x.statut === "completed");
    if (encours) afficherExperience(); else presenter();
  });
  // Le bouton annonce discrètement qu'une étape attend le jardinier.
  const courante = E() && E().experienceCourante();
  if (courante) bouton.classList.add("lune-en-cours");
  afficherRappel();
  // Le rappel réapparaît quand l'affichage des résultats se reconstruit.
  document.addEventListener("climat:maj", afficherRappel);
  document.addEventListener("jardin:recupere", afficherRappel);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", brancher);
} else { brancher(); }
