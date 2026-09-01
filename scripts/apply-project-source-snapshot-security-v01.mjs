import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "functions/api/tools/project-source.js");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function replaceOnce(content, before, after, label) {
  if (content.includes(after)) {
    console.log(`[OK] ${label}: ja aplicado.`);
    return content;
  }

  const first = content.indexOf(before);
  if (first < 0) {
    throw new Error(`[FALHA] ${label}: trecho alvo nao encontrado.`);
  }

  if (content.indexOf(before, first + before.length) >= 0) {
    throw new Error(`[FALHA] ${label}: trecho alvo apareceu mais de uma vez.`);
  }

  console.log(`[APLICA] ${label}`);
  return content.replace(before, after);
}

function replaceFunction(content, startMarker, nextMarker, replacement, label) {
  if (content.includes(replacement)) {
    console.log(`[OK] ${label}: ja aplicado.`);
    return content;
  }

  const start = content.indexOf(startMarker);
  const next = content.indexOf(nextMarker, start + startMarker.length);

  if (start < 0 || next < 0) {
    throw new Error(`[FALHA] ${label}: limites da funcao nao encontrados.`);
  }

  console.log(`[APLICA] ${label}`);
  return `${content.slice(0, start)}${replacement}\n\n${content.slice(next)}`;
}

let source = read(sourcePath);

if (!source.includes("async function resolveSnapshotCommitSha(env)")) {
  source = replaceOnce(
    source,
    `async function getTree(env) {`,
    `async function resolveSnapshotCommitSha(env) {\n  const commit = await getCommit(env);\n  const commitSha = String(commit?.sha || "");\n\n  if (!commitSha) {\n    throw new Error("GitHub nao retornou o commit atual da main.");\n  }\n\n  return commitSha;\n}\n\nasync function getTree(env) {`,
    "Adiciona resolucao explicita do commit snapshot"
  );
} else {
  console.log("[OK] Adiciona resolucao explicita do commit snapshot: ja aplicado.");
}

const readFileReplacement = `async function readFile(path, env, requestedCommitSha = null) {
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
    \`https://api.github.com/repos/\${ALLOWED_REPOSITORY}/contents/\${encodedPath}?ref=\${encodeURIComponent(commitSha)}\`,
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
      new Error(\`Arquivo excede o limite de \${MAX_FILE_BYTES} bytes do Project Source V0.1.\`),
      { status: 413 },
    );
  }

  if (payload?.encoding !== "base64" || typeof payload?.content !== "string") {
    throw Object.assign(new Error("Arquivo nao retornou conteudo textual Base64 legivel."), {
      status: 415,
    });
  }

  const text = decodeBase64Utf8(payload.content);
  if (text.includes("\\0")) {
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
    lineCount: text.split("\\n").length,
    text,
  };
}`;

source = replaceFunction(
  source,
  "async function readFile(",
  "async function readBlobText(",
  readFileReplacement,
  "Prende read_file ao commit e bloqueia binarios"
);

source = replaceOnce(
  source,
  `async function verifyIndexedMatches(query, indexedItems, env) {`,
  `async function verifyIndexedMatches(query, indexedItems, env, commitSha) {`,
  "Recebe snapshot na verificacao do indice"
);

source = replaceOnce(
  source,
  `      const file = await readFile(item.path, env);`,
  `      const file = await readFile(item.path, env, commitSha);`,
  "Le resultados indexados no mesmo commit"
);

source = replaceOnce(
  source,
  `  if (indexed.ok && indexed.items.length > 0) {\n    const verified = await verifyIndexedMatches(q, indexed.items, env);`,
  `  if (indexed.ok && indexed.items.length > 0) {\n    const commitSha = await resolveSnapshotCommitSha(env);\n    const verified = await verifyIndexedMatches(\n      q,\n      indexed.items,\n      env,\n      commitSha,\n    );`,
  "Prende verificacao indexada ao snapshot"
);

source = replaceOnce(
  source,
  `        githubIndexTotalCount: indexed.totalCount,\n        count: verified.length,`,
  `        githubIndexTotalCount: indexed.totalCount,\n        commitSha,\n        count: verified.length,`,
  "Inclui commit imutavel na busca indexada"
);

source = replaceOnce(
  source,
  `          path: file.path,\n          ref: file.ref,\n          sha: file.sha,`,
  `          path: file.path,\n          ref: file.ref,\n          commitSha: file.commitSha,\n          sha: file.sha,`,
  "Inclui commit no retorno de read_file"
);

source = replaceOnce(
  source,
  `        path: file.path,\n        ref: file.ref,\n        sha: file.sha,`,
  `        path: file.path,\n        ref: file.ref,\n        commitSha: file.commitSha,\n        sha: file.sha,`,
  "Inclui commit no retorno de read_range"
);

write(sourcePath, source);

console.log("\nProject Source Snapshot Security V0.1 aplicado com sucesso.");
console.log("Arquivo alterado:");
console.log("- functions/api/tools/project-source.js");
