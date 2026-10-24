import { expect, test } from '@playwright/test';
import { ask, keepDefaultLocation, openFirstShop, openHome, shot, toCards, toShops } from './helpers';

test('phone scenario: question → cards → refine → shops → detail → back', async ({ page }, info) => {
  await openHome(page);
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await shot(page, info, '01-empty');

  await ask(page, 'گوشی میخوام');
  await expect(page.getByTestId('question')).toBeVisible({ timeout: 45_000 });
  await shot(page, info, '02-question');
  await page.getByTestId('quick-reply').first().click();
  await expect(page.getByTestId('product-card').first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('why').first()).toBeVisible();
  await expect(page.getByTestId('enough-prompt')).toBeVisible();
  await shot(page, info, '03-cards');

  await page.getByTestId('enough-refine').click();
  await expect(page.getByTestId('question')).toHaveCount(2, { timeout: 45_000 });
  await shot(page, info, '04-second-question');
  await page.getByTestId('quick-reply').filter({ hasNotText: 'مهم نیست' }).last().click();
  await expect(page.getByTestId('compare-cards')).toHaveCount(2, { timeout: 45_000 });
  await shot(page, info, '05-refined-cards');

  await page.getByTestId('choose-product').first().click();
  await page.waitForURL(/\/p\//);
  await expect(page.getByTestId('pinned-product')).toBeVisible();
  await expect(page.getByTestId('map')).toBeVisible();
  await expect(page.getByTestId('shop-card').first()).toBeVisible({ timeout: 30_000 });
  await keepDefaultLocation(page);
  await shot(page, info, '06-shops');

  // sorting changes the order
  const firstBest = await page.getByTestId('shop-card').first().getAttribute('data-shop-id');
  await page.getByTestId('sort-cheapest').click();
  await page.waitForTimeout(600);
  const prices = await page.getByTestId('shop-card').evaluateAll((els) => els.slice(0, 5).map((e) => e.getAttribute('data-shop-id')));
  await page.getByTestId('sort-nearest').click();
  await page.waitForTimeout(600);
  const nearest = await page.getByTestId('shop-card').evaluateAll((els) => els.slice(0, 5).map((e) => e.getAttribute('data-shop-id')));
  expect(JSON.stringify(prices) !== JSON.stringify(nearest) || prices[0] !== firstBest).toBeTruthy();
  await page.getByTestId('sort-best').click();
  await shot(page, info, '07-sorted');

  // the agent verifies the top shops automatically (AUTO_REPLY)
  await expect(page.locator('[data-testid^="notice-"]').first()).toBeVisible({ timeout: 40_000 });
  await shot(page, info, '08-verified');

  await openFirstShop(page);
  await expect(page.getByTestId('eta')).toBeVisible();
  await expect(page.getByTestId('inquiry-timeline')).toBeVisible({ timeout: 20_000 });
  await shot(page, info, '09-detail');

  // back, back → cards again with the chat intact
  await page.goBack();
  await expect(page).toHaveURL(/\/p\/[^/]+$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('product-card').first()).toBeVisible();
  await expect(page.getByTestId('question')).toHaveCount(2);
  await shot(page, info, '10-back-to-cards');
});

test('installment filter: empty → nearest relaxation works', async ({ page }, info) => {
  await openHome(page);
  await toShops(page);
  await keepDefaultLocation(page);
  await page.getByTestId('crit-installment').click();
  await page.getByTestId('crit-distance').click();
  await page.getByRole('dialog').getByText('۵۰۰ متر').click();
  const relax = page.getByTestId('relaxation');
  await expect(relax.or(page.getByTestId('shop-card').first())).toBeVisible();
  await shot(page, info, '01-filtered');
  if (await relax.isVisible()) {
    await expect(relax).toContainText('با این شرایط فروشگاهی پیدا نشد');
    await page.getByTestId('relax-apply').click();
    await expect(page.getByTestId('shop-card').first()).toBeVisible();
    await shot(page, info, '02-relaxed');
  }
});

test('مغازه بسته بود → open alternatives', async ({ page }, info) => {
  await openHome(page);
  await toShops(page);
  await keepDefaultLocation(page);
  await openFirstShop(page);
  await page.getByTestId('shop-closed').click();
  await expect(page.getByTestId('closed-flow')).toBeVisible();
  await expect(page.getByTestId('closed-flow')).toContainText('متأسفیم');
  await shot(page, info, '01-closed-flow');
});

test('3D mall view + floor chips', async ({ page }, info) => {
  await openHome(page);
  await toShops(page);
  await keepDefaultLocation(page);
  // open the first shop that sits in a complex
  const cards = page.getByTestId('shop-card');
  const n = await cards.count();
  let opened = false;
  for (let i = 0; i < Math.min(n, 8) && !opened; i++) {
    await cards.nth(i).click({ force: true });
    await page.waitForURL(/\/s\//);
    if (await page.getByTestId('open-mall').isVisible().catch(() => false)) opened = true;
    else {
      await page.getByTestId('detail-back').click();
      await expect(cards.first()).toBeVisible();
    }
  }
  expect(opened).toBeTruthy();
  await page.getByTestId('open-mall').click();
  await expect(page.getByTestId('mall-overlay')).toBeVisible();
  await expect(page.getByTestId('floor-chip').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await shot(page, info, '01-mall');
  const chip = page.getByTestId('floor-chip').first();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-selected', 'true');
  await shot(page, info, '02-floor');
  await page.getByTestId('mall-exit').click();
  await expect(page.getByTestId('mall-overlay')).toHaveCount(0);
});

test('shop inbox: «قیمت جدید» updates the user card', async ({ page, context }, info) => {
  await openHome(page, '?manual=1');
  await toShops(page);
  await keepDefaultLocation(page);
  // the agent has sent its automatic inquiries (manual mode: no bot reply)
  await expect(page.getByText('در حال استعلام از فروشنده').first()).toBeVisible({ timeout: 20_000 });
  const inbox = await context.newPage();
  await inbox.goto('/shop');
  const item = inbox.getByTestId('shop-index-item').first();
  await expect(item).toBeVisible({ timeout: 20_000 });
  await item.click();
  await expect(inbox.getByTestId('inbox-card').first()).toBeVisible();
  await shot(inbox, info, '01-inbox');
  await inbox.getByTestId('reply-new-price').first().click();
  await expect(inbox.getByTestId('keypad')).toBeVisible();
  for (let i = 0; i < 12; i++) await inbox.getByTestId('key-del').click();
  for (const k of ['9', '9', '000', '000']) await inbox.getByTestId(`key-${k}`).click();
  await shot(inbox, info, '02-keypad');
  await inbox.getByTestId('keypad-submit').click();
  await expect(inbox.getByTestId('keypad')).toHaveCount(0);
  // the user's side announces the new price
  await page.bringToFront();
  await expect(page.getByTestId('notice-new_price')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('notice-new_price')).toContainText('۹۹');
  await shot(page, info, '03-user-updated');
});

test('unknown request gets suggestions, not a dead end', async ({ page }) => {
  await openHome(page);
  // something neither the fixtures nor the full catalogue carries (the full one does sell hiking shoes)
  await ask(page, 'بلیط هواپیما');
  await expect(page.getByText('پیدا نکردم')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'گوشی سامسونگ S25 FE' }).last()).toBeVisible();
});
