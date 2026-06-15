import { readFileSync, writeFileSync } from "node:fs";

const cssPath = "src/index.css";
let css = readFileSync(cssPath, "utf8");

if (!css.includes(".local-ai-connect-button")) {
  css += `

.local-ai-connect-button {
  border: 1px solid color-mix(in srgb, var(--accent) 42%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--text);
  border-radius: 999px;
  padding: 0.34rem 0.72rem;
  font-family: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.local-ai-connect-button:hover:not(:disabled) {
  border-color: var(--accent);
}

.local-ai-connect-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
`;
}

writeFileSync(cssPath, css, "utf8");
console.log("CSS do botao conectar IA local aplicado.");
