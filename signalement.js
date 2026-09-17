/*
   Bulle « Signaler un problème ».

   Elle joint le contexte technique — sans quoi un rapport de bug est
   inexploitable — mais l'utilisateur voit exactement ce qui part avant
   d'envoyer. Aucune coordonnée précise n'est transmise : la commune et le
   climat détecté suffisent à reproduire un problème.
*/

const MAX = 4000;

function contexteTechnique() {
  const c = {
    page: location.pathname + location.search,
    langue: document.documentElement.lang || null,
    ecran: `${window.innerWidth}×${window.innerHeight}`,
    agent: navigator.userAgent,
    horodatage: new Date().toISOString(),
  };
  try {
    const prefs = JSON.parse(localStorage.getItem("permavore.jardin.v1") || "{}");
    if (prefs.ville) c.lieu = prefs.ville;
    if (prefs.zone) c.zoneInterne = prefs.zone;
    if (prefs.surface) c.surface = prefs.surface;
  } catch { /* stockage indisponible : on s'en passe */ }
  if (window.Climat) {
    c.climatStatut = window.Climat.statut();
    const k = window.Climat.climat();
    if (k) c.climatKoppen = k.code;
    c.projection = window.Climat.projection() ? "disponible" : "absente";
  }
  return c;
}

function ouvrir() {
  if (document.getElementById("signalement-panneau")) return;
  const ctx = contexteTechnique();
  const p = document.createElement("div");
  p.id = "signalement-panneau";
  p.className = "signalement-panneau";
  p.setAttribute("role", "dialog");
  p.setAttribute("aria-modal", "false");
  p.setAttribute("aria-label", tr("titre"));
  p.innerHTML = `
    <div class="signalement-entete">
      <strong>${tr("titre")}</strong>
      <button type="button" class="signalement-fermer" aria-label="${tr("fermer")}">✕</button>
    </div>
    <label class="signalement-label" for="signalement-message">${tr("quoi")}</label>
    <textarea id="signalement-message" maxlength="${MAX}" rows="5"
      placeholder="${tr("exemple")}"></textarea>
    <label class="signalement-label" for="signalement-contact">${tr("contact")}</label>
    <input id="signalement-contact" type="text" maxlength="200" placeholder="${tr("facultatif")}" />
    <details class="signalement-contexte">
      <summary>${tr("contexte")}</summary>
      <pre>${Object.entries(ctx).map(([k, v]) => `${k} : ${v}`).join("\n")
        .replace(/[<>&]/g, s => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[s]))}</pre>
    </details>
    <div class="signalement-actions">
      <button type="button" class="btn-principal" id="signalement-envoyer">${tr("envoyer")}</button>
    </div>
    <p class="signalement-etat" id="signalement-etat" role="status"></p>`;
  document.body.appendChild(p);

  const fermer = () => p.remove();
  p.querySelector(".signalement-fermer").addEventListener("click", fermer);
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape" && p.isConnected) { fermer(); document.removeEventListener("keydown", esc); }
  });

  const etat = p.querySelector("#signalement-etat");
  p.querySelector("#signalement-envoyer").addEventListener("click", async (e) => {
    const message = p.querySelector("#signalement-message").value.trim();
    if (message.length < 5) { etat.textContent = tr("trop_court"); return; }
    e.target.disabled = true; etat.textContent = tr("envoi");
    try {
      const r = await fetch("/api/retour", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, contact: p.querySelector("#signalement-contact").value,
          contexte: ctx }),
      });
      if (!r.ok) throw new Error(String(r.status));
      etat.textContent = tr("merci");
      setTimeout(fermer, 2200);
    } catch {
      etat.textContent = tr("echec");
      e.target.disabled = false;
    }
  });
  p.querySelector("#signalement-message").focus();
}

function tr(cle) {
  const fr = {
    titre: "Signaler un problème", fermer: "Fermer",
    quoi: "Qu'est-ce qui ne va pas ?",
    exemple: "Ex. : ma commune n'est pas trouvée, la date affichée est fausse, une culture est mal classée…",
    contact: "Pour te répondre (facultatif)", facultatif: "e-mail ou pseudo — facultatif",
    contexte: "Voir les informations techniques jointes",
    envoyer: "Envoyer", envoi: "Envoi…", merci: "Merci, c'est bien arrivé.",
    echec: "L'envoi a échoué. Réessaie dans un instant.",
    trop_court: "Décris le problème en quelques mots.",
    bulle: "Signaler un problème",
  };
  const en = {
    titre: "Report a problem", fermer: "Close",
    quoi: "What's wrong?",
    exemple: "E.g. my town isn't found, the date is wrong, a crop is misclassified…",
    contact: "So we can reply (optional)", facultatif: "email or nickname — optional",
    contexte: "See the technical details attached",
    envoyer: "Send", envoi: "Sending…", merci: "Thanks, we got it.",
    echec: "Sending failed. Try again shortly.",
    trop_court: "Describe the problem in a few words.",
    bulle: "Report a problem",
  };
  return (document.documentElement.lang === "en" ? en : fr)[cle] || cle;
}

const bulle = document.createElement("button");
bulle.type = "button";
bulle.className = "signalement-bulle";
bulle.id = "signalement-bulle";
bulle.innerHTML = "💬";
bulle.setAttribute("aria-label", tr("bulle"));
bulle.title = tr("bulle");
bulle.addEventListener("click", ouvrir);
document.addEventListener("DOMContentLoaded", () => document.body.appendChild(bulle));
if (document.readyState !== "loading") document.body.appendChild(bulle);
