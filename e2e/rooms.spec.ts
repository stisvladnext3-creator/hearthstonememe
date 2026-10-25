import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { CARD, STARTER_DECK } from '../src/game/cards';
import { act, activePower, chooseBotAction, targetNeeded, type Action, type Game, type Side } from '../src/game/engine';
import { createRoomGame, roomCode, roomGameView, validRoomView } from '../src/online/protocol';

let seed = 2;
while (!createRoomGame(STARTER_DECK, STARTER_DECK, 'Хозяин', 'Гость', seed, 'fixture').player.hand.some(c => c.id === 'jaina-volunteer')) seed += 2;
async function participants(browser: Browser, matchSeed = seed) {
  const hostContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const guestContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  await hostContext.addInitScript(seed => {
    const random = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = function<T extends ArrayBufferView | null>(array: T): T {
      if (array instanceof Uint32Array && array.length === 1) { array[0] = seed; return array; }
      return random(array);
    };
  }, matchSeed);
  for (const context of [hostContext, guestContext]) await context.addInitScript(() => {
    const Native = window.RTCPeerConnection;
    const peers: RTCPeerConnection[] = [];
    Object.assign(window, { roomTestPeers: peers });
    window.RTCPeerConnection = class extends Native { constructor(config?: RTCConfiguration) { super(config); peers.push(this); } };
  });
  const host = await hostContext.newPage(), guest = await guestContext.newPage();
  return { host, guest, hostContext, guestContext };
}
async function create(host: Page) {
  await host.goto('/?localRooms=1'); await host.getByRole('button', { name: 'Комнаты', exact: true }).click();
  await host.getByLabel('Имя игрока').fill('Хозяин'); await host.getByRole('button', { name: 'Создать комнату', exact: true }).click();
  await expect(host.locator('.room-code-heading strong')).toBeVisible({ timeout: 25000 });
  return (await host.locator('.room-code-heading strong').innerText()).trim();
}
async function join(guest: Page, code: string) {
  await guest.goto(`/?localRooms=1&room=${code}`); await guest.getByLabel('Имя игрока').fill('Гость');
  await guest.getByRole('button', { name: 'Войти по коду', exact: true }).click();
}
async function start(host: Page, guest: Page) {
  await expect(host.getByRole('button', { name: 'Начать бой', exact: true })).toBeEnabled({ timeout: 25000 });
  await host.getByRole('button', { name: 'Начать бой', exact: true }).click();
  await expect(host.locator('.battle-arena')).toBeVisible(); await expect(guest.locator('.battle-arena')).toBeVisible({ timeout: 15000 });
  for (const player of [host, guest]) {
    await expect(player.getByRole('dialog', { name: 'Стартовая рука' })).toBeVisible();
    await expect(player.locator('.mulligan-choice')).toHaveCount(3);
    await player.getByRole('button', { name: 'Подтвердить стартовую руку' }).click();
  }
  for (const player of [host, guest]) {
    await expect(player.getByRole('dialog', { name: 'Стартовая рука' })).toHaveCount(0);
    await expect(player.locator('.player-hand .game-card').first()).toHaveAttribute('data-card-id', 'rash-quest');
  }
}
async function close(...contexts: BrowserContext[]) { await Promise.all(contexts.map(c => c.close())); }

