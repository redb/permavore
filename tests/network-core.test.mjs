import test from "node:test";
import assert from "node:assert/strict";
import {
  canRequestVariety,
  fetchWithPolicy,
  validateSeedRequest,
} from "../network-core.mjs";

test("rejects an incomplete seed request", () => {
  const result = validateSeedRequest({
    reason: "Trop court",
    zone: "inconnue",
    protocolAccepted: false,
  });

  assert.equal(result.success, false);
  assert.deepEqual(Object.keys(result.errors).sort(), [
    "protocolAccepted",
    "reason",
    "zone",
  ]);
});

test("normalizes and accepts a complete seed request", () => {
  const result = validateSeedRequest({
    reason: "  Je souhaite maintenir cette variété dans mon potager familial.  ",
    zone: "auvergne-rhone-alpes",
    protocolAccepted: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.data.reason.startsWith("Je souhaite"), true);
});

test("requires availability and a sourced protocol", () => {
  assert.equal(canRequestVariety({ availableOffers: 1, protocol: { sourceUrl: "https://example.test" } }), true);
  assert.equal(canRequestVariety({ availableOffers: 0, protocol: { sourceUrl: "https://example.test" } }), false);
  assert.equal(canRequestVariety({ availableOffers: 1, protocol: {} }), false);
});

test("retries one transient read failure", async () => {
  let calls = 0;
  const response = await fetchWithPolicy("https://example.test", {}, {
    timeoutMs: 50,
    retries: 1,
    fetchImpl: async () => {
      calls += 1;
      return { ok: calls === 2, status: calls === 2 ? 200 : 503 };
    },
  });

  assert.equal(response.ok, true);
  assert.equal(calls, 2);
});

test("does not exceed two retries", async () => {
  let calls = 0;
  const response = await fetchWithPolicy("https://example.test", {}, {
    timeoutMs: 50,
    retries: 9,
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 503 };
    },
  });

  assert.equal(response.status, 503);
  assert.equal(calls, 3);
});
