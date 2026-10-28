import { chromium, expect } from '@playwright/test';

const origin = process.env.BOARD_TEST_URL || 'http://127.0.0.1:4173';
const fixtureOrigin = process.env.FIXTURE_URL || 'http://127.0.0.1:5173';
const boardId=process.env.BOARD_ID||'tournament';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext(), page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
const firstPage=async()=>{const prev=page.getByRole('button',{name:'Предыдущие поля',exact:true});while(await prev.count()&&await prev.isEnabled())await prev.click();};
const selectBoard=async name=>{await firstPage();const option=page.locator('.board-option').filter({hasText:name});while(!await option.count())await page.getByRole('button',{name:'Следующие поля',exact:true}).click();await option.click();};
try {
  await page.goto(fixtureOrigin);
  const seed = await page.evaluate(async () => {
    const { createGame } = await import('/src/game/engine.ts');
    const { BATTLEGROUNDS }=await import('/src/battlegrounds.ts');
    const g = createGame(undefined, 55); g.active = 'player';
    g.player.board = [{id:'vasiliy',uid:g.nextUid++,attack:4,health:5,maxHealth:5,ready:true,taunt:true,cannotAttack:false,silenced:false,ephemeral:false}];
    return {game:g,boards:BATTLEGROUNDS.map(b=>({id:b.id,name:b.name}))};
  });
  const board=seed.boards.find(b=>b.id===boardId);expect(board).toBeTruthy();
  await page.goto(origin);
  await page.evaluate(g => { localStorage.setItem('memestone.v1.game',JSON.stringify(g));localStorage.setItem('memestone.v1.settings',JSON.stringify({motion:false,sound:false,board:'jungle'})); }, seed.game);
  for (const viewport of [{width:1200,height:720},{width:390,height:844},{width:844,height:390},{width:320,height:568},{width:667,height:375}]) {
    await page.setViewportSize(viewport); await page.reload();
    await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();
    await page.getByRole('button',{name:'Настройки',exact:true}).click();
    await firstPage();
    await expect(page.locator('.board-option')).toHaveCount(Math.min(viewport.width<=600&&viewport.height>=viewport.width?3:4,seed.boards.length));
    const ids=[];
    for(;;){
      const overflow = await page.locator('.options-boards').evaluate(section => {
        const s = section.getBoundingClientRect();
        return [...section.querySelectorAll('.board-option,.board-pages')].flatMap(el => {
          const r=el.getBoundingClientRect();return r.left<s.left-1||r.right>s.right+1||r.top<s.top-1||r.bottom>s.bottom+1 ? [{label:el.textContent.trim(),bottom:r.bottom,sectionBottom:s.bottom}] : [];
        });
      });
      expect(overflow).toEqual([]);
      ids.push(...await page.locator('.board-option input').evaluateAll(els=>els.map(el=>el.value)));
      const next=page.getByRole('button',{name:'Следующие поля',exact:true});
      if(!await next.count()||!await next.isEnabled())break;
      await next.click();
    }
    expect([...new Set(ids)].sort()).toEqual(seed.boards.map(b=>b.id).sort());
    await selectBoard(board.name);
    await page.screenshot({path:`/tmp/${boardId}-settings-${viewport.width}.png`});
    await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();
    await expect(page.locator(`.battle-arena.board-${boardId}`)).toBeVisible();
    const image = await page.locator('.battle-arena').evaluate(async el => {
      const url=getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1],img=new Image();
      img.src=url;await img.decode();return {url,width:img.naturalWidth,height:img.naturalHeight};
    });
    expect(image.url).toContain(viewport.height>viewport.width?`${boardId}-board-portrait.png`:`${boardId}-board.png`);
    expect(image.width).toBeGreaterThan(700);expect(image.height).toBeGreaterThan(700);
    expect(viewport.height>viewport.width?image.height>image.width:image.width>image.height).toBe(true);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('memestone.v1.settings')).board)).toBe(boardId);
    await page.screenshot({path:`/tmp/${boardId}-battle-${viewport.width}.png`});
  }
  await page.getByRole('button',{name:'Настройки',exact:true}).click();await selectBoard('Огненная кузница');await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();
  await page.setViewportSize({width:320,height:568});await page.reload();await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();await page.getByRole('button',{name:'Настройки',exact:true}).click();await expect(page.locator('.board-option.chosen')).toContainText('Огненная кузница');
  for(const viewport of [{width:844,height:390},{width:320,height:568}]){await page.setViewportSize(viewport);await expect(page.locator('.board-option.chosen')).toContainText('Огненная кузница');}
  await selectBoard(board.name);await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();
  await page.reload();await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();await expect(page.locator(`.battle-arena.board-${boardId}`)).toBeVisible();
  expect(errors).toEqual([]);
  console.log(`PASS: all ${seed.boards.length} fields fit at five sizes, phone pagination and selected-page rotation work; ${boardId} backgrounds load, apply and survive reload; no browser errors.`);
} catch (e) { await page.screenshot({path:`/tmp/${boardId}-picker-failed.png`}); throw e; }
finally { await context.close(); await browser.close(); }
