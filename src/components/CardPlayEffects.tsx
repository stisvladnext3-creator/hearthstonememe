import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CARD } from '../game/cards';
import { CARD_PLAY_MS } from '../game/card-play';
import type { CardCast } from '../game/engine';
import { entranceFor, isCreature, type Entrance } from '../game/visual-effects';
import { Art, Card } from './Card';

// Vector artwork stays crisp at phone and desktop sizes. Every entrance has
// different geometry and choreography, rather than a recoloured generic flash.
export function EntranceArtwork({ variant }: { variant: Entrance }) {
  const rays = Array.from({ length: 12 }, (_, n) => n * 30);
  const id=useId().replaceAll(':','');
  return <svg className="entrance-artwork" viewBox="0 0 320 320" aria-hidden="true">
    <defs><linearGradient id={id+'rock'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e0c49a"/><stop offset=".35" stopColor="#9e8566"/><stop offset=".45" stopColor="#6e5945"/><stop offset="1" stopColor="#41372d"/></linearGradient><linearGradient id={id+'leaf'} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#31552d"/><stop offset=".48" stopColor="#72a64c"/><stop offset="1" stopColor="#d6e59c"/></linearGradient><linearGradient id={id+'fire'} x1="0" y1="1" x2="0" y2="0"><stop stopColor="#ee4e1880"/><stop offset=".5" stopColor="#ffb42bd9"/><stop offset="1" stopColor="#ffe9a366"/></linearGradient></defs>
    <g className="entrance-rings"><circle cx="160" cy="160" r="74"/><circle cx="160" cy="160" r="99"/></g>
    {variant === 'stone' && <g className="stone-shards">{rays.slice(0,8).map((a,i)=><g key={a} transform={`rotate(${a*1.5} 160 160)`} style={{'--i':i} as CSSProperties}><path fill={`url(#${id}rock)`} d="M149 76 143 58 149 36 165 28 176 62 164 80Z"/><path className="stone-facets" d="M149 36 155 60 176 62M155 60 164 80M155 60 143 58"/></g>)}</g>}
    {variant === 'portal' && <g className="portal-gates"><ellipse cx="160" cy="160" rx="109" ry="62"/><ellipse cx="160" cy="160" rx="109" ry="62" transform="rotate(60 160 160)"/><ellipse cx="160" cy="160" rx="109" ry="62" transform="rotate(120 160 160)"/>{rays.map(a=><path key={a} transform={`rotate(${a} 160 160)`} d="m153 32 7-12 7 12-7 12Z"/>)}</g>}
    {variant === 'ember' && <g className="ember-plumes">{[0,1,2,3,4].map(i=><path key={i} fill={`url(#${id}fire)`} style={{'--i':i} as CSSProperties} transform={`translate(${i*43-86} 0)`} d="M155 251C101 209 175 171 142 128 189 143 146 75 173 43 160 109 239 192 182 249Z"/>)}</g>}
    {variant === 'nature' && <g className="nature-vines"><path d="M154 272C40 278 4 180 72 140 103 121 91 75 60 72M167 272C284 257 309 162 250 126 221 107 229 70 257 62"/>{[0,1,2,3,4,5].map(i=><g key={i} transform={`rotate(${i*60} 160 160)`}><path fill={`url(#${id}leaf)`} d="M153 80Q105 34 129 21 168 22 162 74M165 77Q206 38 193 23 164 32 165 77Z"/><path className="leaf-veins" d="M160 77 134 33m21 30-17-4m10-9 1-13M166 76l23-41m-13 24 13-4"/></g>)}</g>}
    {variant === 'storm' && <g className="storm-coils"><path d="M45 191C-9 75 133 11 244 58M29 224C140 312 316 216 271 105M63 128C85 64 238 68 253 162M89 233C139 265 240 226 244 188"/>{[0,120,240].map(a=><path key={a} transform={`rotate(${a} 160 160)`} d="m154 24-20 48 21-9-12 38 36-52-22 7 17-32Z"/>)}</g>}
    {variant === 'shadow' && <g className="shadow-tendrils">{rays.filter((_,i)=>i%2===0).map(a=><path key={a} transform={`rotate(${a} 160 160)`} d="M153 132C74 116 208 82 119 17 225 56 127 103 172 131Z"/>)}</g>}
    {variant === 'celestial' && <g className="celestial-rays">{rays.map(a=><path key={a} transform={`rotate(${a} 160 160)`} d="m157 68 3-57 3 57-3 31Z"/>)}{[45,135,225,315].map(a=><path key={a} transform={`rotate(${a} 160 160)`} d="m159 32 7 18 18 7-18 7-7 18-7-18-18-7 18-7Z"/>)}</g>}
    {variant === 'arcane' && <g className="arcane-sigils"><path d="m160 35 108 188H52Zm0 250L52 97h216Z"/><circle cx="160" cy="160" r="126"/>{rays.map(a=><path key={a} transform={`rotate(${a} 160 160)`} d="m154 27 6-8 6 8-6 8Z"/>)}</g>}
    {variant === 'flame' && <g className="flame-spiral"><path d="M160 162C81 179 112 69 207 98S281 251 151 260C18 267-2 100 80 43 24 125 47 235 164 223 267 212 228 114 165 127"/><path d="M152 188C100 150 174 125 145 72 199 102 226 158 179 191Z"/></g>}
    {variant === 'frost' && <g className="frost-crystals">{[0,60,120,180,240,300].map(a=><g key={a} transform={`rotate(${a} 160 160)`}><path d="M160 160V21m0 37-22-22m22 22 22-22m-22 61-33-30m33 30 33-30"/><path d="m160 14-9 20 9 15 9-15Z"/></g>)}</g>}
    {variant === 'venom' && <g className="venom-bubbles">{rays.map((a,i)=><g key={a} transform={`rotate(${a} 160 160)`}><circle cx="160" cy={42+i%3*14} r={7+i%4*3}/><path d="M155 96Q145 81 160 66q15 15 5 30Z"/></g>)}<path d="M96 247Q55 209 93 184T122 147M218 245Q267 202 225 178T207 144"/></g>}
    {variant === 'void' && <g className="void-tears">{[0,72,144,216,288].map(a=><path key={a} transform={`rotate(${a} 160 160)`} d="M159 151C41 136 64 38 122 22 61 89 156 56 159 151Z"/>)}<circle cx="160" cy="160" r="35"/></g>}
    <g className="entrance-motes">{rays.map((a,i)=><circle key={a} cx={160+Math.cos(a*Math.PI/180)*(114+i%3*10)} cy={160+Math.sin(a*Math.PI/180)*(114+i%3*10)} r={2+i%3} style={{'--i':i} as CSSProperties}/>)}</g>
  </svg>;
}

export default function CardPlayEffects({ cast, animations }: { cast: CardCast; animations: boolean }) {
  const [geometry, setGeometry] = useState<{ x:number; y:number; dx:number; dy:number; size:number; width:number; height:number; spellX:number; spellY:number }>();
  const elapsed = useRef(Math.min(CARD_PLAY_MS, Math.max(0, Date.now() - cast.startedAt)));
  const card = CARD[cast.cardId], creature = isCreature(card), variant = entranceFor(card);
  useLayoutEffect(() => {
    const measure = () => {
      const arena = document.querySelector<HTMLElement>('.battle-arena'), row = document.querySelector<HTMLElement>(cast.side === 'player' ? '.player-board' : '.enemy-board');
      if (!arena || !row) return;
      const a = arena.getBoundingClientRect(), r = row.getBoundingClientRect();
      const source = document.querySelector<HTMLElement>(`[data-combat-anchor="${cast.side}:${cast.action.type==='play'?cast.action.uid:'power'}"]`)?.getBoundingClientRect();
      const width = Number.parseFloat(getComputedStyle(arena).getPropertyValue('--unit-width')) || Math.min(a.width * .085, a.height * .12, 86);
      const actualWidth = row.querySelector('.board-unit')?.getBoundingClientRect().width ?? width;
      const count = row.children.length, gap = Number.parseFloat(getComputedStyle(row).gap) || 8;
      let x = r.x+r.width/2 + (creature ? Math.min(count,6)*(actualWidth+gap)/2 : 0), y = r.y+r.height/2;
      if (!creature && cast.action.target !== undefined) {
        const t = cast.action.target, key = t==='hero'?`${cast.side==='player'?'bot':'player'}:hero`:t==='own-hero'?`${cast.side}:hero`:undefined;
        const target = document.querySelector<HTMLElement>(key?`[data-combat-anchor="${key}"]`:`.board-unit[data-combat-anchor$=":${t}"]`)?.getBoundingClientRect();
        if(target){x=target.x+target.width/2;y=target.y+target.height/2;}
      }
      const size = Math.max(110, Math.min(a.height*.4,a.width*.45,300));
      const spellWidth = Math.max(72,Math.min(innerWidth*.11,130)), spellHeight=spellWidth/.72;
      const spellX=Math.max(a.left+8,Math.min(a.right-spellWidth-8,x-spellWidth*1.7))-x;
      const spellY=Math.max(a.top+8,Math.min(a.bottom-spellHeight-8,y-spellHeight*.65))-y;
      setGeometry({x,y,dx:(source?source.x+source.width/2:a.x+a.width/2)-x,dy:(source?source.y+source.height/2:a.y+a.height*.85)-y,size,width:actualWidth,height:actualWidth*1.3,spellX,spellY});
    };
    measure();window.addEventListener('resize',measure);return()=>window.removeEventListener('resize',measure);
  }, [cast]);
  if(!geometry)return null;
  const {x,y,dx,dy,size,width,height,spellX,spellY}=geometry;
  const style={'--cast-size':`${size}px`,'--cast-dx':`${dx}px`,'--cast-dy':`${dy}px`,'--cast-width':`${width}px`,'--cast-height':`${height}px`,'--spell-x':`${spellX}px`,'--spell-y':`${spellY}px`,'--cast-elapsed':`${-elapsed.current}ms`,left:x,top:y} as CSSProperties;
  return createPortal(<div className={`card-play-effects ${creature?'creature-cast':'spell-cast'} cast-${variant} ${!animations?'still-cast':''}`} data-entrance={variant} style={style} aria-hidden="true">
    <div className="cast-floor"/><EntranceArtwork variant={variant}/><div className="cast-light"/>
    <div className="casting-card">{creature?<><Art index={card.art} cardId={card.id}/><span className="cast-stat attack">{card.attack}</span><span className="cast-stat health">{card.health}</span></>:<Card card={card}/>}</div>
    <div className="cast-shockwave"/>
  </div>,document.body);
}
