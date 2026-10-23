import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Layers3, Minus, Plus, RotateCcw, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { CARDS, CARD, STARTER_DECK, deckError, type CardDef } from '../game/cards';
import { Card } from './Card';

export default function Collection({ deck, saveDeck, inspect, back, notify }: {
  deck: string[]; saveDeck: (ids: string[]) => void; inspect: (c: CardDef) => void; back: () => void; notify: (text: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [cost, setCost] = useState<number | null>(null);
  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState([...deck]);
  const filtered = useMemo(() => CARDS.filter(c => {
    const text = `${c.name} ${c.text} ${c.tribe ?? ''}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === 'all' || (filter === 'custom' ? c.custom : filter === 'legendary' ? c.rarity === 'legendary' : c.kind === filter))
      && (cost === null || (cost === 7 ? c.cost >= 7 : c.cost === cost));
  }), [query, filter, cost]);
  const add = (c: CardDef) => {
    if (c.kind === 'power' || c.kind === 'token') { notify('Эта карта создаётся во время боя и не добавляется в колоду.'); return; }
    if (draft.length >= 30) { notify('Колода полна. Сначала уберите карту кнопкой «−».'); return; }
    const limit = c.rarity === 'legendary' ? 1 : 3;
    if (draft.filter(id => id === c.id).length >= limit) { notify(`Для этой карты разрешено копий: ${limit}.`); return; }
    setDraft([...draft, c.id]);
  };
  const unique = [...new Set(draft)].sort((a, b) => CARD[a].cost - CARD[b].cost);
  return <section className="collection-page page-enter">
    <button className="text-button back-button" onClick={back}><ArrowLeft size={16} /> В главное меню</button>
    <div className="page-heading"><div><div className="eyebrow"><span /> ТВОЯ ИСТОРИЯ В КАРТАХ</div><h1>Моя коллекция<span className="heading-dot">.</span></h1><p>Знакомые лица. Совершенно незнакомые способности.</p></div>
      <button className="button secondary" onClick={() => { if (!building) setDraft([...deck]); setBuilding(!building); }}><Layers3 size={18} />{building ? 'Скрыть колоду' : 'Изменить колоду'}<span className="count-pill">30</span></button>
    </div>
    <div className="collection-toolbar"><div className="collection-tabs" role="tablist" aria-label="Категории карт">
      {[['all', 'Все карты'], ['custom', 'Твои мемы'], ['legendary', 'Легендарные'], ['minion', 'Существа'], ['spell', 'Заклинания'], ['hero', 'Герои']].map(([id, label]) => <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}{id === 'all' && <span>{CARDS.length}</span>}</button>)}
    </div><label className="search-box"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти карту…" aria-label="Поиск карт" />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={14} /></button>}</label></div>
    <div className="collection-filters"><span><SlidersHorizontal size={15} /> Стоимость маны</span><div className="mana-filters"><button className={cost === null ? 'active' : ''} onClick={() => setCost(null)}>Все</button>{Array.from({ length: 8 }, (_, n) => <button key={n} className={cost === n ? 'active' : ''} onClick={() => setCost(cost === n ? null : n)} aria-label={`Стоимость ${n === 7 ? '7 и больше' : n}`}>{n === 7 ? '7+' : n}</button>)}</div><span className="results-count">Найдено: {filtered.length}</span></div>
    <div className={`collection-content ${building ? 'with-builder' : ''}`}><div>
      <div className="card-grid">{filtered.map(c => <div className="collection-card-wrap" key={c.id}><Card card={c} onClick={() => inspect(c)} />{building && c.kind !== 'power' && c.kind !== 'token' && <button className="add-card" aria-label={`Добавить ${c.name}`} onClick={() => add(c)}><Plus size={15} /> В колоду <span>{draft.filter(id => id === c.id).length}</span></button>}</div>)}</div>
      {!filtered.length && <div className="empty-state"><Search size={32} /><h3>Карты спрятались</h3><p>Попробуй другое название или убери фильтры.</p><button className="button secondary" onClick={() => { setQuery(''); setFilter('all'); setCost(null); }}>Сбросить фильтры</button></div>}
    </div>{building && <aside className="deck-builder"><div className="deck-heading"><Layers3 size={22} /><div><h3>Твои правила</h3><span>Тестовая колода</span></div><strong className={draft.length === 30 ? 'complete' : ''}>{draft.length}<small>/30</small></strong></div>
      <div className="deck-mana-curve" aria-label="Кривая маны">{Array.from({ length: 8 }, (_, n) => <div key={n}><div className="curve-track"><i style={{ height: `${Math.min(100, draft.filter(id => n === 7 ? CARD[id].cost >= 7 : CARD[id].cost === n).length * 13)}%` }} /></div><span>{n === 7 ? '7+' : n}</span></div>)}</div>
      <div className="deck-list">{unique.map(id => <div key={id} className="deck-row"><span className="mini-mana">{CARD[id].cost}</span><button className="deck-row-name" onClick={() => inspect(CARD[id])}>{CARD[id].name}</button><span className="deck-quantity">×{draft.filter(x => x === id).length}</span><button className="icon-button" aria-label={`Убрать ${CARD[id].name}`} onClick={() => { const copy = [...draft]; copy.splice(copy.indexOf(id), 1); setDraft(copy); }}><Minus size={14} /></button></div>)}</div>
      {!draft.length && <p className="deck-empty">Нажимай «В колоду» под картами, чтобы собрать свою комбинацию.</p>}
      <p className="deck-rule">1 копия легендарной карты, до 3 копий остальных. Всего 30 карт.</p>
      <button className="button primary deck-save" disabled={!!deckError(draft)} onClick={() => { saveDeck(draft); notify('Колода сохранена. Увидимся за столом!'); }}><Check size={17} /> Сохранить колоду</button>
      <button className="text-button deck-reset" onClick={() => setDraft([...STARTER_DECK])}><RotateCcw size={13} /> Стартовая колода</button><button className="text-button deck-reset" onClick={() => setDraft([])}>Очистить колоду</button>
    </aside>}</div>
    <div className="collection-note"><Sparkles size={16} /><p>Все карты открыты с самого начала. Нажми на карту, чтобы узнать её историю и эффект.</p><ChevronDown size={15} /></div>
  </section>;
}