test('opening choices and the shared deadline survive a host reload before both players confirm', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await participants(browser);
  try {
    const code = await create(host); await join(guest, code);
    await expect(host.getByRole('button', { name: 'Начать бой', exact: true })).toBeEnabled({ timeout: 25000 });
    await host.getByRole('button', { name: 'Начать бой', exact: true }).click();
    for (const p of [host, guest]) { await expect(p.getByRole('dialog', { name: 'Стартовая рука' })).toBeVisible(); await expect(p.locator('.mulligan-choice')).toHaveCount(3); }
    await host.locator('.mulligan-choice .game-card').first().click();
    await expect.poll(async () => (await savedMatch(host)).game.mulligan?.selected.player.length).toBe(1);
    const before = (await savedMatch(host)).game;
    await host.reload(); await host.getByRole('button', { name: 'Комнаты', exact: true }).click();
    await host.getByRole('button', { name: `Вернуться в комнату ${code}`, exact: true }).click();
    await expect(host.locator('.mulligan-choice.replace')).toHaveCount(1, { timeout: 15000 });
    expect((await savedMatch(host)).game.mulligan?.deadline).toBe(before.mulligan!.deadline);
    await expect(host.getByRole('button', { name: 'Подтвердить стартовую руку' })).toBeEnabled({ timeout: 15000 });
    await host.getByRole('button', { name: 'Подтвердить стартовую руку' }).click();
    await expect(guest.getByRole('button', { name: 'Подтвердить стартовую руку' })).toBeEnabled({ timeout: 15000 });
    await guest.getByRole('button', { name: 'Подтвердить стартовую руку' }).click();
    for (const p of [host, guest]) await expect(p.getByRole('dialog', { name: 'Стартовая рука' })).toHaveCount(0);
    const after = (await savedMatch(host)).game;
    expect(after.player.hand[0].uid).not.toBe(before.player.hand[0].uid); expect(after.bot.hand[0].id).toBe('rash-quest');
  } finally { await close(hostContext, guestContext); }
});

