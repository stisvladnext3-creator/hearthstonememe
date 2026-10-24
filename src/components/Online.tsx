import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, DoorOpen, Link, LoaderCircle, Play, RefreshCw, Swords, Users, Wifi, WifiOff } from 'lucide-react';
import Battle from './Battle';
import Modal from './Modal';
import { PeerRoom, inviteLink, savedRoom } from '../online/room';
import { cleanName, EMPTY_ROOM, normalizeCode, type RoomState } from '../online/protocol';
import type { Inspect } from '../inspection';
import type { BattlegroundId } from '../battlegrounds';
import { read, write } from '../storage';

export default function Online({ active, deck, board, animations, overlayOpen, inspect, settings, help, chooseBoard, home, battleChanged }: {
  active: boolean; deck: string[]; board: BattlegroundId; animations: boolean; overlayOpen: boolean; inspect: Inspect;
  settings: () => void; help: () => void; chooseBoard: () => void; home: () => void; battleChanged: (value: boolean) => void;
}) {
  const [room, setRoom] = useState<RoomState>({ ...EMPTY_ROOM });
  const [name, setName] = useState(() => { const n = read<unknown>('online-name', 'Игрок'); return typeof n === 'string' ? cleanName(n) : 'Игрок'; });
  const [code, setCode] = useState(() => normalizeCode(new URLSearchParams(location.search).get('room') ?? ''));
  const [showLobby, setShowLobby] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState('');
  const [resume, setResume] = useState(savedRoom);
  const controller = useRef<PeerRoom | null>(null);
  const matchId = useRef('');
  const inBattle = active && room.phase === 'playing' && !!room.game && !showLobby;
  useEffect(() => { battleChanged(inBattle); }, [inBattle, battleChanged]);
  useEffect(() => () => controller.current?.close(), []);
  const open = (role: 'host' | 'guest', restore = false) => {
    controller.current?.close();
    const next = new PeerRoom(state => {
      if (controller.current !== next) return;
      setRoom(state);
      if (state.game && state.game.id !== matchId.current) { matchId.current = state.game.id; setShowLobby(false); }
    });
    controller.current = next; write('online-name', cleanName(name));
    const saved = restore ? savedRoom() : undefined;
    void next.open(saved?.role ?? role, name, deck, saved?.code ?? code, saved ?? undefined);
  };
  const leave = () => {
    controller.current?.close(true); controller.current = null; setRoom({ ...EMPTY_ROOM });
    setResume(null); setLeaving(false); setShowLobby(false); matchId.current = '';
  };
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(''), 2500); }
    catch { setCopied('Скопируй код из поля ниже.'); }
  };
  if (!active) return null;
  if (inBattle) return <Battle game={room.game!} board={board} animations={animations} overlayOpen={overlayOpen}
    dispatch={action => controller.current?.action(action)} inspect={inspect} settings={settings} help={help} chooseBoard={chooseBoard}
    back={() => setShowLobby(true)} rematch={() => controller.current?.rematch()}
    multiplayer={{ code: room.code, opponent: room.opponent, connected: room.connected,
      blocked: !room.connected ? 'Ждём соединения с соперником…' : room.pending ? 'Ожидаем подтверждения хода…' : '',
      notice: room.error, rematchSelf: room.rematchSelf, rematchOpponent: room.rematchOpponent }} />;
  const entered = room.phase === 'waiting' || room.phase === 'playing';
  const connecting = room.phase === 'connecting';
  return <section className="rooms-page page-enter">
    <button className="text-button rooms-back" onClick={home}><ArrowLeft size={17} /> Главное меню</button>
    <div className="rooms-heading"><span className="eyebrow"><Users size={17} /> СВОЯ КОМПАНИЯ</span><h1>Игровые комнаты</h1><p>Создай комнату и позови друга. Или присоединяйся по коду.</p></div>
    {room.error && <div className="room-error" role="alert"><WifiOff size={18} />{room.error}</div>}
    {!entered && <div className="room-entry-panel">
      <label className="room-name-label">Твоё имя<input aria-label="Имя игрока" maxLength={20} value={name} onChange={e => setName(e.target.value)} disabled={connecting} /></label>
      <p className="room-deck-note">В бой пойдёт твоя сохранённая колода: {deck.length} карт. Её можно изменить в коллекции.</p>
      <div className="room-entry-grid"><div><span className="room-option-icon"><Users size={29} /></span><h2>Позвать друга</h2><p>Получишь код и ссылку на свою комнату.</p><button className="button primary" onClick={() => open('host')} disabled={connecting}><Swords size={17} />Создать комнату</button></div>
        <form onSubmit={e => { e.preventDefault(); open('guest'); }}><span className="room-option-icon"><DoorOpen size={29} /></span><h2>Войти в комнату</h2><label>Код друга<input aria-label="Код комнаты" placeholder="ABC234" maxLength={8} value={code} onChange={e => setCode(normalizeCode(e.target.value))} disabled={connecting} autoCapitalize="characters" autoComplete="off" spellCheck={false} /></label><button className="button secondary" type="submit" disabled={connecting || code.length !== 6}>Войти по коду <DoorOpen size={17} /></button></form></div>
      {connecting && <p className="room-connecting" role="status"><LoaderCircle size={20} />Подключаемся к комнате…</p>}
      {resume && !connecting && <button className="button secondary resume-room" onClick={() => open(resume.role, true)}><RefreshCw size={17} />Вернуться в комнату {resume.code}</button>}
    </div>}
    {entered && <div className="room-waiting-panel">
      <div className="room-code-heading"><span>КОД КОМНАТЫ</span><strong>{room.code}</strong><button className="icon-button" aria-label="Скопировать код комнаты" onClick={() => void copy(room.code, 'Код скопирован')}><Copy size={20} /></button></div>
      <div className="room-sharing"><button className="button secondary" onClick={() => void copy(inviteLink(room.code), 'Ссылка скопирована')}><Link size={17} />Пригласить по ссылке</button><span role="status">{copied}</span></div>
      <div className="room-members"><div><span className="room-member-symbol"><Users size={24} /></span><strong>{room.name}</strong><small>{room.role === 'host' ? 'Создатель комнаты' : 'Ты'}</small><span><Check size={14} />Готов</span></div>
        <div className={room.connected ? '' : 'waiting-member'}><span className="room-member-symbol">{room.connected ? <Users size={24} /> : <LoaderCircle size={24} />}</span><strong>{room.opponent || 'Ждём друга'}</strong><small>{room.connected ? 'В комнате' : room.opponent ? 'Переподключается' : 'Передай код или ссылку'}</small><span>{room.connected ? <><Wifi size={14} />На связи</> : 'Ожидание'}</span></div></div>
      {room.game ? <button className="button primary room-start" onClick={() => setShowLobby(false)}><Play size={18} />Вернуться в бой</button>
        : room.role === 'host' ? <button className="button primary room-start" disabled={!room.connected} onClick={() => controller.current?.start()}><Swords size={18} />Начать бой</button>
        : <p className="room-connecting" role="status">{room.connected ? 'Создатель комнаты начинает партию.' : 'Соединяемся с создателем…'}</p>}
      <button className="text-button room-leave" onClick={() => setLeaving(true)}>{room.role === 'host' ? 'Закрыть комнату' : 'Выйти из комнаты'}</button>
    </div>}
    <p className="rooms-footnote">Комната для двух игроков. Создатель ведёт партию — его вкладка должна оставаться открытой. При кратком разрыве связь восстанавливается, а бой ждёт игроков.</p>
    {leaving && <Modal title="Выйти из комнаты" close={() => setLeaving(false)} className="small-modal"><h2>Покинуть комнату?</h2><p>{room.game && !room.game.winner ? 'Если выйти во время боя, соперник получит победу.' : 'Чтобы снова поиграть вместе, можно будет создать новую комнату.'}</p><button className="button danger" onClick={leave}>Выйти из комнаты</button><button className="button secondary" onClick={() => setLeaving(false)}>Остаться</button></Modal>}
  </section>;
}
