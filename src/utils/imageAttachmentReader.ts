const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2400;
const MAX_IMAGE_PIXELS = 6_000_000;
const MAX_IMAGE_OCR_CHARACTERS = 12000;
const MIN_TEXT_CHARACTERS = 20;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type ImageAttachmentReadResult = {
  fileName: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  processedWidth: number;
  processedHeight: number;
  extractedText: string;
  confidence: number;
  hasText: boolean;
  resized: boolean;
  truncated: boolean;
};

export type ImageOcrSession = {
  read(file: File): Promise<ImageAttachmentReadResult>;
  terminate(): Promise<void>;
};

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

function normalizeOcrText(value: string) {
  return value
    .split(String.fromCharCode(0))
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function createOcrDetailCanvas(
  source: HTMLCanvasElement
) {
  const dimensionScale =
    MAX_IMAGE_DIMENSION /
    Math.max(source.width, source.height);

  const pixelScale = Math.sqrt(
    MAX_IMAGE_PIXELS /
      (source.width * source.height)
  );

  const scale = Math.min(
    2,
    dimensionScale,
    pixelScale
  );

  if (scale <= 1.05) {
    return source;
  }

  const canvas =
    document.createElement("canvas");

  canvas.width = Math.max(
    1,
    Math.round(source.width * scale)
  );

  canvas.height = Math.max(
    1,
    Math.round(source.height * scale)
  );

  const context = canvas.getContext(
    "2d",
    {
      alpha: false,
      willReadFrequently: false,
    }
  );

  if (!context) {
    return source;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.drawImage(
    source,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas;
}

function normalizeComparableOcrLine(
  value: string
) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeOcrPasses(
  primaryText: string,
  sparseText: string
) {
  const sections: string[] = [];
  const primaryKeys = new Set<string>();

  if (primaryText) {
    sections.push(
      "[Leitura OCR principal]\n" +
        primaryText
    );

    for (
      const line of primaryText.split("\n")
    ) {
      const comparable =
        normalizeComparableOcrLine(line);

      if (comparable) {
        primaryKeys.add(comparable);
      }
    }
  }

  const complementaryLines =
    sparseText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => {
        const comparable =
          normalizeComparableOcrLine(line);

        return (
          comparable.length > 0 &&
          !primaryKeys.has(comparable)
        );
      });

  if (complementaryLines.length) {
    sections.push(
      "[Leitura OCR complementar para textos dispersos]\n" +
        complementaryLines.join("\n")
    );
  }

  return sections.join("\n\n");
}

function getOcrAssetUrl(path: string) {
  const baseUrl =
    import.meta.env.BASE_URL.endsWith("/")
      ? import.meta.env.BASE_URL
      : import.meta.env.BASE_URL + "/";

  return new URL(
    baseUrl + path.replace(/^\/+/, ""),
    window.location.origin
  ).toString();
}

function calculateTargetDimensions(
  width: number,
  height: number
) {
  const dimensionScale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(width, height)
  );

  const pixelScale = Math.min(
    1,
    Math.sqrt(MAX_IMAGE_PIXELS / (width * height))
  );

  const scale = Math.min(
    dimensionScale,
    pixelScale
  );

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: scale < 1,
  };
}

async function decodeWithImageBitmap(
  file: File
): Promise<DecodedImage | null> {
  if (typeof createImageBitmap !== "function") {
    return null;
  }

  try {
    let bitmap: ImageBitmap;

    try {
      bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
    }
    catch {
      bitmap = await createImageBitmap(file);
    }

    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  }
  catch {
    return null;
  }
}

async function decodeWithHtmlImage(
  file: File
): Promise<DecodedImage> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>(
      (resolve, reject) => {
        const element = new Image();

        element.onload = () => resolve(element);
        element.onerror = () =>
          reject(
            new Error(
              "o navegador não conseguiu decodificar a imagem"
            )
          );

        element.src = objectUrl;
      }
    );

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  }
  catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function decodeImage(
  file: File
): Promise<DecodedImage> {
  const bitmap = await decodeWithImageBitmap(file);

  if (bitmap) {
    return bitmap;
  }

  return decodeWithHtmlImage(file);
}

