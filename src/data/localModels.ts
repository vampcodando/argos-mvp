export type LocalModelStatus = "preferred" | "heavy";

export type LocalModelInfo = {
  id: string;
  name: string;
  endpoint: string;
  size: string;
  role: string;
  status: LocalModelStatus;
};

export const BONSAI_LOCAL_MODEL: LocalModelInfo = {
  id: "argos-bonsai-27b",
  name: "ARGOS Bonsai 27B",
  endpoint: "127.0.0.1:11434",
  size: "3.8 GB",
  role: "Executor local principal para reasoning controlado e coding.",
  status: "preferred",
};

export const QWEN_LOCAL_MODEL: LocalModelInfo = {
  id: "qwen2.5:3b",
  name: "qwen2.5:3b",
  endpoint: "127.0.0.1:11434",
  size: "1.9 GB",
  role: "Modelo local leve mantido como reserva.",
  status: "heavy",
};

export const DEFAULT_LOCAL_MODEL = BONSAI_LOCAL_MODEL;

export const LOCAL_OLLAMA_MODELS: LocalModelInfo[] = [
  DEFAULT_LOCAL_MODEL,
  QWEN_LOCAL_MODEL,
];
