#!/bin/sh
# Demo-recording mode: build if stale, reset inquiries + overrides, start the production server on :3000, warm up the LLM.
# The bot auto-resolves the top-3 inquiries but leaves user questions for a human at /shop.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT="${PORT:-3000}"

if curl -s -o /dev/null "http://localhost:$PORT/api/health"; then
  echo "port $PORT is already in use; stop that server first"; exit 1
fi

# secrets (BOXAPI_API_KEY etc.) — the standalone server does not read .env.local itself
if [ -f .env.local ]; then set -a; . ./.env.local; set +a; fi
export DATA_SOURCE=sqlite LLM_MODE=auto AUTO_REPLY=1 AUTO_REPLY_SKIP_QUESTIONS=1 PORT HOSTNAME=0.0.0.0
export SQLITE_PATH="${SQLITE_PATH:-./data/app.sqlite}" DATA_RW_DIR="${DATA_RW_DIR:-./data/rw}"

if [ ! -f "$SQLITE_PATH" ]; then
  if [ -f "$SQLITE_PATH.gz" ]; then echo "› unpacking $SQLITE_PATH.gz"; gunzip -k "$SQLITE_PATH.gz"
  else echo "› $SQLITE_PATH missing; building it"; npm run build:db; fi
fi

# build only when the output is missing or older than any source/config file
if [ ! -f .next/standalone/server.js ] || [ ! -f .next/BUILD_ID ] \
  || [ -n "$(find src public scripts/copy-assets.mjs next.config.* package.json package-lock.json -newer .next/BUILD_ID -print -quit 2>/dev/null)" ]; then
  echo "› building"; npm run build
else
  echo "› build is up to date"
fi

# reset demo state (server is not running, so delete the store files directly)
mkdir -p "$DATA_RW_DIR"
rm -f "$DATA_RW_DIR"/inquiries.sqlite "$DATA_RW_DIR"/inquiries.sqlite-wal "$DATA_RW_DIR"/inquiries.sqlite-shm
echo "› inquiries and overrides reset"

sh scripts/start.sh &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' INT TERM

i=0
until curl -sf -o /dev/null "http://localhost:$PORT/api/health"; do
  i=$((i + 1)); [ $i -gt 60 ] && { echo "server did not come up"; kill $SERVER; exit 1; }
  sleep 0.5
done

echo "› warming up (هندزفری بی‌سیم)"
T0=$(date +%s)
MODE=$(curl -s -X POST "http://localhost:$PORT/api/chat" -H 'content-type: application/json' \
  --data '{"messages":[{"role":"user","text":"هندزفری بی‌سیم"}]}' | grep -o '"mode":"[a-z]*"' || true)
echo "› warm-up done in $(( $(date +%s) - T0 )) s ${MODE:-(no mode in response)}"
echo "› ready: http://localhost:$PORT  ·  shop inbox: http://localhost:$PORT/shop  ·  Ctrl+C to stop"
wait $SERVER
