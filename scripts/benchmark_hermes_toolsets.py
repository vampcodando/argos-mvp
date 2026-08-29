import json
import os
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HERMES = Path(os.environ["LOCALAPPDATA"]) / "hermes" / "hermes-agent" / "venv" / "Scripts" / "hermes.exe"
OUT = ROOT / "tmp" / "hermes-toolset-benchmark-20260627.json"

TESTS = [
    {
        "name": "baseline_default_tools",
        "args": ["chat", "-q", "Responda apenas: OK BASELINE", "-Q", "--max-turns", "1", "--accept-hooks"],
    },
    {
        "name": "toolsets_empty",
        "args": ["chat", "-q", "Responda apenas: OK EMPTY", "-Q", "--max-turns", "1", "--accept-hooks", "-t", ""],
    },
    {
        "name": "toolsets_none",
        "args": ["chat", "-q", "Responda apenas: OK NONE", "-Q", "--max-turns", "1", "--accept-hooks", "-t", "none"],
    },
    {
        "name": "toolsets_clarify_only",
        "args": ["chat", "-q", "Responda apenas: OK CLARIFY", "-Q", "--max-turns", "1", "--accept-hooks", "-t", "clarify"],
    },
    {
        "name": "toolsets_file_terminal",
        "args": ["chat", "-q", "Responda apenas: OK FILE TERMINAL", "-Q", "--max-turns", "1", "--accept-hooks", "-t", "file,terminal"],
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
            timeout=180,
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
        return {
            "name": test["name"],
            "timeout": True,
            "stdout": (exc.stdout or "").strip() if isinstance(exc.stdout, str) else "",
            "stderr": (exc.stderr or "").strip() if isinstance(exc.stderr, str) else "",
        }

results = []

for test in TESTS:
    print(f"\n=== {test['name']} ===")
    result = run_test(test)
    results.append(result)
    print(f"tempo: {result.get('elapsed_seconds')}s")
    print(f"returncode: {result.get('returncode')}")
    print("stdout:")
    print(result.get("stdout", ""))
    print("stderr:")
    print(result.get("stderr", ""))

OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\nResultado salvo em: {OUT}")
