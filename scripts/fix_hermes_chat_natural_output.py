#!/usr/bin/env python3
# -*- coding: utf-8 -*-
'''
Ajusta o Hermes no bridge local para responder em texto natural no chat do ARGOS,
evitando retorno cru de tool-call JSON como {"name":"clarify","arguments":...}.

Uso:
  cd F:\PDEV\ARGOS-LAB\argos-mvp
  py .\scripts\fix_hermes_chat_natural_output.py
  node --check .\tools\argos-local-ollama-bridge.mjs
'''

from __future__ import annotations

import re
import shutil
import sys
from datetime import datetime
from pathlib import Path


def fail(message: str) -> None:
    print(f"[ERRO] {message}")
    sys.exit(1)


def main() -> None:
    root = Path.cwd()
    target = root / "tools" / "argos-local-ollama-bridge.mjs"

    if not target.exists():
        fail(f"Arquivo nao encontrado: {target}")

    source = target.read_text(encoding="utf-8")

    if "normalizeHermesOutput" in source and "Nunca devolva JSON cru" in source:
        print("[OK] Ajuste de saida natural do Hermes ja existe. Nada a aplicar.")
        return

    backup_dir = root / "backups" / "patches" / f"hermes-natural-output-{datetime.now():%Y%m%d-%H%M%S}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, backup_dir / target.name)

    source = replace_build_prompt(source)
    source = insert_normalizer(source)
    source = use_normalizer(source)

    target.write_text(source, encoding="utf-8")

    print("[OK] Patch aplicado com sucesso.")
    print(f"[OK] Arquivo alterado: {target}")
    print(f"[OK] Backup criado em: {backup_dir}")
    print("")
    print("Proximos comandos:")
    print("  node --check .\\tools\\argos-local-ollama-bridge.mjs")
    print("  node .\\tools\\argos-local-ollama-bridge.mjs")


def replace_build_prompt(source: str) -> str:
    new_function = '''function buildHermesPrompt(userPrompt) {
  return [
    "Contexto oficial do ARGOS:",
    "Voce e o Hermes Agent rodando localmente como agente auxiliar do ARGOS.",
    "ARGOS e o orquestrador mestre, painel e camada de governanca.",
    "Responda sempre em portugues do Brasil.",
    "",
    "Regra obrigatoria de saida:",
    "Nunca devolva JSON cru para o usuario.",
    "Nunca responda apenas com objetos como {name, arguments}.",
    "Nunca use tool-call JSON para conversa normal.",
    "Se precisar esclarecer algo, faca a pergunta diretamente em texto natural.",
    "Se o usuario pedir apresentacao, saudacao, explicacao, resumo ou opiniao tecnica, responda diretamente em texto natural.",
    "",
    "Regras de seguranca:",
    "Nao afirme que executou comandos, escreveu arquivos, fez deploy ou usou API externa se isso nao aconteceu.",
    "Para comandos e ferramentas, quando necessario, descreva a acao proposta em texto natural; o ARGOS classificara risco e executara apenas o que for permitido.",
    "",
    "Politica de autonomia do ARGOS:",
    "READ_ONLY_AUTO: consultas, leitura, diagnosticos e listagens podem ser automaticos.",
    "SAFE_LOCAL_AUTO: tarefas locais seguras dentro do projeto podem ser automaticas.",
    "PROJECT_CHANGE_APPROVAL: alteracoes de arquivos/projeto precisam de aprovacao por lote.",
    "CRITICAL_APPROVAL: deploy, push, delete, .env, APIs pagas, dados sensiveis e producao sempre exigem aprovacao.",
    "",
    "Mensagem do usuario:",
    userPrompt,
  ].join("\\n");
}

'''

    pattern = r"function buildHermesPrompt\(userPrompt\) \{.*?\n\}\n\nfunction cleanHermesOutput"
    replacement = new_function + "function cleanHermesOutput"

    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)

    if count != 1:
        fail("Nao consegui substituir buildHermesPrompt.")

    return updated


def insert_normalizer(source: str) -> str:
    if "function normalizeHermesOutput" in source:
        return source

    marker = '''function cleanHermesOutput(value) {
  return String(value || "")
    .replace(/\\x1B\\[[0-?]*[ -/]*[@-~]/g, "")
    .trim();
}

'''

    normalizer = marker + '''function normalizeHermesOutput(value) {
  const output = cleanHermesOutput(value);

  if (!output) {
    return "";
  }

  try {
    const parsed = JSON.parse(output);

    if (parsed && typeof parsed === "object" && typeof parsed.name === "string") {
      const args = parsed.arguments && typeof parsed.arguments === "object"
        ? parsed.arguments
        : {};

      if (parsed.name === "clarify" && typeof args.question === "string") {
        return args.question.trim();
      }

      return [
        `O Hermes propos a acao "${parsed.name}", mas nesta fase o ARGOS nao executa ferramentas diretamente pelo chat.`,
        "Descreva o que deseja fazer em linguagem natural para que o ARGOS classifique o risco e conduza a proxima etapa.",
      ].join("\\n\\n");
    }
  } catch {
    // saida normal em texto; segue sem conversao
  }

  return output;
}

'''

    if marker not in source:
        fail("Nao encontrei cleanHermesOutput para inserir normalizeHermesOutput.")

    return source.replace(marker, normalizer, 1)


def use_normalizer(source: str) -> str:
    old = '''    const stdout = cleanHermesOutput(result.stdout);
    const stderr = cleanHermesOutput(result.stderr);
'''
    new = '''    const rawStdout = cleanHermesOutput(result.stdout);
    const stdout = normalizeHermesOutput(rawStdout);
    const stderr = cleanHermesOutput(result.stderr);
'''

    if "const rawStdout = cleanHermesOutput(result.stdout);" in source:
        return source

    if old not in source:
        fail("Nao encontrei leitura de stdout do Hermes.")

    return source.replace(old, new, 1)


if __name__ == "__main__":
    main()
