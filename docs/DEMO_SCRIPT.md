# Demo script: recording at 1440×900

**Demo shop: ویسا آذریار**, پاساژ تجارت جهانی, طبقه ۳، واحد B۱۲ (`shop_bd6e24abdc5086b2d26f6473`), selling
**هندزفری بلوتوثی شیائومی Redmi Buds 8 Active** (`product_7e5b414601f84774977ae02f`).
It ranks #1 from the default location (۹۰ متر · ۲ دقیقه پیاده), sits in a pasaj with a known floor and unit, and its 3D view has 8 floors (منفی ۱ … ۶).
Deep link fallback: `http://localhost:3000/p/product_7e5b414601f84774977ae02f/s/shop_bd6e24abdc5086b2d26f6473`

> No `docs/DEMO_SCRIPT.md` existed in the repo. This file is the README "Demo-day script" adapted to recording mode.
> Every step below was walked with Playwright at 1440×900 on 2026-10-23 (`DATA_SOURCE=sqlite`, live LLM). Notes marked ⚠ are where the app differs from what you might expect.

## Before recording

1. `npm run demo`. It builds if needed, resets inquiries and today-overrides, and starts on :3000 with `DATA_SOURCE=sqlite LLM_MODE=auto AUTO_REPLY=1 AUTO_REPLY_SKIP_QUESTIONS=1`. Then it sends one warm-up chat. Wait for `› ready`.
2. Record **between 10:00 and 18:00 Tehran time**. ⚠ Outside the shop's hours every card shows «بسته», and «مغازه بسته بود» finds no open alternative.
3. Two tabs: **A** = `http://localhost:3000/` (shopper), **B** = `http://localhost:3000/shop` (owner).
4. To re-take: `curl -X POST "localhost:3000/api/admin/reset?key=$SHOP_TOKEN_SECRET"` (default `dev-secret-change-me`), then reload both tabs.

## Steps

1. **A:** type «هندزفری میخوام» and send. In ~5 s the agent asks «برای چه استفاده‌ای می‌خوای؟». The replies vary with the live LLM, but «ورزش» was offered every time.
2. **A:** tap «ورزش». In ~6 s, 4 product cards appear; the first is Redmi Buds 8 Active.
3. **A:** tap «دقیق‌ترش کن». ⚠ This asks a **second question** (e.g. «برای ورزش، بیشتر برات کدوم مهم‌تره؟»: فیت روی گوش / باتری بیشتر / نویزکنسلینگ). Tap «نویزکنسلینگ». A comparison card appears in ~2 s.
4. **A:** choose **Redmi Buds 8 Active** (the first card). The map and ranked shops appear, with ویسا آذریار first.
5. **A:** the top 3 show «در حال استعلام از فروشنده…». The bot resolves them in ~3–26 s (random outcome: 70% confirm, 20% new price, 10% out of stock). ⚠ If ویسا آذریار comes back «تموم شده», reset and re-take.
6. **A:** open ویسا آذریار. Show the ETA (۲ دقیقه, «تقریبی»), the chips پاساژ تجارت جهانی · طبقه ۳ · واحد B۱۲, and the listed vs verified price.
7. **A:** «استعلام از فروشگاه» → tap «رنگ دیگه هم داره؟» → send.
   ⚠ **At 1440×900 the send button is off-screen.** The popover opens below the button and the panel can't scroll it higher (button top ≈ 662 px, popover bottom ≈ 1065 px). Zooming out doesn't help. Workaround (verified): after tapping «رنگ دیگه هم داره؟», press **Tab ×4** (two more chips → input → send), then **Enter**. The toast «سؤالت همراه استعلام برای فروشنده رفت» confirms.
   The question is **not** auto-answered (`AUTO_REPLY_SKIP_QUESTIONS=1`); the timeline stays on «منتظر پاسخ فروشنده…».
8. **B:** reload `/shop` → ویسا آذریار. The card shows «سؤال مشتری: رنگ دیگه هم داره؟».
   ⚠ **Answer the question first** (tap «بله، مشکی و سفید داریم»). Otherwise «قیمت جدید»/«موجوده» only shows the toast «لطفاً به سؤال مشتری هم یک جواب کوتاه بده».
   Then «قیمت جدید» → ⌫ until empty → ۳ ۹ ۰ ۰ ۰۰۰ (= ۳٬۹۰۰٬۰۰۰) → «ثبت قیمت جدید».
   ⚠ The yellow banner on `/shop` says AUTO_REPLY is on and suggests `?manual=1`. In recording mode that's misleading; keep this tab's top out of frame.
9. **A:** within ~1.5 s: «قیمت تأییدشده ۳٫۹ میلیون تومان», «پاسخ فروشنده: بله، مشکی و سفید داریم», and the notice «ویسا آذریار قیمت رو به‌روز کرد ۳٫۸ ← ۳٫۹ میلیون تومان».
10. **A:** «پیدا کردنش سخته؟» → «کدوم طبقه؟». In ~4 s: «طبقه ۳، واحد B12 … پاساژ تجارت جهانی …» (landmarks flagged as approximate).
11. **A:** «نمای داخل پاساژ (پاساژ تجارت جهانی)». The 3D view opens on «همه», with the shop as the pink marker and a pink dot on chip «۳». ⚠ The floor is not isolated automatically; tap «۳». Then «بازگشت به نقشه».
12. **A:** «مغازه بسته بود». Shows «متأسفیم!» and the nearest open alternatives (during opening hours).
