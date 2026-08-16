import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const STOP_WORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos",
  "e", "em", "essa", "esse", "esta", "este", "eu", "foi", "foram", "na",
  "nas", "no", "nos", "o", "os", "ou", "para", "por", "que", "qual",
  "quais", "se", "sem", "sobre", "um", "uma", "onde", "agora", "atual",
  "atualmente", "projeto", "preciso", "quero", "vamos"
]);

export function resolveProjectMemoryDbPath(root = process.cwd()) {
  return (
    process.env.ARGOS_PROJECT_MEMORY_DB ||
    path.join(root, ".argos", "project-memory.sqlite")
  );
}

export function openProjectMemoryDatabase(root = process.cwd()) {
  const db = new DatabaseSync(resolveProjectMemoryDbPath(root));

  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);

  return db;
}

export function requireProject(db, projectId) {
  const project = db.prepare(`
    SELECT id, name, root_path, source_type, created_at, updated_at
    FROM projects
    WHERE id = ?
  `).get(projectId);

  if (!project) {
    throw new Error(`Projeto nao encontrado: ${projectId}`);
  }

  return project;
}

export function getLatestSnapshot(db, projectId) {
  return (
    db.prepare(`
      SELECT
        id,
        objective,
        current_state,
        files_changed,
        commands_executed,
        results,
        decisions,
        errors,
        pending,
        next_step,
        git_branch,
        git_commit,
        created_at
      FROM snapshots
      WHERE project_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(projectId) || null
  );
}

export function tokenizeProjectQuery(value) {
  const tokens =
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}_-]+/gu) || [];

  return [
    ...new Set(
      tokens.filter(
        (token) =>
          !STOP_WORDS.has(token) &&
          (token.length >= 3 ||
            ["ai", "ia", "js", "ts", "ui", "db"].includes(token))
      )
    ),
  ].slice(0, 10);
}

export function buildProjectFtsQuery(value) {
  const tokens = tokenizeProjectQuery(value);

  if (!tokens.length) {
    throw new Error("Consulta sem termos pesquisaveis.");
  }

  return tokens
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(" OR ");
}

export function hasHistoricalIntent(value) {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return /\b(snapshot|snapshots|historico|historia|handoff|checkpoint|commit|commits|versao|versoes|antigo|anterior)\b/.test(
    text
  );
}

export function classifyProjectSource(relativePath) {
  const value = String(relativePath || "").replaceAll("\\", "/");

  if (
    value.startsWith("functions/") ||
    value.startsWith("src/") ||
    value.startsWith("tools/") ||
    value.startsWith("workers/")
  ) {
    return "operational";
  }

  if (
    value.startsWith("docs/snapshots/") ||
    value.startsWith("docs/handoff/") ||
    value.startsWith("docs/checkpoint") ||
    value.startsWith("SNAPSHOT_")
  ) {
    return "historical";
  }

  if (
    value.startsWith("scripts/") ||
    value === "package.json" ||
    value === "vite.config.ts" ||
    value.startsWith("tsconfig")
  ) {
    return "support";
  }

  if (value.startsWith("docs/")) {
    return "documentation";
  }

  return "support";
}

function sourcePriority(sourceClass, historicalIntent) {
  if (historicalIntent) {
    return {
      historical: 0,
      documentation: 1,
      operational: 2,
      support: 3,
    }[sourceClass] ?? 4;
  }

  return {
    operational: 0,
    support: 1,
    documentation: 2,
    historical: 3,
  }[sourceClass] ?? 4;
}

export function searchProjectMemories(
  db,
  projectId,
  ftsQuery,
  limit = 5
) {
  return db.prepare(`
    SELECT
      m.id,
      m.kind,
      m.title,
      m.content,
      m.importance,
      m.source,
      m.created_at,
      bm25(memory_fts) AS rank
    FROM memory_fts
    JOIN memories m
      ON m.id = CAST(memory_fts.memory_id AS INTEGER)
    WHERE memory_fts MATCH ?
      AND memory_fts.project_id = ?
    ORDER BY
      m.importance DESC,
      bm25(memory_fts)
    LIMIT ?
  `).all(ftsQuery, projectId, limit);
}

export function searchProjectCode(
  db,
  projectId,
  ftsQuery,
  limit = 8,
  historicalIntent = false
) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 20));
  const candidateLimit = Math.min(100, safeLimit * 10);

  const candidates = db.prepare(`
    SELECT
      c.id AS chunk_id,
      f.relative_path,
      c.start_line,
      c.end_line,
      c.content,
      bm25(chunk_fts) AS rank
    FROM chunk_fts
    JOIN chunks c
      ON c.id = CAST(chunk_fts.chunk_id AS INTEGER)
    JOIN files f
      ON f.id = c.file_id
    WHERE chunk_fts MATCH ?
      AND chunk_fts.project_id = ?
    ORDER BY bm25(chunk_fts)
    LIMIT ?
  `).all(ftsQuery, projectId, candidateLimit);

  return candidates
    .map((row) => {
      const sourceClass = classifyProjectSource(row.relative_path);

      return {
        ...row,
        sourceClass,
        sourcePriority: sourcePriority(
          sourceClass,
          historicalIntent
        ),
      };
    })
    .sort((a, b) => {
      if (a.sourcePriority !== b.sourcePriority) {
        return a.sourcePriority - b.sourcePriority;
      }

      return Number(a.rank) - Number(b.rank);
    })
    .slice(0, safeLimit);
}

export function buildProjectContext(
  db,
  projectId,
  rawQuery,
  options = {}
) {
  const project = requireProject(db, projectId);
  const ftsQuery = buildProjectFtsQuery(rawQuery);
  const historicalIntent = hasHistoricalIntent(rawQuery);
  const latestSnapshot = getLatestSnapshot(db, projectId);

  const memoryLimit = Math.max(
    1,
    Math.min(Number(options.memoryLimit) || 5, 20)
  );

  const codeLimit = Math.max(
    1,
    Math.min(Number(options.codeLimit) || 8, 20)
  );

  let memories = [];
  let code = [];

  try {
    memories = searchProjectMemories(
      db,
      projectId,
      ftsQuery,
      memoryLimit
    );
  } catch {
    memories = [];
  }

  try {
    code = searchProjectCode(
      db,
      projectId,
      ftsQuery,
      codeLimit,
      historicalIntent
    );
  } catch {
    code = [];
  }

  return {
    ok: true,
    service: "argos-project-context",
    version: "v0.1.2",
    project,
    query: rawQuery,
    retrieval: {
      ftsQuery,
      historicalIntent,
      strategy:
        "memory + latest-snapshot + source-aware-fts5",
    },
    latestSnapshot,
    memories,
    code,
    totals: {
      memories: memories.length,
      codeChunks: code.length,
      hasSnapshot: Boolean(latestSnapshot),
    },
  };
}