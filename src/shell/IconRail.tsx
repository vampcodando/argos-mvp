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

