# Snapshot ARGOS - Supervisor local com IA sob demanda

Data: 2026-06-15

## Problema

O ARGOS dependia do usuario iniciar manualmente o servidor Ollama e a ponte local.

Isso deixava a experiencia ruim:

- programa aberto, mas IA sem servidor
- usuario precisava descobrir porta/processo
- chat ficava offline ou bloqueado
- havia confusao entre Ollama instalado e Ollama rodando

## Correcao

Foi criado o ARGOS Local Supervisor.

O supervisor roda em:

http://127.0.0.1:8786

Ele nao liga a IA sozinho.

Ao abrir o ARGOS, a tela mostra:

IA local: desligada

Quando o usuario clica em Ligar IA local, o supervisor inicia:

- Ollama 127.0.0.1:11434
- Bridge 127.0.0.1:8787

Depois libera o chat.

## Arquivos criados

- tools/argos-local-supervisor.mjs
- scripts/start-argos-local-supervisor.cmd
- scripts/install-argos-local-supervisor.ps1
- scripts/uninstall-argos-local-supervisor.ps1
- scripts/add-local-supervisor-script.mjs
- scripts/fix-csp-local-supervisor.mjs
- scripts/fix-local-supervisor-ui-css.mjs
- docs/ai-local/local-supervisor.md

## Arquivos alterados

- package.json
- public/_headers
- src/components/MasterChatHome.tsx
- src/index.css

## Regra final

O ARGOS nao acessa IA local automaticamente ao abrir.

O usuario decide quando ligar a IA local.

O supervisor pode iniciar com o Windows, mas apenas fica aguardando comando.
