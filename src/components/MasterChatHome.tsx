import { useEffect, useRef, useState, type ChangeEvent } from "react";
import argosHero from "../assets/argos-centurion.png";
import { processAttachmentsForPrompt } from "../utils/attachmentProcessor";

const LOCAL_SUPERVISOR_URL = "http://127.0.0.1:8786";
const LOCAL_AI_BRIDGE_URL = "http://127.0.0.1:8787";
const LOCAL_FALLBACK_MODEL_ID = "qwen2.5:3b";
const MASTER_CHAT_STORAGE_KEY = "argos.masterChat.messages.v2";
const LEGACY_MASTER_CHAT_STORAGE_KEY = "argos.masterChat.messages.v1";
const LEGACY_MASTER_CHAT_STORAGE_PREFIX = "argos.masterChat.messagesByModel.v1";
const LEGACY_MASTER_CHAT_SELECTED_MODEL_KEY = "argos.masterChat.selectedModel.v1";

type ChatMessage = {
  id: string;
  role: "master" | "user";
  text: string;
  status?: "normal" | "loading" | "error";
  label?: string;
  imageBase64?: string;
  imageMimeType?: string;
};

type PendingAttachment = {
  id: string;
  file: File;
};

const ACCEPTED_ATTACHMENT_EXTENSIONS = [
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".pdf",
  ".docx",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".zip",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".html",
  ".css",
  ".sql",
  ".ps1",
].join(",");

const MAX_ATTACHMENT_FILES = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_CLOUD_IMAGE_FILES = 3;
const MAX_DIRECT_CLOUD_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_CLOUD_IMAGE_DIMENSION = 1800;
const CLOUD_IMAGE_JPEG_QUALITY = 0.9;

const CLOUD_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);

type OnlineTextPart = {
  type: "text";
  text: string;
};

type OnlineImagePart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

type OnlineMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<OnlineTextPart | OnlineImagePart>;
};

type PreparedCloudImage = {
  fileName: string;
  mimeType: "image/jpeg" | "image/png";
  dataUrl: string;
  originalBytes: number;
};

type LocalAiStatus = "checking" | "off" | "partial" | "starting" | "online" | "stopping" | "error";

type OnlineAiStatus = "checking" | "online" | "off" | "error";

type OnlineGatewayStatusPayload = {
  ok: boolean;
  ready: boolean;
  keyPresent: boolean;
  routingMode?: string;
  textModel?: string;
  fastTextModel?: string;
  visionModel?: string;
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
};

function createId() {
  return Date.now() + "-" + Math.random().toString(36).slice(2);
}

function getFileExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");

  if (lastDot < 0) {
    return "";
  }

  return fileName.slice(lastDot).toLowerCase();
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return sizeBytes + " B";
  }

  if (sizeBytes < 1024 * 1024) {
    return (sizeBytes / 1024).toFixed(1) + " KB";
  }

  return (sizeBytes / (1024 * 1024)).toFixed(1) + " MB";
}

function isAcceptedAttachment(file: File) {
  const extension = getFileExtension(file.name);

  return ACCEPTED_ATTACHMENT_EXTENSIONS
    .split(",")
    .includes(extension);
}

function isCloudImageAttachment(file: File) {
  return CLOUD_IMAGE_EXTENSIONS.has(
    getFileExtension(file.name)
  );
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Não foi possível converter a imagem para envio."));
    };

    reader.onerror = () => {
      reject(
        reader.error ||
          new Error("Falha ao ler a imagem selecionada.")
      );
    };

    reader.readAsDataURL(file);
  });
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          `O navegador não conseguiu preparar a imagem ${file.name}.`
        )
      );
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Não foi possível compactar a imagem."));
      },
      mimeType,
      quality
    );
  });
}

