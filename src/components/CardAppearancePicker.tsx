import type { CardDef } from '../game/cards';
import { CARD_APPEARANCES, useCardAppearances } from '../card-appearance';
import { CardFrame } from './CardFrame';

export default function CardAppearancePicker({ card }: { card: CardDef }) {
  const { choices, select } = useCardAppearances();
  if (card.rarity !== 'legendary') return null;
  const selected = choices[card.id] ?? 'standard';
  return <fieldset className="card-appearance-picker"><legend>Оформление карты</legend>
    <div>{CARD_APPEARANCES.map(option => <button key={option.id} type="button" aria-pressed={selected === option.id}
      onClick={() => select(card.id, option.id)}><span className="appearance-preview" aria-hidden="true"><CardFrame card={card} appearance={option.id} /></span><span>{option.name}</span></button>)}</div>
    <small>Выбор сохраняется для этой легендарной карты.</small>
  </fieldset>;
}
