import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD, STARTER_DECK, deckCopyLimit } from './cards';
import { act, chooseBotAction, createGame, legalTargets, other, powerProblem, type Side } from './engine';
import { copyCardTemplate } from './custom-presets';
import { packForCards, registerCardPack } from './custom-cards';
import { loadGame } from '../storage';
import { createRoomGame, roomGameView, validRoomView } from '../online/protocol';

function setup(side: Side = 'player') {
  const g = createGame(undefined, 730, undefined, undefined, { player: 'cat', bot: 'cat' }); g.active = side;
  for (const p of [g.player, g.bot]) Object.assign(p, { health: 30, armor: 0, mana: 10, maxMana: 10, hand: [], board: [], deck: ['regular'] });
  return g;
}
afterEach(() => vi.unstubAllGlobals());
describe.each<Side>(['player', 'bot'])('general cat controlled by %s', side => {
  it.each([3, 5, 7])('offers a seeded 3/5/7 choice, adds a %s-mana copy and deals exactly that much self damage', price => {
    const g = setup(side), before = structuredClone(g), r = act(g, side, { type: 'power' });
    expect(r.error).toBeUndefined(); expect(g).toEqual(before); expect(r.state).toEqual(act(g, side, { type: 'power' }).state);
    expect(r.state[side]).toMatchObject({ hero: 'general-cat', power: 'clawFury', mana: 7, powerUsed: true, health: 30 });
    const options = r.state.discovery!.options; expect(options.map(id => CARD[id].cost)).toEqual([3, 5, 7]);
    expect(options.every(id => !CARD[id].heroClass || CARD[id].heroClass === 'cat')).toBe(true);
    expect(act(r.state, side, { type: 'end' }).error).toBeTruthy(); expect(act(r.state, side, { type: 'discover', cardId: 'regular' }).error).toBeTruthy();
    const selected = options.find(id => CARD[id].cost === price)!, done = act(r.state, side, { type: 'discover', cardId: selected });
    expect(done.error).toBeUndefined(); expect(done.state.discovery).toBeUndefined(); expect(done.state[side].hand.map(c => c.id)).toEqual([selected]);
    expect(done.state[side].deck).toEqual(['regular']); expect(done.state[side].health).toBe(30-price); expect(done.state[other(side)].health).toBe(30);
    expect(done.state[side].mana).toBe(7); expect(act(done.state, side, { type: 'power' }).error).toContain('использована');
    expect(done.state.events).toContainEqual(expect.objectContaining({ kind: 'damage', amount: price, target: { side, uid: 'hero' } }));
    expect(done.state.log.at(-1)).toMatchObject({ actor: { id: 'claw-fury', type: 'power', side }, target: { type: 'hero', side }, amount: price });
  });
  it('respects armor, full hands and a self-lethal choice', () => {
    const g = setup(side); g[side].health = 3; g[side].armor = 2;
    g[side].hand = Array.from({length:10}, () => ({ id: 'regular', uid: g.nextUid++ }));
    const r = act(g, side, { type: 'power' }).state;
    const done = act(r, side, { type: 'discover', cardId: r.discovery!.options[1] }).state;
    expect(done[side].hand).toHaveLength(10); expect(done[side].armor).toBe(0); expect(done.winner).toBe(other(side)); expect(done.discovery).toBeUndefined();
    expect(done.log.some(l => l.kind === 'discard')).toBe(true);
  });
  it('rejects insufficient mana and silence before spending resources; briefing temporarily replaces it', () => {
    const g = setup(side); g[side].mana = 2; expect(powerProblem(g, side)).toContain('3 маны');
    g[side].mana = 10; g[side].powerSilenceTurns = 2; expect(act(g, side, { type: 'power' }).state).toBe(g);
    g[side].powerSilenceTurns = 0; g.briefing = { remainingTurns: { player: 2, bot: 2 } };
    const r = act(g, side, { type: 'power' }).state; expect(r.discovery).toBeUndefined(); expect(r[side].hand).toHaveLength(1); expect(r[side].mana).toBe(4);
  });
  it('persists a pending choice from the global pool and validates private multiplayer views', () => {
    const pending = act(setup(side), side, { type: 'power' }).state;
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(pending) }); expect(loadGame()?.discovery).toEqual(pending.discovery);
    for (const viewer of ['player', 'bot'] as const) { const view = roomGameView(pending, viewer); expect(validRoomView(view)).toBe(true); expect(view.discovery!.options).toHaveLength(viewer === side ? 3 : 0); }
  });
});
it('lets the bot use the power and choose a non-lethal cost, but avoid it with three health or a full hand', () => {
  const g = setup('bot');
  const r = act(g, 'bot', chooseBotAction(g)).state; expect(r.discovery).toBeDefined();
  const choice = chooseBotAction(r); expect(choice.type).toBe('discover'); if (choice.type === 'discover') expect(CARD[choice.cardId].cost).toBe(3);
  expect(act(r, 'bot', choice).state.bot.health).toBe(27);
  g.bot.health = 4; expect(chooseBotAction(g)).toEqual({ type: 'end' });
  g.bot.health = 3; expect(chooseBotAction(g)).toEqual({ type: 'end' });
});
it('copies the power into the editor without losing its discovery or self damage', () => {
  const c = copyCardTemplate(CARD['claw-fury']); registerCardPack([c]); const g = setup(); g.customCards = packForCards([c.id]); g.player.power = c.id;
  const r = act(g, 'player', { type: 'power' }); expect(r.error).toBeUndefined(); expect(r.state.discovery?.options.map(id => CARD[id].cost)).toEqual([3,5,7]);
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(r.state) }); expect(loadGame()?.discovery).toEqual(r.state.discovery);
  const done = act(r.state, 'player', { type: 'discover', cardId: r.state.discovery!.options[0] }); expect(done.state.player.health).toBe(27);
});
it.each([0,1])('supports either room seat order for the new class (seed %s)', seed => {
  const g = createRoomGame(STARTER_DECK, STARTER_DECK, 'Кот', 'Друг', seed, 'cat-room', undefined, { host: 'cat', guest: 'cat' });
  expect(g.player.hero).toBe('general-cat'); expect(g.bot.hero).toBe('general-cat'); expect(validRoomView(roomGameView(g,'player'))).toBe(true);
});
it('keeps the older discover spell damage on its selected opponent', () => {
  const g = setup(); g.player.hand = [{id:'dog-spell',uid:g.nextUid++}];
  const r = act(g,'player',{type:'play',uid:g.player.hand[0].uid,target:'hero'}).state;
  const done = act(r,'player',{type:'discover',cardId:r.discovery!.options[0]}).state;
  expect(done.player.health).toBe(30); expect(done.bot.health).toBe(26);
});

