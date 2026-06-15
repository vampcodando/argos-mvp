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

