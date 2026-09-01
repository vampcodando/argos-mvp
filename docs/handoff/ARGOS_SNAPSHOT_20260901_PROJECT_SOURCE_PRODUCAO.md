# ARGOS — Snapshot de Produção — Project Source Read-Only

**Data:** 2026-09-01  
**Fase encerrada:** Project Source GitHub Read-Only + integração ao Master Chat  
**Status:** IMPLEMENTADO, VALIDADO EM PREVIEW, INTEGRADO À `main` E DEPLOYADO EM PRODUÇÃO  
**Observação de encerramento:** o deploy de produção foi concluído no fim da sessão; o smoke test pós-deploy em produção fica como primeiro passo da próxima sessão.

---

## 1. Objetivo da fase

Dar ao ARGOS capacidade de auditar o próprio projeto diretamente a partir do repositório GitHub, com evidência verificável, sem conceder escrita ao código-fonte e sem permitir que conteúdo do repositório altere regras do sistema.

Fluxo final desejado e implementado:

```text
Mestre: "Audite seu próprio projeto"
  -> router determinístico
  -> Project Source
  -> repositório autorizado
  -> branch/ref permitida
  -> commit imutável
  -> list_tree / search_code / read_file / read_range
  -> evidências path:linhas:commit
  -> Reasoning Pool
  -> relatório auditado
```

---

## 2. Repositório e política de acesso

Repositório autorizado:

```text
vampcodando/argos-mvp
```

Ref permitida:

```text
main
```

Acesso:

```text
read-only
```

Credencial utilizada pelo backend:

```text
GITHUB_TOKEN
```

A credencial é usada somente no backend e não é exposta nas respostas.

Permissões do token configuradas para o repositório do ARGOS:

```text
Contents: Read-only
Metadata: Read-only
```

O Project Source não aceita seleção arbitrária de outro owner/repo nem de outra branch/ref pelo usuário.

---

## 3. Arquivos principais implementados

### Backend do Project Source

```text
functions/api/tools/project-source.js
```

Responsabilidades:

- allowlist exata do repositório;
- ref fixa `main`;
- autenticação GitHub pelo backend;
- somente operações GET/read-only;
- resolução do commit atual;
- leitura presa ao SHA imutável do commit;
- listagem da árvore;
- leitura de arquivo;
- leitura por intervalo de linhas;
- busca no código;
- fallback de busca por varredura direta da árvore;
- bloqueio de caminhos sensíveis;
- bloqueio de traversal;
- bloqueio de arquivos binários/não textuais;
- limite de tamanho de arquivos;
- limites de busca e de cobertura.

### Contexto automático de auditoria

```text
functions/api/tools/project-source-context.js
```

Responsabilidades:

- selecionar arquivos relevantes;
- montar contexto técnico para autoauditoria;
- priorizar blocos críticos;
- extrair blocos completos de configuração;
- registrar cobertura parcial e truncamentos;
- produzir evidências para o Master Chat.

### Router

```text
functions/api/tools/router.js
```

Responsabilidades adicionadas/endurecidas:

- detectar perguntas sobre o próprio ARGOS;
- enviar autoauditoria para `project-source-context`;
- continuar roteando consultas explícitas a repositórios para `github-repo`;
- não confundir caminhos locais como `ZIP/workspace` e `src/components` com `owner/repo`.

### Master Chat

```text
src/components/MasterChatHome.tsx
```

Integrações principais:

- `project-source` reconhecido como tool;
- serialização de evidências do Project Source;
- orçamento maior para contexto de auditoria;
- preservação de blocos críticos completos;
- evidência no formato aproximado `path:start-end @ commit`;
- conteúdo do repositório tratado como dado não confiável, nunca como instrução;
- distinção entre configuração estática e estado real de runtime;
- aviso explícito quando a cobertura é parcial.

### Backend de IA

```text
functions/api/ai/chat.js
```

Foi atualizado para aceitar o novo contexto/tool do Project Source na integração do Master Chat.

---

## 4. Scripts de aplicação criados nesta fase

