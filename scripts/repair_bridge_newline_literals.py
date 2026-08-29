#!/usr/bin/env python3
# -*- coding: utf-8 -*-
'''
Corrige literais de quebra de linha quebrados no bridge local do ARGOS.
Caso visto:
  ].join("
  ");

Uso:
  cd F:\PDEV\ARGOS-LAB\argos-mvp
  py .\scripts\repair_bridge_newline_literals.py
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

    backup_dir = root / "backups" / "patches" / f"repair-bridge-newlines-{datetime.now():%Y%m%d-%H%M%S}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, backup_dir / target.name)

    fixed = source

    # Corrige join("quebra real de linha") para join("\\n")
    fixed = re.sub(r'\]\.join\("\r?\n"\);', r'].join("\\n");', fixed)

    # Corrige join("duas quebras reais de linha") para join("\\n\\n")
    fixed = re.sub(r'\]\.join\("\r?\n\r?\n"\);', r'].join("\\n\\n");', fixed)

    # Corrige casos com espaços em volta da quebra.
    fixed = re.sub(r'\]\.join\("\s*\r?\n\s*"\);', r'].join("\\n");', fixed)

    # Corrige string solta de replace de ANSI, caso algum escape tenha sido quebrado.
    fixed = fixed.replace('.replace(/\\\\x1B\\\\[[0-?]*[ -/]*[@-~]/g, "")', '.replace(/\\x1B\\[[0-?]*[ -/]*[@-~]/g, "")')

    if fixed == source:
        print("[AVISO] Nenhuma substituicao automatica aplicada.")
        print(f"[OK] Backup criado em: {backup_dir}")
        return

    target.write_text(fixed, encoding="utf-8")

    print("[OK] Literais quebrados corrigidos.")
    print(f"[OK] Arquivo alterado: {target}")
    print(f"[OK] Backup criado em: {backup_dir}")
    print("")
    print("Agora rode:")
    print("  node --check .\\tools\\argos-local-ollama-bridge.mjs")


if __name__ == "__main__":
    main()
