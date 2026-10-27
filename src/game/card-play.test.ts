import { afterEach, expect, it, vi } from 'vitest';
import { CARD, type CardDef } from './cards';
import { act, createGame, type Game, type Minion } from './engine';
import { CARD_PLAY_MS, resolveCast, stageAction, validCast } from './card-play';
import { loadGame } from '../storage';
import { roomGameView, validRoomView } from '../online/protocol';
import { newCustomCard, registerCardPack } from './custom-cards';
import { newRule } from './custom-schema';

function setup() {
  const g = createGame(undefined,123); g.active='player';g.turn=1;g.events=[];g.log=[];
  for(const p of [g.player,g.bot])Object.assign(p,{mana:10,maxMana:10,board:[],hand:[],deck:['regular','regular']});
  g.player.hand=[{id:'bolt',uid:g.nextUid++},{id:'regular',uid:g.nextUid++}];return g;
}
function body(g:Game,id='regular',patch:Partial<Minion>={}) {
  const c=CARD[id]; const m:Minion={id,uid:g.nextUid++,attack:c.attack!,health:1,maxHealth:c.health!,ready:true,taunt:false,cannotAttack:false,silenced:false,ephemeral:false,...patch};g.bot.board.push(m);return m;
}
afterEach(()=>vi.unstubAllGlobals());

