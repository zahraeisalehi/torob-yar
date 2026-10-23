# Progress

## Final report (2026-10-23)

**Live URL: not deployed.** Liara refused to create the app with *"Not enough balance. Please charge your account."* (account `azsalehi06`). It refused both the named plan `standard-base-g2` and the cheapest `small-g2`. Topping up the account is a payment, so I stopped there. Everything else is done and verified locally:
- the production Docker image builds and passes smoke
- e2e runs at 390×844 and 1440×900
- the live LLM path works

Deploying is ~10 minutes once the account is charged. Follow `docs/RUNBOOK.md` → "First-time setup" (network `torob-yar-net` already exists; app name `torob-yar-app` because `torob-yar` is taken).

| Check | Result |
|---|---|
| `npm run typecheck` | ✓ |
| `npm run lint` | ✓ (0 errors; warnings are React-Compiler purity hints, see DECISIONS) |
| `npm run test:unit` | ✓ 33 tests (address parsing ×18, hours, freshness, budget parsing, formatting, geo placeholder, ranking) |
| `npm run test:e2e` | ✓ 12/12: 6 flows × {mobile 390×844, desktop 1440×900}. Screenshots in `e2e/screenshots/{mobile,desktop}/` |
| Docker image (`docker build .`, 442 MB) + smoke against it | ✓ 7/7 (SQLite + live LLM), e2e 12/12 against the container in fixtures mode, inquiries survive a restart |
| `npm run doctor` | chat ✓ (gpt-5.4-mini, ~4–5 s), JSON mode ✓, tool calling ✓, temperature ✗ (reasoning model), STT ✗ (key not allowed any transcription model), map style ✓ |

**Demo-day steps:** README "Demo-day script" plus RUNBOOK "Demo-day checklist".
**Recording:** `npm run demo` + `docs/DEMO_SCRIPT.md`. `node scripts/walk-demo.mjs [url]` walks every beat at 1440×900: **23/23 ✓** against `npm run demo` (2026-10-23).