async function savedMatch(host: Page): Promise<{ game: Game; revision: number }> {
  return host.evaluate(() => JSON.parse(sessionStorage.getItem('memestone.room.v1')!));
}
function nextAction(g: Game): Action {
  return chooseBotAction(g.active === 'bot' ? g : { ...g, active: 'bot', player: g.bot, bot: g.player,
    discovery: g.discovery ? { ...g.discovery, side: g.discovery.side === 'player' ? 'bot' : 'player' } : undefined });
}
async function historyContains(page: Page, text: string) {
  const next = page.getByRole('button', { name: 'Следующая страница истории' });
  while (!(await page.locator('.battle-log').innerText()).includes(text) && await next.isEnabled()) await next.click();
  await expect(page.locator('.battle-log')).toContainText(text);
}
async function roomIsOnAnyPage(page: Page, code: string) {
  const previous = page.getByRole('button', { name: 'Предыдущая страница комнат' });
  while (await previous.count() && await previous.isEnabled()) await previous.click();
  const row = page.locator(`.public-rooms [data-room-code="${code}"]`);
  for (;;) {
    if (await row.count()) return true;
    const next = page.getByRole('button', { name: 'Следующая страница комнат' });
    if (!await next.count() || !await next.isEnabled()) return false;
    await next.click();
  }
}
async function showRoom(page: Page, code: string, timeout = 25_000) {
  await expect.poll(() => roomIsOnAnyPage(page, code), { timeout }).toBe(true);
  return page.locator(`.public-rooms [data-room-code="${code}"]`);
}
function longBattleSeed() {
  for (let seed = 1; seed <= 100; seed++) {
    let g = createRoomGame(STARTER_DECK, STARTER_DECK, 'Хозяин', 'Гость', seed, 'simulation', 30_000);
    g = act(act(g, 'player', { type: 'mulligan', replace: [] }).state, 'bot', { type: 'mulligan', replace: [] }).state;
    let bytes = 0;
    for (let n = 0; n < 200 && !g.winner; n++) { g = act(g, g.active, nextAction(g)).state; bytes = Math.max(bytes, Buffer.byteLength(JSON.stringify(roomGameView(g, 'bot')))); }
    if (g.winner && g.turn > 12 && bytes > 32_000) return seed;
  }
  throw new Error('No complete large-history game found for the regression');
}
async function playAction(host: Page, guest: Page, action: Action) {
  const { game, revision } = await savedMatch(host);
  const page = game.active === 'player' ? host : guest;
  const view = roomGameView(game, game.active);
  if (action.type === 'play') {
    const card = page.locator(`.hand-card-wrap[data-combat-anchor="player:${action.uid}"] .hand-card-button`);
    await expect(card.locator('.game-card')).toHaveClass(/playable/);
    await card.click();
    if (!targetNeeded(view, action.uid)) action = { ...action, target: undefined };
  } else if (action.type === 'attack') {
    const attacker = page.locator(`.player-board [data-combat-anchor="player:${action.uid}"]`);
    await expect(attacker).toHaveClass(/ready/); await attacker.click();
  }
  else if (action.type === 'power') {
    await expect(page.locator('.own-hero-row .hero-power')).toBeEnabled();
    await page.locator('.own-hero-row .hero-power').click();
    if (activePower(view, 'player') !== 'spark') action = { ...action, target: undefined };
  }
  else if (action.type === 'discover') await page.locator('.discover-choices').getByRole('button', { name: `${CARD[action.cardId].name}, ${CARD[action.cardId].printedCost ?? CARD[action.cardId].cost} маны`, exact: true }).click();
  else if (action.type === 'end') await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  if ('target' in action && action.target !== undefined) {
    if (action.target === 'hero') {
      try { await expect(page.locator('.enemy-hero-row .hero-portrait'), JSON.stringify(action)).toBeEnabled(); }
      catch (error) {
        console.log('Target selection diagnostics', JSON.stringify({ action, turn: game.turn, active: game.active,
          ownBoard: view.player.board.map(m => ({ id: m.id, uid: m.uid, ready: m.ready, rush: m.rush, charge: m.charge, entered: m.enteredTurn })),
          enemyBoard: view.bot.board.map(m => ({ id: m.id, uid: m.uid, taunt: m.taunt })),
          hint: await page.locator('.battle-hint').innerText(), selected: await page.locator('.board-unit.selected').allTextContents(), notice: await page.locator('.online-notice').allTextContents() }));
        throw error;
      }
      await page.locator('.enemy-hero-row .hero-portrait').click();
    }
    else if (action.target === 'own-hero') await page.locator('.own-hero-row .hero-portrait').click();
    else await page.locator(`.board-unit[data-combat-anchor$=":${action.target}"]`).click();
  }
  try {
    await expect.poll(async () => (await savedMatch(host)).revision).toBe(revision + 1);
    await expect.poll(() => guest.evaluate(() => JSON.parse(sessionStorage.getItem('memestone.room.v1')!).revision), {
      message: `The guest must receive revision ${revision + 1}, including its full battle history`, timeout: 5000,
    }).toBe(revision + 1);
  } catch (error) {
    const current = (await savedMatch(host)).game;
    console.log('Room sync diagnostics', { revision: revision + 1, action, turn: current.turn,
      snapshotBytes: Buffer.byteLength(JSON.stringify(roomGameView(current, 'bot'))), validSnapshot: validRoomView(roomGameView(current, 'bot')),
      hostNotice: await host.locator('.online-notice').allTextContents(), guestNotice: await guest.locator('.online-notice').allTextContents(),
      connections: JSON.stringify(await Promise.all([host, guest].map(p => p.evaluate(async () => {
        const peers = (window as unknown as { roomTestPeers: RTCPeerConnection[] }).roomTestPeers;
        return Promise.all(peers.map(async pc => ({ state: pc.connectionState, ice: pc.iceConnectionState,
          stats: [...(await pc.getStats()).values()].filter(s => s.type === 'data-channel' || s.type === 'candidate-pair' && s.nominated) })));
      })))) });
    throw error;
  }
  await expect(host.locator('.online-notice')).toHaveCount(0); await expect(guest.locator('.online-notice')).toHaveCount(0);
}

