import { expect,it } from 'vitest';
import { createGame } from './engine';
import { stageAction, resolveCast } from './card-play';
import { BattleTimeline } from './battle-timeline';
const fixture=()=>{const g=createGame(undefined,3);g.active='player';g.player.mana=g.player.maxMana=10;g.player.hand=[{id:'bolt',uid:g.nextUid++}];return g;};
it('shows an entire 1500ms entrance even if a late network burst contains its result already',()=>{
 const g=fixture(),stage=stageAction(g,'player',{type:'play',uid:g.player.hand[0].uid,target:'hero'},1000).state,result=resolveCast(stage,2500),t=new BattleTimeline(g,4000);
 t.push(stage,5000);t.push(result,5010);expect(t.game.bot.health).toBe(30);expect(t.game.casting?.startedAt).toBe(5000);t.advance(6499);expect(t.game.bot.health).toBe(30);t.advance(6500);expect(t.game).toBe(result);
});
it('preserves several queued entrances in order without replaying repeated snapshots',()=>{
 const g=fixture();g.player.hand.push({id:'regular',uid:g.nextUid++});const a=stageAction(g,'player',{type:'play',uid:g.player.hand[0].uid,target:'hero'},1000).state,b=resolveCast(a,2500),c=stageAction(b,'player',{type:'play',uid:b.player.hand[0].uid},3000).state,d=resolveCast(c,4500),t=new BattleTimeline(g,1);
 t.push(a,5000);t.push(structuredClone(a),5010);t.push(b,5020);t.push(c,5030);t.push(d,5040);t.advance(6500);expect(t.game.casting?.cardId).toBe('regular');expect(t.game.player.board).toHaveLength(0);t.advance(7999);expect(t.game.player.board).toHaveLength(0);t.advance(8000);expect(t.game).toBe(d);
});
it('resets pending presentation when a new match replaces the old one',()=>{
 const g=fixture(),a=stageAction(g,'player',{type:'play',uid:g.player.hand[0].uid,target:'hero'},1000).state,t=new BattleTimeline(a,2000),fresh=fixture();fresh.id='new-match';t.push(fresh,2010);expect(t.game).toBe(fresh);expect(t.until).toBe(0);
});
