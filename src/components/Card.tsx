import { useId, type CSSProperties } from 'react';
import { ImagePlus } from 'lucide-react';
import { CARD, type CardDef } from '../game/cards';
import { useArtwork } from '../artwork';
import { useLongPress } from '../useLongPress';

export function Art({ index, className = '', cardId }: { index: number; className?: string; cardId?: string }) {
  const { images } = useArtwork();
  const image = cardId ? images[cardId] : undefined;
  if (image) return <div className={`portrait-art original-portrait ${image.format} ${className}`} style={{ backgroundImage: `url("${image.url}")`, '--portrait-position': image.position, '--portrait-size': image.size } as CSSProperties} />;
  if (cardId && CARD[cardId]?.custom) return <div className={`portrait-art awaiting-original ${className}`}><ImagePlus /><span>ТВОЙ ОРИГИНАЛ</span></div>;
  return <div className={`portrait-art ${className}`} style={{ '--art-x': `${(index % 4) * 100 / 3}%`, '--art-y': `${Math.floor(index / 4) * 50}%` } as CSSProperties} />;
}
export const kindLabel = (kind: CardDef['kind']) => ({ minion: 'Существо', spell: 'Заклинание', hero: 'Герой', power: 'Сила героя', token: 'Призыв' })[kind];
export function Card({ card, onClick, onInspect, className = '', playable = false, compact = false, cost }: {
  card: CardDef; onClick?: () => void; onInspect?: () => void; className?: string; playable?: boolean; compact?: boolean; cost?: number;
}) {
  const gesture = useLongPress(onInspect ?? onClick);
  const namePath = useId();
  const { images } = useArtwork();
  const image = images[card.id];
  const scanned = image && image.format !== 'portrait';
  const spell = card.kind === 'spell';
  const shownCost = cost ?? card.printedCost ?? card.cost;
  const content = <>
    {scanned ? <><span className={`scanned-card ${image.format}`}><img src={image.url} alt={`Оригинальная карта ${card.name}`} draggable="false" /></span><span className="visually-hidden">{card.text}</span></>
      : <><div className="card-art"><Art index={card.art} cardId={card.id} /></div>{card.kind === 'hero' || card.kind === 'power' ? <span className={`card-frame special-frame ${card.kind}`}><img src={`${import.meta.env.BASE_URL}art/special-frames.png`} alt="" draggable="false" /></span> : <img className={`card-frame ${spell ? 'spell-frame' : ''}`} src={`${import.meta.env.BASE_URL}art/${spell ? 'spell-frame' : card.frame === 'simple' ? 'simple-minion-frame' : 'card-frame'}.png`} alt="" draggable="false" />}
        {spell && <span className="spell-rarity" aria-hidden="true" />}{card.frame === 'simple' && card.rarity === 'common' && <span className="simple-rarity" aria-hidden="true" />}
        <div className="card-copy"><h3>{spell ? <svg className="spell-title" viewBox="0 0 360 64"><defs><path id={namePath} d="M 12,49 Q 180,7 348,49" /></defs><text fontSize={Math.min(34, 500 / card.name.length)}><textPath href={`#${namePath}`} startOffset="50%" textAnchor="middle">{card.name}</textPath></text></svg> : card.name}</h3><p><span>{card.text.split(/(Рывок\.|Натиск\.|Предсмертный хрип:|Эхо\.|Задача:|Награда:|Боевой клич:|Провокация\.|ВСЕХ|Начало матча:)/g).map((part, i) => /^(Рывок\.|Натиск\.|Предсмертный хрип:|Эхо\.|Задача:|Награда:|Боевой клич:|Провокация\.|ВСЕХ|Начало матча:)$/.test(part) ? <b key={i}>{part}</b> : part)}</span></p><span className="card-kind">{card.tribe || kindLabel(card.kind)}</span></div>
        <div className="card-bottom">{card.attack !== undefined ? <><span className="attack-stat">{card.attack}</span><span className="health-stat">{card.health}</span></> : card.armor ? <span className="armor-stat">{card.armor}</span> : null}</div>
      </>}
    {(!scanned || (cost !== undefined && cost !== card.cost)) && <span className={`card-cost ${scanned ? 'override-cost' : ''} ${cost !== undefined && cost < card.cost ? 'discounted' : ''}`}>{shownCost}</span>}
  </>;
  const classes = `game-card classic-card ${card.rarity} kind-${card.kind} ${card.frame === 'simple' ? 'model-simple' : ''} ${card.tribe ? 'has-tribe' : ''} ${card.name.length > 18 ? 'long-name' : ''} ${scanned ? 'has-original' : ''} ${compact ? 'compact' : ''} ${playable ? 'playable' : ''} ${className}`;
  return onClick ? <button className={classes} onClick={onClick} {...gesture} aria-label={`${card.name}, ${shownCost} маны`} title={card.text}>{content}</button>
    : <div className={classes}>{content}</div>;
}
