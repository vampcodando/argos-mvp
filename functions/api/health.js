function jsonResponse(payload, init = {}) {
  const headers = new Headers(init.headers || {});

  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");

  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers,
  });
}

function maskEmail(value) {
  if (!value || typeof value !== "string" || !value.includes("@")) {
    return null;
  }

  const [name, domain] = value.split("@");
  const safeName =
    name.length <= 2 ? `${name[0] || "*"}*` : `${name.slice(0, 2)}***`;

  return `${safeName}@${domain}`;
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== "GET") {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Metodo nao permitido para este endpoint.",
        },
      },
      {
        status: 405,
        headers: {
          allow: "GET",
        },
      }
    );
  }

  const headers = request.headers;

  const accessEmail =
    headers.get("cf-access-authenticated-user-email") ||
    headers.get("Cf-Access-Authenticated-User-Email");

  const accessJwt =
    headers.get("cf-access-jwt-assertion") ||
    headers.get("Cf-Access-Jwt-Assertion");

  return jsonResponse({
    ok: true,
    service: "argos-edge-health",
    version: "v0.3.0",
    mode: "cloudflare-pages-functions",
    timestamp: new Date().toISOString(),
    security: {
      frontendTrusted: false,
      edgeFunctionActive: true,
      cloudflareAccessHeaderDetected: Boolean(accessEmail || accessJwt),
      cloudflareAccessJwtPresent: Boolean(accessJwt),
      authenticatedUserMasked: maskEmail(accessEmail),
    },
    locks: {
      paidApiEnabled: false,
      commandExecutionEnabled: false,
      fileWriteEnabled: false,
      deployExecutionEnabled: false,
    },
  });
}
