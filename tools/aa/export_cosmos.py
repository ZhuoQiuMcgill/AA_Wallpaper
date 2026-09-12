#!/usr/bin/env python3
"""export_cosmos.py — implements wallpapers/constellation/docs/data-spec.md (astra's Cosmos data spec).

Pipeline: fetch all pages of GET /api/v2/language/models/free (key from .env) -> store an immutable raw snapshot in
data/aa/language/snapshots/<fetched_at>/ -> normalise current AND previous snapshot with identical rules -> derive families /
creators / stats / selection / new_releases / movers -> validate -> write data/aa/language/cosmos-data.json -> print summary.

Only real data is used. null stays null, 0 stays 0. Creator colours come from shared/aa/creator-colors.json only.
Options: --no-fetch  reuse the newest local snapshot instead of calling the API (costs no quota).
"""
import json, math, re, sys, time, urllib.request, urllib.error, datetime as dt
from pathlib import Path
from collections import defaultdict, Counter

ROOT = Path(__file__).resolve().parent.parent.parent
SNAPS = ROOT / "data" / "aa" / "language" / "snapshots"
OUT = ROOT / "data" / "aa" / "language" / "cosmos-data.json"
COLORS = ROOT / "shared" / "aa" / "creator-colors.json"
BASE = "https://artificialanalysis.ai/api/v2"
ENDPOINT = "/language/models/free"
ATTRIBUTION = "Data: Artificial Analysis · artificialanalysis.ai"
SHORT_ORDER = ["max", "xhigh", "high", "medium", "low", "minimal", "non-reasoning", "reasoning"]  # spec §6 priority
SUFFIX = re.compile(r"^(.*?)\s*\(([^()]*)\)\s*$")   # last trailing (...) group only (spec §5)
DELTA_DECIMALS = 4
STAT_DECIMALS = 6

# ----------------------------------------------------------------------------- helpers
def slugify(s):  # spec §8
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")

def split_name(name):  # spec §5
    m = SUFFIX.match(name)
    return (m.group(1).strip(), m.group(2).strip()) if m else (name.strip(), None)

def short_variant(variant):  # spec §6: case-insensitive "contains", first match in priority order
    if variant is None:
        return None
    v = variant.lower()
    for k in SHORT_ORDER:
        if k in v:
            return k
    return variant

def g(obj, *path):
    for k in path:
        if not isinstance(obj, dict):
            return None
        obj = obj.get(k)
    return obj

def num_or_none(x):  # keep real numbers (incl. 0) and null; anything else is treated as "not measured"
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) else None

def rnd(x, d):
    return None if x is None else round(x, d)

def percentile_t7(sorted_vals, p):
    """Hyndman & Fan type 7 (linear interpolation between order statistics) — numpy.percentile default,
    Excel PERCENTILE.INC. p in [0,1], sorted_vals ascending, non-empty."""
    n = len(sorted_vals)
    if n == 1:
        return sorted_vals[0]
    h = (n - 1) * p
    lo, hi = math.floor(h), math.ceil(h)
    if lo == hi:
        return sorted_vals[lo]
    return sorted_vals[lo] + (h - lo) * (sorted_vals[hi] - sorted_vals[lo])

def none_last(v):  # sort key helper: (is_none, value)
    return (v is None, v if v is not None else 0)

