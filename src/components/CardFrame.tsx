import { useId, useLayoutEffect, useRef } from 'react';
import { RARITY_NAMES, type CardDef } from '../game/cards';
import type { CardAppearance } from '../card-appearance';
import { HERO_CLASSES } from '../game/classes';

// All coordinates are in the source PNG, including the cropped hero/power atlas.
// The gem is already painted into each frame. Tint those exact pixels instead
// of placing a second CSS stone on top of the image.
const FRAMES = {
  dragon: { file: 'card-frame.png', width: 1064, height: 1478, viewBox: '0 0 1064 1478',
    region: [502, 840, 76, 102],
    gem: 'M540 849 C520 847 507 864 509 887 C511 908 524 929 539 934 C556 923 572 901 570 878 C568 859 557 849 540 849Z',
    name: 'M146 840 Q537 752 930 840', font: 64,
    tribe: { x: 549, y: 1333, width: 400, height: 52, font: 38 } },
  simple: { file: 'simple-minion-frame.png', width: 1064, height: 1478, viewBox: '0 0 1064 1478',
    region: [506, 831, 86, 111],
    gem: 'M549 838 C527 837 511 855 512 880 C513 905 530 928 549 937 C570 926 587 901 586 878 C585 852 570 838 549 838Z',
    name: 'M146 840 Q549 752 948 840', font: 64,
    tribe: { x: 549, y: 1333, width: 400, height: 52, font: 38 } },
  spell: { file: 'spell-frame.png', width: 1064, height: 1478, viewBox: '0 0 1064 1478',
    region: [506, 810, 84, 116],
    gem: 'M548 818 C529 819 515 837 515 859 C516 883 531 906 548 915 C565 904 580 881 580 858 C580 835 566 818 548 818Z',
    name: 'M146 790 Q550 678 955 790', font: 64 },
  hero: { file: 'special-frames.png', width: 1774, height: 887, viewBox: '120.632 0 709.6 887',
    region: [434, 524, 60, 76],
    gem: 'M464 531 C451 530 441 541 441 557 C441 572 451 587 464 592 C476 585 486 570 486 554 C485 540 477 531 464 531Z',
    name: 'M218 548 Q465 482 713 548', font: 45 },
  power: { file: 'special-frames.png', width: 1774, height: 887, viewBox: '901.192 0 709.6 887',
    region: [1258, 776, 65, 84],
    gem: 'M1290 783 L1315 820 L1290 852 L1265 820Z',
    name: 'M1010 548 Q1290 482 1566 548', font: 45 },
  signature: { file: 'premium-frames.png', width: 1505, height: 1045, viewBox: '0 0 752.5 1045',
    region: [367, 47, 73, 51], gem: 'M402 52 Q423 52 432 68 Q422 84 402 88 Q380 85 374 69 Q380 56 402 52Z',
    name: 'M133 690 Q395 669 658 690', font: 44,
    tribe: { x: 402, y: 954, width: 153, height: 37, font: 28 } },
  diamond: { file: 'premium-frames.png', width: 1505, height: 1045, viewBox: '752.5 0 752.5 1045',
    region: [1096, 609, 62, 77], gem: 'M1128 615 C1111 615 1104 628 1105 644 Q1105 664 1127 678 Q1149 664 1149 641 C1149 627 1141 615 1128 615Z',
    name: 'M860 622 Q1128 540 1398 622', font: 44,
    tribe: { x: 1128, y: 962, width: 225, height: 38, font: 30 } },
};
const COLORS = {
  common: ['#526777', '#dfeaf0', '#ffffff'],
  rare: ['#06297c', '#2585ec', '#d6f4ff'],
  epic: ['#340251', '#bd40ed', '#f5cdff'],
  legendary: ['#6e2500', '#ffac21', '#fff2bc'],
};
export function frameModel(card: CardDef, appearance: CardAppearance = 'standard') {
  if (card.rarity === 'legendary' && appearance !== 'standard') return appearance;
  return card.kind === 'spell' ? 'spell' : card.kind === 'hero' ? 'hero' : card.kind === 'power' ? 'power'
    : card.frame === 'simple' || card.rarity !== 'legendary' ? 'simple' : 'dragon';
}
export function CardFrame({ card, appearance = 'standard' }: { card: CardDef; appearance?: CardAppearance }) {
  const model = frameModel(card, appearance);
  const id = useId(), frame = FRAMES[model], colors = COLORS[card.rarity];
  const channel = (offset: number) => colors.map(c => (parseInt(c.slice(offset, offset + 2), 16) / 255).toFixed(4)).join(' ');
  const href = `${import.meta.env.BASE_URL}art/${frame.file}`;
  const classColors = card.heroClass ? ['#131b20', HERO_CLASSES[card.heroClass].cardColor, '#ae9762', '#f4dda2'] : undefined;
  const classChannel = (offset: number) => classColors!.map(c => (parseInt(c.slice(offset, offset + 2), 16) / 255).toFixed(4)).join(' ');
  const [x, y, w, h] = frame.viewBox.split(' ').map(Number);
  const nameTop = model === 'spell' ? .44 : model === 'signature' ? .61 : .5;
  return <svg className="card-frame card-frame-svg" data-frame-model={model} viewBox={frame.viewBox} preserveAspectRatio="none">
    <defs>
      {classColors && <>
        <mask id={`${id}-class-mask`} maskUnits="userSpaceOnUse" x={x} y={y} width={w} height={h}>
          <rect x={x} y={y} width={w} height={h} fill="white" />
          <rect x={x} y={y} width={w * .27} height={h * .25} fill="black" />
          <rect x={x + w * .10} y={y + h * nameTop} width={w * .84} height={h * .14} fill="black" />
          <rect x={x + w * .15} y={y + h * .64} width={w * .73} height={h * .28} rx={w * .05} fill="black" />
          <rect x={x} y={y + h * .83} width={w * .28} height={h * .17} fill="black" />
          <rect x={x + w * .75} y={y + h * .81} width={w * .25} height={h * .19} fill="black" />
          <rect x={x + w * .23} y={y + h * .88} width={w * .53} height={h * .09} fill="black" />
          <path d={frame.gem} fill="black" />
        </mask>
        <filter id={`${id}-class-color`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer><feFuncR type="table" tableValues={classChannel(1)} /><feFuncG type="table" tableValues={classChannel(3)} /><feFuncB type="table" tableValues={classChannel(5)} /></feComponentTransfer>
        </filter>
      </>}
      <clipPath id={`${id}-gem`}><path d={frame.gem} /></clipPath>
      <filter id={`${id}-color`} filterUnits="userSpaceOnUse" x={frame.region[0]} y={frame.region[1]} width={frame.region[2]} height={frame.region[3]} colorInterpolationFilters="sRGB">
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer><feFuncR type="table" tableValues={channel(1)} /><feFuncG type="table" tableValues={channel(3)} /><feFuncB type="table" tableValues={channel(5)} /></feComponentTransfer>
      </filter>
    </defs>
    <image href={href} width={frame.width} height={frame.height} />
    {classColors && <g className="card-class-paint" data-card-class={card.heroClass} mask={`url(#${id}-class-mask)`}><image href={href} width={frame.width} height={frame.height} filter={`url(#${id}-class-color)`} /></g>}
    <g className="card-rarity" data-rarity={card.rarity} role="img" aria-label={`Редкость: ${RARITY_NAMES[card.rarity]}`} clipPath={`url(#${id}-gem)`}>
      <image href={href} width={frame.width} height={frame.height} filter={`url(#${id}-color)`} />
    </g>
  </svg>;
}
export function CardName({ card, appearance = 'standard' }: { card: CardDef; appearance?: CardAppearance }) {
  const id = useId(), ref = useRef<SVGTextElement>(null), frame = FRAMES[frameModel(card, appearance)];
  useLayoutEffect(() => {
    const text = ref.current!, svg = text.ownerSVGElement!, path = svg.querySelector('path')!;
    let alive = true;
    const fit = () => {
      if (!alive || !text.isConnected) return;
      text.setAttribute('font-size', String(frame.font));
      const length = text.getComputedTextLength(), available = path.getTotalLength() * .94;
      if (length > available) text.setAttribute('font-size', String(frame.font * available / length));
    };
    fit(); void document.fonts.ready.then(fit); document.fonts.addEventListener('loadingdone', fit);
    return () => { alive = false; document.fonts.removeEventListener('loadingdone', fit); };
  }, [card.name, frame]);
  return <svg className="card-name" viewBox={frame.viewBox} preserveAspectRatio="none" role="heading" aria-level={3} aria-label={card.name}>
    <defs><path id={`${id}-name`} d={frame.name} /></defs>
    <text ref={ref} fontSize={frame.font}><textPath href={`#${id}-name`} startOffset="50%" textAnchor="middle">{card.name}</textPath></text>
  </svg>;
}

export function CardTribe({ card, appearance = 'standard' }: { card: CardDef; appearance?: CardAppearance }) {
  const frame = FRAMES[frameModel(card, appearance)];
  const region = 'tribe' in frame ? frame.tribe : undefined;
  const label = card.tribe ?? (card.kind === 'token' ? 'Призыв' : 'Существо');
  const ref = useRef<SVGTextElement>(null);
  useLayoutEffect(() => {
    if (!region || !ref.current) return;
    const text = ref.current;
    let alive = true;
    const fit = () => {
      if (!alive || !text.isConnected) return;
      text.setAttribute('font-size', String(region.font));
      const box = text.getBBox();
      const scale = Math.min(1, region.width / Math.max(1, box.width), region.height / Math.max(1, box.height));
      text.setAttribute('font-size', String(region.font * scale));
    };
    fit(); void document.fonts.ready.then(fit); document.fonts.addEventListener('loadingdone', fit);
    return () => { alive = false; document.fonts.removeEventListener('loadingdone', fit); };
  }, [label, region]);
  if (!region || !['minion', 'token'].includes(card.kind)) return null;
  // The text shares the frame's native coordinates, so resizing and hover zoom
  // cannot move it relative to the painted creature-type plaque.
  return <svg className="card-type" viewBox={frame.viewBox} preserveAspectRatio="none" aria-label={`Тип существа: ${label}`}>
    <text ref={ref} x={region.x} y={region.y} fontSize={region.font} textAnchor="middle" dominantBaseline="central">{label}</text>
  </svg>;
}
