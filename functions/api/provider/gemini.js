const APPROVED_GEMINI_MODELS = [
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    mode: "prompt_builder",
    role: "CONSTRUTOR DE PROMPT / JSON",
    description:
      "Use para construir prompts, comandos JSON, roteiros, variações, prompts negativos e instruções para imagem/vídeo. Não gera imagem final.",
  },
  {
    id: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    mode: "image_generation",
    role: "GERADOR / EDITOR DE IMAGEM",
    description:
      "Use somente para gerar ou editar imagem final em projetos de marketing. Cota visual mais valiosa.",
  },
];

const ALLOWED_PROJECT_KINDS = new Set([
  "marketing",
  "bruna",
  "bigboom",
  "qualyshape",
  "tiktok",
  "ugc",
]);

const ALLOWED_DATA_CLASSES = new Set([
  "generic_prompt",
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
  "social_report",
  "institutional_document",
  "database_content",
]);

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function isEnabled(env) {
  return env.GEMINI_ENABLED === "true" || env.GEMINI_ENABLED === "1";
}

function classifyBlock({ projectKind, dataClass }) {
  if (BLOCKED_PROJECT_KINDS.has(projectKind)) {
    return `Projeto bloqueado para Gemini cloud: ${projectKind}.`;
  }

  if (BLOCKED_DATA_CLASSES.has(dataClass)) {
    return `Classe de dado bloqueada para Gemini cloud: ${dataClass}.`;
  }

  if (!ALLOWED_PROJECT_KINDS.has(projectKind)) {
    return `Projeto nao autorizado para Gemini cloud: ${projectKind}.`;
  }

  if (!ALLOWED_DATA_CLASSES.has(dataClass)) {
    return `Classe de dado nao autorizada para Gemini cloud: ${dataClass}.`;
  }

  return null;
}

function getApprovedModel(modelId) {
  return APPROVED_GEMINI_MODELS.find((model) => model.id === modelId);
}

