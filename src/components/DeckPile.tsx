import { useEffect, useRef, useState } from 'react';
import type { Player, Side } from '../game/engine';

export default function DeckPile({ player, side }: { player: Player; side: Side }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const name = side === 'player' ? 'Ваша колода' : 'Колода противника';
  return <div ref={root} className={`deck-pile ${side} ${player.deck.length ? '' : 'empty'}`} data-combat-anchor={`${side}:deck`}
    onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
    <button type="button" className="deck-pile-button" aria-label={`${name}: ${player.deck.length} карт`} aria-expanded={open} aria-describedby={open ? `deck-info-${side}` : undefined}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}>
      <span className="deck-stack"><i /><i /><i /><span className="card-back-design">✦</span></span>
      <strong>{player.deck.length}</strong><small>{side === 'player' ? 'Твоя колода' : 'Колода врага'}</small>
    </button>
    {open && <div className="deck-pile-tooltip" id={`deck-info-${side}`} role="tooltip"><b>{side === 'player' ? 'Твои карты' : 'Карты противника'}</b><span>В руке: <strong>{player.hand.length}/10</strong></span><span>В колоде: <strong>{player.deck.length}</strong></span>{player.fatigue > 0 && <em>Усталость: {player.fatigue}</em>}</div>}
  </div>;
}
