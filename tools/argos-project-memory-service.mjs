import http from "node:http";
import {
  buildProjectContext,
  openProjectMemoryDatabase,
} from "./lib/argos-project-memory-core.mjs";
import { buildProjectSession } from "./lib/argos-project-session.mjs";
import { buildBrokerContext } from "./lib/argos-context-broker.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.ARGOS_PROJECT_MEMORY_PORT || 8789);

const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:8788",
  "http://localhost:8788",
  "http://127.0.0.1:8790",
  "http://localhost:8790",
  "https://argos-mvp-5sz.pages.dev",
]);

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

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
    headers["vary"] =
      "Origin, Access-Control-Request-Private-Network";
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

async function readJsonBody(request, maxBytes = 16384) {
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

function compactContext(context) {
  return {
    ...context,
    code: context.code.map((item) => ({
      ...item,
      content:
        String(item.content || "").length > 5000
          ? String(item.content).slice(0, 5000) + "\n...[TRUNCATED]"
          : item.content,
    })),
  };
}

function getHealth() {
  const db = openProjectMemoryDatabase();

  try {
    const projectCount = Number(
      db.prepare("SELECT COUNT(*) AS total FROM projects").get().total || 0
    );

    const fileCount = Number(
      db.prepare("SELECT COUNT(*) AS total FROM files").get().total || 0
    );

    const chunkCount = Number(
      db.prepare("SELECT COUNT(*) AS total FROM chunks").get().total || 0
    );

    const memoryCount = Number(
      db.prepare("SELECT COUNT(*) AS total FROM memories").get().total || 0
    );

    const snapshotCount = Number(
      db.prepare("SELECT COUNT(*) AS total FROM snapshots").get().total || 0
    );

    return {
      ok: true,
      service: "argos-project-memory-service",
      version: "v0.1.0",
      host: `${HOST}:${PORT}`,
      mode: "read-only-context-service",
      capabilities: {
        contextRetrieval: true,
        codeSearch: true,
        memorySearch: true,
        snapshotRead: true,
        fileWrite: false,
        commandExecution: false,
      },
      counts: {
        projects: projectCount,
        files: fileCount,
        chunks: chunkCount,
        memories: memoryCount,
        snapshots: snapshotCount,
      },
    };
  } finally {
    db.close();
  }
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || null;

  if (!isAllowedOrigin(origin)) {
    return sendJson(
      response,
      403,
      {
        ok: false,
        error: {
          code: "ORIGIN_NOT_ALLOWED",
          message: "Origem nao autorizada para a memoria local do ARGOS.",
        },
      },
      origin
    );
  }

  if (request.method === "OPTIONS") {
    return sendOptions(response, origin);
  }

  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);

  try {
    if (
      request.method === "GET" &&
      url.pathname === "/project-memory/health"
    ) {
      return sendJson(response, 200, getHealth(), origin);
    }

    if (
      request.method === "GET" &&
      url.pathname === "/project-memory/session"
    ) {
      const db = openProjectMemoryDatabase();

      try {
        return sendJson(
          response,
          200,
          buildProjectSession(db),
          origin
        );
      } finally {
        db.close();
      }
    }


    if (
      request.method === "POST" &&
      url.pathname === "/project-memory/broker"
    ) {
      const body = await readJsonBody(request);

      const query = String(body.query || "").trim();
      const profile = String(body.profile || "").trim().toUpperCase();

      if (
        !query ||
        query.length > 4000 ||
        !["LOCAL_FULL", "CLOUD_PROJECT"].includes(profile)
      ) {
        return sendJson(
          response,
          400,
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message:
                "query e obrigatoria e deve ter no maximo 4000 caracteres; profile deve ser LOCAL_FULL ou CLOUD_PROJECT.",
            },
          },
          origin
        );
      }

      const db = openProjectMemoryDatabase();

      try {
        return sendJson(
          response,
          200,
          buildBrokerContext(db, query, profile),
          origin
        );
      } finally {
        db.close();
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/project-memory/context"
    ) {
      const body = await readJsonBody(request);

      const projectId = String(body.projectId || "").trim();
      const query = String(body.query || "").trim();

      if (!projectId || !query || query.length > 4000) {
        return sendJson(
          response,
          400,
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message:
                "projectId e query sao obrigatorios; query deve ter no maximo 4000 caracteres.",
            },
          },
          origin
        );
      }

      const db = openProjectMemoryDatabase();

      try {
        const context = buildProjectContext(
          db,
          projectId,
          query,
          {
            memoryLimit: 5,
            codeLimit: 6,
          }
        );

        return sendJson(
          response,
          200,
          compactContext(context),
          origin
        );
      } finally {
        db.close();
      }
    }

    return sendJson(
      response,
      404,
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Rota inexistente no Project Memory Service.",
        },
      },
      origin
    );
  } catch (error) {
    const status =
      error?.code === "PAYLOAD_TOO_LARGE"
        ? 413
        : error?.code === "INVALID_JSON"
          ? 400
          : 500;

    return sendJson(
      response,
      status,
      {
        ok: false,
        service: "argos-project-memory-service",
        error: {
          code: error?.code || "PROJECT_MEMORY_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Erro interno.",
        },
      },
      origin
    );
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `ARGOS Project Memory Service online em http://${HOST}:${PORT}`
  );
  console.log("Modo: somente leitura de contexto.");
});
