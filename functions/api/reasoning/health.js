const REMOTE_REASONING_POOL = Object.freeze([
  Object.freeze({
    key: "minimax-m3",
    name: "MiniMax M3",
    priority: 1,
    provider: "openrouter",
    modelId: "minimax/minimax-m3:free",
    secretName: "OPENROUTER_API_KEY",
    freeOnly: true,
  }),
  Object.freeze({
    key: "glm-5.3-flash",
    name: "GLM 5.3 Flash",
    priority: 2,
    provider: "bai",
    modelId: "glm-5.3-flash",
    secretName: "BAI_API_KEY",
    freeOnly: true,
  }),
  Object.freeze({
    key: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    priority: 3,
    provider: "gemini",
    modelId: "gemini-2.5-flash",
    secretName: "GEMINI_API_KEY",
    freeOnly: true,
  }),
]);

function hasSecret(env, name) {
  return (
    typeof env?.[name] === "string" &&
    env[name].trim().length > 0
  );
}

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

export async function onRequestGet({ env }) {
  const models = REMOTE_REASONING_POOL.map((model) => ({
    key: model.key,
    name: model.name,
    priority: model.priority,
    provider: model.provider,
    modelId: model.modelId,
    freeOnly: model.freeOnly,
    configured: hasSecret(env, model.secretName),
  }));

  const configuredModelCount = models.filter(
    (model) => model.configured
  ).length;

  return json({
    ok: true,
    service: "argos-remote-reasoning",
    mode: "remote",
    freeOnly: true,
    ready: configuredModelCount > 0,
    complete:
      configuredModelCount === REMOTE_REASONING_POOL.length,
    configuredModelCount,
    models,
  });
}