export type LocalModelStatus = "preferred" | "heavy";

export type LocalModelInfo = {
  id: string;
  name: string;
  endpoint: string;
  size: string;
  role: string;
  status: LocalModelStatus;
};

export const DEFAULT_LOCAL_MODEL: LocalModelInfo = {
  id: "qwen2.5:3b",
  name: "qwen2.5:3b",
  endpoint: "127.0.0.1:11434",
  size: "1.9 GB",
  role: "Modelo geral leve para primeira conversa local controlada.",
  status: "preferred",
};

export const LOCAL_OLLAMA_MODELS: LocalModelInfo[] = [
  DEFAULT_LOCAL_MODEL,
];
