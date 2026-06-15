import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();

function write(relativePath, content) {
  const fullPath = join(root, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content.trimStart() + "\n", { encoding: "utf8" });
}

write("src/state/argosOperationalState.ts", String.raw`
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
`);

write("src/components/StatusBadge.tsx", String.raw`
import { statusLabels, type OperationalStatus } from "../state/argosOperationalState";

export function StatusBadge({ status }: { status: OperationalStatus }) {
  return <span className={"status-badge status-" + status}>{statusLabels[status]}</span>;
}
`);

write("src/components/SectionCard.tsx", String.raw`
import type { ReactNode } from "react";

type SectionCardProps = {
  kicker?: string;
  title: string;
  children: ReactNode;
};

export function SectionCard({ kicker, title, children }: SectionCardProps) {
  return (
    <section className="panel-card">
      {kicker ? <span className="card-kicker">{kicker}</span> : null}
      <h3>{title}</h3>
      {children}
    </section>
  );
}
`);

write("src/modules/master/MasterPanel.tsx", String.raw`
import { SectionCard } from "../../components/SectionCard";
import { StatusBadge } from "../../components/StatusBadge";
import { agents, dashboard, missions } from "../../state/argosOperationalState";

export function MasterPanel() {
  const activeMissions = missions.length;
  const blockedAgents = agents.filter((agent) => agent.status === "blocked").length;
  const approvalMissions = missions.filter((mission) => mission.requiresApproval).length;

  return (
    <div className="panel-grid two-columns">
      <section className="panel-card hero-card">
        <span className="card-kicker">Mestre / Orquestrador</span>
        <h2>ARGOS {dashboard.version} em estado operacional local.</h2>
        <p>
          O shell visual agora le dados locais de missoes, agentes, modelos,
          console e auditoria. Ainda nao existe backend, API paga ou execucao real.
        </p>

        <div className="metric-grid">
          <div className="metric-card">
            <strong>{activeMissions}</strong>
            <span>missoes</span>
          </div>
          <div className="metric-card">
            <strong>{agents.length}</strong>
            <span>agentes</span>
          </div>
          <div className="metric-card">
            <strong>{approvalMissions}</strong>
            <span>exigem aprovacao</span>
          </div>
          <div className="metric-card">
            <strong>{blockedAgents}</strong>
            <span>bloqueados</span>
          </div>
        </div>

        <div className="mission-rule">
          <strong>Regra-mae ativa</strong>
          <span>Nenhuma acao perigosa sem aprovacao explicita.</span>
        </div>
      </section>

      <SectionCard kicker="Missoes em foco" title="Fila operacional">
        <div className="compact-list">
          {missions.map((mission) => (
            <div className="compact-item" key={mission.id}>
              <div>
                <strong>{mission.name}</strong>
                <span>{mission.nextStep}</span>
              </div>
              <StatusBadge status={mission.status} />
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
`);

write("src/modules/agents/AgentsPanel.tsx", String.raw`
import { StatusBadge } from "../../components/StatusBadge";
import { agents } from "../../state/argosOperationalState";

export function AgentsPanel() {
  return (
    <div className="panel-grid">
      {agents.map((agent) => (
        <article className="panel-card" key={agent.id}>
          <span className="card-kicker">{agent.role}</span>
          <h3>{agent.name}</h3>
          <p>Modelo: {agent.model}</p>

          <StatusBadge status={agent.status} />

          <div className="mini-section">
            <strong>Permissoes</strong>
            <ul>
              {agent.permissions.map((permission) => (
                <li key={permission}>{permission}</li>
              ))}
            </ul>
          </div>

          <div className="mini-section danger">
            <strong>Bloqueios</strong>
            <ul>
              {agent.blockedActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        </article>
      ))}
    </div>
  );
}
`);

write("src/modules/missions/MissionsPanel.tsx", String.raw`
import { StatusBadge } from "../../components/StatusBadge";
import { missions } from "../../state/argosOperationalState";

const modeLabels = {
  new_project: "Projeto novo",
  existing_project: "Projeto existente",
  reconstruction: "Reconstrucao",
};

export function MissionsPanel() {
  return (
    <div className="panel-grid">
      {missions.map((mission) => (
        <article className="panel-card mission-tile" key={mission.id}>
          <span className="card-kicker">{modeLabels[mission.mode]}</span>
          <h3>{mission.name}</h3>
          <p>{mission.objective}</p>

          <div className="mission-meta">
            <span>Owner: {mission.owner}</span>
            <span>Aprovacao: {mission.requiresApproval ? "sim" : "nao"}</span>
          </div>

          <div className="next-step-box">
            <strong>Proximo passo</strong>
            <span>{mission.nextStep}</span>
          </div>

          <StatusBadge status={mission.status} />
        </article>
      ))}
    </div>
  );
}
`);

