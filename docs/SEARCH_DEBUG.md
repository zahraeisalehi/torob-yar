# Search debug: where «redmi buds 8 active» was lost (2026-10-25)

Report: the live chat answered «redmi buds 8 active» with «باتری شیائومی Xiaomi POCO X3 Pro BN57», although Redmi Buds 8 Active is in the catalogue.

## Tools

- `npm run trace -- "<query>" [--budget <max toman>] [--after "<earlier message>"]… [--url <base>] [--json]`
  - local: runs the agent in-process on `data/app.sqlite` with `.env.local` (live LLM when a key is set)
  - `--url`: calls `/api/chat` with header `x-debug-trace: <SHOP_TOKEN_SECRET of that server>` (`PROD_SHOP_TOKEN_SECRET` from `.env.local` for live); without the header the API is unchanged
- Each turn records: (a) every LLM call's path — `live` / `fallback model` / `scripted` — with latency and the error or reason; (b) its raw JSON (action, searchText, filters…); (c) every boolean FTS5 `MATCH` string with its row count (AND, each all-but-one AND, OR); (d) the top candidates with bm25 and the score parts (coverage incl. model tokens matched, phrase, variant, head, accessory, type, popularity, final); (e) the LLM's pick ids vs. what the server kept, plus candidate counts after each pipeline filter.
- `liara logs` now shows `scripted_fallback` (an LLM call gave up) and `scripted_answer` (a live-configured server answered from the scripted path).
- Raw traces: `docs/search-traces/before/` (local + live, before the fix), `docs/search-traces/after/`.

## SQLite itself is fine

| check | result |
|---|---|
| `products` | rid 36289, `product_7e5b414601f84774977ae02f`, «هندزفری بلوتوثی شیائومی مدل Redmi Buds 8 Active …», هدفون، هدست و هندزفری, 3,799,000–5,990,000, 13 shops |
| `products_fts` | row 36289 present; `MATCH 'redmi buds 8 active'` matches it |
| plain `MATCH 'redmi buds 8 active'` (implicit AND) | exactly 1 row: that product (bm25 −20.5) |
| plain OR, ordered by bm25 | that product first, then Buds 8 Lite ×2, Buds 6 Active, Buds 8 |
| the pre-`64d38ce` query shape (OR + prefix + brand synonyms) | «گوشی … Redmi15 … 8-active», then the product, then «فلت و برد شارژ شیائومی پوکو ایکس 3»: the POCO X3 family of the reported battery. That shape was replaced in `64d38ce`; the remaining failure is below. |

## Stage by stage, before the fix (local and live identical)

Each query was traced without a budget and with the UI budget chip at ≤ 3,000,000 (a chip left over from an earlier search is exactly how a judge gets there: it persists across new searches).

| query | no budget | budget ≤ 3M | stage where the right product is lost |
|---|---|---|---|
| redmi buds 8 active | ✓ Redmi Buds 8 Active | ✗ fingerprint sensors (local) / solder wire (live) | **retrieval under the price filter**: probe (no filter) AND = 1 row ✓ → gather with `maxPrice` AND = 0, every all-but-one AND = 0, **OR = 1500 rows of parts**. Not empty, so the pipeline's budget relaxation (runs only on 0 results) never fires. LLM `research` kept all model tokens («Redmi Buds 8 Active شیائومی», brand=redmi): same OR junk. LLM `pick` chose from junk (its own text says they don't match); the server accepted. |
| ردمی بادز ۸ اکتیو | ✓ | ✗ «سیم لحیم اکتیو 0.8 میلیمتر» | same stage. The OR rescued solder wire: «اکتیو» is a solder brand and «0.8» tokenises to «0», «8» → 2 of 3 model tokens. Locally the pick call also hit a BoxAPI connect timeout → `pick → scripted` (all LLM attempts failed), visible in the trace and log. |
| هندزفری شیائومی | question (by design: a bare type gets one question) | question | — |
| galaxy s25 fe | ✓ S25 FE phones | ✗ phone cases | **retrieval under the price filter + type filter fallback**: AND matches only S25 FE *cases* under 3M (18 rows, all accessories); `keepType` keeps "everything" when nothing passes, so the cases went through. |
| ایرپاد پرو | ✓ AirPods Pro 2 | ✓ | — (in-budget models exist) |
| شارژر ۲۰ وات اپل | ✓ Apple 20W | ✓ | — |
| یه هندزفری بی‌سیم می‌خوام | question (by design) | question | — |

