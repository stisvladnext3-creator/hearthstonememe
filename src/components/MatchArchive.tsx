import { useEffect,useRef,useState } from 'react';
import { ChevronLeft,ChevronRight,History,LoaderCircle,Swords,Trophy } from 'lucide-react';
import { useAccount } from '../account/AccountProvider';
import { cachedMatches,cacheMatch,summaryOf,validSummary,type ArchivedMatch,type MatchSummary } from '../account/archive';
import { validateCardPack,registerCardPack } from '../game/custom-cards';
import { heroDefinition } from '../game/presentation';
import type { Inspect } from '../inspection';
import Modal from './Modal';
import BattleHistory from './BattleHistory';
const date=new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});
export default function MatchArchive({close,inspect}:{close:()=>void;inspect:Inspect}){
 const account=useAccount(),list=useRef<HTMLUListElement>(null),[page,setPage]=useState(0),[size,setSize]=useState(4),[rows,setRows]=useState<MatchSummary[]>([]),[total,setTotal]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[detail,setDetail]=useState<ArchivedMatch|null>(null),cache=useRef(new Map<string,ArchivedMatch>());
 useEffect(()=>{setPage(p=>Math.min(p,Math.max(0,Math.ceil(total/size)-1)));},[total,size]);
 useEffect(()=>{if(detail)return;const el=list.current;if(!el)return;const fit=()=>{const height=parseFloat(getComputedStyle(el).getPropertyValue('--match-row-height'))||76;setSize(Math.max(1,Math.min(10,Math.floor((el.clientHeight+8)/(height+8)))));};fit();const observer=new ResizeObserver(fit);observer.observe(el);return()=>observer.disconnect();},[detail]);
 useEffect(()=>{let cancelled=false;setBusy(true);setError('');void(async()=>{
  const local=await cachedMatches();if(cancelled)return;cache.current=new Map(local.map(r=>[r.id,r.value]));const api=account.client(),pending=local.filter(r=>!r.uploaded).sort((a,b)=>b.value.endedAt-a.value.endedAt);
  if(api){try{const offset=Math.max(0,page*size-pending.length),remote=await api.history(offset,20);if(cancelled)return;const ids=new Set(pending.map(r=>r.id)),prefix=pending.slice(page*size,page*size+size).map(r=>summaryOf(r.value)),rest=remote.items.filter(validSummary).filter(r=>!ids.has(r.id));setRows([...prefix,...rest].slice(0,size));setTotal(remote.total+pending.length);return;}catch{if(cancelled)return;setError('Без связи: показана история этого устройства.');}}
  const all=local.map(r=>summaryOf(r.value)).sort((a,b)=>b.endedAt-a.endedAt);setTotal(all.length);setRows(all.slice(page*size,(page+1)*size));
 })().catch(()=>{if(!cancelled)setError('Не удалось открыть историю матчей.');}).finally(()=>{if(!cancelled)setBusy(false);});return()=>{cancelled=true;};},[page,size,account.user?.id,account.notice.lastSync]);
 const open=async(row:MatchSummary)=>{setBusy(true);setError('');try{let value=cache.current.get(row.id);if(!value){const api=account.client();if(!api)throw new Error('Этот матч пока не загружен на устройство.');value=await api.historyDetail(row.id);if(!validSummary(value)||!Array.isArray(value.log)||value.log.length>1000||!Array.isArray(value.cards))throw new Error('Не удалось прочитать историю.');value.cards=validateCardPack(value.cards,'match');await cacheMatch(value,true);cache.current.set(row.id,value);}registerCardPack(value.cards,'match');setDetail(value);}catch(e){setError(e instanceof Error?e.message:'Не удалось открыть матч.');}finally{setBusy(false);}};
 if(detail)return <Modal title="История матча" close={()=>setDetail(null)} className="match-history-modal"><BattleHistory entries={detail.log} opponent={detail.opponent} inspect={inspect} close={()=>setDetail(null)}/></Modal>;
 const pages=Math.max(1,Math.ceil(total/size));
 return <Modal title="История матчей" close={close} className="match-archive-modal paged-modal"><header className="account-heading"><History size={25}/><h2>История матчей</h2></header><p className="match-archive-caption">Партии с ботами и игроками. Время — московское.</p>
  <ul ref={list} className="match-archive-list">{rows.map(row=><li key={row.id}><button onClick={()=>void open(row)} disabled={busy} aria-label={`Матч с ${row.opponent}, ${row.outcome==='win'?'победа':row.outcome==='loss'?'поражение':'ничья'}`}><span className={`match-outcome ${row.outcome}`}>{row.outcome==='win'?<Trophy size={23}/>:<Swords size={23}/>}</span><span className="match-row-main"><strong>{row.opponent}</strong><small>{heroDefinition(row.playerHero).name} · {row.mode==='training'?'Тренировка':'Сетевая партия'}</small><time>{date.format(row.endedAt)}</time></span><span className="match-row-end"><b>{row.outcome==='win'?'Победа':row.outcome==='loss'?'Поражение':'Ничья'}</b><small>{row.turns} ход.</small></span></button></li>)}</ul>
  {!rows.length&&!busy&&<p className="match-archive-empty">Здесь появятся завершённые партии. История записывается с этого обновления.</p>}
  {error&&<p className="account-message error" role="status">{error}</p>}{busy&&<span className="archive-loading" role="status"><LoaderCircle className="spinning" size={17}/>Загружаем историю…</span>}
  <nav className="match-archive-pages" aria-label="Страницы матчей"><button className="button secondary" disabled={busy||page===0} onClick={()=>setPage(p=>p-1)} aria-label="Предыдущие матчи"><ChevronLeft size={18}/></button><span>{Math.min(page+1,pages)} / {pages} · {total} матчей</span><button className="button secondary" disabled={busy||page+1>=pages} onClick={()=>setPage(p=>p+1)} aria-label="Следующие матчи"><ChevronRight size={18}/></button></nav>
 </Modal>;
}
