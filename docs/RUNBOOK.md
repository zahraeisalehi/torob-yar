# RUNBOOK — Torob-yar on Liara

> **Status (2026-10-23): LIVE at https://torob-yar-app.liara.run** — app `torob-yar-app` in team workspace `6ad87ba7cf87f9a8e45d4d3a` (docker, medium-g2, feature plan basic), disk `data` 1 GB → `/app/data-rw`. Smoke 7/7 ✓, live e2e 12/12 at 390×844 + 1440×900 (screenshots `e2e/screenshots/live/`), inquiries survive `liara app restart`.
> `torob-yar` (and so `https://torob-yar.liara.run`) is **not** in this team: `liara app list --team-id …` lists only `torob-yar-app`, and the name belongs to another Liara account. When `torob-yar` exists in the team, follow "Move to another app/domain" with `APP=torob-yar`.

Everything below is app-name-agnostic: set two variables once per shell and copy the commands as-is.

```bash
export LIARA_TEAM_ID=6ad87ba7cf87f9a8e45d4d3a   # the team workspace that owns the apps (deploy.sh reads it too)
APP=torob-yar-app                  # the live app (see the status note above about `torob-yar`)
URL=https://$APP.liara.run         # or your custom domain once attached
```

Every `liara` command needs `--team-id "$LIARA_TEAM_ID"`: the apps live in a team workspace, not the personal account (without it the CLI says there are no apps). Network: **`torob-yar-net`**. `liara.json` holds a default app name (`torob-yar-app`), but `deploy/deploy.sh` always deploys to `$APP` when it's set.



## First-time setup (in order)

```bash
liara whoami                                   # confirm the login
liara network list --team-id "$LIARA_TEAM_ID"  # torob-yar-net already exists (created 2026-10-23)

# 1. The app: create it in the Liara panel inside the team workspace (docker platform, ≥1 GB RAM,
#    network torob-yar-net). Don't create apps from the CLI; check it's there:
liara app list --team-id "$LIARA_TEAM_ID"

# 2. A 1 GB disk for inquiries.sqlite (survives redeploys); liara.json mounts it at /app/data-rw
liara disk create -a "$APP" --team-id "$LIARA_TEAM_ID" -n data -s 1

# 3. Env vars. Secrets come from .env.local; don't paste them into shell history by hand.
set -a; . ./.env.local; set +a
PROD_SECRET=$(grep '^PROD_SHOP_TOKEN_SECRET=' .env.local | cut -d= -f2)
[ -n "$PROD_SECRET" ] || { PROD_SECRET=$(openssl rand -hex 16); echo "PROD_SHOP_TOKEN_SECRET=$PROD_SECRET" >> .env.local; }
liara env set -a "$APP" --team-id "$LIARA_TEAM_ID" -f \
  "BOXAPI_API_KEY=$BOXAPI_API_KEY" "BOXAPI_BASE_URL=https://ai.boxapi.ir/ai/v1" \
  "LLM_MODEL=gpt-5.4-mini" "LLM_FALLBACK_MODEL=" "LLM_REASONING_EFFORT=none" "STT_MODEL=$STT_MODEL" \
  DATA_SOURCE=sqlite LLM_MODE=auto AUTO_REPLY=1 INQUIRY_TIMEOUT_S=60 GEO_PROVIDER=placeholder \
  DEMO_INDEX=1 DATA_RW_DIR=/app/data-rw "SHOP_TOKEN_SECRET=$PROD_SECRET"

# 4. Deploy (preflight: typecheck, lint, unit tests, gz size, fixtures, local docker run)
sh deploy/deploy.sh                            # uses $APP; SKIP_DOCKER=1 to skip the local image check
```


**How `deploy.sh` deploys (default "prebuilt"):** it runs `next build` locally, stages `deploy/.tmp/prebuilt/` (the standalone output as `standalone.tar`, static assets, `public/`, fixtures, `app.sqlite.gz`, `entrypoint.sh`, `liara.json`, and `deploy/Dockerfile.prebuilt` as its Dockerfile), and runs `liara deploy --path deploy/.tmp/prebuilt --build-location germany`. Liara's builder only copies files and gunzips the catalogue (~2 min build, ~450 MB image push).
- Why: the full multi-stage `Dockerfile` timed out after ~20 min in `next build` on Liara's builder; the `iran` builder can't pull `node:*` from Docker Hub (`unauthorized: authentication required`); and the CLI never uploads `node_modules` directories, hence the tar.
- The runtime image is `node:24` because the native better-sqlite3 binary comes from the local build (local Node 24). Keep the local Node major and `deploy/Dockerfile.prebuilt` in sync.
- `REMOTE_BUILD=1` uses the full `Dockerfile` on Liara instead (then `.liaraignore` decides the upload); `LIARA_BUILD_LOCATION=iran|germany` (default germany; the app itself always runs in Iran).
- `liara.json` health check: Liara caps `startPeriod` at 3000.

## After every deploy

```bash
liara logs -a "$APP" --team-id "$LIARA_TEAM_ID" -l          # look for the JSON startup line: dataSource, sqliteBytes>0, rwWritable:true
npm run smoke -- --url $URL
BASE_URL=$URL npm run test:e2e     # screenshots → e2e/screenshots/live/
liara app restart -a "$APP" --team-id "$LIARA_TEAM_ID"      # then re-check that an inquiry created before the restart is still there (disk mount)
```

## Operations

