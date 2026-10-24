import { describe, expect, it } from 'vitest';
import { BOT_DECK, CARD, COLLECTIBLE, STARTER_DECK, deckError } from './cards';
import { act, cardCost, chooseBotAction, createGame, legalTargets, other, powerCost, type Game, type Minion, type Side } from './engine';

function creature(g: Game, side: Side, id: string): Minion {
  const c = CARD[id];
  const m: Minion = { id, uid: g.nextUid++, attack: c.attack!, health: c.health!, maxHealth: c.health!, ready: true,
    taunt: !!c.taunt, cannotAttack: !!c.cannotAttack, silenced: false, ephemeral: c.effect === 'deathwing', origin: 'summoned' };
  g[side].board.push(m); return m;
}
function setup(side: Side) {
  const g = createGame(undefined, 77); g.active = side; g.rng = 0;
  for (const s of ['player', 'bot'] as Side[]) {
    g[s].mana = g[s].maxMana = 10; g[s].hand = []; g[s].board = [];
    g[s].deck = ['zhanna', 'regular', 'zhanna', 'regular', 'zhanna', 'regular', 'regular', 'regular', 'regular', 'regular'];
  }
  g[side].health = 17; g[side].armor = 7; g[other(side)].health = 28; g[other(side)].armor = 0;
  return g;
}
it('both supplied decks obey the same size and copy rules', () => {
  expect(deckError(STARTER_DECK)).toBeUndefined(); expect(deckError(BOT_DECK)).toBeUndefined();
});
describe.each<Side>(['player', 'bot'])('effect contract for %s', side => {
  it.each(COLLECTIBLE.map(c => [c.id, c.name]))('%s / %s applies its actual card rules', id => {
    const g = setup(side), foe = other(side), c = CARD[id];
    const target = creature(g, foe, 'guardian');
    if (id === 'deathwing' || id === 'volunteer') { creature(g, side, 'rash'); creature(g, foe, 'rash'); }
    if (id === 'maxim') { creature(g, side, 'zhanna'); creature(g, foe, 'zhanna'); g[foe].hand = [{ id: 'zhanna', uid: g.nextUid++ }]; }
    if (id === 'jaina') g.rashDeaths = 2;
    const echoAlly = id === 'echo-maxim' ? creature(g, side, 'regular') : undefined;
    const uid = g.nextUid++; g[side].hand = [{ id, uid }];
    if (id === 'deathwing' || id === 'me') g[side].hand.push({ id: 'heal', uid: g.nextUid++ });
    if (id === 'maxim') g[side].hand.push({ id: 'zhanna', uid: g.nextUid++ });
    const before = structuredClone(g);
    const result = act(g, side, { type: 'play', uid, target: echoAlly?.uid ?? (['bolt', 'silence', 'dog-spell', 'masik'].includes(id) ? target.uid : undefined) });
    expect(result.error).toBeUndefined();
    expect(g).toEqual(before);
    const n = result.state, p = n[side], e = n[foe];
    expect(p.mana).toBe(10 - cardCost(before, id));
    expect(n.log.some(l => l.kind === 'play' && l.actor?.id === id && l.side === side)).toBe(true);
    const body = p.board.find(m => m.id === id);
    if (c.kind === 'minion' && id !== 'volunteer') {
      expect(body).toMatchObject({ attack: c.attack! + (c.auraAttack ?? 0), health: c.health, ready: !!(c.charge || c.rush), origin: 'played' });
    }
    if (!c.effect) {
      expect(p.health).toBe(17); expect(e.health).toBe(28); expect(n.winner).toBeNull();
      if (id === 'ruslan') expect(body?.cannotAttack).toBe(true);
      if (c.taunt) expect(body?.taunt).toBe(true);
    }
    const checks: Record<string, () => void> = {
      galinka: () => { expect(p.board.find(m => m.id === 'pushkin')).toMatchObject({ attack: 15, health: 15, taunt: true, origin: 'summoned' }); },
      goodgame: () => { expect(p.health).toBe(0); expect(p.armor).toBe(7); expect(n.winner).toBe(foe); expect(n.log.find(l => l.kind === 'finish')?.target?.side).toBe(side); },
      casino: () => { expect(p.deck.length + e.deck.length).toBe(15); expect([p.deck.length, e.deck.length].sort((a, b) => a - b)).toEqual([5, 10]); },
      trachukcha: () => { expect(p).toMatchObject({ hero: 'trachukcha', armor: 57, health: 17, power: 'fool', powerUsed: false }); },
      maratik: () => { expect(p).toMatchObject({ hero: 'maratik', armor: 27, health: 17, power: 'oy', powerUsed: false }); },
      jaina: () => { expect(p).toMatchObject({ hero: 'jaina', armor: 17, health: 17, power: 'rds', powerUsed: false }); },
      me: () => { expect(p.hand).toHaveLength(10); expect(p.hand[0].id).toBe('heal'); expect(p.hand.slice(1).every(h => CARD[h.id].kind === 'minion' && CARD[h.id].rarity === 'legendary')).toBe(true); },
      deathwing: () => { expect(p.board.map(m => m.id)).toEqual(['deathwing']); expect(e.board).toHaveLength(0); expect(p.hand).toHaveLength(0); expect(n.rashDeaths).toBe(2); expect(act(n, side, { type: 'end' }).state[side].board).toHaveLength(0); },
      volunteer: () => { expect(p.board.map(m => m.id)).toEqual(['rash-volunteer', 'rash-volunteer']); expect(p.board.every(m => m.attack === 2 && m.health === 4)).toBe(true); expect(e.board).toHaveLength(0); expect(n.rashDeaths).toBe(2); },
      maxim: () => { expect(p.deck.filter(x => x === 'zhanna')).toHaveLength(0); expect(e.deck.filter(x => x === 'zhanna')).toHaveLength(0); expect(p.deck).toHaveLength(7); expect(e.deck).toHaveLength(7); expect(e.board.map(m => m.id)).toEqual(['guardian', 'zhanna']); expect(p.board.some(m => m.id === 'zhanna')).toBe(true); expect(p.hand[0].id).toBe('zhanna'); expect(e.hand[0].id).toBe('zhanna'); },
      bolt: () => { expect(e.board[0].health).toBe(3); expect(e.health).toBe(28); expect(n.log.find(l => l.actor?.id === 'bolt' && l.amount === 3)?.target?.id).toBe('guardian'); },
      heal: () => { expect(p.health).toBe(22); expect(p.armor).toBe(7); expect(e.health).toBe(28); },
      draw: () => { expect(p.hand).toHaveLength(2); expect(p.deck).toHaveLength(8); },
      silence: () => { expect(e.board[0]).toMatchObject({ taunt: false, silenced: true, attack: 4, health: 6 }); },
      masik: () => { expect(e.board[0]).toMatchObject({ taunt: false, silenced: true }); expect(body).toMatchObject({ charge: true, ready: true, attack: 6, health: 4 }); },
      'paper-army': () => { expect(p.board).toHaveLength(7); expect(e.board).toHaveLength(7); expect(p.board.every(m => m.id === 'paper' && m.attack === 2 && m.health === 2)).toBe(true); expect(e.board.filter(m => m.id === 'paper')).toHaveLength(6); },
      briefing: () => { expect(n.briefing?.remainingTurns).toEqual({ player: 5, bot: 5 }); expect(e.board).toHaveLength(1); expect(p.board).toHaveLength(0); expect(n.log.some(l => l.text.includes('Взять карту'))).toBe(true); },
      'rash-quest': () => { expect(p.quest).toEqual({ id: 'rash-quest', progress: 0 }); },
      'echo-maxim': () => { expect(p.board[0].attack).toBe(2); expect(p.hand[0]).toMatchObject({ id: 'echo-maxim', expiresTurn: g.turn }); expect(e.health).toBe(26); },
      'jaina-volunteer': () => { expect(p.board.find(m => m.id === 'rds-helper')).toMatchObject({ attack: 0, health: 2, taunt: true, ready: false }); },
      dragonslayer: () => { expect(e.health).toBe(24); expect(p.health).toBe(17); expect(n.log.find(l => l.actor?.id === id && l.amount === 4)?.target?.side).toBe(foe); },
      'dog-spell': () => {
        expect(n.discovery).toMatchObject({ side, sourceId: id, target: target.uid });
        expect(p.deck).toEqual(before[side].deck); expect(e.board[0].health).toBe(6);
        const chosen = n.discovery!.options[0];
        const completed = act(n, side, { type: 'discover', cardId: chosen });
        expect(completed.error).toBeUndefined(); expect(completed.state[side].hand[0].id).toBe(chosen);
        expect(completed.state[side].deck).toEqual(before[side].deck); expect(completed.state[foe].board[0].health).toBe(2);
      },
    };
    if (c.effect) { expect(checks[id], `No audited contract for ${id}`).toBeDefined(); checks[id](); }
  });

  it.each(['spark', 'fool', 'oy', 'rds'] as const)('%s hero power has the correct effect and cost', power => {
    const g = setup(side), foe = other(side); const target = creature(g, foe, 'guardian'); g[side].power = power;
    const n = act(g, side, { type: 'power', target: power === 'spark' ? target.uid : undefined });
    expect(n.error).toBeUndefined();
    expect(n.state[side].mana).toBe(10 - powerCost(power)); expect(n.state[side].powerUsed).toBe(true);
    expect(act(n.state, side, { type: 'power', target: 'hero' }).error).toBeTruthy();
    const p = n.state[side], e = n.state[foe];
    if (power === 'spark') { expect(e.board[0].health).toBe(5); expect(n.state.log.at(-1)?.actor?.id).toBe('spark-power'); }
    if (power === 'oy') { expect(p.hand.map(h => h.id)).toEqual(['deathwing']); expect(e.board[0].id).toBe('guardian'); }
    if (power === 'rds') expect(p.board[0]).toMatchObject({ id: 'rash', attack: 2, health: 5, origin: 'summoned', createdBy: 'rds-power' });
    if (power === 'fool') {
      expect(e.board[0]).toMatchObject({ id: 'regular', attack: 1, health: 2, origin: 'transformed' });
      expect(e.health).toBe(28); expect(n.state.winner).toBeNull();
      expect(n.state.log.find(l => l.kind === 'transform')).toMatchObject({ actor: { id: 'fool-power', type: 'power' }, target: { id: 'guardian' }, result: { id: 'regular' } });
    }
  });

  it('does not apply battlecries to transformed or generated cards', () => {
    const g = setup(side), foe = other(side); g[side].power = 'fool'; g.rng = 1; creature(g, foe, 'guardian');
    const transformed = act(g, side, { type: 'power' }).state;
    expect(transformed[foe].board.map(m => m.id)).toEqual(['jaina-volunteer']); expect(transformed.winner).toBeNull();
    transformed.active = foe; transformed[foe].hand.push({ id: 'goodgame', uid: transformed.nextUid++ });
    const actualPlay = act(transformed, foe, { type: 'play', uid: transformed[foe].hand[0].uid }).state;
    expect(actualPlay[foe].health).toBe(0); expect(actualPlay.winner).toBe(side);
  });

  it('rejects a token or hero power in hand without consuming resources', () => {
    const g = setup(side); const uid = g.nextUid++; g[side].hand = [{ id: 'rash', uid }];
    expect(act(g, side, { type: 'play', uid }).error).toBeTruthy(); expect(g[side].mana).toBe(10);
    g[side].hand[0].id = 'oy'; expect(act(g, side, { type: 'play', uid }).error).toBeTruthy();
  });
  it('respects the seven-unit limit for Галинка and Сила РДШ without claiming a summon happened', () => {
    const g = setup(side); for (let i = 0; i < 6; i++) creature(g, side, 'regular');
    const uid = g.nextUid++; g[side].hand = [{ id: 'galinka', uid }];
    const n = act(g, side, { type: 'play', uid }).state;
    expect(n[side].board).toHaveLength(7); expect(n[side].board.some(m => m.id === 'pushkin')).toBe(false);
    expect(n.log.some(l => l.text.includes('Пушкин не призван'))).toBe(true);
    n[side].power = 'rds'; n[side].mana = 10;
    const rejected = act(n, side, { type: 'power' }); expect(rejected.error).toBeTruthy(); expect(rejected.state[side].mana).toBe(10);
  });
  it('preserves nine existing cards when Я fills the last slot and rejects Ой at the hand cap', () => {
    const g = setup(side); const uid = g.nextUid++;
    g[side].hand = [{ id: 'me', uid }, ...Array.from({ length: 9 }, () => ({ id: 'heal', uid: g.nextUid++ }))];
    const n = act(g, side, { type: 'play', uid }).state;
    expect(n[side].hand).toHaveLength(10); expect(n[side].hand.filter(h => h.id === 'heal')).toHaveLength(9);
    n[side].power = 'oy'; n[side].mana = 10;
    expect(act(n, side, { type: 'power' }).error).toBeTruthy(); expect(n[side].mana).toBe(10);
  });
  it('silences an opposing Русланчик for either player', () => {
    const g = setup(side); const target = creature(g, other(side), 'ruslan'); const uid = g.nextUid++;
    g[side].hand = [{ id: 'silence', uid }];
    const n = act(g, side, { type: 'play', uid, target: target.uid }).state;
    expect(n[other(side)].board[0]).toMatchObject({ silenced: true, cannotAttack: false, attack: 10, health: 10 });
  });
  it('silences a friendly sleeping Deathwing and preserves it at the end of the turn', () => {
    const g = setup(side); const target = creature(g, side, 'deathwing'); target.ready = false;
    const enemy = creature(g, other(side), 'guardian');
    expect(legalTargets(g, 'silence')).toEqual([target.uid, enemy.uid]);
    const uid = g.nextUid++; g[side].hand = [{ id: 'silence', uid }]; const before = structuredClone(g);
    const result = act(g, side, { type: 'play', uid, target: target.uid });
    expect(result.error).toBeUndefined(); expect(g).toEqual(before);
    const n = result.state;
    expect(n[side].board[0]).toMatchObject({ silenced: true, ephemeral: false, ready: false, attack: 1, health: 1 });
    expect(n[other(side)].board[0]).toMatchObject({ silenced: false, taunt: true, health: 6 });
    expect(n[side].mana).toBe(9);
    expect(n.events.find(e => e.cardId === 'silence')).toMatchObject({ kind: 'spell', side, target: { side, uid: target.uid } });
    expect(n.log.at(-1)).toMatchObject({ actor: { id: 'silence', side }, target: { id: 'deathwing', side } });
    expect(act(n, side, { type: 'end' }).state[side].board.some(m => m.uid === target.uid)).toBe(true);
  });
  it('removes a friendly Vasiliy aura and taunt without silencing the opponent', () => {
    const g = setup(side); const cat = creature(g, side, 'vasiliy'); creature(g, side, 'regular');
    creature(g, other(side), 'guardian'); const uid = g.nextUid++; g[side].hand = [{ id: 'silence', uid }];
    const result = act(g, side, { type: 'play', uid, target: cat.uid });
    expect(result.error).toBeUndefined();
    expect(result.state[side].board.map(m => m.attack)).toEqual([4, 1]);
    expect(result.state[side].board[0]).toMatchObject({ taunt: false, silenced: true, auraBonus: 0 });
    expect(result.state[other(side)].board[0]).toMatchObject({ silenced: false, taunt: true, attack: 4 });
  });
  it('silences a friendly Ruslan and lets him attack for 10 damage', () => {
    const g = setup(side); const target = creature(g, side, 'ruslan'); const uid = g.nextUid++;
    g[side].hand = [{ id: 'silence', uid }];
    const result = act(g, side, { type: 'play', uid, target: target.uid });
    expect(result.error).toBeUndefined();
    expect(result.state[side].board[0]).toMatchObject({ silenced: true, cannotAttack: false, attack: 10 });
    expect(result.state.log.at(-1)?.target?.side).toBe(side);
    const attack = act(result.state, side, { type: 'attack', uid: target.uid, target: 'hero' });
    expect(attack.error).toBeUndefined(); expect(attack.state[other(side)].health).toBe(18);
  });
  it('does not grant a newly summoned Руслан an immediate attack when silenced', () => {
    const g = setup(side); const target = creature(g, side, 'ruslan'); target.ready = false;
    const uid = g.nextUid++; g[side].hand = [{ id: 'silence', uid }];
    const n = act(g, side, { type: 'play', uid, target: target.uid }).state;
    expect(n[side].board[0]).toMatchObject({ silenced: true, cannotAttack: false, ready: false });
    expect(act(n, side, { type: 'attack', uid: target.uid, target: 'hero' }).error).toBeTruthy();
    const turn2 = act(n, side, { type: 'end' }).state;
    const turn3 = act(turn2, other(side), { type: 'end' }).state;
    expect(act(turn3, side, { type: 'attack', uid: target.uid, target: 'hero' }).error).toBeUndefined();
  });
  it('continues to reject friendly targets for damage spells, attacks and hero power', () => {
    const g = setup(side); const friend = creature(g, side, 'mage'); const attacker = creature(g, side, 'dragon');
    for (const id of ['bolt', 'dog-spell']) {
      const uid = g.nextUid++; g[side].hand = [{ id, uid }];
      const result = act(g, side, { type: 'play', uid, target: friend.uid });
      expect(result.error).toBeTruthy(); expect(result.state).toBe(g);
    }
    expect(act(g, side, { type: 'power', target: friend.uid }).error).toBeTruthy();
    expect(act(g, side, { type: 'attack', uid: attacker.uid, target: friend.uid }).error).toBeTruthy();
    expect(g[side].mana).toBe(10); expect(friend.health).toBe(4);
  });
  it('stops a two-card draw at lethal fatigue for the acting side', () => {
    const g = setup(side); g[side].deck = []; g[side].health = 1; g[side].armor = 0;
    const uid = g.nextUid++; g[side].hand = [{ id: 'draw', uid }];
    const n = act(g, side, { type: 'play', uid }).state;
    expect(n.winner).toBe(other(side)); expect(n[side].fatigue).toBe(1); expect(n[side].health).toBe(0);
  });
  it('applies spells and hero damage to the opposing hero, with armor and lethal resolution', () => {
    const g = setup(side); const foe = other(side); g[foe].health = 2; g[foe].armor = 2;
    const uid = g.nextUid++; g[side].hand = [{ id: 'bolt', uid }];
    const n = act(g, side, { type: 'play', uid, target: 'hero' }).state;
    expect(n[foe]).toMatchObject({ health: 1, armor: 0 }); expect(n.winner).toBeNull();
    const lethal = act(n, side, { type: 'power', target: 'hero' }).state;
    expect(lethal.winner).toBe(side); expect(lethal[foe].health).toBe(0);
  });
});

