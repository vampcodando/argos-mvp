import { useState } from "react";
import { NAV_ITEMS, type SectionId } from "../app/navigation";
import { AuditPanel } from "../modules/audit/AuditPanel";
import { AgentsPanel } from "../modules/agents/AgentsPanel";
import { CanvasPanel } from "../modules/canvas/CanvasPanel";
import { ConsolePanel } from "../modules/console/ConsolePanel";
import { MasterPanel } from "../modules/master/MasterPanel";
import { MissionsPanel } from "../modules/missions/MissionsPanel";
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
    case "audit":
      return <AuditPanel />;
    default:
      return <MasterPanel />;
  }
}

export function AppShell() {
  const [activeSection, setActiveSection] = useState<SectionId>("master");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const activeItem = NAV_ITEMS.find((item) => item.id === activeSection) ?? NAV_ITEMS[0];

  function handleSelectSection(section: SectionId) {
    setActiveSection(section);
    setMobileDrawerOpen(false);
  }

  function handleSidebarToggle() {
    if (mobileDrawerOpen) {
      setMobileDrawerOpen(false);
      return;
    }

    setSidebarCollapsed((value) => !value);
  }

  const shellClassName = [
    "argos-shell",
    sidebarCollapsed ? "is-collapsed" : "",
    mobileDrawerOpen ? "is-mobile-drawer-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClassName}>
      <header className="mobile-chat-header">
        <button
          className="mobile-chat-menu-button"
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          aria-label="Abrir menu ARGOS"
        >
          ☰
        </button>

        <button
          className="mobile-chat-title"
          type="button"
          onClick={() => handleSelectSection("master")}
          aria-label="Ir para Mestre"
        >
          <span>ARGOS</span>
          <strong>{activeItem.label}</strong>
        </button>

        <span className="mobile-chat-status" aria-label="ARGOS online">
          ok
        </span>
      </header>

      <button
        className="mobile-drawer-backdrop"
        type="button"
        onClick={() => setMobileDrawerOpen(false)}
        aria-label="Fechar menu"
      />

      <IconRail
        activeSection={activeSection}
        onSelect={handleSelectSection}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
      />

      <Sidebar
        activeSection={activeSection}
        collapsed={sidebarCollapsed}
        onSelect={handleSelectSection}
        onToggle={handleSidebarToggle}
      />

      <main className="argos-main">
        <Topbar activeItem={activeItem} />
        <Workspace activeItem={activeItem}>{renderPanel(activeSection)}</Workspace>
      </main>
    </div>
  );
}
