import { type CSSProperties } from 'react';
import { Crown, Flame, Shield, Sparkles, Swords } from 'lucide-react';
import { type CardDef } from '../game/cards';

export function Art({ index, className = '' }: { index: number; className?: string }) {
  return <div className={`portrait-art ${className}`} style={{ '--art-x': `${(index % 4) * 100 / 3}%`, '--art-y': `${Math.floor(index / 4) * 50}%` } as CSSProperties} />;
}
export const kindLabel = (kind: CardDef['kind']) => ({ minion: 'Существо', spell: 'Заклинание', hero: 'Герой', power: 'Сила героя', token: 'Призыв' })[kind];
export function Card({ card, onClick, className = '', playable = false, compact = false }: {
  card: CardDef; onClick?: () => void; className?: string; playable?: boolean; compact?: boolean;
}) {
  const content = <>
    <div className="card-art"><Art index={card.art} /><div className="card-art-shade" /></div>
    <span className="card-cost">{card.cost}</span>
    <span className={`rarity-mark ${card.rarity}`} title={card.rarity === 'legendary' ? 'Легендарная' : 'Базовая'}>{card.rarity === 'legendary' ? <Crown size={13} /> : <Sparkles size={11} />}</span>
    <div className="card-copy"><span className="card-kind">{card.tribe || kindLabel(card.kind)}</span><h3>{card.name}</h3>
      {!compact && <p>{card.text}</p>}
    </div>
    <div className="card-bottom">
      {card.attack !== undefined ? <><span className="attack-stat"><Swords size={13} />{card.attack}</span><span className="health-stat"><Flame size={13} />{card.health}</span></>
        : card.armor ? <><span className="card-type-foot">ГЕРОЙ</span><span className="armor-stat"><Shield size={13} />{card.armor}</span></>
          : <span className="card-type-foot">{kindLabel(card.kind)}</span>}
    </div>
  </>;
  const classes = `game-card ${card.rarity} ${compact ? 'compact' : ''} ${playable ? 'playable' : ''} ${className}`;
  return onClick ? <button className={classes} onClick={onClick} aria-label={`${card.name}, ${card.cost} маны`} title={card.text}>{content}</button>
    : <div className={classes}>{content}</div>;
}
