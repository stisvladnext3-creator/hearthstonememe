import { expect, test, type Page } from '@playwright/test';
import { createGame, type Game, type Minion } from '../src/game/engine';
import { CARD, CARDS } from '../src/game/cards';

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
async function seed(page: Page, game: Game, motion = false) {
  await page.addInitScript(({ game: data, motion }) => {
    if (sessionStorage.getItem('memestone.fixture.' + data.id)) return;
    sessionStorage.setItem('memestone.fixture.' + data.id, '1');
    localStorage.setItem('memestone.v1.game', JSON.stringify(data));
    localStorage.setItem('memestone.v1.settings', JSON.stringify({ sound: false, motion }));
  }, { game, motion });
  await page.goto('/');
  await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
}
test('home, illustrated card details, rules and keyboard dialog dismissal', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Memestone', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.getByLabel('Поиск карт').fill('Галинка');
  await page.getByRole('button', { name: 'Галинка, 10 маны', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Галинка' });
  await expect(detail).toBeVisible();
  await expect(detail.locator('.effect-description')).toContainText('призывает Пушкина 15/15');
  await page.keyboard.press('Escape'); await expect(detail).not.toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Как играть' }).click();
  await expect(page.getByRole('dialog', { name: 'Как играть' })).toBeVisible();
  await page.getByRole('button', { name: 'Всё понятно' }).click();
  expect(errors).toEqual([]);
});
test('collection searches, categories and mana filters work together', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await expect(page.locator('.card-grid .game-card')).toHaveCount(8);
  await page.getByRole('tab', { name: 'Твои мемы' }).click();
  await expect(page.locator('.card-grid .game-card')).toHaveCount(8);
  await page.getByLabel('Поиск карт').fill('рус');
  await expect(page.locator('.card-grid .game-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Русланчик, 4 маны' })).toBeVisible();
  await page.getByLabel('Стоимость 7 и больше').click();
  await expect(page.getByRole('heading', { name: 'Карты спрятались' })).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(page.locator('.card-grid .game-card')).toHaveCount(8);
});
test('deck editor saves an actual changed 30-card deck and survives reload', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить колоду' }).click();
  await page.getByRole('button', { name: 'Убрать Завсегдатай', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить колоду' })).toBeDisabled();
  await page.getByLabel('Поиск карт').fill('Искра хаоса');
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
  await page.goto('/'); await page.locator('.wood-topbar').getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('checkbox', { name: /Анимации/ }).uncheck();
  await page.getByRole('button', { name: 'Сохранено' }).click();
  await page.reload(); await page.locator('.wood-topbar').getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Анимации/ })).not.toBeChecked();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'В бой', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled();
});
test('mobile navigation, collection and full battlefield do not overflow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await expect(page.locator('.card-grid .game-card')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Поиск карт').fill('Галинка');
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

