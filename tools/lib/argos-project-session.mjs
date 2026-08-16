const SERVICE = "argos-project-session";
const VERSION = "v0.1.0";
const ACTIVE_PROJECT_KEY = "active_project_id";

function getProject(db, projectId) {
  return db.prepare(`
    SELECT
      id,
      name,
      root_path,
      source_type,
      created_at,
      updated_at
    FROM projects
    WHERE id = ?
  `).get(projectId) || null;
}

function requireProject(db, projectId) {
  const project = getProject(db, projectId);

  if (!project) {
    throw new Error(`Projeto nao encontrado na memoria: ${projectId}`);
  }

  return project;
}

function getLatestSnapshot(db, projectId) {
  return db.prepare(`
    SELECT
      id,
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
      git_commit,
      created_at
    FROM snapshots
    WHERE project_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(projectId) || null;
}

function mapProject(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path || null,
    sourceType: row.source_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSnapshot(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    projectId: row.project_id,
    objective: row.objective || null,
    currentState: row.current_state || null,
    filesChanged: row.files_changed || null,
    commandsExecuted: row.commands_executed || null,
    results: row.results || null,
    decisions: row.decisions || null,
    errors: row.errors || null,
    pending: row.pending || null,
    nextStep: row.next_step || null,
    gitBranch: row.git_branch || null,
    gitCommit: row.git_commit || null,
    createdAt: row.created_at,
  };
}

export function getActiveProjectId(db) {
  const row = db.prepare(`
    SELECT value
    FROM meta
    WHERE key = ?
  `).get(ACTIVE_PROJECT_KEY);

  const projectId = String(row?.value || "").trim();
  return projectId || null;
}

export function setActiveProject(db, projectId) {
  const normalizedProjectId = String(projectId || "").trim();

  if (!normalizedProjectId) {
    throw new Error("projectId obrigatorio para ativar uma Project Session.");
  }

  requireProject(db, normalizedProjectId);

  db.prepare(`
    INSERT INTO meta(key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(ACTIVE_PROJECT_KEY, normalizedProjectId);

  return buildProjectSession(db);
}

export function buildProjectSession(db) {
  const activeProjectId = getActiveProjectId(db);

  if (!activeProjectId) {
    return {
      ok: true,
      service: SERVICE,
      version: VERSION,
      active: false,
      activeProjectId: null,
      project: null,
      latestSnapshot: null,
    };
  }

  const project = requireProject(db, activeProjectId);
  const latestSnapshot = getLatestSnapshot(db, activeProjectId);

  return {
    ok: true,
    service: SERVICE,
    version: VERSION,
    active: true,
    activeProjectId,
    project: mapProject(project),
    latestSnapshot: mapSnapshot(latestSnapshot),
  };
}
