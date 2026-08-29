import { strFromU8, unzipSync } from "fflate";

const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_ENTRY_BYTES = 25 * 1024 * 1024;
const TARGET_CHUNK_CHARACTERS = 3600;
const CHUNK_OVERLAP_CHARACTERS = 450;
const DEFAULT_CONTEXT_CHARACTERS = 26000;
const INVENTORY_CONTEXT_CHARACTERS = 7000;
const MAX_CONTEXT_CHUNKS = 14;

const BLOCKED_ARCHIVE_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".msi",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".jar",
  ".apk",
  ".app",
  ".dmg",
  ".iso",
  ".lnk",
]);

const BLOCKED_SENSITIVE_EXTENSIONS = new Set([
  ".key",
  ".pem",
  ".p12",
  ".pfx",
]);

const KNOWN_TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".mdx",
  ".json",
  ".jsonc",
  ".csv",
  ".tsv",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".py",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".sql",
  ".ps1",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".xml",
  ".svg",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".conf",
  ".config",
  ".env",
  ".properties",
  ".graphql",
  ".gql",
  ".vue",
  ".svelte",
  ".java",
  ".kt",
  ".kts",
  ".go",
  ".rs",
  ".php",
  ".rb",
  ".cs",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".swift",
  ".dart",
  ".r",
  ".lua",
  ".sol",
  ".prisma",
  ".proto",
  ".lock",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
]);

const KNOWN_TEXT_FILE_NAMES = new Set([
  "dockerfile",
  "makefile",
  "procfile",
  "license",
  "readme",
  "changelog",
  "authors",
  "contributors",
  "notice",
]);

const QUERY_STOP_WORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "esse",
  "esta",
  "este",
  "eu",
  "me",
  "meu",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "para",
  "por",
  "que",
  "se",
  "sem",
  "um",
  "uma",
  "the",
  "and",
  "for",
  "from",
  "into",
  "of",
  "on",
  "to",
  "with",
]);

export type ZipProjectChunk = {
  id: string;
  filePath: string;
  chunkIndex: number;
  startLine: number;
  endLine: number;
  content: string;
};

export type ZipProjectFile = {
  path: string;
  sizeBytes: number;
  sha256?: string;
  kind: "text" | "binary" | "blocked";
  reason?: string;
  lineCount?: number;
  characterCount?: number;
  chunkCount?: number;
};

export type ZipProjectIndex = {
  archiveName: string;
  compressedBytes: number;
  scannedEntries: number;
  totalUncompressedBytes: number;
  textFileCount: number;
  binaryFileCount: number;
  blockedFileCount: number;
  indexedCharacters: number;
  totalChunks: number;
  files: ZipProjectFile[];
  chunks: ZipProjectChunk[];
  textFiles: Map<string, string>;
  createdAt: string;
};

export type ZipProjectSummary = Pick<
  ZipProjectIndex,
  | "archiveName"
  | "scannedEntries"
  | "textFileCount"
  | "binaryFileCount"
  | "blockedFileCount"
  | "totalChunks"
>;

type ArchiveEntryMetadata = {
  path: string;
  sizeBytes: number;
};

function getFileExtension(fileName: string) {
  const normalizedName = fileName.toLowerCase();
  const lastSlash = normalizedName.lastIndexOf("/");
  const lastDot = normalizedName.lastIndexOf(".");

  if (lastDot <= lastSlash) {
    return "";
  }

  return normalizedName.slice(lastDot);
}

