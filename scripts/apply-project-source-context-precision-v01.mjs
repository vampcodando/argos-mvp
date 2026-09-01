import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contextPath = path.join(root, "functions/api/tools/project-source-context.js");
const masterPath = path.join(root, "src/components/MasterChatHome.tsx");

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

let context = read(contextPath);
let master = read(masterPath);

context = replaceOnce(
  context,
  `});\n\nfunction normalize(value) {`,
  `});\n\nconst STRUCTURED_BLOCK_SPECS = Object.freeze([\n  Object.freeze({\n    term: "REMOTE_REASONING_POOL",\n    path: "functions/api/reasoning/chat.js",\n    kind: "array",\n  }),\n  Object.freeze({\n    term: "buildRoutingOrder",\n    path: "functions/api/reasoning/chat.js",\n    kind: "function",\n  }),\n  Object.freeze({\n    term: "IMAGE_POOL",\n    path: "functions/api/media/generate.js",\n    kind: "array",\n  }),\n  Object.freeze({\n    term: "VIDEO_POOL",\n    path: "functions/api/media/generate.js",\n    kind: "array",\n  }),\n]);\n\nfunction normalize(value) {`,
  "Declara blocos estruturados prioritarios"
);

context = replaceOnce(
  context,
  `function findEvidence(text, term, item) {`,
  `function findStructuredEvidence(text, spec, item) {\n  const lines = String(text || "").split("\\n");\n  const declarationIndex = lines.findIndex((line) => {\n    if (!line.includes(spec.term)) {\n      return false;\n    }\n\n    if (spec.kind === "function") {\n      return line.includes(\`function \${spec.term}\`);\n    }\n\n    return line.includes(\`const \${spec.term}\`);\n  });\n\n  if (declarationIndex < 0) {\n    return null;\n  }\n\n  const open = spec.kind === "function" ? "{" : "[";\n  const close = spec.kind === "function" ? "}" : "]";\n  let depth = 0;\n  let started = false;\n  let endIndex = declarationIndex;\n  const maxEnd = Math.min(lines.length - 1, declarationIndex + 120);\n\n  for (let index = declarationIndex; index <= maxEnd; index += 1) {\n    for (const character of lines[index]) {\n      if (character === open) {\n        depth += 1;\n        started = true;\n      } else if (character === close && started) {\n        depth -= 1;\n      }\n    }\n\n    endIndex = index;\n\n    if (started && depth === 0) {\n      break;\n    }\n  }\n\n  if (!started || depth !== 0) {\n    return null;\n  }\n\n  const excerpt = lines\n    .slice(declarationIndex, endIndex + 1)\n    .map((line, offset) => \`\${declarationIndex + offset + 1}: \${line}\`)\n    .join("\\n");\n\n  return {\n    term: spec.term,\n    path: item.path,\n    sha: item.sha,\n    line: declarationIndex + 1,\n    startLine: declarationIndex + 1,\n    endLine: endIndex + 1,\n    excerpt,\n  };\n}\n\nfunction findEvidence(text, term, item) {`,
  "Extrai blocos completos por balanceamento"
);

context = replaceOnce(
  context,
  `  const perTermCounts = new Map(terms.map((term) => [term, 0]));\n  const evidence = [];\n  let scannedFiles = 0;\n\n  for (let offset = 0; offset < selected.length; offset += SEARCH_BATCH_SIZE) {`,
  `  const perTermCounts = new Map(terms.map((term) => [term, 0]));\n  const evidence = [];\n  const selectedByPath = new Map(\n    selected.map((item) => [item.path, item])\n  );\n  const textCache = new Map();\n  const scannedPaths = new Set();\n  let scannedFiles = 0;\n\n  const getSelectedText = async (item) => {\n    if (textCache.has(item.path)) {\n      return textCache.get(item.path);\n    }\n\n    let text = null;\n    try {\n      text = await readBlobText(item, env);\n    } catch {\n      text = null;\n    }\n\n    textCache.set(item.path, text);\n    scannedPaths.add(item.path);\n    return text;\n  };\n\n  for (const spec of STRUCTURED_BLOCK_SPECS) {\n    if (!terms.includes(spec.term)) {\n      continue;\n    }\n\n    const item = selectedByPath.get(spec.path);\n    if (!item) {\n      continue;\n    }\n\n    const text = await getSelectedText(item);\n    if (!text) {\n      continue;\n    }\n\n    const structuredEvidence = findStructuredEvidence(\n      text,\n      spec,\n      item,\n    );\n\n    if (!structuredEvidence) {\n      continue;\n    }\n\n    evidence.push(structuredEvidence);\n    perTermCounts.set(spec.term, MAX_MATCHES_PER_TERM);\n\n    if (evidence.length >= MAX_EVIDENCE_ITEMS) {\n      break;\n    }\n  }\n\n  for (let offset = 0; offset < selected.length; offset += SEARCH_BATCH_SIZE) {`,
  "Prioriza blocos criticos antes da busca generica"
);

context = replaceOnce(
  context,
  `      batch.map(async (item) => {\n        try {\n          const text = await readBlobText(item, env);\n          return { item, text };\n        } catch {\n          return { item, text: null };\n        }\n      }),`,
  `      batch.map(async (item) => ({\n        item,\n        text: await getSelectedText(item),\n      })),`,
  "Reutiliza cache de blobs na inspecao"
);

context = replaceOnce(
  context,
  `    scannedFiles += batch.length;`,
  `    scannedFiles = scannedPaths.size;`,
  "Conta arquivos realmente lidos"
);

master = replaceOnce(
  master,
  `            excerpt:\n              typeof item?.excerpt === "string"\n                ? truncateToolText(item.excerpt, 900)\n                : item?.excerpt,`,
  `            excerpt:\n              typeof item?.excerpt === "string"\n                ? truncateToolText(\n                    item.excerpt,\n                    [\n                      "REMOTE_REASONING_POOL",\n                      "buildRoutingOrder",\n                      "IMAGE_POOL",\n                      "VIDEO_POOL",\n                    ].includes(String(item?.term || ""))\n                      ? 1800\n                      : 700\n                  )\n                : item?.excerpt,`,
  "Preserva blocos criticos no contexto do Master Chat"
);

write(contextPath, context);
write(masterPath, master);

console.log("\nProject Source Context Precision V0.1 aplicado com sucesso.");
console.log("Arquivos alterados:");
console.log("- functions/api/tools/project-source-context.js");
console.log("- src/components/MasterChatHome.tsx");
