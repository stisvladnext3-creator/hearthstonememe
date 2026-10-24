import type { Player, Side } from '../game/engine';

export default function DeckPile({ player, side }: { player: Player; side: Side }) {
  return <div className={`deck-pile ${side} ${player.deck.length ? '' : 'empty'}`} data-combat-anchor={`${side}:deck`}
    role="img" aria-label={`${side === 'player' ? 'Ваша колода' : 'Колода противника'}: ${player.deck.length} карт`}>
    <span className="deck-stack"><i /><i /><i /><span className="card-back-design">✦</span></span>
    <strong>{player.deck.length}</strong><small>{side === 'player' ? 'Твоя колода' : 'Колода врага'}</small>
  </div>;
}