async function prepareCloudImage(
  file: File
): Promise<PreparedCloudImage> {
  const extension = getFileExtension(file.name);
  const directMimeType =
    file.type === "image/png" || extension === ".png"
      ? "image/png"
      : "image/jpeg";

  const canSendDirectly =
    extension !== ".webp" &&
    file.size <= MAX_DIRECT_CLOUD_IMAGE_BYTES;

  if (canSendDirectly) {
    return {
      fileName: file.name,
      mimeType: directMimeType,
      dataUrl: await readFileAsDataUrl(file),
      originalBytes: file.size,
    };
  }

  const image = await loadImageElement(file);
  const largestDimension = Math.max(
    image.naturalWidth,
    image.naturalHeight
  );
  const scale = Math.min(
    1,
    MAX_CLOUD_IMAGE_DIMENSION / largestDimension
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(
    1,
    Math.round(image.naturalWidth * scale)
  );
  canvas.height = Math.max(
    1,
    Math.round(image.naturalHeight * scale)
  );

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("O navegador não disponibilizou o canvas da imagem.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToBlob(
    canvas,
    "image/jpeg",
    CLOUD_IMAGE_JPEG_QUALITY
  );

  return {
    fileName: file.name,
    mimeType: "image/jpeg",
    dataUrl: await readFileAsDataUrl(blob),
    originalBytes: file.size,
  };
}

function buildOnlineMessages(
  history: ChatMessage[],
  currentPrompt: string,
  images: PreparedCloudImage[]
): OnlineMessage[] {
  const messages: OnlineMessage[] = [
    {
      role: "system",
      content: [
        "Você é o ARGOS, assistente técnico do Mestre.",
        "Responda em português brasileiro, com precisão e profundidade proporcional ao pedido.",
        "Mantenha o estado real da conversa e siga fluxos interativos sem pular etapas.",
        "Quando o usuário fornecer dados solicitados na etapa anterior, avance apenas para a próxima etapa definida por ele.",
        "Não invente características, ações executadas, arquivos acessados, políticas ou limitações.",
        "Em programação, forneça soluções completas e tecnicamente verificáveis.",
      ].join(" "),
    },
  ];

  const recentHistory = history
    .filter(
      (message) =>
        message.id !== "welcome" &&
        message.status !== "loading" &&
        message.status !== "error"
    )
    .slice(-36);

  for (const message of recentHistory) {
    messages.push({
      role: message.role === "user" ? "user" : "assistant",
      content: message.text,
    });
  }

  if (!images.length) {
    messages.push({
      role: "user",
      content: currentPrompt,
    });

    return messages;
  }

  messages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: [
          currentPrompt,
          "",
          "Imagens originais anexadas nesta mensagem:",
          ...images.map(
            (image, index) =>
              `${index + 1}. ${image.fileName}`
          ),
          "Analise diretamente os pixels das imagens e considere o histórico estruturado acima.",
        ].join("\n"),
      },
      ...images.map(
        (image): OnlineImagePart => ({
          type: "image_url",
          image_url: {
            url: image.dataUrl,
          },
        })
      ),
    ],
  });

  return messages;
}

