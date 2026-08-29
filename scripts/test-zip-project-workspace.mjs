import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  executeZipWorkspaceTool,
  parseZipWorkspaceToolCall,
  validateZipWorkspaceEvidence,
} from "../src/utils/zipProjectWorkspace.ts";

const sourcePaths = [
  "src/components/MasterChatHome.tsx",
  "src/utils/zipProjectReader.ts",
  "src/utils/zipProjectWorkspace.ts",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeIndex() {
  const files = [];
  const textFiles = new Map();
  let indexedCharacters = 0;

  for (const path of sourcePaths) {
    const text = readFileSync(path, "utf8");
    const sha256 = createHash("sha256")
      .update(text)
      .digest("hex");

    textFiles.set(path, text);
    indexedCharacters += text.length;
    files.push({
      path,
      sizeBytes: Buffer.byteLength(text),
      sha256,
      kind: "text",
      lineCount: text.replace(/\r\n/g, "\n").split("\n").length,
      characterCount: text.length,
      chunkCount: 1,
    });
  }

  return {
    archiveName: "argos-workspace-regression.zip",
    compressedBytes: 1,
    scannedEntries: files.length,
    totalUncompressedBytes: files.reduce(
      (total, file) => total + file.sizeBytes,
      0
    ),
    textFileCount: files.length,
    binaryFileCount: 0,
    blockedFileCount: 0,
    indexedCharacters,
    totalChunks: files.length,
    files,
    chunks: [],
    textFiles,
    createdAt: new Date().toISOString(),
  };
}

const index = makeIndex();
const searchCall = parseZipWorkspaceToolCall(
  '<ARGOS_TOOL_CALL>{"tool":"search_code","arguments":{"query":"handleStopLocalAiClick","path":"src"}}</ARGOS_TOOL_CALL>'
);

assert(searchCall, "A chamada search_code não foi interpretada.");

const searchResult = executeZipWorkspaceTool(
  index,
  searchCall
);
const searchMatches = searchResult.result?.matches || [];

assert(searchResult.ok, "search_code falhou.");
assert(
  searchMatches.some(
    (match) =>
      match.path === "src/components/MasterChatHome.tsx"
  ),
  "search_code não encontrou handleStopLocalAiClick."
);

const symbolResult = executeZipWorkspaceTool(
  index,
  {
    tool: "read_symbol",
    arguments: {
      path: "src/components/MasterChatHome.tsx",
      symbol: "handleStopLocalAiClick",
    },
  },
  6500
);
const symbolContent = String(
  symbolResult.result?.content || ""
);

assert(symbolResult.ok, "read_symbol falhou.");
assert(
  symbolContent.includes('method: "POST"'),
  "read_symbol não recuperou o método HTTP."
);
assert(
  symbolContent.includes("/local-supervisor/stop-ai"),
  "read_symbol não recuperou o endpoint."
);

const evidence = symbolResult.evidence[0];
const validCitation = [
  "[",
  evidence.path,
  ":",
  evidence.startLine,
  "-",
  evidence.endLine,
  "]",
].join("");
const validEvidence = validateZipWorkspaceEvidence(
  index,
  `Método e endpoint confirmados ${validCitation}`,
  symbolResult.evidence,
  2
);
const invalidEvidence = validateZipWorkspaceEvidence(
  index,
  "Afirmação sem leitura [src/components/MasterChatHome.tsx:1-2]",
  symbolResult.evidence,
  2
);

assert(validEvidence.ok, "Uma citação válida foi rejeitada.");
assert(!invalidEvidence.ok, "Uma citação falsa foi aceita.");

const graphResult = executeZipWorkspaceTool(index, {
  tool: "dependency_graph",
  arguments: {
    path: "src/components/MasterChatHome.tsx",
  },
});
const imports = graphResult.result?.imports || [];

assert(graphResult.ok, "dependency_graph falhou.");
assert(
  imports.some(
    (entry) =>
      entry.resolvedPath === "src/utils/zipProjectReader.ts"
  ),
  "dependency_graph não resolveu zipProjectReader.ts."
);

const traversalResult = executeZipWorkspaceTool(index, {
  tool: "read_file",
  arguments: {
    path: "../segredo.txt",
  },
});

assert(!traversalResult.ok, "Uma travessia de caminho foi aceita.");

let extraTextRejected = false;

try {
  parseZipWorkspaceToolCall(
    'texto <ARGOS_TOOL_CALL>{"tool":"list_tree","arguments":{}}</ARGOS_TOOL_CALL>'
  );
} catch {
  extraTextRejected = true;
}

assert(
  extraTextRejected,
  "Texto fora do marcador de ferramenta não foi rejeitado."
);

console.log(
  JSON.stringify(
    {
      ok: true,
      service: "argos-zip-project-workspace-regression",
      checks: {
        exactSearch: true,
        exactSymbolRead: true,
        methodAndEndpointRecovered: true,
        validCitationAccepted: true,
        falseCitationRejected: true,
        dependencyResolved: true,
        pathTraversalRejected: true,
        malformedToolCallRejected: true,
      },
      evidence: validCitation,
    },
    null,
    2
  )
);
