# AA Family Constellations — visual concept demo

This is a **Wallpaper Engine Web wallpaper concept demo**. It is intentionally focused on visual language and information presentation, not production implementation architecture.

## What this demo is testing

- Raw model ranking remains directly readable: every ranked star shows **rank + Intelligence score**.
- Models sharing the same real `family_key` form one constellation.
- Constellations do **not** use a uniform hub-and-spoke structure.
- A constellation grammar creates varied silhouettes: diamond-tail, crown, open Lyra, Gemini/twin columns, serpent, dipper, hook, fork, zig-zag, etc.
- The strongest model in a family is visually dominant but does not have to sit in the geometric center.
- Family size is visible through the number of ranked stars inside the constellation.
- Creator color is preserved as the constellation hue (with a render-only luminance lift for very dark colors so they remain visible on a dark wallpaper).
- Hover reveals secondary telemetry without crowding the default view.

## Data

The bundled demo uses the supplied real `cosmos-data.json` snapshot and displays the **Top 40 raw model ranking** (`rank_intelligence`), not the family-deduplicated ranking.

## Wallpaper Engine

Drag `index.html` into **Create Wallpaper** as a Web wallpaper. The folder already includes `project.json` and all required local files.
