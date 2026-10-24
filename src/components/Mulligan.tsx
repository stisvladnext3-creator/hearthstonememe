import { useEffect, useState } from 'react';
import { Check, RefreshCw, Timer } from 'lucide-react';
import { CARD } from '../game/cards';
import type { Action, Game } from '../game/engine';
import type { Inspect } from '../inspection';
import Modal from './Modal';
import { Card } from './Card';

export default function Mulligan({ game, dispatch, inspect, blocked, back }: {
  game: Game; dispatch: (action: Action) => void; inspect: Inspect; blocked: boolean; back: () => void;
}) {
  const phase = game.mulligan!;
  const [now, setNow] = useState(Date.now);
  const [selected, setSelected] = useState(phase.selected.player);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(timer); }, []);
  const remaining = Math.max(0, Math.ceil((phase.deadline - now) / 1000));
  const ready = phase.ready.player;
  const synced = selected.join(',') === phase.selected.player.join(',');
  useEffect(() => {
    if (!ready && !blocked && !synced && phase.deadline > Date.now()) dispatch({ type: 'mulligan', replace: selected, confirm: false });
  }, [selected, synced, ready, blocked, phase.deadline, dispatch]);
  return <Modal title="Стартовая рука" close={() => {}} dismissible={false} className="mulligan-modal">
    <header><span className="eyebrow">ПЕРЕД НАЧАЛОМ БОЯ</span><h2>Выбери стартовую руку</h2>
      <span className="mulligan-timer" role="timer" aria-label={`Осталось ${remaining} секунд`}><Timer size={20} />{remaining}</span></header>
    <p>{ready ? 'Рука подтверждена. Ждём соперника.' : 'Нажми на карты, которые хочешь заменить. Можно заменить все три.'}</p>
    <div className="mulligan-cards">{game.player.hand.map(c => <div key={c.uid} className={`mulligan-choice ${selected.includes(c.uid) ? 'replace' : ''}`}>
      <Card card={CARD[c.id]} onClick={() => {
        if (!ready && remaining) setSelected(previous => previous.includes(c.uid) ? previous.filter(uid => uid !== c.uid) : [...previous, c.uid]);
      }} onInspect={() => inspect(CARD[c.id], { zone: 'hand', owner: 'player' })} />
      <span className="mulligan-card-label">{selected.includes(c.uid) ? <><RefreshCw size={15} />Заменить</> : <><Check size={15} />Оставить</>}</span>
    </div>)}</div>
    <footer><button className="text-button" onClick={back}>В меню</button><button className="button primary" aria-label="Подтвердить стартовую руку"
      disabled={ready || blocked || !synced || !remaining} onClick={() => dispatch({ type: 'mulligan', replace: selected })}>{ready ? 'Ждём соперника…' : selected.length ? `Заменить ${selected.length} и начать` : 'Оставить руку'}</button></footer>
  </Modal>;
}