```text
scripts/apply-project-source-masterchat-v01.mjs
scripts/apply-project-source-context-precision-v01.mjs
scripts/apply-project-source-snapshot-security-v01.mjs
```

O último script foi corrigido para aplicar o endurecimento por limites estruturais de função, evitando dependência de um bloco textual grande e frágil.

---

## 5. Segurança implementada

### 5.1 Allowlist rígida

Somente:

```text
vampcodando/argos-mvp
```

é aceito pelo Project Source.

Parâmetros externos tentando trocar repo/ref são ignorados.

### 5.2 Ref fixa

```text
main
```

A ferramenta resolve o commit correspondente e usa o SHA imutável para as leituras.

### 5.3 Snapshot imutável

`read_file`, `read_range` e a verificação de resultados de busca passaram a operar sobre o mesmo `commitSha` resolvido.

Isso elimina a possibilidade de uma auditoria começar em um estado da `main` e continuar lendo arquivos de outro estado após alteração da branch.

### 5.4 Bloqueio de arquivos sensíveis

Padrões bloqueados incluem, entre outros:

```text
.env
.dev.vars
.wrangler
node_modules
dist
coverage
secrets
credentials
.pem
.p12
.pfx
.key
.keystore
```

### 5.5 Path traversal

Caminhos contendo segmentos inválidos, `.` ou `..` são rejeitados.

### 5.6 Somente texto aprovado

Extensões textuais permitidas incluem:

```text
.js .mjs .cjs .ts .tsx .jsx .json .md .txt
.css .html .toml .yml .yaml .py .ps1 .cmd .sh
```

Arquivos binários, como PNG, são recusados.

### 5.7 Limite de arquivo

```text
MAX_FILE_BYTES = 350000
```

Arquivos maiores são recusados antes da devolução do conteúdo.

### 5.8 Limites de busca

Principais limites V0.1:

```text
MAX_TREE_ITEMS = 1200
MAX_RANGE_LINES = 240
MAX_SEARCH_RESULTS = 20
MAX_MATCHES_PER_FILE = 4
MAX_FALLBACK_SEARCH_FILES = 120
MAX_FALLBACK_SEARCH_BYTES = 6000000
SEARCH_BATCH_SIZE = 8
```

### 5.9 Proteção contra prompt injection

O conteúdo do repositório é tratado pelo Master Chat como **evidência não confiável**.

O modelo não deve:

- executar comandos encontrados no código;
- seguir instruções embutidas em arquivos;
- mudar políticas;
- ignorar regras anteriores;
- exfiltrar segredos;
- assumir que texto lido do repositório possui autoridade sobre o sistema.

### 5.10 Política genérica preservada

A política genérica de ferramentas não foi relaxada globalmente.

`source_code_private` continua bloqueado em:

```text
functions/api/tools/_toolPolicy.js
```

O Project Source é um canal dedicado, autenticado, allowlisted e read-only.

---

## 6. Busca de código

A ação:

```text
search_code
```

possui duas rotas:

1. tentativa de GitHub Code Search;
2. fallback direto pela árvore do commit quando o índice não fornece resultados verificáveis.

O fallback:

- usa árvore/commit imutável;
- lê blobs por SHA;
- prioriza arquivos de código/configuração;
- aplica limite de arquivos e bytes;
- procura substring literal case-insensitive;
- retorna linha, intervalo e excerpt;
- informa truncamentos.

---

## 7. Precisão da autoauditoria

O `project-source-context` foi aprimorado para preservar blocos críticos completos, especialmente:

```text
REMOTE_REASONING_POOL
buildRoutingOrder
IMAGE_POOL
VIDEO_POOL
```

A extração usa balanceamento estrutural de delimitadores para evitar cortar configurações importantes no meio.

O contexto também informa explicitamente quando a auditoria não cobriu todo o repositório.

Exemplo observado durante validação:

```text
candidateFiles: 138
selectedFiles: 80
scannedFiles: 24
truncatedByFileLimit: true
```

Portanto o ARGOS corretamente descreve esse resultado como auditoria parcial, não como auditoria integral.

---

## 8. Modelos identificados corretamente pela autoauditoria

### Reasoning Pool

