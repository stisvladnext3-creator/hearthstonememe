import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, CircleHelp, Crown, Flag, Flame, Layers3, Shield, Sparkles, Swords, X } from 'lucide-react';
import { CARD, type CardDef } from '../game/cards';
import { cardCost, legalTargets, targetNeeded, type Action, type Game, type Minion, type Player, type Side, type Target } from '../game/engine';
import { Art, Card } from './Card';
import Modal from './Modal';
import CombatEffects from './CombatEffects';

type Selection = { type: 'play' | 'attack'; uid: number } | { type: 'power' };
const HEROES: Record<string, { name: string; art: number; title: string }> = {
  mage: { name: 'Лира', art: 10, title: 'Хранительница мемов' },
  boris: { name: 'Борис', art: 9, title: 'Трактирщик · Бот' },
  trachukcha: { name: 'Трачукча', art: 4, title: 'Думает о вечном' },
  maratik: { name: 'Маратик', art: 7, title: 'Повелитель «Ой»' },
  jaina: { name: 'Джайна-ассасин', art: 10, title: 'Сила РДШ' },
};
const POWER = {
  spark: { name: 'Искра', cost: 2, text: 'Наносит 1 урон выбранному врагу.', icon: <Flame size={23} /> },
  fool: { name: 'Дибильнутый!', cost: 3, text: 'Превращает всех существ врага в случайных на 5 маны дешевле.', icon: <BookOpen size={23} /> },
  rds: { name: 'Сила РДШ', cost: 4, text: 'Призывает РАШ 2/5.', icon: <Shield size={23} /> },
  oy: { name: 'Ой', cost: 6, text: 'Добавляет в руку Смертокрыла 1/1.', icon: <Flame size={23} /> },
};
function Mana({ player, compact = false }: { player: Player; compact?: boolean }) {
  return <div className={`mana-bar ${compact ? 'small' : ''}`} aria-label={`Мана ${player.mana} из ${player.maxMana}`}><strong>{player.mana}<span>/{player.maxMana}</span></strong><div>{Array.from({ length: 10 }, (_, n) => <i key={n} className={`${n < player.mana ? 'filled' : ''} ${n >= player.maxMana ? 'locked' : ''}`} />)}</div></div>;
}
function Hero({ player, side, targetable, onClick, active }: { player: Player; side: Side; targetable: boolean; onClick: () => void; active: boolean }) {
  const hero = HEROES[player.hero] || HEROES.mage;
  return <div className={`hero-panel ${side} ${active ? 'active' : ''}`}>
    <div className="hero-label"><strong>{hero.name}</strong><span>{hero.title}</span></div>
    <button data-combat-anchor={`${side}:hero`} className={`hero-portrait ${targetable ? 'targetable' : ''}`} onClick={onClick} aria-label={`${side === 'bot' ? 'Герой противника' : 'Ваш герой'}: ${player.health} здоровья${targetable ? ', атаковать' : ''}`} disabled={!targetable}>
      <Art index={hero.art} cardId={player.hero} /><span className="hero-hp"><Flame size={14} />{Math.max(0, player.health)}</span>
      {player.armor > 0 && <span className="hero-armor"><Shield size={14} />{player.armor}</span>}
    </button>
    <div className="hero-health-track"><i style={{ width: `${Math.max(0, player.health / 30 * 100)}%` }} /></div>
  </div>;
}
function Unit({ m, side, selected, canSelect, targetable, onClick, inspect }: {
  m: Minion; side: Side; selected: boolean; canSelect: boolean; targetable: boolean; onClick: () => void; inspect: () => void;
}) {
  const c = CARD[m.id];
  return <div className="unit-wrap"><button data-combat-anchor={`${side}:${m.uid}`} className={`board-unit ${m.taunt ? 'taunt' : ''} ${canSelect ? 'ready' : ''} ${selected ? 'selected' : ''} ${targetable ? 'targetable' : ''}`} onClick={onClick} aria-label={`${c.name}: ${m.attack} атаки, ${m.health} здоровья${canSelect ? ', готов атаковать' : ''}`} title={`${c.name}. ${c.text}`}>
    <Art index={c.art} cardId={c.id} /><div className="unit-shade" /><span className="unit-name">{c.name}</span>
    {m.taunt && <Shield className="taunt-icon" size={17} />}
    {!m.ready && !m.cannotAttack && <span className="sleep-mark">zZ</span>}
    {m.cannotAttack && <span className="sleep-mark"><X size={15} /></span>}
    {m.silenced && <span className="silence-mark">Немота</span>}
    <span className="unit-attack">{m.attack}</span><span className={`unit-health ${m.health < m.maxHealth ? 'damaged' : ''}`}>{m.health}</span>
  </button><button className="unit-info" onClick={inspect} aria-label={`Подробнее о ${c.name}`}><CircleHelp size={11} /></button></div>;
}
export default function Battle({ game, dispatch, back, rematch, inspect, help, animations }: {
  game: Game; dispatch: (action: Action) => void; back: () => void; rematch: () => void; inspect: (c: CardDef) => void; help: () => void; animations: boolean;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showResult, setShowResult] = useState(false);
  useEffect(() => {
    if (!game.winner) { setShowResult(false); return; }
    const timer = window.setTimeout(() => setShowResult(true), animations && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 850 : 0);
    return () => clearTimeout(timer);
  }, [game.winner, game.id, animations]);
  const playerTurn = game.active === 'player' && !game.winner;
  useEffect(() => { setSelection(null); }, [game]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelection(null); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const selectedCard = selection?.type === 'play' ? game.player.hand.find(c => c.uid === selection.uid) : undefined;
  const allowed = selection && (selection.type !== 'play' || selectedCard) ? legalTargets(game, selection.type === 'attack' ? 'attack' : selection.type === 'power' ? 'spark' : CARD[selectedCard!.id].effect === 'silence' ? 'silence' : 'bolt') : [];
  const hit = (target: Target) => {
    if (!selection || !allowed.includes(target)) return;
    dispatch({ ...selection, target } as Action);
    setSelection(null);
  };
  const power = POWER[game.player.power];
  const selectCard = (uid: number) => {
    if (!playerTurn) return;
    if (selection?.type === 'play' && selection.uid === uid) { setSelection(null); return; }
    if (targetNeeded(game, uid)) setSelection({ type: 'play', uid });
    else dispatch({ type: 'play', uid });
  };
  const hint = selection ? selection.type === 'attack' ? 'Выбери, кого атаковать' : 'Выбери цель заклинания' : game.winner ? 'Партия завершена.' : playerTurn ? 'Твой ход. Пусть начнётся хаос.' : 'Борис обдумывает свой ход…';
  return <section className="battle-page page-enter">
    <div className="battle-topbar"><button className="text-button" onClick={back}><ArrowLeft size={16} /> Главное меню</button><span className="battle-mode-label"><span className="live-dot" /> ТРЕНИРОВКА С БОТОМ</span><div><button className={`icon-button history-toggle ${showLog ? 'active' : ''}`} onClick={() => setShowLog(!showLog)} aria-label="История сражения"><BookOpen size={18} /><span>История</span></button><button className="icon-button" onClick={help} aria-label="Правила боя"><CircleHelp size={18} /></button><button className="icon-button" onClick={() => setConfirm(true)} aria-label="Сдаться"><Flag size={17} /></button></div></div>
    <div className="battle-arena">
      <div className="arena-glow" /><div className="last-action" role="status"><span>ПОСЛЕДНЕЕ ДЕЙСТВИЕ</span>{[...game.log].reverse().find(l => l.side !== 'system')?.text ?? 'Вы ходите первым'}</div><div className="table-corner top-left" /><div className="table-corner bottom-right" />
      <div className="opponent-hand" aria-label={`У Бориса ${game.bot.hand.length} карт`}>{game.bot.hand.map(c => <div className="card-back" data-combat-anchor={`bot:${c.uid}`} key={c.uid}><span>✦</span></div>)}</div>
      <div className="enemy-status"><Mana player={game.bot} compact /><span><Layers3 size={13} /> {game.bot.deck.length} в колоде</span></div>
      <Hero player={game.bot} side="bot" active={!playerTurn} targetable={playerTurn && allowed.includes('hero')} onClick={() => hit('hero')} />
      <div className="battle-board enemy-board">{game.bot.board.length ? game.bot.board.map(m => <Unit key={m.uid} m={m} side="bot" selected={false} canSelect={false} targetable={playerTurn && allowed.includes(m.uid)} onClick={() => hit(m.uid)} inspect={() => inspect(CARD[m.id])} />) : <span className="empty-board-hint">Здесь появятся существа соперника</span>}</div>
      <div className="board-divider"><span /><i>✦</i><span /></div>
      <div className="battle-board player-board">{game.player.board.length ? game.player.board.map(m => <Unit key={m.uid} m={m} side="player" selected={selection?.type === 'attack' && selection.uid === m.uid} canSelect={playerTurn && m.ready && !m.cannotAttack && m.attack > 0} targetable={false} onClick={() => { if (playerTurn && m.ready && !m.cannotAttack && m.attack > 0) setSelection(selection?.type === 'attack' && selection.uid === m.uid ? null : { type: 'attack', uid: m.uid }); }} inspect={() => inspect(CARD[m.id])} />) : <div className="summon-hint"><Swords size={25} /><span>Разыграй карту из руки</span></div>}</div>
      <div className="turn-control"><span>ХОД {Math.ceil(game.turn / 2)}</span><button className={`end-turn ${playerTurn ? '' : 'waiting'}`} disabled={!playerTurn} onClick={() => dispatch({ type: 'end' })}>{playerTurn ? <>Завершить<ChevronRight size={15} /></> : <><span className="thinking-dot" /> Ход Бориса</>}</button></div>
      <div className="own-hero-row"><Hero player={game.player} side="player" active={playerTurn} targetable={false} onClick={() => {}} /><button className={`hero-power ${selection?.type === 'power' ? 'selected' : ''}`} disabled={!playerTurn || game.player.powerUsed || game.player.mana < power.cost || (game.player.power === 'rds' && game.player.board.length >= 7) || (game.player.power === 'fool' && game.bot.board.length === 0)} onClick={() => { if (game.player.power === 'spark') setSelection(selection?.type === 'power' ? null : { type: 'power' }); else dispatch({ type: 'power' }); }} title={`${power.name}: ${power.text}`} aria-label={`Сила героя ${power.name}, ${power.cost} маны`}><span className="power-orb">{power.icon}<span>{power.cost}</span></span><strong>{power.name}</strong><small>{game.player.powerUsed ? 'Использована' : 'Сила героя'}</small></button></div>
      <div className={`battle-hint ${selection ? 'choosing' : ''}`} role="status">{selection ? <Swords size={15} /> : <Sparkles size={14} />}{hint}{selection && <button className="icon-button" onClick={() => setSelection(null)} aria-label="Отменить выбор"><X size={13} /></button>}</div>
      <div className="player-hand" aria-label="Карты в руке">{game.player.hand.map((c, i) => <div key={c.uid} data-combat-anchor={`player:${c.uid}`} className={`hand-card-wrap ${selection?.type === 'play' && selection.uid === c.uid ? 'selected' : ''}`} style={{ '--hand-i': i } as React.CSSProperties}><Card card={CARD[c.id]} cost={cardCost(game, c.id)} compact playable={playerTurn && cardCost(game, c.id) <= game.player.mana} onClick={() => selectCard(c.uid)} /><button className="hand-info" onClick={() => inspect(CARD[c.id])} aria-label={`Посмотреть ${CARD[c.id].name}`}><CircleHelp size={13} /></button></div>)}</div>
      <div className="arena-bottom"><span className="deck-counter"><Layers3 size={15} />{game.player.deck.length}<span>в колоде</span>{game.player.fatigue > 0 && <em>Усталость {game.player.fatigue}</em>}</span><Mana player={game.player} /><span className="hand-counter">{game.player.hand.length}/10 в руке</span></div>
      {showLog && <aside className="battle-log"><div><h3>История сражения</h3><button className="icon-button" aria-label="Закрыть журнал" onClick={() => setShowLog(false)}><X size={17} /></button></div><ol>{[...game.log].reverse().map(l => <li key={l.id} className={l.side}><span>ХОД {l.turn ?? '—'} · {l.side === 'player' ? 'ВЫ' : l.side === 'bot' ? 'БОРИС' : '✦'}</span>{l.text}</li>)}</ol></aside>}
    </div>
    <CombatEffects game={game} enabled={animations} />
    {game.winner && showResult && <Modal title="Результат боя" close={back} className="result-modal"><div className={`result-emblem ${game.winner === 'player' ? 'victory' : ''}`}><Crown size={48} /></div><div className="eyebrow">ПАРТИЯ ОКОНЧЕНА</div><h2>{game.winner === 'player' ? 'Твоя взяла!' : game.winner === 'draw' ? 'Вот это ничья.' : 'Ещё по одной?'}</h2><p>{game.winner === 'player' ? 'Борис признаёт: твои мемы оказались сильнее.' : game.winner === 'draw' ? 'Два героя, одна судьба. Идеальный баланс.' : 'Даже легенды иногда проигрывают. Борис уже сдаёт карты.'}</p><div className="result-stats"><div><strong>{Math.ceil(game.turn / 2)}</strong><span>ХОДОВ</span></div><div><strong>{game.player.board.length}</strong><span>СУЩЕСТВ НА ПОЛЕ</span></div></div><button className="button primary" onClick={rematch}><Swords size={18} /> Ещё одна партия</button><button className="text-button" onClick={back}>В главное меню</button></Modal>}
    {confirm && <Modal title="Сдаться" close={() => setConfirm(false)} className="small-modal"><Flag className="modal-symbol" size={30} /><h2>Закончим партию?</h2><p>Борис получит победу. Вернуться в главное меню и продолжить бой позже можно без поражения.</p><button className="button danger" onClick={() => { dispatch({ type: 'concede' }); setConfirm(false); }}>Сдаться</button><button className="button secondary" onClick={() => setConfirm(false)}>Продолжить бой</button></Modal>}
  </section>;
}
