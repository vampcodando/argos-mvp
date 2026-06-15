# ARGOS - Ollama Local Setup

Data: 2026-06-15

## Objetivo

Registrar a configuracao inicial de IA local do ARGOS usando Ollama no Windows, com modelos armazenados no drive F:.

## Estado validado

Ollama instalado:

C:\Users\lucia\AppData\Local\Programs\Ollama\ollama.exe

Versao:

0.30.8

Servidor local:

http://127.0.0.1:11434

Variaveis de usuario configuradas:

OLLAMA_MODELS=F:\IA_LOCAL\ollama\models
OLLAMA_HOST=127.0.0.1:11434

Pasta oficial dos modelos:

F:\IA_LOCAL\ollama\models

Estrutura validada:

- blobs
- manifests

## Hardware local

Sistema:

Windows 11 Pro for Workstations 64 bits

RAM:

aproximadamente 16 GB

GPU:

NVIDIA GeForce GTX 1070 Ti

VRAM:

8 GB

Driver NVIDIA:

582.28

CUDA reportado pelo nvidia-smi:

13.0

## Modelos encontrados

qwen2.5-coder:7b

- tamanho: 4.7 GB
- uso recomendado: codigo, analise tecnica, patches e scripts
- usar com cuidado para nao saturar VRAM/RAM

qwen2.5:3b

- tamanho: 1.9 GB
- uso recomendado: teste geral leve, respostas curtas, validacao inicial da ponte local
- modelo preferido para primeira integracao do ARGOS

## Problema encontrado

O Ollama estava rodando em segundo plano pela bandeja do Windows e mantinha a porta 127.0.0.1:11434 ocupada.

Sintoma:

listen tcp 127.0.0.1:11434: bind: Only one usage of each socket address is normally permitted.

Causa:

processo ollama.exe ativo em segundo plano.

Correcao:

- sair do Ollama pela bandeja do Windows
- matar processos restantes no Gerenciador de Tarefas quando necessario
- confirmar que a porta 11434 ficou livre
- configurar OLLAMA_MODELS para F:\IA_LOCAL\ollama\models
- reiniciar o Ollama com a configuracao correta

## Testes realizados

Teste CLI:

ollama run qwen2.5:3b "Responda em portugues do Brasil, em uma frase curta: ARGOS local esta operacional?"

Resultado:

ARGOS esta operacional.

Teste API:

POST http://127.0.0.1:11434/api/generate

Modelo:

qwen2.5:3b

Resultado tecnico:

API respondeu JSON corretamente.

Observacao:

Sem contexto oficial, o modelo respondeu conteudo incorreto sobre "ARGIS". Isso validou que o ARGOS precisa usar system prompt/contexto fixo antes de confiar em respostas locais.

## Regra operacional

Ollama local pode ser usado como laboratorio.

Na fase atual:

- nao executa comandos
- nao altera arquivos
- nao faz deploy
- nao substitui validacao tecnica
- nao usa OpenAI API paga
- nao recebe segredos
- nao recebe payload ilimitado

## Proxima fase

ARGOS v0.4.1 - Chat visual na pagina Mestre.

Depois:

ARGOS v0.4.2 - Ponte local segura para Ollama.

Depois:

ARGOS v0.4.3 - Chat conectado ao qwen2.5:3b com contexto oficial e limites.
