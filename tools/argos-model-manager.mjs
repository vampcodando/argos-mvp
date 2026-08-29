const DEFAULT_OMNIROUTE_BASE_URL = "http://127.0.0.1:20128/v1";
const CATALOG_CACHE_MS = 30_000;
const DEFAULT_FAILURE_COOLDOWN_MS = 60_000;
const MAX_FAILURE_COOLDOWN_MS = 15 * 60_000;
const MAX_ATTEMPTS_RECORDED = 12;

const RETRYABLE_STATUSES = new Set([
  408,
  425,
  429,
  500,
  502,
  503,
  504,
]);

const REASONING_POOL = Object.freeze([
  Object.freeze({
    key: "minimax-m3",
    name: "MiniMax M3",
    priority: 1,
    role: "Supervisor principal",
    capabilities: Object.freeze([
      "reasoning",
      "code",
      "long-context",
      "tool-planning",
    ]),
    timeoutMs: 45_000,
    freeOnly: true,
    exactModelIds: Object.freeze([
      "openrouter/minimax/minimax-m3:free",
    ]),
    matchTokens: Object.freeze(["minimax", "minimax-m3", ":free"]),
    allowedOwners: Object.freeze(["openrouter"]),
  }),
  Object.freeze({
    key: "glm-5.2",
    name: "GLM 5.2",
    priority: 2,
    role: "Segundo supervisor",
    capabilities: Object.freeze([
      "reasoning",
      "code",
      "tool-planning",
    ]),
    // A rota CFP respondeu corretamente nos testes, mas apresentou picos
    // extremos de latencia. O ARGOS falha para o lado seguro e troca de rota.
    timeoutMs: 30_000,
    freeOnly: true,
    exactModelIds: Object.freeze([
      "cfp/zai-org/glm-5.2",
    ]),
    matchTokens: Object.freeze(["cfp/", "glm-5.2"]),
    allowedOwners: Object.freeze(["cloudflare-playground"]),
  }),
  Object.freeze({
    key: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    priority: 3,
    role: "Generalista multimodal",
    capabilities: Object.freeze([
      "reasoning",
      "code",
      "long-context",
      "multimodal-ready",
    ]),
    timeoutMs: 60_000,
    freeOnly: true,
    exactModelIds: Object.freeze([
      "gemini/gemini-2.5-flash",
      "gemini/models/gemini-2.5-flash",
    ]),
    matchTokens: Object.freeze(["gemini-2.5-flash"]),
    allowedOwners: Object.freeze(["gemini-free", "gemini"]),
  }),
  Object.freeze({
    key: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    priority: 4,
    role: "Especialista em codigo e debugging",
    capabilities: Object.freeze([
      "reasoning",
      "code",
      "debugging",
      "refactoring",
    ]),
    timeoutMs: 30_000,
    freeOnly: true,
    exactModelIds: Object.freeze([
      "cfp/deepseek-ai/deepseek-v4-flash-0731",
    ]),
    matchTokens: Object.freeze(["cfp/", "deepseek", "v4", "flash"]),
    allowedOwners: Object.freeze(["cloudflare-playground"]),
  }),
]);

const runtimeState = new Map(
  REASONING_POOL.map((model) => [
    model.key,
    {
      consecutiveFailures: 0,
      circuitOpenUntil: 0,
      lastFailureAt: null,
      lastFailureCode: null,
      lastFailureReason: null,
      lastSuccessAt: null,
      lastLatencyMs: null,
      lastRouteId: null,
    },
  ])
);

let catalogCache = {
  fetchedAt: 0,
  models: [],
};

function clampNumber(value, fallback, minimum, maximum) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(Math.max(numeric, minimum), maximum);
}

function getOmniRouteBaseUrl() {
  return String(
    process.env.ARGOS_OMNIROUTE_BASE_URL || DEFAULT_OMNIROUTE_BASE_URL
  )
    .trim()
    .replace(/\/+$/, "");
}

function getOmniRouteApiKey() {
  return String(
    process.env.ARGOS_OMNIROUTE_API_KEY ||
      process.env.OMNIROUTE_API_KEY ||
      ""
  ).trim();
}

