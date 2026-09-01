import { jsonResponse } from "./_toolPolicy.js";

const ALLOWED_REPOSITORY = "vampcodando/argos-mvp";
const ALLOWED_REF = "main";
const MAX_TREE_ITEMS = 1200;
const MAX_FILE_BYTES = 350_000;
const MAX_INSPECT_FILES = 80;
const MAX_INSPECT_BYTES = 4_000_000;
const MAX_EVIDENCE_ITEMS = 18;
const MAX_MATCHES_PER_TERM = 2;
const SEARCH_BATCH_SIZE = 8;

const SEARCHABLE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
  ".md",
  ".txt",
  ".css",
  ".html",
  ".toml",
  ".yml",
  ".yaml",
  ".py",
  ".ps1",
  ".cmd",
  ".sh",
]);

const BLOCKED_PATH_PATTERNS = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)\.dev\.vars(?:\.|$)/i,
  /(^|\/)\.wrangler(?:\/|$)/i,
  /(^|\/)node_modules(?:\/|$)/i,
  /(^|\/)dist(?:\/|$)/i,
  /(^|\/)coverage(?:\/|$)/i,
  /(^|\/)(?:secrets?|credentials?)(?:\.|\/|$)/i,
  /\.(?:pem|p12|pfx|key|keystore)$/i,
];

const ARCHITECTURE_ANCHORS = Object.freeze({
  reasoning: [
    "REMOTE_REASONING_POOL",
    "buildRoutingOrder",
    "classifyTaskType",
  ],
  media: [
    "IMAGE_POOL",
    "VIDEO_POOL",
    "submitMediaRequest",
  ],
  memory: [
    "LOCAL_PROJECT_MEMORY_URL",
    "project-memory/broker",
    "CLOUD_PROJECT",
  ],
  tools: [
    "resolveToolContextForPrompt",
    "ALLOWED_TOOL_NAMES",
    "project-source",
  ],
  zip: [
    "buildZipWorkspaceProtocol",
    "executeZipWorkspaceTool",
    "activeZipProject",
  ],
  local: [
    "LOCAL_SUPERVISOR_URL",
    "LOCAL_AI_BRIDGE_URL",
    "LOCAL_FALLBACK_MODEL_ID",
  ],
  security: [
    "BLOCKED_DATA_CLASSES",
    "BLOCKED_PATH_PATTERNS",
    "policyGate",
  ],
});

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function githubHeaders(env) {
  const token = String(env?.GITHUB_TOKEN || "").trim();

  if (!token) {
    throw Object.assign(
      new Error("GITHUB_TOKEN nao configurado para o Project Source."),
      { status: 503 },
    );
  }

  return {
    "user-agent": "ARGOS-ProjectSource-Context/0.1",
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
  };
}

async function githubJson(url, env) {
  const response = await fetch(url, {
    method: "GET",
    headers: githubHeaders(env),
  });
  const raw = await response.text();

  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const reason =
      payload?.message ||
      raw.slice(0, 400) ||
      `GitHub respondeu HTTP ${response.status}.`;
    throw Object.assign(new Error(reason), { status: response.status });
  }

  return payload;
}

function normalizePath(value) {
  const path = String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();

  if (!path || path.length > 500) {
    return null;
  }

  if (
    path.includes("\0") ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
    BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(path))
  ) {
    return null;
  }

  return path;
}

function extensionOf(path) {
  const match = String(path || "").toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : "";
}

