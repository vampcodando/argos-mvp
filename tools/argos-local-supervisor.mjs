import http from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, openSync, closeSync } from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const HOST = "127.0.0.1";
const PORT = Number(process.env.ARGOS_LOCAL_SUPERVISOR_PORT || 8786);
const BRIDGE_PORT = 8787;
const OLLAMA_PORT = 11434;
const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const BRIDGE_BASE_URL = "http://127.0.0.1:8787";

const LOG_DIR = path.join(ROOT, "logs");
mkdirSync(LOG_DIR, { recursive: true });

let ollamaProcess = null;
let bridgeProcess = null;

const ALLOWED_MODELS = new Map([
  [
    "qwen2.5:3b",
    {
      id: "qwen2.5:3b",
      name: "qwen2.5:3b",
      size: "1.9 GB",
      role: "Modelo geral leve para conversa local controlada.",
      preferred: true,
    },
  ],
  [
    "qwen2.5-coder:7b",
    {
      id: "qwen2.5-coder:7b",
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

  "http://127.0.0.1:8788",
  "http://localhost:8788",
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

function corsHeaders(origin) {
  const headers = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };

  if (origin && isAllowedOrigin(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "GET,POST,OPTIONS";
    headers["access-control-allow-headers"] =
      "content-type,accept,access-control-request-private-network";
    headers["access-control-allow-private-network"] = "true";
    headers["access-control-max-age"] = "600";
    headers["vary"] = "Origin, Access-Control-Request-Private-Network";
  }

  return headers;
}

function sendJson(response, status, payload, origin = null) {
  response.writeHead(status, {
    ...corsHeaders(origin),
    "content-type": "application/json; charset=utf-8",
  });

  response.end(JSON.stringify(payload, null, 2));
}

function sendOptions(response, origin = null) {
  response.writeHead(204, corsHeaders(origin));
  response.end();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${url} retornou ${response.status}`);
  }

  return response.json();
}

async function getOllamaTags() {
  return fetchJson(`${OLLAMA_BASE_URL}/api/tags`);
}

async function getBridgeHealth() {
  return fetchJson(`${BRIDGE_BASE_URL}/local-ai/health`);
}

async function isOllamaOnline() {
  try {
    await getOllamaTags();
    return true;
  } catch {
    return false;
  }
}

async function isBridgeOnline() {
  try {
    await getBridgeHealth();
    return true;
  } catch {
    return false;
  }
}

function getOllamaExe() {
  if (process.env.ARGOS_OLLAMA_EXE) {
    return process.env.ARGOS_OLLAMA_EXE;
  }

  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe");
  }

  return "ollama";
}

function spawnLogged(file, args, name, extraEnv = {}) {
  const outFd = openSync(path.join(LOG_DIR, `${name}.out.log`), "a");
  const errFd = openSync(path.join(LOG_DIR, `${name}.err.log`), "a");

  const child = spawn(file, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      ...extraEnv,
    },
    windowsHide: true,
    stdio: ["ignore", outFd, errFd],
  });

  child.on("exit", () => {
    try {
      closeSync(outFd);
    } catch {}

    try {
      closeSync(errFd);
    } catch {}

    if (name === "ollama") {
      ollamaProcess = null;
    }

    if (name === "local-ai-bridge") {
      bridgeProcess = null;
    }
  });

  child.on("error", () => {
    try {
      closeSync(outFd);
    } catch {}

    try {
      closeSync(errFd);
    } catch {}
  });

  return child;
}

async function waitFor(check, label, attempts = 30, delayMs = 1000) {
  for (let index = 0; index < attempts; index += 1) {
    if (await check()) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`${label} nao ficou online dentro do tempo esperado.`);
}

async function killPort(port) {
  const script = `
$ErrorActionPreference = "SilentlyContinue"
$ids = @(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($id in $ids) {
  if ($id) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }
}
exit 0
`;

  try {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ]);
  } catch {}
}

async function killProcessNames(names) {
  const quotedNames = names.map((name) => `"${name}"`).join(", ");

  const script = `
$ErrorActionPreference = "SilentlyContinue"
$names = @(${quotedNames})
foreach ($name in $names) {
  Get-Process -Name $name -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
}
exit 0
`;

  try {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ]);
  } catch {}
}

async function startOllama() {
  if (await isOllamaOnline()) {
    return;
  }

  const ollamaExe = getOllamaExe();

  ollamaProcess = spawnLogged(ollamaExe, ["serve"], "ollama", {
    OLLAMA_MODELS: "F:\\IA_LOCAL\\ollama\\models",
    OLLAMA_HOST: "127.0.0.1:11434",
  });

  await waitFor(isOllamaOnline, "Ollama", 45, 1000);
}

async function startBridge() {
  if (await isBridgeOnline()) {
    return;
  }

  bridgeProcess = spawnLogged(
    "node",
    ["tools/argos-local-ollama-bridge.mjs"],
    "local-ai-bridge"
  );

  await waitFor(isBridgeOnline, "Ponte local", 20, 1000);
}

async function stopLocalAi() {
  try {
    bridgeProcess?.kill();
  } catch {}

  try {
    ollamaProcess?.kill();
  } catch {}

  bridgeProcess = null;
  ollamaProcess = null;

  try {
    await killPort(BRIDGE_PORT);
  } catch {}

  try {
    await killPort(OLLAMA_PORT);
  } catch {}

  // O app do Ollama no Windows pode manter/recriar o servidor.
  // Para o ARGOS ser o controlador real, encerramos tambem processos Ollama.
  await killProcessNames(["ollama", "llama-server"]);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Segunda passada contra respawn imediato.
  try {
    await killPort(BRIDGE_PORT);
  } catch {}

  try {
    await killPort(OLLAMA_PORT);
  } catch {}

  await killProcessNames(["ollama", "llama-server"]);
}

function formatModels(names) {
  const installed = new Set(names || []);

  return Array.from(ALLOWED_MODELS.values()).map((model) => ({
    ...model,
    installed: installed.has(model.id),
  }));
}

async function getStatusPayload() {
  let tags = null;
  let detectedModels = [];

  try {
    tags = await getOllamaTags();
    detectedModels = Array.isArray(tags.models)
      ? tags.models.map((model) => model.name)
      : [];
  } catch {}

  const ollamaOk = detectedModels.length > 0 || (await isOllamaOnline());
  const bridgeOk = await isBridgeOnline();

  return {
    ok: true,
    service: "argos-local-supervisor",
    version: "v0.4.3",
    supervisor: {
      ok: true,
      host: `${HOST}:${PORT}`,
    },
    ollama: {
      ok: ollamaOk,
      baseUrl: OLLAMA_BASE_URL,
      detectedModels,
    },
    bridge: {
      ok: bridgeOk,
      baseUrl: BRIDGE_BASE_URL,
    },
    localAiReady: ollamaOk && bridgeOk,
    models: formatModels(detectedModels),
    locks: {
      paidApiEnabled: false,
      commandExecutionEnabled: false,
      fileWriteEnabled: false,
      deployExecutionEnabled: false,
    },
  };
}

async function startLocalAi() {
  await startOllama();
  await startBridge();

  return getStatusPayload();
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || null;

  if (!isAllowedOrigin(origin)) {
    return sendJson(response, 403, {
      ok: false,
      error: {
        code: "ORIGIN_NOT_ALLOWED",
        message: "Origem nao autorizada para o supervisor local do ARGOS.",
      },
    }, origin);
  }

  if (request.method === "OPTIONS") {
    return sendOptions(response, origin);
  }

  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);

  try {
    if (request.method === "GET" && url.pathname === "/local-supervisor/status") {
      return sendJson(response, 200, await getStatusPayload(), origin);
    }

    if (request.method === "POST" && url.pathname === "/local-supervisor/start-ai") {
      return sendJson(response, 200, await startLocalAi(), origin);
    }

    if (request.method === "POST" && url.pathname === "/local-supervisor/stop-ai") {
      await stopLocalAi();

      return sendJson(response, 200, await getStatusPayload(), origin);
    }

    return sendJson(response, 404, {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Rota inexistente no supervisor local do ARGOS.",
      },
    }, origin);
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      error: {
        code: "LOCAL_SUPERVISOR_ERROR",
        message: error instanceof Error ? error.message : "Erro interno.",
      },
      logs: {
        supervisor: "logs/local-supervisor.*.log",
        ollama: "logs/ollama.*.log",
        bridge: "logs/local-ai-bridge.*.log",
      },
    }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ARGOS Local Supervisor online em http://${HOST}:${PORT}`);
  console.log("Estado inicial: IA local desligada ate comando manual do usuario.");
});
