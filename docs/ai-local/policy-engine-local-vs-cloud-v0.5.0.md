# ARGOS - Policy Engine local vs cloud v0.5.0

## Objetivo

Criar a primeira versão interna do motor de decisão de privacidade e roteamento do ARGOS.

Esta etapa não altera a interface, não conecta API paga, não instala modelos e não inicia laboratório de vídeo.

## Arquivos

- `src/modules/policy/argosEngineCatalog.ts`
- `src/modules/policy/argosPolicyEngine.ts`
- `src/modules/policy/index.ts`

## Regra central

Projetos e dados sensíveis:

- Serviço Social
- Alojamento/Celeiro
- sistemas internos
- dados de atletas
- dados familiares
- pareceres sociais
- documentos institucionais
- bancos de dados
- tokens/secrets/logs/código sensível

Resultado:

- cloud bloqueada;
- API externa bloqueada;
- apenas motor local permitido.

Marketing e conteúdo público:

- Bruna
- BigBoom
- QualyShape
- TikTok
- UGC
- campanhas de venda
- prompts criativos
- imagem/vídeo de marketing

Resultado:

- local permitido;
- cloud pode ser analisada futuramente;
- APIs pagas continuam desabilitadas nesta fase;
- uso cloud exige aprovação explícita.

## Próxima etapa

Preparar o Gerenciador de Modelos Ollama.
