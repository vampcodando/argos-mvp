# ARGOS - Local AI Bridge

Data: 2026-06-15

## Objetivo

Criar uma ponte local segura entre o frontend ARGOS e o Ollama local.

## Arquitetura

Navegador ARGOS
-> http://127.0.0.1:8787/local-ai/*
-> http://127.0.0.1:11434/api/*
-> Ollama

## Modelos permitidos

- qwen2.5:3b
- qwen2.5-coder:7b

## Endpoint local

Ponte ARGOS:

http://127.0.0.1:8787

Rotas:

- GET /local-ai/health
- GET /local-ai/models
- POST /local-ai/chat

## Limites

- Prompt maximo: 2000 caracteres
- Payload maximo: 8192 bytes
- Apenas modelos em allowlist
- Sem streaming nesta fase
- Temperatura baixa: 0.1
- Limite de resposta: 512 tokens previstos

## Bloqueios

A ponte local nao executa:

- comandos
- escrita em arquivos
- deploy
- git push
- API paga
- acesso a segredos

## Como iniciar

Terminal 1:

ollama deve estar ativo em 127.0.0.1:11434

Terminal 2:

npm run local:ollama-bridge

Terminal 3:

npm run dev

## Uso em producao Cloudflare

A pagina oficial do ARGOS pode chamar a ponte local do navegador do usuario em:

http://127.0.0.1:8787

Isso so funciona na maquina onde a ponte local esta rodando.

## Seguran?a

A protecao de acesso continua sendo Cloudflare Access na borda.

A ponte local aceita somente origens permitidas:

- http://127.0.0.1:5173
- http://localhost:5173
- https://argos-mvp-5sz.pages.dev
- subdominios HTTPS de argos-mvp-5sz.pages.dev

A IA local nao tem autoridade operacional.
