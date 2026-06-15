export type SectionId =
  | "master"
  | "agents"
  | "missions"
  | "canvas"
  | "console"
  | "models"
  | "audit";

export type NavItem = {
  id: SectionId;
  label: string;
  short: string;
  icon: string;
  description: string;
};

export const NAV_ITEMS: NavItem[] = [
  {
    id: "master",
    label: "Mestre",
    short: "M",
    icon: "M",
    description: "Orquestrador principal, plano da missao e decisoes pendentes.",
  },
  {
    id: "agents",
    label: "Agentes",
    short: "A",
    icon: "A",
    description: "Cargos, permissoes, modelos vinculados e sabatina.",
  },
  {
    id: "missions",
    label: "Missoes",
    short: "MI",
    icon: "MI",
    description: "Projeto novo, projeto existente, reconstrucao e status.",
  },
  {
    id: "canvas",
    label: "Canvas",
    short: "C",
    icon: "C",
    description: "Workflow visual com blocos de agentes e etapas.",
  },
  {
    id: "console",
    label: "Console",
    short: "T",
    icon: ">_",
    description: "Comandos, logs, interpretacao, validacao e aprovacao.",
  },
  {
    id: "models",
    label: "Modelos",
    short: "MO",
    icon: "MO",
    description: "OpenAI, Ollama, endpoints compativeis, custo e aprovacao.",
  },
  {
    id: "audit",
    label: "Auditoria",
    short: "AU",
    icon: "AU",
    description: "Snapshots, historico, acoes bloqueadas e evidencias.",
  },
];