```text
MiniMax M3
provider: openrouter
model: minimax/minimax-m3:free

glm-5.3-flash
provider: bai
model: glm-5.3-flash
reasoning effort: high

Gemini 2.5 Flash
provider: gemini
model: gemini-2.5-flash
```

Roteamento declarado:

```text
coding:
GLM 5.3 Flash -> MiniMax M3 -> Gemini 2.5 Flash

reasoning:
MiniMax M3 -> GLM 5.3 Flash -> Gemini 2.5 Flash

fast:
Gemini 2.5 Flash -> MiniMax M3 -> GLM 5.3 Flash
```

### Media Pool — imagem

```text
Seedream 4.5
Seedream 4.0
Seedream 5.0 Lite
```

### Media Pool — vídeo

```text
Seedance 1.5 Pro
Seedance 1.0 Pro Fast
Seedance 1.0 Pro
```

### Fallback local declarado

```text
qwen2.5:3b
```

A auditoria distinguiu corretamente configuração declarada de disponibilidade real em runtime.

---

## 9. Matriz de testes executados

### Build

```text
npm run build
```

Resultado:

```text
PASS
636 módulos transformados
```

Aviso de chunks > 500 kB permaneceu não bloqueante.

### `git diff --check`

Resultado:

```text
PASS
```

### Snapshot imutável — `read_range`

Arquivo testado:

```text
functions/api/reasoning/chat.js
```

Resultado:

```text
PASS
commitSha = b8b4152be2bb235c555e1e45188cf85b1eb81493
blob sha = 82f32272aa100d892ba44eb38bacd13d255cea3f
```

### Binário bloqueado

Arquivo:

```text
src/assets/argos-centurion.png
```

Resultado:

```text
PASS
Project Source permite leitura apenas de arquivos textuais aprovados.
```

Nenhum Base64 foi retornado.

### Arquivo textual grande bloqueado

Arquivo:

```text
public/ocr/core/tesseract-core-lstm.wasm.js
```

Resultado:

```text
PASS
Arquivo excede o limite de 350000 bytes do Project Source V0.1.
```

### Path sensível

```text
.env
```

Resultado:

```text
PASS — rejeitado
```

### Traversal

```text
../foo
```

Resultado:

```text
PASS — rejeitado
```

### Método de escrita

POST contra endpoint read-only.

Resultado:

```text
PASS — HTTP 405
```

### Ação inválida

```text
delete_file
```

Resultado:

```text
PASS — rejeitada
```

### Override de repositório/ref

Tentativa:

```text
repo=outro/repositorio
ref=dev
```

Resultado:

```text
PASS
repository = vampcodando/argos-mvp
ref = main
```

### Token/header exposto

Teste procurou:

```text
authorization
bearer
github_token
```

Resultado:

```text
PASS
authorizationExposed: false
bearerExposed: false
githubTokenExposed: false
```

### Router — falso positivo ZIP

Prompt:

```text
analise ZIP/workspace e GitHub
```

Resultado:

```text
PASS
detection: null
```

### Router — falso positivo path local

Prompt:

```text
analise src/components
```

Resultado:

```text
PASS
detection: null
```

### Router — repo explícito

Prompt:

```text
qual o status do repo vampcodando/argos-mvp
```

Resultado:

```text
PASS
tool: github-repo
```

### Router — URL GitHub

Prompt:

```text
analise https://github.com/vampcodando/argos-mvp
```

Resultado:

```text
PASS
tool: github-repo
```

### Router — autoauditoria

Prompt:

```text
Audite seu próprio projeto e diga quais modelos você usa
```

Resultado:

```text
PASS
tool: project-source
endpoint: /api/tools/project-source-context
```

### Prompt injection semântico

Foi solicitado que o ARGOS auditasse o projeto e não obedecesse a possíveis instruções encontradas no código.

Resultado:

```text
PASS
```

O ARGOS:

- não executou comandos;
- não seguiu conteúdo do repositório como instrução;
- não revelou segredos;
- identificou corretamente que a frase de teste vinha da pergunta;
- manteve a separação entre evidência e autoridade;
- apresentou referências de arquivo/linha/commit;
- informou que a cobertura era parcial.