function getBaseName(fileName: string) {
  const normalized = fileName.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function normalizeArchivePath(fileName: string) {
  return fileName.replace(/\\/g, "/");
}

function isUnsafeArchivePath(fileName: string) {
  const normalized = normalizeArchivePath(fileName);
  const segments = normalized.split("/");

  return (
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:\//.test(normalized) ||
    segments.includes("..")
  );
}

function isKnownTextPath(fileName: string) {
  const extension = getFileExtension(fileName);
  const baseName = getBaseName(fileName).toLowerCase();

  return (
    KNOWN_TEXT_EXTENSIONS.has(extension) ||
    KNOWN_TEXT_FILE_NAMES.has(baseName) ||
    baseName.startsWith(".env.") ||
    baseName.startsWith("dockerfile.") ||
    baseName.startsWith("readme.")
  );
}

function isSensitiveArchivePath(fileName: string) {
  const normalized = normalizeArchivePath(fileName).toLowerCase();
  const baseName = getBaseName(normalized);
  const extension = getFileExtension(normalized);

  if (BLOCKED_SENSITIVE_EXTENSIONS.has(extension)) {
    return true;
  }

  if (
    baseName.endsWith(".example") ||
    baseName.endsWith(".sample") ||
    baseName.endsWith(".template")
  ) {
    return false;
  }

  return (
    baseName === ".env" ||
    baseName.startsWith(".env.") ||
    baseName === ".dev.vars" ||
    baseName.includes(".dev.vars-") ||
    baseName === ".npmrc" ||
    baseName === ".pypirc" ||
    baseName === ".netrc" ||
    baseName === ".git-credentials" ||
    baseName === "id_rsa" ||
    baseName === "id_ed25519" ||
    baseName === "credentials.json" ||
    baseName === "service-account.json" ||
    baseName === "service_account.json" ||
    baseName === "secrets.json" ||
    normalized.startsWith(".ssh/") ||
    normalized.includes("/.ssh/") ||
    normalized.startsWith(".aws/") ||
    normalized.includes("/.aws/")
  );
}

function looksLikeText(bytes: Uint8Array) {
  if (!bytes.length) {
    return true;
  }

  const sampleLength = Math.min(bytes.length, 8192);
  let controlCharacters = 0;

  for (let index = 0; index < sampleLength; index += 1) {
    const value = bytes[index];

    if (value === 0) {
      return false;
    }

    if (
      value < 32 &&
      value !== 9 &&
      value !== 10 &&
      value !== 13 &&
      value !== 12
    ) {
      controlCharacters += 1;
    }
  }

  return controlCharacters / sampleLength < 0.03;
}

function decodeText(bytes: Uint8Array) {
  return strFromU8(bytes)
    .replace(/^\uFEFF/, "")
    .split(String.fromCharCode(0))
    .join("");
}

async function sha256(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "O navegador não disponibilizou SHA-256 para verificar os arquivos do ZIP."
    );
  }

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes.slice().buffer
  );

  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function getLineNumber(lineStarts: number[], offset: number) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);

    if (lineStarts[middle] <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return Math.max(1, high + 1);
}

function splitTextIntoChunks(
  filePath: string,
  text: string
): ZipProjectChunk[] {
  if (!text.length) {
    return [
      {
        id: `${filePath}:1-1:0`,
        filePath,
        chunkIndex: 0,
        startLine: 1,
        endLine: 1,
        content: "",
      },
    ];
  }

  const lineStarts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      lineStarts.push(index + 1);
    }
  }

  const chunks: ZipProjectChunk[] = [];
  let startOffset = 0;

  while (startOffset < text.length) {
    let endOffset = Math.min(
      text.length,
      startOffset + TARGET_CHUNK_CHARACTERS
    );

    if (endOffset < text.length) {
      const lastNewLine = text.lastIndexOf("\n", endOffset);

      if (
        lastNewLine >
        startOffset + Math.floor(TARGET_CHUNK_CHARACTERS * 0.55)
      ) {
        endOffset = lastNewLine + 1;
      }
    }

    const startLine = getLineNumber(lineStarts, startOffset);
    const endLine = getLineNumber(
      lineStarts,
      Math.max(startOffset, endOffset - 1)
    );
    const chunkIndex = chunks.length;

    chunks.push({
      id: `${filePath}:${startLine}-${endLine}:${chunkIndex}`,
      filePath,
      chunkIndex,
      startLine,
      endLine,
      content: text.slice(startOffset, endOffset),
    });

    if (endOffset >= text.length) {
      break;
    }

    startOffset = Math.max(
      startOffset + 1,
      endOffset - CHUNK_OVERLAP_CHARACTERS
    );
  }

  return chunks;
}

