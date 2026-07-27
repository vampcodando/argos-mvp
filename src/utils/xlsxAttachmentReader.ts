import { readSheet } from "read-excel-file/browser";

const MAX_XLSX_ROWS = 500;
const MAX_XLSX_COLUMNS = 60;
const MAX_XLSX_CHARACTERS = 26000;

export type XlsxAttachmentReadResult = {
  fileName: string;
  extractedText: string;
  rowCount: number;
  columnCount: number;
  hasData: boolean;
  truncated: boolean;
};

function formatCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value
      .replace(/\\u0000/g, "")
      .replace(/[\\r\\n\\t]+/g, " ")
      .replace(/ {2,}/g, " ")
      .trim();
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    }
    catch {
      return String(value);
    }
  }

  return String(value);
}

export async function readXlsxAttachmentText(
  file: File
): Promise<XlsxAttachmentReadResult> {
  try {
    const rows = await readSheet(file);

    const rowCount = rows.length;

    const columnCount = rows.reduce(
      (largest, row) => Math.max(largest, row.length),
      0
    );

    const limitedRows = rows.slice(
      0,
      MAX_XLSX_ROWS
    );

    const sections: string[] = [];
    let currentCharacters = 0;
    let truncated =
      rowCount > MAX_XLSX_ROWS ||
      columnCount > MAX_XLSX_COLUMNS;

    for (let index = 0; index < limitedRows.length; index += 1) {
      const row = limitedRows[index];

      const formattedRow = row
        .slice(0, MAX_XLSX_COLUMNS)
        .map(formatCellValue)
        .join("\\t")
        .replace(/\\t+$/g, "");

      if (!formattedRow.trim()) {
        continue;
      }

      const rowSection =
        "Linha " + (index + 1) + ": " + formattedRow;

      const remainingCharacters =
        MAX_XLSX_CHARACTERS - currentCharacters;

      if (remainingCharacters <= 0) {
        truncated = true;
        break;
      }

      const limitedSection = rowSection.slice(
        0,
        remainingCharacters
      );

      sections.push(limitedSection);
      currentCharacters += limitedSection.length;

      if (limitedSection.length < rowSection.length) {
        truncated = true;
        break;
      }
    }

    const extractedText = sections.join("\\n");

    return {
      fileName: file.name,
      extractedText,
      rowCount,
      columnCount,
      hasData:
        extractedText.replace(/\s/g, "").length > 0,
      truncated,
    };
  }
  catch (error) {
    throw new Error(
      "Falha ao ler o XLSX " +
        file.name +
        ": " +
        (
          error instanceof Error
            ? error.message
            : "arquivo invalido ou protegido"
        ),
      { cause: error }
    );
  }
}
