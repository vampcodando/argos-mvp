import {
  BYTEPLUS_VISION,
  hasBytePlusVisionCredentials,
} from "./byteplus-vision.js";

const OMNIHUMAN = Object.freeze({
  key: "omnihuman-1.5",
  name: "Dreamina OmniHuman 1.5",
  provider: "byteplus-vision",
  reqKey: "realman_avatar_picture_omni15_cv",
  detectReqKey: "realman_avatar_object_detection_cv",
});

function json(payload, status = 200) {
  return new Response(
    JSON.stringify(payload, null, 2),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    }
  );
}

export async function onRequestGet({ env }) {
  const configured =
    hasBytePlusVisionCredentials(env);

  return json({
    ok: true,
    service: "argos-media-omnihuman",
    version: "v0.1-discovery",
    ready: configured,
    configured,
    provider: OMNIHUMAN.provider,
    model: {
      key: OMNIHUMAN.key,
      name: OMNIHUMAN.name,
      reqKey: OMNIHUMAN.reqKey,
      detectReqKey: OMNIHUMAN.detectReqKey,
    },
    visionApi: {
      host: BYTEPLUS_VISION.host,
      region: BYTEPLUS_VISION.region,
      service: BYTEPLUS_VISION.service,
      version: BYTEPLUS_VISION.version,
      authentication: "HMAC-SHA256",
    },
    quotaPolicy: {
      mode: "free-trial-guarded",
      initialTrialSeconds: 100,
      remainingTrialSeconds: null,
      sourceOfTruth: "BytePlus console",
      automaticPaidFallback: false,
      note:
        "100 segundos representam o trial inicial observado. O ARGOS nao assume saldo restante em tempo real.",
    },
    nextStep: configured
      ? "provider-auth-test"
      : "configure-byteplus-vision-credentials",
  });
}