test('a complete battle stays synchronized after history grows beyond the JSON channel limit', async ({ browser }) => {
  test.setTimeout(120000);
  const { host, guest, hostContext, guestContext } = await participants(browser, longBattleSeed());
  const errors: string[] = []; for (const p of [host, guest]) p.on('pageerror', e => errors.push(e.message));
  try {
    const code = await create(host); await join(guest, code); await start(host, guest);
    let maxBytes = 0, actions = 0;
    while (!(await savedMatch(host)).game.winner && actions++ < 200) {
      const { game } = await savedMatch(host);
      await playAction(host, guest, nextAction(game));
      maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(roomGameView((await savedMatch(host)).game, 'bot'))));
    }
    const { game } = await savedMatch(host);
    expect(game.winner).not.toBeNull(); expect(game.turn).toBeGreaterThan(12); expect(maxBytes).toBeGreaterThan(32000);
    await expect(host.getByRole('dialog', { name: 'Результат боя', exact: true })).toBeVisible();
    await expect(guest.getByRole('dialog', { name: 'Результат боя', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await close(hostContext, guestContext); }
});

test('failed ICE retires a still-open data channel and resumes the same protected match', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await participants(browser);
  try {
    const code = await create(host); await join(guest, code); await start(host, guest);
    await playAction(host, guest, { type: 'play', uid: (await savedMatch(host)).game.player.hand.find(c => c.id === 'jaina-volunteer')!.uid });
    const before = await savedMatch(host);
    await host.evaluate(async () => {
      const peers = (window as unknown as { roomTestPeers: RTCPeerConnection[] }).roomTestPeers;
      const open = await Promise.all(peers.filter(pc => pc.connectionState === 'connected').map(async pc => {
        const stats = [...(await pc.getStats()).values()].filter(s => s.type === 'data-channel');
        return { pc, bytes: stats.reduce((n, s) => n + s.bytesSent, 0) };
      }));
      const pc = open.sort((a, b) => b.bytes - a.bytes)[0].pc;
      // Simulate the browser state observed in the regression: ICE failed, but
      // the data channel did not emit close. The app must retire it itself.
      Object.defineProperty(pc, 'connectionState', { value: 'failed', configurable: true });
      pc.dispatchEvent(new Event('connectionstatechange'));
    });
    await expect(host.locator('.online-notice')).toContainText('потеряна');
    await expect(host.locator('.online-notice')).toHaveCount(0, { timeout: 15000 });
    await expect(guest.locator('.online-notice')).toHaveCount(0, { timeout: 15000 });
    expect((await savedMatch(host)).game).toEqual(before.game);
    await expect(guest.locator('.enemy-board .board-unit')).toHaveCount(2);
    await playAction(host, guest, { type: 'end' });
  } finally { await close(hostContext, guestContext); }
});

