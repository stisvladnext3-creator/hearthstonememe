import { expect, test, type Page } from '@playwright/test';
import { createGame, type Game, type Minion } from '../src/game/engine';
import { CARD, CARDS, STARTER_DECK, RARITY_NAMES, deckCopyLimit } from '../src/game/cards';

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
test('a new solo match puts its quest first and activates it only after playing', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'В бой', exact: true }).click();
  const hand = page.locator('.player-hand .game-card');
  await expect(hand).toHaveCount(4);
  await expect(hand.first()).toHaveAttribute('data-card-id', 'rash-quest');
  await expect(hand.nth(1)).toHaveAttribute('data-card-id', 'casino');
  await expect(page.locator('.quest-progress.player')).toHaveCount(0);
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(hand.first()).toHaveAttribute('data-card-id', 'rash-quest');
  await hand.first().click(); await expect(page.locator('.quest-progress.player')).toContainText('0/8');
  await expect(hand).toHaveCount(3);
});
test('deck editor saves an actual changed 30-card deck and survives reload', async ({ page }) => {
  const expectedBolts = STARTER_DECK.filter(id => id === 'bolt').length + 1;
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить колоду' }).click();
  await page.getByRole('button', { name: 'Убрать Завсегдатай', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить колоду' })).toBeDisabled();
  await page.getByLabel('Поиск карт').fill('Искра хаоса');
  await page.getByRole('button', { name: 'Добавить Искра хаоса', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить колоду' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.deck')!).filter((id: string) => id === 'bolt').length)).toBe(expectedBolts);
  await page.reload();
  await page.getByRole('button', { name: 'В бой', exact: true }).click();
  expect(await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('memestone.v1.game')!); return [...g.player.deck, ...g.player.hand.map((c: { id: string }) => c.id)].filter(id => id === 'bolt').length; })).toBe(expectedBolts);
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
  await expect(dialog.locator('.awaiting-original')).toHaveCount(0);
  await expect(dialog.locator('.original-portrait')).toBeVisible();
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
    names.push(...await page.locator('.card-grid .game-card').evaluateAll(cards => cards.map(c => c.getAttribute('data-card-id')!)));
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
  const g = fixture(); g.rng = 0; unit(g, 'guardian', true); g.player.hand = [{ id: 'trachukcha', uid: g.nextUid++ }];
  await seed(page, g);
  await page.getByRole('button', { name: 'Сила героя Искра, 2 маны', exact: true }).click();
  await page.getByRole('button', { name: /Страж трактира: 4 атаки/ }).click();
  await page.getByRole('button', { name: 'Трачукча, 3 маны', exact: true }).click();
  await page.getByRole('button', { name: 'Сила героя Дибильнутый!, 3 маны', exact: true }).click();
  await expect(page.getByRole('button', { name: /Завсегдатай: 1 атаки, 2 здоровья/ })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Результат боя' })).toHaveCount(0);
  await page.getByRole('button', { name: 'История сражения', exact: true }).click();
  await expect(page.locator('.history-entry > p').first()).toBeInViewport();
  await expect(page.locator('.history-entry.history-transform .history-entity.power')).toBeVisible();
  await expect(page.locator('.history-transform-result')).toContainText('Завсегдатай');
  await expect(page.locator('.history-entry.history-transform')).toContainText('Боевой клич результата не срабатывает');
  await expect(page.locator('.history-caster').filter({ hasText: 'Лира' }).first()).toBeVisible();
  await expect(page.locator('.history-caster').filter({ hasText: 'Трачукча' }).first()).toBeVisible();
  await page.locator('.history-transform-result').getByRole('button', { name: 'Посмотреть Завсегдатай' }).click();
  await expect(page.getByRole('dialog', { name: 'Завсегдатай' })).toBeVisible();
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

for (const [width, height] of [[1440, 900], [1366, 768], [390, 844], [320, 568], [844, 390], [667, 375]]) {
  test(`full battle controls and ten cards remain reachable without scrolling at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const g = fixture();
    g.player.power = 'fool'; g.bot.power = 'rds';
    for (let i = 0; i < 7; i++) { unit(g, 'bouncer'); unit(g, 'bouncer', true); }
    g.player.hand = Array.from({ length: 10 }, (_, i) => ({ id: i % 2 ? 'regular' : 'masik', uid: g.nextUid++ }));
    await seed(page, g);
    const layout = await page.evaluate(() => {
      const inside = (e: Element) => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; };
      const controls = [...document.querySelectorAll('.battle-topbar button,.hero-power,.hero-portrait,.end-turn,.battle-board .board-unit')];
      const hand = [...document.querySelectorAll('.player-hand .game-card')].map(e => {
        const r = e.getBoundingClientRect();
        for (let x = r.left + 4; x < r.right - 4; x += 4) for (let y = r.top + 8; y < r.bottom - 8; y += 8) {
          if (document.elementFromPoint(x, y)?.closest('.hand-card-button')?.contains(e)) return true;
        }
        return false;
      });
      const hp = document.querySelector('.own-hero-row .hero-hp')!; const r = hp.getBoundingClientRect();
      return { noScroll: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
        controls: controls.every(inside), hand, ownHealthVisible: !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.hero-portrait') };
    });
    expect(layout).toEqual({ noScroll: true, controls: true, hand: Array(10).fill(true), ownHealthVisible: true });
    await page.getByRole('button', { name: 'Выбор игрового поля', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Выбор игрового поля' })).toBeVisible();
    await page.getByRole('radio', { name: /Стол в трактире/ }).check();
    await page.getByRole('button', { name: 'Вернуться в бой' }).click();
    await expect(page.locator('.battle-arena')).toHaveAttribute('data-board', 'tavern');
  });
}

test('field choice persists, changes the image, and never resets the current match', async ({ page }) => {
  const g = fixture(); unit(g, 'dragon');
  await seed(page, g);
  await page.getByRole('button', { name: 'Выбор игрового поля' }).click();
  await page.getByRole('radio', { name: /Стол в трактире/ }).check();
  await page.getByRole('button', { name: 'Вернуться в бой' }).click();
  expect(await page.locator('.battle-arena').evaluate(e => getComputedStyle(e).backgroundImage)).toContain('battlefield.png');
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(page.locator('.battle-arena')).toHaveAttribute('data-board', 'tavern');
  await expect(page.locator('.player-board .board-unit')).toHaveCount(1);
  await page.getByRole('button', { name: 'Выбор игрового поля' }).click();
  await page.getByRole('radio', { name: /Фиолетовая цитадель/ }).check();
  await page.getByRole('button', { name: 'Вернуться в бой' }).click();
  expect(await page.locator('.battle-arena').evaluate(e => getComputedStyle(e).backgroundImage)).toContain('knights-board.png');
  const image = await page.request.get('/art/knights-board.png'); expect(image.status()).toBe(200);
});

test('opponent power exposes the current ability, cost, used status and silence', async ({ page }) => {
  const g = fixture(); g.bot.power = 'oy'; g.bot.powerUsed = true; g.bot.powerSilenceTurns = 2;
  await seed(page, g);
  const power = page.getByRole('button', { name: 'Сила героя противника Ой, 6 маны' });
  await expect(power).toContainText('Немота: 2'); await power.click();
  const dialog = page.getByRole('dialog', { name: 'Ой', exact: true });
  await expect(dialog.locator('.effect-description')).toContainText('Смертокрыла');
  await expect(dialog.locator('.inspection-context')).toContainText('Осталось своих ходов: 2');
});

test('briefing displays a countdown and temporary powers, persists, and restores after five own turns per player', async ({ page }) => {
  const g = fixture(); g.player.hand = [{ id: 'briefing', uid: g.nextUid++ }]; g.bot.hand = []; g.bot.deck = Array(20).fill('regular');
  g.bot.power = 'oy'; g.player.power = 'rds';
  unit(g, 'bouncer'); unit(g, 'dragon'); unit(g, 'guardian', true); unit(g, 'regular', true);
  await seed(page, g);
  await page.getByRole('button', { name: 'Держать в курсе!, 10 маны', exact: true }).click();
  await expect(page.locator('.briefing-status')).toContainText('Вы: 5 · Борис: 5');
  await expect(page.locator('.player-board .board-unit')).toHaveCount(1); await expect(page.locator('.enemy-board .board-unit')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Сила героя Взять карту, 6 маны', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сила героя противника Взять карту, 6 маны', exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(page.locator('.briefing-status')).toContainText('Вы: 5 · Борис: 5');
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Завершить', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled({ timeout: 12000 });
  }
  await expect(page.locator('.briefing-status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сила героя Сила РДШ, 4 маны', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сила героя противника Ой, 6 маны', exact: true })).toBeVisible();
});

test('paper army produces both full boards with bundled paper artwork', async ({ page }) => {
  const g = fixture(); g.player.hand = [{ id: 'paper-army', uid: g.nextUid++ }];
  await seed(page, g); await page.getByRole('button', { name: 'Армия бумажек, 7 маны' }).click();
  await expect(page.locator('.player-board .board-unit')).toHaveCount(7); await expect(page.locator('.enemy-board .board-unit')).toHaveCount(7);
  await expect(page.locator('.player-board .original-portrait')).toHaveCount(7);
  await page.locator('.player-board .board-unit').first().click({ button: 'right' });
  await expect(page.getByRole('dialog', { name: 'Бумажка', exact: true }).locator('.effect-description')).toContainText('Армией бумажек');
});

test('quest progress survives reload and the eighth RASH grants the reward', async ({ page }) => {
  const g = fixture(); g.player.quest = { id: 'rash-quest', progress: 7 }; g.player.power = 'rds';
  await seed(page, g); await expect(page.locator('.quest-progress.player')).toContainText('7/8');
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(page.locator('.quest-progress.player')).toContainText('7/8');
  await page.getByRole('button', { name: 'Сила героя Сила РДШ, 4 маны', exact: true }).click();
  await expect(page.locator('.quest-progress.player')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Волонтер-босс, 5 маны', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'История сражения' }).click();
  await expect(page.locator('.battle-log')).toContainText('Задача выполнена!');
});

test('Maxim chooses an ally, creates a reusable echo, and temporary copies disappear at end of turn', async ({ page }) => {
  const g = fixture(); unit(g, 'guardian'); g.player.hand = [{ id: 'echo-maxim', uid: g.nextUid++ }]; g.bot.hand = []; g.bot.deck = ['regular'];
  await seed(page, g);
  await page.getByRole('button', { name: 'Забивной Максимка, 2 маны', exact: true }).click();
  await expect(page.locator('.battle-hint')).toContainText('+1 к атаке');
  await page.getByRole('button', { name: /Страж трактира: 4 атаки/ }).click();
  await expect(page.getByRole('button', { name: /Страж трактира: 5 атаки/ })).toBeVisible();
  await expect(page.locator('.echo-copy')).toHaveCount(1);
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(page.locator('.echo-copy')).toHaveCount(1);
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.locator('.echo-copy')).toHaveCount(0);
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!))).player.hand).toHaveLength(0);
});

test('both Jainas have their newly generated portraits, correct stats and complete rules', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  for (const [id, attack, health] of [['jaina-rusher', '5', '1'], ['jaina-volunteer', '2', '1']]) {
    await page.getByLabel('Поиск карт').fill(CARD[id].name); await page.locator('.card-grid .game-card').first().click();
    const detail = page.getByRole('dialog', { name: CARD[id].name, exact: true });
    await expect(detail.locator('.effect-description')).toContainText('РДШ'); await expect(detail.locator('.awaiting-original')).toHaveCount(0);
    await expect(detail.locator('.attack-stat')).toHaveText(attack); await expect(detail.locator('.health-stat')).toHaveText(health);
    expect(await detail.locator('.original-portrait').evaluate(e => getComputedStyle(e).backgroundImage)).toContain('jaina-maxim.png');
    await page.keyboard.press('Escape');
  }
});

test('mobile rush attacks a taunt immediately and deathrattle summons a guard with illustrated history', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const g = fixture(); unit(g, 'bouncer', true); g.player.hand = [{ id: 'jaina-rusher', uid: g.nextUid++ }];
  await seed(page, g); await page.getByRole('button', { name: 'Джайна-рашер, 4 маны', exact: true }).click();
  const rusher = page.getByRole('button', { name: 'Джайна-рашер: 5 атаки, 1 здоровья, готов атаковать', exact: true });
  await expect(rusher.locator('.rush-badge')).toBeVisible(); await rusher.click();
  await expect(page.getByRole('button', { name: 'Герой противника: 30 здоровья', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Вышибала: 2 атаки, 3 здоровья', exact: true }).click();
  await expect(page.getByRole('button', { name: 'РДШ — защитник: 1 атаки, 3 здоровья', exact: true })).toHaveClass(/taunt/);
  await expect(page.locator('.enemy-board .board-unit')).toHaveCount(0);
  await page.getByRole('button', { name: 'История сражения', exact: true }).click();
  const log = page.locator('.history-entry').filter({ hasText: 'Предсмертный хрип «Джайна-рашер»' });
  await expect(log.locator('.history-entity')).toHaveCount(2); await expect(log).toContainText('РДШ — защитник');
});

test('a rusher can attack the hero only on its next own turn', async ({ page }) => {
  const g = fixture(); g.player.hand = [{ id: 'jaina-rusher', uid: g.nextUid++ }]; g.bot.hand = []; g.bot.deck = ['heal']; g.bot.power = 'oy';
  await seed(page, g); await page.getByRole('button', { name: 'Джайна-рашер, 4 маны', exact: true }).click();
  await expect(page.locator('.player-board .board-unit')).not.toHaveClass(/ready/);
  await page.getByRole('button', { name: 'Завершить', exact: true }).click(); await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled({ timeout: 12000 });
  await page.getByRole('button', { name: 'Джайна-рашер: 5 атаки, 1 здоровья, готов атаковать', exact: true }).click();
  await page.getByRole('button', { name: 'Герой противника: 30 здоровья, атаковать', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Герой противника: 25 здоровья', exact: true })).toBeVisible();
});

test('Jaina volunteer summons a zero-attack taunt and advances the RDS quest', async ({ page }) => {
  const g = fixture(); g.player.quest = { id: 'rash-quest', progress: 2 }; g.player.hand = [{ id: 'jaina-volunteer', uid: g.nextUid++ }];
  await seed(page, g); await page.getByRole('button', { name: 'Джайна-волонтер, 1 маны', exact: true }).click();
  await expect(page.getByRole('button', { name: 'РДШ — помощник: 0 атаки, 2 здоровья', exact: true })).toHaveClass(/taunt/);
  await expect(page.locator('.quest-progress.player')).toContainText('РДШ 3/8');
});

test('old saved history changes the RDS spelling without discarding the battle', async ({ page }) => {
  const g = fixture(); const old = 'Р' + 'АШ'; g.log.push({ id: g.nextLog++, text: `Призван ${old} 2/5.`, side: 'player', actor: { type: 'card', id: 'rash', name: old, art: 10, side: 'player' } });
  await seed(page, g); await page.getByRole('button', { name: 'История сражения', exact: true }).click();
  await expect(page.locator('.battle-log')).toContainText('Призван РДШ 2/5.'); await expect(page.locator('.battle-log')).not.toContainText(old);
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!))).id).toBe(g.id);
});

test('every album page has illustrations and no missing-photo placeholders', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  for (let n = 0; n < Math.ceil(CARDS.length / 8); n++) {
    await expect(page.locator('.card-grid .awaiting-original')).toHaveCount(0);
    if (n < Math.ceil(CARDS.length / 8) - 1) await page.getByRole('button', { name: 'Следующая страница' }).click();
  }
  for (const path of ['/art/generated/characters-a.png', '/art/generated/characters-b.png']) expect((await page.request.get(path)).status()).toBe(200);
});

test('hand cards show complete descriptions, enlarge on hover, and shrink while choosing a target', async ({ page }) => {
  const g = fixture(); unit(g, 'regular'); g.player.hand = ['deathwing', 'silence', 'jaina-rusher'].map(id => ({ id, uid: g.nextUid++ }));
  await seed(page, g);
  const card = page.getByRole('button', { name: 'Смертокрыл, 5 маны', exact: true });
  await expect(card.locator('.card-copy p')).toBeVisible(); await expect(card.locator('.card-copy p')).toHaveText(CARD.deathwing.text);
  const before = (await card.locator('.game-card').boundingBox())!; await card.hover(); const after = (await card.locator('.game-card').boundingBox())!;
  expect(after.width / before.width).toBeGreaterThan(1.4); expect(after.width / before.width).toBeLessThan(1.9);
  expect(after.y).toBeLessThan(before.y); expect(after.x).toBeGreaterThanOrEqual(0);
  const silent = page.getByRole('button', { name: 'Тихий час, 1 маны', exact: true });
  await silent.click(); await expect(page.locator('.battle-hint')).toContainText('своё или вражеское');
  expect((await silent.locator('.game-card').boundingBox())!.width).toBeCloseTo(before.width, 0);
  await page.getByRole('button', { name: /Завсегдатай: 1 атаки, 2 здоровья/ }).click();
  await expect(page.locator('.player-board .silence-mark')).toBeVisible();
});

test('the forge field is selectable, persists and has a portrait background', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await page.getByRole('button', { name: 'В бой', exact: true }).click();
  await page.getByRole('button', { name: 'Выбор игрового поля', exact: true }).click();
  await page.getByRole('radio', { name: /Огненная кузница/ }).check(); await page.getByRole('button', { name: 'Вернуться в бой', exact: true }).click();
  await expect(page.locator('.battle-arena')).toHaveAttribute('data-board', 'forge');
  expect(await page.locator('.battle-arena').evaluate(e => getComputedStyle(e).backgroundImage)).toContain('forge-board-portrait.png');
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(page.locator('.battle-arena')).toHaveAttribute('data-board', 'forge');
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [1440, 390]) test(`every card fits its full name and effect inside the frame and has the right rarity crystal at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await page.goto('/');
  await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  const colors = { common: '#e6edf0', rare: '#2585ec', epic: '#bd40ed', legendary: '#ffac21' };
  const visited = new Set<string>();
  for (;;) {
    const cards = page.locator('.album-card-grid .game-card');
    for (const card of await cards.all()) {
      const label = await card.getAttribute('aria-label');
      const def = CARD[(await card.getAttribute('data-card-id'))!];
      expect(def, label!).toBeDefined(); visited.add(def.id);
      for (const selector of ['.card-copy p .card-fit']) {
        const span = card.locator(selector);
        if (!await span.count()) continue;
        await expect.poll(() => span.evaluate(s => ({ fits: s.scrollWidth <= s.parentElement!.clientWidth + 1 && s.scrollHeight <= s.parentElement!.clientHeight + 1,
          text: s.textContent }))).toEqual({ fits: true, text: selector.includes('h3') ? def.name : def.text });
      }
      const title = card.locator('.card-name');
      await expect(title).toHaveAttribute('aria-label', def.name);
      await expect(title.locator('textPath')).toHaveText(def.name);
      expect(await title.evaluate(svg => {
        const text = svg.querySelector('text')!, path = svg.querySelector('path')!;
        const box = text.getBBox();
        const model = svg.closest('.game-card')!.querySelector('.card-frame')!.getAttribute('data-frame-model')!;
        // Native ribbon coordinates, rather than an HTML box that could itself
        // be positioned outside the painted banner.
        const bands: Record<string, [number, number]> = { simple: [720, 853], dragon: [720, 853], spell: [650, 805], hero: [470, 555], power: [470, 555] };
        return text.getComputedTextLength() <= path.getTotalLength() * .94 + 1 && box.height > 0
          && box.y >= bands[model][0] && box.y + box.height <= bands[model][1];
      })).toBe(true);
      await expect(card.locator('.card-copy h3')).toHaveCount(0);
      await expect(card.locator('.card-copy p')).toHaveCSS('font-weight', '400');
      const abilities = def.text.match(/боевой клич|предсмертный хрип|натиск|рывок|эхо|провокаци[а-яё]*|немот[а-яё]*|задача|награда|раскоп[а-яё]*/giu) ?? [];
      for (const ability of abilities) {
        const bold = card.locator('.card-copy p strong').filter({ hasText: new RegExp(`^${ability}$`, 'i') }).first();
        await expect(bold).toHaveCSS('font-weight', '700');
      }
      if (def.kind === 'minion' || def.kind === 'token') {
        const type = card.locator('.card-type');
        await expect(type).toHaveAttribute('aria-label', `Тип существа: ${def.tribe ?? (def.kind === 'token' ? 'Призыв' : 'Существо')}`);
        expect(await type.locator('text').evaluate(t => {
          const box = t.getBBox();
          return box.x >= 349 && box.x + box.width <= 750 && box.y >= 1307 && box.y + box.height <= 1360;
        })).toBe(true);
        await expect(card.locator('.card-kind')).toHaveCount(0);
      }
      const gem = card.locator('.card-rarity'); await expect(gem).toHaveCount(1);
      await expect(gem).toHaveAttribute('aria-label', `Редкость: ${RARITY_NAMES[def.rarity]}`);
      expect(await gem.evaluate(e => getComputedStyle(e).getPropertyValue('--gem-main').trim())).toBe(colors[def.rarity]);
      // The raster already includes a gem: its recolored copy must use exactly
      // the same image coordinates, clipped to the original socket, with no
      // second positioned CSS stone or independent replacement geometry.
      expect(await gem.evaluate(e => {
        if (e.tagName.toLowerCase() !== 'g') return false;
        const svg = e.ownerSVGElement!, base = svg.querySelector(':scope > image')!, tinted = e.querySelector('image')!;
        return ['href', 'width', 'height', 'x', 'y', 'transform'].every(a => base.getAttribute(a) === tinted.getAttribute(a))
          && e.hasAttribute('clip-path') && e.querySelectorAll('circle, ellipse, rect').length === 0;
      })).toBe(true);
      if (def.kind !== 'power' && def.kind !== 'token') await expect(card.locator('..').locator('.album-owned')).toHaveText(`×${deckCopyLimit(def)}`);
    }
    const next = page.getByRole('button', { name: 'Следующая страница', exact: true });
    if (await next.isDisabled()) break; await next.click();
  }
  expect(visited.size).toBe(CARDS.length);
});

for (const width of [1440, 390]) for (const appearance of ['signature', 'diamond']) test(`all legendary ${appearance} frames fit their names, rules and types at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const legends = CARDS.filter(c => c.rarity === 'legendary');
  await page.addInitScript(choices => localStorage.setItem('memestone.v1.card-appearances', JSON.stringify(choices)), Object.fromEntries(legends.map(c => [c.id, appearance])));
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.getByRole('tab', { name: 'Легендарные', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  const visited = new Set<string>();
  for (;;) {
    for (const card of await page.locator('.album-card-grid .game-card').all()) {
      const def = CARD[(await card.getAttribute('data-card-id'))!]; visited.add(def.id);
      await expect(card).toHaveClass(new RegExp(`model-${appearance}`));
      await expect(card.locator('.card-frame')).toHaveAttribute('data-frame-model', appearance);
      await expect(card.locator('.card-rarity')).toHaveCount(1);
      await expect(card.locator('.card-name textPath')).toHaveText(def.name);
      expect(await card.locator('.card-name').evaluate((svg, appearance) => {
        const text = svg.querySelector('text')!, path = svg.querySelector('path')!, box = text.getBBox();
        const band = appearance === 'diamond' ? [530, 635] : [635, 702];
        return text.getComputedTextLength() <= path.getTotalLength() * .94 + 1 && box.y >= band[0] && box.y + box.height <= band[1];
      }, appearance)).toBe(true);
      await expect(card.locator('.card-copy p')).toHaveText(def.text);
      expect(await card.locator('.card-copy p .card-fit').evaluate(s => s.scrollHeight <= s.parentElement!.clientHeight + 1 && s.scrollWidth <= s.parentElement!.clientWidth + 1)).toBe(true);
      if (def.kind === 'minion' || def.kind === 'token') {
        await expect(card.locator('.card-type text')).toHaveText(def.tribe ?? (def.kind === 'token' ? 'Призыв' : 'Существо'));
        expect(await card.locator('.card-type text').evaluate((t, appearance) => {
          const b = t.getBBox();
          const r = appearance === 'diamond' ? [1014, 942, 228, 40] : [324, 934, 156, 40];
          return b.x >= r[0] && b.y >= r[1] && b.x + b.width <= r[0] + r[2] && b.y + b.height <= r[1] + r[3];
        }, appearance)).toBe(true);
      }
    }
    const next = page.getByRole('button', { name: 'Следующая страница', exact: true });
    if (await next.isDisabled()) break; await next.click();
  }
  expect(visited.size).toBe(legends.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('legendary appearance is selected per card, persists, can be reset and follows the card into a hand', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.getByLabel('Поиск карт').fill('Масик'); await page.locator('.album-card-grid .game-card').click();
  await page.getByRole('button', { name: 'Алмазное', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Алмазное', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.detail-card-area .game-card')).toHaveClass(/model-diamond/);
  await page.keyboard.press('Escape'); await expect(page.locator('.album-card-grid .game-card')).toHaveClass(/model-diamond/);
  await page.reload(); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  await page.getByLabel('Поиск карт').fill('Масик'); await expect(page.locator('.album-card-grid .game-card')).toHaveClass(/model-diamond/);
  await page.getByLabel('Поиск карт').fill('Василий'); await page.locator('.album-card-grid .game-card').click();
  await expect(page.getByRole('button', { name: 'Классическое', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Тёмное', exact: true }).click(); await page.keyboard.press('Escape');
  const g = fixture(); g.player.hand = [{ id: 'masik', uid: g.nextUid++ }, { id: 'vasiliy', uid: g.nextUid++ }];
  await seed(page, g);
  await expect(page.locator('.player-hand [data-card-id="masik"]')).toHaveClass(/model-diamond/);
  await expect(page.locator('.player-hand [data-card-id="vasiliy"]')).toHaveClass(/model-signature/);
  const card = page.locator('.player-hand [data-card-id="masik"]');
  const before = await card.locator('.card-type text').evaluate(e => ({ x: e.getAttribute('x'), y: e.getAttribute('y'), size: e.getAttribute('font-size') }));
  await card.hover();
  expect(await card.locator('.card-type text').evaluate(e => ({ x: e.getAttribute('x'), y: e.getAttribute('y'), size: e.getAttribute('font-size') }))).toEqual(before);
  await card.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, clientX: 50, clientY: 50 });
  await expect(page.getByRole('dialog', { name: CARD.masik.name })).toBeVisible();
  await page.getByRole('button', { name: 'Классическое', exact: true }).click();
  await expect(page.locator('.detail-card-area .game-card')).toHaveClass(/model-dragon/);
  await page.keyboard.press('Escape'); await expect(card).toHaveClass(/model-dragon/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.card-appearances')!))).toEqual({ vasiliy: 'signature' });
});

test('new instigator and both Slimes have generated art and inspectable rules', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  for (const name of ['Джайна-зачинщик', 'Слизь']) {
    await page.getByLabel('Поиск карт').fill(name);
    for (const card of await page.locator('.album-card-grid .game-card').all()) {
      await expect(card.locator('.original-portrait')).toHaveCSS('background-image', /jaina-slimes\.png/);
      await expect(card.locator('.card-copy p')).toContainText(name === 'Слизь' ? 'Провокация.' : 'Предсмертный хрип:');
    }
  }
});
