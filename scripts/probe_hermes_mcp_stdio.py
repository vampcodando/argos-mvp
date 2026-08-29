import json
import os
import subprocess
import sys
import time
from pathlib import Path
from threading import Thread
from queue import Queue, Empty

ROOT = Path(__file__).resolve().parents[1]
LOG_PATH = ROOT / "tmp" / "hermes-mcp-stdio-probe-20260627.txt"

hermes = Path(os.environ["LOCALAPPDATA"]) / "hermes" / "hermes-agent" / "venv" / "Scripts" / "hermes.exe"

messages = [
    {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "argos-mcp-probe",
                "version": "0.1.0"
            }
        }
    },
    {
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
        "params": {}
    },
    {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list",
        "params": {}
    },
    {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "resources/list",
        "params": {}
    },
    {
        "jsonrpc": "2.0",
        "id": 4,
        "method": "prompts/list",
        "params": {}
    }
]

def reader(pipe, q, name):
    try:
        for line in iter(pipe.readline, ""):
            if not line:
                break
            q.put((name, line.rstrip("\r\n")))
    except Exception as exc:
        q.put((name, f"[reader error] {exc}"))

def run_probe():
    with LOG_PATH.open("w", encoding="utf-8") as log:
        log.write("=== Hermes MCP stdio probe ===\n")
        log.write(f"Hermes: {hermes}\n")
        log.write(f"Exists: {hermes.exists()}\n\n")

        if not hermes.exists():
            print(f"ERRO: Hermes não encontrado: {hermes}")
            return 2

        proc = subprocess.Popen(
            [str(hermes), "mcp", "serve", "--verbose", "--accept-hooks"],
            cwd=str(ROOT),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )

        q = Queue()
        Thread(target=reader, args=(proc.stdout, q, "STDOUT"), daemon=True).start()
        Thread(target=reader, args=(proc.stderr, q, "STDERR"), daemon=True).start()

        time.sleep(2)

        if proc.poll() is not None:
            log.write(f"Process exited early with code {proc.returncode}\n")
            print(f"Process exited early with code {proc.returncode}")
            return proc.returncode or 1

        for msg in messages:
            raw = json.dumps(msg, ensure_ascii=False)
            log.write(f"\n>>> {raw}\n")
            print(f">>> {raw}")
            proc.stdin.write(raw + "\n")
            proc.stdin.flush()
            time.sleep(2)

            deadline = time.time() + 3
            while time.time() < deadline:
                try:
                    stream, line = q.get(timeout=0.25)
                except Empty:
                    continue
                log.write(f"{stream}: {line}\n")
                print(f"{stream}: {line}")

        log.write("\nStopping process...\n")
        proc.terminate()

        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            log.write("Terminate failed; killing process.\n")
            proc.kill()
            proc.wait(timeout=5)

        log.write(f"Exit code: {proc.returncode}\n")
        print(f"\nLog salvo em: {LOG_PATH}")
        return 0

if __name__ == "__main__":
    raise SystemExit(run_probe())
