import { useId, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { ImagePlus } from 'lucide-react';
import { CARD, RARITY_NAMES, type CardDef } from '../game/cards';
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
const keywords = /^(Рывок\.|Натиск\.|Предсмертный хрип:|Эхо\.|Задача:|Награда:|Боевой клич:|Провокация\.|ВСЕХ|Начало матча:)$/;
function FittedText({ text, maximum, minimum = 2.8, rich = false }: { text: string; maximum: number; minimum?: number; rich?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const span = ref.current!, box = span.parentElement!, card = span.closest<HTMLElement>('.game-card')!;
    let alive = true;
    const fit = () => {
      if (!alive || !span.isConnected || !card.clientWidth || !box.clientHeight) return;
      // clientWidth ignores the hand's hover transform: zooming a card must not
      // change its text layout. Refit on real resize and after local fonts load.
      let low = card.clientWidth * minimum / 100, high = card.clientWidth * maximum / 100;
      for (let i = 0; i < 10; i++) {
        const size = (low + high) / 2; span.style.fontSize = `${size}px`;
        if (span.scrollHeight <= box.clientHeight && span.scrollWidth <= box.clientWidth) low = size; else high = size;
      }
      span.style.fontSize = `${Math.floor(low * 100) / 100}px`;
    };
    fit();
    const resize = new ResizeObserver(fit); resize.observe(box); resize.observe(card);
    void document.fonts.ready.then(fit); document.fonts.addEventListener('loadingdone', fit);
    return () => { alive = false; resize.disconnect(); document.fonts.removeEventListener('loadingdone', fit); };
  }, [text, maximum, minimum]);
  return <span ref={ref} className="card-fit">{rich ? text.split(/(Рывок\.|Натиск\.|Предсмертный хрип:|Эхо\.|Задача:|Награда:|Боевой клич:|Провокация\.|ВСЕХ|Начало матча:)/g).map((part, i) => keywords.test(part) ? <b key={i}>{part}</b> : part) : text}</span>;
}
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
        <div className="card-copy"><h3>{spell ? <svg className="spell-title" viewBox="0 0 360 64"><defs><path id={namePath} d="M 12,49 Q 180,7 348,49" /></defs><text fontSize={Math.min(34, 500 / card.name.length)}><textPath href={`#${namePath}`} startOffset="50%" textAnchor="middle">{card.name}</textPath></text></svg> : <FittedText text={card.name} maximum={8.5} minimum={3.2} />}</h3><p><FittedText text={card.text} maximum={spell ? 5.3 : 4.8} rich /></p><span className="card-kind"><FittedText text={card.tribe || kindLabel(card.kind)} maximum={4.8} /></span></div>
        <div className="card-bottom">{card.attack !== undefined ? <><span className="attack-stat">{card.attack}</span><span className="health-stat">{card.health}</span></> : card.armor ? <span className="armor-stat">{card.armor}</span> : null}</div>
      </>}
    {(!scanned || (cost !== undefined && cost !== card.cost)) && <span className={`card-cost ${scanned ? 'override-cost' : ''} ${cost !== undefined && cost < card.cost ? 'discounted' : ''}`}>{shownCost}</span>}
    <span className="card-rarity" data-rarity={card.rarity} role="img" aria-label={`Редкость: ${RARITY_NAMES[card.rarity]}`} />
  </>;
  const classes = `game-card classic-card ${card.rarity} kind-${card.kind} ${card.frame === 'simple' ? 'model-simple' : ''} ${card.tribe ? 'has-tribe' : ''} ${card.name.length > 18 ? 'long-name' : ''} ${scanned ? 'has-original' : ''} ${compact ? 'compact' : ''} ${playable ? 'playable' : ''} ${className}`;
  return onClick ? <button className={classes} data-card-id={card.id} onClick={onClick} {...gesture} aria-label={`${card.name}, ${shownCost} маны`} title={card.text}>{content}</button>
    : <div className={classes} data-card-id={card.id}>{content}</div>;
}
