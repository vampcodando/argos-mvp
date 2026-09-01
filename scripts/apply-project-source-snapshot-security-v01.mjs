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

let source = read(sourcePath);

source = replaceOnce(
  source,
  `async function getTree(env) {`,
  `async function resolveSnapshotCommitSha(env) {\n  const commit = await getCommit(env);\n  const commitSha = String(commit?.sha || "");\n\n  if (!commitSha) {\n    throw new Error("GitHub nao retornou o commit atual da main.");\n  }\n\n  return commitSha;\n}\n\nasync function getTree(env) {`,
  "Adiciona resolucao explicita do commit snapshot"
);

source = replaceOnce(
  source,
  `async function readFile(path, env) {\n  const encodedPath = path\n    .split("/")\n    .map((segment) => encodeURIComponent(segment))\n    .join("/");\n  const payload = await githubJson(\n    \`https://api.github.com/repos/\${ALLOWED_REPOSITORY}/contents/\${encodedPath}?ref=\${encodeURIComponent(ALLOWED_REF)}\`,\n    env,\n  );\n\n  if (Array.isArray(payload) || payload?.type !== "file") {\n    throw Object.assign(new Error("O caminho informado nao aponta para um arquivo."), {\n      status: 400,\n    });\n  }\n\n  const size = Number(payload?.size || 0);\n  if (size > MAX_FILE_BYTES) {\n    throw Object.assign(\n      new Error(\`Arquivo excede o limite de \${MAX_FILE_BYTES} bytes do Project Source V0.1.\`),\n      { status: 413 },\n    );\n  }\n\n  if (payload?.encoding !== "base64" || typeof payload?.content !== "string") {\n    throw Object.assign(new Error("Arquivo nao retornou conteudo textual Base64 legivel."), {\n      status: 415,\n    });\n  }\n\n  const text = decodeBase64Utf8(payload.content);\n\n  return {\n    path,\n    ref: ALLOWED_REF,\n    sha: payload.sha,\n    size,\n    lineCount: text.split("\\n").length,\n    text,\n  };\n}`,
  `async function readFile(path, env, requestedCommitSha = null) {\n  if (!SEARCHABLE_EXTENSIONS.has(extensionOf(path))) {\n    throw Object.assign(\n      new Error("Project Source permite leitura apenas de arquivos textuais aprovados."),\n      { status: 415 },\n    );\n  }\n\n  const commitSha =\n    String(requestedCommitSha || "").trim() ||\n    (await resolveSnapshotCommitSha(env));\n  const encodedPath = path\n    .split("/")\n    .map((segment) => encodeURIComponent(segment))\n    .join("/");\n  const payload = await githubJson(\n    \`https://api.github.com/repos/\${ALLOWED_REPOSITORY}/contents/\${encodedPath}?ref=\${encodeURIComponent(commitSha)}\`,\n    env,\n  );\n\n  if (Array.isArray(payload) || payload?.type !== "file") {\n    throw Object.assign(new Error("O caminho informado nao aponta para um arquivo."), {\n      status: 400,\n    });\n  }\n\n  const size = Number(payload?.size || 0);\n  if (size > MAX_FILE_BYTES) {\n    throw Object.assign(\n      new Error(\`Arquivo excede o limite de \${MAX_FILE_BYTES} bytes do Project Source V0.1.\`),\n      { status: 413 },\n    );\n  }\n\n  if (payload?.encoding !== "base64" || typeof payload?.content !== "string") {\n    throw Object.assign(new Error("Arquivo nao retornou conteudo textual Base64 legivel."), {\n      status: 415 },\n    );\n  }\n\n  const text = decodeBase64Utf8(payload.content);\n  if (text.includes("\\0")) {\n    throw Object.assign(\n      new Error("Arquivo binario ou nao textual bloqueado pelo Project Source."),\n      { status: 415 },\n    );\n  }\n\n  return {\n    path,\n    ref: ALLOWED_REF,\n    commitSha,\n    sha: payload.sha,\n    size,\n    lineCount: text.split("\\n").length,\n    text,\n  };\n}`,
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
  `  if (indexed.ok && indexed.items.length > 0) {\n    const verified = await verifyIndexedMatches(q, indexed.items, env);\n\n    if (verified.length > 0) {\n      return {\n        query: q,\n        ref: ALLOWED_REF,\n        method: "github-index+verified-content",\n        githubIndexAvailable: true,\n        githubIndexTotalCount: indexed.totalCount,\n        count: verified.length,\n        items: verified,\n      };\n    }\n  }`,
  `  if (indexed.ok && indexed.items.length > 0) {\n    const commitSha = await resolveSnapshotCommitSha(env);\n    const verified = await verifyIndexedMatches(\n      q,\n      indexed.items,\n      env,\n      commitSha,\n    );\n\n    if (verified.length > 0) {\n      return {\n        query: q,\n        ref: ALLOWED_REF,\n        method: "github-index+verified-content",\n        githubIndexAvailable: true,\n        githubIndexTotalCount: indexed.totalCount,\n        commitSha,\n        count: verified.length,\n        items: verified,\n      };\n    }\n  }`,
  "Inclui commit imutavel na busca indexada"
);

source = replaceOnce(
  source,
  `          ref: file.ref,\n          sha: file.sha,`,
  `          ref: file.ref,\n          commitSha: file.commitSha,\n          sha: file.sha,`,
  "Inclui commit no retorno de read_file"
);

source = replaceOnce(
  source,
  `        ref: file.ref,\n        sha: file.sha,`,
  `        ref: file.ref,\n        commitSha: file.commitSha,\n        sha: file.sha,`,
  "Inclui commit no retorno de read_range"
);

write(sourcePath, source);

console.log("\nProject Source Snapshot Security V0.1 aplicado com sucesso.");
console.log("Arquivo alterado:");
console.log("- functions/api/tools/project-source.js");