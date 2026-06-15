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

