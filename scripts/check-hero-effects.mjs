import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
await context.addInitScript(() => { localStorage.setItem('memestone.v1.settings', JSON.stringify({ motion: true, sound: false, board: 'classic' })); });
const page = await context.newPage(), errors = []; page.setDefaultTimeout(10000);
page.on('pageerror', e => errors.push(e.message));
async function captureEffect(locator, path) {
  await locator.evaluate(el => {
    const animations = el.getAnimations({ subtree: true });
    if (!animations.length) throw new Error('Effect has no active CSS animations');
    for (const animation of animations) { animation.pause(); animation.currentTime = 330; }
  });
  await page.screenshot({ path, animations: 'allow' });
}
async function centeredMenu() {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.locator('.wood-buttons').evaluate(el => { const r = el.getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - innerWidth / 2); })).toBeLessThan(1);
    await expect(page.getByRole('button', { name: 'Комнаты', exact: true })).toBeInViewport();
    if (viewport.width < 1000) await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  }
}
try {
  await page.goto(process.env.CONNECTION_TEST_URL || 'http://127.0.0.1:4173');
  await centeredMenu();
  await page.getByRole('button', { name: 'В бой', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Выбор класса', exact: true });
  await expect(picker.locator('.hero-class-choice.warrior .portrait-art')).toHaveAttribute('style', /warrior.webp/);
  await picker.getByRole('button', { name: 'Воин', exact: true }).click();
  await picker.getByRole('button', { name: 'Начать бой', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить стартовую руку', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Стартовая рука' })).toHaveCount(0);
  const template = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.game')));
  async function fixture({ warrior = false, active = 'player' } = {}) {
    await page.evaluate(({ template, warrior, active }) => {
      const g = structuredClone(template); delete g.mulligan; delete g.discovery; g.id = crypto.randomUUID(); g.active = active; g.turn = 7; g.events = []; g.log = []; g.nextLog = 1; g.nextUid = 3000;
      for (const side of ['player', 'bot']) Object.assign(g[side], { health: 30, armor: 0, mana: 10, maxMana: 10, powerUsed: false, powerSilenceTurns: 0, hand: [], board: [], deck: ['regular', 'heal', 'dragon'] });
      g.player.hero = warrior ? 'warrior' : 'mage'; g.player.power = warrior ? 'armor' : 'spark';
      g.bot.hero = 'warrior'; g.bot.power = 'armor';
      const unit = (uid) => ({ id: 'guardian', uid, attack: 3, health: 6, maxHealth: 6, ready: false, taunt: true, cannotAttack: false, ephemeral: false, silenced: false });
      g.player.board = [unit(1001)]; g.bot.board = [unit(1002)];
      g.player.hand = [{ id: 'bolt', uid: 2001 }, { id: 'dog-spell', uid: 2002 }];
      localStorage.setItem('memestone.v1.game', JSON.stringify(g));
    }, { template, warrior, active });
    await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  }
  const own = page.locator('[data-combat-anchor="player:1001"]'), foe = page.locator('[data-combat-anchor="bot:1002"]');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await fixture({ warrior: true });
    await expect(page.locator('.own-hero-row .hero-portrait .portrait-art')).toHaveAttribute('style', /warrior.webp/);
    await expect(page.locator('.own-power .portrait-art')).toHaveAttribute('style', /armor-power.webp/);
    const icon = await page.locator('.own-power .power-orb').boundingBox();
    await page.getByRole('button', { name: 'Сила героя Поднять щит!, 2 маны', exact: true }).click();
    const hammer = page.locator('[data-fx="warrior-hammer"]'); await expect(hammer).toHaveCount(1);
    expect(Math.abs(await hammer.evaluate(el => parseFloat(el.style.left)) - icon.x - icon.width / 2)).toBeLessThan(1);
    await expect(page.locator('.own-hero-row .hero-armor')).toHaveText('2');
    await captureEffect(hammer, `/tmp/hero-hammer-${viewport.width}.png`);
  }
  await fixture();
  await expect(page.locator('.own-power .portrait-art')).toHaveAttribute('style', /spark-power.webp/);
  const spark = page.getByRole('button', { name: 'Сила героя Искра, 2 маны', exact: true });
  await spark.click(); await expect(own).toHaveClass(/targetable/); await expect(foe).toHaveClass(/targetable/);
  await expect(page.locator('.own-hero-row .hero-portrait')).toHaveClass(/targetable/);
  await own.click(); await expect(own.locator('.unit-health')).toHaveText('5');
  await expect(page.locator('[data-fx="arcane-arrow"]')).toHaveCount(1);
  await captureEffect(page.locator('[data-fx="arcane-arrow"]'), '/tmp/hero-arcane-friendly-phone.png');
  await page.getByRole('button', { name: 'Искра хаоса, 2 маны', exact: true }).click();
  await own.click(); await expect(own.locator('.unit-health')).toHaveText('2');
  await page.getByRole('button', { name: 'Такая вот хуйня, собачка, 2 маны', exact: true }).click(); await own.click();
  const discovery = page.getByRole('dialog', { name: 'Раскопка', exact: true });
  await expect(discovery.locator('.discover-effect')).toContainText('Страж трактира');
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(discovery).toBeVisible(); await discovery.locator('.discover-choices button').first().click();
  await expect(discovery).toHaveCount(0); await expect(own).toHaveCount(0); await expect(foe.locator('.unit-health')).toHaveText('6');
  await fixture(); await spark.click(); await page.locator('.own-hero-row .hero-portrait').click();
  await expect(page.locator('.own-hero-row .hero-hp')).toContainText('29');
  await expect(page.locator('[data-fx="arcane-arrow"]')).toHaveCount(1);
  await fixture(); await spark.click(); await foe.click(); await expect(foe.locator('.unit-health')).toHaveText('5');
  await expect(page.locator('[data-fx="arcane-arrow"]')).toHaveCount(1);
  await fixture({ active: 'bot' }); await expect(page.locator('[data-fx="warrior-hammer"]')).toHaveCount(1);
  await expect(page.locator('.enemy-hero-row .hero-armor')).toHaveText('2');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await fixture({ warrior: true });
  await page.getByRole('button', { name: 'Сила героя Поднять щит!, 2 маны', exact: true }).click();
  await expect(page.locator('.own-hero-row .hero-armor')).toHaveText('2'); await expect(page.locator('[data-fx="warrior-hammer"]')).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log('PASS: centered mobile menu, new artwork, hammer from either power icon, purple arrows at enemy/ally/own hero, friendly spell damage and discovery reload, reduced motion.');
} catch (error) {
  await page.screenshot({ path: '/tmp/hero-effects-failure.png', animations: 'allow' }); console.error((await page.locator('body').innerText()).slice(-1400)); throw error;
} finally { await context.close(); await browser.close(); }
