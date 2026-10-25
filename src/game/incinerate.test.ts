import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD, STARTER_DECK, cardAbilities, classDeck, deckError } from './cards';
import { act, chooseBotAction, createGame, legalTargets, other, type Game, type Minion, type Side } from './engine';
import { copyCardTemplate } from './custom-presets';
import { registerCardPack, packForCards } from './custom-cards';
import { loadGame } from '../storage';
import { roomGameView, validRoomView } from '../online/protocol';

function setup(side: Side = 'player') {
  const g=createGame(undefined,737);g.active=side;
  for(const p of [g.player,g.bot]) Object.assign(p,{health:30,armor:0,mana:10,maxMana:10,hand:[],board:[],deck:['regular','regular']});
  return g;
}
function give(g: Game,side: Side,id: string){const uid=g.nextUid++;g[side].hand.push({id,uid});return uid;}
function body(g: Game,side: Side,id='regular',health=CARD[id].health!): Minion {
 const c=CARD[id],m:Minion={id,uid:g.nextUid++,attack:c.attack!,health,maxHealth:c.health!,ready:true,taunt:!!c.taunt,cannotAttack:!!c.cannotAttack,silenced:false,ephemeral:false,enteredTurn:g.turn-1};g[side].board.push(m);return m;
}
function start(g: Game,side: Side,id='incinerate-quest'){return act(g,side,{type:'play',uid:give(g,side,id)}).state;}
// Resolve actual minion deaths through the normal action pipeline.
function casualties(g: Game,acting: Side,own: number,enemy: number){
 for(let n=0;n<own;n++)body(g,acting,'regular',0);for(let n=0;n<enemy;n++)body(g,other(acting),'regular',0);
 return act(g,acting,{type:'power',target:'hero'}).state;
}
afterEach(()=>vi.unstubAllGlobals());
describe.each<Side>(['player','bot'])('incineration and T-34 for %s',side=>{
 it('guarantees the quest first in the opening hand and never puts the reward in a legal deck',()=>{
  const deck=classDeck(STARTER_DECK,'mage').map(id=>id==='rash-quest'?'incinerate-quest':id);expect(deckError(deck)).toBeUndefined();
  const g=createGame(deck,24,deck,30_000);expect(g.player.hand[0].id).toBe('incinerate-quest');expect(g.bot.hand[0].id).toBe('incinerate-quest');
  expect(deckError(deck.map(id=>id==='incinerate-quest'?'t34':id))).toBeTruthy();expect(CARD.t34.reward).toBe(true);
 });
 it('counts only enemy deaths after activation, including tokens, and awards exactly one T-34 at twelve',()=>{
  let g=setup(side);g=casualties(g,side,0,1);g[side].powerUsed=false;g=start(g,side);
  expect(g[side].quest?.progress).toBe(0);
  g=casualties(g,side,2,0);expect(g[side].quest?.progress).toBe(0);g[side].powerUsed=false;
  for(let n=0;n<11;n++)body(g,other(side),n===10?'paper':'regular',0);
  g=act(g,side,{type:'power',target:'hero'}).state;expect(g[side].quest?.progress).toBe(11);expect(g[side].hand.some(c=>c.id==='t34')).toBe(false);
  g[side].powerUsed=false;g=casualties(g,side,1,1);expect(g[side].quest).toBeUndefined();expect(g[side].hand.filter(c=>c.id==='t34')).toHaveLength(1);
  g[side].powerUsed=false;g=casualties(g,side,0,1);expect(g[side].hand.filter(c=>c.id==='t34')).toHaveLength(1);
 });
 it('counts the opponent losing their own minions during their turn, without counting our simultaneous deaths',()=>{
  let g=start(setup(side),side);g.active=other(side);g=casualties(g,other(side),2,3);
  expect(g[side].quest?.progress).toBe(2);
 });
 it('keeps progress 11/12 across saving and both multiplayer views, and burns a reward at ten cards',()=>{
  let g=start(setup(side),side);g[side].quest!.progress=11;
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify(g)});expect(loadGame()?.[side].quest?.progress).toBe(11);
  for(const viewer of ['player','bot'] as const)expect(validRoomView(roomGameView(g,viewer))).toBe(true);
  for(let n=0;n<10;n++)give(g,side,'regular');g=casualties(g,side,0,1);
  expect(g[side].quest).toBeUndefined();expect(g[side].hand).toHaveLength(10);expect(g[side].hand.some(c=>c.id==='t34')).toBe(false);
  expect(g.log.some(l=>l.text.includes('Т-34')&&l.text.includes('сгорает'))).toBe(true);
 });
 it('plays a 7-mana 8/9 tank that cannot attack and shoots eight at the enemy on its owner’s end turn',()=>{
  const g=setup(side);const r=act(g,side,{type:'play',uid:give(g,side,'t34')});expect(r.error).toBeUndefined();
  const tank=r.state[side].board[0];expect(tank).toMatchObject({attack:8,health:9,cannotAttack:true});expect(r.state[side].mana).toBe(3);tank.ready=true;expect(act(r.state,side,{type:'attack',uid:tank.uid,target:'hero'}).error).toContain('не может атаковать');
  r.state[other(side)].armor=3;const done=act(r.state,side,{type:'end'}).state;
  expect(done[other(side)].health).toBe(25);expect(done[other(side)].armor).toBe(0);expect(done[side].health).toBe(30);
  expect(done.events).toContainEqual(expect.objectContaining({kind:'damage',amount:8,target:{side:other(side),uid:'hero'}}));
  expect(done.log.some(l=>l.actor?.id==='t34'&&l.target?.side===other(side)&&l.amount===8)).toBe(true);
  const next=act(done,other(side),{type:'end'}).state;expect(next[other(side)].health).toBe(25);
 });
 it('chooses one enemy character, ignores taunt for the shot, and stops firing after silence or death',()=>{
  const g=setup(side);const tank=body(g,side,'t34');body(g,other(side),'guardian');
  const shot=act(g,side,{type:'end'}).state;expect(shot.events.filter(e=>e.kind==='damage'&&e.amount===8&&e.side===side)).toHaveLength(1);
  const s=setup(side);const muted=body(s,side,'t34');const silenced=act(s,side,{type:'play',uid:give(s,side,'silence'),target:muted.uid}).state;
  expect(silenced[side].board[0].cannotAttack).toBe(false);expect(legalTargets(silenced,'attack',muted.uid)).toContain('hero');
  expect(act(silenced,side,{type:'end'}).state[other(side)].health).toBe(30);
  const dead=setup(side);body(dead,side,'t34',0);expect(act(dead,side,{type:'end'}).state[other(side)].health).toBe(30);expect(tank.uid).toBeGreaterThan(0);
 });
});
it('lets the bot activate the quest and keeps copied templates functional and explicitly enemy-only',()=>{
 const g=setup('bot');give(g,'bot','incinerate-quest');const q=act(g,'bot',chooseBotAction(g)).state;expect(q.bot.quest).toMatchObject({id:'incinerate-quest',progress:0});
 const quest=copyCardTemplate(CARD['incinerate-quest']),reward=copyCardTemplate(CARD.t34);registerCardPack([quest,reward]);
 expect(quest.editor?.quest?.filter.side).toBe('enemy');expect(quest.text).toContain('противника');expect(quest.abilities).toBeUndefined();
 const c=setup();c.customCards=packForCards([quest.id,reward.id]);const active=start(c,'player',quest.id);expect(active.player.quest?.id).toBe(quest.id);expect(cardAbilities(reward)?.rules[0]).toMatchObject({trigger:'turnEnd',amount:8});
});
