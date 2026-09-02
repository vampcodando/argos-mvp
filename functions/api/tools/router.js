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

  const explicitPatterns = [
    /\b(?:repo|repositorio|repositório|repository)\s*[:=]?\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\b/i,
    /\bgithub\s*[:=]?\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\b/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const candidate = match[1].replace(/\.git$/i, "");
    const [owner, repo] = candidate.split("/");

    if (owner && repo) {
      return candidate;
    }
  }

  return null;
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

function hasProjectSourceIntent(prompt) {
  const text = normalize(prompt);

  const explicitSelfProjectTerms = [
    "seu projeto",
    "proprio projeto",
    "projeto argos",
    "seu codigo",
    "proprio codigo",
    "codigo do argos",
    "arquitetura do argos",
    "como o argos funciona",
    "como voce funciona",
    "o que voce consegue fazer",
    "quais capacidades voce tem",
    "quais modelos voce usa",
    "modelos do argos",
    "sua arvore de decisao",
    "arvore de decisao do argos",
    "seu fluxo de decisao",
    "project source",
  ];

  if (explicitSelfProjectTerms.some((term) => text.includes(term))) {
    return true;
  }

  const auditTerms = [
    "audite",
    "auditar",
    "auditoria",
    "analise sua arquitetura",
    "analise o argos",
    "capabilidades do argos",
    "capacidades do argos",
    "roteamento do argos",
    "reasoning pool",
    "media pool",
    "project memory",
  ];

  return auditTerms.some((term) => text.includes(term));
}

function resolveProjectAuditMode(prompt) {
  const text = normalize(prompt);

  const deepTerms = [
    "auditoria completa",
    "auditoria integral",
    "auditoria profunda",
    "audite completamente",
    "audite profundamente",
    "analise profundamente",
    "analise completa",
    "analise integral",
    "todos os arquivos",
    "todo o repositorio",
    "repositorio inteiro",
    "deep audit",
    "modo deep",
  ];

  return deepTerms.some((term) => text.includes(term))
    ? "deep"
    : "quick";
}

function hasWeatherIntent(prompt) {
  const text = normalize(prompt);

  return (
    text.includes("temperatura") ||
    text.includes("clima") ||
    /\btempo\b/.test(text) ||
    text.includes("sensacao termica") ||
    text.includes("previsao") ||
    text.includes("chuva") ||
    text.includes("vento") ||
    text.includes("umidade") ||
    text.includes("garoa") ||
    text.includes("trovoada")
  );
}

function hasWebResearchIntent(prompt) {
  const text = normalize(prompt);

  const explicitResearchTerms = [
    "pesquise",
    "pesquisar",
    "pesquisa na internet",
    "procure",
    "buscar",
    "busque",
    "consulte",
    "consultar",
    "verifique",
    "verificar",
    "confira",
    "investigue",
    "na internet",
    "na web",
    "no site",
    "site da",
    "site do",
    "fonte oficial",
  ];

  if (explicitResearchTerms.some((term) => text.includes(term))) {
    return true;
  }

  const currentInformationTerms = [
    "mais recente",
    "atualizado",
    "atualizada",
    "atualmente",
    "status atual",
    "preco atual",
    "cotacao",
    "valor do dolar",
    "lancamento",
    "disponivel via api",
    "disponiveis via api",
    "mais vendido",
    "mais vendida",
    "mais vendidos",
    "mais vendidas",
    "em todos os tempos",
  ];

  return currentInformationTerms.some((term) => text.includes(term));
}

function normalizeDomain(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");

  if (
    !raw ||
    raw.length > 253 ||
    !/^[a-z0-9.-]+$/.test(raw) ||
    !raw.includes(".")
  ) {
    return null;
  }

  return raw;
}

function extractDomainsFromPrompt(prompt) {
  const text = String(prompt || "");

  const matches =
    text.match(
      /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi,
    ) || [];

  return matches
    .map(normalizeDomain)
    .filter(Boolean);
}

