import http from "node:http";

const HOST = "127.0.0.1";
const PORT = Number(process.env.ARGOS_LOCAL_AI_PORT || 8787);
const OLLAMA_BASE_URL = process.env.ARGOS_OLLAMA_URL || "http://127.0.0.1:11434";

const ALLOWED_MODELS = new Map([
  [
    "qwen2.5:3b",
    {
      name: "qwen2.5:3b",
      size: "1.9 GB",
      role: "Modelo geral leve para conversa local controlada.",
      preferred: true,
    },
  ],
  [
    "qwen2.5-coder:7b",
    {
      name: "qwen2.5-coder:7b",
      size: "4.7 GB",
      role: "Modelo tecnico para codigo, patches e analise de scripts.",
      preferred: false,
    },
  ],
]);

const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "https://argos-mvp-5sz.pages.dev",
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;

  if (ALLOWED_ORIGINS.has(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);

    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".argos-mvp-5sz.pages.dev")
    );
  } catch {
    return false;
  }
}

function sendJson(response, status, payload, origin = null) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };

  if (origin && isAllowedOrigin(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "GET,POST,OPTIONS";
    headers["access-control-allow-headers"] = "content-type,accept";
    headers["access-control-max-age"] = "600";
  }

  response.writeHead(status, headers);
  response.end(JSON.stringify(payload, null, 2));
}

function sendOptions(response, origin = null) {
  const headers = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,accept,access-control-request-private-network",
    "access-control-max-age": "600",
    "access-control-allow-private-network": "true",
    "vary": "Origin, Access-Control-Request-Private-Network",
  };

  if (origin && isAllowedOrigin(origin)) {
    headers["access-control-allow-origin"] = origin;
  }

  response.writeHead(204, headers);
  response.end();
}

async function readJsonBody(request, maxBytes = 8192) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    size += chunk.length;

    if (size > maxBytes) {
      const error = new Error("Payload acima do limite permitido.");
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }

    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");

  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("JSON invalido.");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function buildSystemPrompt(userPrompt) {
  return `Contexto oficial do ARGOS:
ARGOS e um Project Master local para coordenar projetos de desenvolvimento, agentes, auditoria, snapshots, validacoes, comandos aprovados e integracao futura com IAs locais.
ARGOS nao e sistema maritimo, nao monitora navios e nao monitora pesca.
Nesta fase, a IA local nao pode executar comandos, nao pode alterar arquivos, nao pode fazer deploy, nao pode usar API paga e nao substitui validacao tecnica humana.
Responda em portugues do Brasil.
Se faltar contexto, diga que precisa de mais informacoes.
Se o usuario pedir acao perigosa, explique que a fase atual e somente conversa local controlada.

Mensagem do usuario:
${userPrompt}`;
}

