import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();

function write(relativePath, content) {
  const fullPath = join(root, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content.trimStart() + "\n", { encoding: "utf8" });
}

write("src/app/navigation.ts", String.raw`
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
`);

write("src/theme/themes.ts", String.raw`
export type ArgosThemeName =
  | "dark"
  | "light"
  | "midnight"
  | "terminal"
  | "gpt"
  | "claude"
  | "ocean";

export type ArgosTheme = {
  name: ArgosThemeName;
  label: string;
  bg: string;
  fg: string;
  panel: string;
  border: string;
  red: string;
  accent: string;
  muted: string;
};

export const ARGOS_THEMES: Record<ArgosThemeName, ArgosTheme> = {
  dark: {
    name: "dark",
    label: "Odysseus Dark",
    bg: "#282c34",
    fg: "#9cdef2",
    panel: "#111111",
    border: "#355a66",
    red: "#e06c75",
    accent: "#00aaff",
    muted: "#6b8a94",
  },
  light: {
    name: "light",
    label: "Paper Light",
    bg: "#f0ebe3",
    fg: "#5a5248",
    panel: "#faf6f0",
    border: "#d4cdc2",
    red: "#c47d5a",
    accent: "#7c5cff",
    muted: "#7a7168",
  },
  midnight: {
    name: "midnight",
    label: "Midnight",
    bg: "#0d1117",
    fg: "#c9d1d9",
    panel: "#161b22",
    border: "#30363d",
    red: "#f85149",
    accent: "#58a6ff",
    muted: "#8b949e",
  },
  terminal: {
    name: "terminal",
    label: "Terminal",
    bg: "#000000",
    fg: "#00ff41",
    panel: "#0a0a0a",
    border: "#003b00",
    red: "#00ff41",
    accent: "#00ff41",
    muted: "#4aa564",
  },
  gpt: {
    name: "gpt",
    label: "GPT",
    bg: "#212121",
    fg: "#ececec",
    panel: "#171717",
    border: "#424242",
    red: "#949494",
    accent: "#ababab",
    muted: "#9b9b9b",
  },
  claude: {
    name: "claude",
    label: "Claude",
    bg: "#262624",
    fg: "#f5f4f0",
    panel: "#30302e",
    border: "#4a4a47",
    red: "#c6613f",
    accent: "#d97745",
    muted: "#b7b2a7",
  },
  ocean: {
    name: "ocean",
    label: "Ocean",
    bg: "#0b1a2c",
    fg: "#64d2ff",
    panel: "#091422",
    border: "#1e5074",
    red: "#4facfe",
    accent: "#4facfe",
    muted: "#7fb2c8",
  },
};
`);

write("src/theme/ThemeProvider.tsx", String.raw`
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ARGOS_THEMES, type ArgosThemeName } from "./themes";

type ThemeContextValue = {
  themeName: ArgosThemeName;
  setThemeName: (themeName: ArgosThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "argos-theme";

function readInitialTheme(): ArgosThemeName {
  const fallback: ArgosThemeName = "dark";

  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ArgosThemeName | null;
    if (stored && stored in ARGOS_THEMES) return stored;
  } catch {
    return fallback;
  }

  return fallback;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeNameState] = useState<ArgosThemeName>(readInitialTheme);

  useEffect(() => {
    const theme = ARGOS_THEMES[themeName];
    const root = document.documentElement;

    root.dataset.theme = themeName;
    root.style.setProperty("--bg", theme.bg);
    root.style.setProperty("--fg", theme.fg);
    root.style.setProperty("--panel", theme.panel);
    root.style.setProperty("--border", theme.border);
    root.style.setProperty("--red", theme.red);
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--muted", theme.muted);
    root.style.setProperty("--sidebar-bg", theme.panel);
    root.style.setProperty("--input-bg", theme.bg);
    root.style.setProperty("--input-border", theme.border);
    root.style.setProperty("--color-agent-active", "#00ff00");

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    metaTheme?.setAttribute("content", theme.bg);

    try {
      localStorage.setItem(STORAGE_KEY, themeName);
    } catch {
      // localStorage can be unavailable in restricted contexts.
    }
  }, [themeName]);

  const value = useMemo(
    () => ({
      themeName,
      setThemeName: setThemeNameState,
    }),
    [themeName],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useArgosTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useArgosTheme must be used inside ThemeProvider.");
  }
  return value;
}
`);