it('applies a spell, its cost and metrics only after the entire 1500ms cast',()=>{
  const g=setup(),uid=g.player.hand[0].uid,t=10000;
  const cast=stageAction(g,'player',{type:'play',uid,target:'hero'},t);
  expect(cast.error).toBeUndefined();expect(cast.state.casting).toMatchObject({startedAt:t,endsAt:t+CARD_PLAY_MS,cardId:'bolt'});
  expect(cast.state.bot.health).toBe(30);expect(cast.state.player.mana).toBe(10);expect(cast.state.player.hand).toHaveLength(2);expect(cast.state.events).toEqual([]);
  expect(resolveCast(cast.state,t+1499)).toBe(cast.state);
  const resolved=resolveCast(cast.state,t+1500),direct=act(g,'player',{type:'play',uid,target:'hero'}).state;
  expect(resolved).toEqual(direct);expect(resolved.casting).toBeUndefined();expect(resolveCast(resolved,t+9999)).toBe(resolved);
});
it('delays minion entry and its battlecry, with no summon until the deadline',()=>{
  const g=setup();g.player.hand[0].id='tigerra';const uid=g.player.hand[0].uid;
  const cast=stageAction(g,'player',{type:'play',uid},10000).state;
  expect(cast.player.board).toEqual([]);expect(cast.bot.health).toBe(30);
  const resolved=resolveCast(cast,11500);expect(resolved.player.board[0].id).toBe('tigerra');expect(resolved.bot.health).toBe(27);
});
it('delays hero replacement, armour and its new power together',()=>{
  const g=setup();g.player.hand[0].id='trachukcha';const cast=stageAction(g,'player',{type:'play',uid:g.player.hand[0].uid},10000).state;
  expect(cast.player.hero).toBe(g.player.hero);expect(cast.player.armor).toBe(0);expect(cast.player.power).toBe('spark');
  const resolved=resolveCast(cast,11500);expect(resolved.player.hero).toBe('trachukcha');expect(resolved.player.armor).toBe(50);expect(resolved.player.power).not.toBe('spark');
});
it('delays targeted powers and blocks all other commands, while allowing concede',()=>{
  const g=setup(),cast=stageAction(g,'player',{type:'power',target:'hero'},10000).state;
  expect(cast.player.powerUsed).toBe(false);expect(cast.bot.health).toBe(30);
  for(const action of [{type:'end'},{type:'play',uid:g.player.hand[1].uid},{type:'power',target:'hero'}] as const)expect(stageAction(cast,'player',action,10500).error).toBeTruthy();
  const resigned=stageAction(cast,'player',{type:'concede'},10500).state;expect(resigned.winner).toBe('bot');expect(resigned.casting).toBeUndefined();expect(resolveCast(resigned,12000).bot.health).toBe(30);
  const resolved=resolveCast(cast,11500);expect(resolved.bot.health).toBe(29);expect(resolved.player.mana).toBe(8);expect(resolved.player.powerUsed).toBe(true);
});
it('rejects invalid targets or insufficient mana immediately without starting an animation',()=>{
  const g=setup();expect(stageAction(g,'player',{type:'play',uid:g.player.hand[0].uid,target:9999},10000)).toMatchObject({state:g,error:expect.any(String)});
  g.player.mana=0;expect(stageAction(g,'player',{type:'play',uid:g.player.hand[0].uid,target:'hero'},10000).error).toBeTruthy();expect(g.casting).toBeUndefined();
});
it('persists a pending cast and resumes exactly once after reloading',()=>{
  const g=setup(),cast=stageAction(g,'player',{type:'play',uid:g.player.hand[1].uid},10000).state;
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify(cast)});
  const loaded=loadGame()!;expect(loaded.casting).toEqual(cast.casting);expect(loaded.player.board).toHaveLength(0);
  const resolved=resolveCast(loaded,12000);expect(resolved.player.board).toHaveLength(1);expect(resolveCast(resolved,13000).player.board).toHaveLength(1);
});
it('projects a cast to both seats without exposing the rest of the opponent hand',()=>{
  const g=setup(),cast=stageAction(g,'player',{type:'play',uid:g.player.hand[0].uid,target:'hero'},10000).state;
  for(const side of ['player','bot'] as const){const view=roomGameView(cast,side);expect(validRoomView(view)).toBe(true);expect(view.casting?.side).toBe(side==='player'?'player':'bot');expect(view.casting?.cardId).toBe('bolt');expect(view.bot.hand.every(h=>h.id==='hidden')).toBe(true);}
});
it('validates cast duration, owner, source and pending choice exclusivity',()=>{
  const g=stageAction(setup(),'player',{type:'power',target:'hero'},10000).state;
  expect(validCast(g,g.casting)).toBe(true);
  for(const patch of [{endsAt:11499},{side:'bot'},{cardId:'regular'},{startedAt:NaN},{action:{type:'end'}}])expect(validCast(g,{...g.casting,...patch})).toBe(false);
  expect(validCast({...g,winner:'player'},g.casting)).toBe(false);
});
it('opens adaptation only after the played card has completed its entrance',()=>{
  const g=setup(),c:CardDef={...newCustomCard(),cost:0,adapt:true};registerCardPack([c]);g.customCards=[c];g.player.hand[0].id=c.id;
  const cast=stageAction(g,'player',{type:'play',uid:g.player.hand[0].uid},10000).state;expect(cast.adaptation).toBeUndefined();expect(resolveCast(cast,11500).adaptation?.options).toHaveLength(3);
});
it('marks deathrattle deaths, but not ordinary or silenced deaths',()=>{
  for(const [id,silenced,wanted] of [['tigerra',false,true],['tigerra',true,false],['regular',false,false]] as const){const g=setup(),m=body(g,id,{silenced});const result=act(g,'player',{type:'play',uid:g.player.hand[0].uid,target:m.uid}).state;expect(result.events.find(e=>e.kind==='death')?.deathrattle).toBe(wanted);}
});
it('marks Living Spores and declarative deathrattles, including a deathrattle gained after silence',()=>{
  const c:CardDef={...newCustomCard(),cost:0};c.editor!.rules=[{...newRule(),trigger:'death',operation:'summon',target:'ownHero',cardId:'adapt-plant'}];registerCardPack([c]);
  for(const [id,patch] of [[c.id,{}],['regular',{silenced:true,adaptSpores:1}]] as const){const g=setup();g.customCards=[c];const m=body(g,id,patch);const result=act(g,'player',{type:'play',uid:g.player.hand[0].uid,target:m.uid}).state;expect(result.events.find(e=>e.kind==='death')?.deathrattle).toBe(true);}
});
it('keeps every death marker from a full-board wave with token deathrattles',()=>{
  const g=setup(),c:CardDef={...newCustomCard(),kind:'spell',attack:undefined,health:undefined,cost:0};c.editor!.rules=[{...newRule(),operation:'damage',target:'allMinions',amount:99}];registerCardPack([c]);g.customCards=[c];g.player.hand[0].id=c.id;
  for(let n=0;n<7;n++){body(g,'slime');const m=body(g,'slime');g.bot.board.pop();g.player.board.push(m);}
  const result=act(g,'player',{type:'play',uid:g.player.hand[0].uid}).state;
  expect(result.events.filter(e=>e.kind==='death'&&e.deathrattle)).toHaveLength(14);expect(validRoomView(roomGameView(result,'player'))).toBe(true);
});
