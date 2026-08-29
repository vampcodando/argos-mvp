import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const HOST = "127.0.0.1";
const PORT = Number(process.env.ARGOS_LOCAL_AI_PORT || 8787);
const OLLAMA_BASE_URL = process.env.ARGOS_OLLAMA_URL || "http://127.0.0.1:11434";

const execFileAsync = promisify(execFile);
const HERMES_COMMAND = process.env.ARGOS_HERMES_COMMAND || path.join(process.env.LOCALAPPDATA || "", "hermes", "hermes-agent", "venv", "Scripts", "hermes.exe");
const HERMES_TIMEOUT_MS = Number(process.env.ARGOS_HERMES_TIMEOUT_MS || 240000);
const HERMES_PROMPT_LIMIT = Number(process.env.ARGOS_HERMES_PROMPT_LIMIT || 6000);
const LOCAL_PROMPT_LIMIT = Number(process.env.ARGOS_LOCAL_PROMPT_LIMIT || 6000);

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
]);

const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "https://argos-mvp-5sz.pages.dev",

  "http://127.0.0.1:8788",
  "http://localhost:8788",
  "http://127.0.0.1:8790",
  "http://localhost:8790",
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
      hermes: {
        configured: true,
        command: HERMES_COMMAND,
        route: "/local-ai/hermes/chat",
        timeoutMs: HERMES_TIMEOUT_MS,
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

  if (!prompt || prompt.length > LOCAL_PROMPT_LIMIT) {
    return sendJson(response, 400, {
      ok: false,
      error: {
        code: "INVALID_PROMPT",
        message: `Prompt vazio ou acima do limite de ${LOCAL_PROMPT_LIMIT} caracteres.`,
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


function buildHermesPrompt(userPrompt) {
  return [
    "Contexto oficial do ARGOS:",
    "Voce e o Hermes Agent rodando localmente como agente auxiliar do ARGOS.",
    "ARGOS e o orquestrador mestre, painel e camada de governanca.",
    "Responda sempre em portugues do Brasil.",
    "",
    "Regra obrigatoria de saida:",
    "Nunca devolva JSON cru para o usuario.",
    "Nunca responda apenas com objetos como {name, arguments}.",
    "Nunca use tool-call JSON para conversa normal.",
    "Se precisar esclarecer algo, faca a pergunta diretamente em texto natural.",
    "Se o usuario pedir apresentacao, saudacao, explicacao, resumo ou opiniao tecnica, responda diretamente em texto natural.",
    "",
    "Regras de seguranca:",
    "Nao afirme que executou comandos, escreveu arquivos, fez deploy ou usou API externa se isso nao aconteceu.",
    "Para comandos e ferramentas, quando necessario, descreva a acao proposta em texto natural; o ARGOS classificara risco e executara apenas o que for permitido.",
    "",
    "Politica de autonomia do ARGOS:",
    "READ_ONLY_AUTO: consultas, leitura, diagnosticos e listagens podem ser automaticos.",
    "SAFE_LOCAL_AUTO: tarefas locais seguras dentro do projeto podem ser automaticas.",
    "PROJECT_CHANGE_APPROVAL: alteracoes de arquivos/projeto precisam de aprovacao por lote.",
    "CRITICAL_APPROVAL: deploy, push, delete, .env, APIs pagas, dados sensiveis e producao sempre exigem aprovacao.",
    "",
    "Mensagem do usuario:",
    userPrompt,
  ].join("\n");
}

function cleanHermesOutput(value) {
  return String(value || "")
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .trim();
}

function normalizeHermesOutput(value) {
  const output = cleanHermesOutput(value);

  if (!output) {
    return "";
  }

  try {
    const parsed = JSON.parse(output);

    if (parsed && typeof parsed === "object" && typeof parsed.name === "string") {
      const args = parsed.arguments && typeof parsed.arguments === "object"
        ? parsed.arguments
        : {};

      if (parsed.name === "clarify" && typeof args.question === "string") {
        return args.question.trim();
      }

      return [
        `O Hermes propos a acao "${parsed.name}", mas nesta fase o ARGOS nao executa ferramentas diretamente pelo chat.`,
        "Descreva o que deseja fazer em linguagem natural para que o ARGOS classifique o risco e conduza a proxima etapa.",
      ].join("\n\n");
    }
  } catch {
    // saida normal em texto; segue sem conversao
  }

  return output;
}

async function handleHermesChat(request, response, origin) {
  const body = await readJsonBody(request, 16384);
  const prompt = String(body.prompt || "").trim();

  if (!prompt || prompt.length > HERMES_PROMPT_LIMIT) {
    return sendJson(response, 400, {
      ok: false,
      error: {
        code: "INVALID_PROMPT",
        message: "Prompt vazio ou acima do limite permitido para o Hermes.",
      },
    }, origin);
  }

  const startedAt = Date.now();
  const hermesPrompt = buildHermesPrompt(prompt);

  try {
    const result = await execFileAsync(
      HERMES_COMMAND,
      ["-z", hermesPrompt],
      {
        cwd: process.cwd(),
        timeout: HERMES_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4,
        env: {
          ...process.env,
          HERMES_HOME: process.env.HERMES_HOME || path.join(process.env.LOCALAPPDATA || "", "hermes"),
        },
      }
    );

    const rawStdout = cleanHermesOutput(result.stdout);
    const stdout = normalizeHermesOutput(rawStdout);
    const stderr = cleanHermesOutput(result.stderr);

    return sendJson(response, 200, {
      ok: true,
      agent: "hermes",
      mode: "oneshot",
      command: HERMES_COMMAND,
      response: stdout,
      stderr: stderr || null,
      metrics: {
        durationMs: Date.now() - startedAt,
        timeoutMs: HERMES_TIMEOUT_MS,
      },
      locks: {
        paidApiEnabled: false,
        directCommandExecutionByHermes: false,
        argosPermissionPolicyEnabled: true,
      },
    }, origin);
  } catch (error) {
    const stdout = cleanHermesOutput(error.stdout);
    const stderr = cleanHermesOutput(error.stderr);
    const timedOut = error.killed || error.signal === "SIGTERM";

    return sendJson(response, timedOut ? 504 : 502, {
      ok: false,
      agent: "hermes",
      mode: "oneshot",
      error: {
        code: timedOut ? "HERMES_TIMEOUT" : "HERMES_FAILED",
        message: error.code === "ENOENT"
          ? "Comando hermes nao encontrado pelo processo da ponte local."
          : error.message || "Falha ao executar Hermes local.",
      },
      stdout: stdout || null,
      stderr: stderr || null,
      metrics: {
        durationMs: Date.now() - startedAt,
        timeoutMs: HERMES_TIMEOUT_MS,
      },
    }, origin);
  }
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
      return await handleHealth(response, origin);
    }

    if (request.method === "GET" && url.pathname === "/local-ai/models") {
      return await handleModels(response, origin);
    }

    if (request.method === "POST" && url.pathname === "/local-ai/chat") {
      return await handleChat(request, response, origin);
    }

    if (request.method === "POST" && url.pathname === "/local-ai/hermes/chat") {
      return await handleHermesChat(request, response, origin);
    }

    return sendJson(response, 404, {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Rota inexistente na ponte local do ARGOS.",
      },
    }, origin);
  } catch (error) {
    const status = error.code === "PAYLOAD_TOO_LARGE" ? 413 : error.code === "INVALID_JSON" ? 400 : 500;

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
