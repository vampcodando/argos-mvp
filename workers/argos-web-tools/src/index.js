const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const ALLOWED_ACTIONS = new Set(["markdown", "content", "links"]);

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function isPrivateOrLocalHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0"
  ) {
    return true;
  }

  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host)) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);

    if (octets.some((value) => value < 0 || value > 255)) {
      return true;
    }

    if (octets[0] === 192 && octets[1] === 168) {
      return true;
    }

    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
      return true;
    }
  }

  if (
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) {
    return true;
  }

  return false;
}

function validateTargetUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > 2048) {
    throw new Error("A URL deve ser uma string entre 1 e 2048 caracteres.");
  }

  const target = new URL(rawUrl);

  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Somente URLs HTTP ou HTTPS são permitidas.");
  }

  if (target.username || target.password) {
    throw new Error("URLs com credenciais embutidas não são permitidas.");
  }

  if (isPrivateOrLocalHostname(target.hostname)) {
    throw new Error("Endereços locais, privados ou reservados não são permitidos.");
  }

  return target;
}

async function executeBrowserAction(env, action, targetUrl) {
  const response = await env.BROWSER.quickAction(action, {
    url: targetUrl.toString(),
    gotoOptions: {
      waitUntil: "networkidle2",
    },
  });

  const headers = new Headers();
  headers.set(
    "content-type",
    response.headers.get("content-type") || "application/json; charset=utf-8",
  );
  headers.set("cache-control", "no-store");
  headers.set("x-argos-web-tool", action);

  const browserMs = response.headers.get("x-browser-ms-used");
  if (browserMs) {
    headers.set("x-browser-ms-used", browserMs);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "argos-web-tools",
        browserBindingPresent: Boolean(env.BROWSER),
        supportedActions: [...ALLOWED_ACTIONS],
      });
    }

    if (request.method !== "POST" || requestUrl.pathname !== "/read") {
      return jsonResponse(
        {
          ok: false,
          error: "NOT_FOUND",
          expected: "POST /read",
        },
        404,
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: "INVALID_JSON",
          message: "Envie um corpo JSON válido.",
        },
        400,
      );
    }

    const action = typeof body.action === "string" ? body.action : "markdown";

    if (!ALLOWED_ACTIONS.has(action)) {
      return jsonResponse(
        {
          ok: false,
          error: "UNSUPPORTED_ACTION",
          supportedActions: [...ALLOWED_ACTIONS],
        },
        400,
      );
    }

    let targetUrl;

    try {
      targetUrl = validateTargetUrl(body.url);
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error: "INVALID_URL",
          message: error instanceof Error ? error.message : "URL inválida.",
        },
        400,
      );
    }

    try {
      return await executeBrowserAction(env, action, targetUrl);
    } catch (error) {
      console.error("Browser Run failure", {
        action,
        url: targetUrl.toString(),
        message: error instanceof Error ? error.message : String(error),
      });

      return jsonResponse(
        {
          ok: false,
          error: "BROWSER_RUN_ERROR",
          message: error instanceof Error ? error.message : "Falha ao ler a página.",
        },
        502,
      );
    }
  },
};
