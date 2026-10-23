# UI_SPEC — ترب‌یار (Torob-yar)

In-person shopping assistant for Tehran. **UI/UX is the top priority.** Persian, RTL, mobile-first. The desktop layout must look equally polished.
Stack: Next.js (App Router) + Tailwind + shadcn/ui + Framer Motion + Vercel AI SDK (BoxAPI, OpenAI-compatible) + MapLibre GL (free base tiles). **No Google APIs. Neshan is NOT integrated yet:** every geo service (search, reverse geocode, ETA, route) goes through a `GeoProvider` interface whose current implementation is a seeded-random placeholder (§3.4). Deployed on Liara at a `*.liara.run` URL (§8).
**Build order: everything runs on fixtures first** (`DATA_SOURCE=fixtures`). The backend replaces fixtures later without changing any component.
**Backend principle: cut corners.** The backend exists only to serve the UI. Use the fewest API routes possible, shaped exactly like the fixtures. No auth, no queues, no microservices, no premature abstractions. When in doubt, choose the simpler backend and spend the time on UI/UX.

---

## 0. Global rules

- `<html dir="rtl" lang="fa">`. Use Tailwind logical properties only: `ms-/me-/ps-/pe-/start-/end-`. Never use `left`/`right` for layout. "Top-start" means top-right.
- Font: **Vazirmatn** (self-hosted). Use Persian digits everywhere in the UI (`toLocaleString('fa-IR')`). Prices are in **تومان**; abbreviate them (`۵۲٫۵ میلیون تومان`).
- Theme follows the Torob chat reference (`docs/design/ref/torob-desktop.png`, `docs/design/ref/torob-mobile.png`):
  - white canvas, neutral grey text, generous whitespace
  - one large rounded pill input with a light grey fill and a soft border
  - a single accent color, `--accent` (sample the pink from the reference send button; keep it as a token)
  - radius `rounded-2xl`/`rounded-full`; very soft shadows
- **Name and mascot:** product name `ترب‌یار`. Our own small pixel-art mascot (a placeholder sprite is fine). Never copy Torob's radish or logo.
- **Breakpoints:** mobile `<768`, tablet `768–1023`, desktop `≥1024`. Every screen is specified for mobile and desktop below.
- **Every navigation is reversible.** URL-driven state so the browser/phone back button works:
  - `/` → step 1
  - `/p/[productId]` → step 2
  - `/p/[productId]/s/[shopId]` → shop split view
  - Going back plays the forward transition in reverse.
- **Motion:**
  - Framer Motion shared-element transitions (`layoutId`): spring `{stiffness: 380, damping: 32}`, 280–420 ms.
  - Respect `prefers-reduced-motion` by switching to crossfades.
- **The user never does verification work and never talks to a shop directly.** The agent checks prices, stock and hours with shops (§4–5), relays any user question, and only *informs* the user.

## 1. Persistent pieces

### CriteriaBar
Always visible from step 1 onward. Mobile: horizontally scrollable chips under the header. Desktop: a row at the top of the right panel.

| Chip | Values | Effect |
|---|---|---|
| بودجه | range slider sheet, bounds = min/max price of current candidates | filters products (step 1) and offers (step 2) |
| فاصله | ۵۰۰ متر · ۱ کیلومتر · ۳ کیلومتر · ۵ کیلومتر · همه | filters shops |
| اقساطی | toggle | shops with installment providers only (DATA.md §4) |
| الان باز است | toggle | shops open now |

