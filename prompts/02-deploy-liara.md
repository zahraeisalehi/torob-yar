# Prompt 2: Deploy Torob-yar to Liara (production demo), autonomous

The app from Prompt 1 is built and green locally. Now make it **live on Liara at a `*.liara.run` URL**, stable enough for judging (Deployment = 40 points: quality and stability of the release, and the project running live).
**Autonomous mode (CLAUDE.md): never ask me anything, run every command yourself, commit as you go, and log every choice in `docs/DECISIONS.md`.** I'm already logged in to the Liara CLI (`liara login`). If a command fails because of auth, log it under "Blocked" in PROGRESS.md and finish everything else.

## 0. Before doing anything
1. Read `CLAUDE.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/vendor/liara.md`, `docs/vendor/boxapi.md`, and UI_SPEC §8.
2. Run `npm run typecheck && npm run lint && npm run test:e2e && npm run doctor`. Fix anything red first and commit.
3. **Rules:**
   - Always discover flags with `liara --help` / `liara <cmd> --help` before using a command. Don't trust memory (the CLI differs from your training data). If an interactive prompt appears, find the non-interactive flag instead.
   - Never delete Liara apps, disks or networks. Never put secrets in the repo, the image, or logs.
   - Secrets come from `.env.local` (`BOXAPI_API_KEY`, `STT_MODEL`, …). Read them from there when setting Liara env vars, without echoing them.

## 1. Target architecture
- **One Liara app `torob-yar`, platform `docker`**, built from our `Dockerfile`, listening on `PORT=3000`. If the name `torob-yar` is taken, use `torob-yar-app`, then `torob-yar-<4 random chars>`, and log it.
- **Read-only data** `app.sqlite` is baked into the image (gunzipped at build time from `data/app.sqlite.gz`).
- **Writable data** (`inquiries.sqlite`) lives on a **Liara disk** `data` mounted at `/app/data-rw` (`DATA_RW_DIR=/app/data-rw`), so a redeploy doesn't wipe demo state.
- **Production env:** `DATA_SOURCE=sqlite`, `LLM_MODE=auto`, `AUTO_REPLY=1` (switched to 0 on demo day), `GEO_PROVIDER=placeholder`, `DEMO_INDEX=1`.
- **Safety net:** if anything about the SQLite path fails in production, setting `DATA_SOURCE=fixtures` must give a full working demo with **no redeploy** (fixtures are in the image too).

## 2. Files to create

