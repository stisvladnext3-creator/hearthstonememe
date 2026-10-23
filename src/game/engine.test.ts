import { describe, expect, it } from 'vitest';
import { CARD, STARTER_DECK, deckError } from './cards';
import { act, chooseBotAction, createGame, legalTargets, type Game, type Minion, type Side } from './engine';

function fixture() {
  const g = createGame(STARTER_DECK, 42);
  g.player.mana = g.player.maxMana = 10;
  g.bot.mana = g.bot.maxMana = 10;
  g.player.hand = []; g.bot.hand = [];
  return g;
}
function hand(g: Game, id: string, side: Side = 'player') {
  const uid = g.nextUid++;
  g[side].hand.push({ uid, id });
  return uid;
}
function unit(g: Game, id: string, side: Side = 'player'): Minion {
  const c = CARD[id];
  const m: Minion = { id, uid: g.nextUid++, attack: c.attack!, health: c.health!, maxHealth: c.health!,
    ready: true, taunt: !!c.taunt, cannotAttack: !!c.cannotAttack, silenced: false, ephemeral: false };
  g[side].board.push(m); return m;
}
function play(g: Game, id: string, target?: number | 'hero') {
  return act(g, 'player', { type: 'play', uid: hand(g, id), target });
}
describe('game setup and rules', () => {
  it('has a legal 30-card starter deck and guaranteed Козиныч in each opening hand', () => {
    expect(STARTER_DECK).toHaveLength(30);
    expect(deckError(STARTER_DECK)).toBeUndefined();
    const g = createGame(STARTER_DECK, 3);
    expect(g.player.hand.map(c => c.id)).toContain('casino');
    expect(g.bot.hand.map(c => c.id)).toContain('casino');
    expect(g.player.deck.length + g.player.hand.length).toBe(30);
    expect(g.bot.deck.length + g.bot.hand.length).toBe(30);
    expect(g.player.mana).toBe(1);
    expect(g.player.health).toBe(30);
  });
  it('is deterministic with a seed and preserves an input on invalid actions', () => {
    expect(createGame(STARTER_DECK, 22)).toEqual(createGame(STARTER_DECK, 22));
    const g = fixture(), before = structuredClone(g);
    const result = act(g, 'player', { type: 'play', uid: -1 });
    expect(result.error).toBeTruthy(); expect(g).toEqual(before); expect(result.state).toBe(g);
  });
  it('validates deck size, unknown cards and copy limits', () => {
    expect(deckError([])).toBeTruthy();
    expect(deckError(Array(30).fill('unknown'))).toBeTruthy();
    expect(deckError(Array(30).fill('galinka'))).toBeTruthy();
    expect(deckError([...STARTER_DECK.slice(0, 29), 'pushkin'])).toBeTruthy();
    expect(createGame(['unknown'], 1).player.deck.every(id => CARD[id])).toBe(true);
  });
  it('pays mana, summons sleeping minions and prevents a same-turn attack', () => {
    const g = fixture();
    const next = play(g, 'goblin').state;
    expect(next.player.mana).toBe(8); expect(next.player.hand).toHaveLength(0);
    const m = next.player.board[0]; expect(m.ready).toBe(false);
    expect(act(next, 'player', { type: 'attack', uid: m.uid, target: 'hero' }).error).toBeTruthy();
    expect(g.player.board).toHaveLength(0);
  });
  it('rejects insufficient mana and a full board without consuming the card', () => {
    const g = fixture(); g.player.mana = 1;
    const uid = hand(g, 'galinka');
    expect(act(g, 'player', { type: 'play', uid }).error).toBeTruthy();
    g.player.mana = 10;
    for (let i = 0; i < 7; i++) unit(g, 'regular');
    expect(act(g, 'player', { type: 'play', uid }).error).toBeTruthy();
    expect(g.player.hand.map(c => c.uid)).toContain(uid);
  });
  it('exchanges combat damage, removes dead units and spends the attack', () => {
    const g = fixture(), attacker = unit(g, 'mage'), defender = unit(g, 'goblin', 'bot');
    const next = act(g, 'player', { type: 'attack', uid: attacker.uid, target: defender.uid }).state;
    expect(next.bot.board).toHaveLength(0); expect(next.player.board[0].health).toBe(1);
    expect(next.player.board[0].ready).toBe(false);
    expect(act(next, 'player', { type: 'attack', uid: attacker.uid, target: 'hero' }).error).toBeTruthy();
  });
  it('enforces taunt for attacks but lets spells and powers bypass it', () => {
    const g = fixture(), attacker = unit(g, 'dragon'), taunt = unit(g, 'bouncer', 'bot');
    expect(legalTargets(g, 'attack')).toEqual([taunt.uid]);
    expect(act(g, 'player', { type: 'attack', uid: attacker.uid, target: 'hero' }).error).toBeTruthy();
    const next = play(g, 'bolt', 'hero').state;
    expect(next.bot.health).toBe(27); expect(next.bot.board).toHaveLength(1);
  });
  it('absorbs damage with armor before health and awards a win', () => {
    const g = fixture(); g.bot.armor = 2; g.bot.health = 1;
    const next = play(g, 'bolt', 'hero').state;
    expect(next.bot.armor).toBe(0); expect(next.bot.health).toBe(0); expect(next.winner).toBe('player');
    expect(act(next, 'player', { type: 'end' }).error).toBeTruthy();
  });
  it('refreshes mana, attacks and power once per own turn', () => {
    const g = fixture(), m = unit(g, 'mage'); g.player.maxMana = 4; g.player.mana = 0;
    m.ready = false; g.player.powerUsed = true;
    const turn2 = act(g, 'player', { type: 'end' }).state;
    const turn3 = act(turn2, 'bot', { type: 'end' }).state;
    expect(turn3.player.mana).toBe(5); expect(turn3.player.maxMana).toBe(5);
    expect(turn3.player.board[0].ready).toBe(true); expect(turn3.player.powerUsed).toBe(false);
    expect(turn3.active).toBe('player');
  });
  it('applies increasing fatigue, including lethal fatigue', () => {
    const g = fixture(); g.bot.deck = []; g.bot.health = 2;
    const first = act(g, 'player', { type: 'end' }).state;
    expect(first.bot.health).toBe(1); expect(first.bot.fatigue).toBe(1);
    const back = act(first, 'bot', { type: 'end' }).state;
    const second = act(back, 'player', { type: 'end' }).state;
    expect(second.bot.fatigue).toBe(2); expect(second.winner).toBe('player');
  });
  it('burns excess cards and limits the hand to ten', () => {
    const g = fixture(); for (let i = 0; i < 10; i++) hand(g, 'regular');
    const before = g.player.deck.length;
    const next = play(g, 'draw').state;
    expect(next.player.hand).toHaveLength(10); expect(next.player.deck).toHaveLength(before - 2);
    expect(next.log.some(l => l.text.includes('сгорает'))).toBe(true);
  });
  it('validates a spell target before charging mana', () => {
    const g = fixture(), uid = hand(g, 'silence');
    const failed = act(g, 'player', { type: 'play', uid, target: 'hero' });
    expect(failed.error).toBeTruthy(); expect(failed.state.player.mana).toBe(10);
    expect(failed.state.player.hand).toHaveLength(1);
  });
  it('allows surrender during the opponent turn', () => {
    const g = fixture(); g.active = 'bot';
    expect(act(g, 'player', { type: 'concede' }).state.winner).toBe('bot');
  });
});
describe('custom meme cards and powers', () => {
  it('Галинка summons a 15/15 Пушкин with taunt and obeys board capacity', () => {
    const g = fixture(), next = play(g, 'galinka').state;
    expect(next.player.board.map(m => m.id)).toEqual(['galinka', 'pushkin']);
    expect(next.player.board.every(m => m.taunt)).toBe(true);
    expect(next.player.board[1].attack).toBe(15); expect(next.player.board[1].health).toBe(15);
    const full = fixture(); for (let i = 0; i < 6; i++) unit(full, 'regular');
    expect(play(full, 'galinka').state.player.board).toHaveLength(7);
  });
  it('Хорошая игра destroys its own hero even with armor', () => {
    const g = fixture(); g.player.armor = 99;
    const next = play(g, 'goodgame').state;
    expect(next.winner).toBe('bot'); expect(next.player.board[0].attack).toBe(99);
  });
  it('Русланчик cannot attack and is immune to silence', () => {
    const g = fixture(), ruslan = unit(g, 'ruslan', 'bot');
    const next = play(g, 'silence', ruslan.uid).state;
    expect(next.bot.board[0].silenced).toBe(false); expect(next.bot.board[0].cannotAttack).toBe(true);
    next.active = 'bot';
    expect(act(next, 'bot', { type: 'attack', uid: ruslan.uid, target: 'hero' }).error).toBeTruthy();
    expect(next.bot.board[0].attack).toBe(10);
  });
  it('silence removes taunt and cancels Смертокрыл end-of-turn destruction', () => {
    const g = fixture(), m = unit(g, 'bouncer', 'bot');
    expect(play(g, 'silence', m.uid).state.bot.board[0].taunt).toBe(false);
    const d = fixture(), dragon = unit(d, 'deathwing', 'bot'); dragon.ephemeral = true;
    const silenced = play(d, 'silence', dragon.uid).state;
    expect(silenced.bot.board[0].ephemeral).toBe(false);
    silenced.active = 'bot';
    expect(act(silenced, 'bot', { type: 'end' }).state.bot.board).toHaveLength(1);
  });
  it('Козиныч has both random outcomes and destroys half of one random deck', () => {
    let hit = 0, miss = 0, playerHit = 0, botHit = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const g = fixture(); g.rng = seed; g.player.deck = Array(15).fill('regular'); g.bot.deck = Array(13).fill('regular');
      const next = play(g, 'casino').state;
      const lost = 28 - next.player.deck.length - next.bot.deck.length;
      if (lost) { hit++; expect([6, 7]).toContain(lost); }
      else miss++;
      if (next.player.deck.length < 15) playerHit++;
      if (next.bot.deck.length < 13) botHit++;
    }
    expect(hit).toBeGreaterThan(30); expect(miss).toBeGreaterThan(30);
    expect(playerHit).toBeGreaterThan(0); expect(botHit).toBeGreaterThan(0);
  });
  it('Трачукча is free, grants 99 armor and replaces the power', () => {
    const next = play(fixture(), 'trachukcha').state;
    expect(next.player.armor).toBe(99); expect(next.player.mana).toBe(10);
    expect(next.player.power).toBe('fool'); expect(next.player.hero).toBe('trachukcha');
    const powered = act(next, 'player', { type: 'power' }).state;
    expect(powered.player.hand).toHaveLength(1); expect(powered.player.armor).toBe(97); expect(powered.player.mana).toBe(8);
    expect(act(powered, 'player', { type: 'power' }).error).toBeTruthy();
  });
  it('Я fills the hand with legendary minions only', () => {
    const next = play(fixture(), 'me').state;
    expect(next.player.hand).toHaveLength(10);
    expect(next.player.hand.every(c => CARD[c.id].rarity === 'legendary' && CARD[c.id].kind === 'minion')).toBe(true);
    expect(next.player.board[0].attack).toBe(5); expect(next.player.board[0].health).toBe(7);
  });
  it('Смертокрыл wipes both boards except itself, discards the hand, then dies', () => {
    const g = fixture(); unit(g, 'mage'); unit(g, 'bouncer', 'bot'); hand(g, 'me');
    const next = play(g, 'deathwing').state;
    expect(next.bot.board).toHaveLength(0); expect(next.player.hand).toHaveLength(0);
    expect(next.player.board.map(c => c.id)).toEqual(['deathwing']);
    expect(next.player.board[0].attack).toBe(1); expect(next.player.board[0].health).toBe(1);
    expect(act(next, 'player', { type: 'end' }).state.player.board).toHaveLength(0);
  });
  it('Маратик grants armor and Ой creates a playable Смертокрыл 1/1', () => {
    const next = play(fixture(), 'maratik').state;
    expect(next.player.power).toBe('oy'); expect(next.player.armor).toBe(5);
    next.player.mana = 10;
    const powered = act(next, 'player', { type: 'power' }).state;
    expect(powered.player.mana).toBe(4); expect(powered.player.hand.map(c => c.id)).toEqual(['deathwing']);
    powered.player.mana = 10;
    const body = act(powered, 'player', { type: 'play', uid: powered.player.hand[0].uid }).state.player.board[0];
    expect(body.attack).toBe(1); expect(body.health).toBe(1);
  });
  it('Ой cannot consume mana with a full hand', () => {
    const g = fixture(); g.player.power = 'oy'; for (let i = 0; i < 10; i++) hand(g, 'regular');
    expect(act(g, 'player', { type: 'power' }).error).toBeTruthy(); expect(g.player.mana).toBe(10);
  });
});
describe('bot and complete games', () => {
  it('never intentionally plays the suicide card', () => {
    const g = fixture(); g.active = 'bot'; const uid = hand(g, 'goodgame', 'bot');
    const chosen = chooseBotAction(g);
    expect(chosen.type === 'play' && chosen.uid === uid).toBe(false);
  });
  it('completes 25 seeded matches using legal actions, within resource limits', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let g = createGame(STARTER_DECK, seed);
      let steps = 0;
      while (!g.winner && steps < 1200) {
        const side = g.active;
        const view = side === 'bot' ? g : { ...g, active: 'bot' as const, player: g.bot, bot: g.player };
        const action = chooseBotAction(view);
        const result = act(g, side, action);
        expect(result.error, `seed ${seed}, action ${JSON.stringify(action)}`).toBeUndefined();
        g = result.state;
        for (const p of [g.player, g.bot]) {
          expect(p.hand.length).toBeLessThanOrEqual(10); expect(p.board.length).toBeLessThanOrEqual(7);
          expect(p.mana).toBeGreaterThanOrEqual(0); expect(p.mana).toBeLessThanOrEqual(10);
        }
        steps++;
      }
      expect(g.winner, `seed ${seed} did not finish after ${steps} actions`).not.toBeNull();
    }
  });
});
