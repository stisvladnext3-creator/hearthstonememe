import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Menu, Settings2, Sparkles, X } from 'lucide-react';
import { CARDS, type CardDef } from './game/cards';
import { act, chooseBotAction, createGame, expireMulligan, type Action } from './game/engine';
import { loadGame, loadStats, read, write } from './storage';
import { Art } from './components/Card';
import Collection from './components/Collection';
import Battle from './components/Battle';
import Modal from './components/Modal';
import WoodMenu from './components/WoodMenu';
import BoardPicker from './components/BoardPicker';
import Online from './components/Online';
import { battleground, type BattlegroundId } from './battlegrounds';
import { useViewport } from './useViewport';
import type { InspectionInfo, Inspect } from './inspection';
import AboutDialog from './components/AboutDialog';
import CardDetails from './components/CardDetails';
import HelpDialog from './components/HelpDialog';
import SettingsDialog from './components/SettingsDialog';
import CardWorkshop from './components/CardWorkshop';
import DeckPicker from './components/DeckPicker';
import type { HeroClass } from './game/classes';
import { createDeck, DECK_LIMIT, deckName, draftError, loadDeckBook, readyDeck, saveDeckBook, type SavedDeck } from './decks';

type Page = 'home' | 'collection' | 'battle' | 'rooms' | 'editor';
type Settings = { sound: boolean; motion: boolean; board: BattlegroundId };
function Logo({ small = false }: { small?: boolean }) {
  return <span className={`brand ${small ? 'small' : ''}`}><span className="brand-gem"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="m20 3 15 9v17l-15 9-15-9V12Z" /><path d="m21 10 8 5-1 12-11 4-7-9 4-9 9-1 4 7-5 5-5-4 3-4 2 2" /></svg></span><span>MEME<span>STONE</span><small>ТВОИ КАРТЫ. ТВОИ ПРАВИЛА.</small></span></span>;
}
export default function App() {
  const viewport = useViewport();
  useEffect(() => { document.documentElement.style.setProperty('--app-height', `${viewport.height}px`); }, [viewport.height]);
  const [page, setPage] = useState<Page>(() => new URLSearchParams(location.search).has('room') ? 'rooms' : 'home');
  const [onlineBattle, setOnlineBattle] = useState(false);
  const [deckBook, setDeckBook] = useState(loadDeckBook);
  const selectedDeck = deckBook.decks.find(d => d.id === deckBook.selectedId) ?? null;
  const deck = selectedDeck?.cards ?? [];
  const [cardRevision, setCardRevision] = useState(0);
  const [game, setGame] = useState(loadGame);
  const [stats, setStats] = useState(loadStats);
  const [modal, setModal] = useState<'help' | 'settings' | 'about' | 'fields' | 'decks' | null>(null);
  const [deckPickerLabel, setDeckPickerLabel] = useState('Играть');
  const deckRequest = useRef<((deck: SavedDeck) => void) | null>(null);
  const [inspected, setInspected] = useState<CardDef | null>(null);
  const [inspectInfo, setInspectInfo] = useState<InspectionInfo | undefined>(undefined);
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => { const s = read<Settings | null>('settings', null); return { sound: s?.sound === true, motion: s?.motion !== false, board: battleground(s?.board).id }; });
  const audio = useRef<AudioContext | null>(null);
  const botBudget = useRef({ turn: '', actions: 0 });
  const notify = useCallback((text: string) => setToast(text), []);
  const sound = useCallback(() => {
    if (!settings.sound) return;
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
      const osc = audio.current.createOscillator(), gain = audio.current.createGain();
      osc.connect(gain); gain.connect(audio.current.destination);
      osc.type = 'sine'; osc.frequency.setValueAtTime(520, audio.current.currentTime);
      osc.frequency.exponentialRampToValueAtTime(260, audio.current.currentTime + 0.12);
      gain.gain.setValueAtTime(0.07, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.current.currentTime + 0.18);
      osc.start(); osc.stop(audio.current.currentTime + 0.19);
    } catch { /* Sound is optional in browsers without Web Audio. */ }
  }, [settings.sound]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { write('settings', settings); document.documentElement.classList.toggle('reduce-motion', !settings.motion); }, [settings]);
  useEffect(() => { if (!saveDeckBook(deckBook)) notify('Браузер не разрешил сохранение колод. Они доступны до закрытия вкладки.'); }, [deckBook, notify]);
  useEffect(() => {
    if (!game) return;
    write('game', game.winner ? null : game);
    if (game.winner && stats.lastResult !== game.id) {
      const next = { wins: stats.wins + (game.winner === 'player' ? 1 : 0), games: stats.games + 1, lastResult: game.id };
      setStats(next); write('stats', next);
    }
  }, [game, stats]);
  useEffect(() => {
    if (page !== 'battle' || !game || game.winner || !game.mulligan && (modal || inspected)) return;
    if (game.mulligan ? game.mulligan.ready.bot : game.active !== 'bot') return;
    const timeout = window.setTimeout(() => {
      const turn = game.id + ':' + game.turn;
      if (botBudget.current.turn !== turn) botBudget.current = { turn, actions: 0 };
      const action: Action = !game.mulligan && !game.discovery && botBudget.current.actions++ >= 60 ? { type: 'end' } : chooseBotAction(game);
      const result = act(game, 'bot', action);
      if (result.error) { console.error('Bot action failed:', result.error); setGame(act(game, 'bot', { type: 'end' }).state); }
      else setGame(result.state);
    }, settings.motion ? 700 : 100);
    return () => clearTimeout(timeout);
  }, [page, game, modal, inspected, settings.motion]);
  useEffect(() => {
    if (!game?.mulligan) return;
    const timer = setInterval(() => setGame(current => current ? expireMulligan(current) : current), 250);
    return () => clearInterval(timer);
  }, [game?.mulligan?.deadline]);
  const navigate = (next: Page) => { sound(); setPage(next); setMobileNav(false); window.scrollTo({ top: 0 }); };
  const newMatch = (chosen: SavedDeck) => { setGame(createGame(chosen.cards, Date.now(), undefined, Date.now() + 30_000, { player: chosen.heroClass })); navigate('battle'); };
  const chooseDeck = (done?: (chosen: SavedDeck) => void, label = 'Выбрать колоду') => { deckRequest.current = done ?? null; setDeckPickerLabel(label); setModal('decks'); };
  const start = () => { if (!game || game.winner) chooseDeck(newMatch, 'Играть'); else navigate('battle'); };
  const rematch = () => chooseDeck(newMatch, 'Новый бой');
  const dispatch = (action: Action) => {
    if (!game) return;
    const current = expireMulligan(game);
    if (current !== game) setGame(current);
    const result = act(current, 'player', action);
    if (result.error) notify(result.error);
    else { setGame(result.state); sound(); }
  };
  const saveDeck = (ids: string[], name?: string) => {
    const error = draftError(ids, selectedDeck?.heroClass); if (error) { notify(error); return; }
    setDeckBook(book => ({ ...book, decks: book.decks.map(d => d.id === book.selectedId ? { ...d, cards: [...ids], name: name === undefined ? d.name : deckName(name) } : d) }));
  };
  const selectDeck = (id: string) => setDeckBook(book => book.decks.some(d => d.id === id) ? { ...book, selectedId: id } : book);
  const addDeck = (heroClass: HeroClass, name: string, starter: boolean) => {
    if (deckBook.decks.length >= DECK_LIMIT) { notify(`Можно сохранить до ${DECK_LIMIT} колод. Удали ненужную колоду, чтобы создать новую.`); return null; }
    const created = createDeck(heroClass, name, starter);
    setDeckBook(book => ({ ...book, decks: [...book.decks, created], selectedId: created.id })); return created;
  };
  const deleteDeck = (id: string) => setDeckBook(book => { const decks = book.decks.filter(d => d.id !== id); return { ...book, decks, selectedId: book.selectedId === id ? decks[0]?.id ?? null : book.selectedId }; });
  const inspect: Inspect = useCallback((c: CardDef, info?: InspectionInfo) => { setInspected(c); setInspectInfo(info); }, []);
  const closeModal = useCallback(() => setModal(null), []);
  const closeCard = useCallback(() => { setInspected(null); setInspectInfo(undefined); }, []);
  return <div className={`app ${page === 'battle' || page === 'rooms' && onlineBattle ? 'in-battle' : page === 'home' ? 'wood-home' : page === 'collection' ? 'collection-home' : 'parchment-view'}`}>
    <header className="site-header"><div className="header-inner"><button className="logo-button" onClick={() => navigate('home')} aria-label="Memestone — главная"><Logo /></button>
      <nav className={mobileNav ? 'open' : ''} aria-label="Главная навигация"><button className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')}>Главная</button><button className={page === 'collection' ? 'active' : ''} onClick={() => navigate('collection')}>Коллекция<span className="nav-count">{CARDS.length}</span></button><button onClick={() => { setModal('help'); setMobileNav(false); }}>Как играть <ArrowUpRight size={13} /></button>{game && !game.winner && <button className={page === 'battle' ? 'active' : ''} onClick={() => navigate('battle')}>Текущий бой<span className="live-dot" /></button>}</nav>
      <div className="header-actions"><span className="alpha-tag">ALPHA 0.15.0</span><span className="header-divider" /><button className="icon-button" onClick={() => setModal('settings')} aria-label="Настройки"><Settings2 size={20} /></button><button className="avatar-button" onClick={() => setModal('about')} aria-label="Профиль игрока"><Art index={10} /><span /></button><button className="icon-button mobile-menu-toggle" onClick={() => setMobileNav(!mobileNav)} aria-label="Открыть навигацию">{mobileNav ? <X size={22} /> : <Menu size={22} />}</button></div>
    </div></header>
    <main className="main-container">
      {page === 'home' && <WoodMenu deckName={selectedDeck?.name ?? 'Нет колоды'} chooseDeck={() => chooseDeck(newMatch, 'Играть')} rooms={() => navigate('rooms')} resume={!!game && !game.winner} start={start} collection={() => { navigate('collection'); }} help={() => setModal('help')} settings={() => setModal('settings')} profile={() => setModal('about')} wins={stats.wins} />}
      {page === 'collection' && <Collection deckInfo={selectedDeck} decks={deckBook.decks} selectDeck={selectDeck} createDeck={addDeck} deleteDeck={deleteDeck} saveDeck={saveDeck} inspect={inspect} back={() => navigate('home')} notify={notify} editCards={() => navigate('editor')} revision={cardRevision} />}
      {page === 'editor' && <CardWorkshop back={() => navigate('collection')} notify={notify} changed={() => setCardRevision(n => n + 1)} deck={deckBook.decks.flatMap(d => d.cards)} />}
      {page === 'battle' && game && <Battle settings={() => setModal('settings')} board={settings.board} chooseBoard={() => setModal('fields')} overlayOpen={!!modal || !!inspected} animations={settings.motion} game={game} dispatch={dispatch} back={() => navigate('home')} rematch={rematch} inspect={inspect} help={() => setModal('help')} />}
      <Online selectedDeck={selectedDeck} chooseDeck={chooseDeck} active={page === 'rooms'} board={settings.board} animations={settings.motion} overlayOpen={!!modal || !!inspected} inspect={inspect} settings={() => setModal('settings')} help={() => setModal('help')} chooseBoard={() => setModal('fields')} home={() => navigate('home')} battleChanged={setOnlineBattle} />
    </main>
    <footer className="site-footer"><div><Logo small /><span>Создано для своих.</span></div><p>Независимый фан-проект. Не связан с Blizzard Entertainment.</p><button className="text-button" onClick={() => setModal('about')}>О проекте <ArrowUpRight size={13} /></button></footer>
    {toast && <div className="toast" role="status"><Sparkles size={18} /><span>{toast}</span><button className="icon-button" aria-label="Скрыть сообщение" onClick={() => setToast('')}><X size={15} /></button></div>}
    {inspected && <CardDetails card={inspected} info={inspectInfo} close={closeCard} notify={notify} />}
    {modal === 'help' && <HelpDialog close={closeModal} />}
    {modal === 'settings' && <SettingsDialog value={settings} change={setSettings} close={closeModal} />}
    {modal === 'decks' && <DeckPicker decks={deckBook.decks} selectedId={deckBook.selectedId} select={selectDeck} close={() => { deckRequest.current = null; closeModal(); }} actionLabel={deckPickerLabel} confirm={chosen => { if (!readyDeck(chosen)) return; const done = deckRequest.current; deckRequest.current = null; closeModal(); done?.(chosen); }} manage={() => { deckRequest.current = null; closeModal(); navigate('collection'); }} />}
    {modal === 'fields' && <Modal title="Выбор игрового поля" close={closeModal} className="fields-modal"><span className="eyebrow">ТВОЯ АРЕНА</span><h2>Выбери место для боя</h2><BoardPicker value={settings.board} change={board => setSettings({ ...settings, board })} /><button className="button primary" onClick={closeModal}>Вернуться в бой <Check size={16} /></button></Modal>}
    {modal === 'about' && <AboutDialog stats={stats} deckSize={deck.length} close={closeModal} help={() => { closeModal(); setModal('help'); }} />}
  </div>;
}
