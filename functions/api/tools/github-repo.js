import { fetchJson, jsonResponse, param, policyGate } from "./_toolPolicy.js";

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

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const gate = policyGate(param(url, "context", "github_public"));
  if (!gate.ok) return jsonResponse({ ok: false, tool: "github-repo", ...gate }, 403);

  const repo = parseRepo(param(url, "repo", ""));
  if (!repo) return jsonResponse({ ok: false, tool: "github-repo", reason: "Informe repo owner/name." }, 400);

  try {
    const info = await fetchJson(`https://api.github.com/repos/${repo}`);
    return jsonResponse({
      ok: true,
      tool: "github-repo",
      source: `https://github.com/${repo}`,
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
    return jsonResponse({ ok: false, tool: "github-repo", repo, reason: error.message || "Falha." }, 500);
  }
}
