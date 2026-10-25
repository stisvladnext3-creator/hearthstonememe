import { randomBytes, randomUUID } from 'node:crypto';
export function largeStormPack() {
  // A valid tiny PNG with trailing test bytes keeps these import fixtures
  // self-contained while exercising a realistic near-limit JSON payload.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const cards = Array.from({ length: 40 }, (_, i) => ({ id: 'custom-' + randomUUID(), name: 'Большая буря ' + i, kind: 'minion', heroClass: 'storm', cost: 20, attack: 1, health: 1, text: 'Призывает следующее существо.', flavor: '', rarity: 'common', art: 8, custom: true,
    editor: { version: 1, tags: ['Большой набор'], rules: [], image: 'data:image/png;base64,' + Buffer.concat([png, randomBytes(32500)]).toString('base64') } }));
  cards.forEach((card, i) => { if (cards[i + 1]) card.editor.rules = [{ trigger: 'play', operation: 'summon', target: 'ownHero', amount: 2, health: 0, count: 1, chance: 100, filter: { side: 'friendly' }, cardId: cards[i + 1].id }]; });
  cards[0].editor.startInHand = true;
  return cards;
}
