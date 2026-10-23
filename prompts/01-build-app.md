# Prompt 1: Build the whole Torob-yar app (UI first, minimal backend)

You are building **ترب‌یار (Torob-yar)** end-to-end in this repo: an AI assistant for in-person shopping in Tehran. This is a hackathon. **UI/UX is worth the most points**, then the product flow and the "intelligence" (follow-ups, alternatives). The goal of this session is a **complete, polished, working demo that runs locally**: first on fixtures with no API key, then on the real data and BoxAPI. Deployment to Liara is a separate session; just keep the app deploy-ready (`output: 'standalone'`, env-driven config, no Google Fonts or other external build-time downloads).

## 0. Before writing code
1. Read, in full: `CLAUDE.md`, `docs/UI_SPEC.md`, `docs/DATA.md`, `docs/vendor/boxapi.md`. Look at `docs/design/ref/torob-desktop.png` and `docs/design/ref/torob-mobile.png`.
2. **The UI spec is the source of truth** for screens, behaviour, animations and every Persian string. This prompt adds the engineering plan, data shapes and acceptance checks. If they conflict, follow UI_SPEC and note it in `docs/DECISIONS.md`.
3. Raw CSVs are in `data/raw/` (`shops.csv`, `products.csv`, `offers.csv`). Never commit them.
4. Create `docs/PROGRESS.md` and update it at the end of each milestone: done / next / deviations / open questions. It's your memory if the context gets compacted. Re-read it when resuming.
5. Work through milestones **M0 → M10 in order without stopping. Never ask me anything** (autonomous mode, see CLAUDE.md). Log decisions in `docs/DECISIONS.md`. At the end of each milestone, run `npm run typecheck && npm run lint` (and `npm run test:e2e` once it exists), fix what fails, update PROGRESS.md, and **commit** (`git add -A && git commit -m "<type>: <milestone summary>"`).

## 1. Stack (decided)
- Next.js (latest stable, App Router, TypeScript strict, `src/` dir), `output: 'standalone'`, `serverExternalPackages: ['better-sqlite3']`.
- Tailwind + shadcn/ui (RTL-safe: replace any `left/right` classes in generated components with logical ones), lucide-react icons.
- Framer Motion (shared-element `layoutId`, `layout` list reorders), vaul (bottom sheet), zustand (client state), zod (all API + LLM validation).
- Vercel AI SDK `ai` + `@ai-sdk/openai-compatible` → BoxAPI. Calls are `generateText`/`generateObject`-style with JSON validated by zod; see §5.
- MapLibre GL JS (dynamic import, `ssr:false`), plus `@mapbox/mapbox-gl-rtl-text` served **locally from `/public`** and registered via `maplibregl.setRTLTextPlugin` (without it Persian labels render broken).
- better-sqlite3 with FTS5. `tsx` for scripts. `csv-parse` (streaming) for the build scripts.
- Fonts: `@fontsource-variable/vazirmatn`. **No `next/font/google`.**
- Playwright for e2e.

