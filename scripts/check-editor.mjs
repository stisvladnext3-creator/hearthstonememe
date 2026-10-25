import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage(), errors = [];
page.setDefaultTimeout(12_000);
page.on('pageerror', error => errors.push(error.message));
const origin = process.env.CONNECTION_TEST_URL || 'http://127.0.0.1:4173';
async function collection() {
  await page.locator('.wood-side-button.collection').first().click();
}
async function editor() { await page.getByRole('button', { name: 'Редактор карт', exact: true }).click(); }
async function tab(name) { await page.getByRole('tab', { name, exact: true }).click(); }
async function fits() {
  return page.evaluate(() => {
    const root = document.querySelector('.card-editor');
    const footer = document.querySelector('.editor-save').getBoundingClientRect();
    const panel = document.querySelector('.card-editor .window-panel');
    const fields = [...panel.querySelectorAll('input,select,textarea,button')].filter(e => e.getClientRects().length);
    return { screen: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1,
      footer: footer.bottom <= innerHeight + 1, panel: fields.every(el => { const r = el.getBoundingClientRect(); const p = panel.getBoundingClientRect(); return r.bottom <= p.bottom + 1 && r.right <= p.right + 1 && r.left >= p.left - 1; }), root: !!root };
  });
}
try {
  await page.goto(origin); await collection(); await editor();
  await page.getByRole('button', { name: 'Создать карту', exact: true }).click();
  await page.getByLabel('Название карты', { exact: true }).fill('Проверочная молния');
  await page.getByLabel('Тип карты', { exact: true }).selectOption('spell');
  await page.getByLabel('Стоимость маны', { exact: true }).fill('0');
  await page.getByLabel('Метки синергий (через запятую)', { exact: true }).fill('Тест, Синергия');
  await tab('Ключевые слова'); await page.getByLabel('Начало матча: в стартовую руку', { exact: true }).check();
  await tab('Правила'); await page.getByRole('button', { name: 'Добавить первое правило', exact: true }).click();
  await page.getByLabel('Цель эффекта', { exact: true }).selectOption('selectedEnemy');
  await page.getByLabel('Величина / атака', { exact: true }).fill('5');
  await tab('Просмотр'); await expect(page.locator('.editor-preview .game-card')).toContainText('Наносит 5 урона');
  await page.getByRole('button', { name: 'Сохранить карту', exact: true }).click();
  await expect(page.locator('.workshop-library [data-card-id]')).toHaveCount(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.custom-cards')));
  expect(saved[0].editor.tags).toEqual(['Тест', 'Синергия']);
  await page.reload(); await collection(); await editor();
  await expect(page.locator('.workshop-library [data-card-id]')).toHaveCount(1);
  console.log('Editor: created a spell with real damage, two tags and a guaranteed opening draw; survived reload');
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
  await page.getByRole('button', { name: 'Редактировать колоду Твои правила', exact: true }).click();
  await page.getByRole('button', { name: 'Убрать Козиныч', exact: true }).click();
  await page.getByLabel('Поиск карт').fill('Проверочная молния');
  await page.getByRole('button', { name: /^Проверочная молния, / }).click();
  await page.getByRole('button', { name: 'Сохранить колоду', exact: true }).click();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.getByRole('button', { name: 'В бой', exact: true }).click(); await page.getByRole('dialog', { name: 'Выбор колоды', exact: true }).getByRole('button', { name: 'Играть', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Стартовая рука' })).toBeVisible();
  await expect(page.locator('.mulligan-choice [data-card-id="' + saved[0].id + '"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Подтвердить стартовую руку', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Стартовая рука' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Проверочная молния, 0 маны', exact: true }).click();
  await page.getByRole('button', { name: 'Герой противника: 30 здоровья, атаковать', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Герой противника: 25 здоровья', exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Герой противника: 25 здоровья', exact: true })).toBeVisible();
  console.log('Editor: added the new card to a legal deck, drew it, dealt five damage and restored the saved match');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'Выйти в главное меню', exact: true }).click();
  await collection(); await editor();
  await page.getByRole('button', { name: 'Пример РДШ', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.custom-cards')).length)).toBe(7);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toBe('memestone-my-cards.json');
  await page.getByLabel('Импорт набора карт').setInputFiles(await download.path());
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('memestone.v1.custom-cards')).length)).toBe(7);
  console.log('Editor: six-card synergy example, export and import worked');
  await page.getByRole('button', { name: 'Создать карту', exact: true }).click();
  await page.getByLabel('Тип карты', { exact: true }).selectOption('spell');
  await tab('Правила'); await page.getByRole('button', { name: 'Добавить первое правило', exact: true }).click();
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const name of ['Карта', 'Ключевые слова', 'Правила', 'Скидка', 'Задача', 'Картинка', 'Просмотр']) {
      await tab(name); await page.waitForTimeout(80);
      if (name === 'Скидка') await page.getByLabel('Снижение стоимости за события', { exact: true }).setChecked(true);
      if (name === 'Задача') await page.getByLabel('Задача (для заклинания)', { exact: true }).setChecked(true);
      expect(await fits(), name + ' at ' + viewport.width + 'x' + viewport.height).toEqual({ screen: true, footer: true, panel: true, root: true });
    }
  }
  await page.getByRole('button', { name: 'Мои карты', exact: true }).click();
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
  await page.getByLabel('Тип и редкость карт').selectOption('created');
  await expect(page.locator('.album-card-grid .game-card')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await page.getByRole('button', { name: 'Проверочная молния, 0 маны', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Проверочная молния', exact: true });
  await details.getByRole('tab', { name: 'Правила', exact: true }).click();
  await expect(details.locator('.custom-card-rules')).toContainText('Наносит 5 урона');
  await details.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await editor(); await expect(page.getByRole('heading', { name: 'Мастерская карт' })).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS: editor, deck, custom battle, persistence, import/export and editor phone layouts');
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(-2200));
  await page.screenshot({ path: '/tmp/memestone-editor-failure.png' });
  throw error;
} finally { await context.close(); await browser.close(); }
