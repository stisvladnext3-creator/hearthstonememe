import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox'] });
const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'no-preference'});
await context.addInitScript(()=>localStorage.setItem('memestone.v1.settings',JSON.stringify({motion:true,sound:false,board:'classic'})));
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
const sizes=[{width:1366,height:768},{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:568,height:320}];
async function fits(scope){
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
 let last=[];
 await expect.poll(async()=>last=await scope.evaluate(el=>[...el.querySelectorAll('button,input:not([type=file]),select')].flatMap(node=>{const r=node.getBoundingClientRect();return !r.width||!r.height||r.left>=-.5&&r.top>=-.5&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5?[]:[{name:node.getAttribute('aria-label')||node.textContent,rect:[r.x,r.y,r.width,r.height]}];})),{timeout:4000}).toEqual([]).catch(e=>{console.error('Layout:',last);throw e;});
}
try{
 await page.goto(process.env.CONNECTION_TEST_URL||'http://127.0.0.1:4173');await page.getByRole('button',{name:'Моя коллекция',exact:true}).click();await page.waitForLoadState('networkidle');
 for(const size of sizes){
  await page.setViewportSize(size);await page.mouse.move(0,0);await fits(page.locator('.collection-v2'));await expect(page.locator('.album-deck-sidebar')).toBeVisible();await expect(page.locator('.album-main')).toBeVisible();
  await expect(page.locator('.album-card-grid .game-card')).toHaveCount(8);
  await expect.poll(()=>page.locator('.album-card-grid .game-card').evaluateAll(cards=>cards.every(c=>{const r=c.getBoundingClientRect();return Math.abs(r.width/r.height-1064/1478)<.003;}))).toBe(true);
  await expect.poll(()=>page.locator('.album-card-grid .game-card').evaluateAll(cards=>new Set(cards.map(c=>Math.round(c.getBoundingClientRect().y))).size)).toBe(2);
  const layout=await page.locator('.album-card-grid .game-card').evaluateAll(cards=>cards.map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  expect(new Set(layout.map(r=>Math.round(r.y))).size).toBe(2);expect(layout[1].x-layout[0].x-layout[0].w).toBeLessThan(7);
  await page.screenshot({path:`/tmp/cat-collection-${size.width}.png`});
 }
 for(const [name,cost,rarity] of [['Маршал Марс',3,'rare'],['Генерал Михалыч',5,'common']]){
  await page.getByLabel('Поиск карт',{exact:true}).fill(name);const card=page.locator('.album-card-grid .game-card');await expect(card).toHaveCount(1);await expect(card).toHaveClass(new RegExp(rarity));await expect(card.locator('.card-cost')).toHaveText(String(cost));
 }
 await page.getByLabel('Поиск карт',{exact:true}).fill('');
 await page.getByRole('button',{name:'Создать колоду',exact:true}).click();const creator=page.getByRole('dialog',{name:'Создание колоды',exact:true});
 await creator.getByRole('button',{name:'Позывной «Кот»',exact:true}).click();await creator.getByLabel('Название новой колоды',{exact:true}).fill('Генеральский штаб');
 for(const size of sizes){await page.setViewportSize(size);await fits(creator);}
 await creator.getByRole('button',{name:'Создать колоду',exact:true}).click();
 for(const size of sizes){await page.setViewportSize(size);await fits(page.locator('.collection-v2'));}
 await page.getByRole('button',{name:'Сохранить колоду',exact:true}).click();await page.getByRole('button',{name:'Назад',exact:true}).click();
 await page.getByRole('button',{name:'Выбрать колоду для нового боя',exact:true}).click();const picker=page.getByRole('dialog',{name:'Выбор колоды',exact:true});
 await expect(picker.locator('.deck-slot.chosen')).toContainText('Генеральский штаб');await picker.getByRole('button',{name:'Играть',exact:true}).click();
 await page.getByRole('button',{name:'Подтвердить стартовую руку',exact:true}).click();await expect(page.getByRole('dialog',{name:'Стартовая рука'})).toHaveCount(0);
 const power=page.getByRole('button',{name:'Сила героя Ярость когтей, 3 маны',exact:true});await expect(power).toHaveAttribute('aria-disabled','true');
 for(let n=0;n<2;n++){await page.getByRole('button',{name:'Завершить',exact:true}).click();await expect(page.locator('.end-turn')).toBeEnabled({timeout:30000});}
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('memestone.v1.game')));await power.click();
 const discover=page.getByRole('dialog',{name:'Раскопка',exact:true});await expect(discover).toBeVisible();await expect(discover.locator('.game-card')).toHaveCount(3);
 const fx=page.locator('[data-fx="cat-venom"]');await expect(fx).toHaveCount(1);await fx.evaluate(el=>el.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=350;}));await page.screenshot({path:'/tmp/cat-venom.png',animations:'allow'});
 const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('memestone.v1.game')));expect(pending.discovery.options.length).toBe(3);expect(pending.player.mana).toBe(before.player.mana-3);
 await page.reload();await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();await expect(discover).toBeVisible();
 await discover.locator('.game-card').first().click();await expect(discover).toHaveCount(0);
 const done=await page.evaluate(()=>JSON.parse(localStorage.getItem('memestone.v1.game')));expect(done.player.health).toBe(before.player.health-3);expect(done.bot.health).toBe(before.bot.health);
 expect(done.player.hand.at(-1).id).toBe(pending.discovery.options[0]);await expect(power).toHaveAttribute('aria-disabled','true');expect(errors).toEqual([]);
 console.log('PASS: compact undistorted eight-card collection with simultaneous deck column at five sizes, class creation, real cat match, 3/5/7 discovery, green venom, pending-choice reload and self damage.');
}catch(e){await page.screenshot({path:'/tmp/cat-ui-failure.png'});console.error((await page.locator('body').innerText()).slice(-700));throw e;}finally{await context.close();await browser.close();}
