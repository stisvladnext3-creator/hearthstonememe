import {chromium,expect} from '@playwright/test';
import WebSocket from 'ws';
import {HttpsProxyAgent} from 'https-proxy-agent';
const origin=process.env.FIXTURE_URL||'http://127.0.0.1:5173';
const media=process.env.CARD_MEDIA==='1';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const contexts=[],errors=[],proxy=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
async function participant(){
 const context=await browser.newContext();contexts.push(context);
 if(proxy)await context.routeWebSocket(/^wss:\/\/public\.cloud\.shiftr\.io(?:\/.*)?$/,route=>{
  const upstream=new WebSocket(route.url(),'mqtt',{agent:new HttpsProxyAgent(proxy)}),queued=[];let stopped=false;
  route.onMessage(d=>{if(upstream.readyState===WebSocket.OPEN)upstream.send(d);else if(!stopped)queued.push(d);});
  route.onClose(()=>{stopped=true;if(upstream.readyState===WebSocket.CONNECTING)upstream.terminate();else upstream.close();});
  upstream.on('open',()=>{if(stopped)upstream.close();else for(const d of queued.splice(0))upstream.send(d);});
  upstream.on('message',(d,binary)=>{if(!stopped)route.send(binary?d:d.toString());});
  upstream.on('close',()=>{if(!stopped){stopped=true;route.close();}});upstream.on('error',e=>{if(!stopped){errors.push(e.message);stopped=true;route.close();}});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 await page.evaluate(async()=>{const{PeerRoom}=await import('/src/online/room.ts');window.castRoomTrace=[];window.castRoom=new PeerRoom(s=>{window.castRoomState=s;if(s.game)window.castRoomTrace.push({at:Date.now(),cast:s.game.casting,own:s.game.player.health,foe:s.game.bot.health,mana:s.game.player.mana,enemyMana:s.game.bot.mana,board:s.game.player.board.length,enemyBoard:s.game.bot.board.length});});});return page;
}
const state=p=>p.evaluate(()=>window.castRoomState);
const game=p=>p.evaluate(()=>window.castRoomState.game);
try{
 const host=await participant();await host.evaluate(async media=>{const{classDeck,STARTER_DECK}=await import('/src/game/cards.ts');const deck=classDeck(STARTER_DECK,'mage');if(media){const{newCustomCard,registerCardPack}=await import('/src/game/custom-cards.ts'),{newRule}=await import('/src/game/custom-schema.ts'),{pcmSound}=await import('/src/game/play-media.ts');const c={...newCustomCard(),name:'Сетевой звук',kind:'spell',cost:2,attack:undefined,health:undefined};c.editor.animation='frost';c.editor.sound=pcmSound(Float32Array.from({length:80000},(_,i)=>Math.sin(i/17)*.2),'network.wav');c.editor.rules=[{...newRule(),amount:3,target:'selectedEnemy'}];registerCardPack([c]);window.playMediaCard=c;deck[deck.indexOf('bolt')]=c.id;}await window.castRoom.open('host','Cast Host',deck,undefined,undefined,false,'mage');},media);
 await expect.poll(async()=>(await state(host)).phase,{timeout:30000}).toBe('waiting');const code=(await state(host)).code;
 const guest=await participant();await guest.evaluate(async code=>{const{classDeck,STARTER_DECK}=await import('/src/game/cards.ts');await window.castRoom.open('guest','Cast Guest',classDeck(STARTER_DECK,'mage'),code,undefined,false,'mage');},code);
 await expect.poll(async()=>(await state(host)).connected,{timeout:30000}).toBe(true);await expect.poll(async()=>(await state(guest)).connected,{timeout:30000}).toBe(true);
 async function fixture(active){await host.evaluate(async active=>{const{createRoomGame}=await import('/src/online/protocol.ts'),{classDeck,STARTER_DECK}=await import('/src/game/cards.ts');const g=createRoomGame(classDeck(STARTER_DECK,'mage'),classDeck(STARTER_DECK,'mage'),'Cast Host','Cast Guest',2,crypto.randomUUID());g.active=active;g.events=[];g.log=[];for(const p of [g.player,g.bot])Object.assign(p,{mana:10,maxMana:10,board:[],hand:[{id:'bolt',uid:g.nextUid++},{id:'regular',uid:g.nextUid++}],deck:['regular','regular']});if(window.playMediaCard){const{packForCards}=await import('/src/game/custom-cards.ts');g.customCards=packForCards([window.playMediaCard.id],'match');for(const p of [g.player,g.bot])p.hand[0].id=window.playMediaCard.id;}window.castRoom.canonical=g;window.castRoom.state.revision++;window.castRoom.publish();},active);const id=(await game(host)).id;await expect.poll(async()=>(await game(guest))?.id).toBe(id);}
 for(const active of ['player','bot']){
  await fixture(active);if(media){const cards=(await game(guest)).customCards;expect(cards.some(c=>c.editor?.animation==='frost'&&c.editor?.sound?.duration===5000)).toBe(true);}
  const actor=active==='player'?host:guest,observer=active==='player'?guest:host,g=await game(actor);
  await Promise.all([host,guest].map(p=>p.evaluate(()=>window.castRoomTrace=[])));
  await actor.evaluate(uid=>window.castRoom.action({type:'play',uid,target:'hero'}),g.player.hand[0].uid);
  await expect.poll(async()=>(await game(actor)).bot.health,{timeout:20000}).toBe(27);await expect.poll(async()=>(await game(observer)).player.health,{timeout:20000}).toBe(27);
  const a=await actor.evaluate(()=>window.castRoomTrace),o=await observer.evaluate(()=>window.castRoomTrace),h=active==='player'?a:o;
  const ac=a.find(x=>x.cast),oc=o.find(x=>x.cast),hc=h.find(x=>x.cast),hr=h.find(x=>!x.cast&&(x.own===27||x.foe===27));
  expect(ac.cast.side).toBe('player');expect(oc.cast.side).toBe('bot');expect(ac.foe).toBe(30);expect(oc.own).toBe(30);expect(ac.mana).toBe(10);expect(oc.enemyMana).toBe(10);expect(hr.at).toBeGreaterThanOrEqual(hc.cast.endsAt);
  expect((await game(actor)).player.mana).toBe(8);expect((await game(observer)).bot.mana).toBe(8);expect((await game(actor)).casting).toBeUndefined();expect((await game(observer)).casting).toBeUndefined();
 }
 await fixture('player');const g=await game(host);await host.evaluate(uid=>window.castRoom.action({type:'play',uid}),g.player.hand[1].uid);await expect.poll(async()=>(await game(host)).player.board.length).toBe(1);await expect.poll(async()=>(await game(guest)).bot.board.length).toBe(1);
 await host.waitForTimeout(1700);expect((await game(host)).player.board).toHaveLength(1);expect((await game(guest)).bot.board).toHaveLength(1);
 if(media)console.log('PASS: selected frost animation and a full 5-second sound survive the real room handshake, encrypted transfer and both seats.');
 expect(errors).toEqual([]);console.log('PASS: real private WSS match, protocol 11, both seats broadcast casting before effects, authoritative 1500ms resolution, private hands, synchronized mana/damage and exactly one minion.');
}finally{for(const c of contexts){for(const p of c.pages())await p.evaluate(()=>window.castRoom?.close(false)).catch(()=>{});await c.close();}await browser.close();}
