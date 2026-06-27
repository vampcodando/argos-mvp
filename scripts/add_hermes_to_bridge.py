#!/usr/bin/env python3
# -*- coding: utf-8 -*-
'''
Adiciona o endpoint Hermes headless ao bridge local do ARGOS.

Uso:
  cd F:\\PDEV\\ARGOS-LAB\\argos-mvp
  py .\\scripts\\add_hermes_to_bridge.py
  node --check .\\tools\\argos-local-ollama-bridge.mjs
'''

from __future__ import annotations

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

    if "async function handleHermesChat" in source:
        print("[OK] Endpoint Hermes ja existe. Nada a aplicar.")
        return

    backup_dir = root / "backups" / "patches" / f"hermes-bridge-{datetime.now():%Y%m%d-%H%M%S}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, backup_dir / target.name)

    source = add_imports(source)
    source = add_constants(source)
    source = add_hermes_functions(source)
    source = add_route(source)
    source = update_health_payload(source)

    target.write_text(source, encoding="utf-8")

    print("[OK] Patch aplicado com sucesso.")
    print(f"[OK] Arquivo alterado: {target}")
    print(f"[OK] Backup criado em: {backup_dir}")
    print("")
    print("Proximos comandos:")
    print("  node --check .\\tools\\argos-local-ollama-bridge.mjs")
    print("  node .\\tools\\argos-local-ollama-bridge.mjs")


def add_imports(source: str) -> str:
    old = 'import http from "node:http";\n'
    new = (
        'import http from "node:http";\n'
        'import { execFile } from "node:child_process";\n'
        'import { promisify } from "node:util";\n'
        'import path from "node:path";\n'
    )

    if 'import { execFile } from "node:child_process";' in source:
        return source

    if old not in source:
        fail("Nao encontrei o import inicial esperado.")

    return source.replace(old, new, 1)


def add_constants(source: str) -> str:
    marker = 'const OLLAMA_BASE_URL = process.env.ARGOS_OLLAMA_URL || "http://127.0.0.1:11434";\n'
    block = (
        marker
        + "\n"
        + "const execFileAsync = promisify(execFile);\n"
        + 'const HERMES_COMMAND = process.env.ARGOS_HERMES_COMMAND || path.join(process.env.LOCALAPPDATA || "", "hermes", "hermes-agent", "venv", "Scripts", "hermes.exe");\n'
        + "const HERMES_TIMEOUT_MS = Number(process.env.ARGOS_HERMES_TIMEOUT_MS || 240000);\n"
        + "const HERMES_PROMPT_LIMIT = Number(process.env.ARGOS_HERMES_PROMPT_LIMIT || 6000);\n"
    )

    if "const HERMES_COMMAND =" in source:
        return source

    if marker not in source:
        fail("Nao encontrei a constante OLLAMA_BASE_URL esperada.")

    return source.replace(marker, block, 1)


