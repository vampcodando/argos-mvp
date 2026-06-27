#!/usr/bin/env python3
# -*- coding: utf-8 -*-
'''
Adiciona LOCAL · Hermes Agent ao chat do ARGOS.

Uso:
  cd F:\PDEV\ARGOS-LAB\argos-mvp
  py .\scripts\add_hermes_to_master_chat.py
  npm run build
'''

from __future__ import annotations

import shutil
import sys
from datetime import datetime
from pathlib import Path


def fail(message: str) -> None:
    print(f"[ERRO] {message}")
    sys.exit(1)


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        fail(f"Nao encontrei o trecho esperado: {label}")
    return source.replace(old, new, 1)


def main() -> None:
    root = Path.cwd()
    target = root / "src" / "components" / "MasterChatHome.tsx"

    if not target.exists():
        fail(f"Arquivo nao encontrado: {target}")

    source = target.read_text(encoding="utf-8")

    if "HERMES_LOCAL_MODEL_ID" in source and "/local-ai/hermes/chat" in source:
        print("[OK] Hermes ja esta integrado ao MasterChatHome. Nada a aplicar.")
        return

    backup_dir = root / "backups" / "patches" / f"hermes-master-chat-{datetime.now():%Y%m%d-%H%M%S}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, backup_dir / target.name)

    source = add_hermes_constant(source)
    source = add_hermes_local_model(source)
    source = add_hermes_runtime_flag(source)
    source = update_loading_text(source)
    source = update_local_ai_status_message(source)
    source = update_local_fetch_to_route_hermes(source)
    source = update_placeholder(source)
    source = update_model_menu_title(source)

    target.write_text(source, encoding="utf-8")

    print("[OK] Patch aplicado com sucesso.")
    print(f"[OK] Arquivo alterado: {target}")
    print(f"[OK] Backup criado em: {backup_dir}")
    print("")
    print("Proximos comandos:")
    print("  Select-String -Path .\\src\\components\\MasterChatHome.tsx -Pattern \"\\\\n\"")
    print("  npm run build")


def add_hermes_constant(source: str) -> str:
    old = 'const LOCAL_AI_BRIDGE_URL = "http://127.0.0.1:8787";\n'
    new = old + 'const HERMES_LOCAL_MODEL_ID = "local-hermes-agent";\n'

    if "HERMES_LOCAL_MODEL_ID" in source:
        return source

    return replace_once(source, old, new, "constante LOCAL_AI_BRIDGE_URL")


def add_hermes_local_model(source: str) -> str:
    old = '''  const localModels: ChatModelOption[] = bridgeModels.length
    ? bridgeModels.map((model) => ({
        id: model.id,
        name: model.name,
        endpoint: "Supervisor 8786 -> Bridge 8787 -> Ollama 11434",
        size: model.size,
        role: model.installed ? model.role : `${model.role} Modelo nao instalado.`,
        status: model.preferred ? "preferred" : "heavy",
        provider: "local",
      }))
    : LOCAL_OLLAMA_MODELS.map((model) => ({
        ...model,
        provider: "local",
      }));

'''
    new = '''  const ollamaModels: ChatModelOption[] = bridgeModels.length
    ? bridgeModels.map((model) => ({
        id: model.id,
        name: model.name,
        endpoint: "Supervisor 8786 -> Bridge 8787 -> Ollama 11434",
        size: model.size,
        role: model.installed ? model.role : `${model.role} Modelo nao instalado.`,
        status: model.preferred ? "preferred" : "heavy",
        provider: "local",
      }))
    : LOCAL_OLLAMA_MODELS.map((model) => ({
        ...model,
        provider: "local",
      }));

  const hermesLocalModel: ChatModelOption = {
    id: HERMES_LOCAL_MODEL_ID,
    name: "Hermes Agent",
    endpoint: "Bridge 8787 -> Hermes headless -> Ollama local",
    size: "AGENTE LOCAL",
    role: "Agente local headless controlado pelo ARGOS. Nesta fase, nao executa comandos diretamente; responde e propoe acoes para a politica de permissao.",
    status: "preferred",
    provider: "local",
  };

  const localModels: ChatModelOption[] = [...ollamaModels, hermesLocalModel];

'''

    if "const hermesLocalModel" in source:
        return source

    return replace_once(source, old, new, "bloco localModels")


