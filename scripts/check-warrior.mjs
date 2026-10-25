import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await context.addInitScript(() => { localStorage.setItem('memestone.v1.settings', JSON.stringify({ motion: false, sound: false, board: 'classic' })); });
const page = await context.newPage(), errors = []; page.setDefaultTimeout(12000);
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(process.env.CONNECTION_TEST_URL || 'http://127.0.0.1:4173');
  await page.getByRole('button', { name: 'Выбрать колоду для нового боя', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Выбор колоды', exact: true });
  await picker.locator('.deck-slot.warrior').first().click();
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(picker.getByRole('button', { name: 'Играть', exact: true })).toBeVisible();
    await expect.poll(() => picker.evaluate(el => [...el.querySelectorAll('button')].flatMap(button => { const r = button.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 ? [] : [{ name: button.getAttribute('aria-label') ?? button.textContent, top: r.top, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight }]; })), { timeout: 3000 }).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  }
  await picker.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.reload(); await expect(page.locator('.wood-class-button')).toContainText('воин');
  await page.getByRole('button', { name: 'В бой', exact: true }).click();
  await picker.getByRole('button', { name: 'Играть', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить стартовую руку', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Стартовая рука' })).toHaveCount(0);
  await expect(page.locator('.own-hero-row .hero-label strong')).toHaveText('Воин');
  const power = page.getByRole('button', { name: 'Сила героя Поднять щит!, 2 маны', exact: true });
  await expect(power).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.locator('.end-turn')).toBeEnabled({ timeout: 15000 });
  await power.click();
  await expect(page.locator('.own-hero-row .hero-armor')).toHaveText('2');
  await expect(page.locator('.player-mana .mana-bar strong')).toHaveText('0/2');
  await expect(power).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.own-hero-row .hero-armor')).toHaveText('2');
  await page.getByRole('button', { name: 'История сражения', exact: true }).click();
  await expect(page.locator('.battle-log')).toContainText('Поднять щит!');
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(page.locator('.own-hero-row .hero-armor')).toHaveText('2');
  await expect(power).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Главное меню', exact: true }).click();
  await page.getByRole('button', { name: 'Выбрать колоду для нового боя', exact: true }).click();
  await picker.locator('.deck-slot.mage').first().click();
  await picker.getByRole('button', { name: 'Играть', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Стартовая рука' })).toBeVisible();
  await expect(page.locator('.own-power strong')).toHaveText('Искра');
  expect(errors).toEqual([]);
  console.log('PASS: warrior selection on phones, preference, solo power, cost, one use per turn, history, saved game and changing back to mage.');
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(-2000));
  await page.screenshot({ path: '/tmp/memestone-warrior-failure.png' }); throw error;
} finally { await context.close(); await browser.close(); }