write("src/modules/canvas/CanvasPanel.tsx", String.raw`
import { missions } from "../../state/argosOperationalState";

const workflow = [
  ["Entrada", "Requisitos e contexto"],
  ["Mestre", "Plano de acao"],
  ["Agentes", "Divisao de tarefas"],
  ["Console", "Validacao humana"],
  ["Auditoria", "Snapshot e historico"],
];

export function CanvasPanel() {
  return (
    <div className="canvas-stage">
      <div className="canvas-line" />

      <div className="canvas-node-list">
        {workflow.map(([title, subtitle]) => (
          <div className="canvas-node" key={title}>
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>
        ))}
      </div>

      <p className="canvas-note">
        Canvas v0.2 ainda e visual e local. Missoes carregadas: {missions.length}.
      </p>
    </div>
  );
}
`);

write("src/modules/console/ConsolePanel.tsx", String.raw`
import { StatusBadge } from "../../components/StatusBadge";
import { consoleEvents } from "../../state/argosOperationalState";

export function ConsolePanel() {
  return (
    <section className="console-panel">
      <header>
        <span className="card-kicker">Console tecnico</span>
        <h3>Comando -&gt; log -&gt; interpretacao -&gt; validacao</h3>
      </header>

      <div className="console-window">
        {consoleEvents.map((event) => (
          <div className="console-row rich" key={event.id}>
            <span>{event.kind}</span>
            <div>
              <strong>{event.title}</strong>
              <code>{event.detail}</code>
              <StatusBadge status={event.status} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
`);

write("src/modules/models/ModelsPanel.tsx", String.raw`
import { StatusBadge } from "../../components/StatusBadge";
import { models } from "../../state/argosOperationalState";

export function ModelsPanel() {
  return (
    <div className="panel-grid">
      {models.map((model) => (
        <article className="panel-card" key={model.id}>
          <span className="card-kicker">{model.provider}</span>
          <h3>{model.name}</h3>
          <p>{model.purpose}</p>

          <div className="mission-meta">
            <span>Pago: {model.paid ? "sim" : "nao"}</span>
            <span>Aprovacao: {model.approvalRequired ? "obrigatoria" : "nao"}</span>
          </div>

          <StatusBadge status={model.status} />
        </article>
      ))}
    </div>
  );
}
`);

write("src/modules/audit/AuditPanel.tsx", String.raw`
import { StatusBadge } from "../../components/StatusBadge";
import { auditEvents } from "../../state/argosOperationalState";

export function AuditPanel() {
  return (
    <section className="panel-card">
      <span className="card-kicker">Auditoria inicial</span>
      <h3>Linha do tempo operacional</h3>

      <div className="timeline">
        {auditEvents.map((event) => (
          <div className="timeline-item" key={event.id}>
            <div className="timeline-head">
              <strong>{event.title}</strong>
              <StatusBadge status={event.status} />
            </div>
            <span>{event.detail}</span>
            <code>{event.evidence}</code>
          </div>
        ))}
      </div>
    </section>
  );
}
`);

