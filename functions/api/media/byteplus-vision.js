const BYTEPLUS_VISION_HOST = "cv.byteplusapi.com";
const BYTEPLUS_VISION_REGION = "ap-singapore-1";
const BYTEPLUS_VISION_SERVICE = "cv";
const BYTEPLUS_VISION_VERSION = "2024-06-06";

const ALLOWED_ACTIONS = new Set([
  "CVProcess",
  "CVSubmitTask",
  "CVGetResult",
  "CVCancelTask",
]);

const DEFAULT_TIMEOUT_MS = 30_000;

const encoder = new TextEncoder();

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function rfc3986Encode(value) {
  return encodeURIComponent(String(value)).replace(
    /[!'()*]/g,
    (character) =>
      "%" + character.charCodeAt(0).toString(16).toUpperCase()
  );
}

function buildCanonicalQuery(parameters) {
  return Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${rfc3986Encode(key)}=${rfc3986Encode(value)}`
    )
    .join("&");
}

function buildXDate(date = new Date()) {
  return date
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value)
  );

  return toHex(digest);
}

async function hmacSha256(key, value) {
  const rawKey =
    typeof key === "string"
      ? encoder.encode(key)
      : key;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(value)
  );

  return new Uint8Array(signature);
}

export function hasBytePlusVisionCredentials(env) {
  const accessKey = String(
    env?.BYTEPLUS_ACCESS_KEY || ""
  ).trim();

  const secretKey = String(
    env?.BYTEPLUS_SECRET_KEY || ""
  ).trim();

  return Boolean(accessKey && secretKey);
}

function getVisionCredentials(env) {
  const accessKey = String(
    env?.BYTEPLUS_ACCESS_KEY || ""
  ).trim();

  const secretKey = String(
    env?.BYTEPLUS_SECRET_KEY || ""
  ).trim();

  if (!accessKey || !secretKey) {
    throw new Error(
      "Credenciais BytePlus Vision API nao configuradas."
    );
  }

  return {
    accessKey,
    secretKey,
  };
}

async function buildSignedRequest({
  accessKey,
  secretKey,
  action,
  body,
}) {
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(
      `Acao BytePlus Vision nao permitida: ${action}`
    );
  }

  const query = buildCanonicalQuery({
    Action: action,
    Version: BYTEPLUS_VISION_VERSION,
  });

  const requestBody = JSON.stringify(body || {});
  const payloadHash = await sha256Hex(requestBody);

  const xDate = buildXDate();
  const shortDate = xDate.slice(0, 8);

  const canonicalHeaders = [
    "content-type:application/json",
    `host:${BYTEPLUS_VISION_HOST}`,
    `x-content-sha256:${payloadHash}`,
    `x-date:${xDate}`,
    "",
  ].join("\n");

  const signedHeaders =
    "content-type;host;x-content-sha256;x-date";

  const canonicalRequest = [
    "POST",
    "/",
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const hashedCanonicalRequest =
    await sha256Hex(canonicalRequest);

  const credentialScope = [
    shortDate,
    BYTEPLUS_VISION_REGION,
    BYTEPLUS_VISION_SERVICE,
    "request",
  ].join("/");

  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    credentialScope,
    hashedCanonicalRequest,
  ].join("\n");

  const kDate = await hmacSha256(
    secretKey,
    shortDate
  );

  const kRegion = await hmacSha256(
    kDate,
    BYTEPLUS_VISION_REGION
  );

  const kService = await hmacSha256(
    kRegion,
    BYTEPLUS_VISION_SERVICE
  );

  const kSigning = await hmacSha256(
    kService,
    "request"
  );

  const signatureBytes = await hmacSha256(
    kSigning,
    stringToSign
  );

  const signature = toHex(signatureBytes);

  const authorization = [
    `HMAC-SHA256 Credential=${accessKey}/${credentialScope},`,
    `SignedHeaders=${signedHeaders},`,
    `Signature=${signature}`,
  ].join(" ");

  return {
    url:
      `https://${BYTEPLUS_VISION_HOST}/?${query}`,
    body: requestBody,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-date": xDate,
      "x-content-sha256": payloadHash,
      authorization,
    },
  };
}

export async function requestBytePlusVision({
  env,
  action,
  body,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const {
    accessKey,
    secretKey,
  } = getVisionCredentials(env);

  const signed = await buildSignedRequest({
    accessKey,
    secretKey,
    action,
    body,
  });

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
      signal: controller.signal,
    });

    const rawText = await response.text();

    let data = {};

    try {
      data = rawText
        ? JSON.parse(rawText)
        : {};
    } catch {
      data = {};
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      rawText,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const BYTEPLUS_VISION = Object.freeze({
  host: BYTEPLUS_VISION_HOST,
  region: BYTEPLUS_VISION_REGION,
  service: BYTEPLUS_VISION_SERVICE,
  version: BYTEPLUS_VISION_VERSION,
});