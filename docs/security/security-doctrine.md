# ARGOS Security Doctrine

## Regra central

O frontend do ARGOS nunca e fonte de verdade para seguranca.

A interface pode exibir estados, botoes, avisos, formularios, fluxos e controles de UX, mas nenhuma decisao sensivel pode depender exclusivamente do React, do navegador, de localStorage, sessionStorage, cookies manipulaveis pelo cliente ou flags visuais.

## Principios obrigatorios

1. Todo input externo e considerado hostil ate ser validado no backend, edge ou server-side.
2. Toda acao sensivel precisa ser autorizada fora do frontend.
3. Todo payload precisa ter limite de tamanho.
4. Todo campo precisa ter limite de tamanho e formato.
5. Toda execucao precisa ter aprovacao server-side.
6. Toda chamada paga de API precisa ter trava server-side.
7. Todo deploy, push, escrita em arquivo, comando destrutivo ou alteracao de ambiente precisa ter validacao e autorizacao fora da UI.
8. Logs devem ser truncados e higienizados.
9. A IA nao pode receber input ilimitado.
10. Cloudflare Access protege a entrada, mas nao substitui validacao interna de backend.

## Camadas

### Camada 1 - Cloudflare Access

Responsavel por impedir acesso anonimo ao ARGOS.

Status atual:

- login real validado
- logout real validado
- usuario permitido: vampnovoagain@gmail.com

### Camada 2 - Headers estaticos

Responsavel por reduzir superficie basica de ataque no frontend publicado.

Status atual:

- CSP inicial
- Permissions-Policy
- Referrer-Policy
- X-Content-Type-Options
- X-Frame-Options
- X-Robots-Tag
- robots.txt bloqueando indexacao

### Camada 3 - Backend/Edge futuro

Responsavel por validar dados, permissoes, custos, execucao, auditoria e comandos reais.

Essa camada ainda nao esta implementada na v0.2.3.

## Decisao oficial

Qualquer recurso novo do ARGOS que envolva risco operacional deve nascer com contrato de validacao server-side antes de virar execucao real.
