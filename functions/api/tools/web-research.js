import { jsonResponse, param, policyGate, truncate } from "./_toolPolicy.js";
import { onRequestGet as readUrl } from "./read-url.js";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const MAX_QUERY_CHARS = 500;
const MAX_SEARCH_RESULTS = 5;
const MAX_READ_SOURCES = 3;
const MAX_EVIDENCE_CHARS = 2200;
const SEARCH_TIMEOUT_MS = 20000;
const MAX_REQUESTED_DOMAINS = 5;

function normalizeQuery(value) {
  const query = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!query) {
    throw new Error("Informe uma consulta para pesquisa.");
  }

  if (query.length > MAX_QUERY_CHARS) {
    throw new Error(
      `A consulta deve ter no maximo ${MAX_QUERY_CHARS} caracteres.`,
    );
  }

  return query;
}

const SEARCH_MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function normalizeSearchIntent(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildFallbackSearchQuery(query, domains, now = new Date()) {
  const text = normalizeSearchIntent(query);
  const domainSet = new Set(domains.map((domain) => String(domain).toLowerCase()));

  if (!domainSet.has("store.steampowered.com") || !text.includes("steam")) {
    return null;
  }

  const asksTopSelling = [
    "mais comprados",
    "mais vendidos",
    "top sellers",
    "top selling",
  ].some((term) => text.includes(term));

  const asksCurrentMonth = [
    "esse mes",
    "este mes",
    "neste mes",
    "mes atual",
    "this month",
    "current month",
  ].some((term) => text.includes(term));

  if (!asksTopSelling || !asksCurrentMonth) {
    return null;
  }

  const month = SEARCH_MONTHS_EN[now.getUTCMonth()];
  const year = now.getUTCFullYear();

  if (!month || !Number.isInteger(year)) {
    return null;
  }

  return `Steam top selling games ${month} ${year}`;
}

function containsSensitiveMaterial(query) {
  const value = String(query || "");

  const patterns = [
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/i,
    /\bbearer\s+[a-z0-9._~+/=-]{16,}/i,
    /\bnvapi-[a-z0-9_-]{16,}/i,
    /\bsk-[a-z0-9_-]{16,}/i,
    /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|passwd)\s*[:=]\s*["']?[^\s"'&]{8,}/i,
    /\bauthorization\s*:\s*[^\s]{12,}/i,
  ];

  return patterns.some((pattern) => pattern.test(value));
}

function normalizeDomain(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (!raw) {
    return null;
  }

  const withoutProtocol = raw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0];

  if (
    !withoutProtocol ||
    withoutProtocol.length > 253 ||
    !/^[a-z0-9.-]+$/.test(withoutProtocol) ||
    !withoutProtocol.includes(".")
  ) {
    return null;
  }

  return withoutProtocol;
}

function parseRequestedDomains(requestUrl) {
  const rawValues = [
    ...requestUrl.searchParams.getAll("domain"),
    ...requestUrl.searchParams.getAll("domains"),
  ];

  const domains = rawValues
    .flatMap((value) => String(value || "").split(","))
    .map(normalizeDomain)
    .filter(Boolean);

  return [...new Set(domains)].slice(0, MAX_REQUESTED_DOMAINS);
}

function hostnameMatchesDomains(rawUrl, domains) {
  if (!domains.length) {
    return true;
  }

  try {
    const hostname = new URL(rawUrl).hostname
      .toLowerCase()
      .replace(/^www\./, "");

    return domains.some(
      (domain) =>
        hostname === domain ||
        hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

function canonicalizeCandidateUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || "").trim());

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    if (parsed.username || parsed.password) {
      return null;
    }

    parsed.hash = "";

    return parsed.toString();
  } catch {
    return null;
  }
}

const SCIENTIFIC_BLOCKED_HOSTS = [
  "instagram.com",
  "tiktok.com",
  "facebook.com",
  "threads.net",
  "x.com",
  "twitter.com",
  "youtube.com",
  "youtu.be",
  "dailymotion.com",
  "reddit.com",
  "fandom.com",
  "quora.com",
  "pinterest.com",
  "linkedin.com",
];