write("src/theme/theme.css", String.raw`
:root {
  --bg: #282c34;
  --fg: #9cdef2;
  --panel: #111111;
  --border: #355a66;
  --red: #e06c75;
  --accent: #00aaff;
  --muted: #6b8a94;
  --sidebar-bg: var(--panel);
  --input-bg: var(--bg);
  --input-border: var(--border);
  --color-agent-active: #00ff00;

  color: var(--fg);
  background: var(--bg);
  font-family:
    "Fira Code",
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    "Liberation Mono",
    monospace;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  min-height: 100%;
  margin: 0;
}

body {
  min-width: 320px;
  background:
    radial-gradient(circle at 10% 12%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 28%),
    radial-gradient(circle at 88% 18%, color-mix(in srgb, var(--red) 12%, transparent), transparent 30%),
    var(--bg);
  color: var(--fg);
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  border: 0;
}
`);

write("src/App.tsx", String.raw`
import { ThemeProvider } from "./theme/ThemeProvider";
import { AppShell } from "./shell/AppShell";

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
`);

write("src/shell/AppShell.tsx", String.raw`
import { useState } from "react";
import { NAV_ITEMS, type SectionId } from "../app/navigation";
import { AuditPanel } from "../modules/audit/AuditPanel";
import { AgentsPanel } from "../modules/agents/AgentsPanel";
import { CanvasPanel } from "../modules/canvas/CanvasPanel";
import { ConsolePanel } from "../modules/console/ConsolePanel";
import { MasterPanel } from "../modules/master/MasterPanel";
import { MissionsPanel } from "../modules/missions/MissionsPanel";
import { ModelsPanel } from "../modules/models/ModelsPanel";
import { IconRail } from "./IconRail";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Workspace } from "./Workspace";

function renderPanel(activeSection: SectionId) {
  switch (activeSection) {
    case "master":
      return <MasterPanel />;
    case "agents":
      return <AgentsPanel />;
    case "missions":
      return <MissionsPanel />;
    case "canvas":
      return <CanvasPanel />;
    case "console":
      return <ConsolePanel />;
    case "models":
      return <ModelsPanel />;
    case "audit":
      return <AuditPanel />;
    default:
      return <MasterPanel />;
  }
}

export function AppShell() {
  const [activeSection, setActiveSection] = useState<SectionId>("master");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const activeItem = NAV_ITEMS.find((item) => item.id === activeSection) ?? NAV_ITEMS[0];

  return (
    <div className={"argos-shell " + (sidebarCollapsed ? "is-collapsed" : "")}>
      <IconRail
        activeSection={activeSection}
        onSelect={setActiveSection}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
      />

      <Sidebar
        activeSection={activeSection}
        collapsed={sidebarCollapsed}
        onSelect={setActiveSection}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />

      <main className="argos-main">
        <Topbar activeItem={activeItem} />
        <Workspace activeItem={activeItem}>{renderPanel(activeSection)}</Workspace>
      </main>
    </div>
  );
}
`);

