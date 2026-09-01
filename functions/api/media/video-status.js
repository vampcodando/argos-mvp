const BYTEPLUS_VIDEO_ENDPOINT =
  "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

export async function onRequestGet({ request, env }) {
  const apiKey = String(env?.BYTEPLUS_ARK_API_KEY || "").trim();

  if (!apiKey) {
    return json(
      { ok: false, code: "NOT_CONFIGURED", reason: "Secret BYTEPLUS_ARK_API_KEY ausente." },
      503
    );
  }

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();

  if (!/^cgt-[A-Za-z0-9_-]+$/.test(id)) {
    return json({ ok: false, code: "INVALID_TASK_ID", reason: "Task id invalido." }, 400);
  }

  const response = await fetch(`${BYTEPLUS_VIDEO_ENDPOINT}/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
  });

  const rawText = await response.text();
  let data = {};

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    return json(
      {
        ok: false,
        provider: "byteplus",
        code: data?.error?.code || "UPSTREAM_ERROR",
        reason: data?.error?.message || data?.message || rawText || "Falha ao consultar video.",
      },
      response.status
    );
  }

  return json({
    ok: true,
    provider: "byteplus",
    task: {
      id: data?.id || id,
      status: data?.status || "unknown",
      model: data?.model || null,
      videoUrl: data?.content?.video_url || null,
      lastFrameUrl: data?.content?.last_frame_url || null,
      resolution: data?.resolution || null,
      ratio: data?.ratio || null,
      duration: data?.duration || null,
      generateAudio: data?.generate_audio ?? null,
      usage: data?.usage || null,
      error: data?.error || null,
    },
  });
}