const SCIENTIFIC_EVIDENCE_HOSTS = [
  "arxiv.org",
  "openreview.net",
  "doi.org",
  "nature.com",
  "science.org",
  "ieee.org",
  "acm.org",
  "springer.com",
  "sciencedirect.com",
  "ncbi.nlm.nih.gov",
  "biorxiv.org",
  "medrxiv.org",
  "ssrn.com",
  "jmlr.org",
  "scielo.org",
  "scielo.br",
  "neurips.cc",
  "icml.cc",
  "iclr.cc",
  "aclweb.org",
  "usenix.org",
];

const TECHNICAL_EVIDENCE_HOSTS = [
  "huggingface.co",
  "paperswithcode.com",
  "semanticscholar.org",
  "github.com",
];

function hostnameMatchesAny(hostname, domains) {
  return domains.some(
    (domain) =>
      hostname === domain ||
      hostname.endsWith(`.${domain}`),
  );
}

function getEvidenceSourceProfile(rawUrl) {
  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      blocked: true,
      sourceClass: "invalid",
      qualityBoost: 0,
    };
  }

  const hostname = parsed.hostname
    .toLowerCase()
    .replace(/^www\./, "");

  if (
    hostnameMatchesAny(
      hostname,
      SCIENTIFIC_BLOCKED_HOSTS,
    )
  ) {
    return {
      blocked: true,
      sourceClass: "social-or-ugc",
      qualityBoost: 0,
    };
  }

  if (
    hostnameMatchesAny(
      hostname,
      SCIENTIFIC_EVIDENCE_HOSTS,
    ) ||
    /(?:\.edu(?:\.[a-z]{2})?|\.ac\.[a-z]{2}|\.gov(?:\.[a-z]{2})?)$/.test(
      hostname,
    )
  ) {
    return {
      blocked: false,
      sourceClass: "scientific-or-institutional",
      qualityBoost: 0.30,
    };
  }

  if (
    hostnameMatchesAny(
      hostname,
      TECHNICAL_EVIDENCE_HOSTS,
    )
  ) {
    return {
      blocked: false,
      sourceClass: "technical",
      qualityBoost: 0.15,
    };
  }

  if (
    hostname === "wikipedia.org" ||
    hostname.endsWith(".wikipedia.org")
  ) {
    return {
      blocked: false,
      sourceClass: "secondary-reference",
      qualityBoost: -0.05,
    };
  }

  return {
    blocked: false,
    sourceClass: "general",
    qualityBoost: 0,
  };
}

function sourceClassPriority(sourceClass) {
  if (sourceClass === "scientific-or-institutional") {
    return 3;
  }

  if (sourceClass === "technical") {
    return 2;
  }

  if (sourceClass === "general") {
    return 1;
  }

  if (sourceClass === "secondary-reference") {
    return 0;
  }

  return -1;
}
function isScientificResearchIntent(query) {
  const text = normalizeSearchIntent(query);

  if (/\b(?:ia|api|llm|gpu|cpu)\b/.test(text)) {
    return true;
  }

  return [
    "inteligencia artificial",
    "artificial intelligence",
    "machine learning",
    "deep learning",
    "modelo de linguagem",
    "modelo de ia",
    "rede neural",
    "benchmark",
    "paper",
    "artigo cientifico",
    "pesquisa cientifica",
    "estudo cientifico",
    "technical report",
    "relatorio tecnico",
    "tese",
    "dissertacao",
    "algoritmo",
    "software",
    "hardware",
    "tecnologia",
  ].some((term) => text.includes(term));
}

function buildScientificSearchQuery(query, now = new Date()) {
  const text = normalizeSearchIntent(query);

  const hasCurrentIntent = [
    "no momento",
    "atualmente",
    "agora",
    "mais recente",
    "mais recentes",
    "current",
    "latest",
    "today",
  ].some((term) => text.includes(term));

  const year = hasCurrentIntent
    ? ` ${now.getUTCFullYear()}`
    : "";

  return [
    String(query || "").trim(),
    year.trim(),
    "benchmark technical report research paper study",
    "thesis dissertation arxiv openreview primary source",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, MAX_QUERY_CHARS);
}

