import { cleanHtml, jsonResponse, param, policyGate, truncate } from "./_toolPolicy.js";

const MAX_READ_URL_CHARS = 12000;

function isBlockedHost(hostname) {
  const host = String(hostname || "").toLowerCase();

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1"
  ) {
    return true;
  }

  return (
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("172.16.") ||
    host.startsWith("172.17.") ||
    host.startsWith("172.18.") ||
    host.startsWith("172.19.") ||
    host.startsWith("172.20.") ||
    host.startsWith("172.21.") ||
    host.startsWith("172.22.") ||
    host.startsWith("172.23.") ||
    host.startsWith("172.24.") ||
    host.startsWith("172.25.") ||
    host.startsWith("172.26.") ||
    host.startsWith("172.27.") ||
    host.startsWith("172.28.") ||
    host.startsWith("172.29.") ||
    host.startsWith("172.30.") ||
    host.startsWith("172.31.")
  );
}

function parseSafeUrl(rawUrl) {
  const parsed = new URL(String(rawUrl || "").trim());

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Apenas URLs http/https sao permitidas.");
  }

  if (isBlockedHost(parsed.hostname)) {
    throw new Error("URL local/privada bloqueada por politica de seguranca.");
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
  const response = await fetch(url, {
    headers: {
      accept,
      "user-agent": "ARGOS-ReadURLTool/1.0",
    },
  });

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    url,
    contentType: response.headers.get("content-type") || "",
    text,
  };
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

export async function onRequestGet({ request }) {
  const requestUrl = new URL(request.url);
  const gate = policyGate(param(requestUrl, "context", "read_url"));

  if (!gate.ok) {
    return jsonResponse({ ok: false, tool: "read-url", ...gate }, 403);
  }

  const rawUrl = param(requestUrl, "url", "");

  if (!rawUrl) {
    return jsonResponse({ ok: false, tool: "read-url", reason: "Informe url." }, 400);
  }

  try {
    const parsed = parseSafeUrl(rawUrl);
    let fetched = null;
    let markdownUsed = false;
    let originalHtmlTitle = null;

    const markdownCandidate = cloudflareMarkdownCandidate(parsed);

    if (markdownCandidate) {
      const markdownFetch = await fetchText(markdownCandidate, "text/markdown, text/plain;q=0.9, */*;q=0.5");

      if (markdownFetch.ok && markdownFetch.text.trim()) {
        fetched = markdownFetch;
        markdownUsed = true;
      }
    }

    if (!fetched) {
      const firstFetch = await fetchText(parsed.toString(), "text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.5");

      if (!firstFetch.ok) {
        return jsonResponse({
          ok: false,
          tool: "read-url",
          source: parsed.toString(),
          status: firstFetch.status,
          reason: `HTTP ${firstFetch.status}`,
        }, firstFetch.status);
      }

      originalHtmlTitle = extractHtmlTitle(firstFetch.text);

      if (/html/i.test(firstFetch.contentType)) {
        const discoveredMarkdownUrl = extractCloudflareMarkdownUrl(firstFetch.text);

        if (discoveredMarkdownUrl) {
          const discoveredMarkdownFetch = await fetchText(discoveredMarkdownUrl, "text/markdown, text/plain;q=0.9, */*;q=0.5");

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

    return jsonResponse({
      ok: true,
      tool: "read-url",
      source: parsed.toString(),
      fetchedSource: fetched.url,
      markdownUsed,
      status: fetched.status,
      contentType: fetched.contentType,
      title,
      text: truncate(text, MAX_READ_URL_CHARS),
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      tool: "read-url",
      source: rawUrl,
      reason: error?.message || "Falha ao ler URL.",
    }, 500);
  }
}