def add_hermes_functions(source: str) -> str:
    marker = "const server = http.createServer(async (request, response) => {\n"
    if marker not in source:
        fail("Nao encontrei o inicio do servidor HTTP.")

    block = '''
function buildHermesPrompt(userPrompt) {
  return [
    "Contexto oficial do ARGOS:",
    "Voce e o Hermes Agent rodando localmente como agente auxiliar do ARGOS.",
    "ARGOS e o orquestrador mestre, painel e camada de governanca.",
    "Responda em portugues do Brasil.",
    "Nao afirme que executou comandos, escreveu arquivos, fez deploy ou usou API externa se isso nao aconteceu.",
    "Para comandos e ferramentas, quando necessario, proponha a acao de forma estruturada; o ARGOS classificara risco e executara apenas o que for permitido.",
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

function cleanHermesOutput(value) {
  return String(value || "")
    .replace(/\\x1B\\[[0-?]*[ -/]*[@-~]/g, "")
    .trim();
}

async function handleHermesChat(request, response, origin) {
  const body = await readJsonBody(request, 16384);
  const prompt = String(body.prompt || "").trim();

  if (!prompt || prompt.length > HERMES_PROMPT_LIMIT) {
    return sendJson(response, 400, {
      ok: false,
      error: {
        code: "INVALID_PROMPT",
        message: "Prompt vazio ou acima do limite permitido para o Hermes.",
      },
    }, origin);
  }

  const startedAt = Date.now();
  const hermesPrompt = buildHermesPrompt(prompt);

  try {
    const result = await execFileAsync(
      HERMES_COMMAND,
      ["-z", hermesPrompt],
      {
        cwd: process.cwd(),
        timeout: HERMES_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4,
        env: {
          ...process.env,
          HERMES_HOME: process.env.HERMES_HOME || path.join(process.env.LOCALAPPDATA || "", "hermes"),
        },
      }
    );

    const stdout = cleanHermesOutput(result.stdout);
    const stderr = cleanHermesOutput(result.stderr);

    return sendJson(response, 200, {
      ok: true,
      agent: "hermes",
      mode: "oneshot",
      command: HERMES_COMMAND,
      response: stdout,
      stderr: stderr || null,
      metrics: {
        durationMs: Date.now() - startedAt,
        timeoutMs: HERMES_TIMEOUT_MS,
      },
      locks: {
        paidApiEnabled: false,
        directCommandExecutionByHermes: false,
        argosPermissionPolicyEnabled: true,
      },
    }, origin);
  } catch (error) {
    const stdout = cleanHermesOutput(error.stdout);
    const stderr = cleanHermesOutput(error.stderr);
    const timedOut = error.killed || error.signal === "SIGTERM";

    return sendJson(response, timedOut ? 504 : 502, {
      ok: false,
      agent: "hermes",
      mode: "oneshot",
      error: {
        code: timedOut ? "HERMES_TIMEOUT" : "HERMES_FAILED",
        message: error.code === "ENOENT"
          ? "Comando hermes nao encontrado pelo processo da ponte local."
          : error.message || "Falha ao executar Hermes local.",
      },
      stdout: stdout || null,
      stderr: stderr || null,
      metrics: {
        durationMs: Date.now() - startedAt,
        timeoutMs: HERMES_TIMEOUT_MS,
      },
    }, origin);
  }
}

'''

    return source.replace(marker, block + marker, 1)


def add_route(source: str) -> str:
    old = '''    if (request.method === "POST" && url.pathname === "/local-ai/chat") {
      return handleChat(request, response, origin);
    }

'''
    new = '''    if (request.method === "POST" && url.pathname === "/local-ai/chat") {
      return handleChat(request, response, origin);
    }

    if (request.method === "POST" && url.pathname === "/local-ai/hermes/chat") {
      return handleHermesChat(request, response, origin);
    }

'''

    if '/local-ai/hermes/chat' in source:
        return source

    if old not in source:
        fail("Nao encontrei a rota /local-ai/chat para inserir a rota do Hermes.")

    return source.replace(old, new, 1)


def update_health_payload(source: str) -> str:
    old = '''      locks: {
        paidApiEnabled: false,
        commandExecutionEnabled: false,
        fileWriteEnabled: false,
        deployExecutionEnabled: false,
      },
      allowedModels: Array.from(ALLOWED_MODELS.keys()),'''
    new = '''      locks: {
        paidApiEnabled: false,
        commandExecutionEnabled: false,
        fileWriteEnabled: false,
        deployExecutionEnabled: false,
      },
      hermes: {
        configured: true,
        command: HERMES_COMMAND,
        route: "/local-ai/hermes/chat",
        timeoutMs: HERMES_TIMEOUT_MS,
      },
      allowedModels: Array.from(ALLOWED_MODELS.keys()),'''

    if 'route: "/local-ai/hermes/chat"' in source:
        return source

    if old not in source:
        print("[AVISO] Nao consegui atualizar payload de health. Endpoint Hermes ainda foi adicionado.")
        return source

    return source.replace(old, new, 1)


if __name__ == "__main__":
    main()
