import { BookOpen } from 'lucide-react';
import { CARD } from '../game/cards';
import { heroDefinition } from '../game/presentation';
import type { Action, Game } from '../game/engine';
import type { Inspect } from '../inspection';
import { Card } from './Card';
import Modal from './Modal';

export default function Discover({ game, dispatch, inspect, back }: {
  game: Game; dispatch: (action: Action) => void; inspect: Inspect; back: () => void;
}) {
  const pending = game.discovery!;
  const minion = [...game.player.board, ...game.bot.board].find(m => m.uid === pending.target);
  const target = pending.target === 'hero' ? game.bot.name ?? heroDefinition(game.bot.hero).name
    : pending.target === 'own-hero' ? game.player.name ?? heroDefinition(game.player.hero).name : minion ? CARD[minion.id].name : undefined;
  const damageAfterChoice = CARD[pending.sourceId].effect === 'discoverBlast';
  const claws = CARD[pending.sourceId].effect === 'clawFury';
  return <Modal title="Раскопка" close={back} dismissible={false} className="discover-modal">
    <span className="eyebrow"><BookOpen size={16} /> {CARD[pending.sourceId].name}</span>
    <h2>Выбери карту</h2>
    <p>{claws ? 'Карта за 3, 5 или 7 маны. Выбранная копия попадёт в руку.' : 'Копия попадёт в руку. Оригинал останется в колоде.'}</p>
    <div className="discover-choices">{pending.options.map(id => <Card key={id} card={CARD[id]}
      onClick={() => dispatch({ type: 'discover', cardId: id })}
      onInspect={() => inspect(CARD[id], { zone: 'discover', owner: 'player', note: 'Это вариант раскопки. Копия добавится в руку после выбора.' })} />)}</div>
    <p className="discover-effect">{claws ? <>Ваш герой получит <strong>3, 5 или 7 урона</strong> — по стоимости выбранной карты. Броня поглощает урон.</> : damageAfterChoice ? target ? <>После выбора: <strong>{target}</strong> получит 4 урона.</> : 'Цель урона уже покинула стол. Вы всё ещё получите копию карты.' : 'После выбора выполнятся остальные эффекты карты.'}</p>
    <small>Нажми на карту, чтобы выбрать. Удерживай, чтобы прочитать.</small>
    <button className="text-button" onClick={back}>Выбрать позже — в главное меню</button>
  </Modal>;
}
