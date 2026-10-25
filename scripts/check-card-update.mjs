import { chromium, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const classNames={mage:'Маг',warlock:'Чернокнижник',warrior:'Воин',storm:'Предвестник бури',cat:'Позывной Кот'};
const palettes=Object.entries(classNames).map(([heroClass,name])=>({id:'custom-palette-'+heroClass,name:'Палитра '+name,heroClass,kind:'spell',cost:2,text:'',flavor:'',rarity:'common',art:10,editor:{version:1,tags:[],rules:[],artSourceId:'bolt'}}));
const starter=[...readFileSync(new URL('../src/game/cards.ts',import.meta.url),'utf8').match(/export const STARTER_DECK = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]==='paper-army'?'dragon':m[1]==='rash-quest'?'incinerate-quest':m[1]);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1100,height:706}});
await context.addInitScript(({palettes,starter})=>{
 localStorage.setItem('memestone.v1.custom-cards',JSON.stringify(palettes));
 localStorage.setItem('memestone.v1.decks',JSON.stringify({version:1,decks:[{id:'test-mage',name:'Квест мага',heroClass:'mage',cards:starter}],selectedId:'test-mage'}));
 localStorage.setItem('memestone.v1.settings',JSON.stringify({motion:true,sound:false,board:'classic'}));
},{palettes,starter});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
async function uniformMage(){
 await expect(page.locator('.deck-slot.mage .mage-portrait svg')).toBeVisible();
 for(const node of await page.locator('.mage-portrait svg image').all())expect(await node.evaluate(el=>{const m=el.getScreenCTM();return Math.abs(m.a-m.d)<.00001;})).toBe(true);
}
try{
 await page.goto(process.env.CONNECTION_TEST_URL||'http://127.0.0.1:4173');await page.getByRole('button',{name:'Выбрать колоду для нового боя',exact:true}).click();const picker=page.getByRole('dialog',{name:'Выбор колоды',exact:true});
 for(const viewport of [{width:1100,height:706},{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);await uniformMage();await page.screenshot({path:`/tmp/card-update-mage-${viewport.width}.png`});}
 await page.setViewportSize({width:1100,height:706});await page.keyboard.press('Escape');await page.locator('.wood-side-button.collection').click();const search=page.getByLabel('Поиск карт',{exact:true});
 await search.fill('Палитра');await expect(page.locator('.album-card-grid .game-card')).toHaveCount(5);await page.waitForLoadState('networkidle');await page.screenshot({path:'/tmp/card-update-palettes.png'});
 for(const cl of Object.keys(classNames))await expect(page.locator(`.album-card-grid [data-card-class="${cl}"]`)).toHaveCount(1);
 for(const [name,cl] of [['Маршал Марс','cat'],['Генерал Михалыч','cat'],['Искра хаоса','mage'],['Гениальный план','mage'],['Армия бумажек','warlock']]){
  await search.fill(name);const card=page.locator('.album-card-grid .game-card');await expect(card).toHaveCount(1);await expect(card.locator('.card-class-paint')).toHaveAttribute('data-card-class',cl);await expect(card.locator('.card-rarity')).toHaveCount(1);
 }
 for(const [name,id,keyword] of [['Мяустер','meowster','Маскировка'],['Ящерка','lizard','Громоздкий']]){await search.fill(name);const c=page.locator(`.album-card-grid [data-card-id="${id}"]`);if(id==='lizard')await expect(c.locator('.card-class-paint')).toHaveCount(0);else await expect(c.locator('.card-class-paint')).toHaveAttribute('data-card-class','cat');await expect(c.locator('.card-copy p strong').first()).toHaveText(keyword);}
 await search.fill('Стегозавр');await expect(page.locator('[data-card-id="stegosaurus"] .card-class-paint')).toHaveCount(0);await expect(page.locator('[data-card-id="stegosaurus"] .attack-stat')).toHaveText('2');await expect(page.locator('[data-card-id="stegosaurus"] .health-stat')).toHaveText('3');
 await search.fill('Т-34');await page.locator('.album-card-grid [data-card-id="t34"]').click();const details=page.getByRole('dialog').last();await expect(details).toContainText('Награда за задачу');await expect(details).toContainText('Можно получить за выполнение задачи');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Редактировать колоду Квест мага',exact:true}).click();await search.fill('Маршал Марс');await page.locator('.album-card-grid [data-card-id="marshal-mars"]').click();await expect(page.locator('.toast')).toContainText('другому классу');
 await search.fill('Т-34');await expect(page.getByRole('button',{name:'Добавить Т-34',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Назад',exact:true}).click();await page.getByRole('button',{name:'Выбрать колоду для нового боя',exact:true}).click();await picker.getByRole('button',{name:'Играть',exact:true}).click();
 await expect(page.locator('.mulligan-choice .game-card').first()).toHaveAttribute('data-card-id','incinerate-quest');await page.getByRole('button',{name:'Подтвердить стартовую руку',exact:true}).click();
 await page.locator('.player-hand [data-card-id="incinerate-quest"]').click();await expect(page.locator('.quest-progress.player')).toContainText('0/12');
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('memestone.v1.game')));
 state.player.quest.progress=11;state.player.mana=state.player.maxMana=10;state.player.board=[];state.player.hand=[{id:'bolt',uid:state.nextUid++}];state.bot.hand=[];state.bot.deck=['regular'];state.bot.board=[{id:'regular',uid:state.nextUid++,attack:1,health:2,maxHealth:2,ready:false,taunt:false,cannotAttack:false,silenced:false,ephemeral:false}];
 await page.evaluate(g=>localStorage.setItem('memestone.v1.game',JSON.stringify(g)),state);await page.reload();await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();await expect(page.locator('.quest-progress.player')).toContainText('11/12');
 await page.locator('.player-hand [data-card-id="bolt"]').click();await page.locator('.enemy-board .board-unit').click();await expect(page.locator('.quest-progress.player')).toHaveCount(0);await expect(page.locator('.player-hand [data-card-id="t34"]')).toHaveCount(1);
 await page.locator('.player-hand [data-card-id="t34"]').click();await expect(page.locator('.player-board .unit-attack')).toHaveText('8');await expect(page.locator('.player-board .unit-health')).toHaveText('9');await page.getByRole('button',{name:'Завершить',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('memestone.v1.game')).bot.health)).toBe(22);
 const stealthState=await page.evaluate(()=>JSON.parse(localStorage.getItem('memestone.v1.game')));stealthState.active='player';stealthState.events=[];stealthState.player.hero='general-cat';stealthState.player.power='clawFury';stealthState.player.mana=stealthState.player.maxMana=10;
 const unit=(id,attack,health,taunt=false,stealth=false)=>({id,uid:stealthState.nextUid++,attack,health,maxHealth:health,ready:true,taunt,stealth,cannotAttack:false,silenced:false,ephemeral:false});
 stealthState.player.board=[unit('meowster',4,5,false,true)];stealthState.bot.board=[unit('guardian',4,6,true),unit('regular',1,2),unit('meowster',4,5,false,true)];
 await page.evaluate(g=>localStorage.setItem('memestone.v1.game',JSON.stringify(g)),stealthState);await page.reload();await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();
 await expect(page.locator('.player-board .board-unit.stealth')).toHaveCount(1);await page.locator('.player-board .board-unit').click();await expect(page.locator('.enemy-board .board-unit.stealth')).not.toHaveClass(/targetable/);
 await page.locator('.enemy-board .board-unit.taunt').click();await expect(page.locator('.player-board .board-unit.stealth')).toHaveCount(0);await expect(page.locator('.enemy-board .unit-health')).toHaveText(['1','1','4']);await expect(page.locator('.enemy-board .board-unit.stealth')).toHaveCount(1);

 await page.reload();await page.locator('.wood-side-button.collection').click();await page.getByRole('button',{name:'Редактор карт',exact:true}).click();await page.getByRole('button',{name:'Создать карту',exact:true}).click();await page.getByRole('tab',{name:'Ключевые слова',exact:true}).click();await page.getByLabel('Маскировка',{exact:true}).check();await page.getByLabel('Громоздкий',{exact:true}).check();
 for(const viewport of [{width:1100,height:706},{width:390,height:844},{width:568,height:320}]){
  await page.setViewportSize(viewport);let overflow;
  await expect.poll(async()=>overflow=await page.locator('.card-editor').evaluate(el=>[...el.querySelectorAll('button,input:not([type=file]),select')].flatMap(n=>{const r=n.getBoundingClientRect();return !r.width||!r.height||r.left>=-.5&&r.top>=-.5&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5?[]:[n.getAttribute('aria-label')||n.textContent];}))).toEqual([]).catch(e=>{console.error('Editor overflow:',overflow);throw e;});
 }
 expect(errors).toEqual([]);
 console.log('PASS: five class frame colors, five reassigned cards and deck restriction, reward-only T-34, neutral dinosaur, uniform mage portrait at three sizes, actual opening quest, 11/12 reload, enemy kill reward, tank shot, stealth exit damage and editor keywords at three sizes.');
}catch(e){await page.screenshot({path:'/tmp/card-update-ui-failure.png'});console.error((await page.locator('body').innerText()).slice(-800));throw e;}finally{await context.close();await browser.close();}
