import { describe, expect, it } from 'vitest';
import { CARD } from './cards';
import { act, createGame, other, type Game, type Minion, type Side } from './engine';
import { copyCardTemplate } from './custom-presets';
import { normalizeCustomCard } from './custom-schema';
function setup(side:Side='player'){
 const g=createGame(undefined,508,undefined,undefined,{player:'cat',bot:'cat'});g.active=side;
 for(const p of [g.player,g.bot])Object.assign(p,{health:30,armor:0,mana:10,maxMana:10,hand:[],board:[],deck:['regular']});return g;
}
function body(g:Game,side:Side,id:string,h=12):Minion{const c=CARD[id],m:Minion={id,uid:g.nextUid++,attack:c.attack!,health:h,maxHealth:h,ready:true,taunt:false,cannotAttack:false,stealth:!!c.stealth,silenced:false,ephemeral:false};g[side].board.push(m);return m;}
describe.each<Side>(['player','bot'])('bulky for %s',side=>{
 it('deals full attack to the chosen minion and half to its two immediate neighbors, with only the target retaliating',()=>{
  const g=setup(side),m=body(g,side,'lizard',20),foe=other(side);body(g,foe,'regular');const left=body(g,foe,'regular'),target=body(g,foe,'regular'),right=body(g,foe,'regular');body(g,foe,'regular');target.attack=2;left.attack=right.attack=50;
  const r=act(g,side,{type:'attack',uid:m.uid,target:target.uid});expect(r.error).toBeUndefined();expect(r.state[foe].board.map(c=>c.health)).toEqual([12,9,6,9,12]);expect(r.state[side].board[0].health).toBe(18);expect(r.state[foe].health).toBe(30);
  expect(r.state.log.filter(l=>l.text.startsWith('Громоздкий:'))).toHaveLength(2);
 });
 it('uses the current buffed attack and rounds odd halves up; splash reaches hidden neighbors',()=>{
  const g=setup(side),m=body(g,side,'lizard');m.attack=7;const target=body(g,other(side),'regular');body(g,other(side),'meowster');
  const n=act(g,side,{type:'attack',uid:m.uid,target:target.uid}).state;expect(n[other(side)].board.map(c=>c.health)).toEqual([5,8]);expect(n[other(side)].board[1].stealth).toBe(true);
 });
 it('captures adjacency before the center dies and applies the side damage even when the attacker dies',()=>{
  const g=setup(side),m=body(g,side,'lizard',1);body(g,other(side),'regular',4);const target=body(g,other(side),'regular',1);body(g,other(side),'regular',4);
  const n=act(g,side,{type:'attack',uid:m.uid,target:target.uid}).state;expect(n[side].board).toHaveLength(0);expect(n[other(side)].board.map(c=>c.health)).toEqual([1,1]);
 });
 it('does not splash on hero attacks or after silence',()=>{
  const g=setup(side),m=body(g,side,'lizard');body(g,other(side),'regular');const face=act(g,side,{type:'attack',uid:m.uid,target:'hero'}).state;expect(face[other(side)].health).toBe(24);expect(face[other(side)].board[0].health).toBe(12);
  const s=setup(side),muted=body(s,side,'lizard');muted.silenced=true;const target=body(s,other(side),'regular');body(s,other(side),'regular');const n=act(s,side,{type:'attack',uid:muted.uid,target:target.uid}).state;expect(n[other(side)].board.map(c=>c.health)).toEqual([6,12]);
 });
});
it('adds the keyword to editor templates and preserves the requested card definition',()=>{
 expect(CARD.lizard.heroClass).toBeUndefined();expect(CARD.lizard).toMatchObject({cost:8,attack:6,health:7,rarity:'epic',tribe:'Динозавр',bulky:true});expect(normalizeCustomCard(copyCardTemplate(CARD.lizard))?.bulky).toBe(true);
});
