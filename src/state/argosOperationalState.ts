export type OperationalStatus =
  | "planned"
  | "waiting_approval"
  | "approved"
  | "executed"
  | "blocked"
  | "error"
  | "reviewed";

export type AgentRole = {
  id: string;
  name: string;
  role: string;
  model: string;
  status: OperationalStatus;
  permissions: string[];
  blockedActions: string[];
};

export type Mission = {
  id: string;
  name: string;
  mode: "new_project" | "existing_project" | "reconstruction";
  status: OperationalStatus;
  owner: string;
  objective: string;
  nextStep: string;
  requiresApproval: boolean;
};

export type ConsoleEvent = {
  id: string;
  kind: "command" | "log" | "interpretation" | "validation" | "approval";
  title: string;
  detail: string;
  status: OperationalStatus;
};

export type AuditEvent = {
  id: string;
  title: string;
  detail: string;
  status: OperationalStatus;
  evidence: string;
};

export type ModelEndpoint = {
  id: string;
  name: string;
  provider: string;
  purpose: string;
  status: OperationalStatus;
  paid: boolean;
  approvalRequired: boolean;
};

export const statusLabels: Record<OperationalStatus, string> = {
  planned: "planejado",
  waiting_approval: "aguardando aprovacao",
  approved: "aprovado",
  executed: "executado",
  blocked: "bloqueado",
  error: "erro",
  reviewed: "revisado",
};

export const agents: AgentRole[] = [
  {
    id: "master",
    name: "Mestre",
    role: "Orquestrador principal",
    model: "OpenAI API futuro",
    status: "planned",
    permissions: ["planejar", "revisar", "solicitar aprovacao"],
    blockedActions: ["alterar arquivos sem aprovacao", "acionar API paga sem aprovacao"],
  },
  {
    id: "planner",
    name: "Planejador",
    role: "Quebra missoes grandes em etapas menores",
    model: "local mock",
    status: "planned",
    permissions: ["propor etapas", "priorizar tarefas"],
    blockedActions: ["executar comandos"],
  },
  {
    id: "critic",
    name: "Revisor Critico",
    role: "Tenta reprovar solucoes antes de aplicar",
    model: "local mock",
    status: "planned",
    permissions: ["auditar plano", "marcar risco"],
    blockedActions: ["aplicar patch"],
  },
  {
    id: "executor",
    name: "Executor Controlado",
    role: "Executa somente comandos aprovados",
    model: "local mock",
    status: "blocked",
    permissions: ["executar comando aprovado"],
    blockedActions: ["execucao automatica", "deploy automatico", "push automatico"],
  },
];

export const missions: Mission[] = [
  {
    id: "mvp-v01",
    name: "ARGOS MVP v0.1",
    mode: "new_project",
    status: "executed",
    owner: "vampcodando",
    objective: "Criar shell visual inicial com Vite, React e TypeScript.",
    nextStep: "Usar como base para estado operacional local.",
    requiresApproval: false,
  },
  {
    id: "operational-v02",
    name: "ARGOS v0.2 - Estado operacional local",
    mode: "new_project",
    status: "waiting_approval",
    owner: "vampcodando",
    objective: "Transformar paineis estaticos em paineis alimentados por dados locais.",
    nextStep: "Aplicar patch, validar build e registrar snapshot.",
    requiresApproval: true,
  },
  {
    id: "future-engine",
    name: "Motor multiagente futuro",
    mode: "existing_project",
    status: "blocked",
    owner: "vampcodando",
    objective: "Integrar OpenAI Agents SDK JS/TS depois da aprovacao.",
    nextStep: "Aguardar sabatina tecnica e decisao explicita.",
    requiresApproval: true,
  },
];

export const consoleEvents: ConsoleEvent[] = [
  {
    id: "cmd-001",
    kind: "command",
    title: "npm run build",
    detail: "Build final do MVP v0.1 validado antes de iniciar v0.2.",
    status: "executed",
  },
  {
    id: "log-001",
    kind: "log",
    title: "GitHub SSH",
    detail: "Remote origin configurado em git@github.com:vampcodando/argos-mvp.git.",
    status: "executed",
  },
  {
    id: "int-001",
    kind: "interpretation",
    title: "Regra de seguranca",
    detail: "Nenhuma API paga, deploy, push ou comando destrutivo sem aprovacao explicita.",
    status: "reviewed",
  },
  {
    id: "val-001",
    kind: "validation",
    title: "Estado local",
    detail: "ARGOS v0.2 ainda opera somente com dados locais mockados.",
    status: "waiting_approval",
  },
];

export const auditEvents: AuditEvent[] = [
  {
    id: "audit-001",
    title: "MVP v0.1 fechado",
    detail: "Shell visual, GitHub, SSH, build e snapshot registrados.",
    status: "executed",
    evidence: "docs/snapshots/snapshot-argos-mvp-v0.1-20260615.md",
  },
  {
    id: "audit-002",
    title: "Identidade Git isolada",
    detail: "ARGOS usa vampcodando e chave SSH propria.",
    status: "reviewed",
    evidence: "core.sshCommand local",
  },
  {
    id: "audit-003",
    title: "v0.2 iniciada",
    detail: "Estado operacional local aprovado como proxima fase.",
    status: "waiting_approval",
    evidence: "patch v0.2 pendente de build e commit",
  },
];

export const models: ModelEndpoint[] = [
  {
    id: "openai-main",
    name: "OpenAI API",
    provider: "OpenAI",
    purpose: "Mestre principal futuro",
    status: "blocked",
    paid: true,
    approvalRequired: true,
  },
  {
    id: "ollama-local",
    name: "Ollama",
    provider: "local",
    purpose: "Especialistas locais depois de sabatina",
    status: "planned",
    paid: false,
    approvalRequired: true,
  },
  {
    id: "compatible",
    name: "OpenAI-compatible",
    provider: "externo",
    purpose: "Endpoints compativeis sob aprovacao",
    status: "planned",
    paid: true,
    approvalRequired: true,
  },
];

export const dashboard = {
  version: "v0.2",
  mode: "estado operacional local",
  repository: "git@github.com:vampcodando/argos-mvp.git",
  branch: "main",
  owner: "vampcodando",
  paidApiLocked: true,
  backendEnabled: false,
  commandExecutionEnabled: false,
};

