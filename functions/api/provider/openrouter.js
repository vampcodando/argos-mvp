function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const APPROVED_OPENROUTER_MODELS = [
  {
    id: "google/gemma-4-31b-it:free",
    label: "Gemma 4 31B",
    provider: "Google",
    group: "Geral / Marketing",
    contextLength: 262144,
    recommendedFor: ["chat", "marketing", "prompts", "texto"],
    notes: "Primeira escolha para uso geral no ARGOS cloud free.",
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    label: "Gemma 4 26B A4B",
    provider: "Google",
    group: "Geral / Fallback",
    contextLength: 262144,
    recommendedFor: ["chat", "marketing", "fallback"],
    notes: "Alternativa ao Gemma 4 31B.",
  },
  {
    id: "qwen/qwen3-next-80b-a3b-instruct:free",
    label: "Qwen3 Next 80B Instruct",
    provider: "Qwen",
    group: "Marketing / Estruturado",
    contextLength: 262144,
    recommendedFor: ["marketing", "ideias", "roteiros", "respostas estruturadas"],
    notes: "Bom candidato para prompts criativos e respostas organizadas.",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B Instruct",
    provider: "Meta",
    group: "Geral",
    contextLength: 131072,
    recommendedFor: ["chat", "texto", "planejamento"],
    notes: "Modelo geral forte para comparacao.",
  },
  {
    id: "openai/gpt-oss-120b:free",
    label: "OpenAI gpt-oss 120B",
    provider: "OpenAI",
    group: "Raciocinio / Planejamento",
    contextLength: 131072,
    recommendedFor: ["planejamento", "analise", "raciocinio"],
    notes: "Usar quando quiser testar raciocinio mais forte em modelo free.",
  },
  {
    id: "openai/gpt-oss-20b:free",
    label: "OpenAI gpt-oss 20B",
    provider: "OpenAI",
    group: "Rapido / Fallback",
    contextLength: 131072,
    recommendedFor: ["chat", "resumo", "fallback"],
    notes: "Opcao menor e possivelmente mais rapida.",
  },
  {
    id: "qwen/qwen3-coder:free",
    label: "Qwen3 Coder",
    provider: "Qwen",
    group: "Codigo",
    contextLength: 1048576,
    recommendedFor: ["codigo", "debug", "patches", "arquitetura"],
    notes: "Modelo reservado para tarefas de codigo e engenharia.",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    label: "Hermes 3 405B",
    provider: "Nous Research",
    group: "Agente / Instrucoes",
    contextLength: 131072,
    recommendedFor: ["agente", "instrucoes longas", "planejamento"],
    notes: "Bom candidato para comportamento de agente e execucao de instrucoes.",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super 120B",
    provider: "NVIDIA",
    group: "Raciocinio",
    contextLength: 1000000,
    recommendedFor: ["analise longa", "raciocinio", "contexto grande"],
    notes: "Contexto muito grande; testar estabilidade antes de usar como padrao.",
  },
  {
    id: "nvidia/nemotron-nano-12b-v2-vl:free",
    label: "Nemotron Nano 12B VL",
    provider: "NVIDIA",
    group: "Visao / Futuro",
    contextLength: 128000,
    recommendedFor: ["visao", "imagem", "multimodal futuro"],
    notes: "Reservado para testes futuros de visao/multimodal.",
  },
];

const APPROVED_MODEL_IDS = new Set(
  APPROVED_OPENROUTER_MODELS.map((model) => model.id)
);

const DEFAULT_APPROVED_MODEL = "google/gemma-4-31b-it:free";

const MARKETING_PROJECTS = new Set([
  "marketing",
  "bruna",
  "bigboom",
  "qualyshape",
  "tiktok",
  "ugc",
]);

const CLOUD_ALLOWED_DATA = new Set([
  "generic_prompt",
  "public_marketing",
  "creative_asset",
]);

const SENSITIVE_PROJECTS = new Set([
  "servico_social",
  "alojamento_celeiro",
  "institutional_internal",
]);

const SENSITIVE_DATA = new Set([
  "source_code",
  "technical_log",
  "secret_or_token",
  "athlete_data",
  "family_data",
  "social_report",
  "institutional_document",
  "database_content",
]);

function normalizeOpenRouterModel(model) {
  const requestedModel = String(model || DEFAULT_APPROVED_MODEL).trim();

  if (APPROVED_MODEL_IDS.has(requestedModel)) {
    return requestedModel;
  }

  throw new Error(
    "ARGOS permite somente modelos free aprovados na lista interna. openrouter/free, openrouter/auto e modelos pagos ficam bloqueados."
  );
}

