# ARGOS — Snapshot de Fechamento da Media Pool V0.1

Data: 2026-09-01
Status: FECHADO / PRODUÇÃO

## 1. Marco de referência

- Repositório: `vampcodando/argos-mvp`
- Branch de produção: `main`
- Commit de integração da Media Pool: `d8149add0403526666ac0b2021af60ccf2232783`
- Mensagem do commit: `Integra Media Pool BytePlus ao ARGOS`
- Branch de desenvolvimento utilizada: `feat/media-pool-byteplus-20260901`
- Deploy em produção concluído via Cloudflare Pages.

## 2. Estado funcional encerrado

A Media Pool V0.1 foi integrada ao chat principal do ARGOS e validada em ambiente de produção.

### Backend

Endpoints implantados:

- `POST /api/media/generate`
- `GET /api/media/health`
- `GET /api/media/video-status?id=<task-id>`

Provider atual: BytePlus ModelArk.

Política operacional:

- `free-only-fail-closed`
- nenhum fallback pago automático
- rotação por `QuotaExceeded` ou falha elegível/retryable do provider
- BytePlus Free Credits Only Mode é a barreira financeira real
- `initialFreeQuota` é metadado estático e NÃO representa saldo restante em tempo real

## 3. Pool de imagem

Ordem de prioridade:

1. Seedream 4.5 — `seedream-4-5-251128`
2. Seedream 4.0 — `seedream-4-0-250828`
3. Seedream 5.0 Lite — `seedream-5-0-260128`

Metadados iniciais de quota configurados no health:

- Seedream 4.5: 200 peças
- Seedream 4.0: 200 peças
- Seedream 5.0 Lite: 50 peças

## 4. Pool de vídeo

Ordem de prioridade:

1. Seedance 1.5 Pro — `seedance-1-5-pro-251215`
2. Seedance 1.0 Pro Fast — `seedance-1-0-pro-fast-251015`
3. Seedance 1.0 Pro — `seedance-1-0-pro-250528`

Metadados iniciais de quota configurados no health:

- Seedance 1.5 Pro: 2.000.000 tokens
- Seedance 1.0 Pro Fast: 2.000.000 tokens
- Seedance 1.0 Pro: 2.000.000 tokens

## 5. Frontend / experiência do chat

A Media Pool foi integrada ao `MasterChatHome` com arquitetura mobile-first.

Comportamento aprovado:

- botão `Mídia` ao lado de `Enviar arquivo`
- gaveta inline, sem modal e sem sobreposição do chat
- gaveta fechada por padrão
- modos `Imagem` e `Vídeo`
- mesmo campo de mensagem utilizado como prompt
- mesma seta de envio utilizada para texto e mídia
- controles adaptativos para desktop e mobile
- layout mobile validado em 390 x 844
- card de imagem dentro do histórico do chat
- player/card preparado para vídeo assíncrono
- ações `Abrir mídia`, `Criar variação` e `Usar como referência`
- imagem gerada pode ser reutilizada como referência HTTPS para a próxima mídia

## 6. Validações realizadas

### Imagem

- Seedream 4.5 testado diretamente via API: OK
- geração de imagem pelo próprio chat do ARGOS em produção: OK
- imagem exibida no card do chat: OK
- resolução observada no teste: 2048 x 2048
- ação `Usar como referência`: OK
- gaveta abriu automaticamente em modo vídeo com referência ativa: OK

### Vídeo

- Seedance 1.5 Pro testado diretamente via API: OK
- task real: `cgt-20260902014048-nkg8s`
- status final: `succeeded`
- resolução: 480p
- proporção: 16:9
- duração: 5 s
- áudio: false
- consumo observado no teste: 35.446 tokens
- endpoint `/api/media/video-status`: OK em produção
- URL MP4 retornada corretamente: OK

Observação: não foi criada uma segunda geração de vídeo apenas para economizar quota. O provider, a criação de task e o endpoint de status já foram validados com uma task real.

## 7. Segurança e credenciais

Secret configurado no Cloudflare Pages:

- `BYTEPLUS_ARK_API_KEY`

O secret foi configurado nos ambientes necessários durante a validação e não foi versionado no Git.

Regras mantidas:

- não armazenar API key em `wrangler.toml`
- não commitar chave em `.env`
- não expor chave no frontend
- nenhuma ativação automática de modelo pago
- nenhum fallback pago automático
- ARGOS continua decidindo a ordem de roteamento

## 8. Health de produção validado

O endpoint `/api/media/health` retornou em produção:

- `ok: true`
- `service: argos-media-pool`
- `version: v0.1-byteplus`
- `provider: byteplus`
- `mode: free-only-fail-closed`
- `ready: true`
- `configured: true`
- `automaticPaidFallback: false`

## 9. Arquivos principais desta fase

Backend:

- `functions/api/media/generate.js`
- `functions/api/media/health.js`
- `functions/api/media/video-status.js`

Frontend:

- `src/components/MasterChatHome.tsx`
- `src/index.css`
- `src/mobile.css`

Scripts de implantação da interface:

- `scripts/apply-media-pool-frontend-v1.mjs`
- `scripts/fix-media-pool-mobile-drawer-v1.mjs`

## 10. Decisões que NÃO devem ser revertidas sem nova avaliação

1. Media Pool permanece free-only e fail-closed.
2. Não ativar fallback pago automático.
3. Não expor escolha de modelo ao usuário final; o ARGOS mantém o roteamento.
4. Não voltar a transportar mídia gerada em Base64 quando uma URL é suficiente.
5. Interface de mídia continua inline/mobile-first, sem modal sobreposto.
6. Upload existente continua único para documentos e imagens de referência.
7. Antes de alterar a pool, verificar quota gratuita e política de cobrança do provider.

## 11. Pendências futuras, não bloqueantes para V0.1

- armazenamento permanente opcional para mídia gerada, pois URLs do provider são temporárias
- leitura de saldo restante em tempo real, caso BytePlus ofereça API apropriada sem exigir arquitetura paga adicional
- teste visual final do ciclo completo de vídeo iniciado diretamente pelo chat, quando houver necessidade real, evitando consumo desnecessário de quota
- futura detecção automática de intenção de mídia no texto sem necessidade de abrir a gaveta manualmente

## 12. Próximo ponto de partida

A Media Pool V0.1 está encerrada e em produção.

Na próxima etapa, partir para a próxima Pool somente após definir seu escopo, mantendo:

- `main` como referência estável de produção
- build antes de deploy
- branch própria para desenvolvimento
- validação em preview antes de merge
- snapshot/handoff ao encerrar cada fase

---

FIM DO SNAPSHOT — MEDIA POOL V0.1
