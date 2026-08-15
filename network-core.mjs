const MAX_REASON_LENGTH = 500;
const ALLOWED_ZONES = new Set([
  "auvergne-rhone-alpes",
  "bourgogne-franche-comte",
  "bretagne",
  "centre-val-de-loire",
  "grand-est",
  "hauts-de-france",
  "ile-de-france",
  "normandie",
  "nouvelle-aquitaine",
  "occitanie",
  "pays-de-la-loire",
  "provence-alpes-cote-d-azur",
]);

export function validateSeedRequest(input) {
  const errors = {};
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const zone = typeof input.zone === "string" ? input.zone : "";

  if (reason.length < 20) {
    errors.reason = "Expliquez votre projet en au moins 20 caractères.";
  } else if (reason.length > MAX_REASON_LENGTH) {
    errors.reason = `Votre message ne peut pas dépasser ${MAX_REASON_LENGTH} caractères.`;
  }

  if (!ALLOWED_ZONES.has(zone)) {
    errors.zone = "Choisissez une zone d’envoi valide.";
  }

  if (input.protocolAccepted !== true) {
    errors.protocolAccepted = "Le protocole doit être accepté.";
  }

  return {
    success: Object.keys(errors).length === 0,
    data: { reason, zone, protocolAccepted: input.protocolAccepted === true },
    errors,
  };
}

export function canRequestVariety(variety) {
  return Boolean(variety && variety.availableOffers > 0 && variety.protocol?.sourceUrl);
}

export function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function fetchWithPolicy(
  url,
  options = {},
  { timeoutMs = 4000, retries = 1, fetchImpl = fetch } = {},
) {
  let lastError;
  const maxRetries = Math.min(retries, 2);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      if (response.ok || response.status < 500 || attempt === maxRetries) return response;
      lastError = new Error(`HTTP_${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}
