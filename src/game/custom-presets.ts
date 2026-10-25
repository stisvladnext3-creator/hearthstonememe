import { CARD, type CardDef } from './cards';
import { newCustomCard, describeCustomCard } from './custom-cards';
import { newRule, type CustomRule } from './custom-schema';

const rule = (patch: Partial<CustomRule>): CustomRule => ({ ...newRule(), ...patch });
export function copyCardTemplate(source: CardDef): CardDef {
  const c = structuredClone(source);
  c.id = newCustomCard().id; c.custom = true; delete c.printedCost;
  c.editor = c.editor ?? { version: 1, tags: source.tribe ? [source.tribe] : [], rules: [], legacyText: source.text, artSourceId: source.id };
  const rewrite = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['cardId', 'targetCardId', 'powerId', 'rewardId'].includes(key) && child === source.id) Object.assign(value, { [key]: c.id });
      else rewrite(child);
    }
  };
  rewrite(c.editor);
  if (source.id === 'casino') c.editor.startInHand = true;
  if (source.kind === 'hero' && !c.editor.powerId) c.editor.powerId = source.effect === 'jaina' ? 'rds-power' : source.effect === 'maratik' ? 'oy' : source.effect === 'trachukcha' ? 'fool-power' : 'spark-power';
  if (source.effect === 'rashQuest') {
    delete c.effect; delete c.editor.legacyText;
    c.editor.quest = { event: 'summon', goal: 8, rewardId: 'volunteer', filter: { side: 'friendly', tag: 'РДШ' } };
  }
  if (source.kind === 'power' && !source.editor && source.effect !== 'clawFury') {
    delete c.effect; delete c.editor.legacyText;
    c.editor.rules = source.effect === 'lifeTap' ? [rule({ operation: 'damage', target: 'ownHero', amount: 2 }), rule({ operation: 'draw', target: 'ownHero', count: 1 })] : [source.id === 'storm-power' ? rule({ operation: 'summon', target: 'ownHero', cardId: 'storm-elemental' })
      : source.id === 'spark-power' ? rule({ operation: 'damage', target: 'selectedCharacter', amount: 1 })
      : source.effect === 'armor' ? rule({ operation: 'armor', target: 'ownHero', amount: 2 })
      : source.effect === 'rds' ? rule({ operation: 'summon', target: 'ownHero', cardId: 'rash' })
      : source.effect === 'oy' ? rule({ operation: 'addCard', target: 'ownHero', cardId: 'deathwing' })
      : source.effect === 'devolve' ? rule({ operation: 'devolve', target: 'enemyMinions', amount: 5 })
      : rule({ operation: 'draw', target: 'ownHero', count: 1 })];
  }
  c.text = describeCustomCard(c); return c;
}
export function rdsExample(): CardDef[] {
  const token = { ...newCustomCard(), name: 'Учебный РДШ', kind: 'token' as const, attack: 2, health: 2, tribe: 'РДШ' };
  token.editor!.tags = ['РДШ'];
  const producer = { ...newCustomCard(), name: 'Сборщик РДШ', cost: 3, attack: 2, health: 3 };
  producer.editor!.rules = [rule({ operation: 'summon', target: 'ownHero', cardId: token.id, count: 2 })];
  const banner = { ...newCustomCard(), name: 'Знаменосец РДШ', cost: 3, attack: 1, health: 4 };
  banner.editor!.rules = [rule({ trigger: 'aura', operation: 'buff', target: 'friendlyMinions', amount: 2, targetTag: 'РДШ' })];
  const power = { ...newCustomCard(), name: 'Сбор помощников', kind: 'power' as const, cost: 2 };
  delete power.attack; delete power.health;
  power.editor!.rules = [rule({ operation: 'summon', target: 'ownHero', cardId: token.id })];
  const hero = { ...newCustomCard(), name: 'Куратор РДШ', kind: 'hero' as const, cost: 8, armor: 10, rarity: 'legendary' as const };
  delete hero.attack; delete hero.health;
  hero.editor!.powerId = power.id; hero.editor!.discount = { event: 'death', amount: 1, filter: { side: 'any', tag: 'РДШ' } };
  const quest = { ...newCustomCard(), name: 'Собрать команду', kind: 'spell' as const, cost: 1, rarity: 'legendary' as const, quest: true };
  delete quest.attack; delete quest.health;
  quest.editor!.quest = { event: 'summon', goal: 3, rewardId: 'volunteer', filter: { side: 'friendly', tag: 'РДШ' } };
  const cards = [token, producer, banner, power, hero, quest], find = (id: string) => cards.find(c => c.id === id) ?? CARD[id];
  return cards.map(c => ({ ...c, text: describeCustomCard(c, '', find) }));
}
