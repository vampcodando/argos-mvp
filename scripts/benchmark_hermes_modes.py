import json
import os
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HERMES = Path(os.environ["LOCALAPPDATA"]) / "hermes" / "hermes-agent" / "venv" / "Scripts" / "hermes.exe"
OUT = ROOT / "tmp" / "hermes-mode-benchmark-20260627.json"

TESTS = [
    {
        "name": "chat_q_quiet_baseline",
        "args": [
            "chat",
            "-q", "Responda apenas: OK ARGOS BASELINE",
            "-Q",
            "--max-turns", "1",
            "--accept-hooks",
        ],
        "timeout": 180,
    },
    {
        "name": "chat_q_quiet_ignore_rules",
        "args": [
            "chat",
            "-q", "Responda apenas: OK ARGOS IGNORE RULES",
            "-Q",
            "--max-turns", "1",
            "--accept-hooks",
            "--ignore-rules",
        ],
        "timeout": 180,
    },
    {
        "name": "chat_q_quiet_safe_mode",
        "args": [
            "chat",
            "-q", "Responda apenas: OK ARGOS SAFE MODE",
            "-Q",
            "--max-turns", "1",
            "--accept-hooks",
            "--safe-mode",
        ],
        "timeout": 180,
    },
]

def run_test(test):
    started = time.perf_counter()
    try:
        proc = subprocess.run(
            [str(HERMES), *test["args"]],
            cwd=str(ROOT),
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=test["timeout"],
        )
        elapsed = round(time.perf_counter() - started, 2)
        return {
            "name": test["name"],
            "elapsed_seconds": elapsed,
            "returncode": proc.returncode,
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip(),
        }
    except subprocess.TimeoutExpired as exc:
        elapsed = round(time.perf_counter() - started, 2)
        return {
            "name": test["name"],
            "elapsed_seconds": elapsed,
            "timeout": True,
            "stdout": (exc.stdout or "").strip() if isinstance(exc.stdout, str) else "",
            "stderr": (exc.stderr or "").strip() if isinstance(exc.stderr, str) else "",
        }

def main():
    print(f"Hermes: {HERMES}")
    print(f"Exists: {HERMES.exists()}")

    results = []
    for test in TESTS:
        print(f"\n=== {test['name']} ===")
        result = run_test(test)
        results.append(result)
        print(f"tempo: {result['elapsed_seconds']}s")
        print(f"returncode: {result.get('returncode')}")
        print("stdout:")
        print(result.get("stdout", ""))
        print("stderr:")
        print(result.get("stderr", ""))

    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nResultado salvo em: {OUT}")

if __name__ == "__main__":
    main()
