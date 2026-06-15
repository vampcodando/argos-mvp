import { readFileSync, writeFileSync } from "node:fs";

const topbarPath = "src/shell/Topbar.tsx";
let topbar = readFileSync(topbarPath, "utf8");

if (!topbar.includes("../components/BackendHealthBadge")) {
  topbar = topbar.replace(
    `import type { NavItem } from "../app/navigation";`,
    `import type { NavItem } from "../app/navigation";
import { BackendHealthBadge } from "../components/BackendHealthBadge";`
  );
}

if (!topbar.includes("<BackendHealthBadge />")) {
  topbar = topbar.replace(
    `<span className="pill muted">API paga bloqueada</span>`,
    `<span className="pill muted">API paga bloqueada</span>
        <BackendHealthBadge />`
  );
}

writeFileSync(topbarPath, topbar, "utf8");

const cssPath = "src/index.css";
let css = readFileSync(cssPath, "utf8");

if (!css.includes(".backend-health")) {
  css += `

.backend-health {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 11px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 82%, var(--bg));
  color: var(--muted);
  white-space: nowrap;
}

.backend-health-online {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.backend-health-checking {
  color: var(--muted);
}

.backend-health-offline {
  color: var(--red);
  border-color: color-mix(in srgb, var(--red) 45%, var(--border));
  background: color-mix(in srgb, var(--red) 10%, transparent);
}
`;
}

writeFileSync(cssPath, css, "utf8");

console.log("ARGOS v0.3.0 backend health badge aplicado.");
