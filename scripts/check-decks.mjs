import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
await context.addInitScript(() => localStorage.setItem('memestone.v1.settings', JSON.stringify({ motion: false, sound: false, board: 'classic' })));
const page = await context.newPage(), errors = []; page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
const book = () => page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.decks')));
async function fits(scope) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await expect.poll(() => scope.evaluate(el => [...el.querySelectorAll('button,input')].flatMap(node => {
    const r = node.getBoundingClientRect(); if (!r.width || !r.height) return [];
    return r.left >= -.5 && r.top >= -.5 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5 ? [] : [{ text: node.getAttribute('aria-label') || node.textContent, rect: [r.x, r.y, r.width, r.height] }];
  }))).toEqual([]);
}
const sizes = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 568, height: 320 }];
try {
  await page.goto(process.env.CONNECTION_TEST_URL || 'http://127.0.0.1:4173');
  await page.getByRole('button', { name: 'В бой', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Выбор колоды', exact: true });
  await picker.locator('.deck-slot.warlock').first().click();
  for (const size of sizes) { await page.setViewportSize(size); await fits(picker); }
  await page.setViewportSize({ width: 1440, height: 900 }); await fits(picker);
  await page.screenshot({ path: '/tmp/decks-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await picker.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.getByRole('button', { name: 'Создать колоду', exact: true }).click();
  const creator = page.getByRole('dialog', { name: 'Создание колоды', exact: true });
  await creator.getByRole('button', { name: 'Чернокнижник', exact: true }).click();
  await creator.getByLabel('Название новой колоды', { exact: true }).fill('Тёмный договор');
  for (const size of sizes) { await page.setViewportSize(size); await fits(creator); }
  await page.setViewportSize({ width: 390, height: 844 }); await creator.getByRole('button', { name: 'Создать колоду', exact: true }).click();
  const created = (await book()).decks.find(d => d.name === 'Тёмный договор'); expect(created.heroClass).toBe('warlock'); expect(created.cards.length).toBe(30);
  await page.getByRole('tab', { name: /^Колода ·/ }).click();
  for (const size of sizes) { await page.setViewportSize(size); await fits(page.locator('.collection-page')); }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Название колоды', { exact: true }).fill('Договор чернокнижника');
  await page.locator('.deck-row .icon-button').first().click();
  expect((await book()).decks.find(d => d.id === created.id).cards.length).toBe(29);
  await page.reload(); await page.getByRole('button', { name: 'Выбрать колоду для нового боя', exact: true }).click();
  await expect(picker.locator('.deck-slot.chosen')).toContainText('29/30'); await expect(picker.locator('.deck-play-button')).toBeDisabled();
  await picker.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.getByRole('button', { name: 'Редактировать колоду Договор чернокнижника', exact: true }).click();
  await page.getByRole('tab', { name: /^Колода ·/ }).click();
  await page.getByRole('button', { name: 'Стартовая колода', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить колоду', exact: true }).click();
  await page.getByRole('button', { name: 'Создать колоду', exact: true }).click();
  await creator.getByLabel('Название новой колоды', { exact: true }).fill('Черновик мага');
  await creator.getByRole('checkbox').uncheck(); await creator.getByRole('button', { name: 'Создать колоду', exact: true }).click();
  await page.getByRole('tab', { name: /^Колода ·/ }).click();
  await expect(page.locator('.deck-edit-class')).toContainText('Маг');
  const draft = (await book()).decks.find(d => d.name === 'Черновик мага'); expect(draft.cards).toEqual([]);
  await page.getByRole('button', { name: 'Удалить колоду', exact: true }).click();
  await page.getByRole('dialog', { name: 'Удаление колоды' }).getByRole('button', { name: 'Удалить колоду', exact: true }).click();
  expect((await book()).decks.some(d => d.id === draft.id)).toBe(false);
  // More than one page remains usable without scrolling.
  await page.evaluate(() => { const key = 'memestone.v1.decks', b = JSON.parse(localStorage.getItem(key)); const sample = b.decks[0]; for (let i = b.decks.length; i < 12; i++) b.decks.push({ ...sample, id: crypto.randomUUID(), name: 'Дополнительная колода ' + i, cards: [...sample.cards] }); localStorage.setItem(key, JSON.stringify(b)); });
  await page.reload(); await page.getByRole('button', { name: 'Выбрать колоду для нового боя', exact: true }).click();
  await picker.getByRole('button', { name: 'Следующая страница колод', exact: true }).click(); await fits(picker);
  await picker.getByRole('button', { name: 'Предыдущая страница колод', exact: true }).click();
  await picker.getByRole('button', { name: 'Колода Договор чернокнижника, Чернокнижник', exact: true }).click();
  await page.screenshot({ path: '/tmp/decks-phone.png' });
  await picker.getByRole('button', { name: 'Играть', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить стартовую руку', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Стартовая рука' })).toHaveCount(0);
  await expect(page.locator('.own-power strong')).toHaveText('Жизнеотвод');
  const live = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')));
  expect([...live.player.deck, ...live.player.hand.map(c => c.id)].sort()).toEqual([...created.cards].sort());
  const power = page.getByRole('button', { name: 'Сила героя Жизнеотвод, 2 маны', exact: true });
  await expect(power).toHaveAttribute('aria-disabled', 'true'); await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.locator('.end-turn')).toBeEnabled({ timeout: 15000 });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')));
  await power.click(); await expect(page.locator('.own-hero-row .hero-hp')).toContainText('28');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')));
  expect(after.player.hand.length).toBe(before.player.hand.length + 1); expect(after.player.deck.length).toBe(before.player.deck.length - 1); expect(after.player.mana).toBe(0);
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(power).toHaveAttribute('aria-disabled', 'true'); await expect(page.locator('.own-power strong')).toHaveText('Жизнеотвод');
  expect(errors).toEqual([]);
  console.log('PASS: saved class decks, create/rename/draft/delete, independent composition, paged picker, all new screens on four phone sizes, real warlock battle/power and reload.');
} catch (error) { await page.screenshot({ path: '/tmp/decks-failure.png' }); console.error((await page.locator('body').innerText()).slice(-1600)); throw error; }
finally { await context.close(); await browser.close(); }
