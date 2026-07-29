const NVIDIA_CHAT_ENDPOINT =
  "https://integrate.api.nvidia.com/v1/chat/completions";

const DEFAULT_MODEL = "nvidia/nemotron-nano-12b-v2-vl";
const DEEP_MODEL = "minimaxai/minimax-m3";

const APPROVED_MODELS = new Set([DEFAULT_MODEL, DEEP_MODEL]);
const APPROVED_MODES = new Set([
  "creative_analysis",
  "ocr_exact",
  "technical_prompt",
]);

const ALLOWED_PROJECT_KINDS = new Set([
  "marketing",
  "bruna",
  "bigboom",
  "qualyshape",
  "tiktok",
  "ugc",
]);

const ALLOWED_DATA_CLASSES = new Set([
  "public_marketing",
  "creative_asset",
]);

const BLOCKED_PROJECT_KINDS = new Set([
  "servico_social",
  "alojamento_celeiro",
  "institutional_internal",
  "source_code",
  "technical_log",
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
]);

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
]);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DEEP_MODEL_IMAGE_BYTES = 500 * 1024;
const MAX_PROMPT_CHARACTERS = 20000;

function json(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers(extraHeaders);

  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");

  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers,
  });
}

function clampNumber(value, fallback, minimum, maximum) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(Math.max(numericValue, minimum), maximum);
}

function evaluatePolicy(projectKind, dataClass) {
  if (BLOCKED_PROJECT_KINDS.has(projectKind)) {
    return `Projeto bloqueado para visão cloud: ${projectKind}.`;
  }

  if (BLOCKED_DATA_CLASSES.has(dataClass)) {
    return `Classe de dado bloqueada para visão cloud: ${dataClass}.`;
  }

  if (!ALLOWED_PROJECT_KINDS.has(projectKind)) {
    return `Projeto não autorizado para visão cloud: ${projectKind}.`;
  }

  if (!ALLOWED_DATA_CLASSES.has(dataClass)) {
    return `Classe de dado não autorizada para visão cloud: ${dataClass}.`;
  }

  return null;
}

function normalizeBase64(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  const commaIndex = raw.indexOf(",");
  const base64 =
    raw.startsWith("data:") && commaIndex >= 0
      ? raw.slice(commaIndex + 1)
      : raw;

  return base64.replace(/\s+/g, "");
}