test('original image replaces the full card, persists after reload, and can be removed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.getByLabel('Поиск карт').fill('Галинка');
  await page.getByRole('button', { name: 'Галинка, 10 маны', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Галинка' });
  await dialog.getByLabel('Загрузить оригинал Галинка').setInputFiles('public/art/card-frame.png');
  await expect(dialog.getByAltText('Оригинальная карта Галинка')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.getByLabel('Поиск карт').fill('Галинка');
  await page.getByRole('button', { name: 'Галинка, 10 маны', exact: true }).click();
  await expect(dialog.getByAltText('Оригинальная карта Галинка')).toBeVisible();
  await dialog.getByRole('button', { name: 'Убрать свою картинку' }).click();
  await expect(dialog.getByAltText('Оригинальная карта Галинка')).toHaveCount(0);
  await expect(dialog.locator('.awaiting-original')).toBeVisible();
});

test('history shows source, target, reciprocal damage and turn, then survives reload', async ({ page }) => {
  const g = fixture(); unit(g, 'mage'); unit(g, 'bouncer', true);
  await seed(page, g);
  await page.getByRole('button', { name: /Хранительница искр: 3 атаки/ }).click();
  await page.getByRole('button', { name: /Вышибала: 2 атаки/ }).click();
  await page.getByRole('button', { name: 'История сражения', exact: true }).click();
  const history = page.locator('.battle-log');
  await expect(history).toContainText('Хранительница искр → Вышибала: 3 урона. Ответный удар Вышибала: 2 урона.');
  await expect(history).toContainText('ХОД 1 · ВЫ');
  await expect(history.locator('.history-entry > p').first()).toBeInViewport();
  await page.reload();
  await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await page.getByRole('button', { name: 'История сражения', exact: true }).click();
  await expect(page.locator('.battle-log')).toContainText('Ответный удар Вышибала: 2 урона.');
});

test('card strike and hero strike animate at their real targets', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const g = fixture(); unit(g, 'mage'); unit(g, 'bouncer', true); unit(g, 'dragon');
  await seed(page, g, true);
  await page.getByRole('button', { name: /Хранительница искр: 3 атаки/ }).click();
  await page.getByRole('button', { name: /Вышибала: 2 атаки/ }).click();
  await expect(page.locator('[data-fx="attack"]')).toBeVisible();
  await expect(page.locator('[data-fx="damage"]').first()).toBeAttached();
  await expect(page.locator('[data-fx="attack"]')).toHaveCount(0, { timeout: 3000 });
  await page.getByRole('button', { name: /Пепельный дракон: 7 атаки/ }).click();
  await page.getByRole('button', { name: /Герой противника: 30 здоровья, атаковать/ }).click();
  await expect(page.locator('[data-fx="attack"]')).toBeVisible();
  await expect(page.locator('[data-combat-anchor="bot:hero"]')).toHaveClass(/combat-hit/);
  await expect(page.getByRole('button', { name: 'Герой противника: 23 здоровья' })).toBeVisible();
});

test('summoning and hero power have distinct animations; disabling motion stops them', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const g = fixture(); g.player.hand.push({ id: 'regular', uid: g.nextUid++ });
  await seed(page, g, true);
  await page.getByRole('button', { name: 'Завсегдатай, 1 маны' }).click();
  await expect(page.locator('[data-fx="summon"]')).toBeVisible();
  await expect(page.locator('[data-fx="summon"]')).toHaveCount(0, { timeout: 3000 });
  await page.getByRole('button', { name: 'Сила героя Искра, 2 маны' }).click();
  await page.getByRole('button', { name: /Герой противника: 30 здоровья, атаковать/ }).click();
  await expect(page.locator('[data-fx="power"]')).toBeAttached();
  await expect(page.locator('.fx-power-name')).toHaveText('Искра');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('checkbox', { name: /Анимации/ }).uncheck();
  await page.getByRole('button', { name: 'Сохранено' }).click();
  await expect(page.locator('.combat-effects')).toBeHidden();
});

test('discounted Джайна displays its real cost and replaces the hero power', async ({ page }) => {
  const g = fixture(); g.rashDeaths = 2; g.player.hand.push({ id: 'jaina', uid: g.nextUid++ });
  await seed(page, g);
  await expect(page.getByRole('button', { name: 'Джайна-ассасин, 10 маны' })).toBeVisible();
  await page.getByRole('button', { name: 'Джайна-ассасин, 10 маны' }).click();
  await expect(page.getByRole('button', { name: 'Сила героя Сила РДШ, 4 маны' })).toBeVisible();
  await expect(page.locator('.own-hero-row .hero-armor')).toHaveText('10');
  await page.getByRole('button', { name: 'История сражения' }).click();
  await expect(page.locator('.battle-log')).toContainText('Джайна даёт 10 брони');
});

test('the album pages through every card exactly once and resets its page after filtering', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  const names: string[] = [];
  for (let n = 1; n <= Math.ceil(CARDS.length / 8); n++) {
    await expect(page.getByRole('status').filter({ hasText: /Страница/ })).toContainText(`Страница ${n}`);
    names.push(...await page.locator('.card-grid .game-card').evaluateAll(cards => cards.map(c => c.getAttribute('aria-label')!)));
    if (n < Math.ceil(CARDS.length / 8)) await page.getByRole('button', { name: 'Следующая страница' }).click();
  }
  expect(names).toHaveLength(CARDS.length); expect(new Set(names).size).toBe(CARDS.length);
  await expect(page.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();
  await page.getByLabel('Поиск карт').fill('Галинка');
  await expect(page.locator('.book-pagination')).toContainText('Страница 1 из 1');
  await expect(page.locator('.card-grid .game-card')).toHaveCount(1);
});

