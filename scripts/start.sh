#!/bin/sh
# Runs the standalone server locally (Docker uses deploy/entrypoint.sh instead).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SA="$ROOT/.next/standalone"
[ -f "$SA/server.js" ] || { echo "run npm run build first"; exit 1; }
# standalone output does not include static assets
rm -rf "$SA/.next/static" "$SA/public"
cp -r "$ROOT/.next/static" "$SA/.next/static"
cp -r "$ROOT/public" "$SA/public"
# server.js chdirs into .next/standalone, so make data paths absolute first
case "${SQLITE_PATH:-./data/app.sqlite}" in /*) ;; *) export SQLITE_PATH="$ROOT/${SQLITE_PATH:-./data/app.sqlite}";; esac
case "${DATA_RW_DIR:-./data/rw}" in /*) ;; *) export DATA_RW_DIR="$ROOT/${DATA_RW_DIR:-./data/rw}";; esac
exec node "$SA/server.js"