function inferOfficialDomains(prompt) {
  const text = normalize(prompt);
  const domains = [];

  const rules = [
    {
      terms: ["nvidia"],
      domains: [
        "build.nvidia.com",
        "docs.nvidia.com",
        "nvidia.com",
      ],
    },
    {
      terms: ["cloudflare"],
      domains: ["developers.cloudflare.com", "cloudflare.com"],
    },
    {
      terms: ["openai"],
      domains: ["openai.com"],
    },
    {
      terms: ["anthropic"],
      domains: ["anthropic.com"],
    },
    {
      terms: ["microsoft"],
      domains: ["microsoft.com"],
    },
    {
      terms: ["google"],
      domains: ["google.com"],
    },
    {
      terms: ["github"],
      domains: ["github.com"],
    },
    {
      terms: ["steam"],
      domains: ["store.steampowered.com"],
    },
  ];

  for (const rule of rules) {
    if (rule.terms.some((term) => text.includes(term))) {
      domains.push(...rule.domains);
    }
  }

  return domains;
}

function resolveResearchDomains(prompt) {
  const domains = [
    ...extractDomainsFromPrompt(prompt),
    ...inferOfficialDomains(prompt),
  ];

  return [...new Set(domains)]
    .map(normalizeDomain)
    .filter(Boolean)
    .slice(0, 5);
}

function buildWeatherEndpoint(prompt) {
  const text = normalize(prompt);

  // Fase inicial: Esteio e padrao do usuario/projeto.
  // Depois evoluiremos para extrair cidade/estado dinamicamente.
  const city =
    text.includes("esteio") || !text.includes(" em ")
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
  const params = new URLSearchParams({
    url: rawUrl,
  });

  return `/api/tools/read-url?${params.toString()}`;
}

function buildGitHubEndpoint(repo) {
  const params = new URLSearchParams({
    repo,
  });

  return `/api/tools/github-repo?${params.toString()}`;
}

function buildProjectSourceEndpoint(prompt) {
  const params = new URLSearchParams({
    q: String(prompt || "").trim(),
    mode: resolveProjectAuditMode(prompt),
  });

  return `/api/tools/project-source-context?${params.toString()}`;
}

function buildWebResearchEndpoint(prompt) {
  const params = new URLSearchParams({
    q: String(prompt || "").trim(),
    context: "web_research",
  });

  const domains = resolveResearchDomains(prompt);

  for (const domain of domains) {
    params.append("domain", domain);
  }

  return `/api/tools/web-research?${params.toString()}`;
}

export async function onRequestPost({ request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || "");
    const url = extractFirstUrl(prompt);
    const repo = extractRepoSlug(prompt);

    if (hasProjectSourceIntent(prompt)) {
      return jsonResponse({
        ok: true,
        tool: "router",
        detection: {
          tool: "project-source",
          endpoint: buildProjectSourceEndpoint(prompt),
          auditMode: resolveProjectAuditMode(prompt),
          reason:
            "Pergunta exige inspecao read-only do codigo e da arquitetura do proprio ARGOS.",
        },
        promptPreview: prompt.slice(0, 220),
      });
    }

    if (
      repo &&
      (hasGitHubIntent(prompt) || url?.includes("github.com"))
    ) {
      return jsonResponse({
        ok: true,
        tool: "router",
        detection: {
          tool: "github-repo",
          endpoint: buildGitHubEndpoint(repo),
          reason:
            "Pergunta exige consulta de repositorio GitHub explicitamente identificado.",
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
          reason:
            "Pergunta contem URL publica para leitura.",
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
          reason:
            "Pergunta exige clima/previsao em tempo real.",
        },
        promptPreview: prompt.slice(0, 220),
      });
    }

    if (hasWebResearchIntent(prompt)) {
      const domains = resolveResearchDomains(prompt);

      return jsonResponse({
        ok: true,
        tool: "router",
        detection: {
          tool: "web-research",
          endpoint: buildWebResearchEndpoint(prompt),
          reason: domains.length
            ? "Pergunta exige pesquisa web atual com preferencia por fontes oficiais identificadas."
            : "Pergunta exige pesquisa web atual.",
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
    return jsonResponse(
      {
        ok: false,
        tool: "router",
        reason:
          error?.message ||
          "Falha ao rotear pergunta.",
      },
      500,
    );
  }
}

export async function onRequestGet() {
  return jsonResponse({
    ok: true,
    tool: "router",
    usage: "POST JSON { prompt: string }",
    detects: [
      "project-source",
      "weather",
      "read-url",
      "github-repo",
      "web-research",
    ],
  });
}