it('the bot can use Тихий час on its own Deathwing to prevent its disappearance', () => {
  const g = setup('bot'); const target = creature(g, 'bot', 'deathwing');
  const uid = g.nextUid++; g.bot.hand = [{ id: 'silence', uid }];
  const action = chooseBotAction(g);
  expect(action).toEqual({ type: 'play', uid, target: target.uid });
  const result = act(g, 'bot', action);
  expect(result.error).toBeUndefined(); expect(result.state.bot.board[0].ephemeral).toBe(false);
  expect(act(result.state, 'bot', { type: 'end' }).state.bot.board[0].id).toBe('deathwing');
});

it('the bot silences its ready Русланчик and then uses him for lethal damage', () => {
  const g = setup('bot'); const ruslan = creature(g, 'bot', 'ruslan'); g.player.health = 10;
  const uid = g.nextUid++; g.bot.hand = [{ id: 'silence', uid }];
  const action = chooseBotAction(g);
  expect(action).toEqual({ type: 'play', uid, target: ruslan.uid });
  const silenced = act(g, 'bot', action).state;
  const attack = chooseBotAction(silenced);
  expect(attack).toEqual({ type: 'attack', uid: ruslan.uid, target: 'hero' });
  expect(act(silenced, 'bot', attack).state.winner).toBe('bot');
});

it('the bot avoids freeing an opposing Русланчик with no harmful abilities to remove', () => {
  const g = setup('bot'); creature(g, 'player', 'ruslan'); const uid = g.nextUid++;
  g.bot.hand = [{ id: 'silence', uid }];
  const action = chooseBotAction(g);
  expect(action.type === 'play' && action.uid === uid).toBe(false);
});