for (const owner of ['player', 'bot'] as Side[]) test(`repeated Maxim echo from ${owner} survives large snapshots and a guest reconnect`, async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await participants(browser);
  // A real game advanced by legal engine actions to a six-mana echo turn.
  // Its history already exceeds the old limit before either browser reconnects.
  let game!: Game;
  let found = false;
  // Find a valid shuffled game instead of relying on a seed whose exact hand
  // changes when the opening-deal rules change. Keep the large-history and
  // two-consecutive-echo requirements intact.
  for (let seed = 1; seed <= 100 && !found; seed++) {
    game = createRoomGame(STARTER_DECK, STARTER_DECK, 'Хозяин', 'Гость', seed, 'echo-regression');
    for (let i = 0; i < 200 && !game.winner; i++) {
      const action = nextAction(game);
      const card = action.type === 'play' ? game[game.active].hand.find(c => c.uid === action.uid) : undefined;
      const enemy = game[owner === 'player' ? 'bot' : 'player'];
      if (game.active === owner && card?.id === 'echo-maxim' && card.expiresTurn !== undefined && game[owner].mana >= 4 && game[owner].board.length <= 5
        && !game.briefing && enemy.health + enemy.armor > 4 && Buffer.byteLength(JSON.stringify(roomGameView(game, 'bot'))) > 16300) { found = true; break; }
      game = act(game, game.active, action).state;
    }
  }
  expect(found).toBe(true);
  const code = roomCode();
  await hostContext.addInitScript(({ game, code, deck }) => {
    if (!sessionStorage.getItem('memestone.room.v1')) sessionStorage.setItem('memestone.room.v1', JSON.stringify({ role: 'host', code,
      self: { name: 'Хозяин', deck, token: 'host-echo-regression-token' }, game, revision: 100 }));
  }, { game, code, deck: STARTER_DECK });
  try {
    await host.goto('/?localRooms=1'); await host.getByRole('button', { name: 'Комнаты', exact: true }).click();
    await host.getByRole('button', { name: `Вернуться в комнату ${code}`, exact: true }).click();
    await expect(host.locator('.battle-arena')).toBeVisible(); await join(guest, code);
    await expect(guest.locator('.battle-arena')).toBeVisible({ timeout: 15000 });
    let echoes = 0;
    while (echoes < 2) {
      const current = (await savedMatch(host)).game;
      const copy = current[owner].hand.find(c => c.id === 'echo-maxim' && c.expiresTurn !== undefined)!;
      expect(copy).toBeDefined();
      const buffTarget = current[owner].board[0];
      const buffBefore = buffTarget.attack;
      await playAction(host, guest, { type: 'play', uid: copy.uid, target: buffTarget.uid }); echoes++;
      const after = (await savedMatch(host)).game;
      expect(after[owner].board.find(m => m.uid === buffTarget.uid)?.attack).toBe(buffBefore + 1);
      expect(after[owner].hand.some(c => c.id === 'echo-maxim' && c.expiresTurn === after.turn)).toBe(true);
    }
    await guest.reload(); await guest.getByRole('button', { name: `Вернуться в комнату ${code}`, exact: true }).click();
    await expect(guest.locator('.battle-arena')).toBeVisible({ timeout: 20000 });
    await expect(host.locator('.online-notice')).toHaveCount(0, { timeout: 20000 });
    await expect(guest.locator('.online-notice')).toHaveCount(0);
    await playAction(host, guest, { type: 'end' });
    const afterEnd = (await savedMatch(host)).game;
    expect(afterEnd[owner].hand.some(c => c.id === 'echo-maxim' && c.expiresTurn !== undefined)).toBe(false);
    await guest.getByRole('button', { name: 'История сражения', exact: true }).click();
    await historyContains(guest, 'Эхо: копия');
    await expect(guest.locator('.battle-log')).toContainText('Забивной Максимка');
  } finally { await close(hostContext, guestContext); }
});

test('two browsers join a room, play from opposite sides, synchronize a summon and transfer turns', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await participants(browser);
  const errors: string[] = []; for (const p of [host, guest]) p.on('pageerror', e => errors.push(e.message));
  try {
    const code = await create(host); await join(guest, code); await start(host, guest);
    await expect(host.locator('.own-hero-row .hero-label strong')).toHaveText('Хозяин'); await expect(guest.locator('.own-hero-row .hero-label strong')).toHaveText('Гость');
    await expect(host.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled(); await expect(guest.locator('.end-turn')).toBeDisabled();
    await host.getByRole('button', { name: 'Джайна-волонтер, 1 маны', exact: true }).click();
    await expect(host.locator('.player-board .board-unit')).toHaveCount(2); await expect(guest.locator('.enemy-board .board-unit')).toHaveCount(2);
    await expect(guest.getByRole('button', { name: 'РДШ — помощник: 0 атаки, 2 здоровья', exact: true })).toBeVisible();
    await host.getByRole('button', { name: 'Завершить', exact: true }).click(); await expect(guest.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled();
    await guest.getByRole('button', { name: 'Завершить', exact: true }).click(); await expect(host.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled();
    await guest.getByRole('button', { name: 'История сражения', exact: true }).click(); await historyContains(guest, 'ХОЗЯИН');
    expect(await guest.evaluate(() => JSON.parse(sessionStorage.getItem('memestone.room.v1')!).game)).toBeUndefined();
    expect(await guest.evaluate(() => localStorage.getItem('memestone.v1.game'))).toBeNull();
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await close(hostContext, guestContext); }
});

test('a third participant is rejected without disrupting the two current players', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await participants(browser); const extraContext = await browser.newContext(); const extra = await extraContext.newPage();
  try {
    const code = await create(host); await join(guest, code); await expect(host.getByRole('button', { name: 'Начать бой', exact: true })).toBeEnabled({ timeout: 25000 });
    await join(extra, code); await expect(extra.getByRole('alert')).toContainText('уже занята', { timeout: 20000 });
    await start(host, guest); await expect(host.locator('.online-notice')).toHaveCount(0); await expect(guest.locator('.online-notice')).toHaveCount(0);
  } finally { await close(hostContext, guestContext, extraContext); }
});

test('concession reaches both result screens and rematch waits for both players', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await participants(browser);
  try {
    const code = await create(host); await join(guest, code); await start(host, guest);
    await guest.getByRole('button', { name: 'Настройки', exact: true }).click();
    await guest.getByRole('button', { name: 'Сдаться', exact: true }).click();
    await guest.getByRole('dialog', { name: 'Сдаться', exact: true }).getByRole('button', { name: 'Сдаться', exact: true }).click();
    await expect(host.getByRole('heading', { name: 'Твоя взяла!', exact: true })).toBeVisible(); await expect(guest.getByRole('heading', { name: 'Ещё по одной?', exact: true })).toBeVisible();
    await host.getByRole('button', { name: 'Ещё одна партия', exact: true }).click(); await expect(host.getByRole('button', { name: 'Ждём согласия соперника', exact: true })).toBeDisabled();
    await expect(guest.locator('.rematch-invite')).toBeVisible(); await guest.getByRole('button', { name: 'Ещё одна партия', exact: true }).click();
    await expect(host.getByRole('dialog', { name: 'Результат боя', exact: true })).toHaveCount(0); await expect(guest.getByRole('dialog', { name: 'Результат боя', exact: true })).toHaveCount(0);
    await expect(host.locator('.player-board .board-unit')).toHaveCount(0); await expect(guest.locator('.turn-control > span')).toHaveText('ХОД 1');
  } finally { await close(hostContext, guestContext); }
});