function normalizeSearchResults(
  payload,
  domains,
  sourcePolicy = "standard",
) {
  const results = Array.isArray(payload?.results)
    ? payload.results
    : [];

  const bestByUrl = new Map();

  for (let index = 0; index < results.length; index += 1) {
    const item = results[index];
    const url = canonicalizeCandidateUrl(item?.url);

    if (!url || !hostnameMatchesDomains(url, domains)) {
      continue;
    }

    const title = String(item?.title || "").trim();
    const score = Number(item?.score);

    const profile =
      sourcePolicy === "scientific"
        ? getEvidenceSourceProfile(url, title)
        : {
            blocked: false,
            sourceClass: "general",
            qualityBoost: 0,
          };

    if (profile.blocked) {
      continue;
    }

    const normalizedScore = Number.isFinite(score)
      ? score
      : 0;

    const candidate = {
      title: title || url,
      url,
      score: Number.isFinite(score) ? score : null,
      sourceClass: profile.sourceClass,
      rankScore:
        normalizedScore + profile.qualityBoost,
      originalIndex: index,
    };

    const existing = bestByUrl.get(url);

    if (!existing) {
      bestByUrl.set(url, candidate);
      continue;
    }

    if (candidate.rankScore > existing.rankScore) {
      bestByUrl.set(url, candidate);
    }
  }

  const normalized = [...bestByUrl.values()];

  normalized.sort((left, right) => {
    if (right.rankScore !== left.rankScore) {
      return right.rankScore - left.rankScore;
    }

    const leftScore =
      left.score ?? Number.NEGATIVE_INFINITY;
    const rightScore =
      right.score ?? Number.NEGATIVE_INFINITY;

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return left.originalIndex - right.originalIndex;
  });

  return normalized
    .slice(0, MAX_SEARCH_RESULTS)
    .map(({ originalIndex, ...item }) => item);
}
async function searchWeb(
  query,
  domains,
  options = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SEARCH_TIMEOUT_MS,
  );

  const payload = {
    query,
    search_depth: "basic",
    max_results: MAX_SEARCH_RESULTS,
    include_answer: false,
    include_raw_content: false,
  };

  if (domains.length) {
    payload.include_domains = domains;
  }

  const sourcePolicy =
    options?.sourcePolicy === "scientific"
      ? "scientific"
      : "standard";

  try {
    const response = await fetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        accept: "application/json",
        "X-Tavily-Access-Mode": "keyless",
        "user-agent": "ARGOS-WebResearch/1.0",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(
        `Provedor de pesquisa retornou JSON invalido (HTTP ${response.status}).`,
      );
    }

    if (!response.ok) {
      const detail =
        data?.detail?.error ||
        data?.detail ||
        data?.error ||
        `HTTP ${response.status}`;

      throw new Error(
        `Falha no provedor de pesquisa: ${String(detail).slice(0, 300)}`,
      );
    }

    return {
      results: normalizeSearchResults(
        data,
        domains,
        sourcePolicy,
      ),
      responseTime: data?.response_time ?? null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function mergeSearchResults(...groups) {
  const bestByUrl = new Map();

  for (const group of groups) {
    for (const candidate of group || []) {
      const existing = bestByUrl.get(candidate.url);

      if (
        !existing ||
        (candidate.rankScore ?? candidate.score ?? 0) >
          (existing.rankScore ?? existing.score ?? 0)
      ) {
        bestByUrl.set(candidate.url, candidate);
      }
    }
  }

  return [...bestByUrl.values()].sort(
    (left, right) =>
      (right.rankScore ?? right.score ?? 0) -
      (left.rankScore ?? left.score ?? 0),
  );
}

function selectResearchCandidates(
  results,
  researchMode,
) {
  const candidates = [...(results || [])];

  if (researchMode !== "scientific") {
    return candidates.slice(0, MAX_READ_SOURCES);
  }

  candidates.sort((left, right) => {
    const classDifference =
      sourceClassPriority(right.sourceClass) -
      sourceClassPriority(left.sourceClass);

    if (classDifference !== 0) {
      return classDifference;
    }

    const rankDifference =
      (right.rankScore ?? right.score ?? 0) -
      (left.rankScore ?? left.score ?? 0);

    if (rankDifference !== 0) {
      return rankDifference;
    }

    return (right.score ?? 0) - (left.score ?? 0);
  });

  return candidates.slice(0, MAX_READ_SOURCES);
}
async function readSource(candidate, env, context) {
  const params = new URLSearchParams({
    url: candidate.url,
    mode: "auto",
    context,
  });

  const request = new Request(
    `https://argos.local/api/tools/read-url?${params.toString()}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    },
  );

  const response = await readUrl({
    request,
    env,
  });

  let payload;

  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      title: candidate.title,
      url: candidate.url,
      score: candidate.score,
      rankScore: candidate.rankScore,
      sourceClass: candidate.sourceClass,
      reason: `read-url retornou JSON invalido (HTTP ${response.status}).`,
    };
  }

  if (!response.ok || payload?.ok !== true) {
    return {
      ok: false,
      title: candidate.title,
      url: candidate.url,
      score: candidate.score,
      rankScore: candidate.rankScore,
      sourceClass: candidate.sourceClass,
      reason:
        payload?.reason ||
        `Falha ao ler fonte (HTTP ${response.status}).`,
    };
  }

  const evidence =
    typeof payload?.text === "string"
      ? truncate(payload.text, MAX_EVIDENCE_CHARS)
      : "";

  if (!evidence.trim()) {
    return {
      ok: false,
      title:
        String(payload?.title || "").trim() ||
        candidate.title,
      url: String(payload?.source || candidate.url),
      score: candidate.score,
      rankScore: candidate.rankScore,
      sourceClass: candidate.sourceClass,
      reason:
        "Fonte lida, mas sem evidencia textual utilizavel.",
    };
  }

  return {
    ok: true,
    title:
      String(payload?.title || "").trim() ||
      candidate.title,
    url: String(payload?.source || candidate.url),
    fetchedSource:
      typeof payload?.fetchedSource === "string"
        ? payload.fetchedSource
        : undefined,
    score: candidate.score,
    rankScore: candidate.rankScore,
    sourceClass: candidate.sourceClass,
    reader: payload?.reader,
    status: payload?.status,
    browserFallbackUsed:
      payload?.browserFallbackUsed === true,
    browserMsUsed: payload?.browserMsUsed ?? null,
    evidenceTrust: "untrusted-web-content",
    evidence,
  };
}
export async function onRequestGet({ request, env }) {
  const requestUrl = new URL(request.url);
  const gate = policyGate(
    param(requestUrl, "context", "web_research"),
  );

  if (!gate.ok) {
    return jsonResponse(
      {
        ok: false,
        tool: "web-research",
        ...gate,
      },
      403,
    );
  }

  let query;

  try {
    query = normalizeQuery(
      param(requestUrl, "q", param(requestUrl, "query", "")),
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        tool: "web-research",
        reason:
          error?.message ||
          "Consulta de pesquisa invalida.",
      },
      400,
    );
  }

  if (containsSensitiveMaterial(query)) {
    return jsonResponse(
      {
        ok: false,
        tool: "web-research",
        reason:
          "Consulta bloqueada porque pode conter credencial, token ou segredo. Remova dados sensiveis antes de pesquisar na web.",
      },
      403,
    );
  }

  const requestedDomains =
    parseRequestedDomains(requestUrl);

  let searchResult;
  let searchQuery = query;
  let searchFallbackUsed = false;

  const researchMode =
    isScientificResearchIntent(query)
      ? "scientific"
      : "general";

  let scientificSearchUsed = false;
  let scientificSearchError = null;
  const searchQueries = [query];

  try {
    searchResult = await searchWeb(
      searchQuery,
      requestedDomains,
      {
        sourcePolicy:
          researchMode === "scientific"
            ? "scientific"
            : "standard",
      },
    );

    if (researchMode === "scientific") {
      const scientificQuery =
        buildScientificSearchQuery(query);

      if (
        scientificQuery &&
        scientificQuery !== searchQuery
      ) {
        scientificSearchUsed = true;
        searchQueries.push(scientificQuery);

        try {
          const scientificResult = await searchWeb(
            scientificQuery,
            requestedDomains,
            { sourcePolicy: "scientific" },
          );

          searchResult = {
            ...searchResult,
            results: mergeSearchResults(
              searchResult.results,
              scientificResult.results,
            ),
          };
        } catch (error) {
          scientificSearchError =
            error?.message ||
            "Falha na busca cientifica complementar.";

          if (!searchResult.results.length) {
            throw error;
          }
        }
      }
    }

    if (!searchResult.results.length) {
      const fallbackSearchQuery =
        buildFallbackSearchQuery(
          query,
          requestedDomains,
        );

      if (
        fallbackSearchQuery &&
        fallbackSearchQuery !== searchQuery
      ) {
        searchQuery = fallbackSearchQuery;
        searchFallbackUsed = true;
        searchQueries.push(fallbackSearchQuery);

        searchResult = await searchWeb(
          searchQuery,
          requestedDomains,
          {
            sourcePolicy:
              researchMode === "scientific"
                ? "scientific"
                : "standard",
          },
        );
      }
    }
  } catch (error) {
    const timeout =
      error?.name === "AbortError";

    return jsonResponse(
      {
        ok: false,
        tool: "web-research",
        query,
        searchQuery,
        searchFallbackUsed,
        researchMode,
        scientificSearchUsed,
        searchQueries,
        scientificSearchError,
        requestedDomains,
        provider: "tavily-keyless",
        reason: timeout
          ? "Tempo limite excedido ao pesquisar na web."
          : error?.message ||
            "Falha ao pesquisar na web.",
      },
      timeout ? 504 : 502,
    );
  }

  const candidates = selectResearchCandidates(
    searchResult.results,
    researchMode,
  );
  if (!candidates.length) {
    return jsonResponse({
      ok: false,
      tool: "web-research",
      query,
      searchQuery,
      searchFallbackUsed,
      researchMode,
      scientificSearchUsed,
      searchQueries,
      scientificSearchError,
      requestedDomains,
      provider: "tavily-keyless",
      searchedAt: new Date().toISOString(),
      searchResultCount: 0,
      sourceCount: 0,
      readableSourceCount: 0,
      evidenceTrust: "untrusted-web-content",
      sources: [],
      reason: "Nenhuma fonte relevante foi encontrada.",
    });
  }

  const sources = [];

  for (const candidate of candidates) {
    try {
      sources.push(
        await readSource(
          candidate,
          env,
          gate.context,
        ),
      );
    } catch (error) {
      sources.push({
        ok: false,
        title: candidate.title,
        url: candidate.url,
        score: candidate.score,
        reason:
          error?.message ||
          "Falha inesperada ao ler fonte.",
      });
    }
  }

  const readableSources = sources.filter(
    (source) => source.ok,
  );

  return jsonResponse(
    {
      ok: readableSources.length > 0,
      tool: "web-research",
      query,
      searchQuery,
      searchFallbackUsed,
      researchMode,
      scientificSearchUsed,
      searchQueries,
      scientificSearchError,
      requestedDomains,
      provider: "tavily-keyless",
      searchedAt: new Date().toISOString(),
      searchResultCount: searchResult.results.length,
      sourceCount: sources.length,
      readableSourceCount: readableSources.length,
      evidenceTrust: "untrusted-web-content",
      sources,
      reason:
        readableSources.length > 0
          ? null
          : "A pesquisa encontrou paginas, mas nenhuma fonte pode ser lida pelo ARGOS.",
    },
    readableSources.length > 0 ? 200 : 502,
  );
}
