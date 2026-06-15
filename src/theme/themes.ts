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

