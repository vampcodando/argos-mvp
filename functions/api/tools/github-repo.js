import { jsonResponse, param, policyGate } from "./_toolPolicy.js";

function parseRepo(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("http")) {
    try {
      const parts = new URL(raw).pathname.split("/").filter(Boolean);
      return parts.length >= 2 ? `${parts[0]}/${parts[1].replace(/\.git$/, "")}` : null;
    } catch {
      return null;
    }
  }
  const cleaned = raw.replace(/^github\.com\//i, "").replace(/\.git$/, "");
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleaned) ? cleaned : null;
}

async function fetchGitHubJson(url, env) {
  const headers = {
    "user-agent": "ARGOS-GitHubTool/1.0",
    "accept": "application/vnd.github+json"
  };

  if (env?.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
    headers["x-github-api-version"] = "2022-11-28";
  }

  const res = await fetch(url, { headers });
  const text = await res.text();

  if (!res.ok) {
    const detail = (() => {
      try { return JSON.parse(text); } catch { return { message: text }; }
    })();

    const reason = res.status === 404
      ? "Repositorio nao encontrado ou privado sem token GitHub autorizado."
      : `HTTP ${res.status}: ${String(detail.message || text).slice(0, 300)}`;

    const error = new Error(reason);
    error.status = res.status;
    error.detail = detail;
    throw error;
  }

  return JSON.parse(text);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const gate = policyGate(param(url, "context", "github_public"));
  if (!gate.ok) return jsonResponse({ ok: false, tool: "github-repo", ...gate }, 403);

  const repo = parseRepo(param(url, "repo", ""));
  if (!repo) return jsonResponse({ ok: false, tool: "github-repo", reason: "Informe repo owner/name." }, 400);

  try {
    const info = await fetchGitHubJson(`https://api.github.com/repos/${repo}`, env);

    return jsonResponse({
      ok: true,
      tool: "github-repo",
      source: `https://github.com/${repo}`,
      authenticated: Boolean(env?.GITHUB_TOKEN),
      repo: {
        fullName: info.full_name,
        description: info.description,
        private: info.private,
        archived: info.archived,
        disabled: info.disabled,
        defaultBranch: info.default_branch,
        stars: info.stargazers_count,
        forks: info.forks_count,
        openIssues: info.open_issues_count,
        language: info.language,
        license: info.license?.spdx_id || null,
        createdAt: info.created_at,
        updatedAt: info.updated_at,
        pushedAt: info.pushed_at
      }
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      tool: "github-repo",
      repo,
      authenticated: Boolean(env?.GITHUB_TOKEN),
      reason: error.message || "Falha."
    }, error.status || 500);
  }
}
