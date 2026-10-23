# RUNBOOK — Torob-yar on Liara

> **Status (2026-10-23, re-checked after the reported top-up):** still not deployed. On account **`azsalehi06`** (the only account the CLI is logged in to):
> - `liara app list` → no apps; `liara app create -a torob-yar …` → **"The app already exists"** (the name belongs to another Liara account).
> - `liara app create -a torob-yar-app` → **"Not enough balance. Please charge your account."** for `standard-base-g2` and `medium-g2`; the account API reports `hasSucceedPayment: false`, so no payment has reached this account.
> - If the top-up went to a different Liara account, log in to it (`liara login`, or `liara account add` + `liara account use`) and run the commands below. Otherwise charge `azsalehi06`. It takes ~10 minutes.

Everything below is app-name-agnostic: set two variables once per shell and copy the commands as-is.

```bash
APP=torob-yar-app                  # current target (`torob-yar` is owned by another Liara account)
URL=https://$APP.liara.run         # or your custom domain once attached
```

Network: **`torob-yar-net`** (already created). `liara.json` holds a default app name (`torob-yar-app`), but `deploy/deploy.sh` always deploys to `$APP` when it's set.



## First-time setup (in order)

```bash
liara whoami                                   # confirm the login
liara network list                             # torob-yar-net already exists (created 2026-10-23)

# 1. The app (plan from the brief: 2 GB RAM, supports disks)
liara app create -a "$APP" --platform docker --plan standard-base-g2 \
  --feature-plan standard -n torob-yar-net -r false

# 2. A 1 GB disk for inquiries.sqlite (survives redeploys); liara.json mounts it at /app/data-rw
liara disk create -a "$APP" -n data -s 1

# 3. Env vars. Secrets come from .env.local; don't paste them into shell history by hand.
set -a; . ./.env.local; set +a
PROD_SECRET=$(grep '^PROD_SHOP_TOKEN_SECRET=' .env.local | cut -d= -f2)
[ -n "$PROD_SECRET" ] || { PROD_SECRET=$(openssl rand -hex 16); echo "PROD_SHOP_TOKEN_SECRET=$PROD_SECRET" >> .env.local; }
liara env set -a "$APP" -f \
  "BOXAPI_API_KEY=$BOXAPI_API_KEY" "BOXAPI_BASE_URL=https://ai.boxapi.ir/ai/v1" \
  "LLM_MODEL=gpt-5.4-mini" "LLM_FALLBACK_MODEL=" "LLM_REASONING_EFFORT=none" "STT_MODEL=$STT_MODEL" \
  DATA_SOURCE=sqlite LLM_MODE=auto AUTO_REPLY=1 INQUIRY_TIMEOUT_S=60 GEO_PROVIDER=placeholder \
  DEMO_INDEX=1 DATA_RW_DIR=/app/data-rw "SHOP_TOKEN_SECRET=$PROD_SECRET"

# 4. Deploy (preflight: typecheck, lint, unit tests, gz size, fixtures, local docker run)
sh deploy/deploy.sh                            # uses $APP; SKIP_DOCKER=1 to skip the local image check
```


**What gets uploaded:** `.liaraignore` takes precedence over `.dockerignore` and `.gitignore`. It uploads `data/app.sqlite.gz` (46 MB, gitignored) and skips `data/raw` (285 MB), `node_modules`, `.next` and `.env*`. The CLI prints the upload size, which should be about 50 MB.

## After every deploy

```bash
liara logs -a "$APP" -l          # look for the JSON startup line: dataSource, sqliteBytes>0, rwWritable:true
npm run smoke -- --url $URL
BASE_URL=$URL npm run test:e2e     # screenshots → e2e/screenshots/live/
liara app restart -a "$APP"      # then re-check that an inquiry created before the restart is still there (disk mount)
```

## Operations

| Task | Command |
|---|---|
| Redeploy | `SKIP_DOCKER=1 sh deploy/deploy.sh` |
| Logs | `liara logs -a "$APP" -f` (follow) · `-s "1 hour ago"` |
| Restart | `liara app restart -a "$APP"` |
| Roll back | Redeploy an older commit: `git checkout <sha> && SKIP_DOCKER=1 sh deploy/deploy.sh` (releases are listed in the Liara console; `liara logs -r v3` shows a release's logs) |
| Switch to fixtures (no DB) | `liara env set -a "$APP" -f DATA_SOURCE=fixtures` (restarts the app; fixtures are in the image) |
| LLM slow or down | `liara env set -a "$APP" -f LLM_MODE=scripted` |
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
| `INQUIRY_TIMEOUT_S` | `60` |
| `GEO_PROVIDER` | `placeholder` |
| `DEMO_INDEX` | `1` |
| `DATA_RW_DIR` | `/app/data-rw` |
| `SHOP_TOKEN_SECRET` | `<set me>` (`PROD_SHOP_TOKEN_SECRET` in .env.local) |

## Demo-day checklist

1. `liara env set -a "$APP" -f AUTO_REPLY=0` (this restarts the app).
2. Reset demo state (command above).
3. Phone A opens `$URL/`; phone B opens `$URL/shop`.
4. `npm run smoke -- --url $URL`. The inquiry step fails with AUTO_REPLY=0, which is expected.
5. Warm up: send one chat message («گوشی سامسونگ S25 FE») so the first LLM call and the SQLite page cache are hot.
6. If BoxAPI is slow (more than ~10 s per turn): `liara env set -a "$APP" -f LLM_MODE=scripted`. The four demo scenarios work identically.
7. If map tiles are slow on mobile data: the style fallback chain is automatic (OpenFreeMap → Carto raster → offline minimal), and pins, rings and routes still draw. Test once on the venue network.
8. Single phone? Keep `AUTO_REPLY=1`, or open phone A with `/?manual=1` and answer from `/shop` in a second tab.

## Move to another app/domain

Use this when the app name changes (a new Liara account, a name that becomes free, a second environment) or you want a custom domain. No code changes are needed.

```bash
APP=<new-app-name>; URL=https://$APP.liara.run
liara whoami                                              # the account that will own it
liara network list                                        # create one if needed: liara network create -n torob-yar-net

# 1. App + 1 GB disk (liara.json mounts the disk "data" at /app/data-rw)
liara app create -a "$APP" --platform docker --plan standard-base-g2 --feature-plan standard -n torob-yar-net -r false
liara disk create -a "$APP" -n data -s 1

# 2. Env vars: run step 3 of "First-time setup" above as-is (it uses $APP)

# 3. Deploy and verify
sh deploy/deploy.sh                                       # deploys to $APP
liara logs -a "$APP" -l
npm run smoke -- --url "$URL"
BASE_URL="$URL" npm run test:e2e
node scripts/walk-demo.mjs "$URL"                         # the recorded demo script, beat by beat
```

**Custom domain** (the CLI has no domain command): Liara panel → the app → **Domains** → add the domain → set the DNS record the panel shows (a CNAME to the app's `*.liara.run` host, or the A record for an apex domain) → wait for verification → enable **SSL**. Then set `URL=https://<your-domain>` and run smoke again. Optionally update the `app` default in `liara.json`.

**Moving data:** inquiries live on the old app's disk and are demo state; the new app starts empty, so reset nothing. The read-only catalogue (`app.sqlite`) ships inside the image.

## Local equivalents

```bash
docker build -t torob-yar:local . && docker run -p 3000:3000 -e DATA_SOURCE=sqlite -e LLM_MODE=scripted torob-yar:local
npm run smoke -- --url http://localhost:3000
```
