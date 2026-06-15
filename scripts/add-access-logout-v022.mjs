import { readFileSync, writeFileSync } from "node:fs";

const topbarPath = "src/shell/Topbar.tsx";
let topbar = readFileSync(topbarPath, "utf8");

topbar = topbar.replace(
`        <span className="pill">local</span>
        <span className="pill muted">API paga bloqueada</span>`,
`        <span className="pill">local</span>
        <span className="pill muted">API paga bloqueada</span>
        <a className="logout-link" href="/cdn-cgi/access/logout">Sair</a>`
);

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

const snapshotPath = "docs/snapshots/snapshot-argos-cloudflare-access-v0.2.2-20260615.md";

writeFileSync(snapshotPath, `# Snapshot ARGOS v0.2.2 - Cloudflare Access

Data: 2026-06-15

## Fase

ARGOS v0.2.2 - Cloudflare Access e logout real.

## Objetivo

Adicionar protecao real de acesso antes do carregamento do frontend e disponibilizar uma saida segura usando o endpoint server-side do Cloudflare Access.

## Validacao realizada

A aplicacao passou a pedir login antes de abrir o ARGOS.

Resultado confirmado pelo usuario:

- Cloudflare Access apareceu antes da interface ARGOS
- ARGOS nao abriu direto sem autenticacao
- Policy Allow ARGOS Owner usa email exato
- Email permitido: vampnovoagain@gmail.com

## Policy validada

Policy:

Allow ARGOS Owner

Action:

Allow

Rule:

Include -> Emails -> vampnovoagain@gmail.com

## Authentication

Metodo usado:

One-time PIN

Apply instant authentication:

Ativo

Cloudflare One Client:

Desativado

## Logout

Foi adicionado um botao Sair no frontend apontando para:

/cdn-cgi/access/logout

Importante:

Esse botao nao faz validacao de seguranca no frontend. Ele apenas direciona o navegador para o endpoint real do Cloudflare Access. A sessao e encerrada pela Cloudflare na borda.

## Arquivos alterados

- src/shell/Topbar.tsx
- src/index.css
- docs/snapshots/snapshot-argos-cloudflare-access-v0.2.2-20260615.md

## Regras preservadas

- frontend nao valida seguranca
- autenticacao real fica no Cloudflare Access
- logout real fica no Cloudflare Access
- sem backend ainda
- sem API paga
- sem secrets no frontend
`, "utf8");

console.log("Botao Sair do Cloudflare Access adicionado.");
