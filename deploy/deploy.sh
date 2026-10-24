#!/bin/sh
# Preflight + liara deploy. Fails loudly on any error.
#   APP=<liara-app> sh deploy/deploy.sh          # full preflight, then deploy to <liara-app>
#   APP=<liara-app> SKIP_DOCKER=1 sh deploy/deploy.sh   # skip the local docker smoke build
# Without APP it falls back to the "app" field of liara.json.
# Apps in a team workspace: LIARA_TEAM_ID=<team id> (passed to liara as --team-id).
# LIARA_BUILD_LOCATION=germany (default) | iran — the iran builder can't pull node images from Docker Hub.
# Default: build Next locally and upload a copy-only image (deploy/Dockerfile.prebuilt). REMOTE_BUILD=1 = full Dockerfile on Liara.
set -eu
cd "$(dirname "$0")/.."
if [ -n "${APP:-}" ]; then APP_SRC=env; else APP="$(node -p "require('./liara.json').app")"; APP_SRC=liara.json; fi
VERSION="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"
say() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

say "1/4 typecheck + lint + unit tests"
npm run typecheck
npm run lint
npm run test:unit

say "2/4 data/app.sqlite.gz present and < 60 MB"
[ -f data/app.sqlite.gz ] || { echo "missing data/app.sqlite.gz (npm run build:db)"; exit 1; }
SZ=$(stat -c %s data/app.sqlite.gz)
[ "$SZ" -lt 60000000 ] || { echo "app.sqlite.gz is $SZ bytes (> 60 MB)"; exit 1; }
echo "app.sqlite.gz: $((SZ / 1000000)) MB"

say "3/4 fixtures present"
for f in products offers shops complexes areas scripted coverage; do [ -f "data/fixtures/$f.json" ] || { echo "missing data/fixtures/$f.json"; exit 1; }; done
echo ok

if [ "${SKIP_DOCKER:-0}" != "1" ] && command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  say "4/4 local docker build + run (fixtures) + curl"
  docker build -t torob-yar:preflight --build-arg APP_VERSION="$VERSION" .
  CID=$(docker run -d -p 3999:3000 -e DATA_SOURCE=fixtures -e LLM_MODE=scripted torob-yar:preflight)
  trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT
  i=0; until curl -fsS http://localhost:3999/api/health >/dev/null 2>&1; do i=$((i+1)); [ $i -gt 40 ] && { docker logs "$CID"; exit 1; }; sleep 1; done
  curl -fsS http://localhost:3999/api/health; echo
  curl -fsS http://localhost:3999/ | grep -q 'dir="rtl"' && echo "/ ok (rtl)"
else
  say "4/4 local docker check skipped"
fi

set --
[ -n "${LIARA_TEAM_ID:-}" ] && set -- --team-id "$LIARA_TEAM_ID"
if [ "${REMOTE_BUILD:-0}" = "1" ]; then
  # full multi-stage Dockerfile built by Liara (timed out at ~20 min in `next build` on 2026-10-23)
  SRC=.
else
  say "prebuilt: next build locally, stage a copy-only image (deploy/Dockerfile.prebuilt)"
  npm run build
  SRC=deploy/.tmp/prebuilt
  rm -rf "$SRC" && mkdir -p "$SRC"
  # a tar, because the Liara CLI never uploads node_modules directories (default ignore)
  tar -C .next/standalone --exclude='./data/rw*' --exclude='./.env*' -cf "$SRC/standalone.tar" .
  cp -r .next/static "$SRC/static"
  cp -r public "$SRC/public"
  cp -r data/fixtures "$SRC/fixtures"
  cp data/app.sqlite.gz deploy/entrypoint.sh liara.json "$SRC/"
  cp deploy/Dockerfile.prebuilt "$SRC/Dockerfile"
  if find "$SRC" -name '.env*' | grep -q .; then echo "refusing to upload .env files"; exit 1; fi
  echo "staged: $(du -sh "$SRC" | cut -f1)"
fi

say "liara deploy → $APP (from $APP_SRC, $VERSION${LIARA_TEAM_ID:+, team $LIARA_TEAM_ID})"
liara deploy --app "$APP" --platform docker --port 3000 --build-location "${LIARA_BUILD_LOCATION:-germany}" \
  --path "$SRC" --build-arg "APP_VERSION=$VERSION" --message "deploy $VERSION" --no-app-logs "$@"
say "deployed: https://$APP.liara.run (or your custom domain)"
