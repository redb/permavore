import {
  canRequestVariety,
  createIdempotencyKey,
  fetchWithPolicy,
  validateSeedRequest,
} from "./network-core.mjs";
import { NETWORK_CONFIG, VARIETIES_BY_PLANT } from "./network-data.js";

const REQUEST_STORAGE_KEY = "permavore.seedRequests.v1";
const legacyOpenPlantModal = window.ouvrirModale;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function logEvent(level, event, details = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  };
  console[level === "error" ? "error" : "info"](JSON.stringify(payload));
}

async function loadVarieties(plantId) {
  const fallback = VARIETIES_BY_PLANT[plantId] || [];

  try {
    const response = await fetchWithPolicy(
      `${NETWORK_CONFIG.apiBaseUrl}/plants/${encodeURIComponent(plantId)}/varieties`,
      { headers: { Accept: "application/json" } },
      {
        timeoutMs: NETWORK_CONFIG.requestTimeoutMs,
        retries: NETWORK_CONFIG.readRetries,
      },
    );

    if (!response.ok) return { varieties: fallback, source: "fallback" };
    const body = await response.json();
    return Array.isArray(body.data)
      ? { varieties: body.data, source: "api" }
      : { varieties: fallback, source: "fallback" };
  } catch (error) {
    logEvent("info", "seed_network_read_fallback", {
      plantId,
      reason: error?.name || "unknown",
    });
    return { varieties: fallback, source: "fallback" };
  }
}

function availabilityLabel(variety) {
  if (!variety.availableOffers) return "Momentanément indisponible";
  return `${variety.availableOffers} Primavore${variety.availableOffers > 1 ? "s" : ""} disponible${variety.availableOffers > 1 ? "s" : ""}`;
}

function renderVarietyRows(varieties) {
  if (!varieties.length) {
    return `
      <div class="seed-empty">
        <strong>Aucune variété proposée pour le moment.</strong>
        <span>Le moteur de recommandations reste disponible et le bouton de recherche de graines prend le relais.</span>
      </div>`;
  }

  return varieties.map((variety) => {
    const requestable = canRequestVariety(variety);
    return `
      <article class="seed-row" data-variety-id="${escapeHtml(variety.id)}">
        <div class="seed-variety">
          <strong>${escapeHtml(variety.name)}</strong>
          <span class="${requestable ? "is-available" : "is-unavailable"}">
            ${escapeHtml(availabilityLabel(variety))}
          </span>
        </div>
        <dl class="seed-facts">
          <div><dt>Difficulté</dt><dd>${escapeHtml(variety.reproductionDifficulty)}</dd></div>
          <div><dt>Région approximative</dt><dd>${escapeHtml(variety.region)}</dd></div>
          <div><dt>Lignées</dt><dd>${variety.lineageCount}</dd></div>
        </dl>
        <div class="seed-actions">
          <button class="seed-details" data-seed-details="${escapeHtml(variety.id)}">
            Voir la lignée
          </button>
          <button class="seed-request" data-seed-request="${escapeHtml(variety.id)}"
            ${requestable ? "" : "disabled"}>
            Demander des graines
          </button>
        </div>
      </article>`;
  }).join("");
}

// Pont entre le suivi de culture et le réseau : si la plante est adoptée avec
// une date de mise en place, on annonce QUAND ses graines seront récoltables.
// C'est cette date-là qui permet d'anticiper une offre, et elle diffère de la
// récolte alimentaire. Rien n'est affiché sans date saisie : le système ne
// suppose aucune disponibilité à la place du jardinier.
function renderSeedTiming(plant) {
  const dateSemis = typeof window.dateSemisPlante === "function"
    ? window.dateSemisPlante(plant.id) : "";
  if (!dateSemis) {
    return `
      <p class="seed-timing seed-timing-vide">
        Adopte cette plante et renseigne ta date de semis : Permavore estimera
        quand tes propres graines seront récoltables.
      </p>`;
  }
  const prevision = typeof window.previsionSemences === "function"
    ? window.previsionSemences(plant, dateSemis) : null;
  if (!prevision) return "";
  return `
    <div class="seed-timing">
      <strong>🫙 ${escapeHtml(prevision.label)}</strong>
      <span>${escapeHtml(prevision.note)}</span>
      <span class="seed-timing-note">Estimation d’après ta date de mise en place.
        Le protocole de la variété fait foi.</span>
    </div>`;
}

