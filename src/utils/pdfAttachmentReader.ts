import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
} from "pdfjs-dist";

import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_PDF_PAGES = 80;
const MAX_PDF_CHARACTERS = 26000;

export type PdfAttachmentReadResult = {
  fileName: string;
  totalPages: number;
  processedPages: number;
  extractedText: string;
  hasSelectableText: boolean;
  truncated: boolean;
};

function normalizePdfText(value: string) {
  return value
    .split(String.fromCharCode(0)).join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function readPdfAttachmentText(
  file: File
): Promise<PdfAttachmentReadResult> {
  const bytes = new Uint8Array(
    await file.arrayBuffer()
  );

  const loadingTask: PDFDocumentLoadingTask =
    getDocument({
      data: bytes,
    });

  try {
    const documentProxy = await loadingTask.promise;

    const totalPages =
      documentProxy.numPages;

    const processedPages = Math.min(
      totalPages,
      MAX_PDF_PAGES
    );

    const pageSections: string[] = [];

    let extractedCharacters = 0;
    let truncated = false;

    for (
      let pageNumber = 1;
      pageNumber <= processedPages;
      pageNumber += 1
    ) {
      const page =
        await documentProxy.getPage(pageNumber);

      try {
        const textContent =
          await page.getTextContent();

        const pageText = normalizePdfText(
          textContent.items
            .map((item) =>
              "str" in item
                ? item.str
                : ""
            )
            .join(" ")
        );

        if (!pageText) {
          continue;
        }

        const remainingCharacters =
          MAX_PDF_CHARACTERS -
          extractedCharacters;

        if (remainingCharacters <= 0) {
          truncated = true;
          break;
        }

        const limitedPageText =
          pageText.slice(
            0,
            remainingCharacters
          );

        pageSections.push(
          [
            "Página " + pageNumber,
            limitedPageText,
          ].join("\n")
        );

        extractedCharacters +=
          limitedPageText.length;

        if (
          limitedPageText.length <
          pageText.length
        ) {
          truncated = true;
          break;
        }
      }
      finally {
        page.cleanup();
      }
    }

    if (totalPages > MAX_PDF_PAGES) {
      truncated = true;
    }

    const extractedText =
      pageSections.join("\n\n");

    return {
      fileName: file.name,
      totalPages,
      processedPages,
      extractedText,
      hasSelectableText:
        extractedText
          .replace(/\s/g, "")
          .length >= 40,
      truncated,
    };
  }
  catch (error) {
    throw new Error(
      "Falha ao ler o PDF " +
        file.name +
        ": " +
        (
          error instanceof Error
            ? error.message
            : "arquivo inválido ou protegido"
        ),
      { cause: error }
    );
  }
  finally {
    await loadingTask.destroy();
  }
}
