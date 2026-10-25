import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD, deckCopyLimit } from './cards';
import { act, chooseBotAction, createGame, other, type Game, type Minion, type Side } from './engine';
import { newCustomCard, packForCards, registerCardPack } from './custom-cards';
import { copyCardTemplate } from './custom-presets';
import { newRule } from './custom-schema';
import { roomGameView, validRoomView } from '../online/protocol';
import { loadGame } from '../storage';
function setup(side:Side='player'){
 const g=createGame(undefined,618,undefined,undefined,{player:'cat',bot:'cat'});g.active=side;g.log=[];g.nextLog=1;g.events=[];
 for(const p of [g.player,g.bot])Object.assign(p,{health:30,armor:0,mana:10,maxMana:10,hand:[],board:[],deck:['regular','heal']});return g;
}
function give(g:Game,side:Side,id:string){const uid=g.nextUid++;g[side].hand.push({id,uid});return uid;}
function body(g:Game,side:Side,id='tigerra'):Minion{const c=CARD[id],m:Minion={id,uid:g.nextUid++,attack:c.attack!,health:c.health!,maxHealth:c.health!,ready:true,taunt:!!c.taunt,cannotAttack:!!c.cannotAttack,silenced:false,ephemeral:false};g[side].board.push(m);return m;}
function kill(g:Game,owner:Side,target=g[owner].board[0].uid){const foe=other(owner);g.active=foe;const m=body(g,foe,'regular');m.attack=3;m.health=m.maxHealth=10;return act(g,foe,{type:'attack',uid:m.uid,target});}
afterEach(()=>vi.unstubAllGlobals());
describe.each<Side>(['player','bot'])('Tigerra owned by %s',side=>{
 it('plays a 6-mana 6/3, deals exactly three to the enemy hero through armor, and can win with the battlecry',()=>{
  const g=setup(side);g[other(side)].health=2;g[other(side)].armor=1;
  const r=act(g,side,{type:'play',uid:give(g,side,'tigerra')});expect(r.error).toBeUndefined();expect(r.state[side].mana).toBe(4);expect(r.state[side].board[0]).toMatchObject({id:'tigerra',attack:6,health:3,ready:false});
  expect(r.state[other(side)].armor).toBe(0);expect(r.state.winner).toBe(side);expect(r.state[side].health).toBe(30);
 });
 it('triggers off turn with zero mana, a used/silenced hero power and no discovery prompt, without changing those resources',()=>{
  const g=setup(side);body(g,side);Object.assign(g[side],{mana:0,powerUsed:true,powerSilenceTurns:2});const before=structuredClone(g[side].deck);
  const r=kill(g,side);expect(r.error).toBeUndefined();expect(r.state.active).toBe(other(side));
  expect(r.state[side]).toMatchObject({health:27,mana:0,powerUsed:true,powerSilenceTurns:2,power:'clawFury'});expect(r.state.discovery).toBeUndefined();expect(r.state[side].deck).toEqual(before);
  expect(r.state[side].hand).toHaveLength(1);const c=CARD[r.state[side].hand[0].id];expect(c.cost).toBe(3);expect(!c.heroClass||c.heroClass==='cat').toBe(true);
  expect(r.state.events).toContainEqual(expect.objectContaining({kind:'power',side,cardId:'claw-fury'}));expect(r.state.events).toContainEqual(expect.objectContaining({kind:'damage',amount:3,target:{side,uid:'hero'}}));
  expect(g[side].hand).toHaveLength(0);
 });
 it('respects armor and full hands while still applying the self damage',()=>{
  const g=setup(side);body(g,side);g[side].armor=2;for(let n=0;n<10;n++)give(g,side,'regular');
  const r=kill(g,side).state;expect(r[side].hand).toHaveLength(10);expect(r[side]).toMatchObject({health:29,armor:0});expect(r.log.some(l=>l.kind==='discard')).toBe(true);expect(r.log.some(l=>l.kind==='discover'&&l.text.includes('сгорает'))).toBe(true);
 });
 it('can defeat its own hero, and a silenced Tigerra has no deathrattle',()=>{
  const lethal=setup(side);body(lethal,side);lethal[side].health=3;expect(kill(lethal,side).state.winner).toBe(other(side));
  const g=setup(side),m=body(g,side);const muted=act(g,side,{type:'play',uid:give(g,side,'silence'),target:m.uid}).state;const r=kill(muted,side).state;
  expect(r[side].health).toBe(30);expect(r[side].hand).toHaveLength(0);expect(r.events.some(e=>e.kind==='power'&&e.cardId==='claw-fury')).toBe(false);
 });
 it('keeps a temporarily replaced power and resolves two simultaneous deathrattles deterministically',()=>{
  const g=setup(side);body(g,side).health=0;body(g,side).health=0;const attacker=body(g,side,'regular');g.briefing={remainingTurns:{player:5,bot:5}};
  const action={type:'attack' as const,uid:attacker.uid,target:'hero' as const};const r=act(g,side,action);expect(r.error).toBeUndefined();expect(r.state).toEqual(act(g,side,action).state);
  expect(r.state[side].hand.map(c=>CARD[c.id].cost)).toEqual([3,3]);expect(r.state[side].health).toBe(24);expect(r.state[side].power).toBe('clawFury');expect(r.state.briefing).toEqual(g.briefing);expect(r.state.discovery).toBeUndefined();
 });
 it('persists the result and hides the generated card in the opponent’s multiplayer view',()=>{
  const g=setup(side);body(g,side);const r=kill(g,side).state,chosen=r[side].hand[0].id;
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify(r)});expect(loadGame()?.[side].hand[0].id).toBe(chosen);
  const own=roomGameView(r,side),enemy=roomGameView(r,other(side));expect(validRoomView(own)).toBe(true);expect(validRoomView(enemy)).toBe(true);
  expect(own.log.find(l=>l.kind==='discover')?.target?.id).toBe(chosen);expect(enemy.log.find(l=>l.kind==='discover')?.target).toBeUndefined();expect(enemy.bot.hand[0].id).toBe('hidden');
 });
});
it('is an epic cat class card with the existing two-copy deck limit and works for the bot',()=>{
 expect(CARD.tigerra).toMatchObject({heroClass:'cat',cost:6,attack:6,health:3,rarity:'epic',tribe:'Мяу'});expect(deckCopyLimit(CARD.tigerra)).toBe(2);
 const g=setup('bot');give(g,'bot','tigerra');const r=act(g,'bot',chooseBotAction(g));expect(r.error).toBeUndefined();expect(r.state.player.health).toBe(27);expect(r.state.bot.board[0].id).toBe('tigerra');
});
it('preserves both abilities when copied into the editor',()=>{
 const c=copyCardTemplate(CARD.tigerra);registerCardPack([c]);expect(c.text).toContain('Боевой клич');expect(c.text).toContain('Предсмертный хрип');expect(c.deathrattle).toBe('clawFuryThree');
 const g=setup();g.customCards=packForCards([c.id]);const played=act(g,'player',{type:'play',uid:give(g,'player',c.id)}).state;expect(played.bot.health).toBe(27);
 const r=kill(played,'player').state;expect(r.player.health).toBe(27);expect(r.player.hand).toHaveLength(1);expect(CARD[r.player.hand[0].id].cost).toBe(3);
});
it('summoning Tigerra triggers no battlecry and does not replace an existing discovery when it dies',()=>{
 const summoner=newCustomCard();summoner.kind='spell';delete summoner.attack;delete summoner.health;summoner.editor!.rules=[{...newRule(),operation:'summon',target:'ownHero',cardId:'tigerra'}];registerCardPack([summoner]);
 const g=setup();g.customCards=packForCards([summoner.id]);const summoned=act(g,'player',{type:'play',uid:give(g,'player',summoner.id)}).state;expect(summoned.bot.health).toBe(30);expect(summoned.player.board[0].id).toBe('tigerra');
 summoned.player.board[0].health=0;const r=act(summoned,'player',{type:'play',uid:give(summoned,'player','dog-spell'),target:'hero'}).state;
 expect(r.discovery?.sourceId).toBe('dog-spell');expect(r.player.hand).toHaveLength(1);expect(CARD[r.player.hand[0].id].cost).toBe(3);expect(r.player.health).toBe(27);
});