function buildOmniRouteHeaders() {
  const apiKey = getOmniRouteApiKey();
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function safeJsonParse(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function extractResponseText(data) {
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part?.text === "string") return part.text;
      if (typeof part?.content === "string") return part.content;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractErrorMessage(data, rawText, fallback = "Falha no OmniRoute.") {
  const candidates = [
    data?.error?.message,
    data?.message,
    typeof data?.error === "string" ? data.error : null,
    rawText,
  ];

  const message = candidates.find(
    (value) => typeof value === "string" && value.trim()
  );

  return message ? message.trim().slice(0, 1600) : fallback;
}

function parseRetryAfterMs(response, data) {
  const resetSeconds = Number(data?.error?.reset_seconds);

  if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
    return Math.min(resetSeconds * 1000, MAX_FAILURE_COOLDOWN_MS);
  }

  const retryAfter = response?.headers?.get?.("retry-after");
  const retrySeconds = Number(retryAfter);

  if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
    return Math.min(retrySeconds * 1000, MAX_FAILURE_COOLDOWN_MS);
  }

  const retryAfterIso = data?.error?.retry_after;

  if (typeof retryAfterIso === "string") {
    const timestamp = Date.parse(retryAfterIso);

    if (Number.isFinite(timestamp)) {
      return Math.min(
        Math.max(timestamp - Date.now(), 1000),
        MAX_FAILURE_COOLDOWN_MS
      );
    }
  }

  return DEFAULT_FAILURE_COOLDOWN_MS;
}

function isModelOwnerAllowed(model, catalogEntry) {
  if (!model.allowedOwners?.length) {
    return true;
  }

  const owner = String(catalogEntry?.owned_by || "").trim().toLowerCase();

  return model.allowedOwners.some(
    (allowedOwner) => owner === String(allowedOwner).toLowerCase()
  );
}

function isFreeRouteAllowed(model, catalogEntry) {
  if (!model.freeOnly) {
    return true;
  }

  const id = String(catalogEntry?.id || "").toLowerCase();
  const owner = String(catalogEntry?.owned_by || "").toLowerCase();

  // OpenRouter so entra no pool quando a rota declara :free explicitamente.
  if (owner === "openrouter" || id.startsWith("openrouter/")) {
    return id.includes(":free");
  }

  // Gemini conectado no OmniRoute deve ser o conector free validado.
  if (id.startsWith("gemini/") || owner.startsWith("gemini")) {
    return owner === "gemini-free" || owner === "gemini";
  }

  // Cloudflare Playground e uma rota gratuita/no-auth ja validada no ARGOS.
  if (id.startsWith("cfp/") || owner === "cloudflare-playground") {
    return true;
  }

  // Fail closed: nenhuma rota desconhecida e promovida automaticamente.
  return false;
}

