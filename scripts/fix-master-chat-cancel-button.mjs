import { readFileSync, writeFileSync } from "node:fs";

const cssPath = "src/index.css";
let css = readFileSync(cssPath, "utf8");

if (!css.includes(".chat-send-button-cancel")) {
  css += `

.chat-send-button-cancel {
  color: var(--red);
  border-color: color-mix(in srgb, var(--red) 52%, var(--border));
  background: color-mix(in srgb, var(--red) 12%, transparent);
}
`;
}

writeFileSync(cssPath, css, "utf8");
console.log("CSS do botao cancelar aplicado.");