write("src/index.css", String.raw`
@import "./theme/theme.css";

.argos-shell {
  display: grid;
  grid-template-columns: 44px minmax(240px, 310px) 1fr;
  min-height: 100vh;
  overflow: hidden;
}

.argos-shell.is-collapsed {
  grid-template-columns: 44px 0 1fr;
}

.icon-rail {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 100vh;
  padding: 10px 6px;
  background: color-mix(in srgb, var(--panel) 92%, var(--bg));
  border-right: 1px solid var(--border);
}

.hamburger-btn,
.icon-rail-btn,
.sidebar-hamburger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--fg);
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
}

.hamburger-btn,
.icon-rail-btn {
  width: 31px;
  height: 31px;
  opacity: 0.78;
}

.hamburger-btn:hover,
.icon-rail-btn:hover,
.icon-rail-btn.active-section {
  opacity: 1;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.rail-divider {
  width: 22px;
  height: 1px;
  background: var(--border);
  margin: 2px 0 4px;
}

.rail-spacer {
  flex: 1;
}

.rail-status {
  color: var(--color-agent-active, #00ff00);
  font-size: 10px;
}

.sidebar {
  min-width: 0;
  overflow: hidden;
  background: var(--sidebar-bg, var(--panel));
  border-right: 1px solid var(--border);
  transition: width 180ms ease, opacity 180ms ease;
}

.sidebar.hidden {
  width: 0;
  opacity: 0;
  pointer-events: none;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
}

.sidebar-hamburger {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
}

.sidebar-brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  background: transparent;
  color: var(--fg);
  cursor: pointer;
}

.brand-mark {
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--red);
}

.brand-subtitle {
  font-size: 11px;
  color: var(--muted);
}

.sidebar-inner {
  height: calc(100vh - 58px);
  overflow: auto;
  padding: 12px;
}

.sidebar-section + .sidebar-section {
  margin-top: 18px;
}

.section-title {
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin: 0 0 8px;
}

.list-item {
  display: grid;
  grid-template-columns: 28px 1fr;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 9px;
  margin-bottom: 5px;
  color: var(--fg);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  text-align: left;
  cursor: pointer;
}

.list-item:hover,
.list-item.active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-color: color-mix(in srgb, var(--accent) 32%, transparent);
}

.list-icon {
  color: var(--accent);
  font-size: 12px;
}

.list-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.list-copy small,
.status-card small,
.panel-card p,
.canvas-note,
.compact-item span,
.timeline-item span {
  color: var(--muted);
  line-height: 1.5;
}

.status-card {
  display: flex;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg) 58%, var(--panel));
}

.status-dot {
  width: 9px;
  height: 9px;
  margin-top: 4px;
  border-radius: 999px;
  background: #50fa7b;
  box-shadow: 0 0 12px #50fa7b;
}

.argos-main {
  min-width: 0;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.chat-top-bar {
  min-height: 82px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 76%, var(--panel));
}

.topbar-title h1 {
  margin: 2px 0;
  color: var(--fg);
  font-size: 25px;
}

.topbar-title p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.topbar-kicker,
.workspace-eyebrow,
.card-kicker {
  color: var(--red);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.pill,
.badge,
.status-badge {
  display: inline-flex;
  width: fit-content;
  border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
  color: var(--accent);
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 11px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.status-blocked,
.status-error {
  color: var(--red);
  border-color: color-mix(in srgb, var(--red) 45%, var(--border));
  background: color-mix(in srgb, var(--red) 10%, transparent);
}

.status-executed,
.status-approved,
.status-reviewed {
  color: #50fa7b;
  border-color: color-mix(in srgb, #50fa7b 45%, var(--border));
  background: color-mix(in srgb, #50fa7b 10%, transparent);
}

.status-waiting_approval {
  color: #f0ad4e;
  border-color: color-mix(in srgb, #f0ad4e 45%, var(--border));
  background: color-mix(in srgb, #f0ad4e 10%, transparent);
}

.pill.muted {
  color: var(--muted);
  border-color: var(--border);
  background: color-mix(in srgb, var(--panel) 65%, transparent);
}

.theme-select-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
}

.theme-select-label select {
  color: var(--fg);
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  padding: 7px 9px;
}

.workspace {
  flex: 1;
  overflow: auto;
  padding: 18px;
}

.workspace-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
}

.workspace-header h2 {
  margin: 2px 0 0;
  font-size: 20px;
}

.workspace-state {
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--muted);
  font-size: 12px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 76%, transparent);
  padding: 8px 10px;
  border-radius: 999px;
}

.panel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(255px, 1fr));
  gap: 14px;
}

.panel-grid.two-columns {
  grid-template-columns: minmax(280px, 1.15fr) minmax(260px, 0.85fr);
}

.panel-card,
.console-panel,
.canvas-stage {
  border: 1px solid var(--border);
  border-radius: 16px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--panel) 92%, var(--bg)), color-mix(in srgb, var(--panel) 72%, var(--bg)));
  box-shadow: 0 18px 60px color-mix(in srgb, #000 28%, transparent);
  padding: 16px;
}

.panel-card h2,
.panel-card h3,
.console-panel h3 {
  margin: 7px 0 8px;
}

.hero-card {
  min-height: 300px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(80px, 1fr));
  gap: 10px;
  margin: 18px 0;
}

.metric-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--bg) 40%, transparent);
}

.metric-card strong {
  display: block;
  font-size: 25px;
  color: var(--accent);
}

.metric-card span {
  color: var(--muted);
  font-size: 11px;
}

.mission-rule,
.next-step-box {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 14px;
  padding: 13px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--red) 42%, var(--border));
  background: color-mix(in srgb, var(--red) 9%, transparent);
}

.next-step-box {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}

.next-step-box span {
  color: var(--muted);
}

.compact-list,
.timeline {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.compact-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg) 35%, transparent);
}

.compact-item div {
  display: grid;
  gap: 4px;
}

.mini-section {
  margin-top: 14px;
}

.mini-section ul {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--muted);
}

.mini-section.danger strong {
  color: var(--red);
}

.mission-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}

.mission-meta span {
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  padding: 5px 8px;
  font-size: 11px;
}

.canvas-stage {
  position: relative;
  min-height: 500px;
  overflow: hidden;
}

.canvas-node-list {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 16px;
  max-width: 280px;
  margin: 26px auto 70px;
}

.canvas-node {
  display: flex;
  flex-direction: column;
  gap: 5px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  border-radius: 14px;
  padding: 14px;
  background: color-mix(in srgb, var(--panel) 88%, var(--bg));
}

.canvas-node span {
  color: var(--muted);
}

.canvas-line {
  position: absolute;
  top: 48px;
  bottom: 80px;
  left: 50%;
  width: 2px;
  background: linear-gradient(var(--accent), var(--red));
  opacity: 0.45;
}

.canvas-note {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 12px;
}

.console-window {
  margin-top: 14px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: #050505;
}

.console-row {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}

.console-row.rich > div {
  display: grid;
  gap: 8px;
}

.console-row:last-child {
  border-bottom: 0;
}

.console-row > span {
  color: var(--accent);
}

.console-row code,
.timeline-item code {
  color: #d6ffe2;
  white-space: pre-wrap;
}

.timeline-item {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-left: 3px solid var(--accent);
  background: color-mix(in srgb, var(--bg) 40%, transparent);
  border-radius: 10px;
}

.timeline-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

@media (max-width: 900px) {
  .argos-shell,
  .argos-shell.is-collapsed {
    grid-template-columns: 44px 1fr;
  }

  .sidebar {
    position: fixed;
    left: 44px;
    top: 0;
    bottom: 0;
    width: min(310px, calc(100vw - 44px));
    z-index: 4;
  }

  .panel-grid.two-columns {
    grid-template-columns: 1fr;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(80px, 1fr));
  }

  .chat-top-bar,
  .workspace-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .console-row,
  .compact-item {
    grid-template-columns: 1fr;
  }
}
`);

