import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildProjectSession, setActiveProject } from "./lib/argos-project-session.mjs";

const ROOT = process.cwd();
const ARGOS_DIR = path.join(ROOT, ".argos");
const DB_PATH =
  process.env.ARGOS_PROJECT_MEMORY_DB ||
  path.join(ARGOS_DIR, "project-memory.sqlite");

const SCHEMA_VERSION = "1";

function openDatabase() {
  mkdirSync(ARGOS_DIR, { recursive: true });

  const db = new DatabaseSync(DB_PATH);

  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);

  return db;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT,
      source_type TEXT NOT NULL DEFAULT 'folder',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      modified_at TEXT,
      sha256 TEXT,
      language TEXT,
      indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, relative_path)
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      start_line INTEGER,
      end_line INTEGER,
      content TEXT NOT NULL,
      sha256 TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      UNIQUE(file_id, chunk_index)
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 5,
      source TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      objective TEXT,
      current_state TEXT,
      files_changed TEXT,
      commands_executed TEXT,
      results TEXT,
      decisions TEXT,
      errors TEXT,
      pending TEXT,
      next_step TEXT,
      git_branch TEXT,
      git_commit TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
      content,
      project_id UNINDEXED,
      file_id UNINDEXED,
      chunk_id UNINDEXED,
      relative_path UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      title,
      content,
      project_id UNINDEXED,
      memory_id UNINDEXED,
      kind UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);

  db.prepare(`
    INSERT INTO meta(key, value)
    VALUES ('schema_version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(SCHEMA_VERSION);
}

function getCount(db, table) {
  return Number(
    db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total || 0
  );
}

function requireProject(db, projectId) {
  const project = db.prepare(`
    SELECT id, name, root_path, source_type
    FROM projects
    WHERE id = ?
  `).get(projectId);

  if (!project) {
    throw new Error(`Projeto nao encontrado na memoria: ${projectId}`);
  }

  return project;
}

function getStatus(db) {
  const schemaVersion =
    db.prepare("SELECT value FROM meta WHERE key = ?")
      .get("schema_version")?.value || null;

  return {
    ok: true,
    service: "argos-project-memory",
    version: "v0.1.2",
    schemaVersion,
    database: DB_PATH,
    storage: "sqlite",
    search: "fts5",
    counts: {
      projects: getCount(db, "projects"),
      files: getCount(db, "files"),
      chunks: getCount(db, "chunks"),
      memories: getCount(db, "memories"),
      snapshots: getCount(db, "snapshots"),
    },
  };
}

function searchChunks(db, projectId, query, limit = 8) {
  const project = requireProject(db, projectId);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 20));

  const rows = db.prepare(`
    SELECT
      chunk_id,
      file_id,
      relative_path,
      bm25(chunk_fts) AS rank,
      snippet(
        chunk_fts,
        0,
        '[MATCH]',
        '[/MATCH]',
        ' ... ',
        40
      ) AS snippet
    FROM chunk_fts
    WHERE chunk_fts MATCH ?
      AND project_id = ?
    ORDER BY bm25(chunk_fts)
    LIMIT ?
  `).all(query, projectId, safeLimit);

  return {
    ok: true,
    service: "argos-project-memory",
    command: "search",
    project,
    query,
    count: rows.length,
    results: rows,
  };
}

function remember(db, projectId, kind, title, content, importance = 5, source = null) {
  requireProject(db, projectId);

  const safeImportance = Math.max(
    1,
    Math.min(Number(importance) || 5, 10)
  );

  const result = db.prepare(`
    INSERT INTO memories(
      project_id,
      kind,
      title,
      content,
      importance,
      source
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    kind,
    title,
    content,
    safeImportance,
    source
  );

  const memoryId = Number(result.lastInsertRowid);

  db.prepare(`
    INSERT INTO memory_fts(
      title,
      content,
      project_id,
      memory_id,
      kind
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    title,
    content,
    projectId,
    memoryId,
    kind
  );

  return {
    ok: true,
    service: "argos-project-memory",
    command: "remember",
    memory: {
      id: memoryId,
      projectId,
      kind,
      title,
      importance: safeImportance,
      source,
    },
  };
}

function searchMemories(db, projectId, query, limit = 8) {
  const project = requireProject(db, projectId);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 20));

  const rows = db.prepare(`
    SELECT
      memory_id,
      kind,
      bm25(memory_fts) AS rank,
      snippet(
        memory_fts,
        -1,
        '[MATCH]',
        '[/MATCH]',
        ' ... ',
        50
      ) AS snippet
    FROM memory_fts
    WHERE memory_fts MATCH ?
      AND project_id = ?
    ORDER BY bm25(memory_fts)
    LIMIT ?
  `).all(query, projectId, safeLimit);

  return {
    ok: true,
    service: "argos-project-memory",
    command: "search-memory",
    project,
    query,
    count: rows.length,
    results: rows,
  };
}

function saveSnapshot(db, projectId, jsonPath) {
  requireProject(db, projectId);

  const absolutePath = path.resolve(jsonPath);
  const payload = JSON.parse(readFileSync(absolutePath, "utf8"));

  const result = db.prepare(`
    INSERT INTO snapshots(
      project_id,
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
      git_commit
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    payload.objective ?? null,
    payload.currentState ?? null,
    payload.filesChanged ?? null,
    payload.commandsExecuted ?? null,
    payload.results ?? null,
    payload.decisions ?? null,
    payload.errors ?? null,
    payload.pending ?? null,
    payload.nextStep ?? null,
    payload.gitBranch ?? null,
    payload.gitCommit ?? null
  );

  return {
    ok: true,
    service: "argos-project-memory",
    command: "snapshot",
    snapshot: {
      id: Number(result.lastInsertRowid),
      projectId,
      source: absolutePath,
    },
  };
}

function printUsage() {
  console.log([
    "ARGOS Project Memory v0.1.2",
    "",
    "Uso:",
    "  node tools/argos-project-memory.mjs init",
    "  node tools/argos-project-memory.mjs status",
    "  node tools/argos-project-memory.mjs session",
    "  node tools/argos-project-memory.mjs activate <projectId>",
    "  node tools/argos-project-memory.mjs search <projectId> <consulta> [limite]",
    "  node tools/argos-project-memory.mjs remember <projectId> <kind> <titulo> <conteudo> [importancia] [fonte]",
    "  node tools/argos-project-memory.mjs search-memory <projectId> <consulta> [limite]",
    "  node tools/argos-project-memory.mjs snapshot <projectId> <arquivo.json>",
  ].join("\n"));
}

function main() {
  const command = String(process.argv[2] || "status").trim().toLowerCase();
  const db = openDatabase();

  try {
    ensureSchema(db);

    if (command === "init" || command === "status") {
      console.log(JSON.stringify(getStatus(db), null, 2));
      return;
    }

    if (command === "session") {
      console.log(JSON.stringify(buildProjectSession(db), null, 2));
      return;
    }

    if (command === "activate") {
      const projectId = String(process.argv[3] || "").trim();

      if (!projectId) {
        printUsage();
        process.exitCode = 1;
        return;
      }

      console.log(
        JSON.stringify(setActiveProject(db, projectId), null, 2)
      );
      return;
    }

    if (command === "search") {
      const projectId = String(process.argv[3] || "").trim();
      const query = String(process.argv[4] || "").trim();
      const limit = process.argv[5] || 8;

      if (!projectId || !query) {
        printUsage();
        process.exitCode = 1;
        return;
      }

      console.log(
        JSON.stringify(searchChunks(db, projectId, query, limit), null, 2)
      );
      return;
    }

    if (command === "remember") {
      const projectId = String(process.argv[3] || "").trim();
      const kind = String(process.argv[4] || "").trim();
      const title = String(process.argv[5] || "").trim();
      const content = String(process.argv[6] || "").trim();
      const importance = process.argv[7] || 5;
      const source = process.argv[8] || null;

      if (!projectId || !kind || !title || !content) {
        printUsage();
        process.exitCode = 1;
        return;
      }

      console.log(
        JSON.stringify(
          remember(
            db,
            projectId,
            kind,
            title,
            content,
            importance,
            source
          ),
          null,
          2
        )
      );
      return;
    }

    if (command === "search-memory") {
      const projectId = String(process.argv[3] || "").trim();
      const query = String(process.argv[4] || "").trim();
      const limit = process.argv[5] || 8;

      if (!projectId || !query) {
        printUsage();
        process.exitCode = 1;
        return;
      }

      console.log(
        JSON.stringify(
          searchMemories(db, projectId, query, limit),
          null,
          2
        )
      );
      return;
    }

    if (command === "snapshot") {
      const projectId = String(process.argv[3] || "").trim();
      const jsonPath = String(process.argv[4] || "").trim();

      if (!projectId || !jsonPath) {
        printUsage();
        process.exitCode = 1;
        return;
      }

      console.log(
        JSON.stringify(
          saveSnapshot(db, projectId, jsonPath),
          null,
          2
        )
      );
      return;
    }

    printUsage();
    process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          service: "argos-project-memory",
          error:
            error instanceof Error
              ? error.message
              : "Erro desconhecido.",
        },
        null,
        2
      )
    );

    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
