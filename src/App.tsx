import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Check, Crown, Flame, Gem, Layers3, Menu, Settings2, Shield, Sparkles, Swords, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { CARDS, CARD, type CardDef, deckError } from './game/cards';
import { act, chooseBotAction, createGame, type Action } from './game/engine';
import { loadDeck, loadGame, loadStats, read, write } from './storage';
import { Art, Card, kindLabel } from './components/Card';
import Collection from './components/Collection';
import Battle from './components/Battle';
import Modal from './components/Modal';
import WoodMenu from './components/WoodMenu';
import ArtworkUpload from './components/ArtworkUpload';
import ArtworkCredit from './components/ArtworkCredit';
import BoardPicker from './components/BoardPicker';
import { battleground, type BattlegroundId } from './battlegrounds';
import type { InspectionInfo, Inspect } from './inspection';

type Page = 'home' | 'collection' | 'battle';
type Settings = { sound: boolean; motion: boolean; board: BattlegroundId };
function Logo({ small = false }: { small?: boolean }) {
  return <span className={`brand ${small ? 'small' : ''}`}><span className="brand-gem"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="m20 3 15 9v17l-15 9-15-9V12Z" /><path d="m21 10 8 5-1 12-11 4-7-9 4-9 9-1 4 7-5 5-5-4 3-4 2 2" /></svg></span><span>MEME<span>STONE</span><small>ТВОИ КАРТЫ. ТВОИ ПРАВИЛА.</small></span></span>;
}
export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [deck, setDeck] = useState(loadDeck);
  const [game, setGame] = useState(loadGame);
  const [stats, setStats] = useState(loadStats);
  const [modal, setModal] = useState<'help' | 'settings' | 'about' | 'fields' | null>(null);
  const [inspected, setInspected] = useState<CardDef | null>(null);
  const [inspectInfo, setInspectInfo] = useState<InspectionInfo | undefined>(undefined);
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => { const s = read<Settings | null>('settings', null); return { sound: s?.sound === true, motion: s?.motion !== false, board: battleground(s?.board).id }; });
  const audio = useRef<AudioContext | null>(null);
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
  useEffect(() => {
    if (!game) return;
    write('game', game.winner ? null : game);
    if (game.winner && stats.lastResult !== game.id) {
      const next = { wins: stats.wins + (game.winner === 'player' ? 1 : 0), games: stats.games + 1, lastResult: game.id };
      setStats(next); write('stats', next);
    }
  }, [game, stats]);
  useEffect(() => {
    if (page !== 'battle' || !game || game.active !== 'bot' || game.winner || modal || inspected) return;
    const timeout = window.setTimeout(() => {
      const result = act(game, 'bot', chooseBotAction(game));
      if (result.error) { console.error('Bot action failed:', result.error); setGame(act(game, 'bot', { type: 'end' }).state); }
      else setGame(result.state);
    }, settings.motion ? 700 : 100);
    return () => clearTimeout(timeout);
  }, [page, game, modal, inspected, settings.motion]);
  const navigate = (next: Page) => { sound(); setPage(next); setMobileNav(false); window.scrollTo({ top: 0 }); };
  const start = () => { if (!game || game.winner) setGame(createGame(deck)); navigate('battle'); };
  const rematch = () => { setGame(createGame(deck)); sound(); };
  const dispatch = (action: Action) => {
    if (!game) return;
    const result = act(game, 'player', action);
    if (result.error) notify(result.error);
    else { setGame(result.state); sound(); }
  };
  const saveDeck = (ids: string[]) => {
    if (deckError(ids)) { notify(deckError(ids)!); return; }
    if (!write('deck', ids)) { notify('Браузер не разрешил сохранение. Колода доступна до закрытия вкладки.'); }
    setDeck([...ids]);
  };
  const inspect: Inspect = useCallback((c: CardDef, info?: InspectionInfo) => { setInspected(c); setInspectInfo(info); }, []);
  const closeModal = useCallback(() => setModal(null), []);
  const closeCard = useCallback(() => { setInspected(null); setInspectInfo(undefined); }, []);
  return <div className={`app ${page === 'battle' ? 'in-battle' : page === 'home' ? 'wood-home' : 'parchment-view'}`}>
    <header className="site-header"><div className="header-inner"><button className="logo-button" onClick={() => navigate('home')} aria-label="Memestone — главная"><Logo /></button>
      <nav className={mobileNav ? 'open' : ''} aria-label="Главная навигация"><button className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')}>Главная</button><button className={page === 'collection' ? 'active' : ''} onClick={() => navigate('collection')}>Коллекция<span className="nav-count">{CARDS.length}</span></button><button onClick={() => { setModal('help'); setMobileNav(false); }}>Как играть <ArrowUpRight size={13} /></button>{game && !game.winner && <button className={page === 'battle' ? 'active' : ''} onClick={() => navigate('battle')}>Текущий бой<span className="live-dot" /></button>}</nav>
      <div className="header-actions"><span className="alpha-tag">ALPHA 0.6</span><span className="header-divider" /><button className="icon-button" onClick={() => setModal('settings')} aria-label="Настройки"><Settings2 size={20} /></button><button className="avatar-button" onClick={() => setModal('about')} aria-label="Профиль игрока"><Art index={10} /><span /></button><button className="icon-button mobile-menu-toggle" onClick={() => setMobileNav(!mobileNav)} aria-label="Открыть навигацию">{mobileNav ? <X size={22} /> : <Menu size={22} />}</button></div>
    </div></header>
    <main className="main-container">
      {page === 'home' && <WoodMenu resume={!!game && !game.winner} start={start} collection={() => navigate('collection')} help={() => setModal('help')} settings={() => setModal('settings')} profile={() => setModal('about')} wins={stats.wins} />}
      {page === 'collection' && <Collection deck={deck} saveDeck={saveDeck} inspect={inspect} back={() => navigate('home')} notify={notify} />}
      {page === 'battle' && game && <Battle settings={() => setModal('settings')} board={settings.board} chooseBoard={() => setModal('fields')} overlayOpen={!!modal || !!inspected} animations={settings.motion} game={game} dispatch={dispatch} back={() => navigate('home')} rematch={rematch} inspect={inspect} help={() => setModal('help')} />}
    </main>
    <footer className="site-footer"><div><Logo small /><span>Создано для своих.</span></div><p>Независимый фан-проект. Не связан с Blizzard Entertainment.</p><button className="text-button" onClick={() => setModal('about')}>О проекте <ArrowUpRight size={13} /></button></footer>
    {toast && <div className="toast" role="status"><Sparkles size={18} /><span>{toast}</span><button className="icon-button" aria-label="Скрыть сообщение" onClick={() => setToast('')}><X size={15} /></button></div>}
    {inspected && <Modal title={inspected.name} close={closeCard} className="card-detail-modal"><div className="detail-card-area"><div className="detail-card-glow" /><Card card={inspected} cost={inspectInfo?.cost} /></div><div className="card-detail-copy"><div className="eyebrow"><span />{inspected.custom ? 'КОЛЛЕКЦИЯ «СВОИ ЛЮДИ»' : 'СТАРТОВЫЙ НАБОР'}</div><h2>{inspected.name}</h2><div className="detail-tags"><span className={inspected.rarity}>{inspected.rarity === 'legendary' ? <Crown size={12} /> : <Gem size={12} />}{inspected.rarity === 'legendary' ? 'Легендарная' : inspected.rarity === 'epic' ? 'Эпическая' : inspected.rarity === 'rare' ? 'Редкая' : 'Обычная'}</span><span>{kindLabel(inspected.kind)}</span></div><p className="effect-description">{inspected.text}</p>{inspectInfo && <div className="inspection-context"><strong>{inspectInfo.zone === 'board' ? 'Сейчас на столе' : inspectInfo.zone === 'hand' ? 'Карта в руке' : inspectInfo.zone === 'history' ? 'Событие из истории' : inspectInfo.zone === 'power' ? 'Сила героя' : inspectInfo.zone === 'discover' ? 'Вариант раскопки' : 'Герой'}</strong>{inspectInfo.minion && <><div className="live-unit-stats"><span>Атака: <b>{inspectInfo.minion.attack}</b></span><span>Здоровье: <b>{inspectInfo.minion.health}/{inspectInfo.minion.maxHealth}</b></span></div><p>{inspectInfo.minion.origin === 'transformed' ? 'Появилось через превращение. Боевой клич не срабатывал.' : inspectInfo.minion.origin === 'summoned' ? 'Призвано эффектом. Боевой клич не срабатывал.' : inspectInfo.minion.origin === 'played' ? 'Разыграно из руки.' : 'Существо на игровом поле.'}</p>{inspectInfo.minion.createdBy && inspectInfo.minion.origin !== 'played' && <p>Источник: {CARD[inspectInfo.minion.createdBy]?.name ?? inspectInfo.minion.createdBy}.</p>}{inspectInfo.minion.charge && !inspectInfo.minion.silenced && <p>Рывок: может атаковать сразу после выхода на поле.</p>}{inspectInfo.minion.silenced && <p>Немота: способности существа отключены.</p>}{inspectInfo.minion.taunt && <p>Провокация активна.</p>}{inspectInfo.minion.cannotAttack && <p>Не может атаковать.</p>}{!!inspectInfo.minion.auraBonus && <p>Аура Василия: +{inspectInfo.minion.auraBonus} к атаке.</p>}</>}{inspectInfo.cost !== undefined && <p>Текущая стоимость: {inspectInfo.cost} маны.</p>}{inspectInfo.note && <p>{inspectInfo.note}</p>}</div>}<p className="flavor-text">«{inspected.flavor}»</p><div className="detail-stats"><div><span className="mana-mini">{inspected.cost}</span>МАНА</div>{inspected.attack !== undefined && <><div><Swords size={17} /><strong>{inspected.attack}</strong>АТАКА</div><div><Flame size={17} /><strong>{inspected.health}</strong>ЗДОРОВЬЕ</div></>}{inspected.armor && <div><Shield size={17} /><strong>{inspected.armor}</strong>БРОНЯ</div>}</div><span className="owned-label"><Check size={15} /> Есть в твоей коллекции</span><ArtworkCredit cardId={inspected.id} /><ArtworkUpload card={inspected} notify={notify} /></div></Modal>}
    {modal === 'help' && <Modal title="Как играть" close={closeModal} className="help-modal"><span className="eyebrow"><span /> ПРАВИЛА ТРАКТИРА</span><h2>Хорошая рука —<br /><em>только начало.</em></h2><p className="modal-intro">У каждого героя 30 здоровья. Твоя цель — опустить здоровье Бориса до нуля раньше, чем он сделает это с твоим.</p><div className="rules-grid">{[
      { icon: <Gem />, title: 'Каждый ход — больше маны', text: 'Начинаешь с 1 кристалла. Каждый свой ход получаешь ещё один, максимум 10. Мана полностью восстанавливается.' },
      { icon: <Layers3 />, title: 'Разыгрывай карты', text: 'Удержание открывает описание. Эхо даёт повторную копию до конца хода. Нажми на карту в руке. Её стоимость спишется с маны. Для заклинаний с целью выбери подходящую цель. «Тихий час» действует и на своих существ. Максимум: 7 существ на поле и 10 карт в руке.' },
      { icon: <Swords />, title: 'Атакуй с умом', text: 'Существа атакуют со следующего своего хода. Рывок позволяет атаковать сразу, включая героя. Выбери своё существо с зелёным свечением, затем врага или его героя. При бою существ урон получают оба.' },
      { icon: <Shield />, title: 'Сначала — провокация', text: 'Пока у врага есть существо с провокацией, атаковать можно только его. Заклинания и сила героя обходят это правило.' },
      { icon: <Flame />, title: 'Используй силу героя', text: '«Искра» за 2 маны наносит врагу 1 урон. Сила доступна раз за ход. Сила противника видна рядом с его героем. «Держать в курсе» временно заменяет обе силы на добор за 6 маны.' },
      { icon: <BookOpen />, title: 'Колода не бесконечна', text: 'Каждый ход берёшь карту. Пустая колода наносит растущий урон от усталости. Колоду можно собрать в коллекции. Твой бой сохраняется автоматически.' },
    ].map(rule => <div key={rule.title}><span>{rule.icon}</span><h3>{rule.title}</h3><p>{rule.text}</p></div>)}</div><div className="prototype-note"><Sparkles size={18} /><p>Трачукча разыгрывается бесплатно; «Дибильнутый!» за 3 маны превращает всех существ врага в случайных на 5 маны дешевле, не ниже 0. Джайна дешевеет за каждого погибшего РАШ с обеих сторон. Волонтер-босс при розыгрыше уничтожает и себя, затем призывает двух РАШ 2/4. Призывы и силы героев нельзя класть в колоду.</p></div><button className="button primary" onClick={closeModal}>Всё понятно <ArrowRight size={17} /></button></Modal>}
    {modal === 'settings' && <Modal title="Настройки" close={closeModal} className="settings-modal"><Settings2 className="modal-symbol" size={28} /><span className="eyebrow">ОБУСТРОЙ СВОЙ ТРАКТИР</span><h2>Как тебе удобно.</h2><label className="setting-row"><span><strong>{settings.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}Звуки действий</strong><small>Короткие магические звуки при игре</small></span><input type="checkbox" checked={settings.sound} onChange={e => setSettings({ ...settings, sound: e.target.checked })} /><i className="toggle" /></label><label className="setting-row"><span><strong><Sparkles size={18} />Анимации</strong><small>Плавные переходы и паузы между ходами бота</small></span><input type="checkbox" checked={settings.motion} onChange={e => setSettings({ ...settings, motion: e.target.checked })} /><i className="toggle" /></label><BoardPicker value={settings.board} change={board => setSettings({ ...settings, board })} /><div className="settings-note"><Shield size={17} /><p>Колода, статистика и текущий бой хранятся только в этом браузере. Регистрация не нужна.</p></div><button className="button primary" onClick={closeModal}>Сохранено <Check size={16} /></button></Modal>}
    {modal === 'fields' && <Modal title="Выбор игрового поля" close={closeModal} className="fields-modal"><span className="eyebrow">ТВОЯ АРЕНА</span><h2>Выбери место для боя</h2><BoardPicker value={settings.board} change={board => setSettings({ ...settings, board })} /><button className="button primary" onClick={closeModal}>Вернуться в бой <Check size={16} /></button></Modal>}
    {modal === 'about' && <Modal title="О проекте Memestone" close={closeModal} className="about-modal"><Logo /><span className="alpha-tag">ALPHA 0.6</span><h2>Большие легенды.<br /><em>Своя компания.</em></h2><p>Первый прототип нашей карточной игры: один бой против Бориса, главная страница и коллекция из {CARDS.length} карт. Все карты уже доступны.</p><p>Оформление обновлено по твоим примерам: деревянное меню, овальные портреты, ленты, драконьи рамки существ и прямоугольные рамки заклинаний. Оригинал карты или фотографию можно добавить через окно карты. Пока исходные файлы не переданы в репозиторий, вместо личных фотографий показан знак ожидания оригинала.</p><div className="profile-stats"><div><Trophy size={18} /><strong>{stats.wins}</strong> побед</div><div><Swords size={18} /><strong>{stats.games}</strong> партий</div><div><Layers3 size={18} /><strong>{deck.length}</strong> карт в колоде</div></div><p className="small-print">Это самостоятельный фан-проект. Рейтинга, сетевой игры, магазина и платных покупок в этой версии нет. Следующий шаг — новые карты и механики.</p><button className="button secondary" onClick={() => { closeModal(); setModal('help'); }}>Открыть правила <ArrowUpRight size={16} /></button></Modal>}
  </div>;
}
