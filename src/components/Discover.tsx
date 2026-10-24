import { BookOpen } from 'lucide-react';
import { CARD } from '../game/cards';
import { HEROES } from '../game/presentation';
import type { Action, Game } from '../game/engine';
import type { Inspect } from '../inspection';
import { Card } from './Card';
import Modal from './Modal';

export default function Discover({ game, dispatch, inspect, back }: {
  game: Game; dispatch: (action: Action) => void; inspect: Inspect; back: () => void;
}) {
  const pending = game.discovery!;
  const target = pending.target === 'hero' ? (HEROES[game.bot.hero] ?? HEROES.mage).name : CARD[game.bot.board.find(m => m.uid === pending.target)!.id].name;
  return <Modal title="Раскопка" close={back} dismissible={false} className="discover-modal">
    <span className="eyebrow"><BookOpen size={16} /> {CARD[pending.sourceId].name}</span>
    <h2>Выбери карту</h2>
    <p>Копия попадёт в руку. Оригинал останется в колоде.</p>
    <div className="discover-choices">{pending.options.map(id => <Card key={id} card={CARD[id]}
      onClick={() => dispatch({ type: 'discover', cardId: id })}
      onInspect={() => inspect(CARD[id], { zone: 'discover', owner: 'player', note: 'Это вариант раскопки. Копия добавится в руку после выбора.' })} />)}</div>
    <p className="discover-effect">После выбора: <strong>{target}</strong> получит 4 урона.</p>
    <small>Нажми на карту, чтобы выбрать. Удерживай, чтобы прочитать.</small>
    <button className="text-button" onClick={back}>Выбрать позже — в главное меню</button>
  </Modal>;
}