function renderNetworkSection(plant, varieties, source) {
  const section = document.createElement("section");
  section.className = "seed-network";
  section.dataset.seedPlant = plant.id;
  section.innerHTML = `
    <div class="seed-heading">
      <div>
        <h3>🌱 Graines entre Primavores</h3>
        <p>Des graines reproductibles échangées directement entre jardiniers.
          Permavore coordonne la confiance et la traçabilité.</p>
      </div>
      ${source === "fallback"
        ? '<span class="seed-source-status" title="Le réseau distant ne répond pas.">Données locales</span>'
        : ""}
    </div>
    ${renderSeedTiming(plant)}
    <div class="seed-list">${renderVarietyRows(varieties)}</div>
    <p class="seed-disclaimer">
      Permavore ne vend, ne stocke et n’expédie aucune graine. Les informations de qualité sont déclaratives.
    </p>`;

  section.addEventListener("click", (event) => {
    const detailsButton = event.target.closest("[data-seed-details]");
    const requestButton = event.target.closest("[data-seed-request]");
    if (detailsButton) openLineagePanel(findVariety(varieties, detailsButton.dataset.seedDetails));
    if (requestButton) openRequestDialog(findVariety(varieties, requestButton.dataset.seedRequest), plant);
  });

  return section;
}

function findVariety(varieties, id) {
  return varieties.find((variety) => variety.id === id);
}

function renderLineageTree(variety) {
  if (!variety.lineage.length) {
    return "<p class=\"lineage-empty\">La première transmission documentée créera la racine de cette lignée.</p>";
  }

  return `<ol class="lineage-tree">${variety.lineage.map((lot) => `
    <li style="--generation:${lot.parentId ? 1 : 0}">
      <span>${escapeHtml(lot.label)}</span>
    </li>`).join("")}</ol>`;
}

function openLineagePanel(variety) {
  if (!variety) return;
  closeLineagePanel();

  const panel = document.createElement("aside");
  panel.className = "lineage-panel";
  panel.setAttribute("aria-label", `Lignée ${variety.name}`);
  panel.innerHTML = `
    <button class="lineage-close" aria-label="Fermer">×</button>
    <p class="lineage-kicker">Lignée documentée</p>
    <h3>${escapeHtml(variety.name)}</h3>
    <p>${escapeHtml(availabilityLabel(variety))}</p>
    <div class="lineage-section">
      <h4>Arbre de lignée</h4>
      ${renderLineageTree(variety)}
    </div>
    <div class="lineage-section">
      <h4>Protocole qualité</h4>
      <p>${escapeHtml(variety.protocol.summary)}</p>
      <ul>${variety.protocol.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul>
      <a href="${escapeHtml(variety.protocol.sourceUrl)}" target="_blank" rel="noopener">
        Source : ${escapeHtml(variety.protocol.sourceLabel)}
      </a>
    </div>
    <div class="lineage-section">
      <h4>Données déclaratives</h4>
      ${variety.germination
        ? `<p><strong>${variety.germination.rate} %</strong> de germination,
            ${variety.germination.sampleSize} graines testées en ${variety.germination.year}.</p>`
        : "<p>Aucun test de germination déclaré.</p>"}
    </div>`;

  panel.querySelector(".lineage-close").addEventListener("click", closeLineagePanel);
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add("open"));
}

function closeLineagePanel() {
  document.querySelector(".lineage-panel")?.remove();
}

function requestDialogMarkup(variety, plant) {
  return `
    <form class="seed-request-form" novalidate>
      <button type="button" class="request-close" aria-label="Fermer">×</button>
      <p class="request-context">${escapeHtml(plant.nom)}</p>
      <h2>Demander des graines</h2>
      <p class="request-variety">${escapeHtml(variety.name)}</p>

      <label for="seed-reason">Pourquoi souhaitez-vous cultiver cette variété ?</label>
      <textarea id="seed-reason" name="reason" maxlength="500" rows="5"
        placeholder="Votre projet, votre expérience ou la place de cette variété dans votre jardin…"></textarea>
      <span class="field-meta"><span data-reason-count>0</span>/500</span>
      <p class="field-error" data-error="reason"></p>

      <label for="seed-zone">Zone d’envoi</label>
      <select id="seed-zone" name="zone">
        <option value="">Choisissez votre région</option>
        <option value="auvergne-rhone-alpes">Auvergne-Rhône-Alpes</option>
        <option value="bourgogne-franche-comte">Bourgogne-Franche-Comté</option>
        <option value="bretagne">Bretagne</option>
        <option value="centre-val-de-loire">Centre-Val de Loire</option>
        <option value="grand-est">Grand Est</option>
        <option value="hauts-de-france">Hauts-de-France</option>
        <option value="ile-de-france">Île-de-France</option>
        <option value="normandie">Normandie</option>
        <option value="nouvelle-aquitaine">Nouvelle-Aquitaine</option>
        <option value="occitanie">Occitanie</option>
        <option value="pays-de-la-loire">Pays de la Loire</option>
        <option value="provence-alpes-cote-d-azur">Provence-Alpes-Côte d’Azur</option>
      </select>
      <p class="field-error" data-error="zone"></p>

      <label class="protocol-check">
        <input type="checkbox" name="protocolAccepted">
        <span>J’accepte le <a href="${escapeHtml(variety.protocol.sourceUrl)}"
          target="_blank" rel="noopener">protocole de reproduction</a>.</span>
      </label>
      <p class="field-error" data-error="protocolAccepted"></p>

      <div class="request-notice" role="status" aria-live="polite"></div>
      <div class="request-actions">
        <button type="button" class="request-cancel">Annuler</button>
        <button type="submit" class="request-submit">Envoyer ma demande</button>
      </div>
    </form>`;
}

