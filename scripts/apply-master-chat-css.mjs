import { readFileSync, writeFileSync } from "node:fs";

const cssPath = "src/index.css";
let css = readFileSync(cssPath, "utf8");

if (!css.includes(".master-chat-home")) {
  css += `

.master-chat-home {
  position: relative;
  min-height: calc(100vh - 190px);
  display: grid;
  grid-template-rows: 1fr auto auto;
  gap: 18px;
  padding: 26px;
}

.master-chat-center {
  display: grid;
  place-items: center;
  align-content: center;
  min-height: 310px;
  text-align: center;
  color: var(--muted);
}

.master-orb {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: var(--red);
  border: 1px solid color-mix(in srgb, var(--red) 45%, transparent);
  background: color-mix(in srgb, var(--red) 10%, transparent);
  box-shadow: 0 0 34px color-mix(in srgb, var(--red) 16%, transparent);
  font-weight: 800;
  letter-spacing: 0.1em;
  margin-bottom: 12px;
}

.master-chat-center h2 {
  margin: 0;
  color: var(--red);
  font-size: clamp(34px, 4vw, 58px);
  letter-spacing: 0.12em;
}

.master-chat-center p {
  margin: 8px 0 0;
  font-size: 14px;
}

.master-chat-flags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
}

.master-chat-flags span {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 5px 9px;
  background: color-mix(in srgb, var(--panel) 84%, transparent);
  font-size: 11px;
}

.master-chat-history {
  display: grid;
  gap: 8px;
  max-width: 820px;
  width: min(820px, 100%);
  margin: 0 auto;
}

.master-chat-message {
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel) 84%, transparent);
  padding: 10px 12px;
}

.master-chat-message span {
  display: block;
  color: var(--red);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  margin-bottom: 5px;
}

.master-chat-message p {
  margin: 0;
  color: var(--fg);
  font-size: 13px;
  line-height: 1.5;
}

.master-chat-message-user {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
}

.master-chat-composer {
  max-width: 820px;
  width: min(820px, 100%);
  margin: 0 auto;
  border: 1px solid var(--border);
  background: color-mix(in srgb, #000 42%, var(--panel));
  border-radius: 18px;
  box-shadow: 0 18px 70px rgba(0, 0, 0, 0.24);
  padding: 10px;
}

.master-chat-composer textarea {
  width: 100%;
  resize: none;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--fg);
  min-height: 64px;
  font: inherit;
  padding: 8px;
}

.master-chat-composer textarea::placeholder {
  color: var(--muted);
}

.master-chat-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-picker-wrap {
  position: relative;
}

.model-add-button,
.chat-send-button {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 88%, var(--bg));
  color: var(--fg);
  cursor: pointer;
  font-weight: 800;
}

.model-add-button:hover,
.chat-send-button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.model-popover {
  position: absolute;
  left: 0;
  bottom: 44px;
  width: min(390px, calc(100vw - 70px));
  border: 1px solid var(--border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel) 94%, #000);
  box-shadow: 0 18px 80px rgba(0, 0, 0, 0.34);
  padding: 10px;
  z-index: 20;
}

.model-popover-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 4px 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
}

.model-popover-head strong {
  color: var(--fg);
}

.model-popover-head small {
  color: var(--muted);
}

.model-list {
  display: grid;
  gap: 8px;
  padding-top: 9px;
}

.model-option {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 10px;
  text-align: left;
  border: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg) 42%, transparent);
  color: var(--fg);
  padding: 9px;
  cursor: pointer;
}

.model-option:hover,
.model-option-active {
  border-color: var(--accent);
}

.model-option-main {
  display: grid;
  gap: 3px;
}

.model-option-main strong {
  color: var(--fg);
}

.model-option-main small,
.model-option em {
  color: var(--muted);
  font-size: 11px;
}

.model-option em {
  grid-column: 1 / -1;
  font-style: normal;
}

.model-chip {
  align-self: start;
  border-radius: 999px;
  padding: 3px 7px;
  border: 1px solid var(--border);
  font-size: 10px;
}

.model-chip-preferred {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
}

.model-chip-heavy {
  color: var(--red);
  border-color: color-mix(in srgb, var(--red) 48%, var(--border));
}

.model-add-future {
  width: 100%;
  margin-top: 9px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  padding: 8px;
}

.selected-model-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 42%, var(--border));
  border-radius: 999px;
  color: var(--accent);
  padding: 5px 9px;
  font-size: 11px;
}

.selected-model-pill small {
  color: var(--muted);
}

.chat-mode-toggle {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px;
  color: var(--muted);
  font-size: 11px;
}

.chat-mode-toggle span,
.chat-mode-toggle strong {
  border-radius: 999px;
  padding: 3px 8px;
}

.chat-mode-toggle strong {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--fg);
}

.chat-send-button {
  color: var(--red);
  border-color: color-mix(in srgb, var(--red) 48%, var(--border));
}

@media (max-width: 760px) {
  .master-chat-home {
    padding: 16px;
    min-height: calc(100vh - 160px);
  }

  .selected-model-pill small {
    display: none;
  }

  .master-chat-toolbar {
    flex-wrap: wrap;
  }

  .chat-mode-toggle {
    margin-left: 0;
  }
}
`;
}

writeFileSync(cssPath, css, "utf8");
console.log("CSS do Master Chat aplicado.");
