import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Map } from 'lucide-react';
import { BATTLEGROUNDS, boardImage, type BattlegroundId } from '../battlegrounds';
import { useViewport } from '../useViewport';

export default function BoardPicker({ value, change }: { value: BattlegroundId; change: (id: BattlegroundId) => void }) {
  const viewport=useViewport(), compact=viewport.width<=600&&viewport.height>=viewport.width;
  const pageSize=compact?3:BATTLEGROUNDS.length, pages=Math.ceil(BATTLEGROUNDS.length/pageSize);
  const selectedPage=Math.floor(Math.max(0,BATTLEGROUNDS.findIndex(b=>b.id===value))/pageSize);
  const [page,setPage]=useState(selectedPage);
  useEffect(()=>setPage(selectedPage),[selectedPage,value]);
  const current=Math.min(page,pages-1);
  return <fieldset className={`board-picker ${compact?'compact-board-picker':''}`}><legend><Map size={18} /> Игровое поле</legend><div className="board-options">
    {BATTLEGROUNDS.slice(current*pageSize,(current+1)*pageSize).map(board => <label className={`board-option ${value === board.id ? 'chosen' : ''}`} key={board.id}>
      <input type="radio" name="battleground" value={board.id} checked={value === board.id} onChange={() => change(board.id)} />
      <span className="board-preview" style={{ backgroundImage: `url("${boardImage(board.id)}")` }}>{value === board.id && <span><Check size={18} /></span>}</span>
      <strong>{board.name}</strong><small>{board.description}</small>
    </label>)}
  </div>{pages>1&&<nav className="board-pages" aria-label="Страницы игровых полей"><button type="button" className="board-page-prev" disabled={current===0} onClick={()=>setPage(n=>Math.max(0,n-1))} aria-label="Предыдущие поля"><ChevronLeft size={15}/></button><span aria-live="polite">{current+1} / {pages}</span><button type="button" className="board-page-next" disabled={current===pages-1} onClick={()=>setPage(n=>Math.min(pages-1,n+1))} aria-label="Следующие поля"><ChevronRight size={15}/></button></nav>}<p>Выбор сохраняется. Поле можно менять во время боя.</p></fieldset>;
}
