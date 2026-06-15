# Snapshot ARGOS - Cloudflare Access raiz protegido

Data: 2026-06-15

## Fase

Corre??o cr?tica de cobertura do Cloudflare Access.

## Problema identificado

A aplica??o Access protegia apenas:

*.argos-mvp-5sz.pages.dev

Isso protegia URLs de deploy/hash, mas n?o protegia a URL oficial raiz:

https://argos-mvp-5sz.pages.dev

Evid?ncia antes da corre??o:

curl -I https://argos-mvp-5sz.pages.dev

Resultado anterior:

HTTP/1.1 200 OK

Conclus?o:

A URL oficial estava p?blica e fora da prote??o do Cloudflare Access.

## Corre??o aplicada no Cloudflare Zero Trust

Na aplica??o Access ARGOS Production, foram configurados dois public hostnames:

1. Wildcard para deploys/hash:

Subdomain: *
Domain: argos-mvp-5sz.pages.dev
Path: vazio

2. Raiz oficial:

Subdomain: vazio
Domain: argos-mvp-5sz.pages.dev
Path: vazio

## Evid?ncia ap?s corre??o

Teste da URL oficial:

curl -I https://argos-mvp-5sz.pages.dev

Resultado:

HTTP/1.1 302 Found
Www-Authenticate: Cloudflare-Access
Location: https://argos-mvp-5sz-pages.cloudflareaccess.com/...

Teste da URL hash/deploy:

curl -I https://956f1da5.argos-mvp-5sz.pages.dev

Resultado:

HTTP/1.1 302 Found
Www-Authenticate: Cloudflare-Access
Location: https://argos-mvp-5sz-pages.cloudflareaccess.com/...

## Conclus?o

A URL oficial e as URLs de deploy/hash agora est?o dentro da cerca do Cloudflare Access.

O problema n?o era logout, React, cache ou sess?o persistida.

O problema era cobertura incompleta do Access.

## Regra refor?ada

Seguran?a do ARGOS n?o pode depender de frontend.

A prote??o real deve ficar na borda/backend/server-side.

## Estado ap?s corre??o

- URL oficial protegida
- URLs hash/deploy protegidas
- Access retorna 302 sem sess?o
- frontend continua sem autoridade de seguran?a
- API paga continua bloqueada
- executor continua bloqueado
