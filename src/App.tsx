import {unlockCardAudio} from './card-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Sparkles, X } from 'lucide-react';
import { CARD,type CardDef } from './game/cards';
import { act, chooseBotAction, createGame, expireMulligan, type Action } from './game/engine';
import { resolveCast, stageAction } from './game/card-play';
import { loadGame, loadStats, read, write, recordMatchStats } from './storage';
import Collection from './components/Collection';
import Battle from './components/Battle';
import WoodMenu from './components/WoodMenu';
import Online from './components/Online';
import { battleground } from './battlegrounds';
import { useViewport } from './useViewport';
import type { InspectionInfo, Inspect } from './inspection';
import AboutDialog from './components/AboutDialog';
import CardDetails from './components/CardDetails';
import HelpDialog from './components/HelpDialog';
import SettingsDialog, { type Settings as GameSettings, type BattleSettingsActions } from './components/SettingsDialog';
import CardWorkshop from './components/CardWorkshop';
import FullscreenButton from './components/FullscreenButton';
import DeckPicker from './components/DeckPicker';
import TrainingPicker from './components/TrainingPicker';
import {trainingBot, type TrainingBot} from './game/training-bots';
import CommunityCards from './components/CommunityCards';
import PublishDialog from './components/PublishDialog';
import { CommunityCatalog, EMPTY_CATALOG } from './community/catalog';
import type { PublishSeed } from './community/model';
import { useAccount } from './account/AccountProvider';
import { PROFILE_REFRESHED, profileKey, profileScope } from './account/scope';
import { restoreCustomCards } from './game/custom-cards';
import { observeMatch } from './account/archive';
import AuthDialog,{ type AuthMode } from './components/AuthDialog';
import MatchArchive from './components/MatchArchive';
import type { HeroClass } from './game/classes';
import { createDeck, deckLimit, deckLimitLabel, deckName, draftError, loadDeckBook, readyDeck, saveDeckBook, type SavedDeck } from './decks';

