import { cleanHtml, jsonResponse, param, policyGate, truncate } from "./_toolPolicy.js";

function blocked(target) {
  try {
    const parsed = new URL(target);
    const host = parsed.hostname.toLowerCase();
    if (!["http:", "https:"].includes(parsed.protocol)) return true;
    return host === "localhost" || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("172.16.");
  } catch {
    return true;
  }
}

function title(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanHtml(match[1]) : "";
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const gate = policyGate(param(url, "context", "web"));
  if (!gate.ok) return jsonResponse({ ok: false, tool: "read-url", ...gate }, 403);

  const target = param(url, "url", "");
  if (!target || blocked(target)) {
    return jsonResponse({ ok: false, tool: "read-url", reason: "URL vazia, invalida ou bloqueada." }, 400);
  }

  try {
    const res = await fetch(target, {
      headers: { "user-agent": "ARGOS-ReadUrl/1.0", "accept": "text/html,text/plain" }
    });
    const html = await res.text();
    if (!res.ok) return jsonResponse({ ok: false, tool: "read-url", status: res.status, reason: truncate(html, 500) }, 502);

    return jsonResponse({
      ok: true,
      tool: "read-url",
      source: target,
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      title: title(html),
      text: truncate(cleanHtml(html), 7000)
    });
  } catch (error) {
    return jsonResponse({ ok: false, tool: "read-url", reason: error.message || "Falha." }, 500);
  }
}