### DEMO_SCRIPT.md: edits where the app legitimately differs
1. Header: demo shop **ویسا آذریار** + product **Redmi Buds 8 Active**, `npm run demo`, and recording hours (Sat–Wed 10–18, Thu 10–14; outside them every shop shows «بسته»).
2. Mic: the BoxAPI key has no speech model, so recognition is Chrome's own; type the sentence if it fails on the recording network.
3. Budget chip: the popover applies with «اعمال». Beat is now: drag «تا» to ~۳ میلیون → «اعمال» (a card disappears) → back to ۵ → «اعمال». Raising «از» instead would hide the demo shop (۳٫۸ میلیون) later.
4. Pick **Redmi Buds 8 Active** explicitly (the LLM's card order varies; the demo shop sells this one).
5. «اقساطی»: ویسا آذریار itself has installments, so the list shrinks but never empties; the relaxation message doesn't appear for this product.
6. Shop step names ویسا آذریار; the 3D view now opens on floor ۳ (tap «همه», then «۳»).
7. Out-of-stock beat: the alternative is opened with «باز کن» under the seller's answer.
8. Tech line: dataset is 315k offers / 218k products (was 330k / 225k).

### Blocked / follow-ups
1. **Liara deploy: account balance.** Charge the account, then run the RUNBOOK first-time setup. Smoke and live e2e are scripted (`npm run smoke -- --url …`, `BASE_URL=… npm run test:e2e`).
2. **Speech-to-text: BoxAPI key has no transcription model** (403 `model_not_allowed` for every audio model). The mic UI is complete: waveform, timer, cancel, and auto-send after 1.5 s. It currently uses the browser's `webkitSpeechRecognition` (Chrome/Android, fa-IR), then a toast and typing. Setting `STT_MODEL` with a capable key turns on the server path with no code changes.
3. Only `gpt-5.4-mini` is allowed for this key, so `LLM_FALLBACK_MODEL` is empty. If the model fails, the server falls back to the scripted path.
5. Pushing to the `origin` remote failed (https://github.com/me/torob-yar.git, which looks like a placeholder; no credentials). All work is committed locally on `main`.
4. Lighthouse was not measured in a real browser run. The map and the 3D layer are dynamically imported and only mount after the first message, so `/` ships no map code.

### Known issues / deviations from UI_SPEC
- Geo is the seeded placeholder (as specified); every ETA, route and landmark is labelled `تقریبی`.
- Dataset prices end on 2026-10-13, so on 2026-10-23 nothing counts as "recent" (≤7 days). Badges honestly show `ممکن است تغییر کرده باشد`, and the card label falls back to "% این ماه". Verified prices come from the inquiry flow.
- Mobile bottom sheet (vaul): the list scrolls only at the 92% snap point. At 22% and 55%, dragging moves the sheet, which is vaul's model.
- The shop list dedupes to one offer (the cheapest) per shop.
- `/shop/[id]` hours editing supports a single shift for "today".

---

## Milestones

### M0 Scaffold & design system: done
Next 16.4 (App Router, TS strict, standalone), Tailwind 4 tokens (`--accent #f04f78` sampled from the reference send button, `--accent-soft #f4afb9` for the disabled tint), Vazirmatn self-hosted, AppShell (desktop rail + mobile top bar), pixel-art sprout mascot (idle + thinking), formatting utilities.

### M1 Data pipeline: done
- `npm run build:db` (~95 s): shops 6,476 · products 218,118 (with ≥1 sane offer) · offers 315,094 (644 flagged as outliers; 1,973 excluded from stats) · complexes 573 · areas 31
- Parse rates: complex 63.4% · floor 65.4% · unit 77.0% · installment shops 123 · ترب‌پی 190
- **app.sqlite 147.6 MB · app.sqlite.gz 46.0 MB** (budget 150/60 ✓)
- Fixtures: 42 products in 4 scenarios, 924 offers, 1,403 shops (sellers + every shop in their 47 complexes + 5 installment shops), areas, coverage hull, scripted Q&A. Every file < 1.1 MB.

### M2 Domain logic: done (with unit tests)
hours (Tehran, Saturday-first, overrides), freshness, ranking (`0.40 price + 0.30 distance + 0.15 open + 0.15 fresh`, reason line), seeded geo placeholder (mulberry32), landmarks.

### M3 Step 1 UI: done
Empty state matches the reference. PromptPill morphs mic↔send. The voice recorder has a live waveform, timer and cancel. Example chips. Centred layout animates into the docked chat. CriteriaBar.

### M4 Intelligence + generative UI: done
- Orchestrated pipeline. Server rules: ≤2 questions; refine forces a question; a known model skips questions; a bare product type asks first.
- **One LLM call per turn** (ask, or pick+why+intro+diffKeys), validated with zod, then the fallback model, then the scripted path.
- FTS5 + reranker, progressive relaxation, "not in catalogue" suggestions.
- Blocks: text / question / products / specDiff / enough / criteriaPatch / suggestions.
- Signature transition: the shared `layoutId` card flies into the pinned slot.

### M5 Map + ranked shops: done
- MapLibre with a style fallback chain (OpenFreeMap → Carto → offline).
- Price pins coloured by freshness (✓ when verified), glow for the cheapest 20%, pixel clustering.
- Heat layer, 500 m / 1 km rings, `پوشش داده‌ها` coverage hull, draggable "you are here".
- GPS explainer plus neighbourhood search.
- Sort chips with a reason line. Client-side filters with real nearest-relaxation messages.
- Mobile vaul sheet with 22/55/92 snap points; desktop 420 px panel.

### M6 Shop split view: done
- Desktop 50/50; mobile map 40% / detail 60%; placeholder route line.
- Detail: address chips + copy, ETA card (walk/car, تقریبی, «مسیریابی» toast), price & stock with verified price and inquiry timeline, hours (today + week, closes-before-ETA warning), payment, actions.
- «مغازه بسته بود» flow; proactive «تا رسیدن شما بسته است» banner; «پیدا کردنش سخته؟» (LLM or template answer that says when it's guessing).

### M7 Mall schematic 3D: done
Camera fly (pitch 60°, bearing −20°, zoom 18.5). One fill-extrusion layer per floor plus a pulsing target layer. Floor chips isolate a floor (others drop to 0.08). Tap a cube to see its card. `ورودی · شما اینجایید` marker, persistent schematic label, reverse fly on exit, URL `?mall=1` so Back exits.

### M8 Verification + shop inbox: done
- Auto-inquiries to the top 3 shops plus any opened shop; polling every 1.5 s while pending.
- Lazy auto-reply (70/20/10 split), going through `seen` first.
- Agent notices: confirm, new price (strikethrough → new, re-sort), out of stock (+ one-tap alternative), timeout, seller answer.
- AskShopSheet answers from data first (`طبق اطلاعات ثبت‌شده فروشنده`).
- `/shop` index; `/shop/[id]?t=` inbox with big buttons, Persian numeric keypad, answer chips, «امروز بسته‌ایم» and today's hours. HMAC tokens; admin reset.

### M9 States / a11y / perf: done
Skeletons shaped like the final cards plus mascot thinking dots. Inline retry. Nearest-relaxation empty states. `نامشخص` / `ثبت نشده` / `تقریبی` everywhere. aria-labels, focus rings, 44 px targets, reduced motion (MotionConfig `reducedMotion="user"` plus CSS).

### M10 Doctor, tests, README: done
`npm run doctor`, Playwright e2e at both sizes, README, RUNBOOK.

### Deploy (Prompt 2): blocked on balance
Dockerfile (multi-stage, node:22-bookworm-slim, toolchain only in deps), `deploy/entrypoint.sh` (JSON startup line), `.liaraignore` (uploads the gz, skips raw data), `liara.json` (docker, port 3000, disk `data` → `/app/data-rw`, healthCheck), `deploy/deploy.sh` (preflight + `liara deploy`), `scripts/smoke.ts`, `docs/RUNBOOK.md`.

## Docker / smoke (local production image, 2026-10-23)
Startup line: `{"msg":"startup","dataSource":"sqlite","llmMode":"auto","sqliteBytes":144924672,"rwDir":"/app/data-rw","rwWritable":true,...}`

| Step | ✓ | ms |
|---|---|---|
| GET /api/health | ✓ | 228 |
| POST /api/chat (S25 FE, live LLM) | ✓ | 7343 |
| GET /api/products/:id/offers | ✓ | 17 |
| GET /api/complex/:id | ✓ | 12 |
| inquiry round trip (AUTO_REPLY) | ✓ | 6096 |
| POST /api/transcribe | ✓ (503 → disabled, browser-speech fallback) | 29 |
| GET / (rtl) | ✓ | 223 |

- Restart persistence: 1 inquiry before `docker restart`, 1 after (volume mounted at /app/data-rw, standing in for the Liara disk).
- Env-only switch: the same image with `DATA_SOURCE=fixtures LLM_MODE=scripted` passes `BASE_URL=http://localhost:3998 npm run test:e2e` → **12/12**.
