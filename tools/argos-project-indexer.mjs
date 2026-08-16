import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(process.argv[2] || process.cwd());
const PROJECT_ID = String(process.argv[3] || "argos-mvp");
const DB_PATH = path.join(process.cwd(), ".argos", "project-memory.sqlite");

const IGNORED_DIRS = new Set([
  ".git",
  ".argos",
  ".wrangler",
  "node_modules",
  "dist",
  "dist-ssr",
  "backups",
  "tmp",
  "logs",
  "coverage",
]);

const SKIPPED_NAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

const TEXT_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs",
  ".ts", ".tsx", ".jsx",
  ".json",
  ".md", ".txt",
  ".css", ".scss",
  ".html",
  ".xml",
  ".yml", ".yaml",
  ".toml",
  ".py",
  ".ps1",
  ".cmd", ".bat",
  ".sh",
  ".sql",
  ".graphql", ".gql",
]);

const MAX_FILE_BYTES = 1024 * 1024;
const CHUNK_LINES = 120;
const CHUNK_OVERLAP = 20;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function isSensitiveFile(name) {
  const lower = name.toLowerCase();

  return (
    lower === ".dev.vars" ||
    lower.startsWith(".dev.vars.") ||
    lower === ".env" ||
    lower.startsWith(".env.") ||
    lower === ".npmrc"
  );
}

function languageFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  const map = {
    ".js": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript-react",
    ".jsx": "javascript-react",
    ".json": "json",
    ".md": "markdown",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".xml": "xml",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".toml": "toml",
    ".py": "python",
    ".ps1": "powershell",
    ".cmd": "batch",
    ".bat": "batch",
    ".sh": "shell",
    ".sql": "sql",
    ".graphql": "graphql",
    ".gql": "graphql",
  };

  return map[ext] || "text";
}

function collectFiles(directory, result = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        collectFiles(path.join(directory, entry.name), result);
      }

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (isSensitiveFile(entry.name) || SKIPPED_NAMES.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    const ext = path.extname(entry.name).toLowerCase();

    if (
      TEXT_EXTENSIONS.has(ext) ||
      entry.name === ".gitignore" ||
      entry.name === "README"
    ) {
      result.push(fullPath);
    }
  }

  return result;
}

function buildChunks(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const chunks = [];

  let start = 0;

  while (start < lines.length) {
    const end = Math.min(start + CHUNK_LINES, lines.length);
    const text = lines.slice(start, end).join("\n").trim();

    if (text) {
      chunks.push({
        startLine: start + 1,
        endLine: end,
        content: text,
      });
    }

    if (end >= lines.length) {
      break;
    }

    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }

  return chunks;
}

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
`);

const requiredTable = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
).get();

if (!requiredTable) {
  console.error("Banco da Project Memory nao foi inicializado.");
  db.close();
  process.exit(1);
}

const stats = {
  projectId: PROJECT_ID,
  root: ROOT,
  scanned: 0,
  indexed: 0,
  unchanged: 0,
  skippedLarge: 0,
  removed: 0,
  chunksWritten: 0,
};

const discovered = new Set();

const getExisting = db.prepare(`
  SELECT id, sha256
  FROM files
  WHERE project_id = ? AND relative_path = ?
`);

const insertFile = db.prepare(`
  INSERT INTO files(
    project_id,
    relative_path,
    size_bytes,
    modified_at,
    sha256,
    language
  )
  VALUES (?, ?, ?, ?, ?, ?)
`);

const updateFile = db.prepare(`
  UPDATE files
  SET size_bytes = ?,
      modified_at = ?,
      sha256 = ?,
      language = ?,
      indexed_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const deleteChunks = db.prepare(
  "DELETE FROM chunks WHERE file_id = ?"
);

const deleteChunkFts = db.prepare(
  "DELETE FROM chunk_fts WHERE project_id = ? AND file_id = ?"
);

const insertChunk = db.prepare(`
  INSERT INTO chunks(
    file_id,
    chunk_index,
    start_line,
    end_line,
    content,
    sha256
  )
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertChunkFts = db.prepare(`
  INSERT INTO chunk_fts(
    content,
    project_id,
    file_id,
    chunk_id,
    relative_path
  )
  VALUES (?, ?, ?, ?, ?)
`);

try {
  db.exec("BEGIN IMMEDIATE");

  db.prepare(`
    INSERT INTO projects(
      id,
      name,
      root_path,
      source_type,
      updated_at
    )
    VALUES (?, ?, ?, 'folder', CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      root_path = excluded.root_path,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    PROJECT_ID,
    path.basename(ROOT),
    ROOT
  );

  const files = collectFiles(ROOT);

  for (const filePath of files) {
    stats.scanned += 1;

    const fileStat = statSync(filePath);
    const relativePath = normalizeRelative(filePath);
    discovered.add(relativePath);

    if (fileStat.size > MAX_FILE_BYTES) {
      stats.skippedLarge += 1;
      continue;
    }

    const content = readFileSync(filePath, "utf8");

    if (content.includes("\u0000")) {
      continue;
    }

    const hash = sha256(content);
    const existing = getExisting.get(PROJECT_ID, relativePath);

    if (existing?.sha256 === hash) {
      stats.unchanged += 1;
      continue;
    }

    let fileId;

    if (existing) {
      fileId = Number(existing.id);

      deleteChunkFts.run(PROJECT_ID, fileId);
      deleteChunks.run(fileId);

      updateFile.run(
        fileStat.size,
        fileStat.mtime.toISOString(),
        hash,
        languageFor(filePath),
        fileId
      );
    } else {
      const result = insertFile.run(
        PROJECT_ID,
        relativePath,
        fileStat.size,
        fileStat.mtime.toISOString(),
        hash,
        languageFor(filePath)
      );

      fileId = Number(result.lastInsertRowid);
    }

    const chunks = buildChunks(content);

    chunks.forEach((chunk, index) => {
      const chunkHash = sha256(chunk.content);

      const result = insertChunk.run(
        fileId,
        index,
        chunk.startLine,
        chunk.endLine,
        chunk.content,
        chunkHash
      );

      const chunkId = Number(result.lastInsertRowid);

      insertChunkFts.run(
        chunk.content,
        PROJECT_ID,
        fileId,
        chunkId,
        relativePath
      );

      stats.chunksWritten += 1;
    });

    stats.indexed += 1;
  }

  const existingFiles = db.prepare(`
    SELECT id, relative_path
    FROM files
    WHERE project_id = ?
  `).all(PROJECT_ID);

  for (const file of existingFiles) {
    if (discovered.has(file.relative_path)) {
      continue;
    }

    deleteChunkFts.run(PROJECT_ID, Number(file.id));

    db.prepare("DELETE FROM files WHERE id = ?")
      .run(Number(file.id));

    stats.removed += 1;
  }

  db.exec("COMMIT");

  console.log(JSON.stringify({
    ok: true,
    service: "argos-project-indexer",
    version: "v0.1.0",
    ...stats,
  }, null, 2));
} catch (error) {
  try {
    db.exec("ROLLBACK");
  } catch {}

  console.error(error);
  process.exitCode = 1;
} finally {
  db.close();
}