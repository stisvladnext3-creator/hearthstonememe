import { expect, test, type Page } from '@playwright/test';
import { createGame, type Game, type Minion } from '../src/game/engine';
import { CARD } from '../src/game/cards';

function fixture(): Game {
  const g = createGame(undefined, 951);
  g.player.maxMana = g.player.mana = 10;
  g.player.hand = [];
  return g;
}
function unit(g: Game, id: string, enemy = false) {
  const c = CARD[id];
  const m: Minion = { id, uid: g.nextUid++, attack: c.attack!, health: c.health!, maxHealth: c.health!, ready: true,
    taunt: !!c.taunt, cannotAttack: !!c.cannotAttack, silenced: false, ephemeral: false };
  g[enemy ? 'bot' : 'player'].board.push(m);
  return m;
}
async function seed(page: Page, game: Game) {
  await page.addInitScript(data => {
    localStorage.setItem('memestone.v1.game', JSON.stringify(data));
    localStorage.setItem('memestone.v1.settings', JSON.stringify({ sound: false, motion: false }));
  }, game);
  await page.goto('/');
  await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
}
test('home, illustrated card details, rules and keyboard dialog dismissal', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Твои карты. Твои правила.' })).toBeVisible();
  await page.getByRole('button', { name: 'Галинка, 10 маны', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Галинка' });
  await expect(detail).toBeVisible();
  await expect(detail.getByText('Провокация. Боевой клич: призывает Пушкина 15/15 с провокацией.', { exact: true })).toHaveCount(2);
  await page.keyboard.press('Escape'); await expect(detail).not.toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Как играть' }).click();
  await expect(page.getByRole('dialog', { name: 'Как играть' })).toBeVisible();
  await page.getByRole('button', { name: 'Всё понятно' }).click();
  expect(errors).toEqual([]);
});
test('collection searches, categories and mana filters work together', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await expect(page.locator('.card-grid .game-card')).toHaveCount(20);
  await page.getByRole('tab', { name: 'Твои мемы' }).click();
  await expect(page.locator('.card-grid .game-card')).toHaveCount(9);
  await page.getByLabel('Поиск карт').fill('рус');
  await expect(page.locator('.card-grid .game-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Русланчик, 4 маны' })).toBeVisible();
  await page.getByLabel('Стоимость 7 и больше').click();
  await expect(page.getByRole('heading', { name: 'Карты спрятались' })).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(page.locator('.card-grid .game-card')).toHaveCount(20);
});
test('deck editor saves an actual changed 30-card deck and survives reload', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить колоду' }).click();
  await page.getByRole('button', { name: 'Убрать Завсегдатай', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить колоду' })).toBeDisabled();
  await page.getByRole('button', { name: 'Добавить Искра хаоса', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить колоду' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.deck')!).filter((id: string) => id === 'bolt').length)).toBe(3);
  await page.reload();
  await page.getByRole('button', { name: 'В бой', exact: true }).click();
  expect(await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('memestone.v1.game')!); return [...g.player.deck, ...g.player.hand.map((c: { id: string }) => c.id)].filter(id => id === 'bolt').length; })).toBe(3);
});
test('targeted spell bypasses taunt, minion attack obeys taunt and damage is rendered', async ({ page }) => {
  const g = fixture(); g.player.hand.push({ id: 'bolt', uid: g.nextUid++ });
  unit(g, 'dragon'); unit(g, 'bouncer', true);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await seed(page, g);
  await page.getByRole('button', { name: 'Искра хаоса, 2 маны', exact: true }).click();
  await page.getByRole('button', { name: /Герой противника: 30 здоровья, атаковать/ }).click();
  await expect(page.getByRole('button', { name: 'Герой противника: 27 здоровья' })).toBeVisible();
  await page.getByRole('button', { name: /Пепельный дракон: 7 атаки/ }).click();
  await expect(page.getByRole('button', { name: 'Герой противника: 27 здоровья' })).toBeDisabled();
  await page.getByRole('button', { name: /Вышибала: 2 атаки/ }).click();
  await expect(page.getByRole('button', { name: /Пепельный дракон: 7 атаки, 5 здоровья/ })).toBeVisible();
  await expect(page.locator('.enemy-board .board-unit')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('bot takes its turn, game persists and resumes after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'В бой', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ход Бориса', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled({ timeout: 12000 });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!));
  expect(before.turn).toBe(3);
  expect(before.bot.maxMana).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!));
  expect(after).toEqual(before);
});
test('suicide card ends match, counts one loss and offers rematch', async ({ page }) => {
  const g = fixture(); g.player.hand.push({ id: 'goodgame', uid: g.nextUid++ });
  await seed(page, g);
  await page.getByRole('button', { name: 'Хорошая игра., 0 маны' }).click();
  await expect(page.getByRole('dialog', { name: 'Результат боя' })).toBeVisible();
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.stats')!));
  expect(stats.games).toBe(1); expect(stats.wins).toBe(0);
  await page.getByRole('button', { name: 'Ещё одна партия' }).click();
  await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.stats')!).games)).toBe(1);
});
test('settings persist and corrupted local data falls back safely', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('memestone.v1.game', '{"broken":true}'); localStorage.setItem('memestone.v1.deck', '"bad"'); });
  await page.goto('/'); await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('checkbox', { name: /Анимации/ }).uncheck();
  await page.getByRole('button', { name: 'Сохранено' }).click();
  await page.reload(); await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Анимации/ })).not.toBeChecked();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'В бой', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled();
});
test('mobile navigation, collection and full battlefield do not overflow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Открыть навигацию' }).click();
  await page.getByRole('navigation').getByRole('button', { name: /Коллекция/ }).click();
  await expect(page.locator('.card-grid .game-card')).toHaveCount(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Галинка, 10 маны' }).click();
  await expect(page.getByRole('dialog', { name: 'Галинка' })).toBeVisible();
  await page.keyboard.press('Escape');
  const g = fixture();
  for (let i = 0; i < 7; i++) { unit(g, 'bouncer'); unit(g, 'bouncer', true); }
  for (let i = 0; i < 10; i++) g.player.hand.push({ id: i % 2 ? 'regular' : 'galinka', uid: g.nextUid++ });
  await seed(page, g);
  await expect(page.locator('.player-board .board-unit')).toHaveCount(7);
  await expect(page.locator('.enemy-board .board-unit')).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const boxes = await page.locator('.player-board .board-unit').evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()));
  expect(boxes.every(b => b.x >= 0 && b.x + b.width <= 390)).toBe(true);
});
