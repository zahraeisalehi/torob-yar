# ترب‌یار (Torob-yar)

An AI assistant for **in-person** shopping in Tehran, built on Torob's dataset of shops, products and offers.

1. **Find the right product.** Voice or chat, at most two friendly follow-up questions, then 2–4 generated comparison cards with "why this pick" lines and a spec-diff table.
2. **See where to buy it.** A map plus a ranked list of nearby shops, with distance, ETA, open/closed, installments, and a freshness label on every price.
3. **Let the agent verify.** The agent checks price, stock and hours with the top shops (a shop-owner inbox at `/shop`) and relays any question you have.
4. **Go and buy.** The shop detail shows the complex, floor and unit, a 3D mall schematic, "find it" help, and a one-tap "the shop was closed" flow.

UI is Persian, RTL and mobile-first, and equally polished on desktop.

## Quickstart (fixtures, no API key, no SQLite)

```bash
npm install
npm run dev                # → http://localhost:3000  (DATA_SOURCE=fixtures, scripted LLM by default)
npm run test:e2e           # Playwright, 390×844 and 1440×900
```

For real data and the real LLM:

```bash
npm run build:db           # data/raw/*.csv → data/app.sqlite (+ .gz), ~95 s
npm run build:fixtures     # refresh data/fixtures/*.json from app.sqlite
cp .env.example .env.local # set BOXAPI_API_KEY, DATA_SOURCE=sqlite
npm run doctor             # checks env, DB, BoxAPI chat/JSON/tools, STT models, map style
npm run build && npm start # standalone production server
```

## Environment

| Var | Default | Meaning |
|---|---|---|
| `DATA_SOURCE` | `fixtures` | `fixtures` (bundled JSON slice) or `sqlite`. If SQLite is missing, the app falls back to fixtures. |
| `SQLITE_PATH` | `./data/app.sqlite` | Read-only catalogue DB |
| `DATA_RW_DIR` | `./data/rw` | `inquiries.sqlite` (mutable demo state; a Liara disk in prod). Falls back to memory. |
| `LLM_MODE` | `auto` | `auto` = live if a key exists; `live`; `scripted` (deterministic, offline) |
| `BOXAPI_BASE_URL` / `BOXAPI_API_KEY` | — | OpenAI-compatible gateway (server-side only) |
| `LLM_MODEL` / `LLM_FALLBACK_MODEL` | `gpt-5.4-mini` / — | Chat models |
| `LLM_REASONING_EFFORT` | `none` | Sent as `reasoning_effort`; `none` saves ~2 s per call |
| `STT_MODEL` | — | Transcription model. Empty disables server STT; the UI then uses browser speech or typing. |
| `GEO_PROVIDER` | `placeholder` | Seeded, deterministic ETA/route/landmarks (Neshan later) |
| `AUTO_REPLY` | `1` | A bot answers inquiries after 4–15 s. Set `0` on demo day. |
| `AUTO_REPLY_MIN_S` / `_MAX_S` | `4` / `15` | Bot reply delay window |
| `INQUIRY_TIMEOUT_S` | `60` | "Seller hasn't replied" after this long (manual mode) |
| `SHOP_TOKEN_SECRET` | dev value | HMAC for shop inbox links; also the `/api/admin/reset?key=` |
| `DEMO_INDEX` | `1` | Enables `/shop`, a list of shops with pending inquiries |
| `NEXT_PUBLIC_MAP_STYLE` | OpenFreeMap positron | Build-time. Falls back automatically to Carto raster, then an offline minimal style. |

## Architecture

```
Browser (one persistent client shell: / → /p/:id → /p/:id/s/:shop, pushState, never remounts)
 ├─ Chat: PromptPill (mic↔send) → POST /api/chat → UIBlock[] → QuestionChips / ProductCompareCards / SpecDiffTable / EnoughPrompt
 ├─ Map (MapLibre, mounted once): pins+clusters, heat, rings, coverage hull, route, 3D mall (fill-extrusion per floor)
 ├─ Shops: ranking/filters run client-side (instant, animated); inquiries polled every 1.5 s while pending
 └─ /shop, /shop/:id?t=  shop-owner inbox (big buttons, numeric keypad)

Next.js route handlers (minimal; same JSON shapes as the fixtures)
 ├─ agent/pipeline: server rules (≤2 questions, ask-vs-show) → FTS candidates → ONE LLM call (ask | pick+why) → zod
 │                  → fallback model → scripted path (keyword scenarios) — the demo never dead-ends
 ├─ data/source: DataSource interface → sqlite.ts (FTS5 + reranker) | fixtures.ts
 ├─ inquiries: SQLite on DATA_RW_DIR (memory fallback), lazy auto-reply, HMAC shop tokens
 └─ geo/provider: GeoProvider → placeholder (mulberry32, seeded by inputs)
```

## Demo-day script (two phones)

1. Set `AUTO_REPLY=0` and restart. Reset state with `POST /api/admin/reset?key=<SHOP_TOKEN_SECRET>`.
2. **Phone A (shopper)** opens `/`. Say or type «هندزفری میخوام», answer «ورزش», tap «دقیق‌ترش کن», then pick a card.
3. The map and ranked shops appear. The agent sends inquiries to the top 3 automatically (badges pulse «در حال استعلام…»).
4. **Phone B (shop owner)** opens `/shop`, taps the shop, then «قیمت جدید» → keypad → ثبت. Phone A animates the price change and re-ranks.
5. On phone A, open a shop and show the ETA, floor/unit chips, «نمای داخل پاساژ» (3D), «پیدا کردنش سخته؟» and «مغازه بسته بود».

Single-phone fallback: keep `AUTO_REPLY=1` (the bot answers in 4–15 s), or add `?manual=1` to phone A's URL to disable the bot for that session only.

See `docs/RUNBOOK.md` for deployment and operations, `docs/PROGRESS.md` for status, and `docs/DECISIONS.md` for every judgement call.