describe.each<Side>(['player', 'bot'])('new cat minions for %s', side => {
  it('Маршал Марс is a rare 3-mana 3/4 and can rush a minion but not the enemy hero on entry', () => {
    const g = setup(side); g[side].hand = [{ id: 'marshal-mars', uid: g.nextUid++ }];
    const r = act(g, side, {type:'play',uid:g[side].hand[0].uid}); expect(r.error).toBeUndefined();
    const m = r.state[side].board[0]; expect(m).toMatchObject({attack:3,health:4,ready:true,rush:true}); expect(r.state[side].mana).toBe(7);
    expect(legalTargets(r.state,'attack',m.uid)).not.toContain('hero');
    r.state[other(side)].board.push({...m,id:'regular',uid:r.state.nextUid++,attack:1,health:2,maxHealth:2,rush:false});
    expect(legalTargets(r.state,'attack',m.uid)).toContain(r.state[other(side)].board[0].uid);
    let next = act(r.state,side,{type:'end'}).state; next = act(next,other(side),{type:'end'}).state;
    expect(legalTargets(next,'attack',m.uid)).toContain('hero'); expect(CARD['marshal-mars']).toMatchObject({rarity:'rare',tribe:'Мяу'}); expect(deckCopyLimit(CARD['marshal-mars'])).toBe(3);
  });
  it('Генерал Михалыч is a common 5-mana 3/9 taunt that protects his hero', () => {
    const g=setup(side);g[side].hand=[{id:'general-mikhalych',uid:g.nextUid++}];
    const r=act(g,side,{type:'play',uid:g[side].hand[0].uid});expect(r.error).toBeUndefined();
    const m=r.state[side].board[0];expect(m).toMatchObject({attack:3,health:9,taunt:true,ready:false});expect(r.state[side].mana).toBe(5);
    const foe=other(side);r.state.active=foe;r.state[foe].board.push({...m,id:'regular',uid:r.state.nextUid++,attack:1,health:2,maxHealth:2,taunt:false,ready:true});
    expect(legalTargets(r.state,'attack',r.state[foe].board[0].uid)).toEqual([m.uid]);expect(CARD['general-mikhalych']).toMatchObject({rarity:'common',tribe:'Мяу'});expect(deckCopyLimit(CARD['general-mikhalych'])).toBe(3);
  });
});
