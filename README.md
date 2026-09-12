# AA_Wallpaper

Artificial Analysis leaderboards as Wallpaper Engine live wallpapers. One repository hosts several wallpapers (different leaderboards, different art directions) on top of a shared data layer and tool chain.

## Layout

| Path | What it is |
|---|---|
| `wallpapers/<id>/` | **One wallpaper per folder**: `src/` (HTML/CSS/JS, opens directly in a browser for development), `docs/` (art direction, data spec, implementation notes), `reference/` (concept demos and other reference material), `wallpaper.json` (build manifest), `README.md` (end-user install notes) |
| `shared/` | Single-sourced modules copied into every wallpaper at build time: `we/we-bridge.js` (Wallpaper Engine property/FPS bridge), `aa/aa-fetch.js` (Artificial Analysis client: pagination, cache, throttling, history, back-off; endpoint configurable), `aa/language/aa-normalize.js` (language-model leaderboard normaliser), `aa/creator-colors.json` (creator colours as used on AA's own charts), `we/probe/` (runtime probe wallpaper for diagnosing the WE browser) |
| `data/aa/<feed>/` | Development-side data: `snapshots/` (immutable raw API snapshots), `raw/` (ad-hoc pulls), `cosmos-data.json` (normalised export). Not for public redistribution — see *Data and licensing* |
| `docs/` | Cross-wallpaper knowledge: `01-research.md` (AA API and WE mechanics, zh), `02-data-and-platform-facts.md` (data fields and WE platform facts, zh), `adding-a-wallpaper.md` |
| `tools/` | `build.py`, `deploy.py`, `preview.sh`, `aa/` (pull / export / colour extraction), `tests/` |
| `dist/<id>/` | Build output = the self-contained folder that goes into Wallpaper Engine (git-ignored) |

## Wallpapers

- **`constellation` — AI Constellation Leaderboard.** The Intelligence Index drawn as a sky atlas: companies are constellations, model families are closed asterisms, ranked variants are stars. See `wallpapers/constellation/README.md`.

## Everyday commands

```bash
python3 tools/build.py constellation                 # assemble dist/constellation/ (--no-bundle-data = public build without AA data)
python3 tools/deploy.py constellation                # rsync into Wallpaper Engine's myprojects/ (override path with WE_PROJECTS_DIR)
tools/preview.sh constellation shot 2560,1440 "nofetch=1&debug=1"   # headless Edge screenshot into preview/
node.exe tools/tests/test_normalize.mjs              # JS normaliser vs Python export, field by field
node.exe tools/tests/test_layout.mjs 40 2560 1440    # packing test for the constellation layout engine
node.exe tools/tests/test_fetch.mjs                  # stubbed test of the data client (build first)
python3 tools/aa/export_cosmos.py                    # pull a fresh snapshot and export (4 API requests; --no-fetch to recompute only)
```

Put your key in `.env` as `AA_API_KEY=...` (git-ignored). Development tooling needs Python 3 plus Node and Edge on the Windows side; the wallpapers themselves have no dependencies.

## Data and licensing

Data comes from the [Artificial Analysis](https://artificialanalysis.ai/) Data API under the user's own free key; attribution is shown in every wallpaper as required by AA's terms. The snapshots under `data/aa/` and the bundled snapshot inside a default build are AA's data — keep them out of public releases (`tools/build.py --no-bundle-data`) unless AA grants redistribution.