Path (a): every answer above was `live` (gpt-5.4-mini) except the one timed-out pick call. Interpretation (b): the LLM never dropped or translated a model token in these traces; it only added «شیائومی» and a brand filter. So the LLM was not the root cause; the scripted pipeline (search-eval, no LLM) fails the same budget cases (0/3 before the fix).

Side finding (not changed): `detectScenario` tags «redmi buds 8 active» as the *phone* scenario (keyword «redmi»; earbuds have no «buds» keyword). It has no effect once the query names a model (the scenario's text and questions are skipped), so it stays as is.

## Root cause

**Retrieval under filters, then nothing downstream rejects the result.** The search applied the price filter inside the boolean query; when that removed the named model, the AND variants returned nothing and the OR fallback returned products that merely shared one token («8», «active», «s25 fe» on a case). Because the result wasn't empty, the pipeline's budget relaxation never ran, and neither the type filter nor the pick step stopped junk.

## Fixes

| # | stage | fix |
|---|---|---|
| F1 | retrieval (`domain/search.ts` `retrieve`) | a query with ≥ 2 model tokens never falls back to OR: if no AND / all-but-one AND matches, it returns nothing (OR stays for loose need-style queries) |
| F2 | gather (`agent/pipeline.ts`) | when the user named a model that the unfiltered probe found but the budget removed (or only its accessories fit), drop the price filter for it and say so: «… از X شروع می‌شه که با بودجه‌ی انتخابی‌ت (Y) جور نیست؛ با این حال نشونت می‌دم.» |
| F3 | LLM research | model tokens missing from the LLM's `searchText` are appended from the user's text (traced as `research-model-tokens-restored`); the raw-text hits already stay first |
| F4 | pick | if the user named a model and the leading pick isn't it, the server puts it first (override or reorder, shown in the trace). It doesn't touch a correct lead pick (a genuine AirPods Pro 2 isn't replaced by a replica) |
| — | logging | `scripted_fallback` / `scripted_answer` log lines |

Eval (`npm run search-eval`, in `npm test`) gained three budget cases. Before → after the fix:

| | retrieval top-1 | retrieval top-3 | agent cases |
|---|---|---|---|
| before | 100% (42/42) | 100% (42/42) | 3/6 (all 3 budget cases ✗: solder wire, solder wire, S25 FE cases) |
| after | 100% (42/42) | 100% (42/42) | **6/6** |

## After the fix

Local (`docs/search-traces/after/`): all 7 queries answer the right product (or the by-design question) both without a budget and at ≤ 3M; «redmi buds 8 active», «ردمی بادز ۸ اکتیو» and «galaxy s25 fe» under the budget now show the model with the over-budget note.

Live (release `bcb5b96`, `docs/search-traces/after/live-*.txt`): smoke 7/7 ✓, and the same matrix:

| query | no budget | budget ≤ 3M |
|---|---|---|
| redmi buds 8 active | ✓ Redmi Buds 8 Active | ✓ Redmi Buds 8 Active + over-budget note |
| ردمی بادز ۸ اکتیو | ✓ | ✓ + note |
| هندزفری شیائومی | question (by design) | question |
| galaxy s25 fe | ✓ S25 FE phones | ✓ S25 FE phones + note (from 184M) |
| ایرپاد پرو | ✓ AirPods Pro 2 | ✓ |
| شارژر ۲۰ وات اپل | ✓ Apple 20W | ✓ |
| یه هندزفری بی‌سیم می‌خوام | question (by design) | question |

Checks after the fix: typecheck ✓, lint 0 errors, unit 102/102, search-eval 42/42 + agent 6/6, DEMO_SCRIPT walk 23/23, e2e 12/12. One earlier full e2e run had «3D mall view + floor chips» (desktop) time out waiting for `mall-exit` to become stable while the machine was loaded (5.1 min run vs ~3); that test then passed 6/6 alone and the full suite passed 12/12 on rerun. The mall code wasn't touched by this change.

