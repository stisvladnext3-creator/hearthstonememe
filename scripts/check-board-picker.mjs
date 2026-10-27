import { chromium, expect } from '@playwright/test';

const origin = process.env.BOARD_TEST_URL || 'http://127.0.0.1:4173';
const fixtureOrigin = process.env.FIXTURE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext(), page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(fixtureOrigin);
  const game = await page.evaluate(async () => {
    const { createGame } = await import('/src/game/engine.ts');
    const g = createGame(undefined, 55); g.active = 'player';
    g.player.board = [{id:'vasiliy',uid:g.nextUid++,attack:4,health:5,maxHealth:5,ready:true,taunt:true,cannotAttack:false,silenced:false,ephemeral:false}];
    return g;
  });
  await page.goto(origin);
  await page.evaluate(g => { localStorage.setItem('memestone.v1.game',JSON.stringify(g));localStorage.setItem('memestone.v1.settings',JSON.stringify({motion:false,sound:false,board:'jungle'})); }, game);
  for (const viewport of [{width:1200,height:720},{width:390,height:844},{width:844,height:390},{width:320,height:568},{width:667,height:375}]) {
    await page.setViewportSize(viewport); await page.reload();
    await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();
    await page.getByRole('button',{name:'Настройки',exact:true}).click();
    await expect(page.locator('.board-option')).toHaveCount(5);
    const overflow = await page.locator('.options-boards').evaluate(section => {
      const s = section.getBoundingClientRect();
      return [...section.querySelectorAll('.board-option')].flatMap(el => {
        const r=el.getBoundingClientRect();return r.left<s.left-1||r.right>s.right+1||r.top<s.top-1||r.bottom>s.bottom+1 ? [{label:el.textContent.trim(),bottom:r.bottom,sectionBottom:s.bottom}] : [];
      });
    });
    expect(overflow).toEqual([]);
    await page.locator('.board-option').filter({hasText:'Гоблинская мастерская'}).click();
    await page.screenshot({path:`/tmp/goblin-settings-${viewport.width}.png`});
    await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();
    await expect(page.locator('.battle-arena.board-goblin')).toBeVisible();
    const image = await page.locator('.battle-arena').evaluate(async el => {
      const url=getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1],img=new Image();
      img.src=url;await img.decode();return {url,width:img.naturalWidth,height:img.naturalHeight};
    });
    expect(image.url).toContain(viewport.height>viewport.width?'goblin-board-portrait.png':'goblin-board.png');
    expect(image.width).toBeGreaterThan(700);expect(image.height).toBeGreaterThan(700);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('memestone.v1.settings')).board)).toBe('goblin');
    await page.screenshot({path:`/tmp/goblin-battle-${viewport.width}.png`});
  }
  await page.reload();await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();await expect(page.locator('.battle-arena.board-goblin')).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS: five field choices stay inside their settings panel at five sizes; goblin backgrounds load for both orientations, apply in battle and survive reload; no browser errors.');
} catch (e) { await page.screenshot({path:'/tmp/goblin-picker-failed.png'}); throw e; }
finally { await context.close(); await browser.close(); }