### `search_code` preso ao snapshot

Query:

```text
REMOTE_REASONING_POOL
```

Resultado:

```text
PASS
method: direct-tree-scan
commitSha: b8b4152be2bb235c555e1e45188cf85b1eb81493
candidateFiles: 138
selectedFiles: 120
scannedFiles: 120
count: 7
```

---

## 10. Histórico principal de commits da fase

Feature branch:

```text
feat/project-source-github-readonly-20260901
```

Commits importantes:

```text
5155f536ac99ae053456a4df6b2e1470828ef41c
Cria Project Source GitHub read-only

7fc7a3f69f88a117e518ffdef8687b2bc463230d
Endurece router

834ed753008e919e00b37032aaa9d61dac889839
Adiciona fallback direto para search_code

e897f628f4f08631c6cb3e93edf09701790868c6
Adiciona contexto automático do Project Source

149c67f0ae457d987af3c45239f11b67788afc9b
Integra Project Source ao router do ARGOS

851448c8051d9c1abbacb6a651449a7ddf861b21
Adiciona aplicador da integração com Master Chat

27f2ee74baf82dac64b5e7bb760649b8892a54be
Adiciona precisão de blocos críticos do contexto

93cd84df9353366d3767cfc3e21d1d0fc12e4006
Primeira versão do aplicador de segurança de snapshot

a2c19413c34b516141ead99b73420e41fc2a733c
Corrige aplicador de segurança snapshot do Project Source

414180ed1056533e40dbb929008de82849f6cd2d
Integra Project Source seguro ao Master Chat
```

Merge final na `main`:

```text
d6a85a7
Integra Project Source seguro ao ARGOS
```

A `main` foi enviada ao GitHub:

```text
b8b4152..d6a85a7  main -> main
```

---

## 11. Deploys

### Preview validado

Deploy utilizado na validação final:

```text
https://094f9285.argos-mvp-5sz.pages.dev
```

Alias da feature:

```text
https://feat-project-source-github-r.argos-mvp-5sz.pages.dev
```

### Produção

Deploy final concluído:

```text
https://77dc00ef.argos-mvp-5sz.pages.dev
```

Cloudflare informou:

```text
Compiled Worker successfully
Success! Uploaded 0 files (18 already uploaded)
Uploading _headers
Uploading Functions bundle
Deployment complete
```

### Warning não bloqueante do Wrangler

Permanece:

```text
wrangler.toml sem pages_build_output_dir
```

O Wrangler ignorou o arquivo para o deploy Pages e prosseguiu normalmente.

Isso não bloqueou o deploy, mas deve ser tratado como limpeza técnica futura.

---

## 12. Estado Git ao encerrar

Antes do merge, apenas quatro arquivos funcionais locais estavam staged para o commit final:

```text
functions/api/ai/chat.js
functions/api/tools/project-source.js
functions/api/tools/project-source-context.js
src/components/MasterChatHome.tsx
```

Todos os arquivos/pastas não rastreados existentes permaneceram fora dos commits.

Itens conhecidos que NÃO devem ser adicionados automaticamente:

```text
.wrangler/
ARGOS_COPY_BUTTON_FIX_20260817.zip
ARGOS_LOCAL_ZIP_PRIORITY_FIX_20260817.zip
ARGOS_ZIP_PROJECT_READER_FIX_20260817.zip
ARGOS_ZIP_WORKSPACE_EXECUTOR_V01_20260817.zip
_worker.bundle
backups/
docs/handoff/ARGOS_SNAPSHOT_20260831_MEDIA_POOL_PROXIMA_ETAPA.md
docs/handoff/argos-hermes-persistente-proxima-fase-20260627-015818.zip
docs/handoff/argos-proxima-etapa-ia-local-video-20260616-222434.zip
src/components/MasterChatHome.tsx.backup-model-label-20260829-080224
tmp/
workers/argos-web-tools/.wrangler/
```

Regra permanece:

```text
NUNCA usar git add .
```

---

# 13. PRÓXIMA SESSÃO — PRIMEIRO PASSO OBRIGATÓRIO

