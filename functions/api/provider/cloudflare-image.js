const APPROVED_MODELS = [
  {
    id: "@cf/black-forest-labs/flux-1-schnell",
    label: "FLUX.1 Schnell",
    provider: "Cloudflare Workers AI",
    group: "Imagem Free",
    role: "GERADOR DE IMAGEM",
    description:
      "Use para gerar imagem final de marketing. Mantenha Gemini 2.5 Flash para construir prompt/JSON.",
  },
];

const ALLOWED_PROJECT_KINDS = new Set([
  "marketing",
  "bruna",
  "bigboom",
  "qualyshape",
  "tiktok",
  "ugc",
]);

const ALLOWED_DATA_CLASSES = new Set([
  "generic_prompt",
  "public_marketing",
  "creative_asset",
]);

const BLOCKED_PROJECT_KINDS = new Set([
  "servico_social",
  "alojamento_celeiro",
  "institutional_internal",
  "source_code",
  "technical_log",
]);

const BLOCKED_DATA_CLASSES = new Set([
  "secret_or_token",
  "athlete_data",
  "family_data",
  "social_report",
  "institutional_document",
  "database_content",
]);

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getApprovedModel(modelId) {
  return APPROVED_MODELS.find((model) => model.id === modelId);
}

function evaluatePolicy(projectKind, dataClass) {
  if (BLOCKED_PROJECT_KINDS.has(projectKind)) {
    return `Projeto bloqueado para imagem cloud: ${projectKind}.`;
  }

  if (BLOCKED_DATA_CLASSES.has(dataClass)) {
    return `Classe de dado bloqueada para imagem cloud: ${dataClass}.`;
  }

  if (!ALLOWED_PROJECT_KINDS.has(projectKind)) {
    return `Projeto nao autorizado para imagem cloud: ${projectKind}.`;
  }

  if (!ALLOWED_DATA_CLASSES.has(dataClass)) {
    return `Classe de dado nao autorizada para imagem cloud: ${dataClass}.`;
  }

  return null;
}

function arrayBufferToBase64(value) {
  const bytes =
    value instanceof Uint8Array
      ? value
      : value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : null;

  if (!bytes) {
    return null;
  }

  let binary = "";
  const chunk = 0x8000;

  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }

  return btoa(binary);
}

function extractImageBase64(result) {
  if (!result) {
    return null;
  }

  if (typeof result === "string") {
    return result.startsWith("data:")
      ? result.split(",").pop() || null
      : result;
  }

  if (result instanceof Uint8Array || result instanceof ArrayBuffer) {
    return arrayBufferToBase64(result);
  }

  if (typeof result.image === "string") {
    return result.image.startsWith("data:")
      ? result.image.split(",").pop() || null
      : result.image;
  }

  if (typeof result.dataURI === "string") {
    return result.dataURI.split(",").pop() || null;
  }

  if (typeof result.dataUri === "string") {
    return result.dataUri.split(",").pop() || null;
  }

  if (Array.isArray(result.images) && typeof result.images[0] === "string") {
    return result.images[0].startsWith("data:")
      ? result.images[0].split(",").pop() || null
      : result.images[0];
  }

  return null;
}

export async function onRequestGet({ env }) {
  return jsonResponse({
    ok: true,
    service: "argos-cloudflare-image-provider",
    bindingPresent: Boolean(env.AI),
    defaultModel: "@cf/black-forest-labs/flux-1-schnell",
    routingRule:
      "Use Gemini 2.5 Flash para construir prompt/JSON e FLUX.1 Schnell para gerar imagem final.",
    approvedModels: APPROVED_MODELS,
    allowedProjects: Array.from(ALLOWED_PROJECT_KINDS),
    allowedDataClasses: Array.from(ALLOWED_DATA_CLASSES),
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.AI) {
    return jsonResponse(
      {
        ok: false,
        provider: "cloudflare_image",
        reason:
          "Binding AI ausente. Adicione Workers AI binding com nome AI no projeto Pages.",
      },
      503
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const projectKind =
    typeof body.projectKind === "string" ? body.projectKind : "marketing";
  const dataClass =
    typeof body.dataClass === "string" ? body.dataClass : "creative_asset";
  const blockedReason = evaluatePolicy(projectKind, dataClass);

  if (blockedReason) {
    return jsonResponse(
      {
        ok: false,
        blocked: true,
        provider: "cloudflare_image",
        reason: blockedReason,
      },
      403
    );
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return jsonResponse(
      {
        ok: false,
        provider: "cloudflare_image",
        reason: "Prompt vazio.",
      },
      400
    );
  }

  const modelId =
    typeof body.model === "string"
      ? body.model
      : "@cf/black-forest-labs/flux-1-schnell";

  const model = getApprovedModel(modelId);

  if (!model) {
    return jsonResponse(
      {
        ok: false,
        blocked: true,
        provider: "cloudflare_image",
        reason: "Modelo de imagem nao aprovado.",
      },
      403
    );
  }

  try {
    const result = await env.AI.run(model.id, {
      prompt,
      seed: Math.floor(Math.random() * 2147483647),
    });

    const imageBase64 = extractImageBase64(result);

    if (!imageBase64) {
      return jsonResponse(
        {
          ok: false,
          provider: "cloudflare_image",
          model: model.id,
          reason:
            "Workers AI respondeu sem campo image. O retorno foi recebido, mas nao veio no formato esperado.",
          debugShape:
            result && typeof result === "object"
              ? Object.keys(result)
              : typeof result,
        },
        502
      );
    }

    return jsonResponse({
      ok: true,
      provider: "cloudflare_image",
      model: model.id,
      mode: "image_generation",
      response: "Imagem gerada pelo Cloudflare Workers AI.",
      imageBase64,
      mimeType: "image/jpeg",
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        provider: "cloudflare_image",
        model: model.id,
        reason: error instanceof Error ? error.message : "Falha no Workers AI.",
      },
      500
    );
  }
}
