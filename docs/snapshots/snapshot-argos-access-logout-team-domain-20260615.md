# Snapshot ARGOS - Logout Cloudflare Access via Team Domain

Data: 2026-06-15

## Fase

Ajuste do logout Cloudflare Access.

## Problema observado

O botao Sair apontava para:

/cdn-cgi/access/logout

Esse logout encerrava a sessao da aplicacao, mas o usuario continuava sendo reautenticado automaticamente por sessao global do Cloudflare Access.

## Team domain confirmado

argos-mvp-5sz-pages.cloudflareaccess.com

## Correcao aplicada

O botao Sair passou a apontar para:

https://argos-mvp-5sz-pages.cloudflareaccess.com/cdn-cgi/access/logout

## Objetivo

Forcar logout pelo dominio do time Cloudflare Access, removendo a sessao global/SSO usada para reautenticacao automatica.

## Arquivos alterados

- src/shell/Topbar.tsx
- scripts/fix-access-team-logout.mjs
- docs/snapshots/snapshot-argos-access-logout-team-domain-20260615.md

## Validacao esperada

1. Clicar em Sair.
2. Cloudflare Access encerra sessao pelo team domain.
3. Aguardar alguns segundos.
4. Abrir https://argos-mvp-5sz.pages.dev.
5. ARGOS deve exigir login novamente.

## Observacao

O tempo de sessao nao foi reduzido. A sessao longa continua adequada para o fluxo de trabalho do usuario.
