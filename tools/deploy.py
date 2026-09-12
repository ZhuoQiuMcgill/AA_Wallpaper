#!/usr/bin/env python3
"""Copy dist/<id>/ into Wallpaper Engine's myprojects folder (only our own folder is touched).
usage: deploy.py <wallpaper-id>      env WE_PROJECTS_DIR overrides the Wallpaper Engine projects path."""
import json, os, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
WE = Path(os.environ.get("WE_PROJECTS_DIR", "/mnt/d/Steam/steamapps/common/wallpaper_engine/projects/myprojects"))
wid = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
manifest = json.load(open(ROOT / "wallpapers" / wid / "wallpaper.json", encoding="utf-8"))
src, dst = ROOT / "dist" / wid, WE / manifest["deploy_folder"]
if not (src / "index.html").exists(): sys.exit(f"dist/{wid} not built — run tools/build.py {wid} first")
dst.mkdir(parents=True, exist_ok=True)
subprocess.run(["rsync", "-a", "--delete", f"{src}/", f"{dst}/"], check=True)
print(f"deployed dist/{wid} -> {dst}")
