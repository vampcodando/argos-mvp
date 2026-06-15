import { useMemo, useState } from "react";
import { DEFAULT_LOCAL_MODEL, LOCAL_OLLAMA_MODELS } from "../data/localModels";

type ChatMessage = {
  id: string;
  role: "master" | "user";
  text: string;
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function MasterChatHome() {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_LOCAL_MODEL.id);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "master",
      text:
        "ARGOS pronto em modo local controlado. A caixa de dialogo esta ativa visualmente; a conexao real com Ollama sera liberada na proxima fase.",
    },
  ]);

  const activeModel = useMemo(
    () =>
      LOCAL_OLLAMA_MODELS.find((model) => model.id === selectedModel) ??
      DEFAULT_LOCAL_MODEL,
    [selectedModel]
  );

  function handleSubmit() {
    const value = draft.trim();

    if (!value) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: createId(),
        role: "user",
        text: value,
      },
      {
        id: createId(),
        role: "master",
        text:
          "Mensagem recebida no painel visual. Execucao real, comandos, escrita de arquivos e API paga continuam bloqueados.",
      },
    ]);

    setDraft("");
  }

  return (
    <section className="master-chat-home" aria-label="Painel inicial do Mestre">
      <div className="master-chat-center">
        <div className="master-orb">A</div>
        <h2>ARGOS</h2>
        <p>Project Master local. Comando, contexto, validacao e auditoria.</p>

        <div className="master-chat-flags">
          <span>Ollama local detectado</span>
          <span>API paga bloqueada</span>
          <span>Executor bloqueado</span>
        </div>
      </div>

      <div className="master-chat-history" aria-label="Historico visual">
        {messages.slice(-4).map((message) => (
          <article
            key={message.id}
            className={`master-chat-message master-chat-message-${message.role}`}
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
          placeholder="Mensagem para o ARGOS..."
          rows={3}
        />

        <div className="master-chat-toolbar">
          <div className="model-picker-wrap">
            <button
              type="button"
              className="model-add-button"
              onClick={() => setModelsOpen((value) => !value)}
              aria-label="Adicionar ou listar modelos locais"
              title="Listar modelos locais"
            >
              +
            </button>

            {modelsOpen ? (
              <div className="model-popover">
                <div className="model-popover-head">
                  <strong>Modelos locais</strong>
                  <small>Ollama 127.0.0.1:11434</small>
                </div>

                <div className="model-list">
                  {LOCAL_OLLAMA_MODELS.map((model) => (
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
                  Adicionar modelo manualmente na proxima fase
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

          <button type="button" className="chat-send-button" onClick={handleSubmit}>
            ↑
          </button>
        </div>
      </div>
    </section>
  );
}
