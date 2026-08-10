import { cleanHtml, jsonResponse, param, policyGate, truncate } from "./_toolPolicy.js";

const MAX_READ_URL_CHARS = 12000;
const MIN_HTML_TEXT_CHARS = 400;
const BROWSER_BINDING_NAME = "ARGOS_WEB_TOOLS";
const BROWSER_INTERNAL_URL = "https://argos-web-tools.internal/read";
const ALLOWED_MODES = new Set(["auto", "fetch", "browser"]);

function isBlockedHost(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");

  if (host.includes(":")) {
    return true;
  }

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

function parseSafeUrl(rawUrl) {
  const value = String(rawUrl || "").trim();

  if (!value || value.length > 2048) {
    throw new Error("A URL deve ter entre 1 e 2048 caracteres.");
  }

  const parsed = new URL(value);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Apenas URLs http/https sao permitidas.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URLs com credenciais embutidas nao sao permitidas.");
  }

  if (isBlockedHost(parsed.hostname)) {
    throw new Error("URL local, privada ou reservada bloqueada por politica de seguranca.");
  }

  return parsed;
}

function isCloudflareDocsUrl(url) {
  return url.hostname === "developers.cloudflare.com";
}

function cloudflareMarkdownCandidate(url) {
  if (!isCloudflareDocsUrl(url)) {
    return null;
  }

  if (url.pathname.endsWith(".md") || url.pathname.endsWith(".txt")) {
    return url.toString();
  }

  const candidate = new URL(url.toString());
  candidate.search = "";
  candidate.hash = "";

  if (!candidate.pathname.endsWith("/")) {
    candidate.pathname += "/";
  }

  candidate.pathname += "index.md";

  return candidate.toString();
}

async function fetchText(url, accept = "text/plain, text/markdown, text/html;q=0.8, */*;q=0.5") {
  const MAX_REDIRECTS = 5;
  let current = parseSafeUrl(url);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(current.toString(), {
      redirect: "manual",
      headers: {
        accept,
        "user-agent": "ARGOS-ReadURLTool/1.0",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");

      if (!location) {
        const text = await response.text();

        return {
          ok: false,
          status: response.status,
          url: current.toString(),
          contentType: response.headers.get("content-type") || "",
          text,
        };
      }

      if (redirectCount >= MAX_REDIRECTS) {
        throw new Error(`Limite de ${MAX_REDIRECTS} redirects excedido.`);
      }

      const nextUrl = new URL(location, current);
      current = parseSafeUrl(nextUrl.toString());
      continue;
    }

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      url: current.toString(),
      contentType: response.headers.get("content-type") || "",
      text,
    };
  }

  throw new Error(`Limite de ${MAX_REDIRECTS} redirects excedido.`);
}

