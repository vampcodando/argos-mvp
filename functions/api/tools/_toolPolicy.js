export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

const BLOCKED = new Set([
  "servico_social",
  "alojamento_celeiro",
  "athlete_data",
  "family_data",
  "social_report",
  "institutional_document",
  "database_content",
  "secret_or_token",
  "source_code_private",
  "technical_log_sensitive"
]);

export function policyGate(context = "public") {
  const normalized = String(context || "public").trim().toLowerCase();
  if (BLOCKED.has(normalized)) {
    return { ok: false, reason: `Contexto bloqueado para ferramenta externa: ${normalized}` };
  }
  return { ok: true, context: normalized };
}

export function param(url, name, fallback = "") {
  const value = url.searchParams.get(name);
  return value && value.trim() ? value.trim() : fallback;
}

export async function fetchJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "user-agent": "ARGOS-ToolCore/1.0",
      "accept": "application/json",
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export function cleanHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(text, max = 7000) {
  const value = String(text || "").trim();
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
