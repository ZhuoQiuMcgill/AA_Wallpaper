# Implementation notes — `wallpapers/constellation/`

> Implements the art direction in `art-direction.md` (gpt astra, with the user's amendments at the end of that file). Visual decisions follow that document; this file records the engineering.

## Files

| File | Role |
|---|---|
| `src/index.html` / `src/styles.css` | Page skeleton and all visual styling. Fonts are the Windows system fonts Segoe UI Variable + Cascadia Mono (nothing loaded from the web) |
| `src/project.json` | Wallpaper Engine project definition and user properties: `apikey`, `refreshhours`, `topn`, `rankwindow`, `ambientmotion`, `dimstars`, `skywidth`, `skyheight`, `showbackground`, `showlegend` |
| `shared/we/we-bridge.js` | The single `window.wallpaperPropertyListener`; forwards user properties as `aa:props` events and the FPS cap as `aa:general`. `?prop_x=` query params emulate properties outside WE |
| `shared/aa/language/aa-normalize.js` | JS port of `tools/aa/export_cosmos.py` (family/variant parsing, ranks, family best, previous-snapshot linking, families/counts). `tools/tests/test_normalize.mjs` checks it field by field against `data/aa/language/cosmos-data.json` |
| `shared/aa/aa-fetch.js` | Data client: pages through the configured endpoint, caches raw pages plus a compact rank history in `localStorage`, throttles to one refresh per `refreshhours` (checked every minute by timestamp, so it catches up after WE pauses), exponential back-off on errors (15 min → 4 h), emits `aa:data` / `aa:status`. Rank change = comparison with the newest history snapshot at least `rankwindow` days old (falls back to the oldest one). Nothing is fabricated |
| `src/js/layout.js` | Layout engine (pure functions). **Constellation = company, asterism = model family, star = ranked variant.** Asterisms: 1 star = point, 2 = pair, ≥3 = irregular *closed* polygon (3–5 vertices) plus an optional tail, with rotation / aspect / vertex jitter seeded by `family_key`. Constellations: asterisms packed compactly around the strongest one and joined by single faint link edges; the whole figure is scaled from 0.72× upward until labels fit; every star label picks a side (R/L/T/B, exhaustive for ≤6 stars, coordinate descent above) to minimise line crossings; edges are trimmed at the glyphs and broken where they would cross a label; the company name sits under the figure. Dim stars (ranks N+1..2N of the same company) are scattered inside the constellation box without lines. Global: first-fit packing along a golden-angle spiral, constrained to an ellipse (user-adjustable) so the desktop corners stay free; the first item is nudged outward if the rest do not fit; the arrangement is re-centred; if it still fails the UI scale steps down and finally the ellipse is dropped |
| `src/js/app.js` | Renderer: canvas background (star dust, very faint nebulae, unranked families as background stars, an occasional meteor), SVG edges, DOM stars and labels (line 2 = "family · effort"), hover "observatory annotation" with an observation line (placed where it overlaps the fewest labels), click to focus a company (others dim, dim stars show their rank), slow drift (minute-scale sines scaled by `ambientmotion`), FPS throttling from WE's cap |
| `js/creator-colors.js` (generated) | Creator colours from `shared/aa/creator-colors.json` |
| `js/history-seed.js` (generated) | Compact real snapshots from `data/aa/language/snapshots/*`, the rank-change baseline until the wallpaper has its own history |
| `data/cosmos-data.js` (generated) | Bundled real snapshot shown until the API key is set (omitted by `--no-bundle-data`) |
| `src/preview.png` | Thumbnail for the WE library (downscaled headless render) |

## Data flow
```
WE properties ─▶ we-bridge ─▶ aa:props ─▶ aa-fetch (key / interval / window) ─▶ fetch pages ─▶ aa-normalize ─▶ window.COSMOS_DATA ─▶ aa:data ─▶ app.js
                             └▶ app.js (topn / motion / ellipse / legend)                 localStorage: aa.language.pages.v1 / .history.v1 / .lastFetch.v1
```
Start-up order: cached raw pages if present → otherwise the bundled snapshot; once a key is set, a fetch runs immediately if the cache is older than the interval.

## Regeneration behaviour
The layout is deterministic (seeded by company/family keys, no randomness): same data + viewport + settings ⇒ identical sky. A refresh that changes nothing in the top 2N re-renders pixel-identical; rank swaps inside a family swap vertices; a change in a family's star count re-shapes that asterism and can re-pack the whole sky. Restarting the PC replays the cached data through the same layout ⇒ same sky, no API call. Cost measured in headless Edge at 2560×1440: ~30 ms layout + 6 ms DOM for top 40; ~650 ms for top 60 (needs two UI-scale retries). A future improvement is incremental layout (keep previous positions, move only what changed).

## Tools
- `python3 tools/build.py constellation` — assemble `dist/constellation/` (copies `src/` + shared modules, generates creator colours / history seed / bundled snapshot; `--no-bundle-data` for public builds)
- `node.exe tools/tests/test_normalize.mjs`, `node.exe tools/tests/test_layout.mjs [N W H]`, `node.exe tools/tests/test_fetch.mjs` — parity / packing / data-client tests
- `tools/preview.sh constellation <name> [W,H] [query]` — headless Edge screenshot of `dist/constellation/` into `preview/`; query supports `debug=1` (bounding boxes, ellipse, timing), `hover=<rank>`, `focus=<creator_key>`, `fakedelta=1` (preview-only synthetic rank deltas to check the arrow styling), `prop_topn=30` etc.
- `python3 tools/deploy.py constellation` — rsync `dist/constellation/` into `…\wallpaper_engine\projects\myprojects\ai-constellation-leaderboard\`

## Verified / to verify inside Wallpaper Engine
Verified (headless Edge at 2560×1440 and 1437×1242, Node): zero label overlaps, edges aligned to stars, hover / focus / arrow / newborn styling, data-client logic, normaliser parity.
To confirm on the desktop: `innerWidth/innerHeight` = 2560×1440; status changes from "NO API KEY" to "LIVE · N REQUESTS LEFT TODAY · NEXT hh:mmZ" after the key is entered; mouse hover/click work on the desktop layer; drift feels right at 15 fps. Debugging: WE settings → General → CEF devtools port 8080 → open localhost:8080 in Chrome.
