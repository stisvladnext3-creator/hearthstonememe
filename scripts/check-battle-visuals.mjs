import {chromium,expect} from '@playwright/test';
const origin=process.env.VISUALS_URL||'http://127.0.0.1:5173';
const fixtureOrigin=process.env.FIXTURE_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1200,height:720}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
try{
  await page.goto(fixtureOrigin);
  const fixtures=await page.evaluate(async()=>{
    const {createGame}=await import('/src/game/engine.ts'),{CARD}=await import('/src/game/cards.ts');
    const {newCustomCard,registerCardPack,packForCards}=await import('/src/game/custom-cards.ts');
    const {newRule}=await import('/src/game/custom-schema.ts');
    const {MINION_ENTRANCES,SPELL_CASTS,entranceFor}=await import('/src/game/visual-effects.ts');
    const all=[...MINION_ENTRANCES,...SPELL_CASTS],cards=all.map((v,i)=>{
      let c;do{c={...newCustomCard(),kind:i<7?'minion':'spell',cost:1,attack:i<7?3:undefined,health:i<7?4:undefined,name:'Проверка '+v};}while(entranceFor(c)!==v);
      c.editor.artSourceId=i<7?'tigerra':'bolt';c.editor.rules=[{...newRule(),operation:'damage',target:'enemyHero',amount:2}];registerCardPack([c]);return c;
    });
    function game(card){const g=createGame(undefined,77);g.active='player';g.turn=1;g.events=[];g.log=[];for(const p of [g.player,g.bot])Object.assign(p,{mana:10,maxMana:10,board:[],hand:[],deck:['regular','regular']});g.customCards=packForCards(cards.map(c=>c.id));
      const m=(id,patch={})=>({id,uid:g.nextUid++,attack:CARD[id].attack,health:CARD[id].health,maxHealth:CARD[id].health,ready:true,taunt:!!CARD[id].taunt,cannotAttack:false,silenced:false,ephemeral:false,...patch});
      g.player.board=[m('vasiliy'),m('guardian',{divineShield:true,windfury:true}),m('meowster',{stealth:true})];g.bot.board=[m('tigerra',{lifesteal:true,health:1}),m('guardian',{reborn:true,elusive:true,immuneOnOwnTurn:true})];g.player.hand=[{id:card.id,uid:g.nextUid++}];return g;}
    return {cards,games:cards.map(game),death:game(CARD.bolt),silence:game(CARD.silence)};
  });
  await page.goto(origin);
  const load=async(game,motion=true)=>{
    await page.evaluate(({game,cards,motion})=>{localStorage.setItem('memestone.v1.custom-cards',JSON.stringify(cards));localStorage.setItem('memestone.v1.game',JSON.stringify(game));localStorage.setItem('memestone.v1.settings',JSON.stringify({motion,sound:false,board:'jungle'}));},{game,cards:fixtures.cards,motion});
    await page.reload();await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();await expect(page.locator('.battle-arena.board-jungle')).toBeVisible();
  };
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('memestone.v1.game')));
  for(let i=0;i<fixtures.games.length;i++){
    const game=fixtures.games[i],variant=fixtures.cards[i].name.split(' ')[1];await load(game);
    await page.locator('.player-hand .hand-card-button').click();await expect(page.locator(`[data-entrance="${variant}"]`)).toHaveCount(1);
    expect((await state()).bot.health).toBe(30);expect((await state()).player.mana).toBe(10);await expect(page.getByRole('button',{name:'Розыгрыш…',exact:true})).toBeDisabled();
    await page.waitForTimeout(650);expect((await state()).bot.health).toBe(30);
    if(['stone','nature','arcane','frost'].includes(variant))await page.screenshot({path:`/tmp/cast-${variant}.png`});
    const stage=(await state()).casting;expect(stage.endsAt-stage.startedAt).toBe(1500);
    await expect.poll(async()=>(await state()).bot.health).toBe(28);await expect(page.locator('.card-play-effects')).toHaveCount(0);expect((await state()).player.mana).toBe(9);
    await expect(page.locator('.board-unit .unit-name')).toHaveCount(0);
  }
  console.log('PASS: all seven creature entrances and five spell casts, real 1500ms delay, no early costs/effects, blocked duplicate input.');
  for(const viewport of [{width:1200,height:720},{width:390,height:844},{width:844,height:390},{width:320,height:568},{width:667,height:375}]){
    await page.setViewportSize(viewport);await load(fixtures.death);
    await expect(page.locator('.player-board .unit-taunt-frame')).toHaveCount(2);await expect(page.locator('.unit-divine-bubble')).toHaveCount(1);await expect(page.locator('.unit-wind-veil')).toHaveCount(1);await expect(page.locator('.unit-aura-fire')).toHaveCount(1);await expect(page.locator('.unit-stealth-mist')).toHaveCount(1);
    await page.screenshot({path:`/tmp/jungle-board-${viewport.width}.png`});
    await page.locator('.player-hand .hand-card-button').click();await page.locator('.enemy-board .board-unit').first().click();await expect(page.locator('.card-play-effects')).toHaveCount(1);
    await page.waitForTimeout(650);const b=await page.locator('.casting-card').boundingBox();expect(b.x).toBeGreaterThanOrEqual(-1);expect(b.y).toBeGreaterThanOrEqual(-1);expect(b.x+b.width).toBeLessThanOrEqual(viewport.width+1);expect(b.y+b.height).toBeLessThanOrEqual(viewport.height+1);
    await expect(page.locator('[data-fx="deathrattle"]')).toBeVisible();if(viewport.width===390)await page.screenshot({path:'/tmp/deathrattle-skull-390.png'});
    await page.getByRole('button',{name:'Настройки',exact:true}).click();await expect(page.locator('.board-option')).toHaveCount(viewport.width<=600&&viewport.height>=viewport.width?3:4);
    const overflow=await page.locator('.hearth-options').evaluate(el=>[...el.querySelectorAll('button,.board-option')].flatMap(n=>{const b=n.getBoundingClientRect();return b.width&&b.height&&(b.left<-.5||b.right>innerWidth+.5||b.top<-.5||b.bottom>innerHeight+.5)?[n.textContent]:[];}));expect(overflow).toEqual([]);
    while(!await page.locator('.board-option').filter({hasText:'Огненная кузница'}).count())await page.locator('.board-page-next').click();
    await page.locator('.board-option').filter({hasText:'Огненная кузница'}).click();await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();await expect(page.locator('.battle-arena.board-forge')).toBeVisible();
  }
  console.log('PASS: table keywords, aura, floating skull and spell preview bounds at five phone/desktop sizes.');
  await load(fixtures.silence);await page.locator('.player-hand .hand-card-button').click();await page.locator('.player-board .board-unit.aura-source').click();await expect(page.locator('.unit-aura-fire')).toHaveCount(0);
  await load(fixtures.games[0],false);await page.locator('.player-hand .hand-card-button').click();await expect(page.locator('.still-cast')).toHaveCount(1);expect((await state()).bot.health).toBe(30);await expect.poll(async()=>(await state()).bot.health).toBe(28);
  await load(fixtures.games[0]);await page.locator('.player-hand .hand-card-button').click();const cast=(await state()).casting;await page.reload();await page.getByRole('button',{name:'Продолжить бой',exact:true}).click();await expect.poll(async()=>(await state()).bot.health).toBe(28);await page.waitForTimeout(1700);expect((await state()).bot.health).toBe(28);expect(cast.cardId).toBe(fixtures.cards[0].id);
  const bot=structuredClone(fixtures.games[0]);bot.active='bot';bot.player.board=[];bot.player.hand=[];bot.bot.board=[];bot.bot.hand=[{id:fixtures.cards[0].id,uid:bot.nextUid++}];await load(bot);await expect.poll(async()=>(await state()).casting?.side).toBe('bot');expect((await state()).player.health).toBe(30);expect((await state()).bot.board).toHaveLength(0);await expect.poll(async()=>(await state()).player.health).toBe(28);expect((await state()).bot.board).toHaveLength(1);
  // Reproduce a delayed network burst: the host has already resolved the card
  // when its cast snapshot reaches this screen. The UI must still show both.
  await page.goto(fixtureOrigin);
  await page.evaluate(async({g,cards})=>{
    const {default:React}=await import('/node_modules/.vite/deps/react.js'),{default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js'),{default:Battle}=await import('/src/components/Battle.tsx');
    const{ArtworkProvider}=await import('/src/artwork.tsx'),{CardAppearanceProvider}=await import('/src/card-appearance.tsx');
    const{registerCardPack}=await import('/src/game/custom-cards.ts'),{stageAction,resolveCast}=await import('/src/game/card-play.ts');registerCardPack(cards);
    document.getElementById('root').style.display='none';const target=document.createElement('div');document.body.append(target);const root=ReactDOM.createRoot(target),h=React.createElement;
    window.showCastSnapshot=game=>root.render(h(ArtworkProvider,null,h(CardAppearanceProvider,null,h('div',{className:'app in-battle'},h('main',{className:'main-container'},h(Battle,{game,dispatch:()=>{},back:()=>{},rematch:()=>{},inspect:()=>{},settings:()=>{},animations:true,overlayOpen:false,board:'jungle'}))))));
    window.slowStage=stageAction(g,'player',{type:'play',uid:g.player.hand[0].uid},Date.now()-5000).state;window.slowResult=resolveCast(window.slowStage,Date.now());window.showCastSnapshot(g);
  },{g:fixtures.games[0],cards:fixtures.cards});
  await expect(page.locator('.battle-arena')).toBeVisible();await page.evaluate(()=>{window.showCastSnapshot(window.slowStage);setTimeout(()=>window.showCastSnapshot(window.slowResult),100);});
  await expect(page.locator('.card-play-effects')).toHaveCount(1);await page.waitForTimeout(700);await expect(page.locator('.hero-panel.bot .hero-hp')).toHaveText('30');await expect(page.locator('.card-play-effects')).toHaveCount(1);await expect(page.locator('.hero-panel.bot .hero-hp')).toHaveText('28');await expect(page.locator('.card-play-effects')).toHaveCount(0);
  console.log('PASS: a late network burst still presents the full entrance before the result.');
  expect(errors).toEqual([]);console.log('PASS: silence clears aura, motion-off preserves timing, reload never duplicates effect; no browser errors.');
}catch(e){await page.screenshot({path:'/tmp/battle-visuals-ui-failed.png'});throw e;}finally{await context.close();await browser.close();}
