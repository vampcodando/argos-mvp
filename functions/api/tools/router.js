import { jsonResponse } from "./_toolPolicy.js";

function detect(prompt) {
  const raw = String(prompt || "");
  const text = raw.toLowerCase();

  const url = raw.match(/https?:\/\/[^\s)]+/i);
  if (url) return { tool: "read-url", endpoint: `/api/tools/read-url?url=${encodeURIComponent(url[0])}`, reason: "Pergunta contem URL." };

  const gh = raw.match(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i);
  if (gh) return { tool: "github-repo", endpoint: `/api/tools/github-repo?repo=${encodeURIComponent(gh[1])}`, reason: "Pergunta contem repositorio GitHub." };

  if (text.includes("temperatura") || text.includes("clima") || text.includes("previsao") || text.includes("previsão") || text.includes("chuva") || text.includes("chover")) {
    const city = text.includes("porto alegre") ? "Porto Alegre" : "Esteio";
    return { tool: "weather", endpoint: `/api/tools/weather?city=${encodeURIComponent(city)}&state=Rio%20Grande%20do%20Sul&country=Brasil`, reason: "Pergunta exige clima em tempo real." };
  }

  return { tool: "none", endpoint: null, reason: "Nenhuma ferramenta detectada." };
}

export async function onRequestPost({ request }) {
  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  return jsonResponse({ ok: true, tool: "router", detection: detect(prompt), promptPreview: prompt.slice(0, 300) });
}