test('a returning guest reconnects to the same private seat and current match', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await participants(browser);
  try {
    const code = await create(host); await join(guest, code); await start(host, guest);
    await host.getByRole('button', { name: 'Джайна-волонтер, 1 маны', exact: true }).click(); await expect(guest.locator('.enemy-board .board-unit')).toHaveCount(2);
    const matchId = await host.evaluate(() => JSON.parse(sessionStorage.getItem('memestone.room.v1')!).game.id);
    await guest.reload(); await expect(host.locator('.online-notice')).toContainText('потеряна', { timeout: 10000 });
    await expect(host.locator('.end-turn')).toBeDisabled(); await guest.getByRole('button', { name: `Вернуться в комнату ${code}`, exact: true }).click();
    await expect(guest.locator('.battle-arena')).toBeVisible({ timeout: 25000 }); await expect(host.locator('.online-notice')).toHaveCount(0);
    await expect(guest.locator('.enemy-board .board-unit')).toHaveCount(2);
    expect(await host.evaluate(() => JSON.parse(sessionStorage.getItem('memestone.room.v1')!).game.id)).toBe(matchId);
    await expect(host.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled();
  } finally { await close(hostContext, guestContext); }
});

test('host reload restores its match and lets the guest reconnect automatically', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await participants(browser);
  try {
    const code = await create(host); await join(guest, code); await start(host, guest);
    await host.getByRole('button', { name: 'Джайна-волонтер, 1 маны', exact: true }).click(); await expect(guest.locator('.enemy-board .board-unit')).toHaveCount(2);
    await host.reload(); await host.getByRole('button', { name: 'Комнаты', exact: true }).click();
    await host.getByRole('button', { name: `Вернуться в комнату ${code}`, exact: true }).click();
    await expect(host.locator('.battle-arena')).toBeVisible({ timeout: 20000 }); await expect(host.locator('.online-notice')).toHaveCount(0, { timeout: 20000 });
    await expect(guest.locator('.online-notice')).toHaveCount(0, { timeout: 20000 }); await expect(host.locator('.player-board .board-unit')).toHaveCount(2);
  } finally { await close(hostContext, guestContext); }
});

