import * as mammoth from "mammoth";

const MAX_DOCX_CHARACTERS = 26000;
const MAX_DOCX_MESSAGES = 10;

export type DocxAttachmentReadResult = {
  fileName: string;
  extractedText: string;
  hasText: boolean;
  truncated: boolean;
  warnings: string[];
};

function normalizeDocxText(value: string) {
  return value
    .split(String.fromCharCode(0)).join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function readDocxAttachmentText(
  file: File
): Promise<DocxAttachmentReadResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();

    const result = await mammoth.extractRawText({
      arrayBuffer,
    });

    const normalizedText = normalizeDocxText(
      result.value
    );

    const truncated =
      normalizedText.length >
      MAX_DOCX_CHARACTERS;

    const extractedText = normalizedText.slice(
      0,
      MAX_DOCX_CHARACTERS
    );

    const warnings = result.messages
      .slice(0, MAX_DOCX_MESSAGES)
      .map((message) => message.message);

    return {
      fileName: file.name,
      extractedText,
      hasText:
        extractedText
          .replace(/\s/g, "")
          .length >= 20,
      truncated,
      warnings,
    };
  }
  catch (error) {
    throw new Error(
      "Falha ao ler o DOCX " +
        file.name +
        ": " +
        (
          error instanceof Error
            ? error.message
            : "arquivo invalido ou protegido"
        )
      , { cause: error }
    );
  }
}