| Task | Command |
|---|---|
| Redeploy | `SKIP_DOCKER=1 sh deploy/deploy.sh` |
| Logs | `liara logs -a "$APP" --team-id "$LIARA_TEAM_ID" -f` (follow) · `-s "1 hour ago"` |
| Restart | `liara app restart -a "$APP" --team-id "$LIARA_TEAM_ID"` |
| Roll back | Redeploy an older commit: `git checkout <sha> && SKIP_DOCKER=1 sh deploy/deploy.sh` (releases are listed in the Liara console; `liara logs -a "$APP" --team-id "$LIARA_TEAM_ID" -r v3` shows a release's logs) |
| Switch to fixtures (no DB) | `liara env set -a "$APP" --team-id "$LIARA_TEAM_ID" -f DATA_SOURCE=fixtures` (restarts the app; fixtures are in the image) |
| LLM slow or down | `liara env set -a "$APP" --team-id "$LIARA_TEAM_ID" -f LLM_MODE=scripted` |
| Reset demo state | `curl -X POST "$URL/api/admin/reset?key=$PROD_SECRET"` |
| Health | `curl $URL/api/health` |

## Env vars (production values)

| Var | Value |
|---|---|
| `BOXAPI_API_KEY` | `<set me>` (from .env.local) |
| `BOXAPI_BASE_URL` | `https://ai.boxapi.ir/ai/v1` |
| `LLM_MODEL` | `gpt-5.4-mini` (the only chat model this key may use) |
| `LLM_FALLBACK_MODEL` | empty (no other model is allowed for this key) |
| `LLM_REASONING_EFFORT` | `none` |
| `STT_MODEL` | empty. This key is not allowed any transcription model, so the mic falls back to browser speech recognition, then to typing. |
| `DATA_SOURCE` | `sqlite` |
| `LLM_MODE` | `auto` |
| `AUTO_REPLY` | `1` (`0` on demo day) |
| `AUTO_REPLY_SKIP_QUESTIONS` | unset (`1` to record the demo script live: questions are answered from `/shop`) |
| `INQUIRY_TIMEOUT_S` | `60` |
| `GEO_PROVIDER` | `placeholder` |
| `DEMO_INDEX` | `1` |
| `DATA_RW_DIR` | `/app/data-rw` |
| `SHOP_TOKEN_SECRET` | `<set me>` (`PROD_SHOP_TOKEN_SECRET` in .env.local) |

## Demo-day checklist

1. `liara env set -a "$APP" --team-id "$LIARA_TEAM_ID" -f AUTO_REPLY=0` (this restarts the app).
2. Reset demo state (command above).
3. Phone A opens `$URL/`; phone B opens `$URL/shop`.
4. `npm run smoke -- --url $URL`. The inquiry step fails with AUTO_REPLY=0, which is expected.
5. Warm up: send one chat message («گوشی سامسونگ S25 FE») so the first LLM call and the SQLite page cache are hot.
6. If BoxAPI is slow (more than ~10 s per turn): `liara env set -a "$APP" --team-id "$LIARA_TEAM_ID" -f LLM_MODE=scripted`. The four demo scenarios work identically.
7. If map tiles are slow on mobile data: the style fallback chain is automatic (OpenFreeMap → Carto raster → offline minimal), and pins, rings and routes still draw. Test once on the venue network.
8. Single phone? Keep `AUTO_REPLY=1`, or open phone A with `/?manual=1` and answer from `/shop` in a second tab.

## Move to another app/domain

Use this when the app name changes (a new Liara account, a name that becomes free, a second environment) or you want a custom domain. No code changes are needed.

```bash
APP=<new-app-name>; URL=https://$APP.liara.run
liara whoami                                              # the account that will own it
liara network list --team-id "$LIARA_TEAM_ID"             # create one if needed: liara network create -n torob-yar-net --team-id "$LIARA_TEAM_ID"

# 1. App + 1 GB disk (liara.json mounts the disk "data" at /app/data-rw)
# app: create "$APP" in the Liara panel, inside the team (docker platform, ≥1 GB RAM, network torob-yar-net)
liara disk create -a "$APP" --team-id "$LIARA_TEAM_ID" -n data -s 1

# 2. Env vars: run step 3 of "First-time setup" above as-is (it uses $APP)

# 3. Deploy and verify
sh deploy/deploy.sh                                       # deploys to $APP
liara logs -a "$APP" --team-id "$LIARA_TEAM_ID" -l
npm run smoke -- --url "$URL"
BASE_URL="$URL" npm run test:e2e
node scripts/walk-demo.mjs "$URL"                         # the recorded demo script; needs AUTO_REPLY_SKIP_QUESTIONS=1 on the app
```

**Custom domain** (the CLI has no domain command): Liara panel → the app → **Domains** → add the domain → set the DNS record the panel shows (a CNAME to the app's `*.liara.run` host, or the A record for an apex domain) → wait for verification → enable **SSL**. Then set `URL=https://<your-domain>` and run smoke again. Optionally update the `app` default in `liara.json`.

**Moving data:** inquiries live on the old app's disk and are demo state; the new app starts empty, so reset nothing. The read-only catalogue (`app.sqlite`) ships inside the image.

## Local equivalents

```bash
docker build -t torob-yar:local . && docker run -p 3000:3000 -e DATA_SOURCE=sqlite -e LLM_MODE=scripted torob-yar:local
npm run smoke -- --url http://localhost:3000
```