test('holding a hand card opens its rules without spending mana or playing it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const g = fixture(); const uid = g.nextUid++; g.player.hand = [{ id: 'regular', uid }];
  await seed(page, g);
  const card = page.getByRole('button', { name: 'Завсегдатай, 1 маны', exact: true });
  await card.scrollIntoViewIfNeeded(); const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.waitForTimeout(550); await page.mouse.up();
  const dialog = page.getByRole('dialog', { name: 'Завсегдатай' });
  await expect(dialog).toBeVisible(); await expect(dialog.locator('.inspection-context')).toContainText('Карта в руке');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!).player.mana)).toBe(10);
  await page.keyboard.press('Escape');
  await expect(card).toBeVisible(); await expect(page.locator('.player-board .board-unit')).toHaveCount(0);
});

test('holding either board side shows current stats without selecting an attack', async ({ page }) => {
  const g = fixture(); const own = unit(g, 'dragon'); own.health = 4; const enemy = unit(g, 'guardian', true);
  await seed(page, g);
  for (const [selector, name, health] of [[`[data-combat-anchor="player:${own.uid}"]`, 'Пепельный дракон', '4/7'], [`[data-combat-anchor="bot:${enemy.uid}"]`, 'Страж трактира', '6/6']]) {
    const button = page.locator(selector); const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.waitForTimeout(550); await page.mouse.up();
    const dialog = page.getByRole('dialog', { name });
    await expect(dialog).toBeVisible(); await expect(dialog.locator('.live-unit-stats')).toContainText(health);
    await page.keyboard.press('Escape');
  }
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!));
  expect(saved.player.board[0].ready).toBe(true); expect(saved.bot.board[0].health).toBe(6);
});

test('dragging a hand card cancels long press and the accidental play', async ({ page }) => {
  const g = fixture(); g.player.hand = [{ id: 'regular', uid: g.nextUid++ }]; await seed(page, g);
  const card = page.getByRole('button', { name: 'Завсегдатай, 1 маны', exact: true });
  await card.scrollIntoViewIfNeeded(); const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 40); await page.mouse.down();
  await page.mouse.move(box.x + 48, box.y + 40, { steps: 4 }); await page.waitForTimeout(550); await page.mouse.up();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.player-hand .game-card')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!).player.mana)).toBe(10);
});

test('right-click reads a hand card without playing it', async ({ page }) => {
  const g = fixture(); g.player.hand = [{ id: 'galinka', uid: g.nextUid++ }]; await seed(page, g);
  await page.getByRole('button', { name: 'Галинка, 10 маны', exact: true }).click({ button: 'right' });
  await expect(page.getByRole('dialog', { name: 'Галинка' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!).player.hand.length)).toBe(1);
});

test('visual history distinguishes transformation from a played battlecry and shows hero/power images', async ({ page }) => {
  const g = fixture(); unit(g, 'guardian', true); g.player.hand = [{ id: 'trachukcha', uid: g.nextUid++ }];
  await seed(page, g);
  await page.getByRole('button', { name: 'Сила героя Искра, 2 маны', exact: true }).click();
  await page.getByRole('button', { name: /Страж трактира: 4 атаки/ }).click();
  await page.getByRole('button', { name: 'Трачукча, 0 маны', exact: true }).click();
  await page.getByRole('button', { name: 'Сила героя Дибильнутый!, 3 маны', exact: true }).click();
  await expect(page.getByRole('button', { name: /Хорошая игра.: 99 атаки, 99 здоровья/ })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Результат боя' })).toHaveCount(0);
  await page.getByRole('button', { name: 'История сражения', exact: true }).click();
  await expect(page.locator('.history-entry > p').first()).toBeInViewport();
  await expect(page.locator('.history-entry.history-transform .history-entity.power')).toBeVisible();
  await expect(page.locator('.history-transform-result')).toContainText('Хорошая игра.');
  await expect(page.locator('.history-entry.history-transform')).toContainText('Боевой клич результата не срабатывает');
  await expect(page.locator('.history-caster').filter({ hasText: 'Лира' }).first()).toBeVisible();
  await expect(page.locator('.history-caster').filter({ hasText: 'Трачукча' }).first()).toBeVisible();
  await page.locator('.history-transform-result').getByRole('button', { name: 'Посмотреть Хорошая игра.' }).click();
  await expect(page.getByRole('dialog', { name: 'Хорошая игра.' })).toBeVisible();
});

test('a bot lethal outcome reaches the victory screen and increments wins once', async ({ page }) => {
  const g = fixture(); g.bot.health = 1; g.bot.deck = []; g.bot.armor = 0;
  await seed(page, g); await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Результат боя' })).toContainText('Твоя взяла!');
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.stats')!));
  expect(stats.wins).toBe(1); expect(stats.games).toBe(1);
});

test('an unavailable power explains the hand cap when held and consumes nothing', async ({ page }) => {
  const g = fixture(); g.player.power = 'oy';
  g.player.hand = Array.from({ length: 10 }, () => ({ id: 'regular', uid: g.nextUid++ }));
  await seed(page, g);
  const button = page.getByRole('button', { name: 'Сила героя Ой, 6 маны', exact: true });
  await expect(button).toBeDisabled(); await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.waitForTimeout(550); await page.mouse.up();
  const dialog = page.getByRole('dialog', { name: 'Ой' });
  await expect(dialog).toBeVisible(); await expect(dialog.locator('.inspection-context')).toContainText('уже 10 карт');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!).player.mana)).toBe(10);
});

