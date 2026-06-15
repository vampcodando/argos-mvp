import { readFileSync, writeFileSync } from "node:fs";

const topbarPath = "src/shell/Topbar.tsx";
let topbar = readFileSync(topbarPath, "utf8");

if (!topbar.includes("logout-link")) {
  topbar = topbar.replace(
    `<label className="theme-select-label">`,
    `<a className="logout-link" href="/cdn-cgi/access/logout">Sair</a>

        <label className="theme-select-label">`
  );
}

writeFileSync(topbarPath, topbar, "utf8");

const cssPath = "src/index.css";
let css = readFileSync(cssPath, "utf8");

if (!css.includes(".logout-link")) {
  css += `

.logout-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--red);
  text-decoration: none;
  border: 1px solid color-mix(in srgb, var(--red) 42%, var(--border));
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 11px;
  background: color-mix(in srgb, var(--red) 8%, transparent);
}

.logout-link:hover {
  background: color-mix(in srgb, var(--red) 16%, transparent);
}
`;
}

writeFileSync(cssPath, css, "utf8");

console.log("Botao Sair garantido no Topbar.");
