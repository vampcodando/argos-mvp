const BYTEPLUS_IMAGE_ENDPOINT =
  "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations";
const BYTEPLUS_VIDEO_ENDPOINT =
  "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";

const IMAGE_POOL = Object.freeze([
  Object.freeze({
    key: "seedream-4.5",
    name: "ByteDance Seedream 4.5",
    modelId: "seedream-4-5-251128",
    priority: 1,
    initialFreeQuota: 200,
    quotaUnit: "piece",
    supportedSizes: ["2K", "4K"],
    outputFormat: null,
  }),
  Object.freeze({
    key: "seedream-4.0",
    name: "ByteDance Seedream 4.0",
    modelId: "seedream-4-0-250828",
    priority: 2,
    initialFreeQuota: 200,
    quotaUnit: "piece",
    supportedSizes: ["1K", "2K", "4K"],
    outputFormat: null,
  }),
  Object.freeze({
    key: "seedream-5.0-lite",
    name: "Dola Seedream 5.0 Lite",
    modelId: "seedream-5-0-260128",
    priority: 3,
    initialFreeQuota: 50,
    quotaUnit: "piece",
    supportedSizes: ["2K", "3K", "4K"],
    outputFormat: "jpeg",
  }),
]);

const VIDEO_POOL = Object.freeze([
  Object.freeze({
    key: "seedance-1.5-pro",
    name: "ByteDance Seedance 1.5 Pro",
    modelId: "seedance-1-5-pro-251215",
    priority: 1,
    initialFreeQuota: 2_000_000,
    quotaUnit: "tokens",
    supportsAudio: true,
  }),
  Object.freeze({
    key: "seedance-1.0-pro-fast",
    name: "ByteDance Seedance 1.0 Pro Fast",
    modelId: "seedance-1-0-pro-fast-251015",
    priority: 2,
    initialFreeQuota: 2_000_000,
    quotaUnit: "tokens",
    supportsAudio: false,
  }),
  Object.freeze({
    key: "seedance-1.0-pro",
    name: "ByteDance Seedance 1.0 Pro",
    modelId: "seedance-1-0-pro-250528",
    priority: 3,
    initialFreeQuota: 2_000_000,
    quotaUnit: "tokens",
    supportsAudio: false,
  }),
]);

const BLOCKED_DATA_CLASSES = new Set([
  "secret_or_token",
  "athlete_data",
  "family_data",
  "health_data",
  "personal_data",
  "social_report",
  "institutional_document",
  "database_content",
  "source_code",
  "technical_log",
]);

const MAX_PROMPT_CHARACTERS = 12_000;
const MAX_REFERENCE_IMAGES = 14;
const MAX_DATA_URL_CHARACTERS = 12_000_000;
const FETCH_TIMEOUT_MS = 180_000;

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

function getApiKey(env) {
  const value = String(env?.BYTEPLUS_ARK_API_KEY || "").trim();
  return value || null;
}

function evaluatePolicy(body) {
  const dataClass = String(body?.dataClass || "creative_asset").trim();

  if (BLOCKED_DATA_CLASSES.has(dataClass)) {
    return {
      allowed: false,
      dataClass,
      reason: "Esta classe de dados nao pode ser enviada ao Media Pool cloud.",
    };
  }

  return { allowed: true, dataClass };
}

function normalizePrompt(value) {
  const prompt = String(value || "").trim();

  if (!prompt) {
    throw new Error("Prompt vazio.");
  }

  if (prompt.length > MAX_PROMPT_CHARACTERS) {
    throw new Error(
      `Prompt ultrapassou ${MAX_PROMPT_CHARACTERS} caracteres.`
    );
  }

  return prompt;
}

