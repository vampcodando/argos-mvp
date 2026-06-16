# ARGOS Local Supervisor

Data: 2026-06-15

## Objetivo

Corrigir a experiencia da IA local no Windows.

O usuario nao deve precisar iniciar manualmente:

- ollama serve
- ponte local
- terminal extra

## Decisao

O ARGOS nao liga a IA automaticamente ao abrir.

Ao abrir, a interface mostra:

IA local: desligada

O usuario precisa clicar em:

Ligar IA local

Somente apos esse clique o supervisor local inicia:

- Ollama em 127.0.0.1:11434
- Bridge em 127.0.0.1:8787

## Supervisor

Endpoint:

http://127.0.0.1:8786

Rotas:

- GET /local-supervisor/status
- POST /local-supervisor/start-ai
- POST /local-supervisor/stop-ai

## Seguran?a

O supervisor nao executa comandos arbitrarios.

Ele somente controla os processos locais previstos:

- ollama serve
- tools/argos-local-ollama-bridge.mjs

A IA continua sem permissao para:

- executar comandos
- escrever arquivos
- fazer deploy
- usar API paga

## Autostart

O supervisor pode iniciar com o Windows, mas nao liga IA automaticamente.

Ele funciona como porteiro local aguardando comando do usuario.
