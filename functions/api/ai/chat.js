import {
  buildRepairMessages,
  buildVeo3DirectorInstruction,
  buildVisualProfileInstruction,
  detectVeo3MatrixWorkflow,
  formatVeo3Response,
  getVeo3RepairAttemptLimit,
  parseVeo3Objects,
  parseVisualProfile,
  validateVeo3Matrix,
} from "./veo3-validator.js";

const NVIDIA_CHAT_ENDPOINT =
  "https://integrate.api.nvidia.com/v1/chat/completions";

const DEFAULT_TEXT_MODEL = "z-ai/glm-5.2";
const FALLBACK_TEXT_MODEL = DEFAULT_TEXT_MODEL;
const DEFAULT_VISION_MODEL = "nvidia/nemotron-nano-12b-v2-vl";

const ALLOWED_MODELS = new Set([
  DEFAULT_TEXT_MODEL,
  FALLBACK_TEXT_MODEL,
  DEFAULT_VISION_MODEL,
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

const MAX_CONTEXT_CHARACTERS = 80000;
const MAX_MESSAGES = 40;
const MAX_IMAGES = 3;
const MAX_IMAGE_DATA_URL_CHARACTERS = 14_000_000;

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

function evaluatePolicy(payload) {
  const dataClass = String(
    payload?.dataClass || "generic_chat"
  ).trim();

  if (BLOCKED_DATA_CLASSES.has(dataClass)) {
    return {
      allowed: false,
      dataClass,
      reason:
        "Esta classe de dados deve permanecer no processamento local do ARGOS.",
    };
  }

  return {
    allowed: true,
    dataClass,
    reason: "Conteúdo autorizado para processamento online.",
  };
}

function normalizeImagePart(part) {
  const url = String(part?.image_url?.url || "").trim();

  if (!url) {
    throw new Error("Foi encontrada uma imagem sem URL ou dados Base64.");
  }

  if (
    url.startsWith("data:") &&
    url.length > MAX_IMAGE_DATA_URL_CHARACTERS
  ) {
    throw new Error("A imagem enviada ultrapassa o limite aceito pelo ARGOS.");
  }

  if (!url.startsWith("data:") && !/^https:\/\//i.test(url)) {
    throw new Error("A imagem deve usar data URL ou endereço HTTPS.");
  }

  return {
    type: "image_url",
    image_url: {
      url,
    },
  };
}

function normalizeContent(content) {
  if (typeof content === "string") {
    const text = content.trim();

    if (!text) {
      throw new Error("Foi encontrada uma mensagem sem conteúdo.");
    }

    return {
      content: text,
      textCharacters: text.length,
      imageCount: 0,
    };
  }

  if (!Array.isArray(content) || !content.length) {
    throw new Error("Foi encontrada uma mensagem sem conteúdo.");
  }

  let textCharacters = 0;
  let imageCount = 0;

  const normalizedParts = content.map((part) => {
    const type = String(part?.type || "").trim();

    if (type === "text") {
      const text = String(part?.text || "").trim();

      if (!text) {
        throw new Error("Foi encontrado um bloco de texto vazio.");
      }

      textCharacters += text.length;

      return {
        type: "text",
        text,
      };
    }

    if (type === "image_url") {
      imageCount += 1;
      return normalizeImagePart(part);
    }

    throw new Error(`Tipo de conteúdo não suportado: ${type || "vazio"}.`);
  });

  if (imageCount > MAX_IMAGES) {
    throw new Error(`Envie no máximo ${MAX_IMAGES} imagens por solicitação.`);
  }

  return {
    content: normalizedParts,
    textCharacters,
    imageCount,
  };
}

function normalizeMessages(payload) {
  let inputMessages = payload?.messages;

  if (
    (!Array.isArray(inputMessages) || !inputMessages.length) &&
    typeof payload?.prompt === "string"
  ) {
    inputMessages = [
      {
        role: "user",
        content: payload.prompt,
      },
    ];
  }

  if (!Array.isArray(inputMessages) || !inputMessages.length) {
    throw new Error(
      "Informe messages ou prompt para consultar o ARGOS."
    );
  }

  let totalCharacters = 0;
  let totalImages = 0;

  const messages = inputMessages
    .slice(-MAX_MESSAGES)
    .map((message) => {
      const role = String(message?.role || "").trim();

      if (!["system", "user", "assistant"].includes(role)) {
        throw new Error(`Role inválido: ${role || "vazio"}.`);
      }

      const normalized = normalizeContent(message?.content);
      totalCharacters += normalized.textCharacters;
      totalImages += normalized.imageCount;

      return {
        role,
        content: normalized.content,
      };
    });

  if (totalCharacters > MAX_CONTEXT_CHARACTERS) {
    throw new Error(
      `O contexto enviado ultrapassou o limite de ${MAX_CONTEXT_CHARACTERS.toLocaleString("pt-BR")} caracteres.`
    );
  }

  if (totalImages > MAX_IMAGES) {
    throw new Error(`Envie no máximo ${MAX_IMAGES} imagens por solicitação.`);
  }

  const hasSystemMessage = messages.some(
    (message) => message.role === "system"
  );

  if (!hasSystemMessage) {
    messages.unshift({
      role: "system",
      content: [
        "Você é o ARGOS, um orquestrador técnico e assistente geral.",
        "Responda em português brasileiro, com clareza e precisão.",
        "Siga o fluxo solicitado pelo usuário sem pular etapas.",
        "Não diga que executou comandos, alterou arquivos ou acessou sistemas quando isso não ocorreu.",
        "Não exponha nomes internos de modelos ou fornecedores, salvo quando o usuário perguntar diretamente.",
      ].join(" "),
    });
  }

  return {
    messages,
    hasImage: totalImages > 0,
    imageCount: totalImages,
  };
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

function contentToText(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((part) => part?.type === "text")
    .map((part) => String(part?.text || "").trim())
    .filter(Boolean)
    .join("\n");
}

function collectImageParts(messages) {
  const images = [];

  for (const message of messages) {
    if (!Array.isArray(message?.content)) {
      continue;
    }

    for (const part of message.content) {
      if (part?.type === "image_url") {
        images.push(part);
      }
    }
  }

  return images.slice(-MAX_IMAGES);
}

function buildVisionMessages(messages, useStructuredVisualProfile = false) {
  const images = collectImageParts(messages);
  const textualContext = messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      const label = message.role === "assistant" ? "ARGOS" : "USUÁRIO";
      const text = contentToText(message.content);
      return text ? `${label}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(-24000);

  return [
    {
      role: "system",
      content: useStructuredVisualProfile
        ? buildVisualProfileInstruction()
        : [
            "Você é o especialista visual do ARGOS.",
            "Sua única tarefa é examinar os pixels das imagens e extrair fatos visuais úteis para outro modelo concluir a solicitação do usuário.",
            "Não execute a tarefa final do usuário, não escreva scripts, não escreva JSON e não faça conclusão comercial.",
            "Não copie medidas, composição ou características do texto como se fossem visíveis na imagem.",
            "Diferencie claramente o que está visível do que vem apenas do contexto textual.",
            "Descreva personagem, roupa, cor, corte, acessórios, pose, cenário, enquadramento e iluminação.",
            "Quando algo não puder ser confirmado, declare a incerteza.",
            "Responda em português brasileiro, de forma objetiva e factual.",
          ].join(" "),
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            "Analise as imagens anexadas para apoiar a execução da tarefa descrita no histórico.",
            "Não responda à tarefa final; entregue somente a leitura visual factual.",
            "",
            "CONTEXTO TEXTUAL DA CONVERSA:",
            textualContext || "Nenhum contexto textual adicional.",
          ].join("\n"),
        },
        ...images,
      ],
    },
  ];
}

function buildDirectorMessages(messages, visionAnalysis, visualProfile = null) {
  const directorMessages = messages.map((message) => {
    if (typeof message.content === "string") {
      return {
        role: message.role,
        content: message.content,
      };
    }

    const text = contentToText(message.content);
    const hasImage = message.content.some(
      (part) => part?.type === "image_url"
    );

    return {
      role: message.role,
      content: [
        text,
        hasImage
          ? [
              "[A imagem original foi recebida e analisada pelo especialista visual do ARGOS.]",
              "ANÁLISE VISUAL FACTUAL:",
              visionAnalysis,
            ].join("\n")
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  });

  const firstSystemIndex = directorMessages.findIndex(
    (message) => message.role === "system"
  );

  const orchestrationInstruction = {
    role: "system",
    content: [
      "Você é o executor final do ARGOS.",
      "A análise visual factual inserida na mensagem com imagem representa os pixels reais do anexo.",
      "Use essa análise juntamente com todo o histórico para concluir agora a tarefa principal solicitada pelo usuário.",
      "Não responda apenas com uma descrição da imagem e não repita a ficha técnica, salvo quando isso fizer parte do resultado pedido.",
      "Respeite rigorosamente formatos, etapas, quantidade de entregáveis e restrições definidos pelo usuário no histórico.",
      "Não invente características técnicas ausentes.",
      visualProfile
        ? buildVeo3DirectorInstruction(visualProfile)
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };

  if (firstSystemIndex >= 0) {
    directorMessages.splice(firstSystemIndex + 1, 0, orchestrationInstruction);
  } else {
    directorMessages.unshift(orchestrationInstruction);
  }

  return directorMessages;
}

function chooseTextModel(payload) {
  const requestedModel = String(payload?.model || "").trim();

  if (requestedModel) {
    if (!ALLOWED_MODELS.has(requestedModel)) {
      throw new Error("O modelo solicitado não está aprovado pelo ARGOS.");
    }

    if (requestedModel === DEFAULT_VISION_MODEL) {
      return DEFAULT_TEXT_MODEL;
    }

    return requestedModel;
  }

  const executionMode = String(payload?.executionMode || "").trim();

  if (executionMode === "fast") {
    return FALLBACK_TEXT_MODEL;
  }

  return DEFAULT_TEXT_MODEL;
}

function shouldTryFallback(status) {
  return [400, 404, 408, 410, 422, 500, 502, 503, 504].includes(
    status
  );
}

async function callNvidiaModel({
  apiKey,
  model,
  messages,
  payload,
  signal,
}) {
  const requestBody = {
    model,
    messages,
    temperature: clampNumber(payload?.temperature, 0.2, 0, 2),
    top_p: clampNumber(payload?.top_p, 0.95, 0.01, 1),
    max_tokens: clampNumber(payload?.max_tokens, 8192, 1, 32768),
    stream: false,
  };

  const upstreamResponse = await fetch(NVIDIA_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    signal,
    body: JSON.stringify(requestBody),
  });

  const rawText = await upstreamResponse.text();
  let data;

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { raw: rawText };
  }

  return {
    ok: upstreamResponse.ok,
    status: upstreamResponse.status,
    rawText,
    data,
    responseText: extractResponseText(data),
  };
}

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    service: "argos-nvidia-orchestrator",
    ready: Boolean(env.NVIDIA_API_KEY),
    keyPresent: Boolean(env.NVIDIA_API_KEY),
    routingMode: "vision_then_director",
    textModel: DEFAULT_TEXT_MODEL,
    fastTextModel: FALLBACK_TEXT_MODEL,
    visionModel: DEFAULT_VISION_MODEL,
    supportedWorkflows: ["generic_chat", "veo3_matrix"],
    veo3Validation: {
      structuredVisualProfile: true,
      deterministicValidation: true,
      automaticRepairAttempts: getVeo3RepairAttemptLimit(),
    },
    sensitiveDataLocalOnly: true,
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.NVIDIA_API_KEY) {
    return json(
      {
        ok: false,
        code: "NVIDIA_BACKEND_NOT_READY",
        reason:
          "O backend do ARGOS ainda não possui o secret NVIDIA_API_KEY.",
      },
      503
    );
  }

  let payload;

  try {
    payload = await request.json();
  } catch {
    return json(
      {
        ok: false,
        code: "INVALID_JSON",
        reason: "O corpo da requisição não contém um JSON válido.",
      },
      400
    );
  }

  const policy = evaluatePolicy(payload);

  if (!policy.allowed) {
    return json(
      {
        ok: false,
        blocked: true,
        code: "LOCAL_PROCESSING_REQUIRED",
        reason: policy.reason,
        dataClass: policy.dataClass,
      },
      403
    );
  }

  let normalized;
  let primaryTextModel;

  try {
    normalized = normalizeMessages(payload);
    primaryTextModel = chooseTextModel(payload);
  } catch (error) {
    return json(
      {
        ok: false,
        code: "INVALID_REQUEST",
        reason:
          error instanceof Error
            ? error.message
            : "Solicitação inválida.",
      },
      400
    );
  }

  const veo3Workflow =
    normalized.hasImage &&
    detectVeo3MatrixWorkflow(normalized.messages, payload);

  const timeoutMs = clampNumber(
    payload?.timeoutMs,
    normalized.hasImage ? 240000 : 150000,
    10000,
    240000
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    let selectedModel = primaryTextModel;
    let fallbackUsed = false;
    let visionAnalysis = "";
    let visualProfile = null;
    let validationResult = null;
    let validationAttempts = 0;
    let finalMessages = normalized.messages;

    if (normalized.hasImage) {
      const visionResult = await callNvidiaModel({
        apiKey: env.NVIDIA_API_KEY,
        model: DEFAULT_VISION_MODEL,
        messages: buildVisionMessages(normalized.messages, veo3Workflow),
        payload: {
          temperature: 0,
          top_p: 0.9,
          max_tokens: 3000,
        },
        signal: controller.signal,
      });

      if (!visionResult.ok) {
        const exposedStatus = [401, 403, 413, 415, 429].includes(
          visionResult.status
        )
          ? visionResult.status
          : 502;

        return json(
          {
            ok: false,
            code: "VISION_SPECIALIST_ERROR",
            provider: "nvidia",
            model: DEFAULT_VISION_MODEL,
            upstreamStatus: visionResult.status,
            reason: extractUpstreamError(
              visionResult.data,
              visionResult.rawText
            ),
            elapsedMs: Date.now() - startedAt,
          },
          exposedStatus
        );
      }

      visionAnalysis = visionResult.responseText;

      if (!visionAnalysis) {
        return json(
          {
            ok: false,
            code: "EMPTY_VISION_ANALYSIS",
            provider: "nvidia",
            model: DEFAULT_VISION_MODEL,
            reason:
              "O especialista visual respondeu, mas não retornou uma análise utilizável.",
            elapsedMs: Date.now() - startedAt,
          },
          502
        );
      }

      if (veo3Workflow) {
        const parsedProfile = parseVisualProfile(visionAnalysis);

        if (!parsedProfile.ok) {
          return json(
            {
              ok: false,
              code: "INVALID_VISUAL_PROFILE",
              provider: "nvidia",
              model: DEFAULT_VISION_MODEL,
              reason:
                "O especialista visual não produziu a ficha estruturada exigida pelo workflow VEO3_MATRIX.",
              validationErrors: parsedProfile.errors,
              visualResponseExcerpt: visionAnalysis.slice(0, 3000),
              elapsedMs: Date.now() - startedAt,
            },
            502
          );
        }

        visualProfile = parsedProfile.profile;
      }

      finalMessages = buildDirectorMessages(
        normalized.messages,
        visionAnalysis,
        visualProfile
      );
    }

    let result = await callNvidiaModel({
      apiKey: env.NVIDIA_API_KEY,
      model: selectedModel,
      messages: finalMessages,
      payload: {
        ...payload,
        temperature: payload?.temperature ?? 0.15,
        max_tokens: payload?.max_tokens ?? 12000,
      },
      signal: controller.signal,
    });

    const canFallback = false;

    if (canFallback) {
      selectedModel = FALLBACK_TEXT_MODEL;
      fallbackUsed = true;

      result = await callNvidiaModel({
        apiKey: env.NVIDIA_API_KEY,
        model: selectedModel,
        messages: finalMessages,
        payload: {
          ...payload,
          temperature: payload?.temperature ?? 0.15,
          max_tokens: payload?.max_tokens ?? 12000,
        },
        signal: controller.signal,
      });
    }

    if (!result.ok) {
      const exposedStatus = [401, 403, 413, 415, 429].includes(
        result.status
      )
        ? result.status
        : 502;

      return json(
        {
          ok: false,
          code: "NVIDIA_PROVIDER_ERROR",
          provider: "nvidia",
          model: selectedModel,
          fallbackUsed,
          upstreamStatus: result.status,
          reason: extractUpstreamError(result.data, result.rawText),
          elapsedMs: Date.now() - startedAt,
        },
        exposedStatus
      );
    }

    if (!result.responseText) {
      return json(
        {
          ok: false,
          code: "EMPTY_NVIDIA_RESPONSE",
          provider: "nvidia",
          model: selectedModel,
          fallbackUsed,
          reason:
            "A NVIDIA respondeu, mas não retornou conteúdo utilizável.",
          elapsedMs: Date.now() - startedAt,
        },
        502
      );
    }

    if (veo3Workflow && visualProfile) {
      const sourceText = normalized.messages
        .filter((message) => message.role === "user")
        .map((message) => contentToText(message.content))
        .filter(Boolean)
        .join("\n\n");
      const repairAttemptLimit = getVeo3RepairAttemptLimit();
      let draft = result.responseText;

      while (true) {
        const parsed = parseVeo3Objects(draft);
        const parseViolations = parsed.parseErrors.map((message) => ({
          code: "INVALID_JSON",
          message,
          path: "response",
        }));
        validationResult = validateVeo3Matrix({
          objects: parsed.objects,
          visualProfile,
          sourceText,
        });
        const violations = [
          ...parseViolations,
          ...validationResult.errors,
        ];

        if (violations.length === 0 && validationResult.valid) {
          result.responseText = formatVeo3Response(
            validationResult.videos
          );
          break;
        }

        if (validationAttempts >= repairAttemptLimit) {
          return json(
            {
              ok: false,
              code: "VEO3_VALIDATION_FAILED",
              provider: "nvidia",
              model: selectedModel,
              workflow: "veo3_matrix",
              reason:
                "A matriz foi rejeitada pelo validador determinístico após o limite de correções automáticas.",
              validationAttempts,
              validationErrors: violations.slice(0, 60),
              draftExcerpt: draft.slice(0, 12000),
              visualProfile,
              elapsedMs: Date.now() - startedAt,
            },
            422
          );
        }

        const repairMessages = buildRepairMessages({
          messages: finalMessages,
          draft,
          errors: violations,
          visualProfile,
        });

        const repairedResult = await callNvidiaModel({
          apiKey: env.NVIDIA_API_KEY,
          model: selectedModel,
          messages: repairMessages,
          payload: {
            temperature: 0,
            top_p: 0.9,
            max_tokens: 16000,
          },
          signal: controller.signal,
        });

        validationAttempts += 1;

        if (!repairedResult.ok) {
          return json(
            {
              ok: false,
              code: "VEO3_REPAIR_PROVIDER_ERROR",
              provider: "nvidia",
              model: selectedModel,
              workflow: "veo3_matrix",
              upstreamStatus: repairedResult.status,
              reason: extractUpstreamError(
                repairedResult.data,
                repairedResult.rawText
              ),
              validationAttempts,
              elapsedMs: Date.now() - startedAt,
            },
            502
          );
        }

        if (!repairedResult.responseText) {
          return json(
            {
              ok: false,
              code: "EMPTY_VEO3_REPAIR",
              provider: "nvidia",
              model: selectedModel,
              workflow: "veo3_matrix",
              reason:
                "O modelo não retornou conteúdo durante a correção automática da matriz.",
              validationAttempts,
              elapsedMs: Date.now() - startedAt,
            },
            502
          );
        }

        result = repairedResult;
        draft = repairedResult.responseText;
      }
    }

    return json({
      ok: true,
      route: normalized.hasImage
        ? "vision_then_director"
        : "text",
      provider: "nvidia",
      model: String(result.data?.model || selectedModel),
      visionModel: normalized.hasImage
        ? DEFAULT_VISION_MODEL
        : null,
      directorModel: selectedModel,
      fallbackUsed,
      workflow: veo3Workflow ? "veo3_matrix" : "generic_chat",
      validationApplied: Boolean(veo3Workflow),
      validationPassed: veo3Workflow
        ? Boolean(validationResult?.valid)
        : null,
      validationAttempts,
      visualProfile: veo3Workflow ? visualProfile : null,
      response: result.responseText,
      usage: result.data?.usage || null,
      imageCount: normalized.imageCount,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const timedOut = error?.name === "AbortError";

    return json(
      {
        ok: false,
        code: timedOut
          ? "NVIDIA_TIMEOUT"
          : "NVIDIA_REQUEST_FAILED",
        provider: "nvidia",
        model: primaryTextModel,
        reason: timedOut
          ? `A solicitação ultrapassou o limite de ${timeoutMs} ms.`
          : error instanceof Error
            ? error.message
            : "Falha desconhecida ao consultar a NVIDIA.",
        elapsedMs: Date.now() - startedAt,
      },
      timedOut ? 504 : 502
    );
  } finally {
    clearTimeout(timeout);
  }
}