- In step 1, `اقساطی` only records intent (it's a shop attribute). It actually filters in step 2. If the user says "قسطی میخوام" in chat, the chip turns on automatically.
- Results update **instantly** and animate (list reorder via `layout`, pins fade).
- If a filter leaves 0 results, never show an empty screen. Show: "با این شرایط فروشگاهی پیدا نشد" plus the nearest relaxation, e.g. "نزدیک‌ترین فروشگاه اقساطی ۲٫۴ کیلومتر دورتر است — نشان بده؟"
- No کالابرگ chip, because the dataset has no voucher data (transparency).

### FreshnessBadge
Used on every price, everywhere:

| State | Rule | Look | Text |
|---|---|---|---|
| verified | shop confirmed via §5 | green, check icon | `تأیید شده · ۲ دقیقه پیش` |
| recent | listed price ≤ 7 days old | neutral | `ثبت‌شده · ۳ روز پیش` |
| aging | 8–30 days | amber | `ممکن است تغییر کرده باشد · ۱۸ روز پیش` |
| stale | > 30 days | grey, strikethrough-light | `قیمت قدیمی · ۴ ماه پیش` |
| checking | inquiry in flight | pulsing dot | `در حال استعلام از فروشنده…` |

Stock is shown separately: `موجودی: نامشخص / در لیست فروشنده / تأیید شده / ناموجود`. Hours: `ساعات کاری ثبت نشده` when missing.

### ProductCard: important, never a tiny chip
The same component in 3 sizes, with the same `layoutId={product-${id}}`:
- `full` (step 1 comparison): image carousel, title, 3–5 key spec chips, price range across shops, shop count, `WhyThisPick` line, primary button `انتخاب و پیدا کردن فروشگاه`.
- `pinned` (steps 2–3): **at least as prominent as a ShopCard.**
  - Mobile: a sticky card under the header, ~104px tall, with a 72px image, a 2-line title, 2 spec chips, `از ۱۸۴ تا ۲۲۳ میلیون · در ۳۴ فروشگاه`, and a `تغییر` button.
  - Desktop: the first card of the right panel, full width, ~140px.
- Tapping `pinned` or `تغییر` plays the reverse animation back to step 1, with the previous comparison and answers intact.

---

## 2. Step 1: find the exact product (pain points 1 & 4)

### 2.1 Empty state (matches the Torob reference)
- Centered layout: mascot → title `من ترب‌یارم` → grey subtitle `بگو چی میخوای بخری تا با هم مدل‌ها، قیمت‌ها و نزدیک‌ترین فروشگاه رو پیدا کنیم.` → pill input → hint row `جست‌وجو · مقایسه · پیشنهاد · پیدا کردن ارزون‌ترین فروشگاه نزدیک`.
- Below the hint row are 3–4 example chips from real data:
  - `گوشی سامسونگ S25 FE`
  - `هندزفری بی‌سیم زیر ۵ میلیون`
  - `اسپیکر جی‌بی‌ال`
  - `شارژر اپل ۲۰ وات`
- **Desktop chrome:** a thin rail on the right (sidebar toggle, new chat, login at the bottom). `ورود` sits at top-left.
- **Mobile chrome:** a top bar with the hamburger at the right and `ورود` plus `+` at the left.

### 2.2 Input: voice-first, same pill
- The accent circle at the pill's end shows a **mic** when the input is empty and morphs into the **send arrow** when there is text (a 150 ms icon morph). The chat box is always there; voice is the primary action, typing the secondary.
- **Tap the mic:**
  - The pill expands into a live waveform with a timer and ✕ cancel.
  - Tap again to stop. The transcript (BoxAPI transcription) fills the input, editable. It auto-sends after 1.5 s unless the user touches it.
- If mic permission is denied, or transcription fails, show a toast and fall back to typing. Never block.
- On submit, the layout animates from centered to chat layout: the input docks to the bottom (mobile) or the bottom of the center column (desktop, max-w 720).

### 2.3 Follow-up: conversational, at most 2 questions
Goal: a natural conversation that leads to a few good product cards quickly. **No visible funnel mechanics:** no counters, no candidate counts, no progress bars.

1. **Request:** the user says what they want, by voice or text. If it's already specific (e.g. `سامسونگ S25 FE 256`), skip the questions and show cards right away.
2. **Follow-up 1:** the assistant asks **one** natural, friendly question, the single most useful one for this request (use, budget, a key feature or brand). The LLM decides freely.
   - Shown as `QuestionChips`: the question plus 3–4 suggested quick replies.
   - The user can also just speak or type anything.
3. **Answer → API → results:** the answer is sent to the API (search + LLM), which returns 2–4 products shown as `ProductCompareCards`.
   - Under the cards, a short prompt: `همینا خوبن یا دقیق‌ترش کنم؟` with two buttons, `همینا خوبن` and `دقیق‌ترش کن`.
4. **If enough:** the user picks a card (§2.5) and moves on.
5. **If not:** the assistant asks **one more** follow-up (step 2 again), shows the refined cards, and **moves on anyway**. There is no third question; the cards stay and the user picks one.
6. **Free-text fallback:** the user can type a correction at any time (`ارزون‌ترش رو بیار`) and the cards just refresh.

Example: `هندزفری میخوام` → `بیشتر برای ورزش میخوای یا تماس و موسیقی روزمره؟` → [ورزش] → 3 cards + `همینا خوبن یا دقیق‌ترش کنم؟` → [دقیق‌ترش کن] → `تا چه قیمتی راحتی؟` → [زیر ۵ میلیون] → 3 refined cards → user picks one.

### 2.4 Generative UI: a fixed component library
The LLM chooses components; it never generates markup. Each assistant turn is a list of typed `UIBlock`s (the server validates the LLM's JSON with zod; tool calling is an optional upgrade if `npm run doctor` confirms BoxAPI supports it). The server enforces the rules (max 2 questions, 2–4 products), not just the prompt.

| Tool → Component | Purpose |
|---|---|
| `askQuestion` → `QuestionChips` | one follow-up question + quick replies (2.3) |
| `confirmEnough` → `EnoughPrompt` | `همینا خوبن یا دقیق‌ترش کنم؟` under the cards; asked at most once (2.3) |
| `showProducts` → `ProductCompareCards` | 2–4 `ProductCard full`, side by side on desktop, horizontal snap carousel on mobile |
| `compareSpecs` → `SpecDiffTable` | only rows that **differ**, with the best value highlighted; sticky first column |
| `explainPick` → `WhyThisPick` | 1–2 sentences on why each card fits the user's answers |

Under each card: price range, number of shops, and an aggregated freshness label (`قیمت‌ها: ۷۰٪ این هفته`).

### 2.5 Choosing (signature transition)
- When a card is tapped, the other cards fade and scale to 0.96.
- The chosen card flies (shared `layoutId`) into the **ProductCard pinned** slot: top-start of the screen on mobile, top of the right panel on desktop.
- The chat area slides out while the map fades in underneath. Total duration ~600 ms. Step 2 begins.

---

## 3. Step 2+3: map + ranked shops (pain points 1, 3, 4)

### Layout
- **Mobile:**
  - full-bleed map; pinned ProductCard sticky at the top; CriteriaBar under it
  - draggable **bottom sheet** with snap points 22% / 55% / 92%
- **Desktop:** right panel (420px) holding ProductCard, CriteriaBar, sort chips and the shop list. The map fills the rest.

### Location
- On entry, ask for GPS with a friendly explainer.
- Fallbacks:
  - a search box (placeholder: neighbourhoods from the `areas` table, §3.4)
  - a draggable "you are here" pin
- Default demo point: میدان فردوسی (most shops are in فردوسی/شیخ هادی).
- Show the dataset's coverage area as a faint polygon with the label `پوشش داده‌ها`.

### Map (MapLibre)
- **User location:** a pulsing blue dot.
- **Shop pins:** colored by freshness state; ✓ badge when verified. Use clustering at low zoom.
- **Hot spots:** a soft heat layer of offer density for this product. A pin glows when its price is in the cheapest 20%.
- **Proximity rings:** 500 m and 1 km circles around the user.
- **Sync:** tapping a pin scrolls the list to its card and highlights it; hovering or tapping a card bounces its pin. Hovering only on desktop.
- Pan, zoom, rotate and tilt are all enabled (two-finger on mobile).

### Sort chips
`پیشنهاد ما` (default score: price + distance + open + freshness) · `نزدیک‌ترین` · `ارزان‌ترین` · `تأیید شده`.
`پیشنهاد ما` shows the reason line `ارزان‌تر از ۸۰٪ · ۶۰۰ متر · تا ۲۱ باز`.

### ShopCard (list item, and the peek when a pin is tapped)
Contains:
- name and `location_label`
- short address with `پاساژ…، طبقه…، واحد…` emphasised
- distance and ETA
- open status (`باز · تا ۱۹:۰۰` / `بسته · فردا ۱۰:۰۰` / `ساعات نامشخص`)
- price + FreshnessBadge
- stock state
- installment provider logos/names
- warranty, if any

Tapping a pin opens this card in the sheet's peek position (22%). Tapping the card opens the split view.

### 3.1 Shop split view (`/p/[id]/s/[shopId]`)
The page splits; **the map always stays visible**:
- **Desktop:** 50/50. Right half: pinned ProductCard on top, ShopDetail below. Left half: the map, zoomed to fit the user and the shop, with a route line.
- **Mobile:** map on top 40%, ShopDetail sheet at 60%.

ShopDetail contents, in order:
1. Header: name, address (complex/floor/unit as large chips), `کپی آدرس`.
2. **ETA card** (always attached; `GeoProvider`, placeholder for now): walking and car times with a mode toggle, always labelled `تقریبی`. `مسیریابی` shows a toast `مسیریابی دقیق به‌زودی` for now.
3. **Price & stock block**: listed price + FreshnessBadge, verified price (if any), stock state, warranty. When unverified, show the check timeline (§4): `ارسال شد ← دیده شد ← پاسخ داد`.
4. **Hours**: today highlighted and the full week collapsible. Warn if it closes within 60 min or before the ETA (`تا رسیدن شما بسته می‌شود`).
5. **Payment**: installment providers, ترب‌پی in-person.
6. Buttons:
   - **`استعلام از فروشگاه`**: re-checks price/stock now and lets the user attach a question (§4.1)
   - `تماس` (tel: link; numbers are fictitious in the dataset; still functional UI)
   - **`مغازه بسته بود`**
   - `نمای داخل پاساژ` (if the shop has a complex)
7. `پیدا کردنش سخته؟`: a bottom pop-up with small helper chips (`کدوم ورودی؟`, `کدوم طبقه؟`, `نزدیک چه جایی؟`) plus free text. BoxAPI chat answers from the full address text (complex, floor, unit) + `GeoProvider.reverse()` landmarks (placeholder for now, §3.4). This is user↔AI, not user↔shop. Answers must say when they are a guess.

### 3.2 "مغازه بسته بود" (pain point 3)
- One tap, no form.
- The shop is marked closed for this session. A toast says `متأسفیم! نزدیک‌ترین فروشگاه‌های باز با همین کالا:`.
- The split view animates back to the list, now filtered to **open + nearest first** from the user's *current* position.
- The top 3 are shown with ETA. Picking one opens its split view the same way.
- Before arrival, if a selected shop will be closed at the ETA, proactively show this banner: `این فروشگاه تا رسیدن شما بسته است — ۲ گزینه باز نزدیک`.

### 3.3 Mall schematic 3D (`نمای داخل پاساژ`)
Concept: the 2D street map of the complex is the base; shops are cubes standing on it, built from the address data. Simple MVP first (navigate.setuos.io-level), polish later.
- Camera flies to the complex: pitch 0→60°, bearing −20°, zoom ~18.5, 1.2 s.
- The **same MapLibre map** uses a `fill-extrusion` layer. There is no separate 3D engine.
- **Cubes:** each shop in the complex is a small square footprint, extruded from `floor*4m` to `floor*4m+3.2m`. Footprints are laid out procedurally around the complex centroid in a ring/grid, ordered by unit number.
- **Colors:**
  - target shop: accent, pulsing
  - other shops selling this product: solid neutral
  - remaining shops in the complex: ghost (opacity 0.15)
- **Floor chips** (`همکف ۱ ۲ ۳ …`): selecting a floor isolates it and fades the other floors to 0.08.
- Tapping a cube opens its ShopCard. An entrance marker shows `ورودی` / `شما اینجایید`.
- Persistent label: `نقشه شماتیک — طبقه و واحد واقعی، جانمایی تقریبی`.
- Exit with `بازگشت به نقشه`, which reverses the camera fly.

### 3.4 Geo placeholders (until Neshan)
`lib/geo/provider.ts` defines `GeoProvider { search(q), reverse(lat,lon), eta(from,to,mode), route(from,to) }`. The `placeholder` implementation is **randomized but deterministic**: a seeded PRNG (mulberry32), seeded by a hash of the inputs, so the same shop always shows the same numbers and nothing flickers.
- `eta`: haversine × random detour factor 1.2–1.5. Walking speed 4.5–5.2 km/h. Car speed 12–22 km/h (Tehran traffic) + 2–6 min parking. Rounded to whole minutes.
- `route`: an L-shaped/zig-zag polyline from user to shop with 2–4 jittered waypoints (looks like streets, not a straight line).
- `reverse`: 2 random picks from a small curated list of real landmarks per `location_label` (e.g. فردوسی: میدان فردوسی، ایستگاه مترو فردوسی، خیابان منوچهری، خیابان لاله‌زار). Fall back to a generic list.
- `search`: fuzzy match over `areas` (neighbourhood centroids from the data) + a few presets (میدان فردوسی، شیخ هادی، بهارستان، میدان انقلاب، میدان ولیعصر).
- Everything from the placeholder is shown with `تقریبی` and an info tooltip: `محاسبه تقریبی — مسیریابی دقیق به‌زودی`.
- Swapping in Neshan later = one new file `lib/geo/neshan.ts` + `GEO_PROVIDER=neshan`. No component changes.

---

## 4. Step 4: verification and follow-up (pain point 2)
- On entering step 2, the system **automatically** sends inquiries to the top 3 ranked shops. It also checks any shop the user opens.
- The user mostly just sees results:
  - badges switch `در حال استعلام…` → `تأیید شده`
  - a small inline notice when information is outdated: `قیمت این فروشگاه ۱۸ روز پیش ثبت شده؛ داریم از فروشنده می‌پرسیم`
- **Outcomes, shown as an agent message bubble on the panel:**
  - confirmed: `همه‌چیز اوکیه — موجوده، ۵۲ میلیون، تا ۲۱ بازن. می‌تونی بری.` The card turns green.
  - new price: the price animates old→new (strikethrough old) and the ranking re-sorts.
  - out of stock: the card is dimmed and marked `ناموجود`. The agent says `این یکی تموم کرده؛ نزدیک‌ترین جایگزین تأییدشده: …` with one-tap open.
  - no reply after 5 min (demo: 60 s): `فروشنده هنوز جواب نداده` (amber). Verified shops are ranked above it.

### 4.1 User questions (agent-relayed)
- `استعلام از فروشگاه` opens a small sheet: quick chips (`گارانتی داره؟`, `رنگ دیگه هم داره؟`, `برام کنار می‌ذارید؟`, `تا کی بازید؟`) plus optional free text.
- The agent **first tries to answer from data** (offer description, warranty, hours). If it can, it answers immediately and says the source (`طبق اطلاعات ثبت‌شده فروشنده`).
- Otherwise the question is attached to the shop inquiry (§5), and the timeline `ارسال شد ← دیده شد ← پاسخ داد` shows. The shop's reply comes back as an agent bubble.
- The user still never chats with the shop directly; one question per inquiry, no threads.

## 5. Shop side (`/shop/[shopId]`): how verification happens
- A minimal mobile inbox for the shop owner. No login in the demo; the URL has a token.
- Each inquiry card shows product image/title, the listed price, `هنوز موجوده؟ قیمت همینه؟`, and the user's question if any.
- Three big buttons:
  - `موجوده، قیمت همینه`
  - `قیمت جدید: [numeric keypad sheet]`
  - `تموم شده`
- If there is a user question: a one-line reply field with 2–3 suggested answers.
- Also editable from this page: today's hours, `امروز بسته‌ایم`.
- Opening an inquiry marks it `seen` (drives the user's `دیده شد` step).
- **Real-time:** the user's client polls every 1.5 s. Use `/api/inquiries?ids=` only for shops with a pending inquiry.
- **Demo safety:** with `AUTO_REPLY=1` (on by default in fixtures mode), a bot answers pending inquiries after 4–15 s with weighted outcomes (70% confirm, 20% new price, 10% out of stock). That way the flow always completes even with one phone. On demo day, set `AUTO_REPLY=0` and answer from a second phone.

---

## 6. States checklist (every screen)
- **Loading:** skeletons shaped like the final cards, plus mascot "thinking" dots in chat. Never use a bare spinner.
- **Error:** an inline retry plus the fixture fallback, so the demo never dead-ends.
- **Empty:** suggest the closest relaxation (§1).
- **Uncertain data:** always say so in plain Persian (`نامشخص`, `ثبت نشده`, `تقریبی`).
- **Accessibility:**
  - tap targets ≥44px
  - focus rings
  - aria-labels on icon buttons
  - contrast AA

## 7. Component inventory
`AppShell`, `Mascot`, `PromptPill` (mic↔send), `VoiceWave`, `ChatThread`, `QuestionChips`, `EnoughPrompt`, `ProductCard(size)`, `ProductCompareCards`, `SpecDiffTable`, `WhyThisPick`, `CriteriaBar`, `FreshnessBadge`, `StockBadge`, `HoursBadge`, `MapView`, `ShopPins`, `HeatLayer`, `MallExtrusionLayer`, `FloorChips`, `BottomSheet` (vaul), `ShopCard`, `ShopDetail`, `EtaCard`, `FindShopHelp`, `AskShopSheet`, `InquiryTimeline`, `AgentNotice`, `ClosedStoreFlow`, `ShopInbox`.

## 8. Minimal backend + deploy
One Next.js app, one Liara service. Every route returns the same shape as its fixture.

| Route | Does |
|---|---|
| `POST /api/chat` | one assistant turn → `UIBlock[]` (§2.4); search via SQLite FTS |
| `POST /api/transcribe` | audio → BoxAPI transcription → text |
| `GET /api/products/[id]/offers` | offers + shops for a product (filters/sort run client-side) |
| `GET /api/complex/[id]` | shops in a complex, for §3.3 |
| `POST /api/find-help` | §3.1 item 7 answer (BoxAPI + `GeoProvider.reverse`) |
| `GET/POST /api/inquiries`, `POST /api/inquiries/[id]/reply` | §4–5 |
| `GET /api/geo/*` | `GeoProvider` (placeholder now, Neshan later) |
| `GET /api/health` | status, data source, LLM mode, counts |

- Read-only `app.sqlite` (built by `scripts/build-db`) ships in the image. Mutable `inquiries.sqlite` lives on a Liara disk.
- Secrets only in Liara env vars: `BOXAPI_API_KEY`, `BOXAPI_BASE_URL`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`, `STT_MODEL`, `DATA_SOURCE`, `AUTO_REPLY`, `GEO_PROVIDER`, `SHOP_TOKEN_SECRET`, `DATA_RW_DIR`, `NEXT_PUBLIC_MAP_STYLE`.
- Next.js `output: 'standalone'`. Deploy with the Liara CLI to the free `*.liara.run` domain. Smoke-test the live URL on a real phone after every deploy.