function normalizeReferenceImages(body) {
  const raw = Array.isArray(body?.images)
    ? body.images
    : body?.image
      ? [body.image]
      : [];

  if (raw.length > MAX_REFERENCE_IMAGES) {
    throw new Error(
      `Envie no maximo ${MAX_REFERENCE_IMAGES} imagens de referencia.`
    );
  }

  return raw.map((value) => {
    const url = String(value || "").trim();

    if (!url) {
      throw new Error("Imagem de referencia vazia.");
    }

    if (url.startsWith("data:image/")) {
      if (url.length > MAX_DATA_URL_CHARACTERS) {
        throw new Error("Imagem Base64 ultrapassou o limite do Media Pool.");
      }
      return url;
    }

    if (!/^https:\/\//i.test(url)) {
      throw new Error("Imagem de referencia deve usar HTTPS ou data URL.");
    }

    return url;
  });
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

async function fetchWithTimeout(url, options, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readProviderResponse(response) {
  const rawText = await response.text();
  let data = {};

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }

  const code = String(data?.error?.code || data?.code || "").trim();
  const message = String(
    data?.error?.message || data?.message || rawText || "Falha sem descricao."
  )
    .trim()
    .slice(0, 1500);

  return { data, code, message };
}

function classifyFailure(status, code, message) {
  const haystack = `${code} ${message}`.toLowerCase();

  if (
    code === "QuotaExceeded" ||
    /quota exceeded|free credit|free token|insufficient.*credit|credit.*exhaust|quota.*exhaust/.test(
      haystack
    )
  ) {
    return { code: "QUOTA_EXHAUSTED", fallback: true };
  }

  if (/modelnotopen|model not open|not activated/.test(haystack)) {
    return { code: "MODEL_NOT_OPEN", fallback: true };
  }

  if (
    /sensitivecontentdetected|sensitive content|moderation/.test(haystack)
  ) {
    return { code: "CONTENT_BLOCKED", fallback: false };
  }

  if (status === 429) {
    return { code: "RATE_LIMITED", fallback: true };
  }

  if (status === 408 || status >= 500) {
    return { code: "UPSTREAM_TEMPORARY", fallback: true };
  }

  if (status === 401 || status === 403) {
    return { code: "AUTH_OR_PERMISSION", fallback: false };
  }

  return { code: "UPSTREAM_REJECTED", fallback: false };
}

function normalizeImageSize(requestedSize, model) {
  const size = String(requestedSize || "2K").toUpperCase();
  return model.supportedSizes.includes(size) ? size : "2K";
}

function buildImageRequestBody(model, body, prompt, images) {
  const payload = {
    model: model.modelId,
    prompt,
    size: normalizeImageSize(body?.size, model),
    response_format: "url",
    watermark: body?.watermark === true,
    sequential_image_generation: "disabled",
  };

  if (images.length === 1) {
    payload.image = images[0];
  } else if (images.length > 1) {
    payload.image = images;
  }

  if (model.outputFormat) {
    const requested = String(body?.outputFormat || model.outputFormat).toLowerCase();
    payload.output_format = ["png", "jpeg"].includes(requested)
      ? requested
      : model.outputFormat;
  }

  return payload;
}

async function generateImage(apiKey, body, prompt, images) {
  const attempts = [];

  for (const model of IMAGE_POOL) {
    const startedAt = Date.now();
    const requestBody = buildImageRequestBody(model, body, prompt, images);

    let response;
    let provider;

    try {
      response = await fetchWithTimeout(BYTEPLUS_IMAGE_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      provider = await readProviderResponse(response);
    } catch (error) {
      attempts.push({
        modelKey: model.key,
        modelId: model.modelId,
        ok: false,
        code: "NETWORK_OR_TIMEOUT",
        latencyMs: Date.now() - startedAt,
        reason: error instanceof Error ? error.message : "Falha de rede.",
      });
      continue;
    }

    if (response.ok) {
      const item = Array.isArray(provider.data?.data)
        ? provider.data.data[0]
        : null;
      const url = String(item?.url || "").trim();

      if (!url) {
        attempts.push({
          modelKey: model.key,
          modelId: model.modelId,
          ok: false,
          code: "INVALID_PROVIDER_RESPONSE",
          latencyMs: Date.now() - startedAt,
        });
        continue;
      }

      attempts.push({
        modelKey: model.key,
        modelId: model.modelId,
        ok: true,
        latencyMs: Date.now() - startedAt,
      });

      return {
        ok: true,
        mediaType: "image",
        provider: "byteplus",
        freeOnly: true,
        modelKey: model.key,
        modelId: model.modelId,
        fallbackUsed: attempts.length > 1,
        attempts,
        image: {
          url,
          size: item?.size || null,
        },
        usage: provider.data?.usage || null,
      };
    }

    const failure = classifyFailure(
      response.status,
      provider.code,
      provider.message
    );

    attempts.push({
      modelKey: model.key,
      modelId: model.modelId,
      ok: false,
      code: failure.code,
      upstreamStatus: response.status,
      upstreamCode: provider.code || null,
      latencyMs: Date.now() - startedAt,
      reason: provider.message,
    });

    if (!failure.fallback) {
      return {
        ok: false,
        mediaType: "image",
        provider: "byteplus",
        freeOnly: true,
        attempts,
        reason: provider.message,
        code: failure.code,
      };
    }
  }

  return {
    ok: false,
    mediaType: "image",
    provider: "byteplus",
    freeOnly: true,
    attempts,
    code: "POOL_EXHAUSTED",
    reason: "Nenhum modelo gratuito de imagem ficou disponivel.",
  };
}

function buildVideoRequestBody(model, body, prompt, images) {
  const content = [{ type: "text", text: prompt }];

  for (const image of images.slice(0, 2)) {
    content.push({
      type: "image_url",
      image_url: { url: image },
    });
  }

  const payload = {
    model: model.modelId,
    content,
    resolution: ["480p", "720p", "1080p"].includes(body?.resolution)
      ? body.resolution
      : "720p",
    ratio: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"].includes(
      body?.ratio
    )
      ? body.ratio
      : "16:9",
    duration: clampInteger(body?.duration, 5, 2, 12),
  };

  if (model.supportsAudio) {
    payload.generate_audio = body?.generateAudio === true;
    if (body?.draft === true && payload.resolution === "480p") {
      payload.draft = true;
    }
  }

  return payload;
}

async function generateVideo(apiKey, body, prompt, images) {
  const attempts = [];

  for (const model of VIDEO_POOL) {
    const startedAt = Date.now();
    const requestBody = buildVideoRequestBody(model, body, prompt, images);

    let response;
    let provider;

    try {
      response = await fetchWithTimeout(BYTEPLUS_VIDEO_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      provider = await readProviderResponse(response);
    } catch (error) {
      attempts.push({
        modelKey: model.key,
        modelId: model.modelId,
        ok: false,
        code: "NETWORK_OR_TIMEOUT",
        latencyMs: Date.now() - startedAt,
        reason: error instanceof Error ? error.message : "Falha de rede.",
      });
      continue;
    }

    if (response.ok) {
      const taskId = String(provider.data?.id || "").trim();

      if (!taskId) {
        attempts.push({
          modelKey: model.key,
          modelId: model.modelId,
          ok: false,
          code: "INVALID_PROVIDER_RESPONSE",
          latencyMs: Date.now() - startedAt,
        });
        continue;
      }

      attempts.push({
        modelKey: model.key,
        modelId: model.modelId,
        ok: true,
        latencyMs: Date.now() - startedAt,
      });

      return {
        ok: true,
        mediaType: "video",
        provider: "byteplus",
        freeOnly: true,
        modelKey: model.key,
        modelId: model.modelId,
        fallbackUsed: attempts.length > 1,
        attempts,
        task: {
          id: taskId,
          status: provider.data?.status || "queued",
        },
      };
    }

    const failure = classifyFailure(
      response.status,
      provider.code,
      provider.message
    );

    attempts.push({
      modelKey: model.key,
      modelId: model.modelId,
      ok: false,
      code: failure.code,
      upstreamStatus: response.status,
      upstreamCode: provider.code || null,
      latencyMs: Date.now() - startedAt,
      reason: provider.message,
    });

    if (!failure.fallback) {
      return {
        ok: false,
        mediaType: "video",
        provider: "byteplus",
        freeOnly: true,
        attempts,
        reason: provider.message,
        code: failure.code,
      };
    }
  }

  return {
    ok: false,
    mediaType: "video",
    provider: "byteplus",
    freeOnly: true,
    attempts,
    code: "POOL_EXHAUSTED",
    reason: "Nenhum modelo gratuito de video ficou disponivel.",
  };
}

export async function onRequestPost({ request, env }) {
  const apiKey = getApiKey(env);

  if (!apiKey) {
    return json(
      {
        ok: false,
        service: "argos-media-pool",
        code: "NOT_CONFIGURED",
        reason: "Secret BYTEPLUS_ARK_API_KEY ausente.",
      },
      503
    );
  }

  let body = {};

  try {
    body = await request.json();
  } catch {
    return json({ ok: false, code: "INVALID_JSON", reason: "JSON invalido." }, 400);
  }

  const policy = evaluatePolicy(body);

  if (!policy.allowed) {
    return json(
      {
        ok: false,
        blocked: true,
        code: "POLICY_BLOCKED",
        dataClass: policy.dataClass,
        reason: policy.reason,
      },
      403
    );
  }

  const mediaType = String(body?.mediaType || body?.type || "image")
    .trim()
    .toLowerCase();

  if (!["image", "video"].includes(mediaType)) {
    return json(
      { ok: false, code: "INVALID_MEDIA_TYPE", reason: "Use image ou video." },
      400
    );
  }

  let prompt;
  let images;

  try {
    prompt = normalizePrompt(body?.prompt);
    images = normalizeReferenceImages(body);
  } catch (error) {
    return json(
      {
        ok: false,
        code: "INVALID_INPUT",
        reason: error instanceof Error ? error.message : "Entrada invalida.",
      },
      400
    );
  }

  const result =
    mediaType === "image"
      ? await generateImage(apiKey, body, prompt, images)
      : await generateVideo(apiKey, body, prompt, images);

  if (result.ok) {
    return json(result, mediaType === "video" ? 202 : 200);
  }

  const status = result.code === "CONTENT_BLOCKED" ? 400 : 503;
  return json(result, status);
}
