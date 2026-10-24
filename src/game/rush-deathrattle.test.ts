import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { CARD, CARDS } from './cards';
import { act, chooseBotAction, createGame, legalTargets, other, type Game, type Minion, type Side, type Target } from './engine';
import { loadGame } from '../storage';
import { ORIGINAL_ART } from '../original-art';

function setup(side: Side = 'player') {
  const g = createGame(undefined, 741); g.active = side;
  for (const owner of ['player', 'bot'] as const) {
    g[owner].hand = []; g[owner].board = []; g[owner].mana = g[owner].maxMana = 10;
    g[owner].deck = Array(25).fill('regular');
  }
  return g;
}
function unit(g: Game, side: Side, id: string) {
  const c = CARD[id]; const m: Minion = { id, uid: g.nextUid++, attack: c.attack!, health: c.health!, maxHealth: c.health!,
    ready: true, taunt: !!c.taunt, cannotAttack: !!c.cannotAttack, silenced: false, ephemeral: false,
    rush: !!c.rush, charge: !!c.charge, enteredTurn: g.turn - 1 };
  g[side].board.push(m); return m;
}
function play(g: Game, side: Side, id: string, target?: Target) {
  const uid = g.nextUid++; g[side].hand.push({ id, uid });
  const result = act(g, side, { type: 'play', uid, target }); expect(result.error).toBeUndefined();
  return result.state;
}
describe.each<Side>(['player', 'bot'])('rush and deathrattle controlled by %s', side => {
  it('rush attacks an enemy minion immediately but cannot attack the hero', () => {
    const g = setup(side), foe = other(side); const defender = unit(g, foe, 'regular');
    const n = play(g, side, 'jaina-rusher'), rusher = n[side].board[0];
    expect(rusher).toMatchObject({ attack: 5, health: 1, rush: true, ready: true, enteredTurn: g.turn });
    expect(legalTargets(n, 'attack', rusher.uid)).toEqual([defender.uid]);
    const rejected = act(n, side, { type: 'attack', uid: rusher.uid, target: 'hero' });
    expect(rejected.error).toContain('Натиск'); expect(rejected.state).toBe(n);
    const trade = act(n, side, { type: 'attack', uid: rusher.uid, target: defender.uid });
    expect(trade.error).toBeUndefined(); expect(trade.state[foe].board).toHaveLength(0);
    expect(trade.state[side].board).toHaveLength(1); expect(trade.state[side].board[0]).toMatchObject({ id: 'rds-guard', attack: 1, health: 3, taunt: true, ready: false, createdBy: 'jaina-rusher' });
  });
  it('rush observes taunt, then can attack a hero after its next turn begins', () => {
    const g = setup(side), foe = other(side); const taunt = unit(g, foe, 'bouncer'); const weak = unit(g, foe, 'regular');
    let n = play(g, side, 'jaina-rusher'); const uid = n[side].board[0].uid;
    expect(legalTargets(n, 'attack', uid)).toEqual([taunt.uid]);
    expect(act(n, side, { type: 'attack', uid, target: weak.uid }).error).toBeTruthy();
    n[foe].board = []; n = act(n, side, { type: 'end' }).state; n = act(n, foe, { type: 'end' }).state;
    const hit = act(n, side, { type: 'attack', uid, target: 'hero' }); expect(hit.error).toBeUndefined(); expect(hit.state[foe].health).toBe(25);
    expect(act(hit.state, side, { type: 'attack', uid, target: 'hero' }).error).toBeTruthy();
  });
  it('silence removes fresh rush and its deathrattle without granting a hero attack', () => {
    let n = play(setup(side), side, 'jaina-rusher'); const uid = n[side].board[0].uid;
    n = play(n, side, 'silence', uid);
    expect(n[side].board[0]).toMatchObject({ rush: false, ready: false, silenced: true });
    expect(act(n, side, { type: 'attack', uid, target: 'hero' }).error).toBeTruthy();
    n = play(n, side, 'deathwing'); expect(n[side].board.map(m => m.id)).toEqual(['deathwing']);
    expect(n.log.some(l => l.text.startsWith('Предсмертный хрип'))).toBe(false);
  });
  it('silencing an older rushed minion preserves its normal attack readiness', () => {
    const g = setup(side); const rusher = unit(g, side, 'jaina-rusher');
    const n = play(g, side, 'silence', rusher.uid);
    expect(n[side].board[0]).toMatchObject({ rush: false, ready: true, silenced: true });
    expect(act(n, side, { type: 'attack', uid: rusher.uid, target: 'hero' }).error).toBeUndefined();
  });
  it('the volunteer summons a sleeping 0/2 taunt and advances only its owner quest', () => {
    const g = setup(side); g[side].quest = { id: 'rash-quest', progress: 2 }; g[other(side)].quest = { id: 'rash-quest', progress: 6 };
    const n = play(g, side, 'jaina-volunteer'); expect(n[side].mana).toBe(9);
    expect(n[side].board).toHaveLength(2); expect(n[side].board[1]).toMatchObject({ id: 'rds-helper', attack: 0, health: 2, taunt: true, ready: false, origin: 'summoned' });
    expect(n[side].quest?.progress).toBe(3); expect(n[other(side)].quest?.progress).toBe(6);
    expect(n.log.some(l => l.actor?.id === 'jaina-volunteer' && l.target?.id === 'rds-helper')).toBe(true);
  });
  it('a seventh-slot volunteer or a volunteer during briefing has no room for its token', () => {
    for (const limit of [false, true]) {
      const g = setup(side); if (limit) g.briefing = { remainingTurns: { player: 5, bot: 5 } };
      else for (let i = 0; i < 6; i++) unit(g, side, 'regular');
      const n = play(g, side, 'jaina-volunteer'); expect(n[side].board).toHaveLength(limit ? 1 : 7);
      expect(n[side].board.some(m => m.id === 'rds-helper')).toBe(false);
      expect(n.log.at(-1)?.text).toContain('нет места');
    }
  });
  it('a dead rusher frees the only slot during briefing, and the guard advances the quest', () => {
    const g = setup(side), foe = other(side); g.briefing = { remainingTurns: { player: 5, bot: 5 } }; g[side].quest = { id: 'rash-quest', progress: 7 };
    unit(g, foe, 'bouncer');
    let n = play(g, side, 'jaina-rusher'); const uid = n[side].board[0].uid;
    n = act(n, side, { type: 'attack', uid, target: n[foe].board[0].uid }).state;
    expect(n[side].board).toHaveLength(1); expect(n[side].board[0].id).toBe('rds-guard');
    expect(n[side].quest).toBeUndefined(); expect(n[side].hand.some(h => h.id === 'volunteer')).toBe(true);
  });
  it('mass destruction processes every deathrattle after both sides have lost their old minions', () => {
    const g = setup(side), foe = other(side); unit(g, side, 'jaina-rusher'); unit(g, foe, 'jaina-rusher'); unit(g, foe, 'regular');
    const n = play(g, side, 'deathwing');
    expect(n[side].board.map(m => m.id)).toEqual(['deathwing', 'rds-guard']); expect(n[foe].board.map(m => m.id)).toEqual(['rds-guard']);
    expect(n.log.filter(l => l.text.startsWith('Предсмертный хрип'))).toHaveLength(2);
    expect(n.log.findIndex(l => l.text.startsWith('Предсмертный хрип'))).toBeGreaterThan(n.log.map(l => l.kind).lastIndexOf('death'));
    expect(n.events.filter(e => e.kind === 'spell' && e.cardId === 'jaina-rusher').map(e => e.side).sort()).toEqual(['bot', 'player']);
  });
  it('deathrattles never overfill the board when other summons already occupy slots', () => {
    const g = setup(side); for (let i = 0; i < 6; i++) unit(g, side, 'jaina-rusher');
    const n = play(g, side, 'volunteer'); expect(n[side].board).toHaveLength(7);
    expect(n[side].board.filter(m => m.id === 'rds-guard')).toHaveLength(5);
    expect(n.log.filter(l => l.text.includes('Предсмертный хрип') && l.text.includes('нет места'))).toHaveLength(1);
  });
  it('the new RDS tokens count toward the assassin discount on death and obey taunt at zero attack', () => {
    const g = setup(side), foe = other(side); const token = unit(g, foe, 'rds-helper'); const attacker = unit(g, side, 'regular'); unit(g, foe, 'rds-guard');
    expect(legalTargets(g, 'attack', attacker.uid)).not.toContain('hero');
    token.health = 1; const n = act(g, side, { type: 'attack', uid: attacker.uid, target: token.uid }).state;
    expect(n.rashDeaths).toBe(1); expect(n[side].board[0].health).toBe(2);
    expect(n[foe].board).toHaveLength(1);
  });
  it('Maxim scout removes both new Zhanna creatures only from decks', () => {
    const g = setup(side); for (const owner of [side, other(side)]) { g[owner].deck = ['jaina-rusher', 'regular', 'jaina-volunteer']; unit(g, owner, 'jaina-rusher'); }
    const n = play(g, side, 'maxim'); expect(n.player.deck).toEqual(['regular']); expect(n.bot.deck).toEqual(['regular']);
    expect(n.player.board.some(m => m.id === 'jaina-rusher')).toBe(true); expect(n.bot.board.some(m => m.id === 'jaina-rusher')).toBe(true);
  });
});
it('bot rushes a minion instead of attempting an illegal immediate hero attack', () => {
  const g = setup('bot'); unit(g, 'player', 'regular');
  const n = play(g, 'bot', 'jaina-rusher'); n.bot.mana = 0;
  const action = chooseBotAction(n); expect(action).toEqual({ type: 'attack', uid: n.bot.board[0].uid, target: n.player.board[0].uid });
  expect(act(n, 'bot', action).error).toBeUndefined();
});
it('bot with a fresh rusher and no enemies cannot count rush as lethal hero damage', () => {
  const g = setup('bot'); g.player.health = 5;
  const n = play(g, 'bot', 'jaina-rusher'); n.bot.mana = 0;
  expect(chooseBotAction(n)).toEqual({ type: 'end' });
});
it('saved old RDS history is renamed while preserving the match and attack abilities', () => {
  const g = setup(); const old = 'Р' + 'АШ'; const m = unit(g, 'player', 'jaina-rusher'); delete m.rush;
  g.log.push({ id: g.nextLog++, side: 'player', text: `Призывает ${old} 2/5.`, actor: { type: 'card', id: 'rash', art: 10, name: old, side: 'player' } });
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(g) });
  try {
    const loaded = loadGame()!; expect(loaded.id).toBe(g.id); expect(loaded.log.at(-1)?.text).toBe('Призывает РДШ 2/5.');
    expect(loaded.log.at(-1)?.actor?.name).toBe('РДШ'); expect(loaded.player.board[0].rush).toBe(true);
  } finally { vi.unstubAllGlobals(); }
});
it('every custom card now has bundled artwork and all atlas files exist', () => {
  for (const card of CARDS.filter(c => c.custom)) {
    expect(ORIGINAL_ART[card.id], `Missing illustration for ${card.id}`).toBeDefined();
    expect(existsSync(`public/${ORIGINAL_ART[card.id].path}`)).toBe(true);
  }
});
