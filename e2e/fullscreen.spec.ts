import { expect, test, type Page } from '@playwright/test';
import { CARD } from '../src/game/cards';
import { act, createGame } from '../src/game/engine';

async function fits(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => {
    const roots = [...document.querySelectorAll<HTMLElement>('.modal,.window-panel,.collection-page,.album-deck-sidebar,.deck-list,.public-rooms ul,.rooms-page,.room-entry-panel,.room-waiting-panel,.illustrated-history,.illustrated-history > ol')];
    return roots.filter(e => e.getBoundingClientRect().width && (e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2))
      .map(e => `${e.className}: ${e.scrollWidth}×${e.scrollHeight} in ${e.clientWidth}×${e.clientHeight}`);
  });
  expect(overflow).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) {
    const box = await dialog.boundingBox(), size = page.viewportSize()!;
    expect(box?.x).toBeCloseTo(0); expect(box?.y).toBeCloseTo(0);
    expect(box?.width).toBeCloseTo(size.width); expect(box?.height).toBeCloseTo(size.height);
  }
  expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.modal button,.rooms-page button,.collection-panel-tabs button')].filter(e => {
    const r = e.getBoundingClientRect(); return r.width && r.height && (r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1);
  }).map(e => e.textContent))).toEqual([]);
}