def add_hermes_runtime_flag(source: str) -> str:
    old = '''    const isOpenRouterModel = activeModel.provider === "openrouter";
    const isGeminiModel = activeModel.provider === "gemini";
    const isCloudflareImageModel = activeModel.provider === "cloudflare_image";

'''
    new = '''    const isOpenRouterModel = activeModel.provider === "openrouter";
    const isGeminiModel = activeModel.provider === "gemini";
    const isCloudflareImageModel = activeModel.provider === "cloudflare_image";
    const isHermesModel = activeModel.id === HERMES_LOCAL_MODEL_ID;

'''

    if "const isHermesModel" in source:
        return source

    return replace_once(source, old, new, "flags de provider no envio")


def update_loading_text(source: str) -> str:
    old = '''            : isOpenRouterModel
              ? `Consultando ${activeModel.name} via OpenRouter Free...`
            : localAiStatus === "online"
            ? `Consultando ${activeModel.name} via IA local...`
            : "IA local desligada. Ligando pelo supervisor antes de enviar...",'''
    new = '''            : isOpenRouterModel
              ? `Consultando ${activeModel.name} via OpenRouter Free...`
            : isHermesModel
              ? `Consultando ${activeModel.name} via Hermes local...`
            : localAiStatus === "online"
            ? `Consultando ${activeModel.name} via IA local...`
            : "IA local desligada. Ligando pelo supervisor antes de enviar...",'''

    if "via Hermes local..." in source:
        return source

    return replace_once(source, old, new, "texto de loading Hermes")


def update_local_ai_status_message(source: str) -> str:
    old = '''        updateLoadingMessage(loadingId, `Consultando ${activeModel.name} via IA local...`);
'''
    new = '''        updateLoadingMessage(
          loadingId,
          isHermesModel
            ? `Consultando ${activeModel.name} via Hermes local...`
            : `Consultando ${activeModel.name} via IA local...`
        );
'''

    if "isHermesModel\n            ? `Consultando ${activeModel.name} via Hermes local...`" in source:
        return source

    return replace_once(source, old, new, "mensagem apos startLocalAi")


def update_local_fetch_to_route_hermes(source: str) -> str:
    old = '''      const response = await fetch(`${LOCAL_AI_BRIDGE_URL}/local-ai/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: activeModel.id,
          prompt: localPromptForModel,
        }),
      });
'''
    new = '''      const localEndpoint = isHermesModel
        ? `${LOCAL_AI_BRIDGE_URL}/local-ai/hermes/chat`
        : `${LOCAL_AI_BRIDGE_URL}/local-ai/chat`;

      const localBody = isHermesModel
        ? { prompt: localPromptForModel }
        : { model: activeModel.id, prompt: localPromptForModel };

      const response = await fetch(localEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify(localBody),
      });
'''

    if "/local-ai/hermes/chat" in source:
        return source

    return replace_once(source, old, new, "fetch local para bridge")


def update_placeholder(source: str) -> str:
    old = '''                : activeModel.provider === "openrouter"
                  ? `Mensagem para ${activeModel.name} via OpenRouter Free...`
                : localAiStatus === "online"
                ? `Mensagem para ${activeModel.name}...`
'''
    new = '''                : activeModel.provider === "openrouter"
                  ? `Mensagem para ${activeModel.name} via OpenRouter Free...`
                : activeModel.id === HERMES_LOCAL_MODEL_ID
                  ? "Mensagem para Hermes Agent local..."
                : localAiStatus === "online"
                ? `Mensagem para ${activeModel.name}...`
'''

    if "Mensagem para Hermes Agent local..." in source:
        return source

    return replace_once(source, old, new, "placeholder Hermes")


def update_model_menu_title(source: str) -> str:
    old = '''                  <small>Local Ollama + OpenRouter Free aprovado</small>
'''
    new = '''                  <small>Local Ollama/Hermes + OpenRouter Free aprovado</small>
'''

    if "Local Ollama/Hermes" in source:
        return source

    if old not in source:
        return source

    return source.replace(old, new, 1)


if __name__ == "__main__":
    main()
