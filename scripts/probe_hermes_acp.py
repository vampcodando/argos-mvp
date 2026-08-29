import json
import os
import subprocess
import time
from pathlib import Path
from queue import Empty, Queue
from threading import Thread

ROOT = Path(__file__).resolve().parents[1]
LOG_PATH = ROOT / "tmp" / "hermes-acp-probe-20260627.txt"
HERMES = Path(os.environ["LOCALAPPDATA"]) / "hermes" / "hermes-agent" / "venv" / "Scripts" / "hermes.exe"

def reader(pipe, q, name):
    for line in iter(pipe.readline, ""):
        if not line:
            break
        q.put((name, line.rstrip("\r\n")))

def send(proc, log, msg):
    raw = json.dumps(msg, ensure_ascii=False, separators=(",", ":"))
    log.write(f"\n>>> {raw}\n")
    print(f">>> {raw}")
    proc.stdin.write(raw + "\n")
    proc.stdin.flush()

def drain(q, log, seconds=2):
    out = []
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            stream, line = q.get(timeout=0.25)
        except Empty:
            continue
        log.write(f"{stream}: {line}\n")
        print(f"{stream}: {line}")
        out.append((stream, line))
    return out

def wait_for_response(q, log, wanted_id, timeout=180):
    chunks = []
    deadline = time.time() + timeout

    while time.time() < deadline:
        try:
            stream, line = q.get(timeout=0.5)
        except Empty:
            continue

        log.write(f"{stream}: {line}\n")
        print(f"{stream}: {line}")

        if stream != "STDOUT":
            continue

        try:
            obj = json.loads(line)
        except Exception:
            continue

        if obj.get("method") == "session/update":
            update = obj.get("params", {}).get("update", {})
            kind = update.get("sessionUpdate")
            content = update.get("content", {})
            if kind == "agent_message_chunk" and content.get("type") == "text":
                chunks.append(content.get("text", ""))

        if obj.get("id") == wanted_id:
            return obj, "".join(chunks)

    raise TimeoutError(f"Timeout esperando resposta id={wanted_id}")

def main():
    with LOG_PATH.open("w", encoding="utf-8") as log:
        log.write("=== Hermes ACP probe ===\n")
        log.write(f"Root: {ROOT}\n")
        log.write(f"Hermes: {HERMES}\n")
        log.write(f"Exists: {HERMES.exists()}\n\n")

        if not HERMES.exists():
            print(f"ERRO: Hermes não encontrado: {HERMES}")
            return 2

        env = os.environ.copy()
        env["HERMES_ACCEPT_HOOKS"] = "1"

        proc = subprocess.Popen(
            [str(HERMES), "acp", "--accept-hooks"],
            cwd=str(ROOT),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env=env,
        )

        q = Queue()
        Thread(target=reader, args=(proc.stdout, q, "STDOUT"), daemon=True).start()
        Thread(target=reader, args=(proc.stderr, q, "STDERR"), daemon=True).start()

        time.sleep(2)

        if proc.poll() is not None:
            log.write(f"Process exited early: {proc.returncode}\n")
            print(f"Process exited early: {proc.returncode}")
            drain(q, log, 3)
            return proc.returncode or 1

        send(proc, log, {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": 1,
                "clientCapabilities": {
                    "fs": {
                        "readTextFile": False,
                        "writeTextFile": False
                    },
                    "terminal": False
                },
                "clientInfo": {
                    "name": "argos-acp-probe",
                    "title": "ARGOS ACP Probe",
                    "version": "0.1.0"
                }
            }
        })

        init_result, _ = wait_for_response(q, log, 1, timeout=30)

        send(proc, log, {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "session/new",
            "params": {
                "cwd": str(ROOT),
                "mcpServers": []
            }
        })

        session_result, _ = wait_for_response(q, log, 2, timeout=60)
        session_id = session_result.get("result", {}).get("sessionId")

        if not session_id:
            raise RuntimeError(f"sessionId não retornou: {session_result}")

        print(f"\nSESSION_ID={session_id}")
        log.write(f"\nSESSION_ID={session_id}\n")

        send(proc, log, {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "session/prompt",
            "params": {
                "sessionId": session_id,
                "prompt": [
                    {
                        "type": "text",
                        "text": "Responda exatamente com uma frase curta em português: ARGOS ACP persistente funcionando."
                    }
                ]
            }
        })

        final_response, text = wait_for_response(q, log, 3, timeout=180)

        log.write("\n=== RESPOSTA AGRUPADA ===\n")
        log.write(text.strip() + "\n")
        print("\n=== RESPOSTA AGRUPADA ===")
        print(text.strip())

        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)

        log.write(f"\nExit code: {proc.returncode}\n")
        print(f"\nLog salvo em: {LOG_PATH}")
        return 0

if __name__ == "__main__":
    raise SystemExit(main())
