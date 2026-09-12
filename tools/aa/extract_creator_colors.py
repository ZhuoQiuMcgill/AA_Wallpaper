#!/usr/bin/env python3
"""Build shared/aa/creator-colors.json from a locally saved copy of the artificialanalysis.ai homepage.
Colours are AA's own chart colours. A colour is attached to an API creator only when
  (1) a chart entry's own model `id` exists in the language-model snapshot  -> source "chart_entry_id", or
  (2) the entry's logo file name (basename, minus extension and `_small`, `_` -> `-`) equals the creator_key exactly
      -> source "logo_name_match".
Anything else stays unmapped. No colours are invented.
Usage: extract_creator_colors.py <homepage.html> <snapshot_dir_with_page-N.json>"""
import json, re, sys
from collections import Counter, defaultdict
from pathlib import Path

def slugify(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")

def balanced(s, i):
    depth, j = 0, i
    while j < len(s):
        c = s[j]
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: return s[i:j + 1]
        elif c == '"':
            j += 1
            while j < len(s) and s[j] != '"':
                if s[j] == '\\': j += 1
                j += 1
        j += 1
    return None

def main(html_path, snap_dir):
    html = Path(html_path).read_text(encoding="utf-8", errors="ignore")
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, flags=re.S)
    payload = "".join(c.encode("utf-8").decode("unicode_escape", errors="ignore") for c in chunks)
    models = {}
    for f in sorted(Path(snap_dir).glob("page-*.json")):
        for m in json.load(open(f, encoding="utf-8"))["data"]:
            models[m["id"]] = m
    creators = {slugify(m["model_creator"]["name"]): m["model_creator"]["name"] for m in models.values()}

    by_id = defaultdict(Counter)      # creator_key -> Counter(colour)
    by_logo = defaultdict(Counter)    # logo_key    -> Counter(colour)
    hexre = re.compile(r"^#[0-9a-fA-F]{6}$")
    for mm in re.finditer(r'\{"id":"', payload):
        frag = balanced(payload, mm.start())
        if not frag or '"color"' not in frag: continue
        try: o = json.loads(frag)
        except Exception: continue
        color, logo = o.get("color"), o.get("logo")
        if not (isinstance(color, str) and hexre.match(color) and isinstance(logo, str)): continue
        if o.get("id") in models:
            by_id[slugify(models[o["id"]]["model_creator"]["name"])][color] += 1
        base = re.sub(r"\.(svg|png|jpg|jpeg|webp)$", "", logo.rsplit("/", 1)[-1])
        base = re.sub(r"_small$", "", base).replace("_", "-")
        by_logo[base][color] += 1

    def pick(counter):  # most frequent, tie -> lexicographic (deterministic)
        return sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]

    out = {}
    for key, name in sorted(creators.items()):
        if key in by_id:
            out[key] = {"name": name, "color": pick(by_id[key]), "source": "chart_entry_id",
                        "candidates": dict(by_id[key])}
        elif key in by_logo:
            out[key] = {"name": name, "color": pick(by_logo[key]), "source": "logo_name_match",
                        "candidates": dict(by_logo[key])}
        else:
            out[key] = {"name": name, "color": None, "source": None, "candidates": {}}
    res = {"generated_from": "artificialanalysis.ai homepage chart payload (local copy)",
           "rule": __doc__.strip().splitlines()[1:6], "creators": out}
    (Path(__file__).resolve().parent.parent.parent / "shared" / "aa" / "creator-colors.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    n_id = sum(1 for v in out.values() if v["source"] == "chart_entry_id")
    n_logo = sum(1 for v in out.values() if v["source"] == "logo_name_match")
    print(f"creators={len(out)} chart_entry_id={n_id} logo_name_match={n_logo} unmapped={len(out)-n_id-n_logo}")
    for k, v in out.items():
        if v["color"]: print(f"  {v['name']:40s} {v['color']}  {v['source']}  candidates={v['candidates']}")
    print("  unmapped:", ", ".join(v["name"] for v in out.values() if not v["color"]))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
