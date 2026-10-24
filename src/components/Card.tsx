import { type CSSProperties } from 'react';
import { ImagePlus } from 'lucide-react';
import { CARD, type CardDef } from '../game/cards';
import { useArtwork } from '../artwork';

export function Art({ index, className = '', cardId }: { index: number; className?: string; cardId?: string }) {
  const { images } = useArtwork();
  const image = cardId ? images[cardId] : undefined;
  if (image) return <div className={`portrait-art original-portrait ${image.format} ${className}`} style={{ backgroundImage: `url("${image.url}")` }} />;
  if (cardId && CARD[cardId]?.custom) return <div className={`portrait-art awaiting-original ${className}`}><ImagePlus /><span>ТВОЙ ОРИГИНАЛ</span></div>;
  return <div className={`portrait-art ${className}`} style={{ '--art-x': `${(index % 4) * 100 / 3}%`, '--art-y': `${Math.floor(index / 4) * 50}%` } as CSSProperties} />;
}
export const kindLabel = (kind: CardDef['kind']) => ({ minion: 'Существо', spell: 'Заклинание', hero: 'Герой', power: 'Сила героя', token: 'Призыв' })[kind];
export function Card({ card, onClick, className = '', playable = false, compact = false, cost }: {
  card: CardDef; onClick?: () => void; className?: string; playable?: boolean; compact?: boolean; cost?: number;
}) {
  const { images } = useArtwork();
  const image = images[card.id];
  const scanned = image && image.format !== 'portrait';
  const shownCost = cost ?? card.printedCost ?? card.cost;
  const content = <>
    {scanned ? <><span className={`scanned-card ${image.format}`}><img src={image.url} alt={`Оригинальная карта ${card.name}`} /></span><span className="visually-hidden">{card.text}</span></>
      : <><div className="card-art"><Art index={card.art} cardId={card.id} /></div>{card.kind === 'hero' || card.kind === 'power' ? <span className={`card-frame special-frame ${card.kind}`}><img src={`${import.meta.env.BASE_URL}art/special-frames.png`} alt="" draggable="false" /></span> : <img className="card-frame" src={`${import.meta.env.BASE_URL}art/card-frame.png`} alt="" draggable="false" />}
        <div className="card-copy"><h3>{card.name}</h3>{!compact && <p>{card.text.split(/(Боевой клич:|Провокация\.|ВСЕХ|Начало матча:)/g).map((part, i) => /^(Боевой клич:|Провокация\.|ВСЕХ|Начало матча:)$/.test(part) ? <b key={i}>{part}</b> : part)}</p>}<span className="card-kind">{card.tribe || kindLabel(card.kind)}</span></div>
        <div className="card-bottom">{card.attack !== undefined ? <><span className="attack-stat">{card.attack}</span><span className="health-stat">{card.health}</span></> : card.armor ? <span className="armor-stat">{card.armor}</span> : null}</div>
      </>}
    {(!scanned || (cost !== undefined && cost !== card.cost)) && <span className={`card-cost ${scanned ? 'override-cost' : ''} ${cost !== undefined && cost < card.cost ? 'discounted' : ''}`}>{shownCost}</span>}
  </>;
  const classes = `game-card classic-card ${card.rarity} kind-${card.kind} ${scanned ? 'has-original' : ''} ${compact ? 'compact' : ''} ${playable ? 'playable' : ''} ${className}`;
  return onClick ? <button className={classes} onClick={onClick} aria-label={`${card.name}, ${shownCost} маны`} title={card.text}>{content}</button>
    : <div className={classes}>{content}</div>;
}
