# Snapshot ARGOS v0.2 - Inicio

Data: 2026-06-15

## Fase

ARGOS v0.2 - Estado operacional local

## Objetivo

Transformar o shell visual do ARGOS em um painel operacional local, ainda sem backend, sem API paga e sem execucao real de comandos.

## Escopo aplicado

- criar estado local mockado
- alimentar paineis com dados locais
- exibir missoes com status
- exibir agentes com permissoes e bloqueios
- exibir modelos com status e aprovacao
- exibir console com eventos locais
- exibir auditoria com evidencias locais

## Arquivos principais previstos

- src/state/argosOperationalState.ts
- src/components/StatusBadge.tsx
- src/components/SectionCard.tsx
- src/modules/master/MasterPanel.tsx
- src/modules/agents/AgentsPanel.tsx
- src/modules/missions/MissionsPanel.tsx
- src/modules/canvas/CanvasPanel.tsx
- src/modules/console/ConsolePanel.tsx
- src/modules/models/ModelsPanel.tsx
- src/modules/audit/AuditPanel.tsx
- src/index.css

## Regras preservadas

- sem API paga
- sem backend
- sem execucao real
- sem deploy
- sem comandos destrutivos
- aprovacao humana obrigatoria antes de qualquer acao perigosa

## Validacao obrigatoria

Antes do commit:

npm run build

Depois do commit:

git status
git push

