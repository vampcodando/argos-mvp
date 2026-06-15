import { readFileSync, writeFileSync } from "node:fs";

const cssPath = "src/index.css";
let css = readFileSync(cssPath, "utf8");

if (!css.includes(".local-ai-status")) {
  css += `

.local-ai-status-online {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border)) !important;
  background: color-mix(in srgb, var(--accent) 10%, transparent) !important;
}

.local-ai-status-offline,
.local-ai-status-checking {
  color: var(--red);
  border-color: color-mix(in srgb, var(--red) 48%, var(--border)) !important;
  background: color-mix(in srgb, var(--red) 9%, transparent) !important;
}

.master-chat-message-error {
  border-color: color-mix(in srgb, var(--red) 58%, var(--border));
}

.master-chat-message-error p {
  color: var(--red);
}

.master-chat-message-loading p {
  color: var(--muted);
}

.chat-send-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
`;
}

writeFileSync(cssPath, css, "utf8");
console.log("CSS de IA local aplicado.");