function decodeBase64Utf8(value) {
  const binary = atob(String(value || "").replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function isSearchableTreeItem(item) {
  const path = normalizePath(item?.path);
  const size = Number(item?.size || 0);

  if (!path || item?.type !== "blob" || !item?.sha) {
    return false;
  }

  if (size <= 0 || size > MAX_FILE_BYTES) {
    return false;
  }

  if (/package-lock\.json$/i.test(path)) {
    return false;
  }

  return SEARCHABLE_EXTENSIONS.has(extensionOf(path));
}

function searchPriority(path) {
  const value = String(path || "");
  if (value.startsWith("functions/")) return 0;
  if (value.startsWith("src/")) return 1;
  if (value.startsWith("tools/")) return 2;
  if (value.startsWith("workers/")) return 3;
  if (value.startsWith("scripts/")) return 4;
  if (value.startsWith("docs/")) return 5;
  return 6;
}

function addTerms(target, values) {
  for (const value of values) {
    if (value && !target.includes(value)) {
      target.push(value);
    }
  }
}

function inferInspectionTerms(prompt) {
  const text = normalize(prompt);
  const terms = [];

  const broadAudit = [
    "audite",
    "auditar",
    "auditoria",
    "seu projeto",
    "proprio projeto",
    "seu codigo",
    "proprio codigo",
    "arquitetura do argos",
    "como o argos funciona",
    "como voce funciona",
    "o que voce consegue fazer",
    "quais capacidades",
    "arvore de decisao",
    "fluxo de decisao",
  ].some((term) => text.includes(term));

  if (broadAudit) {
    addTerms(terms, ARCHITECTURE_ANCHORS.reasoning);
    addTerms(terms, ARCHITECTURE_ANCHORS.media);
    addTerms(terms, ARCHITECTURE_ANCHORS.memory);
    addTerms(terms, ARCHITECTURE_ANCHORS.tools);
    addTerms(terms, ARCHITECTURE_ANCHORS.zip);
    addTerms(terms, ARCHITECTURE_ANCHORS.local);
    addTerms(terms, ARCHITECTURE_ANCHORS.security);
  }

  if (/modelo|model|reasoning|raciocinio|pool/.test(text)) {
    addTerms(terms, ARCHITECTURE_ANCHORS.reasoning);
  }

  if (/midia|media|imagem|image|video|seedream|seedance|byteplus/.test(text)) {
    addTerms(terms, ARCHITECTURE_ANCHORS.media);
  }

  if (/memoria|memory|project memory|contexto do projeto|project context/.test(text)) {
    addTerms(terms, ARCHITECTURE_ANCHORS.memory);
  }

  if (/ferramenta|tool|router|roteamento|github|web|project source/.test(text)) {
    addTerms(terms, ARCHITECTURE_ANCHORS.tools);
  }

  if (/zip|workspace|arquivo|anexo|attachment/.test(text)) {
    addTerms(terms, ARCHITECTURE_ANCHORS.zip);
  }

  if (/local|ollama|supervisor|bridge/.test(text)) {
    addTerms(terms, ARCHITECTURE_ANCHORS.local);
  }

  if (/seguranca|security|policy|politica|bloque|sensivel|sensitive/.test(text)) {
    addTerms(terms, ARCHITECTURE_ANCHORS.security);
  }

  const identifiers = String(prompt || "").match(/\b[A-Z][A-Z0-9_]{3,}\b/g) || [];
  addTerms(terms, identifiers.slice(0, 4));

  const quoted = [...String(prompt || "").matchAll(/["'`](.{2,80}?)["'`]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  addTerms(terms, quoted.slice(0, 3));

  if (!terms.length) {
    addTerms(terms, ARCHITECTURE_ANCHORS.reasoning);
    addTerms(terms, ARCHITECTURE_ANCHORS.tools);
    addTerms(terms, ARCHITECTURE_ANCHORS.memory);
  }

  return terms.slice(0, 14);
}

async function getTree(env) {
  const branch = await githubJson(
    `https://api.github.com/repos/${ALLOWED_REPOSITORY}/branches/${encodeURIComponent(ALLOWED_REF)}`,
    env,
  );
  const commitSha = String(branch?.commit?.sha || "");

  if (!commitSha) {
    throw new Error("GitHub nao retornou o commit atual da main.");
  }

  const commit = await githubJson(
    `https://api.github.com/repos/${ALLOWED_REPOSITORY}/git/commits/${commitSha}`,
    env,
  );
  const treeSha = String(commit?.tree?.sha || "");

  if (!treeSha) {
    throw new Error("GitHub nao retornou a arvore do commit atual.");
  }

  const tree = await githubJson(
    `https://api.github.com/repos/${ALLOWED_REPOSITORY}/git/trees/${treeSha}?recursive=1`,
    env,
  );

  const items = Array.isArray(tree?.tree)
    ? tree.tree
        .filter((item) => item?.path && item?.type)
        .filter((item) => !BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(String(item.path))))
        .slice(0, MAX_TREE_ITEMS)
        .map((item) => ({
          path: item.path,
          type: item.type,
          size: Number.isFinite(item.size) ? item.size : undefined,
          sha: item.sha,
        }))
    : [];

  return {
    ref: ALLOWED_REF,
    commitSha,
    treeSha,
    truncatedByGitHub: tree?.truncated === true,
    truncatedByArgos: Array.isArray(tree?.tree) && tree.tree.length > MAX_TREE_ITEMS,
    items,
  };
}

async function readBlobText(item, env) {
  const payload = await githubJson(
    `https://api.github.com/repos/${ALLOWED_REPOSITORY}/git/blobs/${encodeURIComponent(item.sha)}`,
    env,
  );

  if (payload?.encoding !== "base64" || typeof payload?.content !== "string") {
    return null;
  }

  const text = decodeBase64Utf8(payload.content);
  return text.includes("\0") ? null : text;
}

function contextRadius(term) {
  if (["REMOTE_REASONING_POOL", "IMAGE_POOL", "VIDEO_POOL"].includes(term)) {
    return 18;
  }

  if (["buildRoutingOrder", "resolveToolContextForPrompt", "submitMediaRequest"].includes(term)) {
    return 10;
  }

  return 6;
}

function findEvidence(text, term, item) {
  const needle = String(term || "").toLowerCase();
  const lines = String(text || "").split("\n");
  const matches = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].toLowerCase().includes(needle)) {
      continue;
    }

    const radius = contextRadius(term);
    const startIndex = Math.max(0, index - radius);
    const endIndex = Math.min(lines.length - 1, index + radius);
    const excerpt = lines
      .slice(startIndex, endIndex + 1)
      .map((line, offset) => `${startIndex + offset + 1}: ${line}`)
      .join("\n");

    matches.push({
      term,
      path: item.path,
      sha: item.sha,
      line: index + 1,
      startLine: startIndex + 1,
      endLine: endIndex + 1,
      excerpt,
    });

    if (matches.length >= MAX_MATCHES_PER_TERM) {
      break;
    }
  }

  return matches;
}

async function buildProjectContext(prompt, env) {
  const terms = inferInspectionTerms(prompt);
  const tree = await getTree(env);
  const candidates = tree.items
    .filter(isSearchableTreeItem)
    .sort((a, b) => {
      const priority = searchPriority(a.path) - searchPriority(b.path);
      return priority || String(a.path).localeCompare(String(b.path));
    });

  const selected = [];
  let selectedBytes = 0;

  for (const item of candidates) {
    const size = Number(item.size || 0);

    if (selected.length >= MAX_INSPECT_FILES) {
      break;
    }

    if (selectedBytes + size > MAX_INSPECT_BYTES) {
      continue;
    }

    selected.push(item);
    selectedBytes += size;
  }

  const perTermCounts = new Map(terms.map((term) => [term, 0]));
  const evidence = [];
  let scannedFiles = 0;

  for (let offset = 0; offset < selected.length; offset += SEARCH_BATCH_SIZE) {
    const batch = selected.slice(offset, offset + SEARCH_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (item) => {
        try {
          const text = await readBlobText(item, env);
          return { item, text };
        } catch {
          return { item, text: null };
        }
      }),
    );

    scannedFiles += batch.length;

    for (const result of results) {
      if (!result.text) {
        continue;
      }

      for (const term of terms) {
        if ((perTermCounts.get(term) || 0) >= MAX_MATCHES_PER_TERM) {
          continue;
        }

        const matches = findEvidence(result.text, term, result.item);

        for (const match of matches) {
          evidence.push(match);
          perTermCounts.set(term, (perTermCounts.get(term) || 0) + 1);

          if (evidence.length >= MAX_EVIDENCE_ITEMS) {
            break;
          }
        }

        if (evidence.length >= MAX_EVIDENCE_ITEMS) {
          break;
        }
      }

      if (evidence.length >= MAX_EVIDENCE_ITEMS) {
        break;
      }
    }

    if (evidence.length >= MAX_EVIDENCE_ITEMS) {
      break;
    }
  }

  return {
    query: String(prompt || "").trim(),
    ref: ALLOWED_REF,
    commitSha: tree.commitSha,
    method: "direct-tree-inspection",
    terms,
    candidateFiles: candidates.length,
    selectedFiles: selected.length,
    scannedFiles,
    selectedBytes,
    truncatedByFileLimit: candidates.length > selected.length,
    truncatedByTree: tree.truncatedByGitHub || tree.truncatedByArgos,
    evidenceCount: evidence.length,
    evidence,
  };
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const prompt = String(url.searchParams.get("q") || "").trim();

    if (!prompt || prompt.length > 4000) {
      return jsonResponse(
        {
          ok: false,
          tool: "project-source",
          reason: "Informe q entre 1 e 4000 caracteres.",
        },
        400,
      );
    }

    const context = await buildProjectContext(prompt, env);

    return jsonResponse({
      ok: true,
      tool: "project-source",
      version: "v0.1-project-context",
      repository: ALLOWED_REPOSITORY,
      ref: ALLOWED_REF,
      access: "read-only",
      authenticated: Boolean(String(env?.GITHUB_TOKEN || "").trim()),
      action: "inspect",
      context,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        tool: "project-source",
        access: "read-only",
        reason: error?.message || "Falha ao montar contexto do Project Source.",
      },
      Number.isInteger(error?.status) ? error.status : 500,
    );
  }
}
