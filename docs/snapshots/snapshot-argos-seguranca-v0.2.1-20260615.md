# Snapshot ARGOS v0.2.1 - Camada inicial de seguranca

Data: 2026-06-15

## Fase

ARGOS v0.2.1 - Camada inicial de seguranca

## Motivo

Depois do primeiro deploy no Cloudflare Pages, foi decidido que o ARGOS deve nascer com camadas de seguranca desde o inicio.

A aplicacao ainda e um frontend estatico, sem login interno, sem backend e sem usuario de sessao. Por isso, a seguranca inicial foi dividida em duas partes:

1. protecoes estaticas no codigo
2. protecao real de acesso via Cloudflare Access em etapa de painel

## Arquivos criados

- public/_headers
- public/robots.txt
- docs/snapshots/snapshot-argos-seguranca-v0.2.1-20260615.md

## Headers adicionados

O arquivo public/_headers adiciona headers para todas as rotas:

- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: no-referrer
- X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex
- Permissions-Policy restritiva
- Content-Security-Policy inicial

## robots.txt

O arquivo public/robots.txt bloqueia crawling geral:

User-agent: *
Disallow: /

Observacao:

robots.txt nao e camada de seguranca forte. Ele apenas orienta crawlers que respeitam esse padrao. A protecao real deve vir com Cloudflare Access.

## Estado de seguranca apos esta etapa

- Site com headers de seguranca basicos
- Bloqueio contra iframe por X-Frame-Options e frame-ancestors
- Bloqueio de MIME sniffing
- Politica de referer restritiva
- Reducao de permissoes do navegador
- Bloqueio de indexacao via header e robots.txt
- Sem backend
- Sem API paga
- Sem secrets
- Sem login interno

## Proxima camada obrigatoria

Configurar Cloudflare Access no projeto Pages argos-mvp para permitir acesso apenas a emails autorizados.

Email inicial autorizado:

vampnovoagain@gmail.com

## Validacao obrigatoria

Antes de fechar:

- npm run build
- npm run deploy
- validar pagina no Cloudflare
- confirmar git status
- commit
- push
