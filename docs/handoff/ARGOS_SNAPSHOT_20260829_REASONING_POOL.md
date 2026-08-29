# ARGOS — Snapshot completo para retomada
Data: 2026-08-29
Projeto: ARGOS MVP
Repositório: vampcodando/argos-mvp
Branch de segurança: backup/reasoning-pool-multimodel-20260829
Commit de segurança: c6649f6 — Salva Reasoning Pool remoto e multi-model

## 1. Estado atual validado

O Reasoning Pool remoto foi implementado e testado em produção com três modelos:

- MiniMax M3 via OpenRouter Free
- GLM 5.2 via OpenRouter Free
- Gemini 2.5 Flash via Google Free Tier

O DeepSeek V4 Flash 0731 permanece somente LOCAL via OmniRoute → CFP / Cloudflare AI Playground.

A arquitetura atual mantém o computador de casa como nó opcional. Ele NÃO é servidor e não recebe conexões da Internet. As capacidades remotas do ARGOS continuam funcionando mesmo com o computador de casa desligado.

## 2. Reasoning Pool remoto

### Modelos e papéis atuais

1. MiniMax M3
   - Supervisor principal preferido.
   - Raciocínio geral.
   - Arquitetura.
   - Coding.
   - Contexto longo.
   - Qualidade de respostas aprovada pelo usuário.

2. GLM 5.2
   - Especialista preferencial de coding/debug.
   - Atualmente retorna repetidamente OpenRouter 429.
   - NÃO foi considerado deprecated.
   - Deve ser tratado como rota possivelmente limitada/temporariamente indisponível.

3. Gemini 2.5 Flash
   - Google Free Tier direto.
   - Síntese.
   - Resumos.
   - Generalista.
   - Provedor independente do OpenRouter.

## 3. Roteamento automático implementado

### Coding / Debug
GLM 5.2 → MiniMax M3 → Gemini 2.5 Flash

### Reasoning / Arquitetura / Decisão
MiniMax M3 → GLM 5.2 → Gemini 2.5 Flash

### Fast / Resumo / Formatação
Gemini 2.5 Flash → MiniMax M3 → GLM 5.2

O backend devolve telemetria real:
- routingMode
- taskType
- routingDecision
- modelKey
- modelName
- provider
- attempts
- fallbackUsed

## 4. Multi-model real implementado

Arquivo central:
functions/api/reasoning/chat.js

Foi implementado modo multi-model com detecção automática de tarefas que exijam simultaneamente:
- código
- arquitetura/reasoning
- síntese
- intenção explícita multiperspectiva / por etapas

Também existe `forceMultiModel: true` para teste controlado.

### Fluxo multi-model atual

CODING
GLM 5.2 → MiniMax M3 → Gemini

REASONING / ARQUITETURA
MiniMax M3 → GLM 5.2 → Gemini

SÍNTESE
Gemini 2.5 Flash → MiniMax M3 → GLM 5.2

### Teste empírico comprovado

Resultado:
- status: 200
- routingMode: multi-model
- specialists: 3
- attempts: 4
- fallbackUsed: true

Chamadas reais registradas:

1. coding
   - GLM 5.2 / OpenRouter
   - falhou com 429
   - ~0,49 s

2. coding fallback
   - MiniMax M3 / OpenRouter
   - sucesso
   - ~29 s

3. reasoning
   - MiniMax M3 / OpenRouter
   - sucesso
   - ~26 s

4. synthesis
   - Gemini 2.5 Flash / Google
   - sucesso
   - ~25 s

Foi também comprovado que o modo multi-model é detectado automaticamente sem `forceMultiModel`.

## 5. Interface

A UI foi migrada para o Reasoning Pool remoto em `/api/reasoning`.

O endpoint legado `/api/ai/chat` permanece para visão/mídia até a futura implementação do Media Pool.

Foi instalado Markdown rendering:
- react-markdown
- remark-gfm

As respostas do ARGOS agora suportam corretamente:
- títulos
- listas
- tabelas
- blocos de código
- inline code
- blockquotes
- separadores
- Markdown estruturado

Não foi habilitado `rehypeRaw`.

O usuário aprovou fortemente o estilo de resposta técnica estruturada em Markdown.

## 6. Segurança e políticas atuais

Regras centrais:

- ARGOS mantém autoridade.
- Modelos não recebem autoridade de segurança.
- LLM propõe; ARGOS valida.
- Fail closed.
- Sem fallback pago.
- Somente modelos/rotas gratuitas aprovadas.
- Sem envio de dados sensíveis para cloud.
- Project Context remoto somente sanitizado.
- Sem Project Memory local bruta, arquivos locais, paths, credenciais ou DB para provedores remotos.
- Outputs de especialistas multi-model são tratados como entrada analítica não confiável na síntese.
- Home PC não é servidor.
- Sem Cloudflare Tunnel, port forwarding ou exposição pública de portas locais.

## 7. Problema arquitetural identificado

MiniMax e GLM usam atualmente a MESMA conta OpenRouter.

Isso significa que existem dois cenários diferentes:

### Falha por modelo/provedor
Exemplo:
GLM retorna 429 upstream.
Nesse caso MiniMax pode continuar funcionando.

### Limite global da conta OpenRouter
Quando a quota Free da conta é atingida, GLM e MiniMax podem parar simultaneamente, porque ambos dependem da mesma conta/provedor.

Isso é um risco importante para tarefas longas e para multi-model, porque uma única tarefa pode gerar várias chamadas OpenRouter.