function extractGeminiParts(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .filter((part) => typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();

  const imagePart = parts.find((part) => {
    const inlineData = part.inlineData || part.inline_data;
    return inlineData?.data;
  });

  const inlineData = imagePart ? imagePart.inlineData || imagePart.inline_data : null;

  return {
    text,
    imageBase64: inlineData?.data || null,
    mimeType: inlineData?.mimeType || inlineData?.mime_type || null,
  };
}

function buildInstruction(mode) {
  if (mode === "image_generation") {
    return [
      "Voce e o motor visual do ARGOS para projetos de marketing.",
      "Gere ou edite imagem final somente com base no pedido do usuario.",
      "Nao use dados sensiveis, nomes de atletas, documentos internos, logs, bancos ou informacoes institucionais.",
      "Priorize imagem comercial limpa, consistente, com produto/personagem/cenario preservados quando o pedido exigir.",
    ].join("\n");
  }

  return [
    "Voce e o construtor de prompts e JSON do ARGOS.",
    "Sua funcao e transformar pedidos de marketing em prompts, comandos JSON, prompts negativos, roteiros e instrucoes tecnicas para modelos de imagem/video.",
    "Nao gere imagem final. Gere texto util, estruturado e pronto para copiar.",
    "Nao use dados sensiveis, nomes de atletas, documentos internos, logs, bancos ou informacoes institucionais.",
  ].join("\n");
}

export async function onRequestGet({ env }) {
  const enabled = isEnabled(env);
  const keyPresent = Boolean(env.GEMINI_API_KEY);

  return jsonResponse({
    ok: true,
    service: "argos-gemini-visual-provider",
    enabled,
    keyPresent,
    defaultPromptModel: "gemini-2.5-flash",
    defaultImageModel: "gemini-2.5-flash-image",
    routingRule:
      "Gemini 2.5 Flash = construir prompt/JSON. Gemini 2.5 Flash Image = gerar ou editar imagem final.",
    allowedProjects: Array.from(ALLOWED_PROJECT_KINDS),
    allowedDataClasses: Array.from(ALLOWED_DATA_CLASSES),
    blockedProjects: Array.from(BLOCKED_PROJECT_KINDS),
    blockedDataClasses: Array.from(BLOCKED_DATA_CLASSES),
    approvedModels: APPROVED_GEMINI_MODELS,
  });
}

export async function onRequestPost({ request, env }) {
  const enabled = isEnabled(env);
  const keyPresent = Boolean(env.GEMINI_API_KEY);

  if (!enabled || !keyPresent) {
    return jsonResponse(
      {
        ok: false,
        provider: "gemini",
        reason:
          "Gemini Visual nao esta habilitado. Configure GEMINI_API_KEY e GEMINI_ENABLED=true no Cloudflare Pages.",
      },
      503
    );
  }

  const body = await readJson(request);

  const mode = body.mode === "image_generation" ? "image_generation" : "prompt_builder";
  const requestedModel =
    typeof body.model === "string"
      ? body.model
      : mode === "image_generation"
        ? "gemini-2.5-flash-image"
        : "gemini-2.5-flash";

  const approvedModel = getApprovedModel(requestedModel);

  if (!approvedModel || approvedModel.mode !== mode) {
    return jsonResponse(
      {
        ok: false,
        blocked: true,
        provider: "gemini",
        reason:
          "Modelo Gemini nao aprovado para este modo. Use gemini-2.5-flash para prompt/JSON e gemini-2.5-flash-image para imagem.",
      },
      403
    );
  }

  const projectKind =
    typeof body.projectKind === "string" ? body.projectKind : "marketing";
  const dataClass =
    typeof body.dataClass === "string"
      ? body.dataClass
      : mode === "image_generation"
        ? "creative_asset"
        : "generic_prompt";

  const blockedReason = classifyBlock({ projectKind, dataClass });

  if (blockedReason) {
    return jsonResponse(
      {
        ok: false,
        blocked: true,
        provider: "gemini",
        reason: blockedReason,
      },
      403
    );
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    return jsonResponse(
      {
        ok: false,
        provider: "gemini",
        reason: "Prompt vazio.",
      },
      400
    );
  }

  const instruction = buildInstruction(mode);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${approvedModel.id}:generateContent`;

  const geminiPayload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${instruction}\n\nPEDIDO DO USUARIO:\n${prompt}`,
          },
        ],
      },
    ],
  };

  if (mode === "image_generation") {
    geminiPayload.generationConfig = {
      responseModalities: ["TEXT", "IMAGE"],
    };
  } else {
    geminiPayload.generationConfig = {
      temperature: 0.7,
      maxOutputTokens: Number.isFinite(body.max_tokens) ? body.max_tokens : 1600,
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify(geminiPayload),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return jsonResponse(
      {
        ok: false,
        provider: "gemini",
        model: approvedModel.id,
        reason:
          payload?.error?.message ||
          `Falha Gemini API HTTP ${response.status}.`,
        error: payload?.error || payload,
      },
      response.status
    );
  }

  const parts = extractGeminiParts(payload);

  if (mode === "image_generation" && !parts.imageBase64) {
    return jsonResponse(
      {
        ok: false,
        provider: "gemini",
        model: approvedModel.id,
        reason:
          parts.text ||
          "Gemini Flash Image respondeu sem imagem. Refine o prompt ou tente novamente.",
        raw: payload,
      },
      502
    );
  }

  return jsonResponse({
    ok: true,
    provider: "gemini",
    model: approvedModel.id,
    mode,
    response:
      parts.text ||
      (mode === "image_generation"
        ? "Imagem gerada pelo Gemini 2.5 Flash Image."
        : "Gemini respondeu sem texto."),
    imageBase64: parts.imageBase64,
    mimeType: parts.mimeType,
    usage: payload.usageMetadata || null,
  });
}