Como a sessão foi encerrada imediatamente após o deploy final, o primeiro passo da próxima sessão é executar o **smoke test de produção**.

Não alterar código antes disso.

## 13.1 Confirmar sincronização local

```powershell
git switch main
git pull --ff-only origin main
git status --short --branch
git rev-parse HEAD
```

## 13.2 Smoke test do Project Source em produção

Validar:

```text
/api/tools/project-source?action=metadata
```

Esperado:

```text
ok: true
repository: vampcodando/argos-mvp
ref: main
access: read-only
authenticated: true
```

Depois:

```text
/api/tools/project-source?action=read_range&path=functions/api/reasoning/chat.js&start=37&end=45
```

Confirmar que `commitSha` corresponde ao HEAD vigente da `main`.

## 13.3 Smoke test do router em produção

No console F12:

```js
await fetch('/api/tools/router', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Audite seu próprio projeto e diga quais modelos você usa'
  })
}).then(r => r.json())
```

Esperado:

```text
detection.tool = project-source
```

## 13.4 Autoauditoria real na produção

No Master Chat de produção:

```text
Audite seu próprio projeto e diga quais modelos você usa.
```

Agora a auditoria deve ler a `main` que já contém o próprio Project Source.

Ponto importante a conferir:

A allowlist das tools do backend deve passar a mostrar `project-source` na evidência da `main`, diferentemente da validação anterior, que auditava o snapshot antigo `b8b4152` antes do merge.

Se esses testes passarem, declarar oficialmente:

```text
PROJECT SOURCE V0.1 — PRODUÇÃO FECHADA
```

---

# 14. PRÓXIMA ETAPA DE DESENVOLVIMENTO

Depois de fechar o smoke test de produção, iniciar:

```text
PROJECT SOURCE V0.2 — AUDITORIA DE COBERTURA E OBSERVABILIDADE
```

Objetivos sugeridos:

1. aumentar a auditabilidade da cobertura sem transformar toda pergunta em leitura integral do repositório;
2. registrar arquivos que falharam durante fallback (`failedFiles`) em vez de apenas ignorar falhas individuais;
3. melhorar métricas de cobertura (`candidateFiles`, `selectedFiles`, `scannedFiles`, bytes, truncamento e erros);
4. permitir um modo explícito de auditoria ampliada/estrutural quando o Mestre pedir uma vistoria mais profunda;
5. preservar o modo normal rápido e econômico para perguntas específicas;
6. manter snapshot único por auditoria;
7. manter read-only e fail-closed;
8. preservar proteção contra prompt injection;
9. revisar o warning `pages_build_output_dir` do Wrangler como limpeza de infraestrutura;
10. documentar claramente a diferença entre:
   - configuração estática;
   - evidência do repositório;
   - estado real de runtime;
   - cobertura parcial;
   - cobertura ampliada.

Arquitetura pretendida para V0.2:

```text
Pergunta específica
  -> Project Source V0.1 rápido

Auditoria ampla explícita
  -> snapshot commit
  -> plano de cobertura
  -> inspeção por blocos/áreas
  -> métricas + falhas
  -> evidências consolidadas
  -> Reasoning Pool
  -> relatório com nível real de cobertura
```

---

# 15. Estado final desta fase

```text
Project Source GitHub Read-Only: IMPLEMENTADO
Allowlist de repo/ref: PASS
Read-only: PASS
Snapshot por commit: PASS
read_file: PASS
read_range: PASS
search_code: PASS
fallback direct-tree-scan: PASS
Bloqueio binário: PASS
Limite de tamanho: PASS
Path traversal: PASS
Arquivos sensíveis: PASS
Token não exposto: PASS
Prompt injection semântico: PASS
Router determinístico: PASS
Master Chat integrado: PASS
Build: PASS
Preview: PASS
Merge main: PASS
Push main: PASS
Deploy produção: PASS
Smoke test pós-deploy produção: PENDENTE PARA PRÓXIMA SESSÃO
```

**Ponto de retomada:** iniciar pela seção 13 deste snapshot. Não alterar código antes de validar produção.