O GLM retornando 429 repetidamente também pode desperdiçar tentativas/quota.

## 8. Próxima etapa PRIORITÁRIA

A próxima etapa NÃO é substituir o MiniMax.

O usuário está muito satisfeito com a qualidade das respostas do MiniMax M3.

### Objetivo principal

MANTER O MINIMAX M3 COMO SUPERVISOR PRINCIPAL DO ARGOS e reduzir a dependência do OpenRouter.

### Pesquisa prioritária

Encontrar e testar provedores GRATUITOS e independentes do OpenRouter que possam fornecer:

1. MiniMax M3 diretamente ou por outra rota gratuita;
2. se não houver, provedores gratuitos independentes com modelos fortes de backup;
3. quotas independentes para evitar falha conjunta.

### Estratégia desejada

ARGOS
├── MiniMax M3 — provedor gratuito independente A
├── MiniMax M3 — OpenRouter Free como rota adicional/fallback
├── Gemini 2.5 Flash — Google Free Tier
├── outro especialista — provedor gratuito independente
└── DeepSeek V4 Flash 0731 — LOCAL via OmniRoute/CFP

O objetivo é criar redundância de PROVEDOR e não apenas redundância de MODELO.

## 9. Circuit breaker — próxima implementação técnica

Antes/depois da diversificação de provedores, implementar:

### Circuit breaker por modelo

Se GLM retornar 429 repetidamente:
- marcar GLM como temporariamente limitado;
- pular novas tentativas por um período de cooldown;
- depois permitir reteste automático.

Exemplo:
GLM 429
→ cooldown ~15 min
→ coding usa MiniMax/Gemini
→ após cooldown testa GLM novamente.

### Circuit breaker por provedor

Distinguir:
- 429 específico de modelo/provider upstream
- 429 global da conta OpenRouter

Se o OpenRouter estiver globalmente limitado:
- suspender temporariamente TODAS as rotas OpenRouter;
- seguir direto para Google/outros provedores independentes.

Estados desejados:
- healthy
- model_rate_limited
- provider_rate_limited
- unavailable
- deprecated
- cooldown

## 10. Automação criada

Foi criada uma automação para monitorar o GLM 5.2 Free.

Objetivo:
- verificar disponibilidade da rota `z-ai/glm-5.2:free`;
- avisar apenas em mudança relevante;
- especialmente se parar de retornar 429;
- ficar indisponível/deprecated;
- mudar status Free;
- apresentar mudança significativa de disponibilidade.

## 11. Git / ponto de restauração

Branch:
backup/reasoning-pool-multimodel-20260829

Commit:
c6649f6 Salva Reasoning Pool remoto e multi-model

Arquivos versionados nesse backup:
- functions/api/reasoning/chat.js
- functions/api/reasoning/health.js
- package.json
- package-lock.json
- src/components/MasterChatHome.tsx
- src/index.css

Arquivos locais deliberadamente NÃO versionados:
- .wrangler/
- ZIPs antigos
- backups/
- docs/handoff/
- tmp/
- workers/argos-web-tools/.wrangler/
- src/components/MasterChatHome.tsx.backup-model-label-20260829-080224

## 12. Build validado antes do backup

`npx wrangler pages functions build functions`
- Compiled Worker successfully

`npm run build`
- TypeScript + Vite OK
- 636 modules transformed
- warning apenas de chunk >500 kB, não bloqueante

`git diff --check`
- limpo

## 13. Regras operacionais para continuação

- Trabalhar um passo/teste por vez.
- Sempre backup antes de alteração estrutural.
- Usar UTF-8 explícito sem BOM em patches PowerShell.
- Evitar Get-Content/Set-Content em fontes UTF-8 sensíveis.
- Não usar `git add .`.
- Não versionar lixo local/backups/ZIPs/.wrangler/tmp.
- Não usar clipboard para segredos.
- Nunca pedir API keys no chat.
- Para secrets no PowerShell, usar `Read-Host -AsSecureString`.
- Free-only: nenhuma cobrança automática, cartão ou pay-as-you-go.
- Não usar fallback pago.
- Validar empiricamente cada novo provedor/modelo antes de entrar no pool.
- Não avançar para Media Pool/System Tools antes de estabilizar o Reasoning Pool e a resiliência entre provedores.

## 14. Primeiro passo no próximo chat

Retomar com esta pergunta operacional:

**Onde podemos executar o MiniMax M3 gratuitamente fora do OpenRouter?**

Pesquisar:
- provedores diretos
- gateways independentes
- free tiers reais
- limites de requisição/token
- políticas de retenção/treinamento
- disponibilidade regional
- necessidade ou não de cartão
- suporte a API compatível
- contexto máximo
- latência
- confiabilidade

Se não existir alternativa gratuita adequada para MiniMax M3:
1. manter MiniMax/OpenRouter como rota preferida enquanto houver quota;
2. adicionar provedores gratuitos independentes para especialistas/fallback;
3. implementar circuit breaker por modelo e por provedor;
4. manter Gemini/Google como domínio de quota independente.

## 15. Estado conceitual ao encerrar

Reasoning Pool:
- roteamento automático: OK
- fallback: OK
- multi-model real: OK
- auto-detecção multi-model: OK
- telemetria: OK
- UI Markdown: OK
- backup Git remoto: OK
- redundância entre provedores: PENDENTE
- circuit breaker por modelo/provedor: PENDENTE
- MiniMax fora do OpenRouter: PESQUISAR
- Media Pool: FUTURO
- System Tools: FUTURO
