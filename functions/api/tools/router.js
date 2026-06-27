import { jsonResponse } from "./_toolPolicy.js";

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function extractFirstUrl(prompt) {
  const match = String(prompt || "").match(/https?:\/\/[^\s)]+/i);
  return match ? match[0].replace(/[.,;]+$/, "") : null;
}

function extractGitHubRepoFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!/github\.com$/i.test(url.hostname)) {
      return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      return null;
    }

    return `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
  } catch {
    return null;
  }
}

function extractRepoSlug(prompt) {
  const text = String(prompt || "");

  const url = extractFirstUrl(text);
  if (url) {
    const repoFromUrl = extractGitHubRepoFromUrl(url);
    if (repoFromUrl) {
      return repoFromUrl;
    }
  }

  const repoMatch = text.match(/\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\b/);
  if (!repoMatch) {
    return null;
  }

  const candidate = repoMatch[1].replace(/\.git$/i, "");
  const [owner, repo] = candidate.split("/");

  if (!owner || !repo) {
    return null;
  }

  return candidate;
}

function hasGitHubIntent(prompt) {
  const text = normalize(prompt);

  return (
    text.includes("github") ||
    text.includes("repositorio") ||
    text.includes("repository") ||
    text.includes("repo ") ||
    text.includes("status do repositorio") ||
    text.includes("consulte o repositorio") ||
    text.includes("veja o status")
  );
}

function hasWeatherIntent(prompt) {
  const text = normalize(prompt);

  return (
    text.includes("temperatura") ||
    text.includes("clima") ||
    text.includes("tempo") ||
    text.includes("sensacao termica") ||
    text.includes("previsao") ||
    text.includes("chuva") ||
    text.includes("vento") ||
    text.includes("umidade") ||
    text.includes("garoa") ||
    text.includes("trovoada")
  );
}

function buildWeatherEndpoint(prompt) {
  const text = normalize(prompt);

  // Fase inicial: Esteio e padrao do usuario/projeto.
  // Depois evoluiremos para extrair cidade/estado dinamicamente.
  const city = text.includes("esteio") || !text.includes(" em ")
    ? "Esteio"
    : "Esteio";

  const params = new URLSearchParams({
    city,
    state: "Rio Grande do Sul",
    country: "Brasil",
  });

  return `/api/tools/weather?${params.toString()}`;
}

function buildReadUrlEndpoint(rawUrl) {
  const params = new URLSearchParams({ url: rawUrl });
  return `/api/tools/read-url?${params.toString()}`;
}

function buildGitHubEndpoint(repo) {
  const params = new URLSearchParams({ repo });
  return `/api/tools/github-repo?${params.toString()}`;
}

export async function onRequestPost({ request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || "");
    const url = extractFirstUrl(prompt);
    const repo = extractRepoSlug(prompt);

    if (repo && (hasGitHubIntent(prompt) || url?.includes("github.com"))) {
      return jsonResponse({
        ok: true,
        tool: "router",
        detection: {
          tool: "github-repo",
          endpoint: buildGitHubEndpoint(repo),
          reason: "Pergunta exige consulta de repositorio GitHub.",
        },
        promptPreview: prompt.slice(0, 220),
      });
    }

    if (url) {
      return jsonResponse({
        ok: true,
        tool: "router",
        detection: {
          tool: "read-url",
          endpoint: buildReadUrlEndpoint(url),
          reason: "Pergunta contem URL publica para leitura.",
        },
        promptPreview: prompt.slice(0, 220),
      });
    }

    if (hasWeatherIntent(prompt)) {
      return jsonResponse({
        ok: true,
        tool: "router",
        detection: {
          tool: "weather",
          endpoint: buildWeatherEndpoint(prompt),
          reason: "Pergunta exige clima/previsao em tempo real.",
        },
        promptPreview: prompt.slice(0, 220),
      });
    }

    return jsonResponse({
      ok: true,
      tool: "router",
      detection: null,
      promptPreview: prompt.slice(0, 220),
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      tool: "router",
      reason: error?.message || "Falha ao rotear pergunta.",
    }, 500);
  }
}

export async function onRequestGet() {
  return jsonResponse({
    ok: true,
    tool: "router",
    usage: "POST JSON { prompt: string }",
    detects: ["weather", "read-url", "github-repo"],
  });
}