write("src/shell/IconRail.tsx", String.raw`
import { NAV_ITEMS, type SectionId } from "../app/navigation";

type IconRailProps = {
  activeSection: SectionId;
  onSelect: (section: SectionId) => void;
  onToggleSidebar: () => void;
};

export function IconRail({ activeSection, onSelect, onToggleSidebar }: IconRailProps) {
  return (
    <aside className="icon-rail" aria-label="Atalhos ARGOS">
      <button className="hamburger-btn" type="button" onClick={onToggleSidebar} title="Ocultar ou exibir sidebar">
        =
      </button>

      <div className="rail-divider" />

      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={"icon-rail-btn " + (activeSection === item.id ? "active-section" : "")}
          title={item.label}
          onClick={() => onSelect(item.id)}
        >
          <span>{item.icon}</span>
        </button>
      ))}

      <div className="rail-spacer" />

      <button className="icon-rail-btn rail-status" type="button" title="ARGOS local">
        ok
      </button>
    </aside>
  );
}
`);

write("src/shell/Sidebar.tsx", String.raw`
import { NAV_ITEMS, type SectionId } from "../app/navigation";

type SidebarProps = {
  activeSection: SectionId;
  collapsed: boolean;
  onSelect: (section: SectionId) => void;
  onToggle: () => void;
};

export function Sidebar({ activeSection, collapsed, onSelect, onToggle }: SidebarProps) {
  return (
    <nav className={"sidebar " + (collapsed ? "hidden" : "")} aria-label="Navegacao ARGOS">
      <header className="sidebar-header">
        <button className="sidebar-hamburger" type="button" onClick={onToggle} title="Ocultar sidebar">
          =
        </button>

        <button className="sidebar-brand" type="button" onClick={() => onSelect("master")} title="Ir para Mestre">
          <span className="brand-mark">ARGOS</span>
          <span className="brand-subtitle">Orquestrador Mestre</span>
        </button>
      </header>

      <div className="sidebar-inner">
        <section className="sidebar-section">
          <div className="section-title">Centro de comando</div>

          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={"list-item " + (activeSection === item.id ? "active" : "")}
              onClick={() => onSelect(item.id)}
            >
              <span className="list-icon">{item.icon}</span>
              <span className="list-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          ))}
        </section>

        <section className="sidebar-section">
          <div className="section-title">Estado do MVP</div>
          <div className="status-card">
            <span className="status-dot" />
            <div>
              <strong>Shell visual</strong>
              <small>Sem motor, sem API paga, sem execucao real.</small>
            </div>
          </div>
        </section>
      </div>
    </nav>
  );
}
`);

write("src/shell/Topbar.tsx", String.raw`
import { ARGOS_THEMES, type ArgosThemeName } from "../theme/themes";
import { useArgosTheme } from "../theme/ThemeProvider";
import type { NavItem } from "../app/navigation";

export function Topbar({ activeItem }: { activeItem: NavItem }) {
  const { themeName, setThemeName } = useArgosTheme();

  return (
    <header className="chat-top-bar">
      <div className="topbar-title">
        <span className="topbar-kicker">ARGOS PROJECT MASTER</span>
        <h1>{activeItem.label}</h1>
        <p>{activeItem.description}</p>
      </div>

      <div className="topbar-actions">
        <span className="pill">local</span>
        <span className="pill muted">API paga bloqueada</span>

        <label className="theme-select-label">
          Tema
          <select
            value={themeName}
            onChange={(event) => setThemeName(event.target.value as ArgosThemeName)}
            aria-label="Selecionar tema"
          >
            {Object.values(ARGOS_THEMES).map((theme) => (
              <option key={theme.name} value={theme.name}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
`);

write("src/shell/Workspace.tsx", String.raw`
import type { ReactNode } from "react";
import type { NavItem } from "../app/navigation";

type WorkspaceProps = {
  activeItem: NavItem;
  children: ReactNode;
};

export function Workspace({ activeItem, children }: WorkspaceProps) {
  return (
    <section className="workspace">
      <div className="workspace-header">
        <div>
          <span className="workspace-eyebrow">Modulo ativo</span>
          <h2>{activeItem.label}</h2>
        </div>
        <div className="workspace-state">
          <span>comando</span>
          <strong>-&gt;</strong>
          <span>log</span>
          <strong>-&gt;</strong>
          <span>validacao</span>
        </div>
      </div>

      {children}
    </section>
  );
}
`);

