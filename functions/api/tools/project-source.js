import { jsonResponse } from "./_toolPolicy.js";

const ALLOWED_REPOSITORY = "vampcodando/argos-mvp";
const ALLOWED_REF = "main";
const MAX_TREE_ITEMS = 1200;
const MAX_FILE_BYTES = 350_000;
const MAX_RANGE_LINES = 240;
const MAX_SEARCH_RESULTS = 20;
const MAX_MATCHES_PER_FILE = 4;
const MAX_FALLBACK_SEARCH_FILES = 120;
const MAX_FALLBACK_SEARCH_BYTES = 6_000_000;
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

function githubHeaders(env) {
  const token = String(env?.GITHUB_TOKEN || "").trim();

  if (!token) {
    throw Object.assign(
      new Error("GITHUB_TOKEN nao configurado para o Project Source."),
      { status: 503 },
    );
  }

  return {
    "user-agent": "ARGOS-ProjectSource/0.1",
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

function normalizeAction(value) {
  const action = String(value || "metadata").trim().toLowerCase();
  const allowed = new Set([
    "metadata",
    "commit",
    "list_tree",
    "read_file",
    "read_range",
    "search_code",
  ]);

  return allowed.has(action) ? action : null;
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

function decodeBase64Utf8(value) {
  const binary = atob(String(value || "").replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function addLineNumbers(text, startLine = 1) {
  return String(text || "")
    .split("\n")
    .map((line, index) => `${startLine + index}: ${line}`)
    .join("\n");
}

function extensionOf(path) {
  const match = String(path || "").toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : "";
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

function findTextMatches(text, query, item) {
  const needle = String(query || "").toLowerCase();
  const lines = String(text || "").split("\n");
  const matches = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].toLowerCase().includes(needle)) {
      continue;
    }

    const startIndex = Math.max(0, index - 1);
    const endIndex = Math.min(lines.length - 1, index + 1);
    const excerpt = lines
      .slice(startIndex, endIndex + 1)
      .map((line, offset) => `${startIndex + offset + 1}: ${line}`)
      .join("\n");

    matches.push({
      path: item.path,
      sha: item.sha,
      line: index + 1,
      startLine: startIndex + 1,
      endLine: endIndex + 1,
      excerpt,
    });

    if (matches.length >= MAX_MATCHES_PER_FILE) {
      break;
    }
  }

  return matches;
}

async function getRepositoryMetadata(env) {
  const info = await githubJson(
    `https://api.github.com/repos/${ALLOWED_REPOSITORY}`,
    env,
  );

  return {
    fullName: info.full_name,
    private: info.private === true,
    visibility: info.visibility || (info.private ? "private" : "public"),
    defaultBranch: info.default_branch,
    archived: info.archived === true,
    pushedAt: info.pushed_at,
  };
}

async function getCommit(env) {
  const branch = await githubJson(
    `https://api.github.com/repos/${ALLOWED_REPOSITORY}/branches/${encodeURIComponent(ALLOWED_REF)}`,
    env,
  );

  return {
    ref: ALLOWED_REF,
    sha: branch?.commit?.sha || null,
    protected: branch?.protected === true,
    url: branch?.commit?.html_url || null,
  };
}

async function resolveSnapshotCommitSha(env) {
  const commit = await getCommit(env);
  const commitSha = String(commit?.sha || "");

  if (!commitSha) {
    throw new Error("GitHub nao retornou o commit atual da main.");
  }

  return commitSha;
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
        .filter(
          (item) =>
            !BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(String(item.path))),
        )
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
    count: items.length,
    items,
  };
}

async function readFile(path, env, requestedCommitSha = null) {
  if (!SEARCHABLE_EXTENSIONS.has(extensionOf(path))) {
    throw Object.assign(
      new Error("Project Source permite leitura apenas de arquivos textuais aprovados."),
      { status: 415 },
    );
  }

  const commitSha =
    String(requestedCommitSha || "").trim() ||
    (await resolveSnapshotCommitSha(env));
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const payload = await githubJson(
    `https://api.github.com/repos/${ALLOWED_REPOSITORY}/contents/${encodedPath}?ref=${encodeURIComponent(commitSha)}`,
    env,
  );

  if (Array.isArray(payload) || payload?.type !== "file") {
    throw Object.assign(new Error("O caminho informado nao aponta para um arquivo."), {
      status: 400,
    });
  }

  const size = Number(payload?.size || 0);
  if (size > MAX_FILE_BYTES) {
    throw Object.assign(
      new Error(`Arquivo excede o limite de ${MAX_FILE_BYTES} bytes do Project Source V0.1.`),
      { status: 413 },
    );
  }

  if (payload?.encoding !== "base64" || typeof payload?.content !== "string") {
    throw Object.assign(new Error("Arquivo nao retornou conteudo textual Base64 legivel."), {
      status: 415,
    });
  }

  const text = decodeBase64Utf8(payload.content);
  if (text.includes("\0")) {
    throw Object.assign(
      new Error("Arquivo binario ou nao textual bloqueado pelo Project Source."),
      { status: 415 },
    );
  }

  return {
    path,
    ref: ALLOWED_REF,
    commitSha,
    sha: payload.sha,
    size,
    lineCount: text.split("\n").length,
    text,
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
  if (text.includes("\0")) {
    return null;
  }

  return text;
}

async function tryIndexedSearch(query, env) {
  try {
    const search = encodeURIComponent(`${query} repo:${ALLOWED_REPOSITORY}`);
    const payload = await githubJson(
      `https://api.github.com/search/code?q=${search}&per_page=${MAX_SEARCH_RESULTS}`,
      env,
    );

    const items = Array.isArray(payload?.items)
      ? payload.items
          .filter((item) => normalizePath(item?.path))
          .slice(0, MAX_SEARCH_RESULTS)
          .map((item) => ({
            path: item.path,
            name: item.name,
            sha: item.sha,
            htmlUrl: item.html_url,
          }))
      : [];

    return {
      ok: true,
      totalCount: Number(payload?.total_count || 0),
      items,
    };
  } catch (error) {
    return {
      ok: false,
      totalCount: 0,
      items: [],
      reason: error?.message || "GitHub Code Search indisponivel.",
    };
  }
}

async function verifyIndexedMatches(query, indexedItems, env, commitSha) {
  const verified = [];

  for (const item of indexedItems.slice(0, MAX_SEARCH_RESULTS)) {
    try {
      const file = await readFile(item.path, env, commitSha);
      verified.push(
        ...findTextMatches(file.text, query, {
          path: file.path,
          sha: file.sha,
        }),
      );
    } catch {
      // Se um item indexado nao puder ser lido, continuamos com os demais.
    }

    if (verified.length >= MAX_SEARCH_RESULTS) {
      break;
    }
  }

  return verified.slice(0, MAX_SEARCH_RESULTS);
}

async function fallbackSearchCode(query, env) {
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

    if (selected.length >= MAX_FALLBACK_SEARCH_FILES) {
      break;
    }

    if (selectedBytes + size > MAX_FALLBACK_SEARCH_BYTES) {
      continue;
    }

    selected.push(item);
    selectedBytes += size;
  }

  const matches = [];
  let scannedFiles = 0;

  for (let offset = 0; offset < selected.length; offset += SEARCH_BATCH_SIZE) {
    const batch = selected.slice(offset, offset + SEARCH_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (item) => {
        try {
          const text = await readBlobText(item, env);
          return text ? findTextMatches(text, query, item) : [];
        } catch {
          return [];
        }
      }),
    );

    scannedFiles += batch.length;

    for (const itemMatches of results) {
      matches.push(...itemMatches);
      if (matches.length >= MAX_SEARCH_RESULTS) {
        break;
      }
    }

    if (matches.length >= MAX_SEARCH_RESULTS) {
      break;
    }
  }

  return {
    method: "direct-tree-scan",
    commitSha: tree.commitSha,
    candidateFiles: candidates.length,
    selectedFiles: selected.length,
    scannedFiles,
    selectedBytes,
    truncatedByFileLimit: candidates.length > selected.length,
    truncatedByTree: tree.truncatedByGitHub || tree.truncatedByArgos,
    items: matches.slice(0, MAX_SEARCH_RESULTS),
  };
}

