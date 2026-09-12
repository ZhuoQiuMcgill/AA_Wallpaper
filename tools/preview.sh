#!/usr/bin/env bash
# Render dist/<id>/index.html with headless Edge (Windows) from WSL.
# usage: preview.sh <wallpaper-id> <shot-name> [WxH] [query]     e.g. preview.sh constellation debug 2560,1440 "nofetch=1&debug=1"
# query params understood by the constellation renderer: debug=1 hover=<rank> focus=<creator_key> fakedelta=1 prop_<setting>=<value>
set -u
ID="${1:?wallpaper id}"; NAME="${2:-shot}"; SIZE="${3:-2560,1440}"; QUERY="${4:-nofetch=1}"
EDGE="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
ROOT_WIN="D:\\Projects\\AA_Wallpaper"; ROOT_WSL="/mnt/d/Projects/AA_Wallpaper"
mkdir -p "$ROOT_WSL/preview"
"$EDGE" --headless=new --disable-gpu --hide-scrollbars --no-first-run --disable-extensions \
  --user-data-dir="C:\\Users\\11206\\AppData\\Local\\Temp\\aa_edge_preview" \
  --window-size="$SIZE" --virtual-time-budget=6000 --enable-logging=stderr --log-level=0 \
  --screenshot="${ROOT_WIN}\\preview\\${NAME}.png" "file:///D:/Projects/AA_Wallpaper/dist/${ID}/index.html?${QUERY}" >"$ROOT_WSL/preview/${NAME}.log" 2>&1
grep -aE "CONSOLE|Uncaught" "$ROOT_WSL/preview/${NAME}.log" | grep -v "chrome-extension\|syncer" | sed -E 's/^\[[^]]*\] //' | head -20
ls -la "$ROOT_WSL/preview/${NAME}.png" 2>/dev/null | awk '{print $5" bytes "$9}'
