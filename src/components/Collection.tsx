import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Check, ChevronLeft, ChevronRight, Crown, Flame, Layers3, Minus, Paintbrush, Plus, RotateCcw, Search, Shield, Sparkles, Swords, Trash2, X } from 'lucide-react';
import { CARDS, CARD, STARTER_DECK, deckCopyLimit, deckError, classDeck, type CardDef } from '../game/cards';
import { Art, Card } from './Card';
import { useViewport } from '../useViewport';
import { DECK_LIMIT, readyDeck, type SavedDeck } from '../decks';
import { belongsToClass, HERO_CLASSES, matchesClass, type HeroClass } from '../game/classes';
import HeroClassPicker from './HeroClassPicker';
import { ClassSymbol } from './DeckPicker';
import Modal from './Modal';

const TABS = [
  { id: 'all', label: 'Все карты', icon: <BookOpen /> },
  { id: 'created', label: 'Мои карты', icon: <Plus /> },
  { id: 'custom', label: 'Твои мемы', icon: <Sparkles /> },
  { id: 'legendary', label: 'Легендарные', icon: <Crown /> },
  { id: 'minion', label: 'Существа', icon: <Swords /> },
  { id: 'spell', label: 'Заклинания', icon: <Flame /> },
  { id: 'hero', label: 'Герои', icon: <Shield /> },
];
export default function Collection({ deckInfo, decks, selectDeck, createDeck, deleteDeck, saveDeck, inspect, back, notify, editCards, revision }: {
  deckInfo: SavedDeck | null; decks: SavedDeck[]; selectDeck: (id: string) => void;
  createDeck: (heroClass: HeroClass, name: string, starter: boolean) => SavedDeck | null; deleteDeck: (id: string) => void;
  saveDeck: (ids: string[], name?: string) => void; inspect: (c: CardDef) => void; back: () => void; notify: (text: string) => void;
  editCards: () => void; revision: number;
}) {
  const deck = deckInfo?.cards ?? [];
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [cost, setCost] = useState<number | null>(null);
  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState([...deck]);
  const [draftName, setDraftName] = useState(deckInfo?.name ?? '');
  const [creating, setCreating] = useState(false), [newClass, setNewClass] = useState<HeroClass>('mage'), [newName, setNewName] = useState('Новая колода'), [starter, setStarter] = useState(true);
  const [deleting, setDeleting] = useState<SavedDeck | null>(null), [libraryPage, setLibraryPage] = useState(0);
  useEffect(() => { setDraft([...(deckInfo?.cards ?? [])]); setDraftName(deckInfo?.name ?? ''); }, [deckInfo?.id]);
  const [page, setPage] = useState(1);
  const size = useViewport(), pageSize = 8;
  const [deckPage, setDeckPage] = useState(1);
  const deckPageSize = Math.max(3, Math.floor((size.height - (size.width < 600 ? 300 : 350)) / (size.width < 600 ? 21 : 24)));
  useEffect(() => setPage(1), [query, filter, cost, classFilter]);
  const filtered = useMemo(() => CARDS.filter(c => {
    const text = `${c.name} ${c.text} ${c.tribe ?? ''}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === 'all' || (filter === 'created' ? !!c.editor : filter === 'custom' ? c.custom : filter === 'legendary' ? c.rarity === 'legendary' : c.kind === filter))
      && matchesClass(c, classFilter) && (cost === null || (cost === 7 ? c.cost >= 7 : c.cost === cost));
  }).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, 'ru')), [query, filter, cost, classFilter, revision]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  const shownDeck = building ? draft : deck;
  const add = (c: CardDef) => {
    if (c.kind === 'power' || c.kind === 'token' || c.reward) { notify('Эта карта создаётся во время боя и не добавляется в колоду.'); return; }
    if (deckInfo && !belongsToClass(c, deckInfo.heroClass)) { notify('Эта карта принадлежит другому классу.'); return; }
    if (draft.length >= 30) { notify('Колода полна. Сначала уберите карту кнопкой «−».'); return; }
    const limit = deckCopyLimit(c);
    if (draft.filter(id => id === c.id).length >= limit) { notify(`Для этой карты разрешено копий: ${limit}.`); return; }
    updateDraft([...draft, c.id]);
  };
  const unique = [...new Set(shownDeck)].sort((a, b) => CARD[a].cost - CARD[b].cost || CARD[a].name.localeCompare(CARD[b].name, 'ru'));
  const deckPages = Math.max(1, Math.ceil(unique.length / deckPageSize)), shownDeckPage = Math.min(deckPage, deckPages);
  const updateDraft = (ids: string[]) => { setDraft(ids); saveDeck(ids, draftName); };
  const startEditing = (chosen: SavedDeck) => { selectDeck(chosen.id); setDraft([...chosen.cards]); setDraftName(chosen.name); setBuilding(true); setDeckPage(1); };
  const libraryPageSize = Math.min(8, Math.max(3, Math.floor((size.height - 180) / 65)));
  const libraryPages = Math.max(1, Math.ceil(decks.length / libraryPageSize)), libraryCurrent = Math.min(libraryPage, libraryPages - 1);
  const newDeck = () => { if (decks.length >= DECK_LIMIT) { notify(`Можно сохранить до ${DECK_LIMIT} колод.`); return; } setNewName('Новая колода'); setNewClass('mage'); setStarter(true); setCreating(true); };
  return <section className={`collection-page collection-album collection-v2 page-enter ${building ? 'collection-building' : ''}`}>
    <div className="album-layout"><div className="album-main">
      <div className="book-tabs class-book-tabs" role="tablist" aria-label="Классы карт">{(Object.keys(HERO_CLASSES) as HeroClass[]).map(id => <button key={id} role="tab" aria-selected={classFilter === id} className={`book-tab class-book-tab ${id} ${classFilter === id ? 'active' : ''}`} onClick={() => setClassFilter(id)} aria-label={`Карты класса ${HERO_CLASSES[id].name}`} title={HERO_CLASSES[id].name}><Art index={HERO_CLASSES[id].art} cardId={HERO_CLASSES[id].hero} /><ClassSymbol heroClass={id} /></button>)}
        <button role="tab" aria-selected={classFilter === 'neutral'} className={`book-tab neutral ${classFilter === 'neutral' ? 'active' : ''}`} onClick={() => setClassFilter('neutral')} aria-label="Общие карты" title="Общие карты"><BookOpen /></button>
        <button className="book-tab workshop-brush" onClick={editCards} aria-label="Редактор карт" title="Редактор карт"><Paintbrush /></button>
        <button role="tab" aria-selected={classFilter === 'class'} className={`book-tab ${classFilter === 'class' ? 'active' : ''}`} onClick={() => setClassFilter('class')} aria-label="Классовые карты" title="Все классовые карты"><Shield /></button>
        <button role="tab" aria-selected={classFilter === 'all'} className={`book-tab ${classFilter === 'all' ? 'active' : ''}`} onClick={() => setClassFilter('all')} aria-label="Все классы" title="Все карты"><Layers3 /></button>
      </div>
      <div className="book-paper"><span className="paper-corner tl" /><span className="paper-corner tr" /><span className="paper-corner bl" /><span className="paper-corner br" />
        <div className="book-heading"><span>❧</span><h1>{classFilter === 'all' ? filter === 'all' ? 'Моя коллекция' : TABS.find(t => t.id === filter)?.label : classFilter === 'neutral' ? 'Общие карты' : classFilter === 'class' ? 'Классовые карты' : HERO_CLASSES[classFilter as HeroClass].name}</h1><span>❧</span></div>
        <div className="card-grid album-card-grid">{visible.map(c => <div className="collection-card-wrap" key={c.id}><Card card={c} onClick={() => inspect(c)} /><span className="album-owned" title={c.kind === 'power' || c.kind === 'token' || c.reward ? 'Создаётся во время боя' : 'Доступно копий в колоде'}>{c.reward ? 'Награда за задачу' : c.kind === 'power' ? 'Сила героя' : c.kind === 'token' ? 'Призыв' : `×${deckCopyLimit(c)}`}</span>{building && c.kind !== 'power' && c.kind !== 'token' && !c.reward && <button className="add-card" aria-label={`Добавить ${c.name}`} disabled={!!deckInfo && !belongsToClass(c, deckInfo.heroClass)} onClick={() => add(c)}><Plus size={15} /> В колоду <span>{draft.filter(id => id === c.id).length}</span></button>}</div>)}</div>
        {!filtered.length && <div className="empty-state"><Search size={32} /><h3>Карты спрятались</h3><p>Попробуй другое название или убери фильтры.</p><button className="button secondary" onClick={() => { setQuery(''); setFilter('all'); setClassFilter('all'); setCost(null); }}>Сбросить фильтры</button></div>}
        <div className="book-pagination"><button disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Предыдущая страница"><ChevronLeft size={25} /></button><span role="status">Страница <b>{current}</b> из {pages}</span><button disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Следующая страница"><ChevronRight size={25} /></button></div>
      </div>
      <div className="book-controls"><select className="album-type-filter" aria-label="Тип и редкость карт" value={filter} onChange={e => setFilter(e.target.value)}>{TABS.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}</select><div className="mana-filters" aria-label="Стоимость маны"><button className={cost === null ? 'active' : ''} onClick={() => setCost(null)} aria-label="Любая стоимость"><BookOpen size={19} /></button>{Array.from({ length: 8 }, (_, n) => <button key={n} className={cost === n ? 'active' : ''} onClick={() => setCost(cost === n ? null : n)} aria-label={`Стоимость ${n === 7 ? '7 и больше' : n}`}>{n === 7 ? '7+' : n}</button>)}</div>
        <label className="search-box"><Search size={19} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти карту…" aria-label="Поиск карт" />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={17} /></button>}</label>
      </div><div className="album-caption"><span>Найдено: {filtered.length}</span><span>Нажми на карту, чтобы прочитать описание</span></div>
    </div>
    <aside className={`album-deck-sidebar ${building ? 'editing-deck' : 'deck-library-sidebar'}`}>
    {!building ? <><h2>Мои колоды <small>{decks.length}/{DECK_LIMIT}</small></h2><div className="deck-library-list">{decks.slice(libraryCurrent * libraryPageSize, (libraryCurrent + 1) * libraryPageSize).map(d => <button key={d.id} className={'album-deck-banner ' + d.heroClass + (d.id === deckInfo?.id ? ' active-deck' : '')} aria-label={`Редактировать колоду ${d.name}`} onClick={() => startEditing(d)}><Art index={HERO_CLASSES[d.heroClass].art} cardId={HERO_CLASSES[d.heroClass].hero} /><span><strong>{d.name}</strong><small>{HERO_CLASSES[d.heroClass].name} · {d.cards.length}/30 · {readyDeck(d) ? 'Готова' : 'Черновик'}</small></span><ClassSymbol heroClass={d.heroClass} /></button>)}</div>
      {!decks.length && <p className="deck-empty">Создай колоду и выбери её класс.</p>}
      <div className="deck-library-pagination"><button aria-label="Предыдущие колоды" disabled={libraryCurrent === 0} onClick={() => setLibraryPage(libraryCurrent - 1)}><ChevronLeft size={18} /></button><span>{libraryCurrent + 1}/{libraryPages}</span><button aria-label="Следующие колоды" disabled={libraryCurrent + 1 === libraryPages} onClick={() => setLibraryPage(libraryCurrent + 1)}><ChevronRight size={18} /></button></div>
      <button className="button primary create-deck-button" onClick={newDeck}><Plus size={17} />Создать колоду</button><p className="deck-library-hint">У каждой колоды свой класс. Перед матчем выбирай готовую колоду.</p>
    </> : <><div className="deck-edit-heading"><button className="text-button" aria-label="К списку колод" onClick={() => { setBuilding(false); }}><ArrowLeft size={17} />Мои колоды</button><button className="icon-button" aria-label="Удалить колоду" onClick={() => setDeleting(deckInfo)}><Trash2 size={17} /></button></div>
      <label className="deck-name-editor">Название<input aria-label="Название колоды" value={draftName} maxLength={32} onChange={e => { setDraftName(e.target.value); saveDeck(draft, e.target.value); }} /></label>
      <div className="deck-edit-class"><ClassSymbol heroClass={deckInfo?.heroClass ?? 'mage'} /><strong>{HERO_CLASSES[deckInfo?.heroClass ?? 'mage'].name}</strong><span>{shownDeck.length}/30</span></div>
      <div className="deck-mana-curve" aria-label="Кривая маны">{Array.from({ length: 8 }, (_, n) => <div key={n}><div className="curve-track"><i style={{ height: `${Math.min(100, shownDeck.filter(id => n === 7 ? CARD[id].cost >= 7 : CARD[id].cost === n).length * 13)}%` }} /></div><span>{n === 7 ? '7+' : n}</span></div>)}</div>
      <div className="deck-list">{unique.slice((shownDeckPage - 1) * deckPageSize, shownDeckPage * deckPageSize).map(id => <div key={id} className="deck-row"><span className="mini-mana">{CARD[id].cost}</span><button className="deck-row-name" onClick={() => inspect(CARD[id])}>{CARD[id].name}</button><span className="deck-quantity">×{shownDeck.filter(x => x === id).length}</span><button className="icon-button" aria-label={`Убрать ${CARD[id].name}`} onClick={() => { const copy = [...draft]; copy.splice(copy.indexOf(id), 1); updateDraft(copy); }}><Minus size={16} /></button></div>)}</div>
      {deckPages > 1 && <div className="deck-pagination"><button aria-label="Предыдущая страница колоды" disabled={shownDeckPage <= 1} onClick={() => setDeckPage(shownDeckPage - 1)}><ChevronLeft size={18} /></button><span>{shownDeckPage} / {deckPages}</span><button aria-label="Следующая страница колоды" disabled={shownDeckPage >= deckPages} onClick={() => setDeckPage(shownDeckPage + 1)}><ChevronRight size={18} /></button></div>}
      {!shownDeck.length && <p className="deck-empty">Нажимай «В колоду» под картами, чтобы собрать свою комбинацию.</p>}
      <p className="deck-rule">Обычная ×3 · Редкая ×3 · Эпическая ×2 · Легендарная ×1. Всего 30 карт.</p><div className="deck-editor-actions"><button className="button primary deck-save" disabled={!draftName.trim()} onClick={() => { saveDeck(draft, draftName); setBuilding(false); notify(deckError(draft) ? 'Черновик сохранён. Для боя нужно 30 карт.' : 'Колода сохранена.'); }}><Check size={17} /> Сохранить колоду</button><button className="text-button deck-reset" onClick={() => updateDraft(classDeck(STARTER_DECK, deckInfo?.heroClass ?? 'mage'))}><RotateCcw size={15} /> Стартовая колода</button><button className="text-button deck-reset" onClick={() => updateDraft([])}>Очистить колоду</button></div>
    </>}
      <button className="album-back" onClick={back}><ArrowLeft size={18} />Назад</button>
    </aside></div>
    {creating && <HeroClassPicker value={newClass} change={setNewClass} name={newName} changeName={setNewName} starter={starter} changeStarter={setStarter} close={() => setCreating(false)} confirm={() => { const created = createDeck(newClass, newName, starter); if (created) { setDraft([...created.cards]); setDraftName(created.name); setBuilding(true); setCreating(false); setDeckPage(1); } }} />}
    {deleting && <Modal title="Удаление колоды" close={() => setDeleting(null)} className="small-modal"><h2>Удалить «{deleting.name}»?</h2><p>Карты останутся в коллекции.</p><button className="button danger" onClick={() => { deleteDeck(deleting.id); setDeleting(null); setBuilding(false); }}>Удалить колоду</button><button className="button secondary" onClick={() => setDeleting(null)}>Отмена</button></Modal>}
  </section>;
}