async function ollamaTags() {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Ollama /api/tags retornou ${response.status}`);
  }

  return response.json();
}

async function handleHealth(response, origin) {
  try {
    const tags = await ollamaTags();
    const names = Array.isArray(tags.models)
      ? tags.models.map((model) => model.name)
      : [];

    sendJson(response, 200, {
      ok: true,
      service: "argos-local-ai-bridge",
      version: "v0.4.2",
      host: `${HOST}:${PORT}`,
      ollama: {
        ok: true,
        baseUrl: OLLAMA_BASE_URL,
        detectedModels: names,
      },
      locks: {
        paidApiEnabled: false,
        commandExecutionEnabled: false,
        fileWriteEnabled: false,
        deployExecutionEnabled: false,
      },
      allowedModels: Array.from(ALLOWED_MODELS.keys()),
    }, origin);
  } catch (error) {
    sendJson(response, 503, {
      ok: false,
      service: "argos-local-ai-bridge",
      version: "v0.4.2",
      error: {
        code: "OLLAMA_UNAVAILABLE",
        message: "Ollama local nao respondeu em 127.0.0.1:11434.",
      },
    }, origin);
  }
}

async function handleModels(response, origin) {
  try {
    const tags = await ollamaTags();
    const installed = new Set(
      Array.isArray(tags.models) ? tags.models.map((model) => model.name) : []
    );

    const models = Array.from(ALLOWED_MODELS.entries()).map(([id, meta]) => ({
      id,
      name: meta.name,
      size: meta.size,
      role: meta.role,
      preferred: meta.preferred,
      installed: installed.has(id),
    }));

    sendJson(response, 200, {
      ok: true,
      models,
    }, origin);
  } catch {
    sendJson(response, 503, {
      ok: false,
      error: {
        code: "OLLAMA_UNAVAILABLE",
        message: "Nao foi possivel listar modelos do Ollama.",
      },
    }, origin);
  }
}

async function handleChat(request, response, origin) {
  const body = await readJsonBody(request, 8192);

  const model = String(body.model || "").trim();
  const prompt = String(body.prompt || "").trim();

  if (!ALLOWED_MODELS.has(model)) {
    return sendJson(response, 400, {
      ok: false,
      error: {
        code: "MODEL_NOT_ALLOWED",
        message: "Modelo nao permitido nesta fase do ARGOS.",
      },
    }, origin);
  }

  if (!prompt || prompt.length > 2000) {
    return sendJson(response, 400, {
      ok: false,
      error: {
        code: "INVALID_PROMPT",
        message: "Prompt vazio ou acima do limite de 2000 caracteres.",
      },
    }, origin);
  }

  const ollamaPayload = {
    model,
    prompt: buildSystemPrompt(prompt),
    stream: false,
    options: {
      temperature: 0.1,
      num_predict: 512,
    },
  };

  const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(ollamaPayload),
  });

  if (!ollamaResponse.ok) {
    return sendJson(response, 502, {
      ok: false,
      error: {
        code: "OLLAMA_GENERATE_FAILED",
        message: `Ollama retornou ${ollamaResponse.status}.`,
      },
    }, origin);
  }

  const payload = await ollamaResponse.json();

  return sendJson(response, 200, {
    ok: true,
    model,
    response: String(payload.response || "").trim(),
    metrics: {
      totalDuration: payload.total_duration ?? null,
      promptEvalCount: payload.prompt_eval_count ?? null,
      evalCount: payload.eval_count ?? null,
    },
    locks: {
      paidApiEnabled: false,
      commandExecutionEnabled: false,
      fileWriteEnabled: false,
      deployExecutionEnabled: false,
    },
  }, origin);
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || null;

  if (!isAllowedOrigin(origin)) {
    return sendJson(response, 403, {
      ok: false,
      error: {
        code: "ORIGIN_NOT_ALLOWED",
        message: "Origem nao autorizada para a ponte local do ARGOS.",
      },
    }, origin);
  }

  if (request.method === "OPTIONS") {
    return sendOptions(response, origin);
  }

  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);

  try {
    if (request.method === "GET" && url.pathname === "/local-ai/health") {
      return handleHealth(response, origin);
    }

    if (request.method === "GET" && url.pathname === "/local-ai/models") {
      return handleModels(response, origin);
    }

    if (request.method === "POST" && url.pathname === "/local-ai/chat") {
      return handleChat(request, response, origin);
    }

    return sendJson(response, 404, {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Rota inexistente na ponte local do ARGOS.",
      },
    }, origin);
  } catch (error) {
    const status = error.code === "PAYLOAD_TOO_LARGE" ? 413 : 500;

    return sendJson(response, status, {
      ok: false,
      error: {
        code: error.code || "INTERNAL_ERROR",
        message: error.message || "Erro interno na ponte local.",
      },
    }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ARGOS local AI bridge online em http://${HOST}:${PORT}`);
  console.log(`Ollama alvo: ${OLLAMA_BASE_URL}`);
  console.log("Modelos permitidos:", Array.from(ALLOWED_MODELS.keys()).join(", "));
});
