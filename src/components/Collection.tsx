import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Check, ChevronLeft, ChevronRight, Crown, Flame, Layers3, Minus, Plus, RotateCcw, Search, Shield, Sparkles, Swords, X } from 'lucide-react';
import { CARDS, CARD, STARTER_DECK, deckError, type CardDef } from '../game/cards';
import { Art, Card } from './Card';

const TABS = [
  { id: 'all', label: 'Все карты', icon: <BookOpen /> },
  { id: 'custom', label: 'Твои мемы', icon: <Sparkles /> },
  { id: 'legendary', label: 'Легендарные', icon: <Crown /> },
  { id: 'minion', label: 'Существа', icon: <Swords /> },
  { id: 'spell', label: 'Заклинания', icon: <Flame /> },
  { id: 'hero', label: 'Герои', icon: <Shield /> },
];
export default function Collection({ deck, saveDeck, inspect, back, notify }: {
  deck: string[]; saveDeck: (ids: string[]) => void; inspect: (c: CardDef) => void; back: () => void; notify: (text: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [cost, setCost] = useState<number | null>(null);
  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState([...deck]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => matchMedia('(max-width: 600px)').matches ? 4 : 8);
  useEffect(() => {
    const media = matchMedia('(max-width: 600px)');
    const update = () => { setPageSize(media.matches ? 4 : 8); setPage(1); };
    media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => setPage(1), [query, filter, cost]);
  const filtered = useMemo(() => CARDS.filter(c => {
    const text = `${c.name} ${c.text} ${c.tribe ?? ''}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === 'all' || (filter === 'custom' ? c.custom : filter === 'legendary' ? c.rarity === 'legendary' : c.kind === filter))
      && (cost === null || (cost === 7 ? c.cost >= 7 : c.cost === cost));
  }).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, 'ru')), [query, filter, cost]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  const shownDeck = building ? draft : deck;
  const add = (c: CardDef) => {
    if (c.kind === 'power' || c.kind === 'token') { notify('Эта карта создаётся во время боя и не добавляется в колоду.'); return; }
    if (draft.length >= 30) { notify('Колода полна. Сначала уберите карту кнопкой «−».'); return; }
    const limit = c.rarity === 'legendary' ? 1 : 3;
    if (draft.filter(id => id === c.id).length >= limit) { notify(`Для этой карты разрешено копий: ${limit}.`); return; }
    setDraft([...draft, c.id]);
  };
  const unique = [...new Set(shownDeck)].sort((a, b) => CARD[a].cost - CARD[b].cost || CARD[a].name.localeCompare(CARD[b].name, 'ru'));
  const startEditing = () => { setDraft([...deck]); setBuilding(true); };
  return <section className="collection-page collection-album page-enter">
    <div className="album-layout"><div className="album-main">
      <div className="book-tabs" role="tablist" aria-label="Категории карт">{TABS.map(tab => <button key={tab.id} role="tab" aria-selected={filter === tab.id} className={`book-tab ${tab.id} ${filter === tab.id ? 'active' : ''}`} onClick={() => setFilter(tab.id)} aria-label={tab.label} title={tab.label}>{tab.icon}<span>{tab.label}</span></button>)}</div>
      <div className="book-paper"><span className="paper-corner tl" /><span className="paper-corner tr" /><span className="paper-corner bl" /><span className="paper-corner br" />
        <div className="book-heading"><span>❧</span><h1>{filter === 'all' ? 'Моя коллекция' : TABS.find(t => t.id === filter)?.label}</h1><span>❧</span></div>
        <div className="card-grid album-card-grid">{visible.map(c => <div className="collection-card-wrap" key={c.id}><Card card={c} onClick={() => inspect(c)} /><span className="album-owned" title={c.kind === 'power' || c.kind === 'token' ? 'Создаётся во время боя' : 'Доступно копий в колоде'}>{c.kind === 'power' ? 'Сила героя' : c.kind === 'token' ? 'Призыв' : `×${c.rarity === 'legendary' ? 1 : 3}`}</span>{building && c.kind !== 'power' && c.kind !== 'token' && <button className="add-card" aria-label={`Добавить ${c.name}`} onClick={() => add(c)}><Plus size={15} /> В колоду <span>{draft.filter(id => id === c.id).length}</span></button>}</div>)}</div>
        {!filtered.length && <div className="empty-state"><Search size={32} /><h3>Карты спрятались</h3><p>Попробуй другое название или убери фильтры.</p><button className="button secondary" onClick={() => { setQuery(''); setFilter('all'); setCost(null); }}>Сбросить фильтры</button></div>}
        <div className="book-pagination"><button disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Предыдущая страница"><ChevronLeft size={25} /></button><span role="status">Страница <b>{current}</b> из {pages}</span><button disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Следующая страница"><ChevronRight size={25} /></button></div>
      </div>
      <div className="book-controls"><div className="mana-filters" aria-label="Стоимость маны"><button className={cost === null ? 'active' : ''} onClick={() => setCost(null)} aria-label="Любая стоимость"><BookOpen size={19} /></button>{Array.from({ length: 8 }, (_, n) => <button key={n} className={cost === n ? 'active' : ''} onClick={() => setCost(cost === n ? null : n)} aria-label={`Стоимость ${n === 7 ? '7 и больше' : n}`}>{n === 7 ? '7+' : n}</button>)}</div>
        <label className="search-box"><Search size={19} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти карту…" aria-label="Поиск карт" />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={17} /></button>}</label>
      </div><div className="album-caption"><span>Найдено: {filtered.length}</span><span>Нажми на карту, чтобы прочитать описание</span></div>
    </div>
    <aside className="album-deck-sidebar"><h2>Моя колода</h2><button className="album-deck-banner" onClick={building ? () => setBuilding(false) : startEditing} aria-label={building ? 'Скрыть колоду' : 'Колода Твои правила — редактировать'}><Art index={10} /><span><strong>Твои правила</strong><small>{shownDeck.length}/30 карт · {building ? 'Редактирование' : 'Готова к бою'}</small></span><Layers3 size={22} /></button>
      <div className="deck-mana-curve" aria-label="Кривая маны">{Array.from({ length: 8 }, (_, n) => <div key={n}><div className="curve-track"><i style={{ height: `${Math.min(100, shownDeck.filter(id => n === 7 ? CARD[id].cost >= 7 : CARD[id].cost === n).length * 13)}%` }} /></div><span>{n === 7 ? '7+' : n}</span></div>)}</div>
      <div className="deck-list">{unique.map(id => <div key={id} className="deck-row"><span className="mini-mana">{CARD[id].cost}</span><button className="deck-row-name" onClick={() => inspect(CARD[id])}>{CARD[id].name}</button><span className="deck-quantity">×{shownDeck.filter(x => x === id).length}</span>{building && <button className="icon-button" aria-label={`Убрать ${CARD[id].name}`} onClick={() => { const copy = [...draft]; copy.splice(copy.indexOf(id), 1); setDraft(copy); }}><Minus size={16} /></button>}</div>)}</div>
      {!shownDeck.length && <p className="deck-empty">Нажимай «В колоду» под картами, чтобы собрать свою комбинацию.</p>}
      {building ? <><p className="deck-rule">1 копия легендарной, до 3 копий остальных. Всего 30 карт.</p><button className="button primary deck-save" disabled={!!deckError(draft)} onClick={() => { saveDeck(draft); notify('Колода сохранена.'); }}><Check size={17} /> Сохранить колоду</button><button className="text-button deck-reset" onClick={() => setDraft([...STARTER_DECK])}><RotateCcw size={15} /> Стартовая колода</button><button className="text-button deck-reset" onClick={() => setDraft([])}>Очистить колоду</button></> : <button className="button primary deck-save" onClick={startEditing}><Layers3 size={17} /> Изменить колоду</button>}
      <button className="album-back" onClick={back}><ArrowLeft size={18} /> В главное меню</button>
    </aside></div>
  </section>;
}
