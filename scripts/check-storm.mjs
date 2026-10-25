import { chromium, expect } from '@playwright/test';
import { largeStormPack } from './large-card-fixture.mjs';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
await context.addInitScript(() => localStorage.setItem('memestone.v1.settings', JSON.stringify({ motion: true, sound: false, board: 'classic' })));
const page = await context.newPage(), errors = []; page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
const sizes = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 568, height: 320 }];
async function fits(scope) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  let last;
  await expect.poll(async () => last = await scope.evaluate(el => [...el.querySelectorAll('button,input:not([type=file]),select')].flatMap(node => {
    const r = node.getBoundingClientRect(); return !r.width || !r.height || r.left >= -.5 && r.top >= -.5 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5 ? [] : [{ name: node.getAttribute('aria-label') || node.textContent, rect: [r.x, r.y, r.width, r.height] }];
  })), { timeout: 15000 }).toEqual([]).catch(error => { console.error('Layout:', last); throw error; });
}
async function freezeVortex(path) { const fx = page.locator('[data-fx="storm-vortex"]'); await expect(fx).toHaveCount(1); await fx.evaluate(el => el.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = 380; })); await page.screenshot({ path, animations: 'allow' }); }
try {
  await page.goto(process.env.CONNECTION_TEST_URL || 'http://127.0.0.1:4173'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.waitForLoadState('networkidle'); await fits(page.locator('.collection-v2')); await page.screenshot({ path: '/tmp/storm-album-desktop.png' });
  for (const size of sizes) { await page.setViewportSize(size); await fits(page.locator('.collection-v2')); await expect(page.getByRole('button', { name: 'Редактор карт', exact: true })).toBeInViewport(); }
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'Редактор карт', exact: true }).click();
  const cards = largeStormPack(), payload = Buffer.from(JSON.stringify({ format: 'memestone-cards', version: 1, cards }));
  expect(payload.length).toBeGreaterThan(1_700_000); expect(payload.length).toBeLessThan(2_000_000);
  await page.locator('input[type=file]').setInputFiles({ name: 'large-storm.json', mimeType: 'application/json', buffer: payload });
  await expect(page.locator('.toast')).toContainText('Набор импортирован');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.custom-cards')).length)).toBe(40);
  await page.locator('input[type=file]').setInputFiles({ name: 'oversize.json', mimeType: 'application/json', buffer: Buffer.alloc(2_000_001, 32) });
  await expect(page.locator('.toast')).toContainText('2000 КБ');
  await page.getByRole('button', { name: 'Создать карту', exact: true }).click();
  await page.getByLabel('Название карты', { exact: true }).fill('Штормовой ученик'); await page.getByLabel('Класс карты', { exact: true }).selectOption('storm'); await page.getByLabel('Стоимость маны', { exact: true }).fill('0');
  for (const size of sizes) { await page.setViewportSize(size); await fits(page.locator('.card-editor')); }
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'Сохранить карту', exact: true }).click();
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click(); await page.getByLabel('Поиск карт').fill('Штормовой ученик');
  await page.getByRole('tab', { name: 'Карты класса Предвестник бури', exact: true }).click(); await expect(page.locator('.album-card-grid .game-card')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Общие карты', exact: true }).click(); await expect(page.locator('.album-card-grid .game-card')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Классовые карты', exact: true }).click(); await expect(page.locator('.album-card-grid .game-card')).toHaveCount(1);
  await page.getByRole('tab', { name: /^Мои колоды/ }).click(); await page.getByRole('button', { name: 'Создать колоду', exact: true }).click();
  const creator = page.getByRole('dialog', { name: 'Создание колоды', exact: true }); await creator.getByLabel('Название новой колоды', { exact: true }).fill('Проверка мага'); await creator.getByRole('checkbox').uncheck();
  for (const size of sizes) { await page.setViewportSize(size); await fits(creator); }
  await page.setViewportSize({ width: 390, height: 844 }); await creator.getByRole('button', { name: 'Создать колоду', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить Штормовой ученик', exact: true }).isDisabled().then(x => expect(x).toBe(true));
  await page.getByRole('tab', { name: /^Колода ·/ }).click(); await page.getByRole('button', { name: 'К списку колод', exact: true }).click();
  await page.getByRole('button', { name: 'Создать колоду', exact: true }).click(); await creator.getByRole('button', { name: 'Предвестник бури', exact: true }).click();
  await creator.getByLabel('Название новой колоды', { exact: true }).fill('Моя буря'); await creator.getByRole('button', { name: 'Создать колоду', exact: true }).click();
  await page.getByRole('tab', { name: /^Колода ·/ }).click(); await page.locator('.deck-row .icon-button').first().click(); await page.getByRole('tab', { name: 'Карты', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить Штормовой ученик', exact: true }).click();
  await page.getByRole('tab', { name: /^Колода ·/ }).click(); await page.getByRole('button', { name: 'Сохранить колоду', exact: true }).click();
  await page.getByRole('button', { name: 'Назад', exact: true }).click(); await page.getByRole('button', { name: 'Выбрать колоду для нового боя', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Выбор колоды', exact: true }); await expect(picker.locator('.deck-slot.chosen')).toContainText('Моя буря');
  for (const size of sizes) { await page.setViewportSize(size); await fits(picker); }
  await page.setViewportSize({ width: 390, height: 844 }); await picker.getByRole('button', { name: 'Играть', exact: true }).click(); await page.getByRole('button', { name: 'Подтвердить стартовую руку', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Стартовая рука' })).toHaveCount(0); await expect(page.locator('.own-power strong')).toHaveText('Зов бури');
  const power = page.getByRole('button', { name: 'Сила героя Зов бури, 2 маны', exact: true }); await expect(power).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Завершить', exact: true }).click(); await expect(page.locator('.end-turn')).toBeEnabled(); await power.click();
  await expect(page.locator('.player-board .board-unit')).toHaveCount(1); await freezeVortex('/tmp/storm-vortex-phone.png');
  await expect(page.locator('.player-board .unit-attack')).toHaveText('2'); await expect(page.locator('.player-board .unit-health')).toHaveText('1');
  await expect(page.locator('.player-board .board-unit')).not.toHaveClass(/ready/); await expect(power).toHaveAttribute('aria-disabled', 'true');
  const game = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game'))); expect(game.player.mana).toBe(0);
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click(); await expect(page.locator('.own-power strong')).toHaveText('Зов бури');
  await expect(page.locator('.player-board .unit-health')).toHaveText('1'); expect(errors).toEqual([]);
  console.log(`PASS: new album and brush placement, four phone sizes, ${payload.length}-byte JSON imported, oversize rejected, class editor/filter/decks and real storm summon/vortex/reload.`);
} catch (error) { await page.screenshot({ path: '/tmp/storm-ui-failure.png' }); console.error(await page.evaluate(() => [...document.querySelectorAll('.card-workshop button,.card-workshop input:not([type=file]),.card-workshop select')].flatMap(e => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.left < -.5 || r.top < -.5 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5) ? [{ name: e.getAttribute('aria-label'), rect: [r.x, r.y, r.width, r.height] }] : []; }))); console.error((await page.locator('body').innerText()).slice(-500)); throw error; }
finally { await context.close(); await browser.close(); }
