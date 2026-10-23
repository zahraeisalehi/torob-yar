import { expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export async function shot(page: Page, info: TestInfo, name: string) {
  const dir = path.join(process.env.BASE_URL ? 'e2e/screenshots/live' : 'e2e/screenshots', info.project.name);
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, `${info.title.replace(/\W+/g, '-').slice(0, 30)}-${name}.png`) });
}

export async function openHome(page: Page, query = '') {
  await page.goto('/' + query);
  await page.locator('[data-ready]').waitFor();
}

export async function ask(page: Page, text: string) {
  await page.getByTestId('prompt-input').fill(text);
  await page.getByTestId('prompt-action').click();
}

/** Request → (answer the question if one comes) → product cards. */
export async function toCards(page: Page, text: string) {
  await ask(page, text);
  const q = page.getByTestId('quick-reply').first();
  const card = page.getByTestId('choose-product').first();
  await expect(q.or(card)).toBeVisible({ timeout: 45_000 });
  if (await q.isVisible()) {
    await q.click();
    await expect(card).toBeVisible({ timeout: 45_000 });
  }
}

export async function toShops(page: Page, text = 'گوشی سامسونگ S25 FE') {
  await toCards(page, text);
  await page.getByTestId('choose-product').first().click();
  await page.waitForURL(/\/p\//);
  await expect(page.getByTestId('pinned-product')).toBeVisible();
  await expect(page.getByTestId('shop-card').first()).toBeVisible({ timeout: 30_000 });
}

/** Close the location explainer so it doesn't push the list around. */
export async function keepDefaultLocation(page: Page) {
  const btn = page.getByTestId('keep-default');
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

export async function openFirstShop(page: Page) {
  await page.getByTestId('shop-card').first().click({ force: true });
  await page.waitForURL(/\/s\//);
  await expect(page.getByTestId('shop-detail')).toBeVisible();
}
