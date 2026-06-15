# ARGOS - Ollama Local Setup

Data: 2026-06-15

## Estado validado

Ollama instalado em:

C:\Users\lucia\AppData\Local\Programs\Ollama\ollama.exe

Versao validada:

0.30.8

Servidor local:

http://127.0.0.1:11434

Variaveis de usuario:

OLLAMA_MODELS=F:\IA_LOCAL\ollama\models
OLLAMA_HOST=127.0.0.1:11434

Pasta oficial dos modelos:

F:\IA_LOCAL\ollama\models

## Modelos locais detectados

- qwen2.5:3b
- qwen2.5-coder:7b

## Hardware validado

- Windows 11 Pro for Workstations 64 bits
- RAM aproximada: 16 GB
- GPU: NVIDIA GeForce GTX 1070 Ti
- VRAM: 8 GB
- Driver NVIDIA: 582.28
- CUDA reportado: 13.0

## Observacao

O Ollama estava ativo na bandeja do Windows e mantinha a porta 11434 ocupada.

Ajuste realizado:

- sair do Ollama pela bandeja
- encerrar processos restantes
- liberar porta 11434
- configurar OLLAMA_MODELS para o drive F:
- validar API local em /api/tags
- validar inferencia local com qwen2.5:3b

## Regra operacional

Modelos locais ficam no drive F:.

Ollama local e laboratorio controlado. Ele ainda nao executa comandos, nao escreve arquivos, nao faz deploy e nao substitui validacao tecnica.