for (const [width, height] of [[320, 568], [390, 844], [844, 390], [667, 375]]) test(`every phone window fits without scrolling at ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await page.goto('/?localRooms=1');
  const rooms = page.getByRole('button', { name: 'Комнаты', exact: true }); await expect(rooms).toBeInViewport();
  expect(await rooms.evaluate(e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && e.contains(hit); })).toBe(true);
  await fits(page);
  await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click(); await fits(page);
  for (const card of await page.locator('.album-card-grid .game-card').all()) { const r = await card.boundingBox(); expect(r!.height).toBeGreaterThan(75); }
  await page.getByRole('tab', { name: /Моя колода/ }).click(); await fits(page);
  const nextDeck = page.getByRole('button', { name: 'Следующая страница колоды' });
  if (await nextDeck.count()) { await nextDeck.click(); await fits(page); }
  await page.getByRole('button', { name: 'Изменить колоду' }).click(); await fits(page);
  await page.getByRole('tab', { name: /Моя колода/ }).click(); await fits(page);
  await page.getByRole('button', { name: 'Стартовая колода', exact: true }).click(); await fits(page);
  await page.getByRole('button', { name: 'Сохранить колоду', exact: true }).click();
  await page.getByRole('button', { name: 'Скрыть сообщение' }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click(); await fits(page);
  await page.getByRole('tab', { name: 'Игровое поле', exact: true }).click(); await fits(page);
  await page.getByRole('radio', { name: /Огненная кузница/ }).check(); await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Карты', exact: true }).click(); await page.getByLabel('Поиск карт').fill('Масик'); await page.locator('.album-card-grid .game-card').click();
  await fits(page);
  for (const tab of ['Детали', 'Оформление', 'Картинка']) { await page.getByRole('tab', { name: tab, exact: true }).click(); await fits(page); }
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Из коллекции в меню' }).click();
  await page.getByRole('button', { name: 'Как играть', exact: true }).click();
  for (const tab of ['Начало', 'Бой', 'Победа']) { await page.getByRole('tab', { name: tab, exact: true }).click(); await fits(page); }
  await page.getByRole('button', { name: 'Всё понятно' }).click(); await page.getByRole('button', { name: 'Статистика побед' }).click(); await fits(page);
  await page.getByRole('tab', { name: 'О проекте', exact: true }).click(); await fits(page); await page.keyboard.press('Escape');
  await rooms.click(); await fits(page); await page.getByRole('button', { name: 'Создать комнату', exact: true }).click();
  await expect(page.locator('.room-code-heading strong')).toBeVisible({ timeout: 15000 }); await fits(page);
  await page.getByRole('button', { name: 'Закрыть комнату', exact: true }).click(); await fits(page);
  await page.getByRole('dialog', { name: 'Выйти из комнаты' }).getByRole('button', { name: 'Выйти из комнаты', exact: true }).click();
  await page.locator('.rooms-back').click(); await page.getByRole('button', { name: 'В бой', exact: true }).click(); await fits(page);
  await expect(page.locator('.mulligan-choice')).toHaveCount(3);
  const confirm = page.getByRole('button', { name: 'Подтвердить стартовую руку' });
  await confirm.focus(); await page.waitForTimeout(450); await expect(confirm).toBeFocused();
  await confirm.click();
  await expect(page.getByRole('dialog', { name: 'Стартовая рука' })).toHaveCount(0); await fits(page);
  await expect(page.locator('.deck-pile')).toHaveCount(2);
  await page.getByRole('button', { name: 'Выбор игрового поля' }).click(); await fits(page); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Сдаться', exact: true }).click(); await fits(page);
  await page.getByRole('dialog', { name: 'Сдаться', exact: true }).getByRole('button', { name: 'Сдаться', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Результат боя' })).toBeVisible(); await fits(page);
});

test('landscape room errors keep the room controls on screen', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 }); await page.goto('/?localRooms=1');
  await page.getByRole('button', { name: 'Комнаты', exact: true }).click(); await page.getByLabel('Код комнаты', { exact: true }).fill('ZZZZZZ');
  await page.getByRole('button', { name: 'Войти по коду', exact: true }).click();
  await expect(page.locator('.room-error')).toBeVisible({ timeout: 25000 }); await fits(page);
});

test('all three opening cards can be exchanged and saved choices survive a reload', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'В бой', exact: true }).click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!));
  for (const card of await page.locator('.mulligan-choice .game-card').all()) await card.click();
  await expect(page.locator('.mulligan-choice.replace')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!).mulligan.selected.player.length)).toBe(3);
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(page.locator('.mulligan-choice.replace')).toHaveCount(3);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!).mulligan.deadline)).toBe(before.mulligan.deadline);
  await page.getByRole('button', { name: 'Подтвердить стартовую руку' }).click();
  await expect(page.getByRole('dialog', { name: 'Стартовая рука' })).toHaveCount(0);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!));
  expect(after.player.hand.slice(0, 3).every((c: { uid: number }) => !before.player.hand.some((old: { uid: number }) => old.uid === c.uid))).toBe(true);
  expect(after.player.deck.length + after.player.hand.length).toBe(30);
});

test('the original thirty-second deadline expires automatically and starts only once', async ({ page }) => {
  await page.clock.install(); await page.goto('/'); await page.getByRole('button', { name: 'В бой', exact: true }).click();
  await page.locator('.mulligan-choice .game-card').first().click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!).mulligan.selected.player.length)).toBe(1);
  await page.clock.fastForward(30_100); await expect(page.getByRole('dialog', { name: 'Стартовая рука' })).toHaveCount(0);
  await expect(page.locator('.player-hand .game-card')).toHaveCount(4);
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!));
  await page.clock.fastForward(5000); expect(await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')!).nextUid)).toBe(first.nextUid);
});

test('Volunteer Boss remains inspectable but has no deck button and old decks migrate', async ({ page }) => {
  const g = createGame(); const oldDeck = [...g.player.hand.map(c => c.id), ...g.player.deck]; oldDeck[0] = 'volunteer';
  await page.addInitScript(deck => localStorage.setItem('memestone.v1.deck', JSON.stringify(deck)), oldDeck);
  await page.goto('/'); await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click(); await page.getByRole('button', { name: 'Изменить колоду' }).click();
  await page.getByLabel('Поиск карт').fill('Волонтер-босс'); await expect(page.locator('[data-card-id="volunteer"]').locator('..').locator('.album-owned')).toHaveText('Награда за задачу');
  await expect(page.getByRole('button', { name: `Добавить ${CARD.volunteer.name}`, exact: true })).toHaveCount(0);
  await page.locator('.album-card-grid [data-card-id="volunteer"]').click(); await expect(page.locator('.detail-tags')).toContainText('Награда за задачу');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Сохранить колоду' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.deck')!).includes('volunteer'))).toBe(false);
});

test('drawing multiple cards animates from the actual deck and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const g = createGame(undefined, 79); g.player.mana = g.player.maxMana = 10;
  g.player.hand = [{ id: 'draw', uid: g.nextUid++ }]; g.player.deck = ['bolt', 'heal', 'regular']; g.events = [];
  await page.addInitScript(game => {
    localStorage.setItem('memestone.v1.game', JSON.stringify(game));
    localStorage.setItem('memestone.v1.settings', JSON.stringify({ motion: true }));
  }, g);
  await page.goto('/'); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  const from = (await page.locator('.deck-pile.player').boundingBox())!;
  await page.getByRole('button', { name: 'Гениальный план, 3 маны', exact: true }).click();
  await expect(page.locator('[data-fx="draw"]')).toHaveCount(2);
  expect(await page.locator('[data-fx="draw"]').first().evaluate(e => parseFloat((e as HTMLElement).style.left))).toBeCloseTo(from.x);
  await expect(page.locator('.player-hand .game-card')).toHaveCount(2);
  await expect(page.locator('.deck-pile.player strong')).toHaveText('1');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.combat-effects')).toHaveCSS('display', 'none');
});

for (const [width, height] of [[320, 568], [667, 375]]) test(`long rules, history and discovery fit the phone at ${width}x${height}`, async ({ page }) => {
  test.setTimeout(60000); await page.setViewportSize({ width, height }); await page.goto('/');
  await page.getByRole('button', { name: 'Моя коллекция', exact: true }).click();
  for (const id of ['vasiliy', 'briefing', 'dog-spell', 'volunteer', 'maratik', 'trachukcha', 'maxim', 'jaina', 'deathwing']) {
    await page.getByLabel('Поиск карт').fill(CARD[id].name); await page.locator(`.album-card-grid [data-card-id="${id}"]`).click();
    await fits(page); await page.getByRole('tab', { name: 'Детали', exact: true }).click(); await fits(page);
    await page.keyboard.press('Escape');
  }
  const g = createGame(undefined, 82); g.player.hand = []; g.player.mana = g.player.maxMana = 10;
  g.log = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, turn: i + 1, kind: 'power', side: 'player',
    actor: { type: 'power', id: 'fool-power', name: CARD['fool-power'].name, art: 9, side: 'player' },
    hero: { type: 'hero', id: 'mage', name: 'Лира', art: 10, side: 'player' },
    target: { type: 'card', id: 'dragon', name: CARD.dragon.name, art: 6, side: 'bot' },
    result: { type: 'card', id: 'guardian', name: CARD.guardian.name, art: 9, side: 'bot' },
    text: `Событие ${i + 1}: сила героя превращает Пепельного дракона в Стража трактира. Боевой клич не срабатывает.` }));
  g.nextLog = 31;
  await page.evaluate(game => { localStorage.setItem('memestone.v1.game', JSON.stringify(game)); localStorage.setItem('memestone.v1.settings', JSON.stringify({ motion: false })); }, g);
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await page.getByRole('button', { name: 'История сражения', exact: true }).click(); await fits(page);
  await page.getByRole('button', { name: 'Следующая страница истории' }).click(); await fits(page);
  await page.getByRole('button', { name: 'Закрыть журнал' }).click();
  g.player.hand = [{ id: 'dog-spell', uid: g.nextUid++ }]; g.player.deck = ['masik', 'guardian', 'draw'];
  const discovery = act(g, 'player', { type: 'play', uid: g.player.hand[0].uid, target: 'hero' }).state;
  await page.evaluate(game => localStorage.setItem('memestone.v1.game', JSON.stringify(game)), discovery);
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Раскопка' })).toBeVisible(); await fits(page);
});