function normalizeSearchText(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildQueryTokens(query: string) {
  return Array.from(
    new Set(
      normalizeSearchText(query)
        .split(/[^a-z0-9_./-]+/)
        .flatMap((token) => token.split(/[./-]+/))
        .map((token) => token.trim())
        .filter(
          (token) =>
            token.length >= 2 &&
            !QUERY_STOP_WORDS.has(token)
        )
    )
  ).slice(0, 24);
}

function countOccurrences(content: string, token: string) {
  let count = 0;
  let offset = 0;

  while (count < 12) {
    const match = content.indexOf(token, offset);

    if (match < 0) {
      break;
    }

    count += 1;
    offset = match + token.length;
  }

  return count;
}

function sourcePriority(filePath: string) {
  const normalized = filePath.toLowerCase();

  if (
    /(^|\/)(package\.json|readme[^/]*|wrangler\.toml|vite\.config\.[^/]+|tsconfig[^/]*)$/.test(
      normalized
    )
  ) {
    return 12;
  }

  if (
    normalized.startsWith("src/") ||
    normalized.startsWith("functions/") ||
    normalized.startsWith("api/") ||
    normalized.startsWith("app/")
  ) {
    return 8;
  }

  if (
    normalized.includes("/node_modules/") ||
    normalized.startsWith("node_modules/") ||
    normalized.includes("/.wrangler/") ||
    normalized.startsWith(".wrangler/") ||
    normalized.startsWith("dist/") ||
    normalized.startsWith("build/")
  ) {
    return -12;
  }

  return 0;
}

function scoreChunk(
  chunk: ZipProjectChunk,
  query: string,
  tokens: string[]
) {
  const normalizedPath = normalizeSearchText(chunk.filePath);
  const normalizedContent = normalizeSearchText(chunk.content);
  const normalizedQuery = normalizeSearchText(query).trim();
  const baseName = normalizeSearchText(getBaseName(chunk.filePath));
  let score = sourcePriority(chunk.filePath);

  if (
    normalizedQuery &&
    (normalizedQuery.includes(normalizedPath) ||
      normalizedQuery.includes(baseName))
  ) {
    score += 400;
  }

  for (const token of tokens) {
    if (normalizedPath.includes(token)) {
      score += 45;
    }

    score += Math.min(
      24,
      countOccurrences(normalizedContent, token) * 2
    );
  }

  return score;
}

function buildRelevantExcerpt(
  content: string,
  query: string,
  tokens: string[],
  maximum: number
) {
  const normalizedContent = content.toLowerCase();
  const identifiers = Array.from(
    new Set(
      query.match(/[a-zA-Z_$][a-zA-Z0-9_$]{3,}/g) || []
    )
  ).sort((left, right) => right.length - left.length);
  const candidates = [
    ...identifiers,
    ...[...tokens].sort(
      (left, right) => right.length - left.length
    ),
  ];
  let matchOffset = -1;

  for (const candidate of candidates) {
    matchOffset = normalizedContent.indexOf(
      candidate.toLowerCase()
    );

    if (matchOffset >= 0) {
      break;
    }
  }

  const prefix = matchOffset > 280
    ? "[... início do chunk omitido ...]\n"
    : "";
  const availableContent = Math.max(
    1,
    maximum - prefix.length - 42
  );
  const startOffset = Math.max(0, matchOffset - 280);
  const excerpt = content.slice(
    startOffset,
    startOffset + availableContent
  );
  const suffix =
    startOffset + availableContent < content.length
      ? "\n[... restante do chunk no índice local ...]"
      : "";

  return `${prefix}${excerpt}${suffix}`.slice(0, maximum);
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildInventory(index: ZipProjectIndex, maximum: number) {
  const lines = index.files.map((file) => {
    if (file.kind === "text") {
      return `- ${file.path} [texto integral indexado; ${file.lineCount ?? 0} linhas; ${file.chunkCount ?? 0} chunks]`;
    }

    if (file.kind === "blocked") {
      return `- ${file.path} [bloqueado: ${file.reason || "política de segurança"}]`;
    }

    return `- ${file.path} [binário inventariado; ${formatBytes(file.sizeBytes)}]`;
  });
  const selected: string[] = [];
  let used = 0;

  for (const line of lines) {
    if (used + line.length + 1 > maximum) {
      break;
    }

    selected.push(line);
    used += line.length + 1;
  }

  const omitted = lines.length - selected.length;

  if (omitted > 0) {
    selected.push(
      `- ... ${omitted} caminhos adicionais permanecem disponíveis no índice local integral.`
    );
  }

  return selected.join("\n");
}

export async function buildZipProjectIndex(
  file: File
): Promise<ZipProjectIndex> {
  const compressedBytes = new Uint8Array(
    await file.arrayBuffer()
  );
  const files: ZipProjectFile[] = [];
  const entryMetadata = new Map<string, ArchiveEntryMetadata>();
  const seenPaths = new Set<string>();
  let scannedEntries = 0;
  let totalUncompressedBytes = 0;
  let extracted: Record<string, Uint8Array>;

  try {
    extracted = unzipSync(compressedBytes, {
      filter(entry) {
        scannedEntries += 1;

        if (scannedEntries > MAX_ZIP_ENTRIES) {
          throw new Error(
            `ZIP ultrapassa o limite de ${MAX_ZIP_ENTRIES} entradas.`
          );
        }

        const path = normalizeArchivePath(entry.name);
        const sizeBytes = Number(entry.originalSize);

        if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
          throw new Error(
            `ZIP contém entrada sem tamanho confiável: ${path}`
          );
        }

        totalUncompressedBytes += sizeBytes;

        if (
          totalUncompressedBytes >
          MAX_ZIP_UNCOMPRESSED_BYTES
        ) {
          throw new Error(
            "ZIP ultrapassa o limite de 100 MB descompactados."
          );
        }

        if (isUnsafeArchivePath(path)) {
          throw new Error(
            `ZIP contém caminho inseguro: ${path}`
          );
        }

        if (path.endsWith("/")) {
          return false;
        }

        const comparisonPath = path.toLowerCase();

        if (seenPaths.has(comparisonPath)) {
          throw new Error(
            `ZIP contém caminho duplicado: ${path}`
          );
        }

        seenPaths.add(comparisonPath);

        const extension = getFileExtension(path);

        if (extension === ".zip") {
          files.push({
            path,
            sizeBytes,
            kind: "blocked",
            reason: "ZIP aninhado",
          });
          return false;
        }

        if (BLOCKED_ARCHIVE_EXTENSIONS.has(extension)) {
          files.push({
            path,
            sizeBytes,
            kind: "blocked",
            reason: "executável",
          });
          return false;
        }

        if (isSensitiveArchivePath(path)) {
          files.push({
            path,
            sizeBytes,
            kind: "blocked",
            reason: "possível segredo ou credencial",
          });
          return false;
        }

        if (sizeBytes > MAX_ZIP_ENTRY_BYTES) {
          files.push({
            path,
            sizeBytes,
            kind: "blocked",
            reason: "arquivo individual acima de 25 MB",
          });
          return false;
        }

        entryMetadata.set(path, {
          path,
          sizeBytes,
        });

        return true;
      },
    });
  } catch (error) {
    throw new Error(
      `Falha ao abrir ${file.name}: ${
        error instanceof Error
          ? error.message
          : "ZIP inválido ou não suportado."
      }`,
      { cause: error }
    );
  }

  const chunks: ZipProjectChunk[] = [];
  const textFiles = new Map<string, string>();
  let indexedCharacters = 0;
  let verifiedExtractedBytes = 0;

  for (const [entryName, bytes] of Object.entries(extracted)) {
    const path = normalizeArchivePath(entryName);
    const metadata = entryMetadata.get(path);

    if (!metadata) {
      continue;
    }

    verifiedExtractedBytes += bytes.byteLength;

    if (bytes.byteLength > MAX_ZIP_ENTRY_BYTES) {
      throw new Error(
        `Conteúdo extraído acima de 25 MB: ${path}.`
      );
    }

    if (bytes.byteLength !== metadata.sizeBytes) {
      throw new Error(
        `Tamanho extraído diverge do inventário do ZIP: ${path}.`
      );
    }

    if (
      verifiedExtractedBytes >
      MAX_ZIP_UNCOMPRESSED_BYTES
    ) {
      throw new Error(
        "Conteúdo efetivamente extraído ultrapassa 100 MB."
      );
    }

    const fileSha256 = await sha256(bytes);

    if (!isKnownTextPath(path) && !looksLikeText(bytes)) {
      files.push({
        path,
        sizeBytes: metadata.sizeBytes,
        sha256: fileSha256,
        kind: "binary",
      });
      continue;
    }

    const text = decodeText(bytes);
    const fileChunks = splitTextIntoChunks(path, text);
    const lineCount = Math.max(
      1,
      text.split("\n").length
    );

    indexedCharacters += text.length;
    textFiles.set(path, text);
    chunks.push(...fileChunks);
    files.push({
      path,
      sizeBytes: metadata.sizeBytes,
      sha256: fileSha256,
      kind: "text",
      lineCount,
      characterCount: text.length,
      chunkCount: fileChunks.length,
    });
  }

  files.sort((left, right) =>
    left.path.localeCompare(right.path)
  );

  return {
    archiveName: file.name,
    compressedBytes: file.size,
    scannedEntries,
    totalUncompressedBytes,
    textFileCount: files.filter(
      (item) => item.kind === "text"
    ).length,
    binaryFileCount: files.filter(
      (item) => item.kind === "binary"
    ).length,
    blockedFileCount: files.filter(
      (item) => item.kind === "blocked"
    ).length,
    indexedCharacters,
    totalChunks: chunks.length,
    files,
    chunks,
    textFiles,
    createdAt: new Date().toISOString(),
  };
}

export function summarizeZipProject(
  index: ZipProjectIndex
): ZipProjectSummary {
  return {
    archiveName: index.archiveName,
    scannedEntries: index.scannedEntries,
    textFileCount: index.textFileCount,
    binaryFileCount: index.binaryFileCount,
    blockedFileCount: index.blockedFileCount,
    totalChunks: index.totalChunks,
  };
}

export function buildZipProjectPromptContext(
  index: ZipProjectIndex,
  query: string,
  maximumCharacters = DEFAULT_CONTEXT_CHARACTERS
) {
  const safeMaximum = Math.max(
    2400,
    Math.min(maximumCharacters, 60000)
  );
  const tokens = buildQueryTokens(query);
  const rankedChunks = index.chunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk, query, tokens),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const pathOrder = left.chunk.filePath.localeCompare(
        right.chunk.filePath
      );

      if (pathOrder !== 0) {
        return pathOrder;
      }

      return left.chunk.chunkIndex - right.chunk.chunkIndex;
    });

  const header = [
    "PROJETO ZIP ATIVO NO ARGOS",
    `Arquivo: ${index.archiveName}`,
    `Entradas verificadas: ${index.scannedEntries}`,
    `Arquivos textuais integralmente indexados: ${index.textFileCount}`,
    `Arquivos binários inventariados: ${index.binaryFileCount}`,
    `Arquivos bloqueados por segurança: ${index.blockedFileCount}`,
    `Chunks pesquisáveis: ${index.totalChunks}`,
    `Texto indexado: ${index.indexedCharacters} caracteres`,
    "Regra factual: o navegador descompactou e indexou integralmente todos os arquivos textuais seguros; nenhum arquivo textual foi limitado aos primeiros 8.000 caracteres.",
    "Regra de resposta: não diga que não consegue abrir o ZIP. Diferencie o índice integral dos trechos recuperados nesta mensagem.",
    "Regra de precisão: só afirme que analisou integralmente um arquivo quando todos os chunks dele estiverem presentes; caso contrário, informe o caminho exato que precisa ser recuperado na próxima consulta.",
  ].join("\n");
  const sections = [
    header,
    "TRECHOS RECUPERADOS PARA A SOLICITAÇÃO ATUAL:",
  ];
  const chunkBudget = Math.floor(safeMaximum * 0.76);
  let used = sections.join("\n\n").length;
  let selectedChunks = 0;

  for (const { chunk, score } of rankedChunks) {
    if (selectedChunks >= MAX_CONTEXT_CHUNKS) {
      break;
    }

    const file = index.files.find(
      (item) => item.path === chunk.filePath
    );
    const sectionHeader = [
      `### ${chunk.filePath}`,
      `Chunk ${chunk.chunkIndex + 1}/${file?.chunkCount ?? "?"}; linhas ${chunk.startLine}-${chunk.endLine}; relevância ${score}`,
    ].join("\n");
    const content = chunk.content || "[arquivo textual vazio]";
    const section = `${sectionHeader}\n${content}`;

    if (used + section.length + 2 <= chunkBudget) {
      sections.push(section);
      used += section.length + 2;
      selectedChunks += 1;
      continue;
    }

    if (!selectedChunks) {
      const available =
        chunkBudget - used - sectionHeader.length - 70;

      if (available >= 300) {
        const partialSection = [
          sectionHeader,
          buildRelevantExcerpt(
            content,
            query,
            tokens,
            available
          ),
          "[Trecho parcial nesta mensagem; o chunk integral permanece no índice local.]",
        ].join("\n");

        sections.push(partialSection);
        used += partialSection.length + 2;
        selectedChunks += 1;
      }
    }
  }

  if (!selectedChunks) {
    sections.push(
      "Nenhum chunk coube no orçamento desta mensagem; o índice integral permanece ativo para uma consulta mais específica."
    );
    used = sections.join("\n\n").length;
  }

  const inventoryLabel = "INVENTÁRIO DO PROJETO:";
  const inventoryBudget = Math.max(
    200,
    Math.min(
      INVENTORY_CONTEXT_CHARACTERS,
      safeMaximum - used - inventoryLabel.length - 4
    )
  );
  const inventory = buildInventory(index, inventoryBudget);

  sections.push(`${inventoryLabel}\n${inventory}`);

  return sections.join("\n\n").slice(0, safeMaximum);
}
