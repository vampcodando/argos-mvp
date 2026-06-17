# Snapshot ARGOS v0.5.0 - Policy Engine local vs cloud

Data: 2026-06-16 22:59:39

## Implementado

Módulo interno de catálogo de motores e Policy Engine de privacidade/roteamento.

## Sem alteração visual

- Não altera a home do Mestre.
- Não altera CSS.
- Não adiciona painel na interface.
- Não faz deploy.
- Não conecta API paga.

## Arquivos adicionados

- src/modules/policy/argosEngineCatalog.ts
- src/modules/policy/argosPolicyEngine.ts
- src/modules/policy/index.ts
- docs/ai-local/policy-engine-local-vs-cloud-v0.5.0.md
- docs/snapshots/snapshot-argos-policy-engine-v0.5.0-20260616.md

## Regras

- Serviço Social, Alojamento/Celeiro e institucional interno: somente local.
- Dados de atletas, familiares, pareceres, documentos, banco, tokens, logs e código sensível: cloud bloqueada.
- Marketing, Bruna, BigBoom, QualyShape, TikTok e UGC: cloud apenas futuramente, com aprovação explícita.
- APIs pagas seguem desabilitadas nesta fase.

## Próxima etapa

Gerenciador de Modelos Ollama.
