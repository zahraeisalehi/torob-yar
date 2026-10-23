#!/bin/sh
# Preflight + liara deploy. Fails loudly on any error.
#   sh deploy/deploy.sh                          # full preflight; app name from liara.json (torob-yar-app)
#   SKIP_DOCKER=1 sh deploy/deploy.sh            # skip the local docker smoke build
set -eu
cd "$(dirname "$0")/.."
APP="${APP:-$(node -p "require('./liara.json').app")}"
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

say "liara deploy → $APP ($VERSION)"
liara deploy --app "$APP" --platform docker --port 3000 --build-location iran \
  --build-arg "APP_VERSION=$VERSION" --message "deploy $VERSION" --no-app-logs