function getDefaultModel(context) {
  try {
    return normalizeOpenRouterModel(
      context.env.OPENROUTER_DEFAULT_MODEL || DEFAULT_APPROVED_MODEL
    );
  } catch {
    return DEFAULT_APPROVED_MODEL;
  }
}

function evaluatePolicy(payload) {
  const projectKind = String(payload.projectKind || "");
  const dataClass = String(payload.dataClass || "");

  if (SENSITIVE_PROJECTS.has(projectKind)) {
    return { allowed: false, reason: "Projeto sensivel/institucional: cloud bloqueada." };
  }

  if (SENSITIVE_DATA.has(dataClass)) {
    return { allowed: false, reason: "Classe de dado sensivel: cloud bloqueada." };
  }

  if (!MARKETING_PROJECTS.has(projectKind)) {
    return {
      allowed: false,
      reason: "OpenRouter permitido somente para marketing, Bruna, BigBoom, QualyShape, TikTok ou UGC.",
    };
  }

  if (!CLOUD_ALLOWED_DATA.has(dataClass)) {
    return { allowed: false, reason: "Classe de dado nao liberada para cloud." };
  }

  return { allowed: true, reason: "Uso cloud permitido pela politica do ARGOS." };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) {
    throw new Error("messages precisa ser uma lista nao vazia.");
  }

  return messages.map((message) => {
    const role = String(message.role || "");
    const content = String(message.content || "");

    if (!["system", "user", "assistant"].includes(role)) {
      throw new Error(`role invalido: ${role}`);
    }

    if (!content.trim()) {
      throw new Error("content vazio.");
    }

    return { role, content };
  });
}

export async function onRequestGet(context) {
  const defaultModel = getDefaultModel(context);

  return json({
    ok: true,
    service: "argos-openrouter-provider",
    enabled: context.env.OPENROUTER_ENABLED === "true",
    keyPresent: Boolean(context.env.OPENROUTER_API_KEY),
    defaultModel,
    freeOnly: true,
    modelSelectionMode: "approved_free_allowlist",
    allowedModelRule: "Somente modelos listados em approvedModels.",
    approvedModels: APPROVED_OPENROUTER_MODELS,
    policy: {
      cloudAllowedFor: Array.from(MARKETING_PROJECTS),
      cloudBlockedFor: Array.from(SENSITIVE_PROJECTS),
      sensitiveDataBlocked: Array.from(SENSITIVE_DATA),
    },
  });
}

export async function onRequestPost(context) {
  let payload;

  try {
    payload = await context.request.json();
  } catch {
    return json({ ok: false, error: "JSON invalido." }, 400);
  }

  if (context.env.OPENROUTER_ENABLED !== "true") {
    return json({
      ok: false,
      blocked: true,
      reason: "OpenRouter esta instalado, mas desabilitado no Cloudflare.",
    }, 403);
  }

  if (!context.env.OPENROUTER_API_KEY) {
    return json({
      ok: false,
      error: "OPENROUTER_API_KEY ausente no Cloudflare.",
    }, 500);
  }

  const policy = evaluatePolicy(payload);

  if (!policy.allowed) {
    return json({
      ok: false,
      blocked: true,
      provider: "openrouter",
      reason: policy.reason,
    }, 403);
  }

  let messages;

  try {
    messages = normalizeMessages(payload.messages);
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "messages invalido.",
    }, 400);
  }

  let model;

  try {
    model = normalizeOpenRouterModel(
      payload.model ||
      context.env.OPENROUTER_DEFAULT_MODEL ||
      DEFAULT_APPROVED_MODEL
    );
  } catch (error) {
    return json({
      ok: false,
      blocked: true,
      provider: "openrouter",
      reason: error instanceof Error ? error.message : "Modelo OpenRouter bloqueado.",
    }, 403);
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${context.env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "http-referer": "https://argos-mvp-5sz.pages.dev",
      "x-openrouter-title": "ARGOS",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: typeof payload.temperature === "number" ? payload.temperature : 0.7,
      max_tokens: typeof payload.max_tokens === "number" ? payload.max_tokens : 1000,
      stream: false,
    }),
  });

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    return json({
      ok: false,
      provider: "openrouter",
      model,
      freeOnly: true,
      modelSelectionMode: "approved_free_allowlist",
      error: data,
    }, response.status);
  }

  return json({
    ok: true,
    provider: "openrouter",
    model,
    freeOnly: true,
    modelSelectionMode: "approved_free_allowlist",
    response: data?.choices?.[0]?.message?.content || "",
    raw: data,
  });
}
