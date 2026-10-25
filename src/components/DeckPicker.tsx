import { useState } from 'react';
import { BookOpen, Check, ChevronLeft, ChevronRight, Layers3, Plus, Shield, Skull, Sparkles, Swords, Wind } from 'lucide-react';
import { HERO_CLASSES, type HeroClass } from '../game/classes';
import { powerCardId } from '../game/presentation';
import { DECK_LIMIT, readyDeck, type SavedDeck } from '../decks';
import { phoneScreen, useViewport } from '../useViewport';
import { Art } from './Card';
import Modal from './Modal';

export function ClassSymbol({ heroClass }: { heroClass: HeroClass }) {
  return heroClass === 'warrior' ? <Shield /> : heroClass === 'warlock' ? <Skull /> : heroClass === 'storm' ? <Wind /> : <Sparkles />;
}
export default function DeckPicker({ decks, selectedId, select, confirm, close, manage, actionLabel = 'Играть' }: {
  decks: SavedDeck[]; selectedId: string | null; select: (id: string) => void; confirm: (deck: SavedDeck) => void;
  close: () => void; manage: () => void; actionLabel?: string;
}) {
  const size = useViewport(), phone = phoneScreen(size), landscape = size.width > size.height;
  const pageSize = phone ? landscape ? 6 : 4 : 9;
  const [page, setPage] = useState(() => Math.max(0, Math.floor(decks.findIndex(d => d.id === selectedId) / pageSize)));
  const pages = Math.max(1, Math.ceil((decks.length + (decks.length < DECK_LIMIT ? 1 : 0)) / pageSize)), shownPage = Math.min(page, pages - 1);
  const current = decks.find(d => d.id === selectedId), hero = current ? HERO_CLASSES[current.heroClass] : null;
  const slots = Array.from({ length: pageSize }, (_, n) => decks[shownPage * pageSize + n]);
  return <Modal title="Выбор колоды" close={close} className="deck-picker-modal">
    <header className="deck-picker-heading"><span>◆</span><h2>Выбери свою колоду</h2><span>◆</span></header>
    <div className="deck-picker-layout"><section className="deck-cabinet" aria-label="Сохранённые колоды">
      <div className="deck-slot-grid">{slots.map((deck, i) => deck ? <button key={deck.id} className={`deck-slot ${deck.heroClass} ${deck.id === selectedId ? 'chosen' : ''} ${readyDeck(deck) ? '' : 'draft'}`} aria-pressed={deck.id === selectedId} aria-label={`Колода ${deck.name}, ${HERO_CLASSES[deck.heroClass].name}`} onClick={() => select(deck.id)}>
        <div className="deck-slot-banner"><Art index={HERO_CLASSES[deck.heroClass].art} cardId={HERO_CLASSES[deck.heroClass].hero} /><strong>{deck.name}</strong></div>
        <span className="deck-slot-class"><ClassSymbol heroClass={deck.heroClass} /><small>{HERO_CLASSES[deck.heroClass].name}</small></span><span className="deck-slot-count">{deck.cards.length}/30{!readyDeck(deck) && ' · Черновик'}</span>{deck.id === selectedId && <Check className="deck-chosen-mark" size={17} />}
      </button> : <button key={'empty-' + i} className="deck-slot empty-deck-slot" onClick={manage} aria-label="Создать новую колоду"><Plus /><span>Новая колода</span></button>)}</div>
      <nav className="deck-picker-pages" aria-label="Страницы колод"><button disabled={shownPage === 0} aria-label="Предыдущая страница колод" onClick={() => setPage(shownPage - 1)}><ChevronLeft /></button><span>{shownPage + 1} / {pages}</span><button disabled={shownPage + 1 === pages} aria-label="Следующая страница колод" onClick={() => setPage(shownPage + 1)}><ChevronRight /></button></nav>
      <button className="deck-collection-link" onClick={manage}><BookOpen size={18} />Моя коллекция</button>
    </section><aside className={'deck-hero-preview ' + (current?.heroClass ?? '')}>
      {current && hero ? <><span className="deck-preview-class"><ClassSymbol heroClass={current.heroClass} />{hero.name}</span><div className="deck-preview-portrait"><Art index={hero.art} cardId={hero.hero} /><span className="deck-preview-power"><Art index={hero.art} cardId={powerCardId(hero.power)} /><b>{hero.cost}</b></span></div>
        <h3>{current.name}</h3><div className="deck-preview-ability"><strong>{hero.powerName}</strong><p>{hero.description}</p><small>{hero.cost} маны · раз за ход</small></div><span className="deck-preview-count"><Layers3 size={16} />{current.cards.length}/30 карт{!readyDeck(current) && ' · нужно собрать колоду'}</span>
        <button className="deck-play-button" disabled={!readyDeck(current)} onClick={() => confirm(current)}><Swords /><span>{actionLabel}</span></button></> : <><Layers3 size={60} /><h3>Создай первую колоду</h3><p>Выбери класс и собери 30 карт в коллекции.</p><button className="deck-play-button" onClick={manage}><Plus /><span>Создать</span></button></>}
    </aside></div>
  </Modal>;
}