### `Dockerfile` (multi-stage, `node:22-bookworm-slim`)
- `deps`: `npm ci`. Install `python3 make g++` **only in this stage**, in case better-sqlite3 has to compile.
- `build`:
  - `ARG NEXT_PUBLIC_MAP_STYLE` with a default (it's inlined at build time)
  - `next build` (standalone)
  - `gunzip -c data/app.sqlite.gz > /app/db/app.sqlite`
- `run` (minimal):
  - include `ffmpeg` only if the doctor showed webm needs converting (see boxapi.md)
  - copy `.next/standalone`, `.next/static` → `.next/static`, `public/`, `data/fixtures/`, `/app/db/app.sqlite`
  - **verify the better-sqlite3 native `.node` binary is present in the standalone output**; if file tracing missed it, copy `node_modules/better-sqlite3` (and its `bindings`/`file-uri-to-path` deps) explicitly
  - `ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 SQLITE_PATH=/app/db/app.sqlite DATA_RW_DIR=/app/data-rw`
  - non-root user (it must still be able to write the mounted disk; if it can't, run as root and log why)
  - `EXPOSE 3000`
  - `CMD ["sh","deploy/entrypoint.sh"]`
- `deploy/entrypoint.sh`: `mkdir -p "$DATA_RW_DIR"`, print one JSON startup line (data source, LLM mode, sqlite size, rw dir writable?), then `exec node server.js`.
- **`.dockerignore`:** `data/raw`, `data/app.sqlite`, `data/rw`, `node_modules`, `.next`, `e2e/screenshots`, `.env*`. **Keep** `data/app.sqlite.gz` and `data/fixtures`.

### `liara.json`
Platform `docker`, app name, port 3000, disk `data` → `/app/data-rw`, and a health check on `/api/health` if the schema supports it. **Confirm the exact schema** from `liara --help`/`liara init --help`/Liara docs (WebFetch `docs.liara.ir`); don't guess field names.

### What gets uploaded
`liara deploy` uploads the project folder. Find out which ignore file it honours (`.gitignore`, `.liaraignore`, `.dockerignore`?).
- `data/app.sqlite.gz` (~≤60 MB) **must be uploaded** even though it's gitignored.
- `data/raw` (~285 MB) and `node_modules` **must not** be uploaded.
- Verify via the upload size the CLI prints.
- **If the gz can't be included reliably, decide yourself, in this order:**
  1. a `.liaraignore` that overrides `.gitignore`
  2. deploy from a clean temporary copy of the repo (`git archive HEAD` + the gz) so the ignore rules no longer matter
  3. `DATA_SOURCE=fixtures` in production for now (still a full demo)

  Log which one you used.

### `deploy/deploy.sh`
Preflight, failing loudly on any error:
1. typecheck + lint + unit tests
2. `data/app.sqlite.gz` exists and is < 60 MB
3. `data/fixtures/*.json` exist
4. if Docker is available locally: `docker build` + run the container with fixture env + curl `/api/health` and `/` → OK

Then **run** `liara deploy` with the right flags (app, platform, port, build location `iran`, non-interactive). Exit non-zero on failure.

### `scripts/smoke.ts` (`npm run smoke -- --url https://<app>.liara.run`)
1. `GET /api/health` → ok, dataSource, counts > 0, llmMode, stt
2. `POST /api/chat` for `گوشی سامسونگ S25 FE` → contains a `products` block with ≥2 products (or a `question` block, then answer it and expect products)
3. `GET /api/products/<id>/offers` → ≥10 offers with shops
4. `GET /api/complex/<id>` for a known complex → shops > 5
5. Inquiry round trip: create → poll until `replied` within 30 s (AUTO_REPLY=1)
6. `POST /api/transcribe` with `scripts/fixtures/fa-sample.webm` → 200 (and non-empty text if the clip is real speech)
7. The page `/` returns 200 with `dir="rtl"`

Print a ✓/✗ table and the total latency per step.

### `docs/RUNBOOK.md` (for me, after you're done)
- First-time setup commands, in order (network, app, disk, env, deploy), with what each does.
- Redeploy, view logs, restart, roll back (find the Liara command for previous releases), switch to fixtures in 1 command, reset demo state (`/api/admin/reset`).
- A table of env vars with prod values (secrets as `<set me>`).
- **Demo-day checklist:**
  - `AUTO_REPLY=0` and restart
  - reset demo state
  - phone A opens `/`, phone B opens `/shop`
  - run smoke
  - warm up the app (first LLM call)
  - a fallback plan if BoxAPI is slow (`LLM_MODE=scripted`)
  - a fallback if the map tiles are slow on an Iranian network (the style fallback chain is automatic; also verify on mobile data)

## 3. First-time setup sequence (run each yourself; check flags with --help first)
1. `liara account list` (or the equivalent) to confirm the login. If not logged in, log it as Blocked and stop the Liara part only.
2. `liara network create -n torob-yar-net` (skip if it already exists).
3. `liara app create -a torob-yar --platform docker --plan standard-base-g2 --feature-plan standard -n torob-yar-net -r false`.
   - **Use exactly this plan.** It worked on my previous project and supports disks.
   - If that plan id is no longer valid, pick the closest one with ≥1 GB RAM that supports disks, and log it.
   - Don't pick anything more expensive than `standard`.
4. Create a disk `data` (1 GB) for the app.
5. Set env vars:
   - `BOXAPI_API_KEY` and `STT_MODEL` (both from `.env.local`)
   - `BOXAPI_BASE_URL`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`
   - `DATA_SOURCE=sqlite`, `LLM_MODE=auto`, `AUTO_REPLY=1`, `INQUIRY_TIMEOUT_S=60`, `GEO_PROVIDER=placeholder`, `DEMO_INDEX=1`, `DATA_RW_DIR=/app/data-rw`
   - `SHOP_TOKEN_SECRET`: generate 32 random chars, store it in `.env.local` as `PROD_SHOP_TOKEN_SECRET`, never in git
6. `sh deploy/deploy.sh`.
   - If the build fails on npm registry access or memory, read the logs and fix it yourself: `npm ci --prefer-offline`, trimming devDependencies from the image, a different build location if the CLI offers one, or the next build plan.
   - Up to 5 attempts. Log each in DECISIONS.md.

## 4. After every deploy
1. Read `liara logs` for the app. Check the JSON startup line.
2. `npm run smoke -- --url <live url>` → all green. Fix and redeploy if not.
3. `BASE_URL=<live url> npm run test:e2e` (the phone scenario + shop inbox at minimum) at 390×844 and 1440×900. Save the screenshots to `e2e/screenshots/live/`, look at them, and fix visual issues.
4. Check from the live site that: Persian text and digits render with Vazirmatn (no fallback font); map tiles load (or the fallback style kicks in cleanly); product images from image.torob.com load; the mic UI works on HTTPS.
5. Restart the app once (`liara restart`, or the equivalent) and confirm inquiries survive (proves the disk mount).
6. Update PROGRESS.md, DECISIONS.md and RUNBOOK.md, then commit. Push if an `origin` remote exists.

## 5. Definition of done
- The live URL runs the full flow (steps 1→4) on mobile and desktop widths.
- Smoke and live e2e are green. Inquiry state survives a restart. Switching to `DATA_SOURCE=fixtures` or `LLM_MODE=scripted` works with an env change + restart only.
- RUNBOOK.md lets me redeploy, roll back and run the demo without you.
- Final message (also at the top of PROGRESS.md): the live URL, smoke table, screenshots location, decisions you made, anything Blocked, known issues, and the exact demo-day steps.
