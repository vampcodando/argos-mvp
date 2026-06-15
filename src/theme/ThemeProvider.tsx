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

