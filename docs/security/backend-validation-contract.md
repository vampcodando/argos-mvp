# ARGOS Backend Validation Contract

## Objetivo

Definir o contrato minimo que todo endpoint backend/edge do ARGOS devera seguir.

## Contrato obrigatorio por endpoint

Cada endpoint deve declarar:

- metodo HTTP permitido
- content-type aceito
- limite de body
- schema esperado
- campos obrigatorios
- campos opcionais
- limites por campo
- regra de autenticacao
- regra de autorizacao
- politica de log
- politica de erro
- se pode acionar API paga
- se pode executar comando
- se pode alterar arquivo
- se pode fazer deploy
- se exige aprovacao humana

## Resposta de erro

Toda resposta de erro deve ser segura.

Permitido:

- codigo de erro
- mensagem curta
- request id
- causa generica

Proibido:

- stack trace em producao
- token
- secret
- caminho sensivel completo
- dump de payload
- resposta integral de provedor externo

## Aprovacao humana

Acoes destrutivas ou de custo devem exigir aprovacao registrada server-side.

Exemplos:

- npm install
- npm audit fix --force
- git push
- deploy
- escrita em arquivo
- delecao de arquivo
- chamada OpenAI paga
- execucao de agente executor

## Estado atual

Na v0.2.3 este contrato e documental.

Na v0.3 sera criada a primeira camada backend/edge minima para validar requests reais.
