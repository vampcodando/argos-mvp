import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const COMPONENT_PATH = path.join(ROOT, "src", "components", "MasterChatHome.tsx");
const MOBILE_CSS_PATH = path.join(ROOT, "src", "mobile.css");
const REQUIRED_MARKER = "ARGOS_MEDIA_POOL_FRONTEND_V1";
const FIX_MARKER = "ARGOS_MEDIA_POOL_MOBILE_DRAWER_FIX_V1";

function fail(message) {
  console.error(`\n[ARGOS MEDIA MOBILE] ERRO: ${message}\n`);
  process.exit(1);
}

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Arquivo não encontrado: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function replaceOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first < 0) {
    fail(`Âncora não encontrada (${label}). Nenhum arquivo foi gravado.`);
  }
  const second = source.indexOf(anchor, first + anchor.length);
  if (second >= 0) {
    fail(`Âncora duplicada (${label}). Nenhum arquivo foi gravado.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

const originalComponent = read(COMPONENT_PATH);
const originalMobileCss = read(MOBILE_CSS_PATH);

if (!originalComponent.includes(REQUIRED_MARKER) || !originalMobileCss.includes(REQUIRED_MARKER)) {
  fail("Frontend Media Pool V1 não foi encontrado. Execute primeiro apply-media-pool-frontend-v1.mjs.");
}

if (originalComponent.includes(FIX_MARKER) && originalMobileCss.includes(FIX_MARKER)) {
  console.log("[ARGOS MEDIA MOBILE] Correção já aplicada. Nenhuma alteração necessária.");
  process.exit(0);
}

if (originalComponent.includes(FIX_MARKER) || originalMobileCss.includes(FIX_MARKER)) {
  fail("Correção parcial detectada. Restaure o backup antes de executar novamente.");
}

let component = originalComponent;

component = replaceOnce(
  component,
  `<section className="master-chat-home" aria-label="Painel do ARGOS">`,
  `<section\n      className={\`master-chat-home \${mediaPanelOpen ? "is-media-drawer-open" : ""}\`}\n      aria-label="Painel do ARGOS"\n      data-media-mobile-fix="${FIX_MARKER}"\n    >`,
  "classe do painel principal"
);

component = replaceOnce(
  component,
  `            onClick={handleClearChat}\n            disabled={sending}\n          >\n            limpar conversa\n          </button>`,
  `            onClick={handleClearChat}\n            disabled={sending}\n          >\n            <span className="master-clear-label-desktop">limpar conversa</span>\n            <span className="master-clear-label-mobile">limpar</span>\n          </button>`,
  "rótulo responsivo do botão limpar"
);

const css = `\n\n/* ${FIX_MARKER} START */\n.master-clear-label-mobile {\n  display: none;\n}\n\n@media (max-width: 820px), ((max-width: 1024px) and (pointer: coarse)) {\n  /* O composer cresce no fluxo normal; nada fica recortado por uma rolagem interna. */\n  .master-chat-composer {\n    max-height: none !important;\n    overflow: visible !important;\n    overscroll-behavior: auto !important;\n  }\n\n  /* Ao abrir a gaveta de mídia, o hero cede espaço em vez de competir com o composer. */\n  .master-chat-home.is-media-drawer-open .master-chat-center {\n    display: none !important;\n  }\n\n  .master-chat-home.is-media-drawer-open .master-chat-history {\n    min-height: 0 !important;\n    padding-top: 0 !important;\n  }\n\n  .master-chat-home.is-media-drawer-open .master-chat-composer textarea {\n    min-height: 3.6rem !important;\n    max-height: 6rem !important;\n  }\n\n  /* A linha superior fica limpa: arquivo + mídia. O texto longo não ocupa a tela móvel. */\n  .master-attachment-controls {\n    grid-template-columns: 1fr 1fr !important;\n    gap: 0.45rem !important;\n    align-items: center !important;\n  }\n\n  .master-attachment-help {\n    display: none !important;\n  }\n\n  .master-attachment-button {\n    width: 100%;\n    min-width: 0;\n    white-space: nowrap;\n  }\n\n  /* Media Pool funciona como gaveta inline compacta, nunca como modal/overlay. */\n  .master-media-panel {\n    position: static !important;\n    width: 100% !important;\n    max-width: 100% !important;\n    max-height: none !important;\n    margin: 0.45rem 0 !important;\n    padding: 0.62rem !important;\n    gap: 0.5rem !important;\n    overflow: visible !important;\n    box-sizing: border-box !important;\n  }\n\n  .master-media-panel-head {\n    align-items: center !important;\n  }\n\n  .master-media-panel-head > div {\n    gap: 0 !important;\n  }\n\n  .master-media-panel-head > div > span,\n  .master-media-hint {\n    display: none !important;\n  }\n\n  .master-media-close {\n    width: 34px !important;\n    height: 34px !important;\n    min-width: 34px !important;\n  }\n\n  .master-media-tabs {\n    gap: 0.4rem !important;\n  }\n\n  .master-media-tabs button {\n    min-height: 40px;\n    padding: 0.42rem 0.55rem !important;\n  }\n\n  .master-media-options,\n  .master-media-options-image {\n    grid-template-columns: 1fr !important;\n    gap: 0.42rem !important;\n  }\n\n  .master-media-options label {\n    min-width: 0 !important;\n    gap: 0.3rem !important;\n  }\n\n  .master-media-options select {\n    min-height: 40px !important;\n    width: 100% !important;\n    min-width: 0 !important;\n    box-sizing: border-box !important;\n  }\n\n  /* Barra inferior em uma única linha: limpar | modo | enviar. */\n  .master-chat-toolbar {\n    display: grid !important;\n    grid-template-columns: auto minmax(0, 1fr) 42px !important;\n    grid-template-rows: 42px !important;\n    align-items: center !important;\n    gap: 0.45rem !important;\n    width: 100% !important;\n  }\n\n  .master-chat-toolbar > .local-ai-connect-button {\n    grid-column: 1 !important;\n    grid-row: 1 !important;\n    width: auto !important;\n    min-width: 0 !important;\n    max-width: 84px !important;\n    height: 38px !important;\n    padding: 0 0.62rem !important;\n    white-space: nowrap !important;\n    justify-self: start !important;\n  }\n\n  .chat-mode-toggle {\n    grid-column: 2 !important;\n    grid-row: 1 !important;\n    width: auto !important;\n    min-width: 0 !important;\n    max-width: 100% !important;\n    justify-self: end !important;\n  }\n\n  .chat-send-button,\n  .chat-send-button-cancel {\n    grid-column: 3 !important;\n    grid-row: 1 !important;\n    width: 42px !important;\n    height: 42px !important;\n    min-width: 42px !important;\n    justify-self: end !important;\n  }\n\n  .master-clear-label-desktop {\n    display: none !important;\n  }\n\n  .master-clear-label-mobile {\n    display: inline !important;\n  }\n}\n\n/* Em telas muito estreitas, cada opção volta a empilhar para evitar aperto. */\n@media (min-width: 360px) and (max-width: 820px) {\n  .master-media-options label {\n    grid-template-columns: 78px minmax(0, 1fr) !important;\n    align-items: center !important;\n    gap: 0.5rem !important;\n  }\n\n  .master-media-options-image label {\n    grid-template-columns: 78px minmax(0, 1fr) !important;\n  }\n}\n/* ${FIX_MARKER} END */\n`;

const mobileCss = originalMobileCss.trimEnd() + css + "\n";

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(ROOT, "backups", `media-pool-mobile-drawer-fix-v1-${timestamp}`);
fs.mkdirSync(backupDir, { recursive: true });
fs.writeFileSync(path.join(backupDir, "MasterChatHome.tsx"), originalComponent, "utf8");
fs.writeFileSync(path.join(backupDir, "mobile.css"), originalMobileCss, "utf8");

fs.writeFileSync(COMPONENT_PATH, component, "utf8");
fs.writeFileSync(MOBILE_CSS_PATH, mobileCss, "utf8");

console.log("[ARGOS MEDIA MOBILE] Gaveta mobile corrigida com sucesso.");
console.log(`[ARGOS MEDIA MOBILE] Backup local: ${path.relative(ROOT, backupDir)}`);
console.log("[ARGOS MEDIA MOBILE] Ajustes: textos compactos, hero recolhível, toolbar em 1 linha e sem scroll interno no composer.");
console.log("[ARGOS MEDIA MOBILE] Próximo passo: npm run build");
