import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_LOCAL_MODEL, LOCAL_OLLAMA_MODELS } from "../data/localModels";

const LOCAL_AI_BRIDGE_URL = "http://127.0.0.1:8787";

type ChatMessage = {
  id: string;
  role: "master" | "user";
  text: string;
  status?: "normal" | "loading" | "error";
};

type BridgeStatus = "checking" | "online" | "offline";

type BridgeModel = {
  id: string;
  name: string;
  size: string;
  role: string;
  preferred: boolean;
  installed: boolean;
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function MasterChatHome() {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_LOCAL_MODEL.id);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [activeLoadingId, setActiveLoadingId] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("offline");
  const [bridgeModels, setBridgeModels] = useState<BridgeModel[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "master",
      text:
        "ARGOS pronto. Ponte local com Ollama pode responder usando qwen2.5:3b ou qwen2.5-coder:7b quando o bridge local estiver online.",
    },
  ]);

  const models = bridgeModels.length
    ? bridgeModels.map((model) => ({
        id: model.id,
        name: model.name,
        endpoint: "127.0.0.1:8787 -> 127.0.0.1:11434",
        size: model.size,
        role: model.installed ? model.role : `${model.role} Modelo nao instalado.`,
        status: model.preferred ? "preferred" : "heavy",
      }))
    : LOCAL_OLLAMA_MODELS;

  const activeModel = useMemo(
    () => models.find((model) => model.id === selectedModel) ?? DEFAULT_LOCAL_MODEL,
    [models, selectedModel]
  );

  async function refreshBridge() {
    setBridgeStatus("checking");

    try {
      const health = await fetch(`${LOCAL_AI_BRIDGE_URL}/local-ai/health`, {
        method: "GET",
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      });

      if (!health.ok) {
        throw new Error(`Bridge health retornou ${health.status}`);
      }

      const modelsResponse = await fetch(`${LOCAL_AI_BRIDGE_URL}/local-ai/models`, {
        method: "GET",
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      });

      if (!modelsResponse.ok) {
        throw new Error(`Bridge models retornou ${modelsResponse.status}`);
      }

      const payload = (await modelsResponse.json()) as {
        ok: boolean;
        models: BridgeModel[];
      };

      setBridgeModels(payload.models || []);
      setBridgeStatus("online");
    } catch {
      setBridgeStatus("offline");
      setBridgeModels([]);
    }
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function cancelCurrentRequest() {
    abortRef.current?.abort();
    abortRef.current = null;

    if (activeLoadingId) {
      setMessages((current) =>
        current.map((message) =>
          message.id === activeLoadingId
            ? {
                ...message,
                text: "Consulta cancelada pelo usuario.",
                status: "error",
              }
            : message
        )
      );
    }

    setSending(false);
    setActiveLoadingId(null);
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

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      text: value,
    };

    const loadingId = createId();
    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutMs = selectedModel === "qwen2.5-coder:7b" ? 120000 : 60000;
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: loadingId,
        role: "master",
        text: `Consultando ${selectedModel} via ponte local...`,
        status: "loading",
      },
    ]);

    setDraft("");
    setSending(true);
    setActiveLoadingId(loadingId);

    try {
      const response = await fetch(`${LOCAL_AI_BRIDGE_URL}/local-ai/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: selectedModel,
          prompt: value,
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error?.message || "Falha ao consultar IA local.");
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === loadingId
            ? {
                ...message,
                text: payload.response || "A IA local respondeu sem conteudo.",
                status: "normal",
              }
            : message
        )
      );
    } catch (error) {
      const cancelled =
        error instanceof DOMException && error.name === "AbortError";

      setMessages((current) =>
        current.map((message) =>
          message.id === loadingId
            ? {
                ...message,
                text: cancelled
                  ? "Consulta cancelada ou tempo limite atingido."
                  : error instanceof Error
                    ? error.message
                    : "Erro desconhecido na ponte local com Ollama.",
                status: "error",
              }
            : message
        )
      );
    } finally {
      window.clearTimeout(timeout);

      if (abortRef.current === controller) {
        abortRef.current = null;
      }

      setSending(false);
      setActiveLoadingId(null);
    }
  }

  const bridgeLabel =
    bridgeStatus === "checking"
      ? "ponte local: verificando"
      : bridgeStatus === "online"
        ? "ponte local: online"
        : "ponte local: offline";

  return (
    <section className="master-chat-home" aria-label="Painel inicial do Mestre">
      <div className="master-chat-center">
        <div className="master-orb">A</div>
        <h2>ARGOS</h2>
        <p>Project Master local. Comando, contexto, validacao e auditoria.</p>

        <div className="master-chat-flags">
          <span className={`local-ai-status local-ai-status-${bridgeStatus}`}>
            {bridgeLabel}
          </span>
          <button
            type="button"
            className="local-ai-connect-button"
            onClick={refreshBridge}
            disabled={bridgeStatus === "checking" || sending}
            title="Conectar manualmente a ponte local do Ollama"
          >
            {bridgeStatus === "online" ? "reconectar IA local" : "conectar IA local"}
          </button>
          <span>Ollama 127.0.0.1:11434</span>
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
            bridgeStatus === "online"
              ? `Mensagem para ${activeModel.name}...`
              : "Inicie a ponte local: npm run local:ollama-bridge"
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
                  <strong>Modelos locais</strong>
                  <small>Bridge 127.0.0.1:8787</small>
                </div>

                <div className="model-list">
                  {models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      className={
                        model.id === selectedModel
                          ? "model-option model-option-active"
                          : "model-option"
                      }
                      onClick={() => {
                        setSelectedModel(model.id);
                        setModelsOpen(false);
                      }}
                      disabled={sending}
                    >
                      <span className="model-option-main">
                        <strong>{model.name}</strong>
                        <small>{model.endpoint}</small>
                      </span>
                      <span className={`model-chip model-chip-${model.status}`}>
                        {model.size}
                      </span>
                      <em>{model.role}</em>
                    </button>
                  ))}
                </div>

                <button type="button" className="model-add-future" disabled>
                  Somente modelos permitidos nesta fase
                </button>
              </div>
            ) : null}
          </div>

          <div className="selected-model-pill">
            <span>{activeModel.name}</span>
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
            disabled={bridgeStatus !== "online"}
            title={
              sending
                ? "Cancelar consulta"
                : bridgeStatus === "online"
                  ? "Enviar para IA local"
                  : "Ponte local offline"
            }
          >
            {sending ? "×" : "↑"}
          </button>
        </div>
      </div>
    </section>
  );
}
