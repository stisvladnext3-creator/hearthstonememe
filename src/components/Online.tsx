import { phoneScreen, useViewport } from '../useViewport';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, DoorOpen, Globe, Layers3, Link, LoaderCircle, Play, RefreshCw, Swords, Users, Wifi, WifiOff, ChevronLeft, ChevronRight } from 'lucide-react';
import Battle from './Battle';
import type { BattleSettingsActions } from './SettingsDialog';
import Modal from './Modal';
import { PeerRoom, inviteLink, savedRoom } from '../online/room';
import { cleanName, EMPTY_ROOM, normalizeCode, type RoomState } from '../online/protocol';
import { EMPTY_DIRECTORY, RoomDirectory, type DirectoryState } from '../online/directory';
import type { Inspect } from '../inspection';
import type { BattlegroundId } from '../battlegrounds';
import { read, write } from '../storage';
import { HERO_CLASSES } from '../game/classes';
import { readyDeck, type SavedDeck } from '../decks';
import type { Game } from '../game/engine';

export default function Online({ active, board, animations, sound=false, volume=100, overlayOpen, inspect, settings, home, battleChanged, selectedDeck, chooseDeck, recordStats }: {
  active: boolean; board: BattlegroundId; animations: boolean; sound?:boolean;volume?:number; overlayOpen: boolean; inspect: Inspect;
  settings: (actions: BattleSettingsActions) => void; home: () => void; battleChanged: (value: boolean) => void;
  selectedDeck: SavedDeck | null; chooseDeck: (done?: (deck: SavedDeck) => void, label?: string) => void;
  recordStats: (game: Game) => void;
}) {
  const viewport = useViewport();
  const [roomCapacity, setRoomCapacity] = useState(3);
  const roomPageSize = phoneScreen(viewport) ? Math.min(roomCapacity, viewport.width > viewport.height ? 2 : 3) : 6;
  const roomList = useRef<HTMLUListElement>(null);
  const [roomPage, setRoomPage] = useState(1);
  const [room, setRoom] = useState<RoomState>({ ...EMPTY_ROOM });
  const [name, setName] = useState(() => { const n = read<unknown>('online-name', 'Игрок'); return typeof n === 'string' ? cleanName(n) : 'Игрок'; });
  const [code, setCode] = useState(() => normalizeCode(new URLSearchParams(location.search).get('room') ?? ''));
  const [showLobby, setShowLobby] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState('');
  const [resume, setResume] = useState(savedRoom);
  const [listed, setListed] = useState(true);
  const [directory, setDirectory] = useState<DirectoryState>({ ...EMPTY_DIRECTORY });
  const controller = useRef<PeerRoom | null>(null);
  const roomPages = Math.max(1, Math.ceil(directory.rooms.length / roomPageSize)), shownRoomPage = Math.min(roomPage, roomPages);
  const directoryController = useRef<RoomDirectory | null>(null);
  const matchId = useRef('');
  const inBattle = active && room.phase === 'playing' && !!room.game && !showLobby;
  useLayoutEffect(() => {
    const list = roomList.current; if (!list) return;
    const fit = () => { if (list.clientHeight) setRoomCapacity(Math.max(1, Math.floor(list.clientHeight / 62))); };
    fit(); const observer = new ResizeObserver(fit); observer.observe(list);
    return () => observer.disconnect();
  }, [active, room.phase, directory.status, directory.rooms.length]);
  useEffect(() => { battleChanged(inBattle); }, [inBattle, battleChanged]);
  useEffect(() => { if (room.game) recordStats(room.game); }, [room.game, recordStats]);
  useEffect(() => { if (active && !directoryController.current) directoryController.current = new RoomDirectory(setDirectory); }, [active]);
  useEffect(() => () => {
    controller.current?.close(); directoryController.current?.close(); directoryController.current = null;
  }, []);
  const open = (role: 'host' | 'guest', restore = false, destination?: string, chosen?: SavedDeck) => {
    if (!restore && !chosen) { chooseDeck(deck => open(role, false, destination, deck), role === 'host' ? 'Создать комнату' : 'Войти в комнату'); return; }
    if (!restore && (!chosen || !readyDeck(chosen))) return;
    controller.current?.close();
    const next = new PeerRoom(state => {
      if (controller.current !== next) return;
      setRoom(state);
      if (state.game && state.game.id !== matchId.current) { matchId.current = state.game.id; setShowLobby(false); }
    });
    controller.current = next; write('online-name', cleanName(name));
    const saved = restore ? savedRoom() : undefined;
    if (destination) setCode(destination);
    void next.open(saved?.role ?? role, name, chosen?.cards ?? selectedDeck?.cards ?? [], saved?.code ?? destination ?? code, saved ?? undefined, listed, chosen?.heroClass ?? selectedDeck?.heroClass ?? 'mage');
  };
  const leave = () => {
    if (room.game) recordStats(room.game.winner ? room.game : { ...room.game, winner: 'bot' });
    controller.current?.close(true); controller.current = null; setRoom({ ...EMPTY_ROOM });
    setResume(null); setLeaving(false); setShowLobby(false); matchId.current = '';
  };
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(''), 2500); }
    catch { setCopied('Скопируй код из поля ниже.'); }
  };
  if (!active) return null;
  if (inBattle) return <Battle game={room.game!} board={board} animations={animations} sound={sound} volume={volume} overlayOpen={overlayOpen}
    dispatch={action => controller.current?.action(action)} inspect={inspect} settings={settings}
    back={() => setShowLobby(true)} menu={() => { setShowLobby(true); home(); }} rematch={() => chooseDeck(deck => controller.current?.rematch(deck.cards, deck.heroClass), 'Играть ещё')}
    multiplayer={{ code: room.code, opponent: room.opponent, connected: room.connected,
      blocked: !room.connected ? 'Ждём соединения с соперником…' : room.pending ? 'Ожидаем подтверждения хода…' : '',
      notice: room.error, rematchSelf: room.rematchSelf, rematchOpponent: room.rematchOpponent }} />;
  const entered = room.phase === 'waiting' || room.phase === 'playing';
  const connecting = room.phase === 'connecting';
  return <section className="rooms-page page-enter">
    <button className="text-button rooms-back" onClick={home}><ArrowLeft size={17} /> Главное меню</button>
    <div className="rooms-heading"><span className="eyebrow"><Users size={17} /> СВОЯ КОМПАНИЯ</span><h1>Игровые комнаты</h1><p>Выбери открытую комнату, создай свою или зайди по коду.</p></div>
    {room.error && <div className="room-error" role="alert"><WifiOff size={18} />{room.error}</div>}
    {!entered && <div className="room-entry-panel">
      <div className="room-player-setup"><label className="room-name-label">Твоё имя<input aria-label="Имя игрока" maxLength={20} value={name} onChange={e => setName(e.target.value)} disabled={connecting} /></label><button className="room-class-button" aria-label="Выбрать колоду" onClick={() => chooseDeck()} disabled={connecting}><Layers3 size={16} /><span>{selectedDeck?.name ?? 'Выбери колоду'}</span></button></div>
      <p className="room-deck-note">{selectedDeck ? `${HERO_CLASSES[selectedDeck.heroClass].name} · ${selectedDeck.cards.length}/30 карт. Колоду можно выбрать перед входом в комнату.` : 'Сначала создай колоду в коллекции.'}</p>
      <section className="public-rooms" aria-label="Список открытых комнат">
        <div className="public-rooms-heading"><h2><Globe size={21} />Открытые комнаты <span>{directory.rooms.length}</span></h2><button className="icon-button" aria-label="Обновить список комнат" onClick={() => directoryController.current?.refresh()}><RefreshCw size={18} className={directory.status === 'connecting' ? 'spinning' : ''} /></button></div>
        {directory.status !== 'ready' ? <p className="public-rooms-empty" role="status">{directory.status === 'connecting' ? 'Ищем открытые комнаты…' : 'Восстанавливаем список комнат. По коду можно войти сразу.'}</p>
          : directory.rooms.length ? <ul ref={roomList}>{directory.rooms.slice((shownRoomPage - 1) * roomPageSize, shownRoomPage * roomPageSize).map(entry => <li key={entry.code} data-room-code={entry.code}>
            <span className="public-room-icon"><Users size={22} /></span><div><strong>Комната {entry.hostName}</strong><small>Код {entry.code} · ждёт соперника</small></div><span className="public-room-seats">1/2</span>
            <button className="button primary" aria-label={`Войти в комнату ${entry.hostName}`} disabled={connecting} onClick={() => open('guest', false, entry.code)}><DoorOpen size={16} />Войти</button>
          </li>)}</ul> : <p className="public-rooms-empty" role="status">Пока нет открытых комнат. Создай свою — и к тебе смогут присоединиться.</p>}
      {roomPages > 1 && <div className="rooms-pagination"><button aria-label="Предыдущая страница комнат" disabled={shownRoomPage <= 1} onClick={() => setRoomPage(shownRoomPage - 1)}><ChevronLeft size={18} /></button><span>{shownRoomPage} / {roomPages}</span><button aria-label="Следующая страница комнат" disabled={shownRoomPage >= roomPages} onClick={() => setRoomPage(shownRoomPage + 1)}><ChevronRight size={18} /></button></div>}
      </section>
      <div className="room-entry-grid"><div><span className="room-option-icon"><Users size={29} /></span><h2>Позвать друга</h2><p>Получишь код и ссылку на свою комнату.</p><label className="room-public-option"><input type="checkbox" checked={listed} onChange={e => setListed(e.target.checked)} disabled={connecting} />Показывать в списке комнат</label><button className="button primary" onClick={() => open('host')} disabled={connecting}><Swords size={17} />Создать комнату</button></div>
        <form onSubmit={e => { e.preventDefault(); open('guest'); }}><span className="room-option-icon"><DoorOpen size={29} /></span><h2>Войти в комнату</h2><label>Код друга<input aria-label="Код комнаты" placeholder="ABC234" maxLength={8} value={code} onChange={e => setCode(normalizeCode(e.target.value))} disabled={connecting} autoCapitalize="characters" autoComplete="off" spellCheck={false} /></label><button className="button secondary" type="submit" disabled={connecting || code.length !== 6}>Войти по коду <DoorOpen size={17} /></button></form></div>
      {connecting && <p className="room-connecting" role="status"><LoaderCircle size={20} />Подключаемся к комнате…</p>}
      {resume && !connecting && <button className="button secondary resume-room" onClick={() => open(resume.role, true)}><RefreshCw size={17} />Вернуться в комнату {resume.code}</button>}
    </div>}
    {entered && <div className="room-waiting-panel">
      <div className="room-code-heading"><span>КОД КОМНАТЫ</span><strong>{room.code}</strong><button className="icon-button" aria-label="Скопировать код комнаты" onClick={() => void copy(room.code, 'Код скопирован')}><Copy size={20} /></button></div>
      <div className="room-sharing"><button className="button secondary" onClick={() => void copy(inviteLink(room.code), 'Ссылка скопирована')}><Link size={17} />Пригласить по ссылке</button><span role="status">{copied}</span></div>
      {room.role === 'host' && !room.game && <label className="room-public-option room-public-toggle"><input type="checkbox" checked={room.listed} onChange={e => controller.current?.setListed(e.target.checked)} />Показывать в списке, пока есть свободное место</label>}
      <div className="room-members"><div><span className="room-member-symbol"><Users size={24} /></span><strong>{room.name}</strong><small>{room.role === 'host' ? 'Создатель комнаты' : 'Ты'} · {HERO_CLASSES[room.heroClass].name}</small><span><Check size={14} />Готов</span></div>
        <div className={room.connected ? '' : 'waiting-member'}><span className="room-member-symbol">{room.connected ? <Users size={24} /> : <LoaderCircle size={24} />}</span><strong>{room.opponent || 'Ждём друга'}</strong><small>{room.opponent && room.opponentClass ? HERO_CLASSES[room.opponentClass].name + (room.connected ? ' · В комнате' : ' · Переподключается') : 'Передай код или ссылку'}</small><span>{room.connected ? <><Wifi size={14} />На связи</> : 'Ожидание'}</span></div></div>
      {room.game ? <button className="button primary room-start" onClick={() => setShowLobby(false)}><Play size={18} />Вернуться в бой</button>
        : room.role === 'host' ? <button className="button primary room-start" disabled={!room.connected || room.pending} onClick={() => controller.current?.start()}>{room.pending ? <><LoaderCircle size={18} />Подготавливаем карты…</> : <><Swords size={18} />Начать бой</>}</button>
        : <p className="room-connecting" role="status">{room.connected ? 'Создатель комнаты начинает партию.' : 'Соединяемся с создателем…'}</p>}
      <button className="text-button room-leave" onClick={() => setLeaving(true)}>{room.role === 'host' ? 'Закрыть комнату' : 'Выйти из комнаты'}</button>
    </div>}
    <p className="rooms-footnote">Комната для двух игроков. Создатель ведёт партию — его вкладка должна оставаться открытой. При кратком разрыве связь восстанавливается, а бой ждёт игроков.</p>
    {leaving && <Modal title="Выйти из комнаты" close={() => setLeaving(false)} className="small-modal"><h2>Покинуть комнату?</h2><p>{room.game && !room.game.winner ? 'Если выйти во время боя, соперник получит победу.' : 'Чтобы снова поиграть вместе, можно будет создать новую комнату.'}</p><button className="button danger" onClick={leave}>Выйти из комнаты</button><button className="button secondary" onClick={() => setLeaving(false)}>Остаться</button></Modal>}
  </section>;
}
