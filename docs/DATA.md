# DATA — Torob Tehran dataset (profiled 2026-10-23)

Raw CSVs live in `data/raw/` (gitignored):
- `shops.csv` (6,476 rows, 9 MB)
- `products.csv` (225,903 rows, 196 MB; **`specs` is 124 MB of that**)
- `offers.csv` (331,506 rows, 80 MB)

Format: UTF-8 with a header row; nested values are compact JSON strings; missing values are the literal `null`.
`scripts/build-db.ts` converts them once into `data/app.sqlite`. The demo fixtures are a slice of the same output (`scripts/build-fixtures.ts`).

## 1. Columns that matter
**shops**:
- `shop_id`, `name` (mostly fictitious), `address` (full Persian text), `location_label` (neighbourhood)
- `lat`/`lon` (real, Tehran 35.64–35.81 / 51.31–51.51)
- `weekly_hours`
- `contacts` (phone only, fictitious)
- `payment_options`
- `category_names`
- `supports_fast_delivery` (25% filled)
- `instagram` and `website_url` (rare)

**products**:
- `product_id`, `persian_title`, `category_name`
- `brand_name` (**only 25% filled**, so derive brand from title/specs when missing)
- `model` (often null)
- `image_urls` (JSON array, 100% filled, `image.torob.com`)
- `specs` (JSON `[{key, section, value}]`)

**offers**:
- `offer_id`, `product_id`, `shop_id`
- `price_toman`
- `last_price_changed_at` (ISO, UTC)
- `seller_title` (the seller's own title)
- `description`
- `warranty` (18% filled)

## 2. Coverage reality (design around it)
- **Location:** 75% of shops are in **فردوسی (3,282)** and **شیخ هادی (1,587)**, then بهارستان (616). Default the demo location to میدان فردوسی.
- **Categories:** the data is electronics/electrical-heavy (cables, CCTV, phone parts, lighting, phones, headphones, speakers). There is **no clothing/shoes**.
- **Demo scenarios** (good offer counts):
  - گوشی موبایل (814 products, 2,051 offers), e.g. `Samsung S25 FE 256/8` in 34 shops
  - هدفون/هندزفری (1,339 products, 2,461 offers)
  - JBL / Harman speakers (33–37 shops)
  - Apple 20W charger (59 shops)

## 3. Address parsing → `{complex, floor, unit}`
- 64% of addresses name a building (پاساژ/مجتمع/مرکز خرید/بازار/ساختمان), 67% have a floor, and 93% have a unit/plaque.
- **Normalize first:**
  - Persian/Arabic digits → ASCII
  - `ي/ك` → `ی/ک`
  - `علاءالدین`→`علاالدین`
  - collapse spaces and ZWNJ
- **Complex:** `(پاساژ|مجتمع|مرکز خرید|بازار)\s+[^،,]+`. Top complexes: علاالدین (+ علاالدین ۲), بوشهری, چارسو, اتحادیه, امجد, کیان, فراز, یگانه.
- **Floor:**
  - `همکف`=0
  - `زیرهمکف|زیرزمین|منفی ?N`=−N
  - `طبقه (اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|N)` mapped to a number
  - a mezzanine `نیم طبقه` = +0.5
- **Unit:** `(واحد|پلاک|غرفه)\s*([0-9]+)`. When `پلاک` comes before the street, it's a street number; only take it after the complex.
- Regex only, offline. Store `parse_confidence` (high = complex+floor+unit, medium = two of them, low = otherwise). No LLM batch for the demo.
- **Coordinates are NOT reliable inside a complex:** shops matched to "علاالدین" spread ~2.7 km. To compute the complex centroid:
  1. take the median lat/lon of its shops
  2. drop shops more than 150 m from that median
  3. recompute

  The 3D schematic lays out cubes procedurally around that centroid (UI_SPEC §3.3).

## 4. Payments → installment filter
- `payment_options` is a JSON array of `{provider_name, channel: in_person|unknown, ...}`. **Only ~4% of shops (~266) have any entry.**
- Providers: ترب‌پی 190, اسنپ‌پی 89, دیجی پی 61, تارا 37, ازکی‌وام 5.
- `installment = provider ∈ {اسنپ‌پی, دیجی پی, تارا, ازکی‌وام}`. ترب‌پی = in-person pickup/payment badge.
- The installment filter will often empty the result set, so UI_SPEC's "nearest relaxation" message is mandatory.
- **No کالابرگ data exists.** Don't show that filter.

## 5. Hours
`weekly_hours` is a JSON object keyed by `sat…fri`. Each value is `{status: declared|closed|unsupported, shifts:[{start_time,end_time}]}`.
- `{}` (31% of shops) → "ساعات کاری ثبت نشده" (unknown, not closed).
- `closed` → closed that day. `unsupported` → unknown.
- An end of `00:00:00` after a start means midnight. Equal start/end with status `declared` → unknown.
- Timezone `Asia/Tehran`. The week starts on Saturday.
- Computed fields: `isOpenNow`, `closesAt`, `nextOpenAt`, `willBeOpenAt(eta)`.

## 6. Prices & freshness
- `last_price_changed_at` ranges from 2020-12 to 2026-10-13; 65% of rows are from Sep–Oct 2026.
- Freshness buckets are relative to *now*: ≤7 days recent, 8–30 aging, >30 stale (UI_SPEC FreshnessBadge).
- **Sanitize outliers.** For example, one 2-socket fridge protector is listed at 1.6×10¹³. Drop offers with `price < 1,000` or `> 20× product median`, and log the count.
- The product price range shown in UI = min–max of the sane offers.

## 7. Derived tables (SQLite, `better-sqlite3`)
- `shops(+complex_id, floor, unit, parse_confidence, installment, providers_json, hours_json)`
- `products(+brand_derived, key_specs_json, min_price, max_price, shop_count, fresh_share)`
- `offers(+is_outlier)`
- `products_fts` (FTS5, `unicode61 remove_diacritics 2`, on normalized title + brand + category). Normalize queries the same way as the index (§3 normalize, ZWNJ → space).
- `complexes(id, name, centroid_lat, centroid_lon, shop_count)`
- `areas(location_label, centroid_lat, centroid_lon, shop_count)` (feeds the placeholder location search)
- **Mutable** (separate file in `DATA_RW_DIR`, a Liara disk in production): `inquiries(id, shop_id, product_id, status, question, answer, new_price, created_at, seen_at, replied_at, auto_reply_due_at)`, `shop_overrides(shop_id, closed_today, hours_today)`

## 8. Fixtures (`data/fixtures/*.json`)
- Contents:
  - the 4 demo scenarios from §2
  - all their products, offers and shops
  - every shop in the complexes those shops sit in (for the 3D view)
  - ~5 extra installment shops nearby
- Same shapes as the API responses. Keep each file under 2 MB.
- Fixture mode also ships scripted follow-up answers, so the full flow works offline.

## 9. Size budget (for deploy)
- Keep at most **12 specs per product** in `key_specs_json` (prefer the keys that differ most within the category); drop the raw `specs` column. Keep only the **first 3 image URLs**.
- Target `app.sqlite` ≤ 150 MB and `app.sqlite.gz` ≤ 60 MB. Print the actual sizes at the end of `build-db`.