test('all three new cards show bundled internet art and source attribution', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  for (const id of ['dragonslayer', 'dog-spell', 'vasiliy']) {
    const c = CARD[id]; await page.getByLabel('Поиск карт').fill(c.name);
    await page.getByRole('button', { name: `${c.name}, ${c.cost} маны`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: c.name, exact: true });
    await expect(dialog.locator('.original-portrait')).toBeVisible();
    await expect(dialog.locator('.awaiting-original')).toHaveCount(0);
    await expect(dialog.locator('.art-credit a').first()).toHaveAttribute('href', /commons.wikimedia.org/);
    const url = await dialog.locator('.original-portrait').evaluate(e => getComputedStyle(e).backgroundImage.slice(5, -2));
    expect((await page.request.get(url)).ok()).toBe(true);
    await page.keyboard.press('Escape');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('mobile discovery preserves its three choices across reload and inspects without selecting', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const g = fixture(); g.player.deck = ['regular', 'dragon', 'bolt'];
  g.player.hand = [{ id: 'dog-spell', uid: g.nextUid++ }];
  await seed(page, g);
  await page.getByRole('button', { name: `${CARD['dog-spell'].name}, 2 маны`, exact: true }).click();
  await page.getByRole('button', { name: /Герой противника: 30 здоровья, атаковать/ }).click();
  let choices = page.getByRole('dialog', { name: 'Раскопка', exact: true });
  await expect(choices.locator('.game-card')).toHaveCount(3);
  const offered = await choices.locator('.game-card').evaluateAll(cards => cards.map(c => c.getAttribute('aria-label')));
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  choices = page.getByRole('dialog', { name: 'Раскопка', exact: true });
  await expect(choices).toBeVisible();
  expect(await choices.locator('.game-card').evaluateAll(cards => cards.map(c => c.getAttribute('aria-label')))).toEqual(offered);
  await page.keyboard.press('Escape'); await expect(choices).toBeVisible();
  const option = choices.locator('.game-card').first(); const box = (await option.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.waitForTimeout(550); await page.mouse.up();
  await expect(page.locator('.card-detail-modal .inspection-context')).toContainText('Вариант раскопки');
  await page.keyboard.press('Escape'); await expect(choices).toBeVisible();
  await choices.locator('.game-card').first().click(); await expect(choices).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Герой противника: 26 здоровья', exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!));
  expect(saved.player.deck).toEqual(g.player.deck); expect(saved.player.hand).toHaveLength(1); expect(saved.player.mana).toBe(8);
  expect(saved.discovery).toBeUndefined();
  await page.getByRole('button', { name: 'История сражения', exact: true }).click();
  await expect(page.locator('.history-discover .history-entity').last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('bot completes its discovery and deals lethal damage without losing the effect', async ({ page }) => {
  const errors: string[] = []; page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const g = fixture(); g.active = 'bot'; g.player.health = 4;
  g.bot.hand = [{ id: 'dog-spell', uid: g.nextUid++ }]; g.bot.mana = g.bot.maxMana = 2;
  g.bot.deck = ['regular', 'dragon', 'bolt']; unit(g, 'guardian');
  await seed(page, g);
  await expect(page.getByRole('dialog', { name: 'Результат боя' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'Ещё по одной?' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Василий buffs the board, shows the British cat and records the aura', async ({ page }) => {
  const g = fixture(); unit(g, 'regular'); g.player.hand = [{ id: 'vasiliy', uid: g.nextUid++ }];
  await seed(page, g);
  await page.getByRole('button', { name: `${CARD.vasiliy.name}, 3 маны`, exact: true }).click();
  await expect(page.getByRole('button', { name: /Завсегдатай: 3 атаки, 2 здоровья/ })).toBeVisible();
  const cat = page.getByRole('button', { name: /Василий.*: 6 атаки, 5 здоровья/ });
  await expect(cat.locator('.original-portrait')).toBeVisible();
  await cat.click({ button: 'right' });
  const detail = page.getByRole('dialog', { name: CARD.vasiliy.name, exact: true });
  await expect(detail.locator('.inspection-context')).toContainText('Аура Василия: +2 к атаке.');
  await expect(detail.locator('.art-credit')).toContainText('BritishEmpire');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'История сражения', exact: true }).click();
  await expect(page.locator('.battle-log')).toContainText('Аура Василия: Завсегдатай, атака 1 → 3');
});

test('mobile Тихий час targets friendly sleeping minions and animates on their side', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  const g = fixture(); const ally = unit(g, 'deathwing'); ally.ready = false; ally.ephemeral = true;
  unit(g, 'bouncer', true); g.player.hand = [{ id: 'silence', uid: g.nextUid++ }]; g.bot.deck = ['regular']; g.bot.hand = [];
  await seed(page, g, true);
  await page.getByRole('button', { name: 'Тихий час, 1 маны', exact: true }).click();
  await expect(page.locator('.battle-hint')).toContainText('своё или вражеское');
  const friendly = page.getByRole('button', { name: 'Смертокрыл: 1 атаки, 1 здоровья', exact: true });
  await expect(friendly).toHaveClass(/targetable/);
  await expect(page.locator('.enemy-board .board-unit')).toHaveClass(/targetable/);
  await friendly.click();
  await expect(friendly.locator('.silence-mark')).toBeVisible();
  await expect(page.locator('[data-fx="spell"]')).toBeAttached();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!));
  expect(saved.player.mana).toBe(9); expect(saved.player.hand).toHaveLength(0);
  expect(saved.player.board[0]).toMatchObject({ silenced: true, ephemeral: false, ready: false });
  expect(saved.bot.board[0].silenced).toBe(false); expect(saved.bot.health).toBe(30);
  expect(saved.events.find((e: { cardId?: string }) => e.cardId === 'silence').target).toEqual({ side: 'player', uid: ally.uid });
  await page.getByRole('button', { name: 'История сражения', exact: true }).click();
  await expect(page.locator('.history-entry').first()).toContainText('Тихий час накладывает немоту на Смертокрыл.');
  await expect(page.locator('.history-entry').first().locator('.history-entity').last()).toContainText('Смертокрыл');
  await page.getByRole('button', { name: 'Закрыть журнал', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.locator('.player-board .board-unit')).toHaveCount(1);
});

for (const ready of [true, false]) {
  test(`Тихий час removes Русланчик restriction, attack readiness ${ready}`, async ({ page }) => {
    const g = fixture(); const ruslan = unit(g, 'ruslan'); ruslan.ready = ready;
    g.player.hand = [{ id: 'silence', uid: g.nextUid++ }];
    await seed(page, g);
    await page.getByRole('button', { name: 'Тихий час, 1 маны', exact: true }).click();
    const target = page.getByRole('button', { name: 'Русланчик: 10 атаки, 10 здоровья', exact: true });
    await expect(target).toHaveClass(/targetable/); await target.click();
    const silenced = page.getByRole('button', { name: /Русланчик: 10 атаки, 10 здоровья/ });
    await expect(silenced.locator('.silence-mark')).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!));
    expect(saved.player.board[0]).toMatchObject({ silenced: true, cannotAttack: false, ready });
    if (ready) {
      await expect(silenced).toHaveAttribute('aria-label', /готов атаковать/);
      await silenced.click();
      await page.getByRole('button', { name: /Герой противника: 30 здоровья, атаковать/ }).click();
      await expect(page.getByRole('button', { name: 'Герой противника: 20 здоровья', exact: true })).toBeVisible();
    } else {
      await expect(silenced).not.toHaveAttribute('aria-label', /готов атаковать/);
      await silenced.click();
      await expect(page.getByRole('button', { name: 'Герой противника: 30 здоровья', exact: true })).toHaveAttribute('aria-disabled', 'true');
    }
  });
}

test('Masik is in the collection with a portrait prepared from the supplied kitten photo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.getByLabel('Поиск карт').fill('Масик');
  await page.getByRole('button', { name: 'Масик, уничтожитель миров, 7 маны', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: CARD.masik.name, exact: true });
  await expect(dialog.locator('.original-portrait')).toBeVisible();
  await expect(dialog.locator('.awaiting-original')).toHaveCount(0);
  await expect(dialog.locator('.effect-description')).toContainText('Рывок. Боевой клич:');
  await expect(dialog.locator('.attack-stat')).toHaveText('6');
  await expect(dialog.locator('.health-stat')).toHaveText('4');
  const background = await dialog.locator('.original-portrait').evaluate(e => getComputedStyle(e).backgroundImage);
  expect(background).toContain('masik-portrait.png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Masik silences a taunt and charges the opposing hero on the same turn', async ({ page }) => {
  const g = fixture(); g.player.hand = [{ id: 'masik', uid: g.nextUid++ }]; unit(g, 'guardian', true);
  await seed(page, g);
  await page.getByRole('button', { name: 'Масик, уничтожитель миров, 7 маны', exact: true }).click();
  await expect(page.locator('.battle-hint')).toContainText('существо или героя');
  await page.getByRole('button', { name: 'Страж трактира: 4 атаки, 6 здоровья', exact: true }).click();
  await expect(page.locator('.enemy-board .silence-mark')).toBeVisible();
  const masik = page.getByRole('button', { name: /Масик, уничтожитель миров: 6 атаки, 4 здоровья, готов атаковать/ });
  await expect(masik.locator('.charge-badge')).toBeVisible();
  await masik.click();
  await page.getByRole('button', { name: /Герой противника: 30 здоровья, атаковать/ }).click();
  await expect(page.getByRole('button', { name: 'Герой противника: 24 здоровья', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Масик, уничтожитель миров: 6 атаки/ })).not.toHaveAttribute('aria-label', /готов атаковать/);
});

test('hero silence persists after reload, lasts two own turns, and restores the power', async ({ page }) => {
  const g = fixture(); g.player.hand = [{ id: 'masik', uid: g.nextUid++ }];
  g.bot.hand = []; g.bot.deck = ['regular', 'regular', 'regular'];
  await seed(page, g);
  await page.getByRole('button', { name: 'Масик, уничтожитель миров, 7 маны', exact: true }).click();
  await page.getByRole('button', { name: /Ваш герой: 30 здоровья, атаковать/ }).click();
  const power = page.getByRole('button', { name: 'Сила героя Искра, 2 маны', exact: true });
  await expect(power).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.own-hero-row .hero-label')).toContainText('ещё 2 хода');
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(power).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled({ timeout: 12000 });
  await expect(page.locator('.own-hero-row .hero-label')).toContainText('ещё 1 ход');
  await expect(power).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled({ timeout: 12000 });
  await expect(power).toHaveAttribute('aria-disabled', 'false');
  await power.click(); await page.getByRole('button', { name: /Герой противника: 30 здоровья, атаковать/ }).click();
  await expect(page.getByRole('button', { name: 'Герой противника: 29 здоровья', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'История сражения', exact: true }).click();
  await expect(page.locator('.battle-log')).toContainText('Немота героя закончилась. Сила героя снова доступна.');
});

test('silencing a freshly played Masik removes charge without granting an attack', async ({ page }) => {
  const g = fixture(); g.player.hand = [{ id: 'masik', uid: g.nextUid++ }, { id: 'silence', uid: g.nextUid++ }];
  await seed(page, g);
  await page.getByRole('button', { name: 'Масик, уничтожитель миров, 7 маны', exact: true }).click();
  await page.getByRole('button', { name: /Герой противника: 30 здоровья, атаковать/ }).click();
  await page.getByRole('button', { name: 'Тихий час, 1 маны', exact: true }).click();
  const masik = page.getByRole('button', { name: /Масик, уничтожитель миров: 6 атаки/ });
  await masik.click(); await expect(masik.locator('.silence-mark')).toBeVisible();
  await expect(masik.locator('.charge-badge')).toHaveCount(0);
  await expect(masik).not.toHaveAttribute('aria-label', /готов атаковать/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!).player.board[0].ready)).toBe(false);
});

test('bot plays Masik, silences taunt, and wins using charge', async ({ page }) => {
  const errors: string[] = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const g = fixture(); g.active = 'bot'; g.player.health = 6; unit(g, 'guardian');
  g.bot.mana = g.bot.maxMana = 7; g.bot.hand = [{ id: 'masik', uid: g.nextUid++ }];
  await seed(page, g);
  await expect(page.getByRole('dialog', { name: 'Результат боя' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'Ещё по одной?' })).toBeVisible();
  expect(errors).toEqual([]);
});