test('an unknown room gives a recoverable error and the mobile room menu fits its width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/?localRooms=1&room=ZZZZZZ');
  await page.getByRole('button', { name: 'Войти по коду', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('не найдена', { timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Создать комнату', exact: true })).toBeEnabled(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the public room list lets a mobile player join without typing a code and hides occupied rooms', async ({ browser }) => {
  test.setTimeout(60000);
  const { host, guest, hostContext, guestContext } = await participants(browser);
  const watcherContext = await browser.newContext(); const watcher = await watcherContext.newPage();
  try {
    const code = await create(host);
    await guest.goto('/?localRooms=1'); await guest.getByRole('button', { name: 'Комнаты', exact: true }).click();
    await guest.getByLabel('Имя игрока').fill('Гость');
    const row = guest.locator(`.public-rooms [data-room-code="${code}"]`);
    await showRoom(guest, code); await expect(row).toContainText('1/2');
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await row.getByRole('button', { name: 'Войти в комнату Хозяин', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Начать бой', exact: true })).toBeEnabled({ timeout: 15000 });
    await watcher.goto('/?localRooms=1'); await watcher.getByRole('button', { name: 'Комнаты', exact: true }).click();
    await expect(watcher.locator('.public-rooms-empty')).not.toContainText('Ищем', { timeout: 20000 });
    await expect(watcher.locator(`.public-rooms [data-room-code="${code}"]`)).toHaveCount(0);
    await start(host, guest); await playAction(host, guest, { type: 'play', uid: (await savedMatch(host)).game.player.hand.find(c => c.id === 'jaina-volunteer')!.uid });
  } finally { await close(hostContext, guestContext, watcherContext); }
});

test('private rooms stay out of the list, can be made public, and disappear when closed', async ({ browser }) => {
  test.setTimeout(60000);
  const { host, guest, hostContext, guestContext } = await participants(browser);
  try {
    await host.goto('/?localRooms=1'); await host.getByRole('button', { name: 'Комнаты', exact: true }).click();
    await host.getByLabel('Показывать в списке комнат', { exact: true }).uncheck();
    await host.getByRole('button', { name: 'Создать комнату', exact: true }).click();
    await expect(host.locator('.room-code-heading strong')).toBeVisible({ timeout: 25000 });
    const code = (await host.locator('.room-code-heading strong').innerText()).trim();
    await guest.goto('/?localRooms=1'); await guest.getByRole('button', { name: 'Комнаты', exact: true }).click();
    await expect(guest.locator('.public-rooms-empty')).not.toContainText('Ищем', { timeout: 20000 });
    const row = guest.locator(`.public-rooms [data-room-code="${code}"]`); expect(await roomIsOnAnyPage(guest, code)).toBe(false);
    await host.getByLabel('Показывать в списке, пока есть свободное место', { exact: true }).check();
    await showRoom(guest, code);
    await host.getByRole('button', { name: 'Закрыть комнату', exact: true }).click();
    await host.getByRole('dialog', { name: 'Выйти из комнаты', exact: true }).getByRole('button', { name: 'Выйти из комнаты', exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 10000 });
  } finally { await close(hostContext, guestContext); }
});

test('open rooms are rediscovered when the first lobby browser closes', async ({ browser }) => {
  test.setTimeout(60000);
  const directoryContext = await browser.newContext(); const directory = await directoryContext.newPage();
  const { host, guest, hostContext, guestContext } = await participants(browser);
  try {
    await directory.goto('/?localRooms=1'); await directory.getByRole('button', { name: 'Комнаты', exact: true }).click();
    await expect(directory.locator('.public-rooms-empty')).not.toContainText('Ищем', { timeout: 20000 });
    const code = await create(host);
    await showRoom(directory, code);
    await directoryContext.close();
    await guest.goto('/?localRooms=1'); await guest.getByRole('button', { name: 'Комнаты', exact: true }).click();
    const row = guest.locator(`.public-rooms [data-room-code="${code}"]`);
    await showRoom(guest, code, 30_000);
    await expect(host.locator('.room-error')).toHaveCount(0);
    await row.getByRole('button', { name: 'Войти в комнату Хозяин', exact: true }).click(); await start(host, guest);
  } finally { await close(directoryContext, hostContext, guestContext); }
});
