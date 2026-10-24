import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { STARTER_DECK } from '../src/game/cards';
import { createRoomGame } from '../src/online/protocol';

let seed = 2;
while (!createRoomGame(STARTER_DECK, STARTER_DECK, 'Хозяин', 'Гость', seed, 'fixture').player.hand.some(c => c.id === 'jaina-volunteer')) seed += 2;
async function participants(browser: Browser) {
  const hostContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const guestContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  await hostContext.addInitScript(seed => {
    const random = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = function<T extends ArrayBufferView | null>(array: T): T {
      if (array instanceof Uint32Array && array.length === 1) { array[0] = seed; return array; }
      return random(array);
    };
  }, seed);
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
}
async function close(...contexts: BrowserContext[]) { await Promise.all(contexts.map(c => c.close())); }

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
    await guest.getByRole('button', { name: 'История сражения', exact: true }).click(); await expect(guest.locator('.battle-log')).toContainText('ХОЗЯИН');
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
