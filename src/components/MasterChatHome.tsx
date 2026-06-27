import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_LOCAL_MODEL, LOCAL_OLLAMA_MODELS } from "../data/localModels";
import argosHero from "../assets/argos-centurion.png";

const LOCAL_SUPERVISOR_URL = "http://127.0.0.1:8786";
const LOCAL_AI_BRIDGE_URL = "http://127.0.0.1:8787";
const HERMES_LOCAL_MODEL_ID = "local-hermes-agent";
const LEGACY_MASTER_CHAT_STORAGE_KEY = "argos.masterChat.messages.v1";
const MASTER_CHAT_STORAGE_PREFIX = "argos.masterChat.messagesByModel.v1";
const MASTER_CHAT_SELECTED_MODEL_KEY = "argos.masterChat.selectedModel.v1";

type ChatMessage = {
  id: string;
  role: "master" | "user";
  text: string;
  status?: "normal" | "loading" | "error";
  imageBase64?: string;
  imageMimeType?: string;
};

type LocalAiStatus = "checking" | "off" | "partial" | "starting" | "online" | "stopping" | "error";

type BridgeModel = {
  id: string;
  name: string;
  size: string;
  role: string;
  preferred: boolean;
  installed: boolean;
};

type OpenRouterApprovedModel = {
  id: string;
  label: string;
  provider: string;
  group: string;
  contextLength: number;
  recommendedFor: string[];
  notes: string;
};

type OpenRouterStatusPayload = {
  ok: boolean;
  enabled: boolean;
  keyPresent: boolean;
  defaultModel: string;
  freeOnly: boolean;
  modelSelectionMode: string;
  approvedModels?: OpenRouterApprovedModel[];
};

type GeminiVisualModel = {
  id: string;
  label: string;
  mode: "prompt_builder" | "image_generation";
  role: string;
  description: string;
};

type GeminiStatusPayload = {
  ok: boolean;
  enabled: boolean;
  keyPresent: boolean;
  defaultPromptModel: string;
  defaultImageModel: string;
  routingRule: string;
  approvedModels?: GeminiVisualModel[];
};

type CloudflareImageModel = {
  id: string;
  label: string;
  provider: string;
  group: string;
  role: string;
  description: string;
};

type CloudflareImageStatusPayload = {
  ok: boolean;
  bindingPresent: boolean;
  defaultModel: string;
  routingRule: string;
  approvedModels?: CloudflareImageModel[];
};

type ChatModelOption = {
  id: string;
  name: string;
  endpoint: string;
  size: string;
  role: string;
  status: string;
  provider: "local" | "openrouter" | "gemini" | "cloudflare_image";
  projectKind?: string;
  dataClass?: string;
  geminiMode?: "prompt_builder" | "image_generation";
};

type SupervisorStatusPayload = {
  ok: boolean;
  localAiReady: boolean;
  ollama?: {
    ok: boolean;
    detectedModels?: string[];
  };
  bridge?: {
    ok: boolean;
  };
  models?: BridgeModel[];
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getModelMessagesStorageKey(modelId: string) {
  return `${MASTER_CHAT_STORAGE_PREFIX}.${encodeURIComponent(modelId)}`;
}

function loadStoredSelectedModel() {
  if (typeof window === "undefined") {
    return DEFAULT_LOCAL_MODEL.id;
  }

  try {
    return window.localStorage.getItem(MASTER_CHAT_SELECTED_MODEL_KEY) || DEFAULT_LOCAL_MODEL.id;
  } catch {
    return DEFAULT_LOCAL_MODEL.id;
  }
}

function saveStoredSelectedModel(modelId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(MASTER_CHAT_SELECTED_MODEL_KEY, modelId);
  } catch {
    // armazenamento local indisponivel; nao quebra a selecao visual
  }
}

function clearStoredMessagesForModel(modelId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getModelMessagesStorageKey(modelId));

    if (modelId === DEFAULT_LOCAL_MODEL.id) {
      window.localStorage.removeItem(LEGACY_MASTER_CHAT_STORAGE_KEY);
    }
  } catch {
    // limpeza local indisponivel; nao quebra o chat
  }
}

function clearAllStoredMessages() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keysToRemove: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (key?.startsWith(MASTER_CHAT_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.removeItem(LEGACY_MASTER_CHAT_STORAGE_KEY);
  } catch {
    // limpeza local indisponivel; nao quebra o chat
  }
}

function hasAnyLocalService(payload: SupervisorStatusPayload) {
  return Boolean(payload.ollama?.ok || payload.bridge?.ok || payload.localAiReady);
}


const DEFAULT_MASTER_MESSAGES: ChatMessage[] = [
  {
    id: "welcome",
    role: "master",
    text:
      "ARGOS pronto. O supervisor local verifica se a IA ja esta ativa e permite ligar ou desligar tudo sob comando do usuario.",
  },
];

function isStoredChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<ChatMessage>;

  return (
    typeof message.id === "string" &&
    (message.role === "master" || message.role === "user") &&
    typeof message.text === "string"
  );
}

function loadStoredMessages(modelId: string): ChatMessage[] {
  if (typeof window === "undefined") {
    return DEFAULT_MASTER_MESSAGES;
  }

  try {
    const raw =
      window.localStorage.getItem(getModelMessagesStorageKey(modelId)) ||
      (modelId === DEFAULT_LOCAL_MODEL.id
        ? window.localStorage.getItem(LEGACY_MASTER_CHAT_STORAGE_KEY)
        : null);

    if (!raw) {
      return DEFAULT_MASTER_MESSAGES;
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return DEFAULT_MASTER_MESSAGES;
    }

    const messages: ChatMessage[] = parsed
      .filter(isStoredChatMessage)
      .map((message): ChatMessage => ({
        ...message,
        status: message.status === "error" ? "error" : "normal",
      }))
      .slice(-80);

    return messages.length ? messages : DEFAULT_MASTER_MESSAGES;
  } catch {
    return DEFAULT_MASTER_MESSAGES;
  }
}

