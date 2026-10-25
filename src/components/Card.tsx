import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { ImagePlus } from 'lucide-react';
import { CARD, type CardDef } from '../game/cards';
import { CardFrame, CardName, CardTribe, frameModel } from './CardFrame';
import { useCardAppearances } from '../card-appearance';
import { CardRules } from './CardRules';
import { useArtwork } from '../artwork';
import { useLongPress } from '../useLongPress';

export function Art({ index, className = '', cardId, picture, sourceId }: { index: number; className?: string; cardId?: string; picture?: string; sourceId?: string }) {
  const { images } = useArtwork();
  const image = cardId ? images[cardId] : undefined;
  if (image) return <div className={`portrait-art original-portrait ${image.format} ${className}`} style={{ backgroundImage: `url("${image.url}")`, '--portrait-position': image.position, '--portrait-size': image.size } as CSSProperties} />;
  const customImage = picture ?? (cardId ? CARD[cardId]?.editor?.image : undefined);
  if (customImage) return <div className={`portrait-art original-portrait portrait ${className}`} style={{ backgroundImage: 'url("' + customImage + '")', backgroundPosition: 'center', backgroundSize: 'cover' }} />;
  const source = sourceId ?? (cardId ? CARD[cardId]?.editor?.artSourceId : undefined);
  const inherited = source ? images[source] : undefined;
  if (inherited) return <div className={`portrait-art original-portrait ${inherited.format} ${className}`} style={{ backgroundImage: 'url("' + inherited.url + '")', '--portrait-position': inherited.position, '--portrait-size': inherited.size } as CSSProperties} />;
  if (cardId && CARD[cardId]?.custom && !CARD[cardId].editor) return <div className={`portrait-art awaiting-original ${className}`}><ImagePlus /><span>ТВОЙ ОРИГИНАЛ</span></div>;
  return <div className={`portrait-art ${className}`} style={{ '--art-x': `${(index % 4) * 100 / 3}%`, '--art-y': `${Math.floor(index / 4) * 50}%` } as CSSProperties} />;
}
export const kindLabel = (kind: CardDef['kind']) => ({ minion: 'Существо', spell: 'Заклинание', hero: 'Герой', power: 'Сила героя', token: 'Призыв' })[kind];
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
  return <span ref={ref} className="card-fit">{rich ? <CardRules text={text} /> : text}</span>;
}
export function Card({ card, onClick, onInspect, className = '', playable = false, compact = false, cost }: {
  card: CardDef; onClick?: () => void; onInspect?: () => void; className?: string; playable?: boolean; compact?: boolean; cost?: number;
}) {
  const gesture = useLongPress(onInspect ?? onClick);
  const { images } = useArtwork();
  const { choices } = useCardAppearances();
  const appearance = card.rarity === 'legendary' ? choices[card.id] ?? 'standard' : 'standard';
  const image = images[card.id];
  const scanned = image && image.format !== 'portrait';
  const spell = card.kind === 'spell';
  const shownCost = cost ?? card.printedCost ?? card.cost;
  const content = <>
    {scanned ? <><span className={`scanned-card ${image.format}`}><img src={image.url} alt={`Оригинальная карта ${card.name}`} draggable="false" /></span><span className="visually-hidden">{card.text}</span></>
      : <><div className="card-art"><Art index={card.art} cardId={card.id} picture={card.editor?.image} sourceId={card.editor?.artSourceId} /></div><CardFrame card={card} appearance={appearance} />
        <div className="card-copy"><CardName card={card} appearance={appearance} /><p><FittedText text={card.text} maximum={spell ? 5.3 : 4.8} rich /></p><CardTribe card={card} appearance={appearance} /></div>
        <div className="card-bottom">{card.attack !== undefined ? <><span className="attack-stat">{card.attack}</span><span className="health-stat">{card.health}</span></> : card.armor ? <span className="armor-stat">{card.armor}</span> : null}</div>
      </>}
    {(!scanned || (cost !== undefined && cost !== card.cost)) && <span className={`card-cost ${scanned ? 'override-cost' : ''} ${cost !== undefined && cost < card.cost ? 'discounted' : ''}`}>{shownCost}</span>}
  </>;
  const classes = `game-card classic-card ${card.rarity} kind-${card.kind} model-${frameModel(card, appearance)} ${card.tribe ? 'has-tribe' : ''} ${card.name.length > 18 ? 'long-name' : ''} ${scanned ? 'has-original' : ''} ${compact ? 'compact' : ''} ${playable ? 'playable' : ''} ${className}`;
  return onClick ? <button className={classes} data-card-id={card.id} onClick={onClick} {...gesture} aria-label={`${card.name}, ${shownCost} маны`} title={card.text}>{content}</button>
    : <div className={classes} data-card-id={card.id}>{content}</div>;
}
