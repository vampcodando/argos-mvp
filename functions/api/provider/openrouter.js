function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

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
  return json({
    ok: true,
    service: "argos-openrouter-provider",
    enabled: context.env.OPENROUTER_ENABLED === "true",
    keyPresent: Boolean(context.env.OPENROUTER_API_KEY),
    defaultModel: context.env.OPENROUTER_DEFAULT_MODEL || "openrouter/auto",
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

  const model = String(
    payload.model ||
    context.env.OPENROUTER_DEFAULT_MODEL ||
    "openrouter/auto"
  );

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
      error: data,
    }, response.status);
  }

  return json({
    ok: true,
    provider: "openrouter",
    model,
    response: data?.choices?.[0]?.message?.content || "",
    raw: data,
  });
}