function saveStoredMessages(modelId: string, messages: ChatMessage[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const safeMessages = messages
      .filter((message) => message.status !== "loading")
      .slice(-80);

    window.localStorage.setItem(
      getModelMessagesStorageKey(modelId),
      JSON.stringify(safeMessages)
    );
  } catch {
    // armazenamento local indisponivel ou cheio; nao quebra o chat
  }
}

function buildPromptWithConversationContext(currentPrompt: string, history: ChatMessage[]) {
  const recentHistory = history
    .filter((message) => message.id !== "welcome" && message.status !== "loading")
    .slice(-16)
    .map((message) => (message.role === "user" ? "Usuario: " : "Mestre: ") + message.text)
    .join("\n");

  if (!recentHistory) {
    return currentPrompt;
  }

  return [
    "Contexto recente da conversa local do ARGOS:",
    recentHistory,
    "",
    "Mensagem atual do usuario:",
    currentPrompt,
    "",
    "Responda considerando o contexto recente. Nao diga que executou comandos se nao executou."
  ].join("\n");
}

type ArgosToolContext = {
  router: unknown;
  tool: string;
  endpoint: string;
  reason?: string;
  result: unknown;
};

function truncateToolText(value: string, maxLength = 900) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n\n[ARGOS: resultado da ferramenta truncado para economizar contexto local.]`;
}

function compactToolResultForModel(toolContext: ArgosToolContext) {
  const result = toolContext.result as Record<string, any>;

  if (!result || typeof result !== "object") {
    return result;
  }

  if (toolContext.tool === "weather") {
    return {
      ok: result.ok,
      tool: result.tool,
      source: result.source,
      location: result.location,
      current: result.current,
      daily: Array.isArray(result.daily) ? result.daily.slice(0, 3) : [],
    };
  }

  if (toolContext.tool === "github-repo") {
    return {
      ok: result.ok,
      tool: result.tool,
      source: result.source,
      repo: result.repo,
      reason: result.reason,
    };
  }

  if (toolContext.tool === "read-url") {
    return {
      ok: result.ok,
      tool: result.tool,
      source: result.source,
      title: result.title,
      text: typeof result.text === "string" ? truncateToolText(result.text) : result.text,
      reason: result.reason,
    };
  }

  return result;
}

function serializeToolResult(toolContext: ArgosToolContext) {
  const json = JSON.stringify(compactToolResultForModel(toolContext), null, 2);

  if (!json) {
    return "{}";
  }

  return truncateToolText(json, 1250);
}

function buildPromptWithToolContext(currentPrompt: string, toolContext: ArgosToolContext) {
  return [
    "Você é o Mestre ARGOS usando uma ferramenta real do sistema.",
    `Ferramenta: ${toolContext.tool}`,
    `Motivo: ${toolContext.reason || "nao informado"}`,
    "",
    "Dados da ferramenta em JSON:",
    serializeToolResult(toolContext),
    "",
    "Pergunta atual do usuário:",
    currentPrompt,
    "",
    "Responda em português brasileiro, de forma direta.",
    "Use apenas os dados da ferramenta para datas, números e condições.",
    "Não mencione bastidores como router, endpoint, JSON ou ferramenta retornou.",
    "Se a pergunta pedir comparação ou recomendação, compare usando somente os dados acima.",
  ].join("\n");
}

function isPlainWeatherQuestion(prompt: string) {
  const text = prompt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const hasWeatherIntent =
    text.includes("temperatura") ||
    text.includes("tempo") ||
    text.includes("clima") ||
    text.includes("sensacao termica");

  const asksAnalysis =
    text.includes("analise") ||
    text.includes("compare") ||
    text.includes("planeje") ||
    text.includes("explique") ||
    text.includes("previsao da semana") ||
    text.includes("proximos dias");

  return hasWeatherIntent && !asksAnalysis && text.length <= 180;
}

function buildDirectToolResponse(
  currentPrompt: string,
  toolContext: ArgosToolContext
): string | null {
  const result = toolContext.result as {
    ok?: boolean;
    tool?: string;
    location?: {
      name?: string;
      state?: string;
      country?: string;
    };
    current?: {
      temperatureC?: number;
      apparentTemperatureC?: number;
      humidityPercent?: number;
      windKmh?: number;
      condition?: string;
      time?: string;
    };
    repo?: {
      fullName?: string;
      description?: string | null;
      language?: string | null;
      defaultBranch?: string | null;
      stars?: number;
      forks?: number;
      openIssues?: number;
      private?: boolean;
      updatedAt?: string;
      pushedAt?: string;
    };
    source?: string;
    reason?: string;
  };

  if (toolContext.tool === "weather" && result?.ok && isPlainWeatherQuestion(currentPrompt)) {
    const location = result.location;
    const current = result.current;

    if (!current) {
      return null;
    }

    const place = [location?.name, location?.state, location?.country]
      .filter(Boolean)
      .join(", ");

    const parts = [
      `Agora em ${place || "local consultado"} está ${current.temperatureC}°C`,
    ];

    if (current.condition) {
      parts[0] += `, com ${current.condition}.`;
    } else {
      parts[0] += ".";
    }

    if (typeof current.apparentTemperatureC === "number") {
      parts.push(`Sensação térmica: ${current.apparentTemperatureC}°C.`);
    }

    if (typeof current.humidityPercent === "number") {
      parts.push(`Umidade: ${current.humidityPercent}%.`);
    }

    if (typeof current.windKmh === "number") {
      parts.push(`Vento: ${current.windKmh} km/h.`);
    }

    parts.push(`Fonte: ${result.source || "weather"}.`);

    return parts.join(" ");
  }

  if (toolContext.tool === "github-repo" && result?.ok && result.repo) {
    const repo = result.repo;

    return [
      `Repositório ${repo.fullName}: ${repo.description || "sem descrição"}.`,
      `Linguagem principal: ${repo.language || "não informada"}.`,
      `Branch padrão: ${repo.defaultBranch || "não informada"}.`,
      `Estrelas: ${repo.stars ?? 0}. Forks: ${repo.forks ?? 0}. Issues abertas: ${repo.openIssues ?? 0}.`,
      `Privado: ${repo.private ? "sim" : "não"}.`,
      repo.pushedAt ? `Último push: ${repo.pushedAt}.` : "",
      `Fonte: ${result.source || "GitHub"}.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return null;
}