async function searchCode(query, env) {
  const q = String(query || "").trim();

  if (q.length < 2 || q.length > 160) {
    throw Object.assign(new Error("Informe q entre 2 e 160 caracteres."), {
      status: 400,
    });
  }

  const indexed = await tryIndexedSearch(q, env);

  if (indexed.ok && indexed.items.length > 0) {
    const commitSha = await resolveSnapshotCommitSha(env);
    const verified = await verifyIndexedMatches(
      q,
      indexed.items,
      env,
      commitSha,
    );

    if (verified.length > 0) {
      return {
        query: q,
        ref: ALLOWED_REF,
        method: "github-index+verified-content",
        githubIndexAvailable: true,
        githubIndexTotalCount: indexed.totalCount,
        commitSha,
        count: verified.length,
        items: verified,
      };
    }
  }

  const fallback = await fallbackSearchCode(q, env);

  return {
    query: q,
    ref: ALLOWED_REF,
    method: fallback.method,
    githubIndexAvailable: indexed.ok && indexed.items.length > 0,
    githubIndexTotalCount: indexed.totalCount,
    githubIndexReason: indexed.ok
      ? "GitHub Code Search sem resultados verificaveis; usado fallback direto."
      : indexed.reason,
    commitSha: fallback.commitSha,
    candidateFiles: fallback.candidateFiles,
    selectedFiles: fallback.selectedFiles,
    scannedFiles: fallback.scannedFiles,
    selectedBytes: fallback.selectedBytes,
    truncatedByFileLimit: fallback.truncatedByFileLimit,
    truncatedByTree: fallback.truncatedByTree,
    count: fallback.items.length,
    items: fallback.items,
  };
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const action = normalizeAction(url.searchParams.get("action"));

    if (!action) {
      return jsonResponse(
        {
          ok: false,
          tool: "project-source",
          reason: "Acao invalida.",
        },
        400,
      );
    }

    const base = {
      ok: true,
      tool: "project-source",
      version: "v0.1-github-readonly",
      repository: ALLOWED_REPOSITORY,
      ref: ALLOWED_REF,
      access: "read-only",
      authenticated: Boolean(String(env?.GITHUB_TOKEN || "").trim()),
    };

    if (action === "metadata") {
      return jsonResponse({
        ...base,
        action,
        metadata: await getRepositoryMetadata(env),
        commit: await getCommit(env),
      });
    }

    if (action === "commit") {
      return jsonResponse({ ...base, action, commit: await getCommit(env) });
    }

    if (action === "list_tree") {
      return jsonResponse({ ...base, action, tree: await getTree(env) });
    }

    if (action === "search_code") {
      return jsonResponse({
        ...base,
        action,
        search: await searchCode(url.searchParams.get("q"), env),
      });
    }

    const path = normalizePath(url.searchParams.get("path"));
    if (!path) {
      return jsonResponse(
        {
          ok: false,
          tool: "project-source",
          reason: "Informe um path textual valido e permitido.",
        },
        400,
      );
    }

    const file = await readFile(path, env);

    if (action === "read_file") {
      return jsonResponse({
        ...base,
        action,
        file: {
          path: file.path,
          ref: file.ref,
          commitSha: file.commitSha,
          sha: file.sha,
          size: file.size,
          lineCount: file.lineCount,
          startLine: 1,
          endLine: file.lineCount,
          content: addLineNumbers(file.text, 1),
        },
      });
    }

    const startLine = Math.max(1, Number.parseInt(url.searchParams.get("start") || "1", 10) || 1);
    const requestedEnd = Number.parseInt(url.searchParams.get("end") || "0", 10) || 0;
    const lines = file.text.split("\n");
    const endLine = Math.min(
      lines.length,
      requestedEnd >= startLine
        ? requestedEnd
        : startLine + MAX_RANGE_LINES - 1,
      startLine + MAX_RANGE_LINES - 1,
    );
    const selected = lines.slice(startLine - 1, endLine).join("\n");

    return jsonResponse({
      ...base,
      action,
      file: {
        path: file.path,
        ref: file.ref,
        commitSha: file.commitSha,
        sha: file.sha,
        size: file.size,
        lineCount: file.lineCount,
        startLine,
        endLine,
        content: addLineNumbers(selected, startLine),
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        tool: "project-source",
        access: "read-only",
        reason: error?.message || "Falha no Project Source.",
      },
      Number.isInteger(error?.status) ? error.status : 500,
    );
  }
}