write("docs/snapshots/snapshot-argos-v0.2-inicio-20260615.md", String.raw`
# Snapshot ARGOS v0.2 - Inicio

Data: 2026-06-15

## Fase

ARGOS v0.2 - Estado operacional local

## Objetivo

Transformar o shell visual do ARGOS em um painel operacional local, ainda sem backend, sem API paga e sem execucao real de comandos.

## Escopo aplicado

- criar estado local mockado
- alimentar paineis com dados locais
- exibir missoes com status
- exibir agentes com permissoes e bloqueios
- exibir modelos com status e aprovacao
- exibir console com eventos locais
- exibir auditoria com evidencias locais

## Arquivos principais previstos

- src/state/argosOperationalState.ts
- src/components/StatusBadge.tsx
- src/components/SectionCard.tsx
- src/modules/master/MasterPanel.tsx
- src/modules/agents/AgentsPanel.tsx
- src/modules/missions/MissionsPanel.tsx
- src/modules/canvas/CanvasPanel.tsx
- src/modules/console/ConsolePanel.tsx
- src/modules/models/ModelsPanel.tsx
- src/modules/audit/AuditPanel.tsx
- src/index.css

## Regras preservadas

- sem API paga
- sem backend
- sem execucao real
- sem deploy
- sem comandos destrutivos
- aprovacao humana obrigatoria antes de qualquer acao perigosa

## Validacao obrigatoria

Antes do commit:

npm run build

Depois do commit:

git status
git push
`);
console.log("ARGOS v0.2 estado operacional local aplicado.");