## 2. Repo layout
```
src/
  app/
    layout.tsx                 # <html dir="rtl" lang="fa">, font, theme tokens
    (app)/[[...slug]]/page.tsx # ONE persistent client shell for "/", "/p/[id]", "/p/[id]/s/[shopId]"
    shop/page.tsx              # demo index of shops with pending inquiries (DEMO_INDEX=1)
    shop/[shopId]/page.tsx     # shop-owner inbox (?t=token)
    api/{chat,transcribe,find-help,health}/route.ts
    api/products/[id]/offers/route.ts
    api/complex/[id]/route.ts
    api/geo/{search,reverse,eta,route}/route.ts
    api/inquiries/route.ts, api/inquiries/[id]/reply/route.ts, api/inquiries/[id]/seen/route.ts
    api/shop/[shopId]/inquiries/route.ts, api/shop/[shopId]/today/route.ts
    api/admin/reset/route.ts
  components/                  # UI_SPEC §7 inventory, one file each; ui/ = shadcn
  lib/
    data/{types.ts, source.ts, fixtures.ts, sqlite.ts}   # DataSource interface + 2 implementations
    agent/{pipeline.ts, prompts.ts, scripted.ts, llm.ts, blocks.ts}
    geo/{provider.ts, placeholder.ts, landmarks.ts, haversine.ts}
    domain/{hours.ts, freshness.ts, price.ts, normalize.ts, ranking.ts, address.ts}
    inquiries/{db.ts, service.ts, token.ts}
    store/*.ts                 # zustand slices
scripts/{build-db.ts, build-fixtures.ts, doctor.ts}
data/{raw/ (gitignored), fixtures/ (committed), app.sqlite (gitignored), rw/ (gitignored)}
e2e/*.spec.ts
```
Routing: the shell must **never remount** between steps, so the shared-element animation and the map survive. Navigate with `window.history.pushState` (Next's App Router syncs `usePathname`/`useSearchParams`) and derive the step from the path. Back/forward must replay the transitions in reverse.

## 3. Env (`.env.example`, all read through one zod-validated `src/lib/env.ts`)
```
DATA_SOURCE=fixtures            # fixtures | sqlite
SQLITE_PATH=./data/app.sqlite
DATA_RW_DIR=./data/rw           # inquiries.sqlite lives here (Liara disk in prod)
LLM_MODE=auto                   # auto (live if key present) | live | scripted
BOXAPI_BASE_URL=https://ai.boxapi.ir/ai/v1
BOXAPI_API_KEY=
LLM_MODEL=gpt-5.4-mini
LLM_FALLBACK_MODEL=
STT_MODEL=gpt-4o-mini-transcribe
GEO_PROVIDER=placeholder
AUTO_REPLY=1
INQUIRY_TIMEOUT_S=60
SHOP_TOKEN_SECRET=dev-secret-change-me
DEMO_INDEX=1
NEXT_PUBLIC_MAP_STYLE=https://tiles.openfreemap.org/styles/positron
```
**All four combinations of DATA_SOURCE × LLM_MODE must work.** `fixtures + scripted` is the zero-dependency demo and must be flawless.

## 4. Milestones

### M0: Scaffold & design system
- Create the app, install the stack, and set up scripts: `dev, build, start, typecheck, lint, test:e2e, build:db, build:fixtures, doctor`.
- `.gitignore`: `data/raw`, `data/app.sqlite*`, `data/rw`, `.env*.local`, Playwright artifacts.
- **Theme tokens** in `globals.css` as CSS variables, then Tailwind:
  - `--accent`: sample the pink of the send button in the Torob screenshots; also derive `--accent-soft` for the disabled state seen there
  - white canvas, neutral greys, `--ok` green, `--warn` amber, `--stale` grey, `--info` blue (user dot)
  - radii 16/24/full; very soft shadows
- `AppShell` matching the references:
  - **Desktop:** a thin right rail with the sidebar-toggle icon at top, `+` new chat below it, a login icon at the bottom; `ورود` text at top-left.
  - **Mobile:** a top bar with ☰ at the right, `ورود` and `+` at the left.
- `Mascot`: our own pixel-art SVG character (a small green sprout/leaf creature). **Not a radish, nothing from Torob.** It has idle and "thinking" (bobbing dots) states.
- Utilities:
  - `toFaDigits`
  - `formatToman` (`۵۲٫۵ میلیون تومان`, `۸۵۰ هزار تومان`)
  - `relativeFa` (`۶ روز پیش` via `Intl.RelativeTimeFormat('fa')`)
  - `normalizeFa` (DATA.md §3 normalize rules + ZWNJ → space + lowercase Latin)

### M1: Data pipeline (DATA.md is the spec)
**`scripts/build-db.ts`** streams the 3 CSVs → `data/app.sqlite` (WAL off, `VACUUM` at end) with these tables:
- `shops(id, name, address, location_label, lat, lon, complex_id, floor REAL, unit TEXT, parse_confidence, installment INT, torob_pay INT, providers_json, hours_json, phone, categories_json, fast_delivery INT)`
  - Address parsing per DATA.md §3, regex only, with unit tests for ~15 real address strings you pick from the CSV.
- `products(id, title, brand, category, images_json (≤3), key_specs_json (≤12), min_price, max_price, shop_count, fresh_share)`
  - `brand` = `brand_name`, or derived: the first token that matches a known brand list (Latin or Persian; build the list from the non-null `brand_name` values), else null.
  - Price stats come from **sane offers only** (DATA.md §6 outlier rule; print the dropped count).
  - `fresh_share` = share of sane offers ≤ 7 days old.
- `offers(id, product_id, shop_id, price, last_changed_at, seller_title, warranty, description, is_outlier)`, with an index on `product_id`.
- `products_fts` (FTS5, `tokenize='unicode61 remove_diacritics 2'`) over normalized `title brand category`.
- `complexes(id, name, centroid_lat, centroid_lon, shop_count)`, with centroids per DATA.md §3 (median, drop >150 m, recompute).
- `areas(location_label, centroid_lat, centroid_lon, shop_count)`.
- At the end, print row counts, parse-rate stats (complex/floor/unit %), the installment shop count, and file size. Then write `data/app.sqlite.gz`.
- **Size budget:** DATA.md §9. If over budget, trim the specs further and log it in DECISIONS.md.

**`scripts/build-fixtures.ts`** reads app.sqlite → `data/fixtures/*.json` (commit these; each <2 MB):
- the 4 demo scenarios in DATA.md §2:
  - phones around Samsung S25 FE
  - wireless earbuds/headphones incl. sport models
  - JBL speakers
  - Apple 20W charger
- 6–12 products per scenario, all their offers and shops, every shop in those shops' complexes (for 3D), ~5 extra installment shops nearby, `areas.json`
- `scripted.json`: for each scenario, trigger keywords, follow-up question 1 + replies, question 2 + replies, and how each reply maps to filters (e.g. `زیر ۵ میلیون` → `maxPrice: 5_000_000`; `ورزش` → title/spec keywords)

**`DataSource`** interface (`lib/data/source.ts`), implemented by `fixtures.ts` and `sqlite.ts`, **identical outputs**:
```ts
searchProducts(q: { text: string; minPrice?: number; maxPrice?: number; brand?: string; category?: string; limit?: number }): Promise<Product[]>
getProduct(id): Promise<Product | null>
getOffers(productId): Promise<OfferWithShop[]>   // sane offers only, each with its Shop
getShop(id): Promise<Shop | null>
getComplex(id): Promise<{ complex: Complex; shops: Shop[]; offerShopIds: string[] } | null>
listAreas(): Promise<Area[]>
```
Types (`lib/data/types.ts`):
- `Shop {id, name, address, locationLabel, lat, lon, complex?: {id, name}, floor: number|null, unit: string|null, parseConfidence: 'high'|'medium'|'low', hours: WeeklyHours|null, providers: string[], installment: boolean, torobPay: boolean, phone?: string, categories: string[]}`
- `Product {id, title, brand: string|null, category, images: string[], keySpecs: {key, value}[], minPrice, maxPrice, shopCount, freshShare}`
- `Offer {id, productId, shopId, price, lastChangedAt, sellerTitle, warranty: string|null, description: string|null}`
- `OfferWithShop = Offer & { shop: Shop }`

FTS search: normalize the query, OR the tokens with prefix matching, order by bm25, then re-rank the top 60 by `bm25 − 0.15·log(shopCount+1)`. Apply price filters on `min_price`/`max_price`.

### M2: Domain logic (pure functions + unit tests with vitest)
- `hours.ts`: implements DATA.md §5 (`Asia/Tehran`, week starts Saturday). Exports `isOpenNow`, `closesAt`, `nextOpenAt`, `willBeOpenAt(date)`, `todayLabel` (`باز · تا ۱۹:۰۰` / `بسته · فردا ۱۰:۰۰` / `ساعات نامشخص`). Apply session/shop overrides (`closed_today`, `hours_today`).
- `freshness.ts`: states `verified | recent | aging | stale | checking` per UI_SPEC FreshnessBadge.
- `ranking.ts`: the `پیشنهاد ما` score, computed per offer:
  - `0.40·priceScore + 0.30·distanceScore + 0.15·openScore + 0.15·freshScore`
  - priceScore = 1 − percentile within this product's offers
  - distanceScore = `exp(−km/1.5)`
  - openScore = open 1 / unknown 0.5 / closed 0
  - freshScore = verified 1, recent 0.8, aging 0.5, stale 0.2
  - out-of-stock goes last and dimmed
  - Also returns the reason line (`ارزان‌تر از ۸۰٪ · ۶۰۰ متر · تا ۲۱ باز`).
- `geo/placeholder.ts`: implements UI_SPEC §3.4 exactly (seeded mulberry32, deterministic per input, `تقریبی` everywhere). `landmarks.ts` holds a curated list for فردوسی, شیخ هادی, بهارستان, منوچهری, جمهوری plus a generic list.

### M3: Step 1 UI, empty state + input (UI_SPEC §2.1–2.2)
- Pixel-match the reference layout and spacing at both breakpoints: mascot, `من ترب‌یارم`, subtitle, pill input, hint row, example chips.
- `PromptPill`: a mic icon when empty, morphing to the send arrow when there's text (150 ms). Enter sends; Shift+Enter makes a newline.
- **Voice:**
  - `MediaRecorder` (prefer `audio/webm;codecs=opus`; Safari/iOS gives `audio/mp4`, send whatever mime you got) with a live waveform from an `AnalyserNode`, a timer and ✕ cancel.
  - Stop → `POST /api/transcribe` → the transcript fills the input, editable, and auto-sends after 1.5 s unless touched.
  - **BoxAPI speech-to-text is confirmed** (`POST {BOXAPI_BASE_URL}/audio/transcriptions`, multipart `model` + `file` + `language=fa`; see `docs/vendor/boxapi.md`). This is the primary path. `/api/transcribe` forwards the blob as a `File` named `audio.webm`/`audio.mp4` to match its mime, caps uploads at 60 s / 5 MB, and has a 30 s timeout.
  - **Fallback chain (only for failures):** if `/api/health` says `stt: false` or the call fails → use `webkitSpeechRecognition` (`lang='fa-IR'`) if present → else a toast and typing. Never block the user.
- Submit animates the centred layout into chat layout: the input docks to the bottom (mobile) or the bottom of the 720px centre column (desktop).
- `CriteriaBar` (UI_SPEC §1) appears once the conversation starts. It's driven by a zustand `criteria` slice shared by all steps.

### M4: Step 1 intelligence + generative UI (UI_SPEC §2.3–2.5)
**API contract:**
- `POST /api/chat`
  - request: `{ messages: {role, text}[], action?: 'refine' | 'enough', state: ChatState, criteria: Criteria }`
  - response: `{ blocks: UIBlock[], state: ChatState }`
- `ChatState {questionsAsked: 0|1|2, enoughShown: boolean, lastProductIds: string[], filters: SearchFilters}`
- `UIBlock`, a zod discriminated union:
  - `{type:'text', text}`
  - `{type:'question', question, replies: string[3..4]}`
  - `{type:'products', products: Product[], why: Record<id, string>, freshLabel: Record<id, string>}`
  - `{type:'specDiff', productIds, rows: {key, values: (string|null)[], bestIndex: number|null}[]}`
  - `{type:'enough'}`
  - `{type:'criteriaPatch', patch: Partial<Criteria>}` (e.g. the user said "قسطی" → installment on; "تا ۲۰ میلیون" → budget max)

**Pipeline (`lib/agent/pipeline.ts`): orchestrated, not a free agent loop. This is what keeps the demo reliable.**
1. **Interpret (LLM call A).** Returns JSON `{action: 'ask'|'search', question?, replies?, searchText, filters: {minPrice?, maxPrice?, brand?, category?}, criteriaPatch?}`. The system prompt (in `prompts.ts`) includes:
   - the catalogue reality (electronics-heavy, Tehran, top categories)
   - the rule "ask only the single most useful question, friendly, short, colloquial Persian"
   - the JSON shape
   - 3 few-shot examples (including one specific request that must go straight to search)
2. **Server rules override the LLM:**
   - Never ask when `questionsAsked ≥ 1` before the first results.
   - Never exceed 2 questions in total.
   - `action:'refine'` forces an ask if `questionsAsked < 2`, otherwise a search with the relaxed filters.
   - If FTS on the raw text returns ≥1 product whose title contains the user's model token, skip asking.
3. **Search** via `DataSource.searchProducts` → the top 12 candidates. If 0, relax in order (drop brand → widen price ×1.5 → drop category) and add a `text` block saying what was relaxed.
4. **Pick (LLM call B).** Gets the candidates (id, title, brand, price range, shop count, ≤8 key specs) and the conversation, and returns `{pickIds (2–4), why: {id: 1–2 sentences}, intro, diffKeys: string[]}`.
   - The server validates that `pickIds ⊆ candidates`. On failure, pick the top 3 by `shopCount × freshShare`.
   - `why` must reference the user's stated needs.
5. **Build blocks:**
   - `text(intro)`, then `products`
   - `specDiff` (only rows whose values differ; `bestIndex` via simple numeric/known-direction rules, else null), if ≥2 rows
   - `enough` if `!enoughShown && questionsAsked < 2`
   - any `criteriaPatch`
6. **LLM plumbing (`llm.ts`):**
   - JSON-only prompting + zod validation, one retry with the error appended, then `LLM_FALLBACK_MODEL`, then the **scripted** path.
   - 20 s timeout; one stdout log line per call.
   - **Scripted mode (`scripted.ts`):** keyword → scenario from `scripted.json`, same blocks, same rules, deterministic. Any unknown request → a friendly `text` block + example chips + a plain FTS search.

**UI:**
- `ChatThread`: user bubbles, assistant blocks rendered by a `BlockRenderer` switch, and mascot thinking dots plus card-shaped skeletons while waiting.
- `QuestionChips`: tapping a reply sends it as the user's message.
- `EnoughPrompt`: `همینا خوبن` (hides the prompt) / `دقیق‌ترش کن` (sends `action:'refine'`).
- `ProductCompareCards`:
  - desktop: 2–4 `ProductCard size="full"` side by side, equal height
  - mobile: a horizontal scroll-snap carousel with dots, cards ~85vw
- `ProductCard full`, per UI_SPEC:
  - image carousel (plain `<img loading="lazy" referrerPolicy="no-referrer">` from image.torob.com; `onError` → neutral placeholder with a category icon)
  - title, 3–5 spec chips, price range, shop count, aggregated freshness (`قیمت‌ها: ۷۰٪ این هفته`), the `WhyThisPick` line, and the primary button
- `SpecDiffTable`: sticky first column, best value highlighted; horizontal scroll on mobile.
- Budget changes in the `CriteriaBar` re-filter the visible cards instantly (client-side, animated). If none are left, show the relaxation message.

**Signature transition (§2.5):**
- Tapping a card makes the others fade/scale to 0.96.
- The chosen card animates via shared `layoutId` into the `pinned` slot (mobile: sticky under the header; desktop: top of the right panel).
- The chat slides out and the map fades in. ~600 ms total.
- URL → `/p/[id]`. Back (or tapping the pinned card / `تغییر`) reverses it all and restores the chat exactly.
- Respect `prefers-reduced-motion`.

### M5: Step 2+3, map + ranked shops (UI_SPEC §3)
- **Map is mounted once**, behind the step-1 UI and hidden until step 2 (so the transition is instant).
- **Base style:** `NEXT_PUBLIC_MAP_STYLE`.
  - Fallback chain if the style fails, or >5 tile errors in 5 s: OpenFreeMap positron → a Carto light raster style (`https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`) → a built-in minimal style (plain light background).
  - Our layers must look fine on every one of them.
  - Use `coalesce(name:fa, name)` for labels where the style allows.
- **Layers (GeoJSON):**
  - user dot (pulsing)
  - 500 m / 1 km rings
  - shop pins coloured by freshness with a ✓ for verified (cluster at low zoom)
  - offer-density heat layer
  - glow for the cheapest 20%
  - faint `پوشش داده‌ها` coverage polygon (convex hull of all shops)
- **Location:**
  - On entry, a friendly explainer, then GPS.
  - Fallbacks: the search box (`/api/geo/search` → placeholder over areas) and a draggable "you are here" pin.
  - Default: میدان فردوسی (35.7008, 51.4189).
  - If the GPS position is far outside coverage, offer: `خارج از محدوده داده‌ها هستید — موقعیت نمونه (میدان فردوسی) را نشان بدهم؟`
- **Layout:**
  - mobile: full-bleed map, pinned ProductCard + CriteriaBar on top, vaul bottom sheet with snap points 22%/55%/92%
  - desktop: a 420px right panel and the map filling the rest
- **Sort chips:** `پیشنهاد ما` (with reason line) · `نزدیک‌ترین` · `ارزان‌ترین` · `تأیید شده`.
- **ShopCard** with every field in UI_SPEC.
  - `GET /api/products/[id]/offers` returns the offers with shops. Distance, ETA (placeholder, batch-computed client-side via the same seeded function, exported from `lib/geo/placeholder.ts`), filters and sorting run client-side, so changes are instant and animated (`layout` reorder, pins fade).
- **Map↔list sync:**
  - pin tap → the sheet goes to its peek with that card highlighted and scrolled into view
  - card hover (desktop) / tap → the pin bounces
- **Empty states** with the nearest-relaxation message (UI_SPEC §1), computed for real (e.g. the nearest installment shop and its distance).

### M6: Shop split view, closed-store flow, find-help (UI_SPEC §3.1–3.2)
- **Route `/p/[id]/s/[shopId]`:**
  - desktop 50/50 (detail right, map left fitting user + shop with the placeholder route line)
  - mobile: map at 40% on top, detail sheet at 60%
- **ShopDetail sections in spec order:**
  - address chips (complex / floor / unit) + `کپی آدرس`
  - `EtaCard` (walk/car toggle, `تقریبی`, `مسیریابی` → toast `مسیریابی دقیق به‌زودی`)
  - price & stock block with FreshnessBadge and InquiryTimeline
  - hours (today highlighted, week collapsible, a warning if it closes within 60 min or before the ETA)
  - payment
  - buttons: `استعلام از فروشگاه`, `تماس` (`tel:`), `مغازه بسته بود`, and `نمای داخل پاساژ` when there's a complex
- **`مغازه بسته بود`:** one tap, marked closed for the session, toast, animate back to the list filtered to open + nearest, top 3 with ETA. Also show the proactive banner when a shop will be closed at the ETA.
- **`پیدا کردنش سخته؟` (`FindShopHelp`):** a bottom pop-up with chips (`کدوم ورودی؟`, `کدوم طبقه؟`, `نزدیک چه جایی؟`) + free text.
  - `POST /api/find-help {shopId, question}` → the LLM answers using the full address, the parsed complex/floor/unit, and the placeholder landmarks.
  - It must say when something is a guess.
  - Scripted fallback: a template answer built from the parsed fields.

### M7: Mall schematic 3D (UI_SPEC §3.3)
- `GET /api/complex/[id]` returns the complex, all its shops, and which of them sell the current product.
- **Camera fly:** pitch 0→60, bearing −20, zoom ~18.5, 1.2 s. Hide the base style's own 3D building layer while in this view.
- **Procedural footprints (`MallExtrusionLayer`):**
  - Group shops by floor and sort by unit number.
  - Lay out each floor as a grid/ring around the centroid: 5 m squares with 1 m gaps; meters → degrees using the latitude.
  - Unknown floor → floor 0 with a dashed outline; unknown unit → append at the end.
- **Extrusion:** base `floor·4`, height `floor·4 + 3.2`.
- **Gotcha:** `fill-extrusion-opacity` is NOT data-driven. Use **one layer per floor** (and a separate target layer) so floor isolation can set the opacity per layer.
  - target: accent, pulsing (animate the paint property via rAF)
  - sellers: neutral solid
  - others: ghost 0.15
- **`FloorChips`** (`همکف ۱ ۲ …`): isolates the chosen floor, others drop to 0.08.
- Tapping a cube opens its ShopCard. An entrance marker shows `ورودی` / `شما اینجایید`.
- Persistent label: `نقشه شماتیک — طبقه و واحد واقعی، جانمایی تقریبی`.
- `بازگشت به نقشه` reverses the fly.
- Pan, rotate and tilt must work by touch (two-finger) and mouse (right-drag/ctrl-drag).
- Keep it simple and solid first; add polish only once it works on mobile.

### M8: Verification, user questions, shop inbox (UI_SPEC §4, §4.1, §5)
- **`inquiries.sqlite` in `DATA_RW_DIR`** (create the dir and tables on first use):
  - `inquiries(id, shop_id, product_id, offer_price, status: sent|seen|replied, outcome: confirm|new_price|out_of_stock|null, new_price, question, answer, created_at, seen_at, replied_at, auto_reply_due_at)`
  - `shop_overrides(shop_id, closed_today, hours_today_json, updated_at)`
- **Endpoints:**
  - `POST /api/inquiries {shopId, productId, question?}`: reuses an existing pending one for the same shop+product (appending the question). With `AUTO_REPLY=1`, sets `auto_reply_due_at = now + rand(4..15 s)`.
  - `GET /api/inquiries?ids=a,b`: statuses. **Lazy auto-reply:** any due pending inquiry is resolved here, weighted 70% confirm / 20% new price (±3–12%) / 10% out of stock. If there's a question, the bot answers it plausibly from the offer data. It first moves through `seen` (≥1.5 s) so the timeline animates. Computes `timeout` when there's no reply after `INQUIRY_TIMEOUT_S`. **No background jobs.**
  - `POST /api/inquiries/[id]/seen?t=`, `POST /api/inquiries/[id]/reply?t= {outcome, newPrice?, answer?}`
  - `GET /api/shop/[shopId]/inquiries?t=`, `POST /api/shop/[shopId]/today?t= {closedToday?, hours?}`
  - `POST /api/admin/reset?key=<SHOP_TOKEN_SECRET>` clears inquiries and overrides (for demo resets).
  - Token = first 16 hex chars of HMAC-SHA256(shopId, SHOP_TOKEN_SECRET).
- **User side:**
  - On entering step 2, auto-create inquiries for the top 3 ranked shops; also when a shop's detail is opened.
  - Poll every 1.5 s only while something is pending.
  - FreshnessBadge goes to `checking` → result. Show `InquiryTimeline` `ارسال شد ← دیده شد ← پاسخ داد` and the outdated-price notice.
  - `AgentNotice` bubbles at the top of the panel, with exact copy per UI_SPEC §4:
    - confirm → the card turns green
    - new price → old→new animated strikethrough + re-sort
    - out of stock → dimmed `ناموجود` + the next-best alternative with one-tap open
    - timeout → amber
- **`استعلام از فروشگاه` → `AskShopSheet`:**
  - Chips (`گارانتی داره؟`, `رنگ دیگه هم داره؟`, `برام کنار می‌ذارید؟`, `تا کی بازید؟`) + free text.
  - First `POST /api/find-help`-style **answer-from-data** (LLM or rules over the offer description, warranty and hours) → if answerable, reply immediately with `طبق اطلاعات ثبت‌شده فروشنده`. Otherwise attach the question to an inquiry.
- **Shop inbox `/shop/[shopId]?t=`:** a mobile-first, big-button layout per UI_SPEC §5.
  - Inquiry cards with the product image/title, listed price and `هنوز موجوده؟ قیمت همینه؟`, plus the user's question with a one-line reply field + 2–3 suggested answers.
  - Three big buttons: `موجوده، قیمت همینه` · `قیمت جدید` (numeric keypad sheet, Persian digits shown) · `تموم شده`.
  - Opening a card marks it seen.
  - Today's hours / `امروز بسته‌ایم`.
  - Polls every 2 s.
- **`/shop` index (when `DEMO_INDEX=1`):** lists shops with pending inquiries and links (with tokens), so on demo day the second phone just opens `/shop`.

### M9: States, accessibility, performance
- Every screen has a loading state (skeletons shaped like the final cards plus mascot dots; never a bare spinner), an error state (inline retry plus the fixture fallback) and an empty state (nearest relaxation). Uncertain data is always labelled (`نامشخص`, `ثبت نشده`, `تقریبی`).
- Tap targets ≥44px, focus rings, aria-labels on icon buttons, AA contrast, `prefers-reduced-motion`.
- Performance: dynamic-import MapLibre and the 3D layer, lazy images, a memoised ranking, no layout shift on the empty state. Target a Lighthouse mobile performance score ≥80 on `/`.
- **`GET /api/health`:** `{ok, dataSource, llmMode, stt, geoProvider, counts: {shops, products, offers}, version}`. `stt` is cached from the doctor/first probe.

### M10: Doctor, tests, demo polish
- **`npm run doctor`:** checks the env, the SQLite tables/counts and DATA_RW_DIR writability, then the BoxAPI checks from `docs/vendor/boxapi.md` (chat, JSON mode, temperature, tool calling, transcription model/format support: generate `scripts/fixtures/fa-sample.webm` and `.mp4` with ffmpeg from a short spoken Persian clip if any TTS is available, else a 2-second tone that only proves format acceptance; write the first working `STT_MODEL` to `.env.local`; latency). Map style URL reachability. It prints a ✓/✗ table and the recommended `LLM_MODE`.
- **Playwright e2e** (fixtures + scripted), at 390×844 and 1440×900:
  1. Phone scenario: request → one question → cards → `دقیق‌ترش کن` → second question → refined cards → pick card → map + list visible → sort/filter changes the order → open shop → inquiry resolves (AUTO_REPLY with a short due time in test) → back button returns to cards.
  2. Installment filter empty → the relaxation message appears and works.
  3. `مغازه بسته بود` → alternatives shown.
  4. 3D mall opens and floor chips work.
  5. Shop inbox: reply `قیمت جدید` → the user's card updates.
- Save screenshots of every step at both sizes to `e2e/screenshots/`. **Review them yourself against the Torob references and UI_SPEC, and fix visual issues** before declaring done.
- **README.md:** what it is, how to run (fixtures quickstart in 3 commands), env table, architecture sketch, and a demo-day script (two phones: user at `/`, owner at `/shop`, `AUTO_REPLY=0`).

## 5. Definition of done (for this session)
- `DATA_SOURCE=fixtures LLM_MODE=scripted npm run build && npm start` gives the full flow, steps 1→4, on mobile and desktop with no network except map tiles and product images.
- `DATA_SOURCE=sqlite` with a real `BOXAPI_API_KEY` works for arbitrary electronics requests.
- typecheck, lint, unit tests and e2e are all green. PROGRESS.md is up to date, including a list of anything not done or deviating from UI_SPEC.
- Everything committed. PROGRESS.md holds the summary per milestone, the doctor results, the `app.sqlite`/`.gz` sizes and known issues.