async function resolveToolContextForPrompt(
  currentPrompt: string,
  signal: AbortSignal
): Promise<ArgosToolContext | null> {
  try {
    const routerResponse = await fetch("/api/tools/router", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      signal,
      body: JSON.stringify({
        prompt: currentPrompt,
      }),
    });

    const routerPayload = await routerResponse.json();

    const detection = routerPayload?.detection;

    if (
      !routerResponse.ok ||
      !routerPayload?.ok ||
      !detection?.tool ||
      !detection?.endpoint
    ) {
      return null;
    }

    const endpoint = String(detection.endpoint);

    if (!endpoint.startsWith("/api/tools/")) {
      return null;
    }

    const toolResponse = await fetch(endpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      signal,
    });

    const toolPayload = await toolResponse.json();

    return {
      router: routerPayload,
      tool: String(detection.tool),
      endpoint,
      reason: detection.reason ? String(detection.reason) : undefined,
      result: toolPayload,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    return null;
  }
}

export function MasterChatHome() {
  const [selectedModel, setSelectedModel] = useState(() => loadStoredSelectedModel());
  const [modelsOpen, setModelsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [activeLoadingId, setActiveLoadingId] = useState<string | null>(null);
  const [localAiStatus, setLocalAiStatus] = useState<LocalAiStatus>("checking");
  const [bridgeModels, setBridgeModels] = useState<BridgeModel[]>([]);
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterApprovedModel[]>([]);
  const [openRouterStatus, setOpenRouterStatus] = useState<OpenRouterStatusPayload | null>(null);
  const [geminiModels, setGeminiModels] = useState<GeminiVisualModel[]>([]);
  const [geminiStatus, setGeminiStatus] = useState<GeminiStatusPayload | null>(null);
  const [cloudflareImageModels, setCloudflareImageModels] = useState<CloudflareImageModel[]>([]);
  const [cloudflareImageStatus, setCloudflareImageStatus] = useState<CloudflareImageStatusPayload | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadStoredMessages(loadStoredSelectedModel())
  );

  useEffect(() => {
    refreshSupervisorStatus();
    refreshOpenRouterStatus();
    refreshGeminiStatus();
    refreshCloudflareImageStatus();
    refreshCloudflareImageStatus();

    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    saveStoredSelectedModel(selectedModel);
    saveStoredMessages(selectedModel, messages);
  }, [messages, selectedModel]);

  const ollamaModels: ChatModelOption[] = bridgeModels.length
    ? bridgeModels.map((model) => ({
        id: model.id,
        name: model.name,
        endpoint: "Supervisor 8786 -> Bridge 8787 -> Ollama 11434",
        size: model.size,
        role: model.installed ? model.role : `${model.role} Modelo nao instalado.`,
        status: model.preferred ? "preferred" : "heavy",
        provider: "local",
      }))
    : LOCAL_OLLAMA_MODELS.map((model) => ({
        ...model,
        provider: "local",
      }));

  const hermesLocalModel: ChatModelOption = {
    id: HERMES_LOCAL_MODEL_ID,
    name: "Hermes Agent",
    endpoint: "Bridge 8787 -> Hermes headless -> Ollama local",
    size: "AGENTE LOCAL",
    role: "Agente local headless controlado pelo ARGOS. Nesta fase, nao executa comandos diretamente; responde e propoe acoes para a politica de permissao.",
    status: "preferred",
    provider: "local",
  };

  const localModels: ChatModelOption[] = [...ollamaModels, hermesLocalModel];

  const cloudModels: ChatModelOption[] = openRouterModels.map((model) => ({
    id: model.id,
    name: model.label,
    endpoint: "Cloudflare backend -> OpenRouter Free",
    size: model.provider,
    role: `${model.group}. ${model.notes}`,
    status: model.id === openRouterStatus?.defaultModel ? "preferred" : "heavy",
    provider: "openrouter",
    projectKind: "marketing",
    dataClass: "generic_prompt",
  }));

  const geminiChatModels: ChatModelOption[] = geminiModels.map((model) => ({
    id: model.id,
    name: model.label,
    endpoint:
      model.mode === "image_generation"
        ? "Google Gemini API -> gerador de imagem"
        : "Google Gemini API -> construtor de prompt/JSON",
    size: model.mode === "image_generation" ? "IMAGEM" : "PROMPT/JSON",
    role: model.description,
    status:
      model.id === geminiStatus?.defaultPromptModel ||
      model.id === geminiStatus?.defaultImageModel
        ? "preferred"
        : "heavy",
    provider: "gemini",
    projectKind: "marketing",
    dataClass: model.mode === "image_generation" ? "creative_asset" : "generic_prompt",
    geminiMode: model.mode,
  }));

  const cloudflareImageChatModels: ChatModelOption[] = cloudflareImageModels.map((model) => ({
    id: model.id,
    name: model.label,
    endpoint: "Cloudflare Workers AI -> gerador de imagem free",
    size: "IMAGEM FREE",
    role: model.description,
    status: model.id === cloudflareImageStatus?.defaultModel ? "preferred" : "heavy",
    provider: "cloudflare_image",
    projectKind: "marketing",
    dataClass: "creative_asset",
  }));

  const models: ChatModelOption[] = [
    ...localModels,
    ...cloudModels,
    ...geminiChatModels,
    ...cloudflareImageChatModels,
  ];

  const fallbackModel: ChatModelOption =
    models[0] ?? {
      ...DEFAULT_LOCAL_MODEL,
      provider: "local",
    };

  const activeModel = useMemo(
    () => models.find((model) => model.id === selectedModel) ?? fallbackModel,
    [fallbackModel, models, selectedModel]
  );

  function handleModelSelect(modelId: string) {
    if (sending) {
      return;
    }

    setSelectedModel(modelId);
    saveStoredSelectedModel(modelId);
    setMessages(loadStoredMessages(modelId));
    setModelsOpen(false);
  }

  function handleClearCurrentChat() {
    if (sending) {
      return;
    }

    clearStoredMessagesForModel(selectedModel);
    setMessages(DEFAULT_MASTER_MESSAGES);
  }

  function handleClearAllChats() {
    if (sending) {
      return;
    }

    clearAllStoredMessages();
    setMessages(DEFAULT_MASTER_MESSAGES);
  }

  function updateLoadingMessage(
    id: string,
    text: string,
    status: ChatMessage["status"] = "loading",
    extra?: Partial<ChatMessage>
  ) {
    setMessages((current) =>
      current.map((message) =>
        message.id === id
          ? {
              ...message,
              text,
              status,
              ...extra,
            }
          : message
      )
    );
  }

  function applySupervisorStatus(payload: SupervisorStatusPayload) {
    setBridgeModels(payload.models || []);

    if (payload.localAiReady) {
      setLocalAiStatus("online");
      return;
    }

    if (hasAnyLocalService(payload)) {
      setLocalAiStatus("partial");
      return;
    }

    setLocalAiStatus("off");
  }

  async function refreshSupervisorStatus() {
    setLocalAiStatus("checking");

    try {
      const response = await fetch(`${LOCAL_SUPERVISOR_URL}/local-supervisor/status`, {
        method: "GET",
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      });

      const payload = (await response.json()) as SupervisorStatusPayload;

      if (!response.ok || !payload.ok) {
        throw new Error("Supervisor local nao respondeu corretamente.");
      }

      applySupervisorStatus(payload);
    } catch {
      setBridgeModels([]);
      setLocalAiStatus("off");
    }
  }

  async function refreshOpenRouterStatus() {
    try {
      const response = await fetch("/api/provider/openrouter", {
        method: "GET",
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      });

      const payload = (await response.json()) as OpenRouterStatusPayload;

      if (!response.ok || !payload.ok || !payload.enabled || !payload.keyPresent) {
        throw new Error("Provider OpenRouter indisponivel.");
      }

      setOpenRouterStatus(payload);
      setOpenRouterModels(payload.approvedModels || []);
    } catch {
      setOpenRouterStatus(null);
      setOpenRouterModels([]);
    }
  }

  async function refreshGeminiStatus() {
    try {
      const response = await fetch("/api/provider/gemini", {
        method: "GET",
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      });

      const payload = (await response.json()) as GeminiStatusPayload;

      if (!response.ok || !payload.ok || !payload.enabled || !payload.keyPresent) {
        throw new Error("Provider Gemini indisponivel.");
      }

      setGeminiStatus(payload);
      setGeminiModels(payload.approvedModels || []);
    } catch {
      setGeminiStatus(null);
      setGeminiModels([]);
    }
  }

  async function refreshCloudflareImageStatus() {
    try {
      const response = await fetch("/api/provider/cloudflare-image", {
        method: "GET",
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      });

      const payload = (await response.json()) as CloudflareImageStatusPayload;

      if (!response.ok || !payload.ok || !payload.bindingPresent) {
        throw new Error("Provider Cloudflare Image indisponivel.");
      }

      setCloudflareImageStatus(payload);
      setCloudflareImageModels(payload.approvedModels || []);
    } catch {
      setCloudflareImageStatus(null);
      setCloudflareImageModels([]);
    }
  }

  function cancelCurrentRequest() {
    abortRef.current?.abort();
    abortRef.current = null;

    if (activeLoadingId) {
      updateLoadingMessage(activeLoadingId, "Consulta cancelada pelo usuario.", "error");
    }

    setSending(false);
    setActiveLoadingId(null);
  }

  async function startLocalAi(signal?: AbortSignal) {
    setLocalAiStatus("starting");

    const response = await fetch(`${LOCAL_SUPERVISOR_URL}/local-supervisor/start-ai`, {
      method: "POST",
      headers: {
        accept: "application/json",
      },
      signal,
    });

    const payload = await response.json();

    if (!response.ok || !payload.ok || !payload.localAiReady) {
      throw new Error(
        payload?.error?.message ||
          "Nao foi possivel ligar IA local pelo supervisor."
      );
    }

    applySupervisorStatus(payload);

    return true;
  }

  async function handleStartLocalAiClick() {
    if (sending || localAiStatus === "starting") {
      return;
    }

    const loadingId = createId();
    const controller = new AbortController();
    abortRef.current = controller;

    setMessages((current) => [
      ...current,
      {
        id: loadingId,
        role: "master",
        text: "Ligando IA local pelo supervisor...",
        status: "loading",
      },
    ]);

    setSending(true);
    setActiveLoadingId(loadingId);

    try {
      await startLocalAi(controller.signal);
      updateLoadingMessage(loadingId, "IA local ligada. Ollama e ponte local estao online.", "normal");
    } catch (error) {
      setLocalAiStatus("error");
      updateLoadingMessage(
        loadingId,
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao ligar IA local.",
        "error"
      );
    } finally {
      abortRef.current = null;
      setSending(false);
      setActiveLoadingId(null);
    }
  }

  async function handleStopLocalAiClick() {
    if (sending) {
      return;
    }

    setLocalAiStatus("stopping");

    try {
      const response = await fetch(`${LOCAL_SUPERVISOR_URL}/local-supervisor/stop-ai`, {
        method: "POST",
        headers: {
          accept: "application/json",
        },
      });

      const payload = (await response.json()) as SupervisorStatusPayload;

      if (!response.ok || !payload.ok) {
        throw new Error("Nao foi possivel desligar IA local pelo supervisor.");
      }

      applySupervisorStatus(payload);
    } catch {
      setLocalAiStatus("error");
    }

    setMessages((current) => [
      ...current,
      {
        id: createId(),
        role: "master",
        text: "Comando de desligamento enviado ao supervisor local.",
        status: "normal",
      },
    ]);
  }

  async function handleSubmit() {
    if (sending) {
      cancelCurrentRequest();
      return;
    }

    const value = draft.trim();

    if (!value) {
      return;
    }

    const promptWithContext = buildPromptWithConversationContext(value, messages);
    const isOpenRouterModel = activeModel.provider === "openrouter";
    const isGeminiModel = activeModel.provider === "gemini";
    const isCloudflareImageModel = activeModel.provider === "cloudflare_image";
    const isHermesModel = activeModel.id === HERMES_LOCAL_MODEL_ID;

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      text: value,
    };

    const loadingId = createId();
    const controller = new AbortController();
    abortRef.current = controller;

    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: loadingId,
        role: "master",
        text: isCloudflareImageModel
          ? `Gerando imagem com ${activeModel.name}...`
          : isGeminiModel
            ? activeModel.geminiMode === "image_generation"
              ? `Gerando imagem com ${activeModel.name}...`
              : `Construindo prompt/JSON com ${activeModel.name}...`
            : isOpenRouterModel
              ? `Consultando ${activeModel.name} via OpenRouter Free...`
            : isHermesModel
              ? `Consultando ${activeModel.name} via Hermes local...`
            : localAiStatus === "online"
            ? `Consultando ${activeModel.name} via IA local...`
            : "IA local desligada. Ligando pelo supervisor antes de enviar...",
        status: "loading",
      },
    ]);

    setDraft("");
    setSending(true);
    setActiveLoadingId(loadingId);

    try {
      if (isCloudflareImageModel) {
        const response = await fetch("/api/provider/cloudflare-image", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            projectKind: activeModel.projectKind || "marketing",
            dataClass: activeModel.dataClass || "creative_asset",
            model: activeModel.id,
            prompt: value,
          }),
        });

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload?.reason || "Falha ao consultar Cloudflare Workers AI."
          );
        }

        updateLoadingMessage(
          loadingId,
          payload.response || "Imagem gerada pelo Cloudflare Workers AI.",
          "normal",
          payload.imageBase64
            ? {
                imageBase64: payload.imageBase64,
                imageMimeType: payload.mimeType || "image/jpeg",
              }
            : undefined
        );

        return;
      }

      if (isGeminiModel) {
        const response = await fetch("/api/provider/gemini", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            projectKind: activeModel.projectKind || "marketing",
            dataClass:
              activeModel.dataClass ||
              (activeModel.geminiMode === "image_generation"
                ? "creative_asset"
                : "generic_prompt"),
            mode: activeModel.geminiMode || "prompt_builder",
            model: activeModel.id,
            max_tokens: 1600,
            prompt: promptWithContext,
          }),
        });

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload?.reason ||
              payload?.error?.message ||
              "Falha ao consultar Gemini Visual."
          );
        }

        updateLoadingMessage(
          loadingId,
          payload.response || "Gemini respondeu sem texto.",
          "normal",
          payload.imageBase64
            ? {
                imageBase64: payload.imageBase64,
                imageMimeType: payload.mimeType || "image/png",
              }
            : undefined
        );

        return;
      }

      if (isOpenRouterModel) {
        const response = await fetch("/api/provider/openrouter", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            projectKind: activeModel.projectKind || "marketing",
            dataClass: activeModel.dataClass || "generic_prompt",
            model: activeModel.id,
            max_tokens: 1000,
            messages: [
              {
                role: "user",
                content: promptWithContext,
              },
            ],
          }),
        });

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload?.reason ||
              payload?.error?.message ||
              payload?.error?.error?.message ||
              "Falha ao consultar OpenRouter Free."
          );
        }

        updateLoadingMessage(
          loadingId,
          payload.response || "OpenRouter Free respondeu sem conteudo.",
          "normal"
        );

        return;
      }

      if (localAiStatus !== "online") {
        await startLocalAi(controller.signal);
        updateLoadingMessage(
          loadingId,
          isHermesModel
            ? `Consultando ${activeModel.name} via Hermes local...`
            : `Consultando ${activeModel.name} via IA local...`
        );
      }

      const toolContext = await resolveToolContextForPrompt(value, controller.signal);

      if (toolContext) {
        const directToolResponse = buildDirectToolResponse(value, toolContext);

        if (directToolResponse) {
          updateLoadingMessage(loadingId, directToolResponse, "normal");
          return;
        }
      }

      const localPromptForModel = toolContext
        ? buildPromptWithToolContext(value, toolContext)
        : promptWithContext;

      if (toolContext) {
        updateLoadingMessage(
          loadingId,
          `Ferramenta usada: ${toolContext.tool}. Consultando ${activeModel.name} via IA local...`
        );
      }

      const localEndpoint = isHermesModel
        ? `${LOCAL_AI_BRIDGE_URL}/local-ai/hermes/chat`
        : `${LOCAL_AI_BRIDGE_URL}/local-ai/chat`;

      const localBody = isHermesModel
        ? { prompt: localPromptForModel }
        : { model: activeModel.id, prompt: localPromptForModel };

      const response = await fetch(localEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify(localBody),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error?.message || "Falha ao consultar IA local.");
      }

      updateLoadingMessage(
        loadingId,
        payload.response || "A IA local respondeu sem conteudo.",
        "normal"
      );
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";

      updateLoadingMessage(
        loadingId,
        cancelled
          ? "Consulta cancelada ou tempo limite atingido."
          : error instanceof Error
            ? error.message
            : isCloudflareImageModel
              ? "Erro desconhecido no Cloudflare Workers AI."
              : isGeminiModel
                ? "Erro desconhecido no Gemini Visual."
                : isOpenRouterModel
                  ? "Erro desconhecido no OpenRouter Free."
                  : "Erro desconhecido na IA local.",
        "error"
      );

      if (!cancelled && !isOpenRouterModel && !isGeminiModel && !isCloudflareImageModel && localAiStatus !== "online") {
        setLocalAiStatus("error");
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }

      setSending(false);
      setActiveLoadingId(null);
    }
  }

  const statusLabel =
    localAiStatus === "checking"
      ? "IA local: verificando"
      : localAiStatus === "online"
        ? "IA local: online"
        : localAiStatus === "partial"
          ? "IA local: parcial ativa"
          : localAiStatus === "starting"
            ? "IA local: ligando"
            : localAiStatus === "stopping"
              ? "IA local: desligando"
              : localAiStatus === "error"
                ? "IA local: erro"
                : "IA local: desligada";

  // ARGOS_COPY_ANSWER_BUTTONS_EFFECT
  useEffect(() => {
    const selector = [
      ".master-message-assistant",
      ".master-message--assistant",
      ".master-message.assistant",
      ".chat-message-assistant",
      ".chat-message--assistant",
      ".chat-message.assistant",
      ".message-assistant",
      ".message--assistant",
      ".message.assistant",
      ".assistant-message",
      "[data-role='assistant']",
      "[data-message-role='assistant']",
    ].join(", ");

    const getRoot = () =>
      document.querySelector<HTMLElement>(".master-chat-home") ||
      document.querySelector<HTMLElement>(".master-chat") ||
      document.querySelector<HTMLElement>(".chat-shell") ||
      document.body;

    const readAnswerText = (card: HTMLElement) => {
      const clone = card.cloneNode(true) as HTMLElement;

      clone
        .querySelectorAll(
          [
            ".argos-copy-answer-button",
            "button",
            "svg",
            "img",
            ".master-message-meta",
            ".message-meta",
            ".chat-message-meta",
            ".message-header",
            ".chat-message-header",
            ".model-pill",
            ".message-role",
            "[aria-hidden='true']",
          ].join(", ")
        )
        .forEach((element) => element.remove());

      return (clone.innerText || clone.textContent || "").trim();
    };

    const copyToClipboard = async (textToCopy: string) => {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
        return;
      }

      const textarea = document.createElement("textarea");
      textarea.value = textToCopy;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    };

    const attachButtons = () => {
      const root = getRoot();
      const cards = Array.from(root.querySelectorAll<HTMLElement>(selector));

      for (const card of cards) {
        if (card.querySelector(".argos-copy-answer-button")) {
          continue;
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "argos-copy-answer-button";
        button.textContent = "Copiar";
        button.setAttribute("aria-label", "Copiar somente esta resposta");
        button.setAttribute("title", "Copiar somente esta resposta");

        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();

          const answerText = readAnswerText(card);

          if (!answerText) {
            button.textContent = "Vazio";
            window.setTimeout(() => {
              button.textContent = "Copiar";
            }, 1200);
            return;
          }

          try {
            await copyToClipboard(answerText);
            button.textContent = "Copiado";
            button.classList.add("is-copied");
          } catch {
            button.textContent = "Falhou";
          }

          window.setTimeout(() => {
            button.textContent = "Copiar";
            button.classList.remove("is-copied");
          }, 1400);
        });

        const header =
          card.querySelector<HTMLElement>(".master-message-meta") ||
          card.querySelector<HTMLElement>(".message-meta") ||
          card.querySelector<HTMLElement>(".chat-message-meta") ||
          card.querySelector<HTMLElement>(".message-header") ||
          card.querySelector<HTMLElement>(".chat-message-header");

        if (header) {
          header.appendChild(button);
        } else {
          card.insertBefore(button, card.firstChild);
        }
      }
    };

    attachButtons();

    const root = getRoot();
    const observer = new MutationObserver(() => attachButtons());
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  });

  // ARGOS_MODEL_MENU_REAL_SCROLL_FIX
  useEffect(() => {
    const DESKTOP_MIN_WIDTH = 769;
    const TOP_SAFE_MARGIN = 84;
    const BOTTOM_SAFE_MARGIN = 112;

    const isDesktop = () => window.innerWidth >= DESKTOP_MIN_WIDTH;

    const findModelMenuPanel = () => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>("div, aside, section")
      )
        .filter((element) => {
          const text = element.innerText || "";
          return (
            text.includes("IA GEMINI / VISUAL") &&
            text.includes("FLUX.1 Schnell") &&
            text.includes("Limpar chat")
          );
        })
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            element !== document.body &&
            rect.width >= 260 &&
            rect.width <= 680 &&
            rect.height >= 240
          );
        });

      candidates.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return rectA.width * rectA.height - rectB.width * rectB.height;
      });

      return candidates[0] || null;
    };

    const fixModelMenu = () => {
      const panel = findModelMenuPanel();

      if (!panel) {
        return;
      }

      panel.classList.add("argos-model-menu-real-scroll-fix");

      if (!isDesktop()) {
        panel.style.position = "";
        panel.style.left = "";
        panel.style.right = "";
        panel.style.top = "";
        panel.style.bottom = "";
        panel.style.width = "";
        panel.style.maxHeight = "";
        panel.style.overflowY = "";
        return;
      }

      const currentRect = panel.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const targetTop = TOP_SAFE_MARGIN;
      const targetBottom = BOTTOM_SAFE_MARGIN;
      const targetHeight = Math.max(320, viewportHeight - targetTop - targetBottom);
      const targetWidth = Math.min(Math.max(currentRect.width, 360), 520);
      const targetLeft = Math.min(
        Math.max(currentRect.left, 8),
        Math.max(8, viewportWidth - targetWidth - 24)
      );

      panel.style.position = "fixed";
      panel.style.left = `${targetLeft}px`;
      panel.style.right = "auto";
      panel.style.top = `${targetTop}px`;
      panel.style.bottom = "auto";
      panel.style.width = `${targetWidth}px`;
      panel.style.maxHeight = `${targetHeight}px`;
      panel.style.overflowY = "auto";
      panel.style.overflowX = "hidden";
      panel.style.scrollbarGutter = "stable both-edges";
      panel.style.overscrollBehavior = "contain";
      panel.style.zIndex = "80";

      if (panel.dataset.argosModelMenuScrollFixed !== "1") {
        panel.dataset.argosModelMenuScrollFixed = "1";
        panel.scrollTop = 0;
      }
    };

    const scheduleFix = () => {
      fixModelMenu();
      window.setTimeout(fixModelMenu, 30);
      window.setTimeout(fixModelMenu, 120);
      window.setTimeout(fixModelMenu, 280);
    };

    scheduleFix();

    const observer = new MutationObserver(scheduleFix);
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("click", scheduleFix, true);
    window.addEventListener("resize", scheduleFix);
    window.addEventListener("scroll", scheduleFix, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("click", scheduleFix, true);
      window.removeEventListener("resize", scheduleFix);
      window.removeEventListener("scroll", scheduleFix, true);
    };
  }, []);

  return (
    <section className="master-chat-home" aria-label="Painel inicial do Mestre">
      <div className="master-chat-center">
        <div className="master-hero">
          <img src={argosHero} alt="Centuriao ARGOS" className="master-hero-image" />
          <h2 className="master-hero-title">ARGOS</h2>
          <p className="master-hero-subtitle">
            Project Master local. Comando, contexto, validacao e auditoria.
          </p>
        </div>

        <div className="master-chat-flags">
          <span className={`local-ai-status local-ai-status-${localAiStatus}`}>
            {statusLabel}
          </span>

          {activeModel.provider === "cloudflare_image" ? (
            <button
              type="button"
              className="local-ai-connect-button"
              disabled
              title="FLUX.1 Schnell usa Workers AI no backend Cloudflare e nao precisa ligar Ollama local."
            >
              Flux Imagem selecionado
            </button>
          ) : activeModel.provider === "gemini" ? (
            <button
              type="button"
              className="local-ai-connect-button"
              disabled
              title="Modelo Gemini usa backend Cloudflare e nao precisa ligar Ollama local."
            >
              {activeModel.geminiMode === "image_generation"
                ? "Gemini Imagem selecionado"
                : "Gemini Prompt selecionado"}
            </button>
          ) : activeModel.provider === "openrouter" ? (
            <button
              type="button"
              className="local-ai-connect-button"
              disabled
              title="Modelo OpenRouter Free usa backend Cloudflare e nao precisa ligar Ollama local."
            >
              API Free selecionada
            </button>
          ) : localAiStatus === "online" || localAiStatus === "partial" || localAiStatus === "stopping" ? (
            <button
              type="button"
              className="local-ai-connect-button"
              onClick={handleStopLocalAiClick}
              disabled={sending || localAiStatus === "stopping"}
            >
              {localAiStatus === "stopping" ? "desligando IA local" : "desligar IA local"}
            </button>
          ) : (
            <button
              type="button"
              className="local-ai-connect-button"
              onClick={handleStartLocalAiClick}
              disabled={sending || localAiStatus === "starting" || localAiStatus === "checking"}
            >
              {localAiStatus === "starting" ? "ligando IA local" : "ligar IA local"}
            </button>
          )}

          <span>Ollama sob demanda</span>
          <span>
            {openRouterStatus?.enabled && openRouterStatus?.keyPresent
              ? "OpenRouter Free: online"
              : "OpenRouter Free: indisponivel"}
          </span>
          <span>
            {geminiStatus?.enabled && geminiStatus?.keyPresent
              ? "Gemini Visual: online"
              : "Gemini Visual: indisponivel"}
          </span>
          <span>
            {cloudflareImageStatus?.bindingPresent
              ? "Cloudflare Flux: online"
              : "Cloudflare Flux: indisponivel"}
          </span>
          <span>Gemini = prompt / Flux = imagem</span>
          <span>API paga bloqueada</span>
          <span>Executor bloqueado</span>
        </div>
      </div>

      <div className="master-chat-history" aria-label="Historico visual">
        {messages.slice(-8).map((message) => (
          <article
            key={message.id}
            className={`master-chat-message master-chat-message-${message.role} ${
              message.status === "error" ? "master-chat-message-error" : ""
            } ${message.status === "loading" ? "master-chat-message-loading" : ""}`}
          >
            <span>{message.role === "master" ? "Mestre" : "Voce"}</span>
            <p>{message.text}</p>
            {message.imageBase64 ? (
              <img
                className="master-chat-image-result"
                src={`data:${message.imageMimeType || "image/png"};base64,${message.imageBase64}`}
                alt="Imagem gerada pelo ARGOS"
              />
            ) : null}
          </article>
        ))}
      </div>

      <div className="master-chat-composer" aria-label="Caixa de dialogo do Mestre">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            activeModel.provider === "cloudflare_image"
              ? "Descreva a imagem final para gerar no FLUX.1 Schnell..."
              : activeModel.provider === "gemini"
                ? activeModel.geminiMode === "image_generation"
                  ? "Descreva a imagem final para gerar no Gemini 2.5 Flash Image..."
                  : "Peça um prompt, JSON, roteiro ou comando para imagem/vídeo..."
                : activeModel.provider === "openrouter"
                  ? `Mensagem para ${activeModel.name} via OpenRouter Free...`
                : activeModel.id === HERMES_LOCAL_MODEL_ID
                  ? "Mensagem para Hermes Agent local..."
                : localAiStatus === "online"
                ? `Mensagem para ${activeModel.name}...`
                : localAiStatus === "partial"
                  ? "Serviço local parcial ativo. Clique em Ligar IA local para completar ou Desligar IA local para encerrar."
                  : "IA local desligada. Clique em Ligar IA local para usar o chat."
          }
          rows={3}
          maxLength={2000}
          disabled={sending}
        />

        <div className="master-chat-toolbar">
          <div className="model-picker-wrap">
            <button
              type="button"
              className="model-add-button"
              onClick={() => setModelsOpen((value) => !value)}
              aria-label="Adicionar ou listar modelos locais"
              title="Listar modelos locais"
              disabled={sending}
            >
              +
            </button>

            {modelsOpen ? (
              <div className="model-popover">
                <div className="model-popover-head">
                  <strong>Modelos permitidos</strong>
                  <small>Local Ollama/Hermes + OpenRouter Free aprovado</small>
                </div>

                <div className="model-list">
                  {localModels.length ? (
                    <>
                      <div className="model-section-label">IA LOCAL / OLLAMA</div>

                      {localModels.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          className={
                            model.id === selectedModel
                              ? "model-option model-option-active"
                              : "model-option"
                          }
                          onClick={() => handleModelSelect(model.id)}
                          disabled={sending}
                        >
                          <span className="model-option-main">
                            <strong>{model.name}</strong>
                            <small>{model.endpoint}</small>
                          </span>

                          <span className="model-chip model-chip-preferred">LOCAL</span>

                          <span className={`model-chip model-chip-${model.status}`}>
                            {model.size}
                          </span>

                          <em>{model.role}</em>
                        </button>
                      ))}
                    </>
                  ) : null}

                  {cloudModels.length ? (
                    <>
                      <div className="model-section-label">IA API FREE / OPENROUTER</div>

                      {cloudModels.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          className={
                            model.id === selectedModel
                              ? "model-option model-option-active"
                              : "model-option"
                          }
                          onClick={() => handleModelSelect(model.id)}
                          disabled={sending}
                        >
                          <span className="model-option-main">
                            <strong>{model.name}</strong>
                            <small>{model.endpoint}</small>
                          </span>

                          <span className="model-chip model-chip-preferred">API FREE</span>

                          <span className={`model-chip model-chip-${model.status}`}>
                            {model.size}
                          </span>

                          <em>{model.role}</em>
                        </button>
                      ))}
                    </>
                  ) : (
                    <div className="model-section-label">
                      IA API FREE indisponivel ou bloqueada pelo backend
                    </div>
                  )}
                </div>

                  {geminiChatModels.length ? (
                    <>
                      <div className="model-section-label">IA GEMINI / VISUAL</div>

                      {geminiChatModels.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          className={
                            model.id === selectedModel
                              ? "model-option model-option-active"
                              : "model-option"
                          }
                          onClick={() => handleModelSelect(model.id)}
                          disabled={sending}
                        >
                          <span className="model-option-main">
                            <strong>{model.name}</strong>
                            <small>{model.endpoint}</small>
                          </span>

                          <span className="model-chip model-chip-preferred">
                            {model.geminiMode === "image_generation" ? "USAR PARA IMAGEM" : "USAR PARA PROMPT"}
                          </span>

                          <span className={`model-chip model-chip-${model.status}`}>
                            {model.size}
                          </span>

                          <em>{model.role}</em>
                        </button>
                      ))}
                    </>
                  ) : null}

                  {cloudflareImageChatModels.length ? (
                    <>
                      <div className="model-section-label">IA IMAGEM / CLOUDFLARE FREE</div>

                      {cloudflareImageChatModels.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          className={
                            model.id === selectedModel
                              ? "model-option model-option-active"
                              : "model-option"
                          }
                          onClick={() => handleModelSelect(model.id)}
                          disabled={sending}
                        >
                          <span className="model-option-main">
                            <strong>{model.name}</strong>
                            <small>{model.endpoint}</small>
                          </span>

                          <span className="model-chip model-chip-preferred">
                            USAR PARA IMAGEM
                          </span>

                          <span className={`model-chip model-chip-${model.status}`}>
                            {model.size}
                          </span>

                          <em>{model.role}</em>
                        </button>
                      ))}
                    </>
                  ) : null}

                <div className="model-clean-actions">
                  <button
                    type="button"
                    className="model-add-future"
                    onClick={handleClearCurrentChat}
                    disabled={sending}
                  >
                    Limpar chat deste modelo
                  </button>

                  <button
                    type="button"
                    className="model-add-future"
                    onClick={handleClearAllChats}
                    disabled={sending}
                  >
                    Limpar todos os chats
                  </button>
                </div>

                <button type="button" className="model-add-future" disabled>
                  Somente modelos locais ou free aprovados
                </button>
              </div>
            ) : null}
          </div>

          <div className="selected-model-pill">
            <span>
              {activeModel.provider === "openrouter"
                ? "API FREE"
                : activeModel.provider === "gemini"
                  ? activeModel.geminiMode === "image_generation"
                    ? "GEMINI IMAGEM"
                    : "GEMINI PROMPT"
                  : activeModel.provider === "cloudflare_image"
                    ? "FLUX IMAGEM"
                    : "LOCAL"}{" "}
              · {activeModel.name}
            </span>
            <small>{activeModel.endpoint}</small>
          </div>

          <div className="chat-mode-toggle" aria-label="Modo do chat">
            <span>Agent</span>
            <strong>Chat</strong>
          </div>

          <button
            type="button"
            className={sending ? "chat-send-button chat-send-button-cancel" : "chat-send-button"}
            onClick={handleSubmit}
            disabled={!sending && !draft.trim()}
            title={sending ? "Cancelar consulta" : "Enviar para modelo selecionado"}
          >
            {sending ? "×" : "↑"}
          </button>
        </div>
      </div>
    </section>
  );
}