async function prepareImageCanvas(file: File) {
  const decoded = await decodeImage(file);

  try {
    if (
      decoded.width <= 0 ||
      decoded.height <= 0
    ) {
      throw new Error(
        "a imagem não possui dimensões válidas"
      );
    }

    const target = calculateTargetDimensions(
      decoded.width,
      decoded.height
    );

    const canvas =
      document.createElement("canvas");

    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext(
      "2d",
      {
        alpha: false,
        willReadFrequently: false,
      }
    );

    if (!context) {
      throw new Error(
        "o navegador não disponibilizou o canvas 2D"
      );
    }

    context.drawImage(
      decoded.source,
      0,
      0,
      target.width,
      target.height
    );

    return {
      canvas,
      originalWidth: decoded.width,
      originalHeight: decoded.height,
      processedWidth: target.width,
      processedHeight: target.height,
      resized: target.resized,
    };
  }
  finally {
    decoded.cleanup();
  }
}

function validateImageFile(file: File) {
  if (file.size <= 0) {
    throw new Error(
      "o arquivo está vazio"
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      "a imagem ultrapassa o limite de 25 MB"
    );
  }

  if (
    file.type &&
    !SUPPORTED_IMAGE_TYPES.has(file.type)
  ) {
    throw new Error(
      "tipo de imagem não suportado: " +
        file.type
    );
  }
}

export async function createImageOcrSession():
Promise<ImageOcrSession> {
  const { createWorker, OEM, PSM } =
    await import("tesseract.js");

  const workerPath = getOcrAssetUrl(
    "ocr/worker/worker.min.js"
  );

  const corePath = getOcrAssetUrl(
    "ocr/core/"
  );

  const langPath = getOcrAssetUrl(
    "ocr/lang/"
  );

  const worker = await createWorker(
    ["por", "eng"],
    OEM.LSTM_ONLY,
    {
      workerPath,
      corePath,
      langPath,
      gzip: true,
      logger: () => {},
    }
  );

  let terminated = false;

  return {
    async read(
      file: File
    ): Promise<ImageAttachmentReadResult> {
      if (terminated) {
        throw new Error(
          "a sessão OCR já foi encerrada"
        );
      }

      validateImageFile(file);

      try {
        const prepared =
          await prepareImageCanvas(file);

        const detailCanvas =
          createOcrDetailCanvas(
            prepared.canvas
          );

        await worker.setParameters({
          tessedit_pageseg_mode:
            PSM.AUTO,
          preserve_interword_spaces:
            "1",
          user_defined_dpi: "300",
        });

        const primaryRecognition =
          await worker.recognize(
            prepared.canvas,
            {
              rotateAuto: true,
            }
          );

        await worker.setParameters({
          tessedit_pageseg_mode:
            PSM.SPARSE_TEXT,
          preserve_interword_spaces:
            "1",
          user_defined_dpi: "300",
        });

        const sparseRecognition =
          await worker.recognize(
            detailCanvas,
            {
              rotateAuto: true,
            }
          );

        const primaryText =
          normalizeOcrText(
            primaryRecognition.data.text
          );

        const sparseText =
          normalizeOcrText(
            sparseRecognition.data.text
          );

        const normalizedText =
          mergeOcrPasses(
            primaryText,
            sparseText
          );

        const recognizedCharacterCount =
          (primaryText + sparseText)
            .replace(/\s/g, "")
            .length;

        const confidenceCandidates = [
          primaryRecognition.data.confidence,
          sparseRecognition.data.confidence,
        ].filter(Number.isFinite);

        const confidence =
          confidenceCandidates.length
            ? Math.max(
                0,
                Math.min(
                  100,
                  Math.max(
                    ...confidenceCandidates
                  )
                )
              )
            : 0;

        const truncated =
          normalizedText.length >
          MAX_IMAGE_OCR_CHARACTERS;

        const extractedText = truncated
          ? normalizedText.slice(
              0,
              MAX_IMAGE_OCR_CHARACTERS
            ) +
            "\n\n[Texto OCR truncado pelo limite de segurança do ARGOS]"
          : normalizedText;

        return {
          fileName: file.name,
          mimeType:
            file.type ||
            "application/octet-stream",
          originalWidth:
            prepared.originalWidth,
          originalHeight:
            prepared.originalHeight,
          processedWidth:
            prepared.processedWidth,
          processedHeight:
            prepared.processedHeight,
          extractedText,
          confidence,
          hasText:
            recognizedCharacterCount >=
            MIN_TEXT_CHARACTERS,
          resized: prepared.resized,
          truncated,
        };
      }
      catch (error) {
        throw new Error(
          "Falha ao aplicar OCR na imagem " +
            file.name +
            ": " +
            (
              error instanceof Error
                ? error.message
                : "imagem inválida ou incompatível"
            ),
          { cause: error }
        );
      }
    },

    async terminate() {
      if (terminated) {
        return;
      }

      terminated = true;
      await worker.terminate();
    },
  };
}
