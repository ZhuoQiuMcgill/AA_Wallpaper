# Adding a wallpaper

1. Create `wallpapers/<id>/{src,docs,reference}`. `src/` needs at least `index.html`, `project.json` (Wallpaper Engine project definition and user properties) and `preview.png`.
2. Write `wallpapers/<id>/wallpaper.json`:
   ```json
   { "id": "<id>", "title": "...", "deploy_folder": "<folder name under WE myprojects>",
     "shared": ["we/we-bridge.js", "aa/aa-fetch.js", "aa/language/aa-normalize.js"],
     "data": { "creator_colors": true, "history_seed": "aa/language", "bundle_snapshot": "aa/language" } }
   ```
   Files listed in `shared` are copied to `dist/<id>/js/<basename>`; reference them from `index.html` as `<script src="js/...">`.
3. Data: for the language-model leaderboard use `aa-fetch.js` + `aa-normalize.js` and listen for `aa:data` / `aa:status` / `aa:props` / `aa:general` in the page (contract in `docs/02-data-and-platform-facts.md` §B/§C). For another leaderboard (e.g. text-to-image Elo) add a normaliser under `shared/aa/<feed>/` and set `window.AA_FETCH_CONFIG = { path, storage, normalizer }` before loading `aa-fetch.js`.
4. Art: keep the art direction in `docs/art-direction.md`; the renderer only reads the normalised data object. Emulate WE properties in a browser with `?prop_<name>=<value>` and skip the network with `?nofetch=1`.
5. Build and verify: `python3 tools/build.py <id>` → `tools/preview.sh <id> shot` → `python3 tools/deploy.py <id>` → apply in WE and enter the API key.
6. Wallpaper-specific tests live in `tools/tests/` and import from `wallpapers/<id>/src/js/*`.
