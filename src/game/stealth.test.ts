import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD } from './cards';
import { act, chooseBotAction, createGame, legalTargets, other, type Game, type Side, type Minion } from './engine';
import { copyCardTemplate } from './custom-presets';
import { newRule, normalizeCustomCard } from './custom-schema';
import { packForCards, registerCardPack } from './custom-cards';
import { loadGame } from '../storage';
import { roomGameView, validRoomView } from '../online/protocol';
function setup(side: Side='player'){
 const g=createGame(undefined,602,undefined,undefined,{player:'cat',bot:'cat'});g.active=side;
 for(const p of [g.player,g.bot])Object.assign(p,{health:30,armor:0,mana:10,maxMana:10,hand:[],board:[],deck:['regular']});return g;
}
function body(g:Game,side:Side,id:string):Minion{const c=CARD[id];const m:Minion={id,uid:g.nextUid++,attack:c.attack!,health:c.health!,maxHealth:c.health!,ready:true,taunt:!!c.taunt,cannotAttack:!!c.cannotAttack,stealth:!!c.stealth,silenced:false,ephemeral:false};g[side].board.push(m);return m;}
function play(g:Game,side:Side,id:string,target?:number){const uid=g.nextUid++;g[side].hand.push({id,uid});return act(g,side,{type:'play',uid,target});}
afterEach(()=>vi.unstubAllGlobals());
describe.each<Side>(['player','bot'])('stealth for %s',side=>{
 it('plays a class-cat epic 4-mana 4/5 in stealth and blocks enemy chosen targets while allowing friendly targeting',()=>{
  const r=play(setup(side),side,'meowster');expect(r.error).toBeUndefined();const g=r.state,m=g[side].board[0];expect(m).toMatchObject({attack:4,health:5,ready:false,stealth:true});expect(g[side].mana).toBe(6);
  expect(CARD.meowster).toMatchObject({heroClass:'cat',rarity:'epic',tribe:'Мяу'});expect(legalTargets(g,'silence')).toContain(m.uid);
  g.active=other(side);g[other(side)].power='spark';m.taunt=true;
  for(const type of ['attack','bolt','silence','spark','masik'] as const)expect(legalTargets(g,type)).not.toContain(m.uid);
  expect(legalTargets(g,'attack')).toContain('hero');expect(act(g,other(side),{type:'power',target:m.uid}).error).toBeTruthy();
 });
 it('reveals on its first attack, hits every enemy minion once, and leaves heroes and friendly minions untouched',()=>{
  const g=setup(side),m=body(g,side,'meowster');body(g,side,'regular');const tank=body(g,other(side),'guardian');body(g,other(side),'regular');
  const r=act(g,side,{type:'attack',uid:m.uid,target:tank.uid});expect(r.error).toBeUndefined();expect(r.state[side].board.find(x=>x.uid===m.uid)?.stealth).toBe(false);
  expect(r.state[other(side)].board.map(x=>x.health)).toEqual([1,1]);expect(r.state[side].board.find(x=>x.id==='regular')?.health).toBe(2);
  expect(r.state[other(side)].health).toBe(30);expect(r.state.events.filter(e=>e.cardId==='meowster'&&e.kind==='damage'&&e.amount===1)).toHaveLength(2);
  let next=act(r.state,side,{type:'end'}).state;next=act(next,other(side),{type:'end'}).state;
  const second=act(next,side,{type:'attack',uid:m.uid,target:tank.uid}).state;expect(second[other(side)].board.find(x=>x.id==='regular')?.health).toBe(1);
 });
 it('resolves the exit effect even if the revealed attacker dies during combat',()=>{
  const g=setup(side),m=body(g,side,'meowster');m.health=1;const guard=body(g,other(side),'guardian');body(g,other(side),'regular');
  const done=act(g,side,{type:'attack',uid:m.uid,target:guard.uid}).state;expect(done[side].board).toHaveLength(0);expect(done[other(side)].board.map(x=>x.health)).toEqual([1,1]);
 });
 it('allows area damage to hit a hidden minion without revealing it, and silence removes both stealth and its exit ability',()=>{
  const g=setup(other(side)),hidden=body(g,side,'meowster'),attacker=body(g,other(side),'meowster');
  const area=act(g,other(side),{type:'attack',uid:attacker.uid,target:'hero'}).state;expect(area[side].board[0]).toMatchObject({stealth:true,health:4});
  area.active=side;area[side].mana=10;const muted=play(area,side,'silence',hidden.uid).state;
  expect(muted[side].board[0]).toMatchObject({stealth:false,silenced:true});expect(muted[other(side)].board[0].health).toBe(5);
 });
 it('preserves stealth in saved and private multiplayer views',()=>{
  const g=setup(side);body(g,side,'meowster');vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify(g)});expect(loadGame()?.[side].board[0].stealth).toBe(true);
  for(const view of ['player','bot'] as const)expect(validRoomView(roomGameView(g,view))).toBe(true);
 });
});
it('supports the new keyword and reveal rule in editor templates; damage abilities reveal their source only once',()=>{
 const c=copyCardTemplate(CARD.meowster);c.editor!.rules.push({...newRule(),trigger:'play',operation:'damage',target:'enemyHero',amount:1});registerCardPack([c]);
 expect(normalizeCustomCard({...c,kind:'hero'})).toBeNull();expect(c.stealth).toBe(true);expect(c.editor?.rules[0].trigger).toBe('reveal');const g=setup();g.customCards=packForCards([c.id]);body(g,'bot','regular');
 const done=play(g,'player',c.id).state;expect(done.player.board[0].stealth).toBe(false);expect(done.bot.health).toBe(29);expect(done.bot.board[0].health).toBe(1);
 expect(done.log.filter(e=>e.text.includes('выходит из маскировки'))).toHaveLength(1);
});
it('lets the bot cast damage at a legal target when the opposing minion is hidden',()=>{
 const g=setup('bot');g.bot.power='spark';const hidden=body(g,'player','meowster');hidden.health=1;g.bot.hand=[{id:'bolt',uid:g.nextUid++}];
 const action=chooseBotAction(g);expect(action).toMatchObject({type:'play',target:'hero'});expect(act(g,'bot',action).error).toBeUndefined();
});
