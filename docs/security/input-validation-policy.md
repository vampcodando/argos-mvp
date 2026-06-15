# ARGOS Input Validation Policy

## Objetivo

Definir a politica minima para qualquer entrada de dados recebida pelo ARGOS.

## Regra geral

Todo input deve ser validado antes de ser processado, persistido, enviado para IA, usado em comando, usado em deploy ou registrado em log.

## Limites obrigatorios

### Payload

Todo endpoint deve declarar limite maximo de corpo.

Valores iniciais recomendados:

- JSON operacional simples: 32 KB
- texto longo para analise: 64 KB
- arquivo: proibido ate existir pipeline proprio de upload, scan e limite

### Campos de texto

Limites iniciais recomendados:

- titulo: 120 caracteres
- nome curto: 80 caracteres
- descricao curta: 500 caracteres
- prompt operacional: 4.000 caracteres
- log externo colado: 20.000 caracteres, com truncamento antes de enviar para IA
- caminho de arquivo: 260 caracteres
- branch Git: 80 caracteres
- commit message: 120 caracteres

## Conteudo proibido sem pipeline proprio

- execucao direta de comando vindo do cliente
- caminho absoluto arbitrario vindo do cliente
- token ou segredo enviado pelo frontend
- arquivo sem limite
- payload binario sem validacao
- prompt ilimitado
- URL externa usada automaticamente sem allowlist
- escrita em disco sem plano aprovado

## Logs

Logs devem ser:

- truncados
- higienizados
- sem tokens
- sem cookies
- sem secrets
- sem chaves privadas
- sem dumps completos desnecessarios

## IA

Antes de qualquer chamada de IA:

1. validar tamanho
2. remover segredos conhecidos
3. classificar finalidade
4. estimar custo
5. exigir aprovacao se for API paga
6. registrar auditoria

## Estado atual

Esta politica e documental na v0.2.3.

Implementacao tecnica ficara para a fase v0.3 Backend/Edge.