async function fetchCatalog({ force = false } = {}) {
  const now = Date.now();

  if (
    !force &&
    catalogCache.models.length > 0 &&
    now - catalogCache.fetchedAt < CATALOG_CACHE_MS
  ) {
    return catalogCache.models;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(`${getOmniRouteBaseUrl()}/models`, {
      method: "GET",
      headers: buildOmniRouteHeaders(),
      cache: "no-store",
      signal: controller.signal,
    });

    const rawText = await response.text();
    const data = safeJsonParse(rawText);

    if (!response.ok) {
      throw new Error(
        `OmniRoute /models retornou ${response.status}: ${extractErrorMessage(
          data,
          rawText
        )}`
      );
    }

    const models = Array.isArray(data?.data) ? data.data : [];

    catalogCache = {
      fetchedAt: now,
      models,
    };

    return models;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveModelFromCatalog(model, catalog) {
  for (const exactId of model.exactModelIds || []) {
    const exact = catalog.find((entry) => entry?.id === exactId);

    if (
      exact &&
      isModelOwnerAllowed(model, exact) &&
      isFreeRouteAllowed(model, exact)
    ) {
      return exact;
    }
  }

  const tokens = (model.matchTokens || []).map((token) =>
    String(token).toLowerCase()
  );

  return (
    catalog.find((entry) => {
      const id = String(entry?.id || "").toLowerCase();

      return (
        tokens.every((token) => id.includes(token)) &&
        isModelOwnerAllowed(model, entry) &&
        isFreeRouteAllowed(model, entry)
      );
    }) || null
  );
}

function getState(modelKey) {
  return runtimeState.get(modelKey);
}

function markSuccess(model, routeId, latencyMs) {
  const state = getState(model.key);

  state.consecutiveFailures = 0;
  state.circuitOpenUntil = 0;
  state.lastFailureCode = null;
  state.lastFailureReason = null;
  state.lastSuccessAt = new Date().toISOString();
  state.lastLatencyMs = latencyMs;
  state.lastRouteId = routeId;
}

function markFailure(model, {
  code,
  reason,
  routeId = null,
  cooldownMs = DEFAULT_FAILURE_COOLDOWN_MS,
}) {
  const state = getState(model.key);
  const boundedCooldown = clampNumber(
    cooldownMs,
    DEFAULT_FAILURE_COOLDOWN_MS,
    1000,
    MAX_FAILURE_COOLDOWN_MS
  );

  state.consecutiveFailures += 1;
  state.circuitOpenUntil = Date.now() + boundedCooldown;
  state.lastFailureAt = new Date().toISOString();
  state.lastFailureCode = code;
  state.lastFailureReason = String(reason || "Falha desconhecida.").slice(0, 1200);
  state.lastRouteId = routeId;
}

function buildAttemptOrder(preferredModelKey = null) {
  const ordered = [...REASONING_POOL].sort(
    (left, right) => left.priority - right.priority
  );

  if (!preferredModelKey) {
    return ordered;
  }

  const preferred = ordered.find((model) => model.key === preferredModelKey);

  if (!preferred) {
    throw new Error("O modelo preferido nao pertence ao Reasoning Pool do ARGOS.");
  }

  return [preferred, ...ordered.filter((model) => model.key !== preferredModelKey)];
}

function createAttemptController(externalSignal, timeoutMs) {
  const controller = new AbortController();
  let externalAbortHandler = null;

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalAbortHandler = () => controller.abort(externalSignal.reason);
      externalSignal.addEventListener("abort", externalAbortHandler, {
        once: true,
      });
    }
  }

  const timeout = setTimeout(() => {
    controller.abort(new Error("ARGOS_MODEL_TIMEOUT"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);

      if (externalSignal && externalAbortHandler) {
        externalSignal.removeEventListener("abort", externalAbortHandler);
      }
    },
  };
}

async function callResolvedModel({
  model,
  routeId,
  messages,
  payload,
  signal,
}) {
  const timeoutMs = clampNumber(
    payload?.modelTimeoutMs,
    model.timeoutMs,
    5_000,
    model.timeoutMs
  );
  const attemptController = createAttemptController(signal, timeoutMs);
  const startedAt = Date.now();

  const requestBody = {
    model: routeId,
    messages,
    temperature: clampNumber(payload?.temperature, 0.15, 0, 2),
    top_p: clampNumber(payload?.top_p, 0.95, 0.01, 1),
    max_tokens: clampNumber(payload?.max_tokens, 12_000, 1, 32_768),
    stream: false,
  };

  try {
    const response = await fetch(`${getOmniRouteBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: buildOmniRouteHeaders(),
      cache: "no-store",
      signal: attemptController.signal,
      body: JSON.stringify(requestBody),
    });

    const rawText = await response.text();
    const data = safeJsonParse(rawText);
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      const cooldownMs = parseRetryAfterMs(response, data);
      const reason = extractErrorMessage(data, rawText);
      const code =
        response.status === 429
          ? "MODEL_COOLDOWN"
          : RETRYABLE_STATUSES.has(response.status)
            ? "UPSTREAM_RETRYABLE_ERROR"
            : "UPSTREAM_ERROR";

      return {
        ok: false,
        code,
        status: response.status,
        reason,
        cooldownMs,
        latencyMs,
        data,
        rawText,
      };
    }

    const responseText = extractResponseText(data);

    if (!responseText) {
      return {
        ok: false,
        code: "EMPTY_MODEL_RESPONSE",
        status: 502,
        reason: "O modelo respondeu sem conteudo utilizavel.",
        cooldownMs: DEFAULT_FAILURE_COOLDOWN_MS,
        latencyMs,
        data,
        rawText,
      };
    }

    return {
      ok: true,
      status: 200,
      responseText,
      latencyMs,
      data,
      rawText,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const wasExternallyAborted = Boolean(signal?.aborted);
    const timedOut =
      !wasExternallyAborted &&
      (attemptController.signal.aborted || error?.name === "AbortError");

    return {
      ok: false,
      code: wasExternallyAborted
        ? "REQUEST_ABORTED"
        : timedOut
          ? "MODEL_TIMEOUT"
          : "OMNIROUTE_REQUEST_FAILED",
      status: timedOut ? 504 : 502,
      reason: timedOut
        ? `O modelo ultrapassou o limite operacional de ${timeoutMs} ms.`
        : error instanceof Error
          ? error.message
          : "Falha desconhecida ao consultar o OmniRoute.",
      cooldownMs: timedOut
        ? DEFAULT_FAILURE_COOLDOWN_MS
        : 30_000,
      latencyMs,
      data: null,
      rawText: "",
    };
  } finally {
    attemptController.cleanup();
  }
}

export function getReasoningPoolDefinition() {
  return REASONING_POOL.map((model) => ({
    key: model.key,
    name: model.name,
    priority: model.priority,
    role: model.role,
    capabilities: [...model.capabilities],
    timeoutMs: model.timeoutMs,
    freeOnly: model.freeOnly,
  }));
}

export async function getReasoningPoolStatus({ probeCatalog = true } = {}) {
  let catalog = [];
  let omniRouteOk = false;
  let omniRouteError = null;

  if (probeCatalog) {
    try {
      catalog = await fetchCatalog();
      omniRouteOk = true;
    } catch (error) {
      omniRouteError = error instanceof Error ? error.message : "Erro desconhecido.";
    }
  }

  const now = Date.now();

  return {
    ok: true,
    service: "argos-model-manager",
    version: "v0.1.0",
    routingPolicy: "ordered-fallback-fail-closed",
    billingPolicy: "free-only",
    omniRoute: {
      ok: omniRouteOk,
      baseUrl: getOmniRouteBaseUrl(),
      keyPresent: Boolean(getOmniRouteApiKey()),
      error: omniRouteError,
    },
    models: REASONING_POOL.map((model) => {
      const state = getState(model.key);
      const resolved = catalog.length
        ? resolveModelFromCatalog(model, catalog)
        : null;

      return {
        key: model.key,
        name: model.name,
        priority: model.priority,
        role: model.role,
        capabilities: [...model.capabilities],
        freeOnly: model.freeOnly,
        configured: Boolean(resolved),
        routeId: resolved?.id || state.lastRouteId || null,
        owner: resolved?.owned_by || null,
        circuitOpen: state.circuitOpenUntil > now,
        circuitOpenUntil:
          state.circuitOpenUntil > now
            ? new Date(state.circuitOpenUntil).toISOString()
            : null,
        consecutiveFailures: state.consecutiveFailures,
        lastFailureAt: state.lastFailureAt,
        lastFailureCode: state.lastFailureCode,
        lastSuccessAt: state.lastSuccessAt,
        lastLatencyMs: state.lastLatencyMs,
      };
    }),
  };
}

export async function callReasoningPool({
  messages,
  payload = {},
  preferredModelKey = null,
  strictModel = false,
  signal = null,
}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages e obrigatorio para o Reasoning Pool.");
  }

  const catalog = await fetchCatalog();
  const attemptOrder = buildAttemptOrder(preferredModelKey);
  const attempts = [];
  const now = Date.now();

  for (const model of attemptOrder) {
    if (strictModel && preferredModelKey && model.key !== preferredModelKey) {
      continue;
    }

    const state = getState(model.key);

    if (state.circuitOpenUntil > now) {
      attempts.push({
        modelKey: model.key,
        modelName: model.name,
        routeId: state.lastRouteId,
        ok: false,
        code: "CIRCUIT_OPEN",
        status: null,
        latencyMs: 0,
        reason: `Rota temporariamente suspensa ate ${new Date(
          state.circuitOpenUntil
        ).toISOString()}.`,
      });
      continue;
    }

    const resolved = resolveModelFromCatalog(model, catalog);

    if (!resolved) {
      attempts.push({
        modelKey: model.key,
        modelName: model.name,
        routeId: null,
        ok: false,
        code: "MODEL_NOT_AVAILABLE",
        status: null,
        latencyMs: 0,
        reason: "Nenhuma rota gratuita aprovada foi encontrada no catalogo do OmniRoute.",
      });
      continue;
    }

    const result = await callResolvedModel({
      model,
      routeId: resolved.id,
      messages,
      payload,
      signal,
    });

    const attempt = {
      modelKey: model.key,
      modelName: model.name,
      routeId: resolved.id,
      owner: resolved.owned_by || null,
      ok: result.ok,
      code: result.ok ? "OK" : result.code,
      status: result.status,
      latencyMs: result.latencyMs,
      reason: result.ok ? null : result.reason,
    };

    attempts.push(attempt);

    if (attempts.length > MAX_ATTEMPTS_RECORDED) {
      attempts.shift();
    }

    if (result.ok) {
      markSuccess(model, resolved.id, result.latencyMs);

      return {
        ok: true,
        provider: "omniroute",
        modelKey: model.key,
        modelName: model.name,
        routeId: resolved.id,
        owner: resolved.owned_by || null,
        fallbackUsed: attempts.length > 1,
        attempts,
        responseText: result.responseText,
        data: result.data,
        usage: result.data?.usage || null,
      };
    }

    if (result.code === "REQUEST_ABORTED") {
      return {
        ok: false,
        provider: "omniroute",
        code: result.code,
        reason: result.reason,
        attempts,
      };
    }

    markFailure(model, {
      code: result.code,
      reason: result.reason,
      routeId: resolved.id,
      cooldownMs: result.cooldownMs,
    });
  }

  return {
    ok: false,
    provider: "omniroute",
    code: "REASONING_POOL_EXHAUSTED",
    reason: "Nenhum modelo aprovado do Reasoning Pool conseguiu concluir a solicitacao.",
    attempts,
  };
}