write("src/modules/master/MasterPanel.tsx", String.raw`
export function MasterPanel() {
  return (
    <div className="panel-grid two-columns">
      <section className="panel-card hero-card">
        <span className="card-kicker">Mestre / Orquestrador</span>
        <h2>ARGOS esta em modo visual inicial.</h2>
        <p>
          Este painel sera o ponto de conversa com o orquestrador principal.
          Por enquanto ele e apenas frontend local: sem API paga, sem agentes reais
          e sem execucao de comandos.
        </p>

        <div className="mission-rule">
          <strong>Regra-mae ativa</strong>
          <span>Nenhuma acao perigosa sem aprovacao explicita.</span>
        </div>
      </section>

      <section className="panel-card">
        <span className="card-kicker">Plano da missao</span>
        <ol className="step-list">
          <li><strong>Shell visual</strong><span>Recriar layout inspirado no Odysseus.</span></li>
          <li><strong>Estado local</strong><span>Definir missoes, agentes e modelos mockados.</span></li>
          <li><strong>Console tecnico</strong><span>Registrar comando, log, interpretacao e aprovacao.</span></li>
          <li><strong>Motor</strong><span>Integrar OpenAI Agents SDK somente apos aprovacao.</span></li>
        </ol>
      </section>
    </div>
  );
}
`);

write("src/modules/agents/AgentsPanel.tsx", String.raw`
const agents = [
  ["Mestre", "Coordena missao, cobra evidencia e decide proximos passos."],
  ["Planejador", "Divide missoes grandes em etapas pequenas."],
  ["Revisor Critico", "Tenta reprovar solucao antes de aplicar."],
  ["Executor Controlado", "Executa somente comandos aprovados pelo usuario."],
];

export function AgentsPanel() {
  return (
    <div className="panel-grid">
      {agents.map(([name, description]) => (
        <article className="panel-card" key={name}>
          <span className="card-kicker">Cargo inicial</span>
          <h3>{name}</h3>
          <p>{description}</p>
          <span className="badge pending">mockado</span>
        </article>
      ))}
    </div>
  );
}
`);

write("src/modules/missions/MissionsPanel.tsx", String.raw`
const missions = [
  ["Projeto Novo", "Coleta requisitos, arquitetura, banco, frontend, backend e documentacao."],
  ["Projeto Existente", "Le projeto, diagnostica, corrige, valida e documenta."],
  ["Reconstrucao", "Recebe sistema antigo ou descricao e propoe versao limpa."],
];

export function MissionsPanel() {
  return (
    <div className="panel-grid">
      {missions.map(([name, description]) => (
        <article className="panel-card mission-tile" key={name}>
          <span className="card-kicker">Modo ARGOS</span>
          <h3>{name}</h3>
          <p>{description}</p>
          <button type="button" disabled>Iniciar depois</button>
        </article>
      ))}
    </div>
  );
}
`);

write("src/modules/canvas/CanvasPanel.tsx", String.raw`
const nodes = [
  ["Entrada", "Requisitos"],
  ["Mestre", "Orquestracao"],
  ["Revisor", "Critica"],
  ["Console", "Validacao"],
];

export function CanvasPanel() {
  return (
    <div className="canvas-stage">
      <div className="canvas-line" />

      <div className="canvas-node-list">
        {nodes.map(([title, subtitle]) => (
          <div className="canvas-node" key={title}>
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>
        ))}
      </div>

      <p className="canvas-note">
        Canvas visual inspirado na logica de workflows. Nesta fase e apenas mock visual.
      </p>
    </div>
  );
}
`);

