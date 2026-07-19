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

function isEnabled(value) {
  return value === "true" || value === "1";
}

function buildChatEndpoint(baseUrl) {
  const normalized = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");

  if (!normalized) {
    return "";
  }

  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }

  return `${normalized}/chat/completions`;
}

function readConfig(env) {
  const baseUrl = String(env.ARGOS_ONLINE_BASE_URL || "").trim();
  const model = String(env.ARGOS_ONLINE_MODEL || "").trim();
  const provider =
    String(env.ARGOS_ONLINE_PROVIDER_LABEL || "").trim() ||
    "ARGOS Online";

  const enabled = isEnabled(env.ARGOS_ONLINE_ENABLED);
  const keyPresent = Boolean(env.ARGOS_ONLINE_API_KEY);
  const baseConfigured = Boolean(baseUrl);
  const modelConfigured = Boolean(model);

  return {
    enabled,
    keyPresent,
    baseConfigured,
    modelConfigured,
    ready:
      enabled &&
      keyPresent &&
      baseConfigured &&
      modelConfigured,
    provider,
    baseUrl,
    model,
    endpoint: buildChatEndpoint(baseUrl),
  };
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

  const messages = inputMessages
    .slice(-30)
    .map((message) => {
      const role = String(message?.role || "").trim();
      const content = String(message?.content || "").trim();

      if (!["system", "user", "assistant"].includes(role)) {
        throw new Error(`Role inválido: ${role || "vazio"}.`);
      }

      if (!content) {
        throw new Error("Foi encontrada uma mensagem sem conteúdo.");
      }

      return {
        role,
        content,
      };
    });

  const totalCharacters = messages.reduce(
    (total, message) => total + message.content.length,
    0
  );

  if (totalCharacters > 60000) {
    throw new Error(
      "O contexto enviado ultrapassou o limite inicial de 60.000 caracteres."
    );
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
        "Não diga que executou comandos, alterou arquivos ou acessou sistemas quando isso não ocorreu.",
        "Não exponha nomes internos de modelos ou fornecedores, salvo quando o usuário perguntar diretamente.",
      ].join(" "),
    });
  }

  return messages;
}

function clampNumber(value, fallback, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, minimum), maximum);
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
    (value) =>
      typeof value === "string" &&
      value.trim()
  );

  return message
    ? message.trim().slice(0, 1000)
    : "A API online retornou um erro sem descrição.";
}

export async function onRequestGet(context) {
  const config = readConfig(context.env);

  return json({
    ok: true,
    service: "argos-online-gateway",
    ready: config.ready,
    enabled: config.enabled,
    keyPresent: config.keyPresent,
    baseConfigured: config.baseConfigured,
    modelConfigured: config.modelConfigured,
    provider: config.provider,
    routingMode: "automatic_single_gateway",
    sensitiveDataLocalOnly: true,
  });
}

export async function onRequestPost(context) {
  const config = readConfig(context.env);

  if (!config.ready) {
    return json(
      {
        ok: false,
        code: "ONLINE_GATEWAY_NOT_READY",
        reason:
          "O gateway online ainda não possui todas as configurações necessárias.",
        configuration: {
          enabled: config.enabled,
          keyPresent: config.keyPresent,
          baseConfigured: config.baseConfigured,
          modelConfigured: config.modelConfigured,
        },
      },
      503
    );
  }

  let payload;

  try {
    payload = await context.request.json();
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

  let messages;

  try {
    messages = normalizeMessages(payload);
  } catch (error) {
    return json(
      {
        ok: false,
        code: "INVALID_MESSAGES",
        reason:
          error instanceof Error
            ? error.message
            : "Mensagens inválidas.",
      },
      400
    );
  }

  const controller = new AbortController();
  const timeoutMs = clampNumber(
    Number(context.env.ARGOS_ONLINE_TIMEOUT_MS),
    120000,
    10000,
    240000
  );

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const upstreamResponse = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${context.env.ARGOS_ONLINE_API_KEY}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: clampNumber(
          payload.temperature,
          0.4,
          0,
          2
        ),
        max_tokens: clampNumber(
          payload.max_tokens,
          2000,
          128,
          8000
        ),
        stream: false,
      }),
    });

    const rawText = await upstreamResponse.text();

    let data;

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {
        raw: rawText,
      };
    }

    if (!upstreamResponse.ok) {
      const status =
        upstreamResponse.status === 401 ||
        upstreamResponse.status === 403 ||
        upstreamResponse.status === 429
          ? upstreamResponse.status
          : 502;

      return json(
        {
          ok: false,
          code: "ONLINE_PROVIDER_ERROR",
          provider: config.provider,
          upstreamStatus: upstreamResponse.status,
          reason: extractUpstreamError(data, rawText),
        },
        status
      );
    }

    const responseText = extractResponseText(data);

    if (!responseText) {
      return json(
        {
          ok: false,
          code: "EMPTY_ONLINE_RESPONSE",
          provider: config.provider,
          reason:
            "A API online respondeu, mas não retornou conteúdo utilizável.",
        },
        502
      );
    }

    return json({
      ok: true,
      route: "online",
      provider: config.provider,
      response: responseText,
      usage: data?.usage || null,
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException &&
      error.name === "AbortError";

    return json(
      {
        ok: false,
        code: timedOut
          ? "ONLINE_TIMEOUT"
          : "ONLINE_REQUEST_FAILED",
        provider: config.provider,
        reason: timedOut
          ? `A API online ultrapassou o limite de ${timeoutMs} ms.`
          : error instanceof Error
            ? error.message
            : "Falha desconhecida ao consultar a API online.",
      },
      timedOut ? 504 : 502
    );
  } finally {
    clearTimeout(timeout);
  }
}