type Page = 'home' | 'collection' | 'battle' | 'rooms' | 'editor' | 'community';
function Logo({ small = false }: { small?: boolean }) {
  return <span className={`brand ${small ? 'small' : ''}`}><span className="brand-gem"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="m20 3 15 9v17l-15 9-15-9V12Z" /><path d="m21 10 8 5-1 12-11 4-7-9 4-9 9-1 4 7-5 5-5-4 3-4 2 2" /></svg></span><span>MEME<span>STONE</span><small>ТВОИ КАРТЫ. ТВОИ ПРАВИЛА.</small></span></span>;
}
export default function App() {
  const account=useAccount(),scope=profileScope();
  useEffect(()=>{document.addEventListener('pointerdown',unlockCardAudio,{passive:true});document.addEventListener('keydown',unlockCardAudio);return()=>{document.removeEventListener('pointerdown',unlockCardAudio);document.removeEventListener('keydown',unlockCardAudio);};},[]);
  const viewport = useViewport();
  useEffect(() => { document.documentElement.style.setProperty('--app-height', `${viewport.height}px`); }, [viewport.height]);
  const [page, setPage] = useState<Page>(() => new URLSearchParams(location.search).has('room') ? 'rooms' : 'home');
  const [editorBack, setEditorBack] = useState<Page>('collection');
  const [communityTab, setCommunityTab] = useState('card');
  const [publishSeed, setPublishSeed] = useState<PublishSeed>({});
  const [catalogState, setCatalogState] = useState(EMPTY_CATALOG);
  const catalog = useRef<CommunityCatalog | null>(null);
  const ensureCatalog = () => catalog.current ??= new CommunityCatalog(setCatalogState);
  useEffect(() => () => { catalog.current?.close(); catalog.current = null; }, []);
  const [onlineBattle, setOnlineBattle] = useState(false);
  const [deckBook, setDeckBook] = useState(loadDeckBook);
  const selectedDeck = deckBook.decks.find(d => d.id === deckBook.selectedId) ?? null;
  const deck = selectedDeck?.cards ?? [];
  const [cardRevision, setCardRevision] = useState(0);
  const [game, setGame] = useState(loadGame);
  const [stats, setStats] = useState(loadStats);
  const [modal, setModal] = useState<'help' | 'settings' | 'about' | 'decks' | 'publish' | 'training' | 'auth' | 'history' | null>(null);
  const [authMode,setAuthMode]=useState<AuthMode>('login');
  const [deckPickerLabel, setDeckPickerLabel] = useState('Играть');
  const deckRequest = useRef<((deck: SavedDeck) => void) | null>(null);
  const [inspected, setInspected] = useState<CardDef | null>(null);
  const [inspectInfo, setInspectInfo] = useState<InspectionInfo | undefined>(undefined);
  const [toast, setToast] = useState('');
  const [battleSettings, setBattleSettings] = useState<BattleSettingsActions | undefined>();
  const [settings, setSettings] = useState<GameSettings>(() => { const s = read<Partial<GameSettings> | null>('settings', null); return { sound: s?.sound === true, volume: typeof s?.volume === 'number' && Number.isFinite(s.volume) ? Math.max(0, Math.min(100, s.volume)) : 100, motion: s?.motion !== false, board: battleground(s?.board).id }; });
  const audio = useRef<AudioContext | null>(null);
  const [trainingDeck,setTrainingDeck] = useState<SavedDeck | null>(null);
  const botWorker = useRef<Worker | null>(null), botRequest = useRef(0);
  useEffect(() => () => botWorker.current?.terminate(), []);
  const botBudget = useRef({ turn: '', actions: 0 });
  const notify = useCallback((text: string) => setToast(text), []);
  const updateStats = useCallback((match: NonNullable<typeof game>,online=false) => {setStats(recordMatchStats(match));void observeMatch(match,online,scope).catch(()=>notify('Не удалось сохранить историю матча на устройстве.'));}, [scope,notify]);
  const updateOnlineStats=useCallback((match:NonNullable<typeof game>)=>updateStats(match,true),[updateStats]);
  const sound = useCallback(() => {
    if (!settings.sound || settings.volume === 0) return;
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
      const osc = audio.current.createOscillator(), gain = audio.current.createGain();
      osc.connect(gain); gain.connect(audio.current.destination);
      osc.type = 'sine'; osc.frequency.setValueAtTime(520, audio.current.currentTime);
      osc.frequency.exponentialRampToValueAtTime(260, audio.current.currentTime + 0.12);
      gain.gain.setValueAtTime(0.07 * settings.volume / 100, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001 * settings.volume / 100, audio.current.currentTime + 0.18);
      osc.start(); osc.stop(audio.current.currentTime + 0.19);
    } catch { /* Sound is optional in browsers without Web Audio. */ }
  }, [settings.sound, settings.volume]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { write('settings', settings); document.documentElement.classList.toggle('reduce-motion', !settings.motion); }, [settings]);
  useEffect(() => { if (!saveDeckBook(deckBook)) notify('Браузер не разрешил сохранение колод. Они доступны до закрытия вкладки.'); }, [deckBook, notify]);
  useEffect(() => {
    if (!game) return;
    write('game', game.winner ? null : game);
    updateStats(game);
  }, [game, updateStats]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === profileKey('stats')) setStats(loadStats()); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(()=>{const refresh=()=>{restoreCustomCards();setDeckBook(loadDeckBook());setStats(loadStats());setCardRevision(n=>n+1);const saved=read<Partial<GameSettings>>('settings',{});setSettings({sound:saved?.sound===true,volume:typeof saved?.volume==='number'&&Number.isFinite(saved.volume)?Math.max(0,Math.min(100,saved.volume)):100,motion:saved?.motion!==false,board:battleground(saved?.board).id});};window.addEventListener(PROFILE_REFRESHED,refresh);return()=>window.removeEventListener(PROFILE_REFRESHED,refresh);},[]);
  useEffect(()=>{if(account.recovery)setModal('auth');},[account.recovery]);
  useEffect(() => {
    if (page !== 'battle' || !game || game.winner || game.casting || !game.mulligan && (modal || inspected)) return;
    if (game.mulligan ? game.mulligan.ready.bot : game.active !== 'bot') return;
    let cancelled=false,settled=false;let fallbackTimer:ReturnType<typeof setTimeout>;
    const timeout = window.setTimeout(() => {
      const turn = game.id + ':' + game.turn;
      if (botBudget.current.turn !== turn) botBudget.current = { turn, actions: 0 };
      const finish=(action:Action)=>{
        if(cancelled||settled)return;settled=true;clearTimeout(fallbackTimer);
        if(!game.mulligan&&!game.discovery&&!game.adaptation)botBudget.current.actions++;
        const result=stageAction(game,'bot',action);
        if(result.error){console.error('Bot action failed:',result.error);setGame(act(game,'bot',{type:'end'}).state);}
        else setGame(result.state);
      };
      if(!game.mulligan&&!game.discovery&&!game.adaptation&&botBudget.current.actions>=60){finish({type:'end'});return;}
      if(game.mulligan){finish(chooseBotAction(game));return;}
      const fallback=()=>{if(!cancelled)finish(chooseBotAction(game,{maxNodes:100,depth:5,width:3}));};
      try {
        if(typeof Worker==='undefined'){fallback();return;}
        botWorker.current??=new Worker(new URL('./game/bot-worker.ts',import.meta.url),{type:'module'});
        const worker=botWorker.current,request=++botRequest.current;
        worker.onmessage=event=>{if(cancelled||event.data.request!==request)return;if(event.data.error)fallback();else finish(event.data.action);};
        worker.onerror=()=>{worker.terminate();if(botWorker.current===worker)botWorker.current=null;fallback();};
        fallbackTimer=setTimeout(()=>{worker.terminate();if(botWorker.current===worker)botWorker.current=null;fallback();},8000);
        worker.postMessage({request,game});
      } catch {fallback();}
    }, settings.motion ? 350 : 60);
    return () => {cancelled=true;clearTimeout(timeout);clearTimeout(fallbackTimer);};
  }, [page, game, modal, inspected, settings.motion]);
  useEffect(() => {
    if (!game?.casting) return;
    const endsAt=game.casting.endsAt;
    let timer:number;
    const finish=()=>{
      const remaining=endsAt-Date.now();
      if(remaining>0){timer=window.setTimeout(finish,remaining+1);return;}
      setGame(current=>current?resolveCast(current):current);
    };
    timer=window.setTimeout(finish,Math.max(0,endsAt-Date.now())+1);
    return () => clearTimeout(timer);
  }, [game?.id, game?.casting?.endsAt]);
  useEffect(() => {
    if (!game?.mulligan) return;
    const timer = setInterval(() => setGame(current => current ? expireMulligan(current) : current), 250);
    return () => clearInterval(timer);
  }, [game?.mulligan?.deadline]);
  const navigate = (next: Page) => { sound(); setPage(next); window.scrollTo({ top: 0 }); };
  const newMatch = (chosen: SavedDeck) => { setTrainingDeck(chosen);setModal('training'); };
  const startTraining = (bot:TrainingBot) => {
    if(!trainingDeck||!readyDeck(trainingDeck))return;
    const match=createGame(trainingDeck.cards,Date.now(),bot.deck,Date.now()+30_000,{player:trainingDeck.heroClass,bot:bot.heroClass});
    match.bot.name=bot.name;match.trainingBotId=bot.id;if(bot.id==='boris')match.bot.hero='boris';
    write('training-bot',bot.id);setGame(match);setModal(null);navigate('battle');
  };
  const chooseDeck = (done?: (chosen: SavedDeck) => void, label = 'Выбрать колоду') => { deckRequest.current = done ?? null; setDeckPickerLabel(label); setModal('decks'); };
  const start = () => { if (!game || game.winner) chooseDeck(newMatch, 'Играть'); else navigate('battle'); };
  const rematch = () => chooseDeck(newMatch, 'Новый бой');
  const dispatch = (action: Action) => {
    if (!game) return;
    const current = expireMulligan(game);
    if (current !== game) setGame(current);
    const result = stageAction(current, 'player', action);
    if (result.error) notify(result.error);
    else { setGame(result.state); if(action.type!=='play'||!CARD[current.player.hand.find(c=>c.uid===action.uid)?.id??'']?.editor?.sound)sound(); }
  };
  const saveDeck = (ids: string[], name?: string) => {
    const error = draftError(ids, selectedDeck?.heroClass); if (error) { notify(error); return; }
    setDeckBook(book => ({ ...book, decks: book.decks.map(d => d.id === book.selectedId ? { ...d, cards: [...ids], name: name === undefined ? d.name : deckName(name) } : d) }));
  };
  const selectDeck = (id: string) => setDeckBook(book => book.decks.some(d => d.id === id) ? { ...book, selectedId: id } : book);
  const addDeck = (heroClass: HeroClass, name: string, starter: boolean) => {
    if (deckBook.decks.length >= deckLimit()) { notify(`Можно сохранить до ${deckLimitLabel()} колод. Удали ненужную колоду, чтобы создать новую.`); return null; }
    const created = createDeck(heroClass, name, starter);
    setDeckBook(book => ({ ...book, decks: [...book.decks, created], selectedId: created.id })); return created;
  };
  const deleteDeck = (id: string) => setDeckBook(book => { const decks = book.decks.filter(d => d.id !== id); return { ...book, decks, selectedId: book.selectedId === id ? decks[0]?.id ?? null : book.selectedId }; });
  const inspect: Inspect = useCallback((c: CardDef, info?: InspectionInfo) => { setInspected(c); setInspectInfo(info); }, []);
  const closeModal = useCallback(() => setModal(null), []);
  const openSettings = (actions?: BattleSettingsActions) => { setBattleSettings(actions); setModal('settings'); };
  const openEditor = (from:Page) => { setEditorBack(from); navigate('editor'); };
  const openCommunity = (tab='card') => { setCommunityTab(tab); ensureCatalog(); navigate('community'); };
  const openPublish = (seed:PublishSeed={}) => { ensureCatalog(); setPublishSeed(seed); setModal('publish'); };
  const closeCard = useCallback(() => { setInspected(null); setInspectInfo(undefined); }, []);
  return <div className={`app ${page === 'battle' || page === 'rooms' && onlineBattle ? 'in-battle' : page === 'home' ? 'wood-home' : page === 'collection' || page === 'community' ? 'collection-home' : page === 'editor' ? 'editor-home parchment-view' : 'parchment-view'}`}>
    <FullscreenButton global notify={notify} />
    <main className="main-container">
      {page === 'home' && <WoodMenu deckName={selectedDeck?.name ?? 'Нет колоды'} chooseDeck={() => chooseDeck(newMatch, 'Играть')} rooms={() => navigate('rooms')} resume={!!game && !game.winner} start={start} collection={() => { navigate('collection'); }} help={() => setModal('help')} settings={() => openSettings()} profile={() => setModal('about')} wins={stats.wins} editor={() => openEditor('home')} community={() => openCommunity()} />}
      {page === 'collection' && <Collection deckInfo={selectedDeck} decks={deckBook.decks} selectDeck={selectDeck} createDeck={addDeck} deleteDeck={deleteDeck} saveDeck={saveDeck} inspect={inspect} back={() => navigate('home')} notify={notify} editCards={() => openEditor('collection')} expansions={() => openCommunity('installed')} publishDeck={id => openPublish({kind:'deck',deckId:id})} revision={cardRevision} />}
      {page === 'editor' && <CardWorkshop back={() => navigate(editorBack)} backLabel={editorBack === 'home' ? 'Главное меню' : editorBack === 'community' ? 'Пользовательские карты' : 'Коллекция'} publish={openPublish} notify={notify} changed={() => setCardRevision(n => n + 1)} deck={deckBook.decks.flatMap(d => d.cards)} />}
      {page === 'community' && catalog.current && <CommunityCards key={communityTab} initialTab={communityTab} state={catalogState} catalog={catalog.current} book={deckBook} changed={book => { setDeckBook(book); setCardRevision(n=>n+1); }} back={() => navigate('home')} editor={() => openEditor('community')} publish={openPublish} inspect={inspect} notify={notify} overlayOpen={!!modal || !!inspected} />}
      {page === 'battle' && game && <Battle settings={openSettings} board={settings.board} overlayOpen={!!modal || !!inspected} animations={settings.motion} sound={settings.sound} volume={settings.volume} game={game} dispatch={dispatch} back={() => navigate('home')} rematch={rematch} inspect={inspect} />}
      <Online selectedDeck={selectedDeck} chooseDeck={chooseDeck} active={page === 'rooms'} board={settings.board} animations={settings.motion} sound={settings.sound} volume={settings.volume} overlayOpen={!!modal || !!inspected} inspect={inspect} settings={openSettings} home={() => navigate('home')} battleChanged={setOnlineBattle} recordStats={updateOnlineStats} />
    </main>
    {page !== 'editor' && <footer className="site-footer"><div><Logo small /><span>Создано для своих.</span></div><p>Независимый фан-проект. Не связан с Blizzard Entertainment.</p><button className="text-button" onClick={() => setModal('about')}>О проекте <ArrowUpRight size={13} /></button></footer>}
    {toast && <div className="toast" role="status"><Sparkles size={18} /><span>{toast}</span><button className="icon-button" aria-label="Скрыть сообщение" onClick={() => setToast('')}><X size={15} /></button></div>}
    {modal === 'publish' && catalog.current && <PublishDialog seed={publishSeed} decks={deckBook.decks} catalog={catalog.current} close={closeModal} done={() => {closeModal();notify(publishSeed.kind==='deck'?'Колода опубликована. Другие игроки могут добавить её себе в разделе «Колоды».':'Публикация появилась в пользовательских картах.');}} />}
    {modal === 'help' && <HelpDialog close={closeModal} />}
    {modal === 'settings' && <SettingsDialog value={settings} change={setSettings} close={closeModal} help={() => setModal('help')} about={() => setModal('about')} previewSound={sound} battle={battleSettings} />}
    {modal === 'decks' && <DeckPicker decks={deckBook.decks} selectedId={deckBook.selectedId} select={selectDeck} close={() => { deckRequest.current = null; closeModal(); }} actionLabel={deckPickerLabel} confirm={chosen => { if (!readyDeck(chosen)) return; const done = deckRequest.current; deckRequest.current = null; closeModal(); done?.(chosen); }} manage={() => { deckRequest.current = null; closeModal(); navigate('collection'); }} />}
    {modal === 'training' && <TrainingPicker initial={game?.trainingBotId ?? trainingBot(read('training-bot','boris')).id} close={closeModal} confirm={startTraining} />}
    {modal === 'about' && <AboutDialog stats={stats} deckSize={deck.length} close={closeModal} help={() => setModal('help')} auth={mode=>{setAuthMode(mode);setModal('auth');}} history={()=>setModal('history')} />}
    {modal === 'auth' && <AuthDialog initial={authMode} close={()=>{setModal('about');account.clearRecovery();}}/>}
    {modal === 'history' && <MatchArchive close={()=>setModal('about')} inspect={inspect}/>}
    {inspected && <CardDetails card={inspected} info={inspectInfo} close={closeCard} notify={notify} />}
  </div>;
}
