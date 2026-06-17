export type ArgosEngineMode = "local" | "cloud";

export type ArgosEngineKind =
  | "text"
  | "vision"
  | "image"
  | "video";

export type ArgosEngineStatus =
  | "installed"
  | "candidate"
  | "lab_planned"
  | "future_cloud"
  | "disabled";

export type ArgosEngineId =
  | "ollama-qwen25-3b"
  | "ollama-qwen25-coder-7b"
  | "ollama-hermes3-8b"
  | "ollama-qwen25vl-3b"
  | "ollama-qwen25vl-7b"
  | "local-wan21-t2v-13b"
  | "local-ltx-video-2b"
  | "local-framepack"
  | "local-animatediff-svd"
  | "cloud-openrouter"
  | "cloud-ltx-api"
  | "cloud-veo-kling-seedance";

export type ArgosEngine = {
  id: ArgosEngineId;
  name: string;
  mode: ArgosEngineMode;
  kind: ArgosEngineKind;
  status: ArgosEngineStatus;
  paidApi: boolean;
  sensitiveDataAllowed: boolean;
  notes: string;
};

export const ARGOS_ENGINE_CATALOG: ArgosEngine[] = [
  {
    id: "ollama-qwen25-3b",
    name: "qwen2.5:3b",
    mode: "local",
    kind: "text",
    status: "installed",
    paidApi: false,
    sensitiveDataAllowed: true,
    notes: "Modelo local leve já existente para conversa e análise geral.",
  },
  {
    id: "ollama-qwen25-coder-7b",
    name: "qwen2.5-coder:7b",
    mode: "local",
    kind: "text",
    status: "installed",
    paidApi: false,
    sensitiveDataAllowed: true,
    notes: "Modelo local já existente para código, patches e análise técnica.",
  },
  {
    id: "ollama-hermes3-8b",
    name: "hermes3:8b",
    mode: "local",
    kind: "text",
    status: "candidate",
    paidApi: false,
    sensitiveDataAllowed: true,
    notes: "Candidato para planner local, JSON e agente textual.",
  },
  {
    id: "ollama-qwen25vl-3b",
    name: "qwen2.5vl:3b",
    mode: "local",
    kind: "vision",
    status: "candidate",
    paidApi: false,
    sensitiveDataAllowed: true,
    notes: "Candidato leve para análise local de imagem.",
  },
  {
    id: "ollama-qwen25vl-7b",
    name: "qwen2.5vl:7b",
    mode: "local",
    kind: "vision",
    status: "candidate",
    paidApi: false,
    sensitiveDataAllowed: true,
    notes: "Candidato melhor para visão local, possivelmente pesado para GTX 1070 Ti 8 GB.",
  },
  {
    id: "local-wan21-t2v-13b",
    name: "Wan2.1 T2V 1.3B 480p",
    mode: "local",
    kind: "video",
    status: "lab_planned",
    paidApi: false,
    sensitiveDataAllowed: false,
    notes: "Primeiro candidato para laboratório de vídeo local fora do ARGOS.",
  },
  {
    id: "local-ltx-video-2b",
    name: "LTX-Video 2B local/quantizado",
    mode: "local",
    kind: "video",
    status: "lab_planned",
    paidApi: false,
    sensitiveDataAllowed: false,
    notes: "Segundo candidato para vídeo local, após teste do Wan2.1 ou falha por VRAM.",
  },
  {
    id: "local-framepack",
    name: "FramePack",
    mode: "local",
    kind: "video",
    status: "lab_planned",
    paidApi: false,
    sensitiveDataAllowed: false,
    notes: "Candidato de garimpo para vídeo local.",
  },
  {
    id: "local-animatediff-svd",
    name: "AnimateDiff / SVD fallback",
    mode: "local",
    kind: "video",
    status: "lab_planned",
    paidApi: false,
    sensitiveDataAllowed: false,
    notes: "Fallback para movimento curto se motores modernos falharem.",
  },
  {
    id: "cloud-openrouter",
    name: "OpenRouter",
    mode: "cloud",
    kind: "text",
    status: "future_cloud",
    paidApi: true,
    sensitiveDataAllowed: false,
    notes: "Futuro uso apenas para marketing/conteúdo não sensível. Desabilitado nesta fase.",
  },
  {
    id: "cloud-ltx-api",
    name: "LTX API",
    mode: "cloud",
    kind: "video",
    status: "disabled",
    paidApi: true,
    sensitiveDataAllowed: false,
    notes: "Não implementar agora. Futuro uso apenas para marketing.",
  },
  {
    id: "cloud-veo-kling-seedance",
    name: "Veo / Kling / Seedance",
    mode: "cloud",
    kind: "video",
    status: "future_cloud",
    paidApi: true,
    sensitiveDataAllowed: false,
    notes: "Garimpo futuro para marketing, sem integração nesta fase.",
  },
];

export function getArgosEngineById(id: ArgosEngineId) {
  return ARGOS_ENGINE_CATALOG.find((engine) => engine.id === id) ?? null;
}