function extractCloudflareMarkdownUrl(htmlText) {
  const match = String(htmlText || "").match(/https:\/\/developers\.cloudflare\.com\/[^\s"'<>]+?\.md/i);
  return match ? match[0] : null;
}

function extractHtmlTitle(htmlText) {
  const match = String(htmlText || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanHtml(match[1]) : null;
}

function extractMarkdownTitle(markdownText) {
  const line = String(markdownText || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith("# "));

  return line ? line.replace(/^#\s+/, "").trim() : null;
}

function normalizeMarkdown(markdownText) {
  return String(markdownText || "")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`{3}[\s\S]*?`{3}/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTextByContentType(text, contentType) {
  if (/html/i.test(contentType)) {
    return cleanHtml(text);
  }

  if (/markdown|text\/plain/i.test(contentType)) {
    return normalizeMarkdown(text);
  }

  return cleanHtml(text);
}

function browserBindingAvailable(env) {
  return Boolean(
    env?.[BROWSER_BINDING_NAME] &&
    typeof env[BROWSER_BINDING_NAME].fetch === "function",
  );
}

function shouldUseBrowserFallback(directResult) {
  if (!directResult?.ok) {
    return true;
  }

  if (!/html/i.test(directResult.contentType || "")) {
    return false;
  }

  const text = String(directResult.text || "").trim();
  const raw = String(directResult.rawText || "");

  if (text.length < MIN_HTML_TEXT_CHARS) {
    return true;
  }

  return /enable javascript|javascript is required|requires javascript|please turn on javascript|id=["'](?:root|app)["'][^>]*>\s*<\/div>/i.test(
    `${text}\n${raw}`,
  );
}

async function readDirect(parsed) {
  let fetched = null;
  let markdownUsed = false;
  let originalHtmlTitle = null;

  const markdownCandidate = cloudflareMarkdownCandidate(parsed);

  if (markdownCandidate) {
    const markdownFetch = await fetchText(
      markdownCandidate,
      "text/markdown, text/plain;q=0.9, */*;q=0.5",
    );

    if (markdownFetch.ok && markdownFetch.text.trim()) {
      fetched = markdownFetch;
      markdownUsed = true;
    }
  }

  if (!fetched) {
    const firstFetch = await fetchText(
      parsed.toString(),
      "text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.5",
    );

    if (!firstFetch.ok) {
      return {
        ok: false,
        status: firstFetch.status,
        reason: `HTTP ${firstFetch.status}`,
        contentType: firstFetch.contentType,
        rawText: firstFetch.text,
      };
    }

    originalHtmlTitle = extractHtmlTitle(firstFetch.text);

    if (/html/i.test(firstFetch.contentType)) {
      const discoveredMarkdownUrl = extractCloudflareMarkdownUrl(firstFetch.text);

      if (discoveredMarkdownUrl) {
        const discoveredMarkdownFetch = await fetchText(
          discoveredMarkdownUrl,
          "text/markdown, text/plain;q=0.9, */*;q=0.5",
        );

        if (discoveredMarkdownFetch.ok && discoveredMarkdownFetch.text.trim()) {
          fetched = discoveredMarkdownFetch;
          markdownUsed = true;
        }
      }
    }

    if (!fetched) {
      fetched = firstFetch;
    }
  }

  const text = normalizeTextByContentType(fetched.text, fetched.contentType);
  const title =
    extractMarkdownTitle(fetched.text) ||
    originalHtmlTitle ||
    extractHtmlTitle(fetched.text) ||
    parsed.hostname;

  return {
    ok: true,
    reader: "fetch",
    fetchedSource: fetched.url,
    markdownUsed,
    status: fetched.status,
    contentType: fetched.contentType,
    title,
    text,
    rawText: fetched.text,
  };
}

async function readWithBrowser(parsed, env) {
  if (!browserBindingAvailable(env)) {
    throw new Error(`Service Binding ${BROWSER_BINDING_NAME} indisponivel.`);
  }

  const response = await env[BROWSER_BINDING_NAME].fetch(
    new Request(BROWSER_INTERNAL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        action: "markdown",
        url: parsed.toString(),
      }),
    }),
  );

  const rawText = await response.text();
  let payload = null;

  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error(`Browser Worker retornou JSON invalido (HTTP ${response.status}).`);
  }

  if (!response.ok || payload?.success !== true || typeof payload?.result !== "string") {
    const detail =
      payload?.message ||
      payload?.error ||
      `Browser Worker retornou HTTP ${response.status}.`;

    throw new Error(String(detail));
  }

  const text = normalizeMarkdown(payload.result);
  const title = extractMarkdownTitle(payload.result) || parsed.hostname;

  return {
    ok: true,
    reader: "browser",
    fetchedSource: parsed.toString(),
    markdownUsed: true,
    status: response.status,
    contentType: response.headers.get("content-type") || "application/json",
    title,
    text,
    browserMsUsed: response.headers.get("x-browser-ms-used") || null,
  };
}

function successPayload(parsed, result, extra = {}) {
  return {
    ok: true,
    tool: "read-url",
    source: parsed.toString(),
    fetchedSource: result.fetchedSource,
    markdownUsed: Boolean(result.markdownUsed),
    status: result.status,
    contentType: result.contentType,
    title: result.title,
    text: truncate(result.text, MAX_READ_URL_CHARS),
    reader: result.reader,
    browserMsUsed: result.browserMsUsed || null,
    ...extra,
  };
}

export async function onRequestGet({ request, env }) {
  const requestUrl = new URL(request.url);
  const gate = policyGate(param(requestUrl, "context", "read_url"));

  if (!gate.ok) {
    return jsonResponse({ ok: false, tool: "read-url", ...gate }, 403);
  }

  const rawUrl = param(requestUrl, "url", "");
  const mode = param(requestUrl, "mode", "auto").toLowerCase();

  if (!rawUrl) {
    return jsonResponse({ ok: false, tool: "read-url", reason: "Informe url." }, 400);
  }

  if (!ALLOWED_MODES.has(mode)) {
    return jsonResponse({
      ok: false,
      tool: "read-url",
      source: rawUrl,
      reason: "Modo invalido. Use auto, fetch ou browser.",
    }, 400);
  }

  let parsed;

  try {
    parsed = parseSafeUrl(rawUrl);
  } catch (error) {
    return jsonResponse({
      ok: false,
      tool: "read-url",
      source: rawUrl,
      reason: error?.message || "URL invalida.",
    }, 400);
  }

  if (mode === "browser") {
    try {
      const browserResult = await readWithBrowser(parsed, env);
      return jsonResponse(successPayload(parsed, browserResult, {
        browserFallbackUsed: false,
        requestedMode: mode,
      }));
    } catch (error) {
      const missingBinding = !browserBindingAvailable(env);

      return jsonResponse({
        ok: false,
        tool: "read-url",
        source: parsed.toString(),
        reader: "browser",
        requestedMode: mode,
        reason: error?.message || "Falha ao ler URL com Browser Run.",
      }, missingBinding ? 503 : 502);
    }
  }

  let directResult;

  try {
    directResult = await readDirect(parsed);
  } catch (error) {
    directResult = {
      ok: false,
      status: 502,
      reason: error?.message || "Falha na leitura direta.",
    };
  }

  if (mode === "fetch") {
    if (!directResult.ok) {
      return jsonResponse({
        ok: false,
        tool: "read-url",
        source: parsed.toString(),
        reader: "fetch",
        requestedMode: mode,
        status: directResult.status,
        reason: directResult.reason || "Falha ao ler URL.",
      }, directResult.status || 502);
    }

    return jsonResponse(successPayload(parsed, directResult, {
      browserFallbackUsed: false,
      requestedMode: mode,
    }));
  }

  const fallbackNeeded = shouldUseBrowserFallback(directResult);

  if (!fallbackNeeded) {
    return jsonResponse(successPayload(parsed, directResult, {
      browserFallbackUsed: false,
      requestedMode: mode,
    }));
  }

  if (browserBindingAvailable(env)) {
    try {
      const browserResult = await readWithBrowser(parsed, env);

      return jsonResponse(successPayload(parsed, browserResult, {
        browserFallbackUsed: true,
        browserFallbackReason: directResult.ok
          ? "Conteudo HTML insuficiente ou dependente de JavaScript."
          : directResult.reason || "Leitura direta falhou.",
        requestedMode: mode,
      }));
    } catch (error) {
      if (directResult.ok) {
        return jsonResponse(successPayload(parsed, directResult, {
          browserFallbackUsed: false,
          browserFallbackAttempted: true,
          browserFallbackError: error?.message || "Falha no Browser Run.",
          requestedMode: mode,
        }));
      }

      return jsonResponse({
        ok: false,
        tool: "read-url",
        source: parsed.toString(),
        reader: "browser",
        browserFallbackAttempted: true,
        requestedMode: mode,
        reason: error?.message || directResult.reason || "Falha ao ler URL.",
      }, 502);
    }
  }

  if (directResult.ok) {
    return jsonResponse(successPayload(parsed, directResult, {
      browserFallbackUsed: false,
      browserFallbackAvailable: false,
      requestedMode: mode,
    }));
  }

  return jsonResponse({
    ok: false,
    tool: "read-url",
    source: parsed.toString(),
    reader: "fetch",
    requestedMode: mode,
    status: directResult.status,
    reason: directResult.reason || "Falha ao ler URL.",
  }, directResult.status || 502);
}