function estimateDecodedBytes(base64) {
  if (!base64) {
    return 0;
  }

  const padding = base64.endsWith("==")
    ? 2
    : base64.endsWith("=")
      ? 1
      : 0;

  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function buildModeInstruction(mode) {
  if (mode === "ocr_exact") {
    return [
      "Analise diretamente os pixels da imagem recebida.",
      "Transcreva somente o texto realmente visível.",
      "Preserve letras maiúsculas e minúsculas, números, hífens, acentos, espaços, quebras de linha e pontuação.",
      "Não complete caracteres pelo contexto e não invente trechos.",
      "Quando houver ambiguidade visual real, marque apenas o trecho incerto.",
      "Responda em português brasileiro.",
    ].join("\n");
  }

  if (mode === "technical_prompt") {
    return [
      "Analise diretamente os pixels da imagem recebida.",
      "Use a imagem como referência visual obrigatória para produzir o prompt técnico solicitado pelo usuário.",
      "Preserve personagem, roupas, produto, cores, cenário, iluminação e enquadramento realmente visíveis.",
      "Separe fatos visuais de informações fornecidas em texto.",
      "Nunca invente composição, medidas, materiais, acabamento, acessórios ou características técnicas ausentes.",
      "Quando uma característica não puder ser confirmada, declare a incerteza em vez de completar por suposição.",
      "Siga integralmente o formato solicitado pelo usuário.",
      "Responda em português brasileiro.",
    ].join("\n");
  }

  return [
    "Analise diretamente os pixels da imagem recebida.",
    "Descreva apenas elementos realmente visíveis.",
    "Não invente identidade, profissão, idade exata, contexto ou função de objetos incertos.",
    "Diferencie observação visual de inferência.",
    "Quando houver dúvida, diga que não é possível confirmar pela imagem.",
    "Examine roupas, postura, mãos, objetos, ambiente, iluminação, composição e possíveis artefatos de geração ou edição por IA.",
    "Responda em português brasileiro.",
  ].join("\n");
}

function extractResponseText(data) {
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (typeof part?.text === "string") {
          return part.text;
        }

        if (typeof part?.content === "string") {
          return part.content;
        }

        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

function extractUpstreamError(data, rawText) {
  const candidates = [
    data?.error?.message,
    data?.message,
    data?.error,
    rawText,
  ];

  const message = candidates.find(
    (value) => typeof value === "string" && value.trim()
  );

  return message
    ? message.trim().slice(0, 1200)
    : "A NVIDIA respondeu com erro sem descrição.";
}

function chooseModel(body, estimatedImageBytes) {
  const requestedModel = String(body?.model || "").trim();

  if (requestedModel) {
    if (!APPROVED_MODELS.has(requestedModel)) {
      throw new Error("O modelo visual solicitado não está aprovado pelo ARGOS.");
    }

    if (
      requestedModel === DEEP_MODEL &&
      estimatedImageBytes > MAX_DEEP_MODEL_IMAGE_BYTES
    ) {
      throw new Error(
        "A imagem precisa ser reduzida para usar a análise profunda do MiniMax."
      );
    }

    return requestedModel;
  }

  const analysisLevel = String(body?.analysisLevel || "standard").trim();

  if (
    analysisLevel === "deep" &&
    estimatedImageBytes <= MAX_DEEP_MODEL_IMAGE_BYTES
  ) {
    return DEEP_MODEL;
  }

  return DEFAULT_MODEL;
}

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    service: "argos-nvidia-vision-provider",
    enabled: Boolean(env.NVIDIA_API_KEY),
    keyPresent: Boolean(env.NVIDIA_API_KEY),
    ready: Boolean(env.NVIDIA_API_KEY),
    defaultModel: DEFAULT_MODEL,
    deepModel: DEEP_MODEL,
    approvedModels: Array.from(APPROVED_MODELS),
    approvedModes: Array.from(APPROVED_MODES),
    supportedImageTypes: Array.from(SUPPORTED_IMAGE_TYPES),
    maximumImageBytes: MAX_IMAGE_BYTES,
    maximumDeepModelImageBytes: MAX_DEEP_MODEL_IMAGE_BYTES,
    sensitiveDataLocalOnly: true,
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.NVIDIA_API_KEY) {
    return json(
      {
        ok: false,
        code: "NVIDIA_VISION_NOT_READY",
        provider: "nvidia_vision",
        reason:
          "O backend não possui o secret NVIDIA_API_KEY.",
      },
      503
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        code: "INVALID_JSON",
        provider: "nvidia_vision",
        reason: "O corpo da requisição não contém JSON válido.",
      },
      400
    );
  }

  const projectKind = String(body?.projectKind || "marketing").trim();
  const dataClass = String(body?.dataClass || "creative_asset").trim();
  const blockedReason = evaluatePolicy(projectKind, dataClass);

  if (blockedReason) {
    return json(
      {
        ok: false,
        blocked: true,
        code: "VISION_POLICY_BLOCKED",
        provider: "nvidia_vision",
        reason: blockedReason,
      },
      403
    );
  }

  const mode = String(body?.mode || "creative_analysis").trim();

  if (!APPROVED_MODES.has(mode)) {
    return json(
      {
        ok: false,
        code: "INVALID_VISION_MODE",
        provider: "nvidia_vision",
        reason:
          "Modo visual inválido. Use creative_analysis, ocr_exact ou technical_prompt.",
      },
      400
    );
  }

  const prompt = String(body?.prompt || "").trim();

  if (!prompt) {
    return json(
      {
        ok: false,
        code: "EMPTY_PROMPT",
        provider: "nvidia_vision",
        reason: "Prompt visual vazio.",
      },
      400
    );
  }

  if (prompt.length > MAX_PROMPT_CHARACTERS) {
    return json(
      {
        ok: false,
        code: "PROMPT_TOO_LARGE",
        provider: "nvidia_vision",
        reason: `O prompt visual ultrapassa ${MAX_PROMPT_CHARACTERS} caracteres.`,
      },
      413
    );
  }

  const mimeType = String(body?.mimeType || "")
    .trim()
    .toLowerCase();

  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    return json(
      {
        ok: false,
        code: "UNSUPPORTED_IMAGE_TYPE",
        provider: "nvidia_vision",
        reason: "Formato não suportado. Use PNG, JPEG ou GIF.",
      },
      415
    );
  }

  const imageBase64 = normalizeBase64(
    body?.imageBase64 || body?.imageDataUrl
  );

  if (!imageBase64) {
    return json(
      {
        ok: false,
        code: "IMAGE_REQUIRED",
        provider: "nvidia_vision",
        reason: "Envie imageBase64 ou imageDataUrl.",
      },
      400
    );
  }

  const estimatedImageBytes = estimateDecodedBytes(imageBase64);

  if (!estimatedImageBytes || estimatedImageBytes > MAX_IMAGE_BYTES) {
    return json(
      {
        ok: false,
        code: "IMAGE_TOO_LARGE",
        provider: "nvidia_vision",
        reason: `A imagem deve possuir no máximo ${Math.floor(
          MAX_IMAGE_BYTES / (1024 * 1024)
        )} MB.`,
        estimatedImageBytes,
      },
      413
    );
  }

  let model;

  try {
    model = chooseModel(body, estimatedImageBytes);
  } catch (error) {
    return json(
      {
        ok: false,
        code: "INVALID_VISION_MODEL",
        provider: "nvidia_vision",
        reason:
          error instanceof Error
            ? error.message
            : "Modelo visual inválido.",
      },
      400
    );
  }

  const timeoutMs = clampNumber(
    body?.timeoutMs,
    model === DEEP_MODEL ? 180000 : 120000,
    10000,
    240000
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  const instruction = buildModeInstruction(mode);
  const imageDataUrl = `data:${mimeType};base64,${imageBase64}`;

  try {
    const upstreamResponse = await fetch(NVIDIA_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.NVIDIA_API_KEY}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl,
                },
              },
              {
                type: "text",
                text: `${instruction}\n\nPEDIDO DO USUÁRIO:\n${prompt}`,
              },
            ],
          },
        ],
        temperature: clampNumber(body?.temperature, 0, 0, 2),
        top_p: clampNumber(body?.top_p, 0.95, 0.01, 1),
        max_tokens: clampNumber(body?.max_tokens, 4096, 128, 16384),
        stream: false,
      }),
    });

    const rawText = await upstreamResponse.text();
    let data;

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { raw: rawText };
    }

    if (!upstreamResponse.ok) {
      const exposedStatus = [401, 403, 413, 415, 429].includes(
        upstreamResponse.status
      )
        ? upstreamResponse.status
        : 502;

      return json(
        {
          ok: false,
          code: "NVIDIA_VISION_PROVIDER_ERROR",
          provider: "nvidia_vision",
          model,
          upstreamStatus: upstreamResponse.status,
          reason: extractUpstreamError(data, rawText),
          elapsedMs: Date.now() - startedAt,
        },
        exposedStatus
      );
    }

    const responseText = extractResponseText(data);

    if (!responseText) {
      return json(
        {
          ok: false,
          code: "EMPTY_VISION_RESPONSE",
          provider: "nvidia_vision",
          model,
          reason:
            "O modelo visual respondeu, mas não retornou conteúdo utilizável.",
          elapsedMs: Date.now() - startedAt,
        },
        502
      );
    }

    return json({
      ok: true,
      route: "nvidia_vision",
      provider: "nvidia",
      model: String(data?.model || model),
      mode,
      fileName:
        typeof body?.fileName === "string"
          ? body.fileName.slice(0, 255)
          : null,
      response: responseText,
      usage: data?.usage || null,
      imageBytes: estimatedImageBytes,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const timedOut = error?.name === "AbortError";

    return json(
      {
        ok: false,
        code: timedOut
          ? "NVIDIA_VISION_TIMEOUT"
          : "NVIDIA_VISION_REQUEST_FAILED",
        provider: "nvidia_vision",
        model,
        reason: timedOut
          ? `A análise visual ultrapassou ${timeoutMs} ms.`
          : error instanceof Error
            ? error.message
            : "Falha desconhecida na análise visual.",
        elapsedMs: Date.now() - startedAt,
      },
      timedOut ? 504 : 502
    );
  } finally {
    clearTimeout(timeout);
  }
}