# ----------------------------------------------------------------------------- fetch / snapshots
def load_key():
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("AA_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("AA_API_KEY not found in .env")

def call(path, key):
    req = urllib.request.Request(BASE + path, headers={"x-api-key": key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read().decode("utf-8", "replace")

def fetch_snapshot(key):
    pages, hdrs, page = [], {}, 1
    while True:
        status, hdrs, body = call(f"{ENDPOINT}?page={page}", key)
        if status != 200:
            sys.exit(f"API error {status} on page {page}: {body[:200]}")
        j = json.loads(body)
        pages.append((page, body, j))
        pg = j.get("pagination") or {}
        if not pg.get("has_more"):
            break
        page += 1
        if page > 50:
            sys.exit("pagination runaway (>50 pages)")
        time.sleep(0.3)
    fetched_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    stamp = fetched_at.strftime("%Y-%m-%dT%H-%M-%SZ")
    tmp = SNAPS / (stamp + ".tmp")
    tmp.mkdir(parents=True, exist_ok=False)
    for p, body, _ in pages:
        (tmp / f"page-{p}.json").write_text(body, encoding="utf-8")
    meta = {"fetched_at": fetched_at.strftime("%Y-%m-%dT%H:%M:%SZ"), "endpoint": BASE + ENDPOINT, "pages": len(pages),
            "ratelimit": {k: hdrs.get(k) for k in ("x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset")},
            "note": "fetched_at = UTC time when the last page finished downloading"}
    (tmp / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    final = SNAPS / stamp
    tmp.rename(final)
    return final

def load_snapshot(d):
    meta = json.load(open(d / "meta.json", encoding="utf-8"))
    files = sorted(d.glob("page-*.json"), key=lambda f: int(f.stem.split("-")[1]))
    return meta, [json.load(open(f, encoding="utf-8")) for f in files]

def list_snapshots():
    if not SNAPS.exists():
        return []
    out = []
    for d in SNAPS.iterdir():
        if d.is_dir() and (d / "meta.json").exists() and not d.name.endswith(".tmp"):
            out.append((json.load(open(d / "meta.json"))["fetched_at"], d))
    return sorted(out)

# ----------------------------------------------------------------------------- normalisation (spec §4-13), applied identically to every snapshot
FIELD_MAP = {  # normalised key -> path in the raw record
    "intelligence": ("evaluations", "artificial_analysis_intelligence_index"),
    "coding": ("evaluations", "artificial_analysis_coding_index"),
    "agentic": ("evaluations", "artificial_analysis_agentic_index"),
    "tps": ("performance", "median_output_tokens_per_second"),
    "ttft_s": ("performance", "median_time_to_first_token_seconds"),
    "ttfat_s": ("performance", "median_time_to_first_answer_token_seconds"),
    "e2e_s": ("performance", "median_end_to_end_response_time_seconds"),
    "price_in": ("pricing", "price_1m_input_tokens"),
    "price_out": ("pricing", "price_1m_output_tokens"),
    "price_cache_hit": ("pricing", "price_1m_cache_hit_tokens"),
    "price_cache_write": ("pricing", "price_1m_cache_write_tokens"),
    "cost_per_task": ("artificial_analysis_intelligence_index_cost", "cost_per_task", "total_cost"),
    "index_run_cost": ("artificial_analysis_intelligence_index_cost", "total_cost"),
}

def normalise(pages, fetched_at_iso, colors):
    fetch_date = dt.date.fromisoformat(fetched_at_iso[:10])
    versions = {str(p.get("intelligence_index_version")) for p in pages}
    if len(versions) != 1:
        sys.exit(f"pages disagree on intelligence_index_version: {versions}")
    raw_by_id, models = {}, []
    for p in pages:
        for r in p["data"]:
            raw_by_id[r["id"]] = r
            family, variant = split_name(r["name"])
            sv = short_variant(variant)
            creator = g(r, "model_creator", "name")
            ckey = slugify(creator) if creator else ""
            rel = r.get("release_date")
            days = (fetch_date - dt.date.fromisoformat(rel)).days if rel else None
            m = {
                "id": r["id"], "name": r["name"], "slug": r.get("slug"),
                "family": family, "family_key": slugify(family),
                "variant": variant, "short_variant": sv,
                "short_label": family + (f" ({sv})" if sv else ""),
                "creator": creator, "creator_key": ckey, "creator_id": g(r, "model_creator", "id"),
                "creator_color": (colors.get(ckey) or {}).get("color"),
                "release_date": rel, "days_since_release": days,
            }
            for k, path in FIELD_MAP.items():
                m[k] = num_or_none(g(r, *path))
            m.update({"rank_intelligence": None, "is_family_best": False, "rank_intelligence_family": None,
                      "prev_rank_intelligence": None, "prev_rank_intelligence_family": None,
                      "rank_delta": None, "family_rank_delta": None,
                      "previous_intelligence": None, "intelligence_delta": None})
            models.append(m)
    # §11 model rank
    ranked = sorted([m for m in models if m["intelligence"] is not None], key=lambda m: (-m["intelligence"], m["name"]))
    for i, m in enumerate(ranked, 1):
        m["rank_intelligence"] = i
    # §12 family best (intelligence desc, null last, name asc)
    groups = defaultdict(list)
    for m in models:
        groups[m["family_key"]].append(m)
    for key, ms in groups.items():
        ms.sort(key=lambda m: (m["intelligence"] is None, -(m["intelligence"] or 0), m["name"]))
        ms[0]["is_family_best"] = True
    # §13 family rank
    best_ranked = sorted([m for m in models if m["is_family_best"] and m["intelligence"] is not None],
                         key=lambda m: (-m["intelligence"], m["name"]))
    for i, m in enumerate(best_ranked, 1):
        m["rank_intelligence_family"] = i
    return models, raw_by_id, versions.pop(), groups

# ----------------------------------------------------------------------------- previous linking (spec §14-18)
def link_previous(models, prev_models):
    if prev_models is None:
        return
    by_id = {m["id"]: m for m in prev_models}
    prev_fam_rank = {m["family_key"]: m["rank_intelligence_family"] for m in prev_models if m["is_family_best"]}
    for m in models:
        p = by_id.get(m["id"])
        if p is not None:
            m["prev_rank_intelligence"] = p["rank_intelligence"]
            m["previous_intelligence"] = p["intelligence"]
            if m["intelligence"] is not None and p["intelligence"] is not None:
                m["intelligence_delta"] = rnd(m["intelligence"] - p["intelligence"], DELTA_DECIMALS)
            if m["rank_intelligence"] is not None and p["rank_intelligence"] is not None:
                m["rank_delta"] = p["rank_intelligence"] - m["rank_intelligence"]
        if m["is_family_best"] and m["family_key"] in prev_fam_rank:
            m["prev_rank_intelligence_family"] = prev_fam_rank[m["family_key"]]
            if m["rank_intelligence_family"] is not None and m["prev_rank_intelligence_family"] is not None:
                m["family_rank_delta"] = m["prev_rank_intelligence_family"] - m["rank_intelligence_family"]

# ----------------------------------------------------------------------------- derived structures (spec §19-25)
def build_families(models, groups):
    fams = []
    for key, ms in groups.items():
        best = next(m for m in ms if m["is_family_best"])
        others = sorted([m for m in ms if m is not best], key=lambda m: (m["intelligence"] is None, -(m["intelligence"] or 0), m["name"]))
        fams.append({
            "family": best["family"], "family_key": key,
            "creator": best["creator"], "creator_key": best["creator_key"], "creator_color": best["creator_color"],
            "best_model_id": best["id"], "best_model_name": best["name"], "best_short_label": best["short_label"],
            "rank": best["rank_intelligence_family"], "prev_rank": best["prev_rank_intelligence_family"],
            "rank_delta": best["family_rank_delta"],
            "intelligence": best["intelligence"], "previous_intelligence": best["previous_intelligence"],
            "intelligence_delta": best["intelligence_delta"],
            "coding": best["coding"], "agentic": best["agentic"],
            "tps": best["tps"], "ttft_s": best["ttft_s"], "ttfat_s": best["ttfat_s"], "e2e_s": best["e2e_s"],
            "price_in": best["price_in"], "price_out": best["price_out"], "cost_per_task": best["cost_per_task"],
            "release_date": best["release_date"], "days_since_release": best["days_since_release"],
            "variant_count": len(ms), "variant_ids": [best["id"]] + [m["id"] for m in others],
        })
    fams.sort(key=lambda f: (f["rank"] is None, f["rank"] or 0, f["family"]))
    return fams

def build_creators(models, families, colors):
    by_key = defaultdict(lambda: {"models": 0, "fams": []})
    for m in models:
        by_key[m["creator_key"]]["models"] += 1
    for f in families:
        by_key[f["creator_key"]]["fams"].append(f)
    out = []
    for key, d in by_key.items():
        name = next(m["creator"] for m in models if m["creator_key"] == key)
        cid = next(m["creator_id"] for m in models if m["creator_key"] == key)
        ranked = sorted([f for f in d["fams"] if f["rank"] is not None], key=lambda f: f["rank"])
        vals = sorted(f["intelligence"] for f in d["fams"] if f["intelligence"] is not None)
        info = colors.get(key) or {}
        out.append({
            "name": name, "key": key, "id": cid, "color": info.get("color"), "color_source": info.get("source"),
            "model_count": d["models"], "family_count": len(d["fams"]),
            "top_family_rank": ranked[0]["rank"] if ranked else None,
            "top_family_key": ranked[0]["family_key"] if ranked else None,
            "mean_family_intelligence": rnd(sum(vals) / len(vals), DELTA_DECIMALS) if vals else None,
            "median_family_intelligence": rnd(percentile_t7(vals, 0.5), DELTA_DECIMALS) if vals else None,
        })
    out.sort(key=lambda c: (c["top_family_rank"] is None, c["top_family_rank"] or 0, c["name"]))
    return out

STAT_FIELDS = ["intelligence", "coding", "agentic", "tps", "ttft_s", "ttfat_s", "e2e_s", "price_in", "price_out",
               "cost_per_task", "days_since_release"]

def build_stats(families):
    stats = {}
    for k in STAT_FIELDS:
        vals = sorted(f[k] for f in families if f[k] is not None)
        if not vals:
            stats[k] = {"count": 0, "min": None, "p05": None, "p10": None, "p25": None, "median": None,
                        "p75": None, "p90": None, "p95": None, "max": None}
            continue
        pct = lambda p: rnd(percentile_t7(vals, p), STAT_DECIMALS)
        stats[k] = {"count": len(vals), "min": vals[0], "p05": pct(0.05), "p10": pct(0.10), "p25": pct(0.25),
                    "median": pct(0.5), "p75": pct(0.75), "p90": pct(0.90), "p95": pct(0.95), "max": vals[-1]}
    return stats

def build_counts(models, families, creators):
    return {
        "models": len(models), "families": len(families), "creators": len(creators),
        "with_intelligence": sum(m["intelligence"] is not None for m in models),
        "with_coding": sum(m["coding"] is not None for m in models),
        "with_agentic": sum(m["agentic"] is not None for m in models),
        "with_speed": sum(m["tps"] is not None for m in models),
        "with_price": sum(m["price_in"] is not None and m["price_out"] is not None for m in models),
        "with_cost_per_task": sum(m["cost_per_task"] is not None for m in models),
        "families_with_multiple_variants": sum(f["variant_count"] > 1 for f in families),
        "new_models_30d": sum(m["days_since_release"] is not None and m["days_since_release"] <= 30 for m in models),
        "new_families_30d": sum(f["days_since_release"] is not None and f["days_since_release"] <= 30 for f in families),
    }

def build_selection(families):
    ranked = [f for f in families if f["rank"] is not None]  # already sorted by rank
    keys = lambda lo, hi: [f["family_key"] for f in ranked if lo <= f["rank"] <= hi]
    return {"core": keys(1, 40), "midfield": keys(41, 120), "background": keys(121, 300),
            "featured_systems": [f["family_key"] for f in ranked if f["rank"] <= 30 and f["variant_count"] >= 2]}

def build_new_releases(families):
    rows = [f for f in families if f["days_since_release"] is not None and f["days_since_release"] <= 30]
    rows.sort(key=lambda f: (f["days_since_release"], -(f["intelligence"] if f["intelligence"] is not None else -math.inf), f["family"]))
    return [{"family_key": f["family_key"], "release_date": f["release_date"], "days_since_release": f["days_since_release"],
             "rank": f["rank"], "intelligence": f["intelligence"]} for f in rows]

def build_movers(families, prev_models):
    if prev_models is None:
        return {"up": [], "down": [], "new": []}
    prev_keys = {m["family_key"] for m in prev_models}
    entry = lambda f: {"family_key": f["family_key"], "rank": f["rank"], "prev_rank": f["prev_rank"], "rank_delta": f["rank_delta"]}
    up = sorted([f for f in families if f["rank_delta"] is not None and f["rank_delta"] > 0], key=lambda f: (-f["rank_delta"], f["rank"]))
    down = sorted([f for f in families if f["rank_delta"] is not None and f["rank_delta"] < 0], key=lambda f: (f["rank_delta"], f["rank"]))
    new = sorted([f for f in families if f["family_key"] not in prev_keys], key=lambda f: (f["rank"] is None, f["rank"] or 0, f["family"]))
    return {"up": [entry(f) for f in up[:20]], "down": [entry(f) for f in down[:20]],
            "new": [{"family_key": f["family_key"], "rank": f["rank"], "intelligence": f["intelligence"]} for f in new[:20]]}

# ----------------------------------------------------------------------------- validation (spec §29)
def validate(doc, raw_by_id, prev_models):
    problems = []
    def check(cond, msg):
        if not cond:
            problems.append(msg)
    models, fams, sel = doc["models"], doc["families"], doc["cosmos_selection"]
    ids = [m["id"] for m in models]
    check(len(ids) == len(set(ids)), "duplicate model ids")
    check(all(m["family_key"] for m in models), "empty family_key")
    check(all(m["creator"] for m in models), "empty creator")
    r = [m["rank_intelligence"] for m in models if m["rank_intelligence"] is not None]
    check(len(r) == len(set(r)) and sorted(r) == list(range(1, len(r) + 1)), "rank_intelligence not unique/contiguous")
    fr = [m["rank_intelligence_family"] for m in models if m["rank_intelligence_family"] is not None]
    check(len(fr) == len(set(fr)) and sorted(fr) == list(range(1, len(fr) + 1)), "rank_intelligence_family not unique/contiguous")
    check(all(m["is_family_best"] for m in models if m["rank_intelligence_family"] is not None), "family rank on a non-best model")
    per_fam = Counter(m["family_key"] for m in models if m["is_family_best"])
    fam_keys = {m["family_key"] for m in models}
    check(set(per_fam) == fam_keys and all(v == 1 for v in per_fam.values()), "each family must have exactly one best")
    check(len(fams) == len(fam_keys) == len({f["family_key"] for f in fams}), "families length != unique family_key count")
    by_id = {m["id"]: m for m in models}
    for f in fams:
        check(f["best_model_id"] in by_id and by_id[f["best_model_id"]]["is_family_best"], f"best_model_id invalid for {f['family_key']}")
        check(all(v in by_id and by_id[v]["family_key"] == f["family_key"] for v in f["variant_ids"]), f"variant_ids invalid for {f['family_key']}")
        check(len(f["variant_ids"]) == f["variant_count"] == sum(m["family_key"] == f["family_key"] for m in models), f"variant_count mismatch {f['family_key']}")
    # null / zero fidelity against the raw API records
    for m in models:
        raw = raw_by_id[m["id"]]
        for k, path in FIELD_MAP.items():
            rv = g(raw, *path)
            if rv is None:
                check(m[k] is None, f"{m['id']} {k}: raw null became {m[k]!r}")
            else:
                check(m[k] == rv, f"{m['id']} {k}: raw {rv!r} became {m[k]!r}")
        check(m["release_date"] == raw.get("release_date"), f"{m['id']} release_date altered")
    # selection
    allsel = sel["core"] + sel["midfield"] + sel["background"]
    fam_by_key = {f["family_key"]: f for f in fams}
    check(len(allsel) == len(set(allsel)), "selection tiers overlap")
    check(all(k in fam_by_key for k in allsel + sel["featured_systems"]), "selection key missing from families")
    check(all(fam_by_key[k]["variant_count"] >= 2 for k in sel["featured_systems"]), "featured_systems with <2 variants")
    check([fam_by_key[k]["rank"] for k in sel["core"]] == list(range(1, len(sel["core"]) + 1)), "core ranks not 1..n")
    # previous
    prev_fields = ["prev_rank_intelligence", "prev_rank_intelligence_family", "rank_delta", "family_rank_delta",
                   "previous_intelligence", "intelligence_delta"]
    if prev_models is None:
        check(all(m[k] is None for m in models for k in prev_fields), "previous fields set without a previous snapshot")
        check(doc["previous_fetched_at"] is None and not any(doc["movers"].values()), "movers/previous_fetched_at set without previous")
    else:
        pid = {m["id"] for m in prev_models}
        check(all((m["id"] in pid) or all(m[k] is None for k in prev_fields[:1] + prev_fields[4:]) for m in models), "prev fields on model absent from previous")
        for m in models:
            if m["rank_delta"] is not None:
                check(m["rank_delta"] == m["prev_rank_intelligence"] - m["rank_intelligence"], "rank_delta arithmetic")
    return problems

# ----------------------------------------------------------------------------- main
def main():
    no_fetch = "--no-fetch" in sys.argv
    colors = json.load(open(COLORS, encoding="utf-8"))["creators"]
    existing = list_snapshots()
    if no_fetch:
        if not existing:
            sys.exit("no local snapshot to reuse")
        cur_dir = existing[-1][1]
        prev_entry = existing[-2] if len(existing) >= 2 else None
    else:
        cur_dir = fetch_snapshot(load_key())
        prev_entry = existing[-1] if existing else None
    cur_meta, cur_pages = load_snapshot(cur_dir)
    models, raw_by_id, version, groups = normalise(cur_pages, cur_meta["fetched_at"], colors)
    prev_models, prev_fetched_at = None, None
    if prev_entry:
        prev_meta, prev_pages = load_snapshot(prev_entry[1])
        prev_models, _, _, _ = normalise(prev_pages, prev_meta["fetched_at"], colors)
        prev_fetched_at = prev_meta["fetched_at"]
    link_previous(models, prev_models)
    families = build_families(models, groups)
    creators = build_creators(models, families, colors)
    models.sort(key=lambda m: (m["rank_intelligence"] is None, m["rank_intelligence"] or 0, m["name"]))
    doc = {
        "schema_version": 1,
        "source": "Artificial Analysis", "source_url": "https://artificialanalysis.ai/", "attribution": ATTRIBUTION,
        "fetched_at": cur_meta["fetched_at"], "previous_fetched_at": prev_fetched_at,
        "intelligence_index_version": version,
        "method": {
            "endpoint": cur_meta["endpoint"], "pages_fetched": cur_meta["pages"],
            "percentile": "Hyndman & Fan type 7 (linear interpolation; numpy.percentile default / Excel PERCENTILE.INC), sample = families[] (family-best records), nulls dropped, zeros kept",
            "rounding": f"raw API values untouched; derived deltas and creator means rounded to {DELTA_DECIMALS} dp; percentiles to {STAT_DECIMALS} dp",
            "creator_color": "from shared/aa/creator-colors.json only; color_source 'chart_entry_id' = AA chart entry whose model id is in this snapshot, 'logo_name_match' = AA logo file name equals creator_key exactly; otherwise null",
            "with_price": "price_in and price_out both non-null", "with_speed": "tps non-null",
            "new_families_30d": "families whose best record has days_since_release <= 30 (same rule as new_releases)",
            "extensions_beyond_spec": ["models[].creator_id (model_creator.id, required by spec §2)", "creators[].id", "creators[].color_source", "this method block"],
        },
        "counts": build_counts(models, families, creators),
        "stats": build_stats(families),
        "creators": creators, "families": families, "models": models,
        "cosmos_selection": build_selection(families),
        "new_releases": build_new_releases(families),
        "movers": build_movers(families, prev_models),
    }
    problems = validate(doc, raw_by_id, prev_models)
    if problems:
        print("VALIDATION FAILED:\n  " + "\n  ".join(problems[:40]), file=sys.stderr)
        sys.exit(2)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")

    # ---- summary (spec §30)
    c = doc["counts"]
    print("Artificial Analysis snapshot complete\n")
    print(f"Fetched at: {doc['fetched_at']}\nIndex version: {version}\nSnapshot dir: {cur_dir.relative_to(ROOT)}\n")
    print(f"Models: {c['models']}\nFamilies: {c['families']}\nCreators: {c['creators']}\n")
    print(f"With intelligence: {c['with_intelligence']}\nWith coding: {c['with_coding']}\nWith agentic: {c['with_agentic']}\n"
          f"With speed: {c['with_speed']}\nWith pricing: {c['with_price']}\nWith cost per task: {c['with_cost_per_task']}\n")
    print(f"Multi-variant families: {c['families_with_multiple_variants']}\nReleased in last 30d: {c['new_models_30d']} models / {c['new_families_30d']} families\n")
    if prev_models is None:
        print("Previous snapshot: NOT FOUND\nMovement data left null/empty.\n")
    else:
        gap = (dt.datetime.fromisoformat(doc['fetched_at'].replace('Z', '+00:00')) - dt.datetime.fromisoformat(prev_fetched_at.replace('Z', '+00:00')))
        print(f"Previous snapshot: FOUND ({prev_fetched_at}, {gap.total_seconds()/3600:.2f} h earlier, {len(prev_models)} models)")
        mv = doc["movers"]
        print("Largest upward family movement:\n  " + (f"{mv['up'][0]['family_key']} {mv['up'][0]['prev_rank']} -> {mv['up'][0]['rank']} (+{mv['up'][0]['rank_delta']})" if mv["up"] else "none"))
        print("Largest downward family movement:\n  " + (f"{mv['down'][0]['family_key']} {mv['down'][0]['prev_rank']} -> {mv['down'][0]['rank']} ({mv['down'][0]['rank_delta']})" if mv["down"] else "none"))
        print(f"New families since previous: {len(mv['new'])}" + (" -> " + ", ".join(n['family_key'] for n in mv['new'][:10]) if mv['new'] else ""))
        changed = [m for m in models if m["intelligence_delta"]]
        print(f"Models whose intelligence changed: {len(changed)}\n")
    print("Top 10 family leaderboard:")
    for f in families[:10]:
        print(f"{f['rank']:2d}. {f['best_short_label']}  ({f['creator']})  {f['intelligence']}")
    # diagnostics
    sv_diag = [(m["variant"], m["short_variant"]) for m in models if m["variant"] and m["short_variant"] in SHORT_ORDER
               and not re.search(r"\b" + re.escape(m["short_variant"]) + r"\b", m["variant"], re.I)]
    neg = sum(1 for m in models if m["days_since_release"] is not None and m["days_since_release"] < 0)
    print(f"\nDiagnostics: short_variant substring-vs-whole-word disagreements: {len(sv_diag)} {sv_diag[:5]}; negative days_since_release: {neg}")
    print(f"Validation: all checks passed. Output: {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1024:.0f} KB)")

if __name__ == "__main__":
    main()
