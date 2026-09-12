#!/usr/bin/env python3
"""Research tool: pull raw responses from the Artificial Analysis Data API into data/aa/<language|media|other>/raw/.
Reads AA_API_KEY from .env. Never prints the key. Each call costs 1 request of the daily quota."""
import json, os, sys, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
def raw_dir(path):
    cat = "language" if path.startswith(("/language", "/data/llms")) else "media" if path.startswith("/media") else "other"
    d = ROOT / "data" / "aa" / cat / "raw"; d.mkdir(parents=True, exist_ok=True); return d

def load_key():
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("AA_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("AA_API_KEY not found in .env")

BASE = "https://artificialanalysis.ai/api/v2"

def call(path, key):
    req = urllib.request.Request(BASE + path, headers={"x-api-key": key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8")
            hdrs = {k.lower(): v for k, v in r.headers.items()}
            return r.status, hdrs, body
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read().decode("utf-8", "replace")

def main():
    key = load_key()
    paths = sys.argv[1:] or ["/language/models/free?page=1"]
    for p in paths:
        status, hdrs, body = call(p, key)
        fname = p.strip("/").replace("/", "_").replace("?", "_").replace("=", "-") + ".json"
        (raw_dir(p) / fname).write_text(body, encoding="utf-8")
        rl = {k: hdrs.get(k) for k in ("x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "retry-after")}
        size = len(body)
        summary = ""
        try:
            j = json.loads(body)
            if isinstance(j, dict):
                data = j.get("data")
                n = len(data) if isinstance(data, list) else ("obj" if isinstance(data, dict) else "-")
                summary = f"tier={j.get('tier')} iiv={j.get('intelligence_index_version')} pagination={j.get('pagination')} n={n} error={j.get('error')}"
            elif isinstance(j, list):
                summary = f"list n={len(j)}"
        except Exception as ex:
            summary = f"(not json: {ex})"
        print(f"{status}  {p}\n      -> {fname} ({size} bytes)\n      {summary}\n      ratelimit={rl}")
        time.sleep(0.5)

if __name__ == "__main__":
    main()
