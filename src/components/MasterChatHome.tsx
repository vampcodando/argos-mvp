import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_LOCAL_MODEL, LOCAL_OLLAMA_MODELS } from "../data/localModels";
import argosHero from "../assets/argos-centurion.png";

const LOCAL_SUPERVISOR_URL = "http://127.0.0.1:8786";
const LOCAL_AI_BRIDGE_URL = "http://127.0.0.1:8787";
const LEGACY_MASTER_CHAT_STORAGE_KEY = "argos.masterChat.messages.v1";
const MASTER_CHAT_STORAGE_PREFIX = "argos.masterChat.messagesByModel.v1";
const MASTER_CHAT_SELECTED_MODEL_KEY = "argos.masterChat.selectedModel.v1";

type ChatMessage = {
  id: string;
  role: "master" | "user";
  text: string;
  status?: "normal" | "loading" | "error";
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

type ChatModelOption = {
  id: string;
  name: string;
  endpoint: string;
  size: string;
  role: string;
  status: string;
  provider: "local" | "openrouter";
  projectKind?: string;
  dataClass?: string;
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
  const abortRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadStoredMessages(loadStoredSelectedModel())
  );

  useEffect(() => {
    refreshSupervisorStatus();
    refreshOpenRouterStatus();

    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    saveStoredSelectedModel(selectedModel);
    saveStoredMessages(selectedModel, messages);
  }, [messages, selectedModel]);

  const localModels: ChatModelOption[] = bridgeModels.length
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

  const models: ChatModelOption[] = [...localModels, ...cloudModels];

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

  function updateLoadingMessage(id: string, text: string, status: ChatMessage["status"] = "loading") {
    setMessages((current) =>
      current.map((message) =>
        message.id === id
          ? {
              ...message,
              text,
              status,
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
        text: isOpenRouterModel
          ? `Consultando ${activeModel.name} via OpenRouter Free...`
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
        updateLoadingMessage(loadingId, `Consultando ${activeModel.name} via IA local...`);
      }

      const response = await fetch(`${LOCAL_AI_BRIDGE_URL}/local-ai/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: activeModel.id,
          prompt: promptWithContext,
        }),
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
            : isOpenRouterModel
              ? "Erro desconhecido no OpenRouter Free."
              : "Erro desconhecido na IA local.",
        "error"
      );

      if (!cancelled && !isOpenRouterModel && localAiStatus !== "online") {
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

          {activeModel.provider === "openrouter" ? (
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
          </article>
        ))}
      </div>

      <div className="master-chat-composer" aria-label="Caixa de dialogo do Mestre">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            activeModel.provider === "openrouter"
              ? `Mensagem para ${activeModel.name} via OpenRouter Free...`
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
                  <small>Local Ollama + OpenRouter Free aprovado</small>
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
              {activeModel.provider === "openrouter" ? "API FREE" : "LOCAL"} · {activeModel.name}
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