write("src/modules/console/ConsolePanel.tsx", String.raw`
const rows = [
  ["comando", "Aguardando proposta tecnica."],
  ["log", "Nenhum comando executado pelo ARGOS ainda."],
  ["interpretacao", "Sem diagnostico pendente."],
  ["validacao", "Aprovacao humana obrigatoria antes de qualquer acao perigosa."],
];

export function ConsolePanel() {
  return (
    <section className="console-panel">
      <header>
        <span className="card-kicker">Console tecnico</span>
        <h3>Comando -&gt; log -&gt; interpretacao -&gt; validacao</h3>
      </header>

      <div className="console-window">
        {rows.map(([label, value]) => (
          <div className="console-row" key={label}>
            <span>{label}</span>
            <code>{value}</code>
          </div>
        ))}
      </div>
    </section>
  );
}
`);

write("src/modules/models/ModelsPanel.tsx", String.raw`
const models = [
  ["OpenAI API", "Mestre principal futuro", "bloqueado"],
  ["Ollama", "Especialistas locais apos sabatina", "sabatina"],
  ["OpenAI-compatible", "Endpoints externos compativeis", "pendente"],
];

export function ModelsPanel() {
  return (
    <div className="panel-grid">
      {models.map(([name, description, status]) => (
        <article className="panel-card" key={name}>
          <span className="card-kicker">Modelo</span>
          <h3>{name}</h3>
          <p>{description}</p>
          <span className="badge">{status}</span>
        </article>
      ))}
    </div>
  );
}
`);

write("src/modules/audit/AuditPanel.tsx", String.raw`
const events = [
  ["Snapshot", "ARGOS iniciado oficialmente com estrategia modular."],
  ["Auditoria", "Odysseus aprovado como referencia visual, nao como base tecnica."],
  ["MVP", "Vite React criado e commit inicial registrado."],
];

export function AuditPanel() {
  return (
    <section className="panel-card">
      <span className="card-kicker">Auditoria inicial</span>
      <h3>Linha do tempo local</h3>

      <div className="timeline">
        {events.map(([title, description]) => (
          <div className="timeline-item" key={title}>
            <strong>{title}</strong>
            <span>{description}</span>
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
.canvas-note {
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
.badge {
  border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
  color: var(--accent);
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 11px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.pill.muted {
  color: var(--muted);
  border-color: var(--border);
  background: color-mix(in srgb, var(--panel) 65%, transparent);
}

.badge.pending {
  color: var(--red);
  border-color: color-mix(in srgb, var(--red) 45%, var(--border));
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
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
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

.mission-rule {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 22px;
  padding: 13px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--red) 42%, var(--border));
  background: color-mix(in srgb, var(--red) 9%, transparent);
}

.step-list {
  padding-left: 18px;
  margin: 12px 0 0;
}

.step-list li {
  margin-bottom: 14px;
}

.step-list span {
  display: block;
  color: var(--muted);
  margin-top: 3px;
}

.mission-tile button {
  margin-top: 12px;
  color: var(--muted);
  background: color-mix(in srgb, var(--panel) 50%, var(--bg));
  border: 1px solid var(--border);
  padding: 8px 10px;
  border-radius: 8px;
}

.canvas-stage {
  position: relative;
  min-height: 440px;
  overflow: hidden;
}

.canvas-node-list {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 16px;
  max-width: 260px;
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

.console-row:last-child {
  border-bottom: 0;
}

.console-row span {
  color: var(--accent);
}

.console-row code {
  color: #d6ffe2;
  white-space: pre-wrap;
}

.timeline {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.timeline-item {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-left: 3px solid var(--accent);
  background: color-mix(in srgb, var(--bg) 40%, transparent);
  border-radius: 10px;
}

.timeline-item span {
  color: var(--muted);
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

  .chat-top-bar,
  .workspace-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .console-row {
    grid-template-columns: 1fr;
  }
}
`);

write("src/main.tsx", String.raw`
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`);

console.log("ARGOS shell visual v0.1 aplicado com sucesso.");
