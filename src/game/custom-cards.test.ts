import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD, CARDS, STARTER_DECK, classDeck, deckError, type CardDef } from './cards';
import { abilityTargets, act, cardCost, chooseBotAction, createGame, legalTargets, other, powerCost, targetNeeded, type Game, type Side, type Target } from './engine';
import { describeCustomCard, newCustomCard, packForCards, registerCardPack, restoreCustomCards, saveCustomLibrary, userCards, validateCardPack } from './custom-cards';
import { newRule, type CustomRule } from './custom-schema';
import { copyCardTemplate, rdsExample } from './custom-presets';
import { createRoomGame, roomGameView, validRoomView } from '../online/protocol';
import { loadGame } from '../storage';

function make(patch: Partial<CardDef> = {}, rules: Partial<CustomRule>[] = []) {
  const c = { ...newCustomCard(), cost: 0, ...patch };
  c.editor!.rules = rules.map(r => ({ ...newRule(), ...r }));
  c.text = describeCustomCard(c); return c;
}
function setup(side: Side, cards: CardDef[]) {
  registerCardPack(cards);
  const g = createGame(undefined, 79); g.active = side; g.customCards = packForCards(cards.map(c => c.id));
  for (const owner of ['player', 'bot'] as Side[]) { g[owner].hand = []; g[owner].board = []; g[owner].deck = ['regular', 'bouncer', 'mage']; g[owner].mana = g[owner].maxMana = 10; }
  return g;
}
function play(g: Game, side: Side, card: CardDef | string, target?: Target) {
  const id = typeof card === 'string' ? card : card.id, uid = g.nextUid++; g[side].hand.push({ uid, id });
  const result = act(g, side, { type: 'play', uid, target }); expect(result.error).toBeUndefined(); return result.state;
}
afterEach(() => vi.unstubAllGlobals());
describe.each<Side>(['player', 'bot'])('custom card runtime for %s', side => {
  it('plays a targeted spell, preserves its input, records the real source, and lets the bot choose the target', () => {
    const spell = make({ kind: 'spell', attack: undefined, health: undefined, name: 'Своя молния' }, [{ target: 'selectedEnemy', amount: 4 }]);
    const g = setup(side, [spell]), uid = g.nextUid++; g[side].hand.push({ id: spell.id, uid });
    const before = structuredClone(g); expect(targetNeeded(g, uid)).toBe(true); expect(abilityTargets(g, uid)).toContain('hero');
    if (side === 'bot') expect(chooseBotAction(g)).toMatchObject({ type: 'play', uid, target: 'hero' });
    expect(act(g, side, { type: 'play', uid, target: 'own-hero' }).error).toBeTruthy();
    const result = act(g, side, { type: 'play', uid, target: 'hero' });
    expect(result.error).toBeUndefined(); expect(result.state[other(side)].health).toBe(26); expect(g).toEqual(before);
    expect(result.state.log.some(e => e.actor?.id === spell.id && e.target?.type === 'hero' && e.amount === 4)).toBe(true);
  });
  it('supports charge, rush, taunt and echo using the ordinary attack rules', () => {
    const charger = make({ charge: true, echo: true, taunt: true }), rusher = make({ rush: true });
    let g = setup(side, [charger, rusher]); g = play(g, side, charger);
    const unit = g[side].board[0]; expect(unit).toMatchObject({ ready: true, charge: true, taunt: true });
    expect(legalTargets(g, 'attack', unit.uid)).toContain('hero'); expect(g[side].hand[0]).toMatchObject({ id: charger.id, expiresTurn: g.turn });
    g = play(g, side, rusher); expect(legalTargets(g, 'attack', g[side].board[1].uid)).not.toContain('hero');
    g = act(g, side, { type: 'end' }).state; expect(g[side].hand.some(c => c.id === charger.id)).toBe(false);
  });
  it('runs custom deathrattles and suppresses them with silence', () => {
    const token = make({ kind: 'token', attack: 0, health: 2, taunt: true });
    const parent = make({ health: 1 }, [{ trigger: 'death', operation: 'summon', target: 'ownHero', cardId: token.id }]);
    const kill = make({ kind: 'spell' }, [{ operation: 'destroy', target: 'selectedMinion' }]);
    let g = setup(side, [token, parent, kill]); g = play(g, side, parent); g = play(g, side, kill, g[side].board[0].uid);
    expect(g[side].board).toMatchObject([{ id: token.id, taunt: true, health: 2 }]);
    g = setup(side, [token, parent, kill]); g = play(g, side, parent); g = play(g, side, 'silence', g[side].board[0].uid); g = play(g, side, kill, g[side].board[0].uid);
    expect(g[side].board).toHaveLength(0);
  });
  it('applies a tag aura to old and new allies and removes it when its source is silenced', () => {
    const token = make({ kind: 'token', tribe: 'Отряд' });
    const aura = make({}, [{ trigger: 'aura', operation: 'buff', target: 'friendlyMinions', targetTag: 'Отряд', amount: 3 }]);
    const caller = make({}, [{ operation: 'summon', target: 'ownHero', cardId: token.id }]);
    let g = setup(side, [token, aura, caller]); g = play(g, side, caller); g = play(g, side, aura); g = play(g, side, caller);
    expect(g[side].board.filter(m => m.id === token.id).map(m => m.attack)).toEqual([5, 5]);
    g = play(g, side, 'silence', g[side].board.find(m => m.id === aura.id)!.uid);
    expect(g[side].board.filter(m => m.id === token.id).map(m => m.attack)).toEqual([2, 2]);
  });
  it('reacts only to matching summons and counts matching deaths on both sides for discounts', () => {
    const token = make({ tribe: 'РДШ', health: 1 });
    const watcher = make({}, [{ trigger: 'summon', operation: 'armor', target: 'ownHero', amount: 2, filter: { side: 'friendly', tag: 'РДШ' } }]);
    const discounted = make({ cost: 8 }); discounted.editor!.discount = { event: 'death', amount: 2, filter: { side: 'any', tag: 'РДШ' } };
    let g = setup(side, [token, watcher, discounted]); g = play(g, side, watcher); g = play(g, side, token); expect(g[side].armor).toBe(2);
    g.active = other(side); g = play(g, other(side), token); expect(g[side].armor).toBe(2);
    g = play(g, other(side), 'bolt', g[side].board.find(m => m.id === token.id)!.uid);
    expect(cardCost(g, discounted.id, side)).toBe(6);
    g.active = side; g = play(g, side, 'bolt', g[other(side)].board[0].uid); expect(cardCost(g, discounted.id, side)).toBe(4);
  });
  it('activates a custom quest after play and gives its reward exactly once', () => {
    const token = make({ kind: 'token', tribe: 'Отряд' }), quest = make({ kind: 'spell' });
    quest.editor!.quest = { event: 'summon', goal: 2, rewardId: 'volunteer', filter: { side: 'friendly', tag: 'Отряд' } }; quest.quest = true;
    const caller = make({}, [{ operation: 'summon', target: 'ownHero', cardId: token.id }]);
    let g = setup(side, [token, quest, caller]); g = play(g, side, caller); g = play(g, side, quest);
    expect(g[side].quest?.progress).toBe(0); g = play(g, side, caller); expect(g[side].quest?.progress).toBe(1);
    g = play(g, side, caller); expect(g[side].quest).toBeUndefined(); expect(g[side].hand.filter(c => c.id === 'volunteer')).toHaveLength(1);
  });
  it('replaces the hero and power, charges the configured mana, and respects two-turn hero silence', () => {
    const power = make({ kind: 'power', cost: 2 }, [{ amount: 3, target: 'selectedEnemy' }]);
    const hero = make({ kind: 'hero', armor: 7 }); hero.editor!.powerId = power.id;
    let g = setup(side, [power, hero]); g[side].health = 13; g = play(g, side, hero);
    expect(g[side]).toMatchObject({ hero: hero.id, power: power.id, armor: 7, health: 13 });
    let result = act(g, side, { type: 'power', target: 'hero' }); expect(result.error).toBeUndefined(); g = result.state;
    expect(g[other(side)].health).toBe(27); expect(g[side].mana).toBe(8); expect(act(g, side, { type: 'power', target: 'hero' }).error).toContain('использована');
    g[side].powerUsed = false; g[side].powerSilenceTurns = 2;
    expect(act(g, side, { type: 'power', target: 'hero' }).error).toContain('немотой');
  });
  it('pauses a custom spell for discovery and executes following effects once after the choice', () => {
    const spell = make({ kind: 'spell' }, [{ operation: 'discover', target: 'ownHero' }, { operation: 'damage', target: 'selectedEnemy', amount: 4 }]);
    let g = setup(side, [spell]); g = play(g, side, spell, 'hero');
    expect(g.discovery?.options).toHaveLength(3); expect(g[other(side)].health).toBe(30);
    expect(validRoomView(roomGameView(g, side))).toBe(true);
    const id = g.discovery!.options[0], result = act(g, side, { type: 'discover', cardId: id });
    expect(result.error).toBeUndefined(); expect(result.state[side].hand.some(c => c.id === id)).toBe(true);
    expect(result.state[other(side)].health).toBe(26); expect(result.state.discovery).toBeUndefined(); expect(result.state[side].deck).toHaveLength(3);
  });
  it('finishes legacy discovery even when a new on-play synergy kills its selected target first', () => {
    const listener = make({}, [{ trigger: 'played', operation: 'damage', target: 'randomEnemyMinion', amount: 99, filter: { side: 'friendly', cardId: 'dog-spell' } }]);
    let g = setup(other(side), [listener]); g = play(g, other(side), 'regular');
    g.active = side; g = play(g, side, listener); const target = g[other(side)].board[0].uid;
    g = play(g, side, 'dog-spell', target); expect(g.discovery).toBeDefined(); expect(g[other(side)].board).toHaveLength(0);
    expect(validRoomView(roomGameView(g, side))).toBe(true);
    const result = act(g, side, { type: 'discover', cardId: g.discovery!.options[0] });
    expect(result.error).toBeUndefined(); expect(result.state.discovery).toBeUndefined(); expect(result.state[side].hand).toHaveLength(1);
  });
  it('uses a board condition and resolves turn effects for their owner', () => {
    const listener = make({}, [{ trigger: 'turnEnd', operation: 'armor', target: 'ownHero', amount: 4, filter: { side: 'friendly' }, condition: { zone: 'board', minimum: 2, filter: { side: 'friendly' } } }]);
    let g = setup(side, [listener]); g = play(g, side, listener); g = act(g, side, { type: 'end' }).state; expect(g[side].armor).toBe(0);
    g.active = side; g = play(g, side, 'regular'); g = act(g, side, { type: 'end' }).state; expect(g[side].armor).toBe(4);
  });
  it('bounds feedback loops and keeps the next action usable', () => {
    const loop = make({}, [{ trigger: 'summon', operation: 'damage', target: 'event', amount: 99, filter: { side: 'friendly' } }, { trigger: 'death', operation: 'summon', target: 'ownHero' }]);
    loop.editor!.rules[1].cardId = loop.id;
    const g = play(setup(side, [loop]), side, loop);
    expect(g.log.some(e => e.text.includes('200 эффектов'))).toBe(true);
    expect(act(g, side, { type: 'end' }).error).toBeUndefined();
  });
  it('draws, generates, shuffles, discards, restores mana and adds armor in rule order', () => {
    const spell = make({ kind: 'spell' }, [{ operation: 'draw', target: 'ownHero' },
      { operation: 'addCard', target: 'ownHero', cardId: 'mage', count: 2 }, { operation: 'shuffle', target: 'ownHero', cardId: 'bouncer', count: 2 },
      { operation: 'discard', target: 'ownHero' }, { operation: 'mana', target: 'ownHero', amount: 5 }, { operation: 'armor', target: 'ownHero', amount: 3 }]);
    let g = setup(side, [spell]); g[side].mana = 3; g = play(g, side, spell);
    expect(g[side].hand.map(c => c.id)).toEqual(['mage', 'mage']); expect(g[side].deck).toHaveLength(4); expect(g[side].mana).toBe(8); expect(g[side].armor).toBe(3);
  });
  it('restores printed stats after silencing permanent buffs and transforms without battlecries or death counts', () => {
    const buff = make({ kind: 'spell' }, [{ operation: 'buff', target: 'selectedMinion', amount: 3, health: 2 }]);
    const transform = make({ kind: 'spell' }, [{ operation: 'transform', target: 'selectedMinion', cardId: 'galinka' }]);
    let g = setup(side, [buff, transform]); g = play(g, side, 'regular'); const uid = g[side].board[0].uid;
    g = play(g, side, buff, uid); expect(g[side].board[0]).toMatchObject({ attack: 4, health: 4, maxHealth: 4 });
    g = play(g, side, 'silence', uid); expect(g[side].board[0]).toMatchObject({ attack: 1, health: 2, maxHealth: 2 });
    g = play(g, side, transform, uid); expect(g[side].board).toMatchObject([{ id: 'galinka', attack: 0, health: 1 }]);
    expect(g.customCounts?.[side].death).toEqual({});
  });
  it('purges marked cards on both sides even on an empty board and replaces a base hero power', () => {
    const spell = make({ kind: 'spell' }, [{ operation: 'purgeDeck', target: 'allMinions', targetTag: 'Жанна' }, { operation: 'replacePower', target: 'ownHero', cardId: 'rds-power' }]);
    let g = setup(side, [spell]); g.player.deck = ['zhanna', 'regular']; g.bot.deck = ['jaina-rusher', 'regular']; g = play(g, side, spell);
    expect(g.player.deck).toEqual(['regular']); expect(g.bot.deck).toEqual(['regular']); expect(g[side].power).toBe('rds');
    const result = act(g, side, { type: 'power' }); expect(result.error).toBeUndefined(); expect(result.state[side].board[0].id).toBe('rash');
  });
  it('applies event discounts to custom powers as well as cards in hand', () => {
    const power = make({ kind: 'power', cost: 6 }, [{ target: 'enemyHero', amount: 1 }]);
    power.editor!.discount = { event: 'play', amount: 2, filter: { side: 'friendly', cardId: 'regular' } };
    let g = setup(side, [power]); g[side].power = power.id; g = play(g, side, 'regular');
    expect(powerCost(power.id, g, side)).toBe(4);
    const before = g[side].mana, result = act(g, side, { type: 'power' }); expect(result.error).toBeUndefined(); expect(result.state[side].mana).toBe(before - 4);
  });
  it('honors edited armor and the selected power when copying an existing hero', () => {
    const hero = copyCardTemplate(CARD.jaina); hero.cost = 0; hero.armor = 23; hero.editor!.powerId = undefined;
    let g = setup(side, [hero]); g[side].power = 'oy'; g = play(g, side, hero);
    expect(g[side]).toMatchObject({ hero: hero.id, armor: 23, power: 'oy' });
    expect(g.log.at(-1)?.target?.id).toBe('oy');
  });
});
describe('custom catalog, saved games and network definitions', () => {
  it('rejects missing references, invalid operations, duplicate ids and replacing base cards', () => {
    const c = make(); expect(() => validateCardPack([{ ...c, id: 'regular' }])).toThrow();
    expect(() => validateCardPack([c, c])).toThrow();
    expect(() => validateCardPack([make({}, [{ operation: 'summon', cardId: 'custom-missing-card' }])])).toThrow();
    expect(() => validateCardPack([make({}, [{ operation: 'eval' as CustomRule['operation'] }])])).toThrow();
    expect(() => validateCardPack([make({ kind: 'power', effect: 'bolt' })])).toThrow();
  });
  it('copies every existing template into a valid, editable definition', () => {
    for (const source of CARDS.filter(c => !c.editor)) {
      const c = copyCardTemplate(source); expect(() => validateCardPack([c]), source.id).not.toThrow(); expect(c.text.length).toBeGreaterThan(0);
    }
  });
  it('updates generated descriptions when template keywords, guaranteed draws or powers are changed', () => {
    const charger = copyCardTemplate(CARD.masik); charger.charge = false; expect(describeCustomCard(charger)).not.toMatch(/^Рывок\./);
    const echo = copyCardTemplate(CARD['echo-maxim']); echo.echo = false; expect(describeCustomCard(echo)).not.toContain('Эхо.');
    const opening = copyCardTemplate(CARD.casino); opening.editor!.startInHand = false; expect(describeCustomCard(opening)).not.toContain('Начало матча');
    const hero = copyCardTemplate(CARD.maratik); hero.editor!.powerId = 'rds-power'; hero.armor = 5;
    expect(describeCustomCard(hero)).toContain('Даёт 5 брони'); expect(describeCustomCard(hero)).not.toContain('«Ой»');
  });
  it('builds a self-contained example set and keeps copied self-references on the new version', () => {
    const pack = rdsExample(); expect(() => registerCardPack(pack)).not.toThrow();
    expect(packForCards([pack.find(c => c.kind === 'hero')!.id])).toHaveLength(3);
    const c = make({}, [{ operation: 'summon' }]); c.editor!.rules[0].cardId = c.id;
    const copy = copyCardTemplate(c); expect(copy.id).not.toBe(c.id); expect(copy.editor?.rules[0].cardId).toBe(copy.id);
  });
  it('persists the library, supports a legal 30-card deck and guarantees its quest in the opening hand', () => {
    const values = new Map<string, string>(); vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
    const pack = rdsExample(); saveCustomLibrary(pack); restoreCustomCards(); expect(userCards()).toHaveLength(6);
    const quest = pack.find(c => c.quest)!; const deck = classDeck(STARTER_DECK,'mage'); deck[deck.indexOf('rash-quest')] = quest.id;
    expect(deckError(deck)).toBeUndefined(); const g = createGame(deck, 12, deck, 30000);
    expect(g.player.hand[0].id).toBe(quest.id); expect(g.bot.hand[0].id).toBe(quest.id);
    values.set('memestone.v1.game', JSON.stringify(g)); expect(loadGame()?.id).toBe(g.id);
  });
  it('carries custom heroes, powers, art and rules to the other seat without exposing hands or deck order', () => {
    const power = make({ kind: 'power' }, [{ target: 'selectedEnemy', amount: 2 }]);
    const hero = make({ kind: 'hero', armor: 5 }); hero.editor!.powerId = power.id;
    const deck = [...STARTER_DECK]; deck[0] = hero.id;
    registerCardPack([power, hero]); let g = createRoomGame(deck, STARTER_DECK, 'Первый', 'Второй', 12, 'custom-network');
    g.player.mana = 10; g = play(g, 'player', hero);
    for (const viewer of ['player', 'bot'] as Side[]) {
      const view = roomGameView(g, viewer); expect(validRoomView(view)).toBe(true);
      expect(view.bot.hand.every(c => c.id === 'hidden')).toBe(true); expect(view.player.deck.every(id => id === 'hidden')).toBe(true);
      expect(view.customCards?.map(c => c.id)).toEqual(expect.arrayContaining([power.id, hero.id]));
      if (viewer === 'bot') expect(view.bot).toMatchObject({ hero: hero.id, power: power.id });
    }
  });
  it('flips synergy counters with the guest perspective so its displayed cost matches the host engine', () => {
    const card = make({ cost: 8 }); card.editor!.discount = { event: 'death', amount: 2, filter: { side: 'friendly', tag: 'РДШ' } };
    const g = setup('bot', [card]);
    g.customCounts = { player: { play: {}, summon: {}, death: { rash: 3 } }, bot: { play: {}, summon: {}, death: { rash: 1 } } };
    const view = roomGameView(g, 'bot'); expect(validRoomView(view)).toBe(true);
    expect(cardCost(view, card.id, 'player')).toBe(cardCost(g, card.id, 'bot')); expect(cardCost(view, card.id, 'player')).toBe(6);
  });
});
