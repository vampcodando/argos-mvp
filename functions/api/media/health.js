const IMAGE_POOL = Object.freeze([
  Object.freeze({ key: "seedream-4.5", modelId: "seedream-4-5-251128", priority: 1, initialFreeQuota: 200, quotaUnit: "piece" }),
  Object.freeze({ key: "seedream-4.0", modelId: "seedream-4-0-250828", priority: 2, initialFreeQuota: 200, quotaUnit: "piece" }),
  Object.freeze({ key: "seedream-5.0-lite", modelId: "seedream-5-0-260128", priority: 3, initialFreeQuota: 50, quotaUnit: "piece" }),
]);

const VIDEO_POOL = Object.freeze([
  Object.freeze({ key: "seedance-1.5-pro", modelId: "seedance-1-5-pro-251215", priority: 1, initialFreeQuota: 2_000_000, quotaUnit: "tokens" }),
  Object.freeze({ key: "seedance-1.0-pro-fast", modelId: "seedance-1-0-pro-fast-251015", priority: 2, initialFreeQuota: 2_000_000, quotaUnit: "tokens" }),
  Object.freeze({ key: "seedance-1.0-pro", modelId: "seedance-1-0-pro-250528", priority: 3, initialFreeQuota: 2_000_000, quotaUnit: "tokens" }),
]);

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

export async function onRequestGet({ env }) {
  const configured =
    typeof env?.BYTEPLUS_ARK_API_KEY === "string" &&
    env.BYTEPLUS_ARK_API_KEY.trim().length > 0;

  return json({
    ok: true,
    service: "argos-media-pool",
    version: "v0.1-byteplus",
    provider: "byteplus",
    mode: "free-only-fail-closed",
    ready: configured,
    configured,
    routing: {
      image: IMAGE_POOL,
      video: VIDEO_POOL,
    },
    quotaPolicy: {
      sourceOfTruth: "BytePlus Free Credits Only Mode",
      rotationTrigger: "QuotaExceeded or retryable provider failure",
      automaticPaidFallback: false,
      note: "initialFreeQuota is static metadata, not a live remaining-balance reading.",
    },
  });
}
