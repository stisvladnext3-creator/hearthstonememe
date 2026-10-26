import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Flame, Layers3, RefreshCw, Skull, Sparkles, Swords, WandSparkles, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { CARD } from '../game/cards';
import { heroCard } from '../game/presentation';
import type { HistoryEntry, HistoryEntity, HistoryKind } from '../game/history';
import type { Inspect } from '../inspection';
import { useLongPress } from '../useLongPress';
import { Art } from './Card';
import FullscreenButton from './FullscreenButton';
import Modal from './Modal';
import PagedText from './PagedText';

const KINDS: Record<HistoryKind, { text: string; icon: React.ReactNode }> = {
  play: { text: 'Розыгрыш', icon: <Layers3 /> }, attack: { text: 'Атака', icon: <Swords /> },
  effect: { text: 'Эффект карты', icon: <Sparkles /> }, power: { text: 'Сила героя', icon: <WandSparkles /> },
  transform: { text: 'Превращение', icon: <RefreshCw /> }, death: { text: 'Гибель', icon: <Skull /> },
  draw: { text: 'Добор', icon: <BookOpen /> }, discard: { text: 'Карта сгорела', icon: <Flame /> },
  turn: { text: 'Новый ход', icon: <Sparkles /> }, finish: { text: 'Конец боя', icon: <Flame /> },
  discover: { text: 'Раскопка', icon: <BookOpen /> },
};
function Entity({ entity, inspect, note, small = false }: { entity: HistoryEntity; inspect: Inspect; note: string; small?: boolean }) {
  const open = () => {
    const card = entity.type === 'hero' ? heroCard(entity.id) : CARD[entity.id];
    if (card) inspect(card, { zone: 'history', owner: entity.side, note });
  };
  const gesture = useLongPress(open);
  return <button className={`history-entity ${entity.type} ${small ? 'small' : ''}`} onClick={open} {...gesture} aria-label={`Посмотреть ${entity.name}`}>
    <span className="history-portrait"><Art index={entity.art} cardId={entity.id} />{entity.type === 'power' && <WandSparkles className="entity-power-mark" size={12} />}</span>
    <span className="history-entity-name">{entity.name}</span>
  </button>;
}
function HistoryItem({entry,inspect,opponent,details,measure=false}:{entry:HistoryEntry;inspect:Inspect;opponent:string;details:(entry:HistoryEntry)=>void;measure?:boolean}) {
  const kind=KINDS[entry.kind??(entry.side==='system'?'turn':'effect')];
  const text=entry.text.length>220?entry.text.slice(0,217)+'…':entry.text;
  const entity=(value:HistoryEntity,small=false)=>measure?<span className={`history-entity ${value.type} ${small?'small':''}`}><span className="history-portrait"/><span className="history-entity-name">{value.name}</span></span>:<Entity entity={value} inspect={inspect} note={entry.text} small={small}/>;
  return <li className={`history-entry ${entry.side} history-${entry.kind??'legacy'}`}>
    <div className="history-entry-heading"><span>ХОД {entry.turn??'—'} · {entry.side==='player'?'ВЫ':entry.side==='bot'?opponent.toUpperCase():'ТРАКТИР'}</span><span>{kind.icon}{kind.text}</span></div>
    {entry.hero&&<div className="history-caster">{entity(entry.hero,true)}<span>использует силу героя</span></div>}
    {entry.actor&&<div className="history-participants">{entity(entry.actor)}{entry.target&&<><span className="history-action-arrow">{entry.kind==='attack'?<Swords size={16}/>:<ArrowRight size={16}/>}</span>{entity(entry.target)}</>}</div>}
    {entry.result&&<div className="history-transform-result"><RefreshCw size={14}/><span>Превращено в</span>{entity(entry.result,true)}</div>}
    {entry.kind==='attack'&&<div className="history-damage"><span><Swords size={13}/> {entry.amount} урона</span>{entry.retaliation!==undefined&&<span>В ответ: {entry.retaliation}</span>}</div>}
    <p>{text}</p>{text!==entry.text&&<button className="history-read-more" tabIndex={measure?-1:0} onClick={()=>details(entry)}>Полностью</button>}
  </li>;
}
export default function BattleHistory({entries,inspect,close,opponent='Борис'}:{entries:HistoryEntry[];inspect:Inspect;close:()=>void;opponent?:string}) {
  const ordered=useMemo(()=>[...entries].reverse(),[entries]);
  const list=useRef<HTMLOListElement>(null),measure=useRef<HTMLOListElement>(null);
  const [ranges,setRanges]=useState<[number,number][]>([[0,1]]),[page,setPage]=useState(0),[detail,setDetail]=useState<HistoryEntry|null>(null);
  useLayoutEffect(()=>{const box=list.current,probe=measure.current;if(!box||!probe)return;let alive=true;
    const fit=()=>{if(!alive||box.clientHeight<1)return;probe.style.width=box.clientWidth+'px';const gap=parseFloat(getComputedStyle(box).rowGap)||8;const result:[number,number][]=[];let start=0,height=0;
      [...probe.children].forEach((child,i)=>{const n=child.getBoundingClientRect().height;if(i>start&&height+gap+n>box.clientHeight+.5){result.push([start,i]);start=i;height=0;}height+=(height?gap:0)+n;});
      result.push([start,ordered.length]);setRanges(old=>JSON.stringify(old)===JSON.stringify(result)?old:result);
    };
    fit();const observer=new ResizeObserver(fit);observer.observe(box);void document.fonts.ready.then(fit);document.fonts.addEventListener('loadingdone',fit);
    return()=>{alive=false;observer.disconnect();document.fonts.removeEventListener('loadingdone',fit);};
  },[ordered]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('[role="dialog"]'))close();};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[close]);
  const current=Math.min(page,ranges.length-1),[start,end]=ranges[current];
  return <aside className="battle-log illustrated-history readable-history" aria-label="История сражения"><FullscreenButton/><div className="history-header"><div><span>ХРОНИКИ ТРАКТИРА</span><h3>История сражения</h3></div><button className="icon-button" aria-label="Закрыть журнал" onClick={close}><X size={20}/></button></div>
    <ol ref={list} className="history-visible">{ordered.slice(start,end).map(entry=><HistoryItem key={entry.id} entry={entry} opponent={opponent} inspect={inspect} details={setDetail}/>)}</ol>
    <ol ref={measure} className="history-measure" aria-hidden="true" inert>{ordered.map(entry=><HistoryItem key={entry.id} entry={entry} opponent={opponent} inspect={inspect} details={setDetail} measure/>)}</ol>
    <div className="history-pagination"><button aria-label="Предыдущая страница истории" disabled={current===0} onClick={()=>setPage(current-1)}><ChevronLeft size={20}/></button><span>{current+1}/{ranges.length} · {entries.length} действий</span><button aria-label="Следующая страница истории" disabled={current+1===ranges.length} onClick={()=>setPage(current+1)}><ChevronRight size={20}/></button></div><p className="history-tip">Нажми на изображение, чтобы прочитать описание.</p>
    {detail&&<Modal title="Действие в истории" close={()=>setDetail(null)} className="history-action-modal paged-modal"><h2>{KINDS[detail.kind??'effect'].text}</h2><PagedText text={detail.text}/><button className="button primary" onClick={()=>setDetail(null)}>Назад к истории</button></Modal>}
  </aside>;
}