function loadLegacyStoredMessagesRaw(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const selectedModel =
      window.localStorage.getItem(LEGACY_MASTER_CHAT_SELECTED_MODEL_KEY) ||
      LOCAL_FALLBACK_MODEL_ID;

    return (
      window.localStorage.getItem(
        `${LEGACY_MASTER_CHAT_STORAGE_PREFIX}.${encodeURIComponent(selectedModel)}`
      ) ||
      window.localStorage.getItem(LEGACY_MASTER_CHAT_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

function clearStoredMessages() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keysToRemove: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (key?.startsWith(LEGACY_MASTER_CHAT_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));

    window.localStorage.removeItem(MASTER_CHAT_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_MASTER_CHAT_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_MASTER_CHAT_SELECTED_MODEL_KEY);
  } catch {
    // limpeza local indisponível; não quebra o chat
  }
}

function hasAnyLocalService(payload: SupervisorStatusPayload) {
  return Boolean(payload.ollama?.ok || payload.bridge?.ok || payload.localAiReady);
}


const DEFAULT_MASTER_MESSAGES: ChatMessage[] = [];

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

function loadStoredMessages(): ChatMessage[] {
  if (typeof window === "undefined") {
    return DEFAULT_MASTER_MESSAGES;
  }

  try {
    const raw =
      window.localStorage.getItem(MASTER_CHAT_STORAGE_KEY) ||
      loadLegacyStoredMessagesRaw();

    if (!raw) {
      return DEFAULT_MASTER_MESSAGES;
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return DEFAULT_MASTER_MESSAGES;
    }

    const messages: ChatMessage[] = parsed
      .filter(isStoredChatMessage)
      .filter((message) => message.id !== "welcome")
      .map((message): ChatMessage => ({
        ...message,
        status: message.status === "error" ? "error" : "normal",
      }))
      .slice(-80);

    if (messages.length) {
      window.localStorage.setItem(
        MASTER_CHAT_STORAGE_KEY,
        JSON.stringify(messages)
      );
    }

    return messages.length ? messages : DEFAULT_MASTER_MESSAGES;
  } catch {
    return DEFAULT_MASTER_MESSAGES;
  }
}

function saveStoredMessages(messages: ChatMessage[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const safeMessages = messages
      .filter((message) => message.status !== "loading")
      .slice(-80);

    window.localStorage.setItem(
      MASTER_CHAT_STORAGE_KEY,
      JSON.stringify(safeMessages)
    );
  } catch {
    // armazenamento local indisponível ou cheio; não quebra o chat
  }
}

function buildPromptWithConversationContext(currentPrompt: string, history: ChatMessage[]) {
  const recentHistory = history
    .filter((message) => message.id !== "welcome" && message.status !== "loading")
    .slice(-80)
    .map((message) => (message.role === "user" ? "Mestre: " : "ARGOS: ") + message.text)
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
    "Você é o ARGOS, assistente técnico do Mestre, usando uma ferramenta real do sistema.",
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
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [activeLoadingId, setActiveLoadingId] = useState<string | null>(null);
  const [localAiStatus, setLocalAiStatus] = useState<LocalAiStatus>("checking");
  const [onlineAiStatus, setOnlineAiStatus] = useState<OnlineAiStatus>("checking");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadStoredMessages()
  );

  useEffect(() => {
    refreshSupervisorStatus();
    refreshOnlineStatus();

    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    saveStoredMessages(messages);
  }, [messages]);

  function handleClearChat() {
    if (sending) {
      return;
    }

    clearStoredMessages();
    setMessages(DEFAULT_MASTER_MESSAGES);
    setAttachments([]);
    setAttachmentNotice("");
  }

  function handleOpenAttachmentPicker() {
    if (sending) {
      return;
    }

    fileInputRef.current?.click();
  }

  function handleAttachmentChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const selectedFiles = Array.from(
      event.target.files || []
    );

    event.target.value = "";

    if (!selectedFiles.length) {
      return;
    }

    const rejectedMessages: string[] = [];

    const knownFiles = new Set(
      attachments.map((attachment) =>
        [
          attachment.file.name,
          attachment.file.size,
          attachment.file.lastModified,
        ].join(":")
      )
    );

    const additions: PendingAttachment[] = [];

    for (const file of selectedFiles) {
      if (!isAcceptedAttachment(file)) {
        rejectedMessages.push(
          file.name + ": formato não aceito"
        );
        continue;
      }

      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        rejectedMessages.push(
          file.name + ": excede 25 MB"
        );
        continue;
      }

      const signature = [
        file.name,
        file.size,
        file.lastModified,
      ].join(":");

      if (knownFiles.has(signature)) {
        rejectedMessages.push(
          file.name + ": já foi selecionado"
        );
        continue;
      }

      if (
        attachments.length + additions.length >=
        MAX_ATTACHMENT_FILES
      ) {
        rejectedMessages.push(
          file.name + ": limite de 5 arquivos atingido"
        );
        continue;
      }

      knownFiles.add(signature);

      additions.push({
        id: createId(),
        file,
      });
    }

    if (additions.length) {
      setAttachments((current) => [
        ...current,
        ...additions,
      ]);
    }

    setAttachmentNotice(
      rejectedMessages.length
        ? rejectedMessages.join(" · ")
        : "Arquivos prontos para processamento pelo ARGOS."
    );
  }

  function handleRemoveAttachment(id: string) {
    setAttachments((current) =>
      current.filter(
        (attachment) => attachment.id !== id
      )
    );

    setAttachmentNotice("");
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
      setLocalAiStatus("off");
    }
  }

  async function refreshOnlineStatus() {
    setOnlineAiStatus("checking");

    try {
      const response = await fetch("/api/ai/chat", {
        method: "GET",
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      });

      const payload =
        (await response.json()) as OnlineGatewayStatusPayload;

      if (!response.ok || !payload.ok || !payload.ready) {
        setOnlineAiStatus("off");
        return;
      }

      setOnlineAiStatus("online");
    } catch {
      setOnlineAiStatus("off");
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
        label: "ARGOS — Sistema local",
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
        label: "ARGOS — Sistema local",
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
    const attachmentsForRequest = [...attachments];

    if (!value && !attachmentsForRequest.length) {
      return;
    }

    const imageAttachments = attachmentsForRequest.filter(
      (attachment) => isCloudImageAttachment(attachment.file)
    );
    const documentAttachments = attachmentsForRequest.filter(
      (attachment) => !isCloudImageAttachment(attachment.file)
    );

    if (
      onlineAiStatus === "online" &&
      imageAttachments.length > MAX_CLOUD_IMAGE_FILES
    ) {
      setAttachmentNotice(
        `Envie no máximo ${MAX_CLOUD_IMAGE_FILES} imagens por solicitação online.`
      );
      return;
    }

    const userRequest =
      value ||
      (imageAttachments.length
        ? "Analise as imagens anexadas considerando o contexto da conversa."
        : "Analise os arquivos anexados.");

    const userMessageText = attachmentsForRequest.length
      ? [
          userRequest,
          "",
          "Anexos: " +
            attachmentsForRequest
              .map((attachment) => attachment.file.name)
              .join(", "),
        ].join("\n")
      : userRequest;

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      text: userMessageText,
    };

    const loadingId = createId();
    const controller = new AbortController();
    abortRef.current = controller;

    const executorLabel =
      onlineAiStatus === "online"
        ? imageAttachments.length
          ? "visão online"
          : "executor online"
        : localAiStatus === "online"
          ? LOCAL_FALLBACK_MODEL_ID
          : null;

    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: loadingId,
        role: "master",
        label: executorLabel
          ? "ARGOS — " + executorLabel
          : "ARGOS",
        text: executorLabel
          ? `Consultando ${executorLabel}...`
          : "Nenhum executor pronto. Verifique o serviço online ou ligue a IA local.",
        status: "loading",
      },
    ]);

    setDraft("");
    setSending(true);
    setActiveLoadingId(loadingId);

    try {
      let promptInput = userRequest;
      let preparedCloudImages: PreparedCloudImage[] = [];

      if (attachmentsForRequest.length) {
        if (onlineAiStatus === "online") {
          if (documentAttachments.length) {
            updateLoadingMessage(
              loadingId,
              "Lendo os documentos anexados..."
            );

            const attachmentResult =
              await processAttachmentsForPrompt(
                documentAttachments
              );

            promptInput = [
              userRequest,
              attachmentResult.promptContext,
            ].join("\n\n");
          }

          if (imageAttachments.length) {
            updateLoadingMessage(
              loadingId,
              imageAttachments.length === 1
                ? "Preparando a imagem original para análise visual..."
                : `Preparando ${imageAttachments.length} imagens originais para análise visual...`
            );

            preparedCloudImages = await Promise.all(
              imageAttachments.map((attachment) =>
                prepareCloudImage(attachment.file)
              )
            );
          }
        } else {
          updateLoadingMessage(
            loadingId,
            "Lendo e preparando os anexos para o executor local..."
          );

          const attachmentResult =
            await processAttachmentsForPrompt(
              attachmentsForRequest
            );

          promptInput = [
            userRequest,
            attachmentResult.promptContext,
          ].join("\n\n");
        }
      }

      const toolContext =
        !attachmentsForRequest.length && value
          ? await resolveToolContextForPrompt(
              value,
              controller.signal
            )
          : null;

      if (toolContext) {
        const directToolResponse =
          buildDirectToolResponse(value, toolContext);

        if (directToolResponse) {
          setMessages((current) =>
            current.map((message) =>
              message.id === loadingId
                ? {
                    ...message,
                    text: directToolResponse,
                    status: "normal",
                    label: "ARGOS — Ferramenta",
                  }
                : message
            )
          );
          return;
        }
      }

      const promptForExecutor = toolContext
        ? buildPromptWithToolContext(value, toolContext)
        : promptInput;

      if (onlineAiStatus === "online") {
        updateLoadingMessage(
          loadingId,
          preparedCloudImages.length
            ? "Enviando texto, histórico e pixels reais ao executor visual..."
            : "Consultando o executor online..."
        );

        const onlineMessages = buildOnlineMessages(
          messages,
          promptForExecutor,
          preparedCloudImages
        );

        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            dataClass: "generic_chat",
            messages: onlineMessages,
            max_tokens: preparedCloudImages.length
              ? 16000
              : 12000,
            timeoutMs: preparedCloudImages.length
              ? 240000
              : 180000,
          }),
        });

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload?.reason ||
              "Falha ao consultar o ARGOS online."
          );
        }

        const responseModel = String(
          payload.model ||
            (preparedCloudImages.length
              ? "executor visual"
              : "executor online")
        );

        setMessages((current) =>
          current.map((message) =>
            message.id === loadingId
              ? {
                  ...message,
                  text:
                    payload.response ||
                    "O ARGOS online respondeu sem conteúdo.",
                  status: "normal",
                  label: "ARGOS — " + responseModel,
                }
              : message
          )
        );

        setAttachments([]);
        setAttachmentNotice("");
        return;
      }

      if (localAiStatus !== "online") {
        throw new Error(
          "Nenhum executor disponível. Configure a IA online ou clique em ligar IA local."
        );
      }

      if (toolContext) {
        updateLoadingMessage(
          loadingId,
          `Ferramenta usada: ${toolContext.tool}. Consultando ARGOS local...`
        );
      }

      const localPromptForExecutor = [
        "Você é o ARGOS, assistente técnico do Mestre.",
        "Executor local atual: " + LOCAL_FALLBACK_MODEL_ID + ".",
        "Responda diretamente, com profundidade proporcional ao pedido.",
        "Quando o Mestre perguntar, informe claramente o modelo local em uso.",
        "Não invente políticas de ocultação, limitações, capacidades ou ações.",
        "Não afirme que executou arquivos, comandos ou testes que não executou.",
        buildPromptWithConversationContext(
          promptForExecutor,
          messages
        ),
      ].join("\n\n");

      const response = await fetch(
        `${LOCAL_AI_BRIDGE_URL}/local-ai/chat`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: LOCAL_FALLBACK_MODEL_ID,
            prompt: localPromptForExecutor,
          }),
        }
      );

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload?.error?.message ||
            "Falha ao consultar a IA local."
        );
      }

      const responseModel = String(
        payload.model || LOCAL_FALLBACK_MODEL_ID
      );

      setMessages((current) =>
        current.map((message) =>
          message.id === loadingId
            ? {
                ...message,
                text:
                  payload.response ||
                  "A IA local respondeu sem conteúdo.",
                status: "normal",
                label: "ARGOS — " + responseModel,
              }
            : message
        )
      );
      setAttachments([]);
      setAttachmentNotice("");
    } catch (error) {
      const cancelled =
        error instanceof DOMException &&
        error.name === "AbortError";

      updateLoadingMessage(
        loadingId,
        cancelled
          ? "Consulta cancelada ou tempo limite atingido."
          : error instanceof Error
            ? error.message
            : "Erro desconhecido ao consultar o ARGOS.",
        "error"
      );
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }

      setSending(false);
      setActiveLoadingId(null);
    }
  }

  const onlineStatusLabel =
    onlineAiStatus === "checking"
      ? "ARGOS online: verificando"
      : onlineAiStatus === "online"
        ? "ARGOS online: disponível"
        : onlineAiStatus === "error"
          ? "ARGOS online: erro"
          : "ARGOS online: indisponível";

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

  return (
    <section className="master-chat-home" aria-label="Painel do ARGOS">
      <div className="master-chat-center">
        <div className="master-hero">
          <img src={argosHero} alt="Centuriao ARGOS" className="master-hero-image" />
          <h2 className="master-hero-title">ARGOS</h2>
        </div>

        <div className="master-chat-flags">
          <span>{onlineStatusLabel}</span>

          <span className={`local-ai-status local-ai-status-${localAiStatus}`}>
            {statusLabel}
          </span>

          {localAiStatus === "online" ||
          localAiStatus === "partial" ||
          localAiStatus === "stopping" ? (
            <button
              type="button"
              className="local-ai-connect-button"
              onClick={handleStopLocalAiClick}
              disabled={sending || localAiStatus === "stopping"}
            >
              {localAiStatus === "stopping"
                ? "desligando IA local"
                : "desligar IA local"}
            </button>
          ) : (
            <button
              type="button"
              className="local-ai-connect-button"
              onClick={handleStartLocalAiClick}
              disabled={
                sending ||
                localAiStatus === "starting" ||
                localAiStatus === "checking"
              }
            >
              {localAiStatus === "starting"
                ? "ligando IA local"
                : "ligar IA local"}
            </button>
          )}
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
            <span>
              {message.role === "master"
                ? message.label || "ARGOS"
                : "MESTRE"}
            </span>
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
        <div className="master-attachment-controls">
          <input
            ref={fileInputRef}
            className="master-attachment-input"
            type="file"
            multiple
            accept={ACCEPTED_ATTACHMENT_EXTENSIONS}
            onChange={handleAttachmentChange}
            disabled={sending}
            aria-label="Selecionar arquivos para o ARGOS"
          />

          <button
            type="button"
            className="master-attachment-button"
            onClick={handleOpenAttachmentPicker}
            disabled={
              sending ||
              attachments.length >= MAX_ATTACHMENT_FILES
            }
          >
            Enviar arquivo
          </button>

          <p className="master-attachment-help">
            Formatos aceitos: PDF, DOCX, XLSX, CSV, TXT,
            Markdown, JSON, imagens, arquivos de código e
            ZIP. Até 5 arquivos de 25 MB cada.
          </p>
        </div>

        {attachments.length ? (
          <div
            className="master-attachment-list"
            aria-label="Arquivos selecionados"
          >
            {attachments.map((attachment) => (
              <article
                className="master-attachment-item"
                key={attachment.id}
              >
                <div>
                  <strong>
                    {attachment.file.name}
                  </strong>

                  <span>
                    {getFileExtension(
                      attachment.file.name
                    )
                      .replace(".", "")
                      .toUpperCase() || "ARQUIVO"}
                    {" · "}
                    {formatFileSize(
                      attachment.file.size
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleRemoveAttachment(
                      attachment.id
                    )
                  }
                  disabled={sending}
                  aria-label={
                    "Remover " +
                    attachment.file.name
                  }
                  title="Remover arquivo"
                >
                  ×
                </button>
              </article>
            ))}
          </div>
        ) : null}

        {attachmentNotice ? (
          <p
            className="master-attachment-notice"
            role="status"
          >
            {attachmentNotice}
          </p>
        ) : null}

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Digite sua mensagem..."
          rows={3}
          disabled={sending}
        />

        <div className="master-chat-toolbar">
          <button
            type="button"
            className="local-ai-connect-button"
            onClick={handleClearChat}
            disabled={sending}
          >
            limpar conversa
          </button>

          <div className="chat-mode-toggle" aria-label="Modo do chat">
            <span>Agent</span>
            <strong>Chat</strong>
          </div>

          <button
            type="button"
            className={sending ? "chat-send-button chat-send-button-cancel" : "chat-send-button"}
            onClick={handleSubmit}
            disabled={
              !sending &&
              !draft.trim() &&
              !attachments.length
            }
            title={sending ? "Cancelar consulta" : "Enviar para o ARGOS"}
          >
            {sending ? "×" : "↑"}
          </button>
        </div>
      </div>
    </section>
  );
}