function openRequestDialog(variety, plant) {
  if (!canRequestVariety(variety)) return;
  closeLineagePanel();

  const overlay = document.createElement("div");
  overlay.className = "seed-request-overlay";
  overlay.innerHTML = requestDialogMarkup(variety, plant);
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const form = overlay.querySelector("form");
  const reason = form.elements.reason;
  reason.addEventListener("input", () => {
    form.querySelector("[data-reason-count]").textContent = reason.value.length;
  });
  form.addEventListener("submit", (event) => submitSeedRequest(event, variety, plant));
  form.querySelector(".request-close").addEventListener("click", closeRequestDialog);
  form.querySelector(".request-cancel").addEventListener("click", closeRequestDialog);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeRequestDialog();
  });
  reason.focus();
}

function closeRequestDialog() {
  document.querySelector(".seed-request-overlay")?.remove();
  document.body.style.overflow = document.querySelector("#overlay.ouvert") ? "hidden" : "";
}

function showValidation(form, errors) {
  form.querySelectorAll("[data-error]").forEach((node) => {
    node.textContent = errors[node.dataset.error] || "";
  });
}

function saveRequestLocally(request) {
  let requests = [];
  try {
    requests = JSON.parse(localStorage.getItem(REQUEST_STORAGE_KEY) || "[]");
    if (!Array.isArray(requests)) requests = [];
  } catch {
    requests = [];
  }
  localStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify([...requests.slice(-9), request]));
}

async function submitSeedRequest(event, variety, plant) {
  event.preventDefault();
  const form = event.currentTarget;
  const notice = form.querySelector(".request-notice");
  const submitButton = form.querySelector(".request-submit");
  const validation = validateSeedRequest({
    reason: form.elements.reason.value,
    zone: form.elements.zone.value,
    protocolAccepted: form.elements.protocolAccepted.checked,
  });

  showValidation(form, validation.errors);
  if (!validation.success) return;

  submitButton.disabled = true;
  notice.textContent = "Envoi en cours…";
  const request = {
    idempotencyKey: createIdempotencyKey(),
    varietyId: variety.id,
    plantId: plant.id,
    ...validation.data,
    createdAt: new Date().toISOString(),
  };

  try {
    const response = await fetchWithPolicy(
      `${NETWORK_CONFIG.apiBaseUrl}/requests`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": request.idempotencyKey,
        },
        body: JSON.stringify(request),
      },
      { timeoutMs: NETWORK_CONFIG.requestTimeoutMs, retries: 0 },
    );
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    notice.textContent = "Votre demande a bien été transmise.";
    form.reset();
  } catch (error) {
    saveRequestLocally({ ...request, status: "draft" });
    notice.textContent =
      "Le réseau est indisponible. Votre demande reste enregistrée sur cet appareil comme brouillon.";
    logEvent("info", "seed_request_saved_as_draft", {
      varietyId: variety.id,
      reason: error?.name || "unknown",
    });
  } finally {
    submitButton.disabled = false;
  }
}

async function enhancePlantModal(plant) {
  if (!NETWORK_CONFIG.featureEnabled) return;
  const modalBody = document.querySelector("#modale .modale-corps");
  if (!modalBody) return;

  const existingPartnerLink = modalBody.querySelector(".lien-achat");
  existingPartnerLink?.classList.add("partner-fallback");
  if (existingPartnerLink) {
    existingPartnerLink.childNodes[0].textContent = "Trouver graines / plants ";
  }

  const loading = document.createElement("section");
  loading.className = "seed-network seed-loading";
  loading.innerHTML = "<h3>🌱 Graines entre Primavores</h3><p>Recherche des variétés disponibles…</p>";
  existingPartnerLink?.before(loading);

  const result = await loadVarieties(plant.id);
  if (!loading.isConnected) return;
  loading.replaceWith(renderNetworkSection(plant, result.varieties, result.source));
}

window.ouvrirModale = function openPlantModalWithNetwork(plant) {
  legacyOpenPlantModal(plant);
  enhancePlantModal(plant);
};

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (document.querySelector(".seed-request-overlay")) closeRequestDialog();
  else closeLineagePanel();
});
