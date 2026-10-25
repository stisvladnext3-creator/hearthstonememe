import { chromium, expect } from '@playwright/test';
import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { readFileSync } from 'node:fs';

// Two independent browsers use the production relay, never ?localRooms=1.
// In the managed environment Node supplies the configured proxy and trusted CA
// to the WSS tunnel. Frames still go to the real public broker, without mocks.
const origin = process.env.CONNECTION_TEST_URL || 'http://127.0.0.1:4173';
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const errors = [];
const withCustomCards = process.env.CUSTOM_CARDS === '1';
const withWarrior = process.env.WARRIOR === '1';
const withDecks = process.env.CLASS_DECKS === '1';
const starter = [...readFileSync(new URL('../src/game/cards.ts', import.meta.url), 'utf8').match(/export const STARTER_DECK = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
async function participant(viewport, role) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  if (withCustomCards) {
    const rule = { trigger: 'play', operation: 'damage', target: 'selectedEnemy', amount: 3, health: 0, count: 1, chance: 100, filter: { side: 'friendly' } };
    const card = (name, kind) => ({ id: 'custom-' + crypto.randomUUID(), name, kind, cost: 0, text: 'Наносит урон выбранному врагу.', flavor: '', rarity: 'common', art: 10, custom: true, editor: { version: 1, tags: ['Проверка'], rules: [] } });
    const power = card('Своя сила', 'power'); power.editor.rules = [rule];
    const hero = card('Свой герой', 'hero'); hero.armor = 7; hero.editor.powerId = power.id; hero.editor.startInHand = true;
    const spell = card('Своя молния', 'spell'); spell.editor.startInHand = true; spell.editor.rules = [{ ...rule, amount: 2 }];
    const cards = role === 'host' ? [power, hero] : [spell], opening = role === 'host' ? hero.id : spell.id;
    const deck = starter.map(id => id === 'casino' ? opening : id);
    await context.addInitScript(({ cards, deck }) => {
      if (!localStorage.getItem('memestone.v1.custom-cards')) localStorage.setItem('memestone.v1.custom-cards', JSON.stringify(cards));
      if (!localStorage.getItem('memestone.v1.deck')) localStorage.setItem('memestone.v1.deck', JSON.stringify(deck));
    }, { cards, deck });
  }
  if (proxy) await context.routeWebSocket(/^wss:\/\/public\.cloud\.shiftr\.io(?:\/.*)?$/, route => {
    const upstream = new WebSocket(route.url(), 'mqtt', { agent: new HttpsProxyAgent(proxy) });
    const pending = [];
    let stopped = false;
    route.onMessage(data => { if (upstream.readyState === WebSocket.OPEN) upstream.send(data); else if (!stopped) pending.push(data); });
    route.onClose(() => { stopped = true; if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate(); else upstream.close(); });
    upstream.on('open', () => { if (stopped) upstream.close(); else for (const data of pending.splice(0)) upstream.send(data); });
    upstream.on('message', (data, binary) => { if (!stopped) route.send(binary ? data : data.toString()); });
    upstream.on('close', () => { if (!stopped) { stopped = true; route.close(); } });
    upstream.on('error', error => { if (!stopped) { errors.push(`WSS: ${error.message}`); stopped = true; route.close(); } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}
async function lobby(page, name, heroClass = 'mage') {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Комнаты', exact: true }).click();
  await page.getByLabel('Имя игрока').fill(name);
  if (heroClass !== 'mage') {
    await page.getByRole('button', { name: 'Выбрать колоду', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Выбор колоды', exact: true });
    await picker.locator('.deck-slot.' + heroClass).first().click();
    await picker.getByRole('button', { name: 'Выбрать колоду', exact: true }).click();
    await expect(page.locator('.room-deck-note')).toContainText(heroClass === 'warrior' ? 'Воин' : 'Чернокнижник');
  }
  if (withWarrior && page.viewportSize().width <= 960) await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
}
async function findRoom(page, code) {
  const row = page.locator(`.public-rooms [data-room-code="${code}"]`);
  await expect(async () => {
    const previous = page.getByRole('button', { name: 'Предыдущая страница комнат' });
    while (await previous.count() && await previous.isEnabled()) await previous.click();
    while (!await row.count()) {
      const next = page.getByRole('button', { name: 'Следующая страница комнат' });
      if (!await next.count() || !await next.isEnabled()) break;
      await next.click();
    }
    await expect(row).toHaveCount(1, { timeout: 500 });
  }).toPass({ timeout: 20_000 });
  return row;
}
async function flow(listed) {
  const host = await participant({ width: 1440, height: 900 }, 'host');
  const guest = await participant((withWarrior || withDecks) && listed ? { width: 844, height: 390 } : { width: 390, height: 844 }, 'guest');
  const name = `Проверка-${crypto.randomUUID().slice(0, 5)}`;
  try {
    await lobby(host.page, name, !listed && (withWarrior || withDecks) ? withDecks ? 'warlock' : 'warrior' : 'mage');
    await host.page.getByLabel('Показывать в списке комнат', { exact: true }).setChecked(listed);
    await host.page.getByRole('button', { name: 'Создать комнату', exact: true }).click();
    await host.page.getByRole('dialog', { name: 'Выбор колоды', exact: true }).getByRole('button', { name: 'Создать комнату', exact: true }).click();
    await expect(host.page.locator('.room-code-heading strong')).toBeVisible({ timeout: 25_000 });
    const code = (await host.page.locator('.room-code-heading strong').innerText()).trim();
    await lobby(guest.page, 'Гость-проверка', listed && (withWarrior || withDecks) ? withDecks ? 'warlock' : 'warrior' : 'mage');
    if (listed) {
      const row = await findRoom(guest.page, code);
      await row.getByRole('button', { name: `Войти в комнату ${name}`, exact: true }).click();
    } else {
      await guest.page.getByLabel('Код комнаты', { exact: true }).fill(code);
      await guest.page.getByRole('button', { name: 'Войти по коду', exact: true }).click();
    }
    await guest.page.getByRole('dialog', { name: 'Выбор колоды', exact: true }).getByRole('button', { name: 'Войти в комнату', exact: true }).click();
    await expect(host.page.getByRole('button', { name: 'Начать бой', exact: true })).toBeEnabled({ timeout: 25_000 });
    console.log(`${listed ? 'Public list' : 'Room code'}: two players connected`);
    await host.page.getByRole('button', { name: 'Начать бой', exact: true }).click();
    for (const { page } of [host, guest]) {
      await expect(page.getByRole('dialog', { name: 'Стартовая рука' })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Подтвердить стартовую руку' }).click();
    }
    for (const { page } of [host, guest]) await expect(page.getByRole('dialog', { name: 'Стартовая рука' })).toHaveCount(0, { timeout: 15_000 });
    const first = await host.page.locator('.end-turn').isEnabled() ? host.page : guest.page;
    const second = first === host.page ? guest.page : host.page;
    const customMove = async page => {
      if (page === host.page) {
        await page.getByRole('button', { name: 'Свой герой, 0 маны', exact: true }).click();
        await expect(guest.page.locator('.enemy-power strong')).toHaveText('Своя сила');
        await page.getByRole('button', { name: 'Сила героя Своя сила, 0 маны', exact: true }).click();
        await page.locator('[data-combat-anchor="bot:hero"]').click();
        await expect(guest.page.locator('.own-hero-row .hero-hp')).toContainText('27');
      } else {
        await page.getByRole('button', { name: 'Своя молния, 0 маны', exact: true }).click();
        await page.locator('[data-combat-anchor="bot:hero"]').click();
        await expect(page.locator('.last-action')).toContainText('2 урона');
      }
    };
    if (withCustomCards) await customMove(first);
    await first.getByRole('button', { name: 'Завершить', exact: true }).click();
    await expect(second.locator('.end-turn')).toBeEnabled({ timeout: 15_000 });
    if (withCustomCards) await customMove(second);
    await second.getByRole('button', { name: 'Завершить', exact: true }).click();
    await expect(first.locator('.end-turn')).toBeEnabled({ timeout: 15_000 });
    console.log(`${listed ? 'Public list' : 'Room code'}: shared battle and both turn transfers received`);
    if (withCustomCards) console.log('Custom hero, custom power and custom spell synchronized between different card libraries');
    if (withWarrior) {
      const warrior = listed ? guest.page : host.page, mage = listed ? host.page : guest.page;
      await expect(warrior.locator('.own-power strong')).toHaveText('Поднять щит!');
      await expect(mage.locator('.enemy-power strong')).toHaveText('Поднять щит!');
      await expect(mage.locator('.own-power strong')).toHaveText('Искра');
      if (warrior !== first) {
        await first.getByRole('button', { name: 'Завершить', exact: true }).click();
        await expect(warrior.locator('.end-turn')).toBeEnabled({ timeout: 15000 });
      }
      const power = warrior.getByRole('button', { name: 'Сила героя Поднять щит!, 2 маны', exact: true });
      await power.click();
      await expect(warrior.locator('.own-hero-row .hero-armor')).toHaveText('2');
      await expect(mage.locator('.enemy-hero-row .hero-armor')).toHaveText('2');
      await expect(warrior.locator('.arena-bottom .mana-bar strong')).toHaveText('0/2');
      await expect(power).toHaveAttribute('aria-disabled', 'true');
      console.log((listed ? 'Guest' : 'Host') + ' warrior: independent classes, power visibility, 2 armor and 2 mana synchronized');
    }
    if (withDecks) {
      const warlock = listed ? guest.page : host.page, opponent = listed ? host.page : guest.page;
      await expect(warlock.locator('.own-power strong')).toHaveText('Жизнеотвод');
      await expect(opponent.locator('.enemy-power strong')).toHaveText('Жизнеотвод');
      if (warlock !== first) { await first.getByRole('button', { name: 'Завершить', exact: true }).click(); await expect(warlock.locator('.end-turn')).toBeEnabled(); }
      const handCount = await warlock.locator('.player-hand .hand-card-button').count();
      await warlock.getByRole('button', { name: 'Сила героя Жизнеотвод, 2 маны', exact: true }).click();
      await expect(warlock.locator('.own-hero-row .hero-hp')).toContainText('28');
      await expect(opponent.locator('.enemy-hero-row .hero-hp')).toContainText('28');
      await expect(warlock.locator('.player-hand .hand-card-button')).toHaveCount(handCount + 1);
      await expect(warlock.locator('.arena-bottom .mana-bar strong')).toHaveText('0/2');
      console.log((listed ? 'Guest' : 'Host') + ' warlock: deck class, self damage, draw, enemy power and mana synchronized');
    }
    if (!listed || withWarrior || withDecks) {
      if (withWarrior) await guest.page.evaluate(() => localStorage.setItem('memestone.v1.hero-class', JSON.stringify('mage')));
      await guest.page.reload();
      if (await guest.page.getByRole('button', { name: 'Комнаты', exact: true }).isVisible()) await guest.page.getByRole('button', { name: 'Комнаты', exact: true }).click();
      await guest.page.getByRole('button', { name: `Вернуться в комнату ${code}`, exact: true }).click();
      await expect(guest.page.locator('.battle-arena')).toBeVisible({ timeout: 25_000 });
      for (const { page } of [host, guest]) await expect(page.locator('.online-notice')).toHaveCount(0, { timeout: 20_000 });
      if (withWarrior) await expect(guest.page.locator(listed ? '.own-hero-row .hero-armor' : '.enemy-hero-row .hero-armor')).toHaveText('2');
      console.log('Room code: guest reconnected to the same match after reload');
    }
    if (withDecks) {
      await host.page.getByRole('button', { name: 'Сдаться', exact: true }).click();
      await host.page.getByRole('dialog', { name: 'Сдаться', exact: true }).getByRole('button', { name: 'Сдаться', exact: true }).click();
      for (const [participant, nextClass] of [[host, listed ? 'warlock' : 'warrior'], [guest, listed ? 'warrior' : 'warlock']]) {
        await participant.page.getByRole('dialog', { name: 'Результат боя', exact: true }).getByRole('button', { name: 'Ещё одна партия', exact: true }).click();
        const picker = participant.page.getByRole('dialog', { name: 'Выбор колоды', exact: true });
        await picker.locator('.deck-slot.' + nextClass).first().click();
        await picker.getByRole('button', { name: 'Играть ещё', exact: true }).click();
      }
      for (const participant of [host, guest]) { await expect(participant.page.getByRole('dialog', { name: 'Стартовая рука' })).toBeVisible(); await participant.page.getByRole('button', { name: 'Подтвердить стартовую руку' }).click(); }
      for (const participant of [host, guest]) await expect(participant.page.getByRole('dialog', { name: 'Стартовая рука' })).toHaveCount(0);
      await expect(host.page.locator('.own-power strong')).toHaveText(listed ? 'Жизнеотвод' : 'Поднять щит!');
      await expect(guest.page.locator('.own-power strong')).toHaveText(listed ? 'Поднять щит!' : 'Жизнеотвод');
      console.log('Rematch: both players selected different class decks and started a new match in the same room');
    }
    // Close normally to clear this test room from the real public directory.
    await host.page.getByRole('button', { name: `Комната ${code}`, exact: true }).click();
    await host.page.getByRole('button', { name: 'Закрыть комнату', exact: true }).click();
    await host.page.getByRole('dialog', { name: 'Выйти из комнаты', exact: true }).getByRole('button', { name: 'Выйти из комнаты', exact: true }).click();
  } catch (error) {
    console.error('Host:', (await host.page.locator('body').innerText()).slice(-3000));
    console.error('Guest:', (await guest.page.locator('body').innerText()).slice(-3000));
    throw error;
  } finally { await Promise.all([host.context.close(), guest.context.close()]); }
}
try {
  await flow(false);
  await flow(true);
  expect(errors).toEqual([]);
  console.log('PASS: only live multiplayer connectivity checked (code, list, battle, reconnect).');
} finally { await browser.close(); }
