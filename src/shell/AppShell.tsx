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

