# Snapshot ARGOS v0.4.2 - Chat conectado ao Ollama local

Data: 2026-06-15

## Fase concluida

Conexao controlada do chat visual do Mestre com Ollama local via ponte local segura.

## Objetivo

Permitir que o ARGOS converse com os dois modelos locais ja baixados, sem API paga e sem liberar execucao real.

## Modelos conectados

- qwen2.5:3b
- qwen2.5-coder:7b

## Arquitetura

ARGOS no navegador
-> ponte local 127.0.0.1:8787
-> Ollama 127.0.0.1:11434

## Arquivos criados

- tools/argos-local-ollama-bridge.mjs
- scripts/add-local-ollama-bridge-script.mjs
- scripts/apply-local-ai-chat-css.mjs
- docs/ai-local/local-ai-bridge.md
- docs/snapshots/snapshot-argos-local-ai-chat-v0.4.2-20260615.md

## Arquivos alterados

- package.json
- src/components/MasterChatHome.tsx
- src/index.css

## Rotas locais

- GET /local-ai/health
- GET /local-ai/models
- POST /local-ai/chat

## Controles de seguranca

- allowlist de modelos
- allowlist de origens
- prompt maximo de 2000 caracteres
- payload maximo de 8192 bytes
- temperatura baixa
- resposta limitada
- sem streaming
- sem executor
- sem escrita em arquivo
- sem deploy
- sem API paga

## Estado esperado

Com Ollama ativo e a ponte local rodando, a aba Mestre deve mostrar:

ponte local: online

O bot?o + deve listar:

- qwen2.5:3b
- qwen2.5-coder:7b

O envio da mensagem deve consultar o modelo selecionado e retornar resposta no chat.

## Observacao

A ponte local so funciona na maquina do usuario, pois usa 127.0.0.1.

Cloudflare Pages nao acessa diretamente o Ollama local; quem acessa e o navegador do usuario por meio da ponte local.
