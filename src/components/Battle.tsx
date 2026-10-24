import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, CircleHelp, Crown, Flag, Flame, Layers3, Map, RefreshCw, Settings2, Shield, Sparkles, Swords, X, Zap } from 'lucide-react';
import { CARD } from '../game/cards';
import { activePower, cardCost, legalTargets, powerProblem, targetNeeded, type Action, type Game, type Minion, type Player, type Side, type Target } from '../game/engine';
import { Art, Card } from './Card';
import Modal from './Modal';
import CombatEffects from './CombatEffects';
import BattleHistory from './BattleHistory';
import Discover from './Discover';
import { HEROES, heroCard } from '../game/presentation';
import { useLongPress } from '../useLongPress';
import type { Inspect } from '../inspection';
import HeroPower from './HeroPower';
import { battleground, boardImage, type BattlegroundId } from '../battlegrounds';

type Selection = { type: 'play' | 'attack'; uid: number } | { type: 'power' };
function Mana({ player, compact = false }: { player: Player; compact?: boolean }) {
  return <div className={`mana-bar ${compact ? 'small' : ''}`} aria-label={`Мана ${player.mana} из ${player.maxMana}`}><strong>{player.mana}<span>/{player.maxMana}</span></strong><div>{Array.from({ length: 10 }, (_, n) => <i key={n} className={`${n < player.mana ? 'filled' : ''} ${n >= player.maxMana ? 'locked' : ''}`} />)}</div></div>;
}
function Hero({ player, side, targetable, onClick, active, inspect }: { player: Player; side: Side; targetable: boolean; onClick: () => void; active: boolean; inspect: Inspect }) {
  const gesture = useLongPress(() => inspect(heroCard(player.hero), { zone: 'hero', owner: side, note: player.powerSilenceTurns ? `Сила героя отключена немотой. Осталось своих ходов: ${player.powerSilenceTurns}.` : undefined }));
  const hero = HEROES[player.hero] || HEROES.mage;
  return <div className={`hero-panel ${side} ${active ? 'active' : ''}`}>
    <div className="hero-label"><strong>{hero.name}</strong><span>{player.powerSilenceTurns ? `Сила отключена: ещё ${player.powerSilenceTurns} ${player.powerSilenceTurns === 1 ? 'ход' : 'хода'}` : hero.title}</span></div>
    <button data-combat-anchor={`${side}:hero`} className={`hero-portrait ${targetable ? 'targetable' : ''}`} onClick={onClick} aria-label={`${side === 'bot' ? 'Герой противника' : 'Ваш герой'}: ${player.health} здоровья${targetable ? ', атаковать' : ''}`} aria-disabled={!targetable} {...gesture}>
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
  const gesture = useLongPress(inspect);
  return <div className="unit-wrap"><button data-combat-anchor={`${side}:${m.uid}`} className={`board-unit ${m.taunt ? 'taunt' : ''} ${canSelect ? 'ready' : ''} ${selected ? 'selected' : ''} ${targetable ? 'targetable' : ''}`} onClick={onClick} {...gesture} aria-label={`${c.name}: ${m.attack} атаки, ${m.health} здоровья${canSelect ? ', готов атаковать' : ''}`} title={`${c.name}. ${c.text}`}>
    <Art index={c.art} cardId={c.id} /><div className="unit-shade" /><span className="unit-name">{c.name}</span>
    {m.origin === 'transformed' && <span className="origin-badge" title="Превращение: боевой клич не срабатывал"><RefreshCw size={11} /></span>}
    {m.charge && !m.silenced && <span className="charge-badge" title="Рывок: может атаковать сразу после выхода"><Zap size={12} /></span>}
    {m.taunt && <Shield className="taunt-icon" size={17} />}
    {!m.ready && !m.cannotAttack && <span className="sleep-mark">zZ</span>}
    {m.cannotAttack && <span className="sleep-mark"><X size={15} /></span>}
    {m.silenced && <span className="silence-mark">Немота</span>}
    <span className="unit-attack">{m.attack}</span><span className={`unit-health ${m.health < m.maxHealth ? 'damaged' : ''}`}>{m.health}</span>
  </button><button className="unit-info" onClick={inspect} aria-label={`Подробнее о ${c.name}`}><CircleHelp size={11} /></button></div>;
}
export default function Battle({ game, dispatch, back, rematch, inspect, help, settings, animations, overlayOpen, board, chooseBoard }: {
  game: Game; dispatch: (action: Action) => void; back: () => void; rematch: () => void; inspect: Inspect; help: () => void; settings: () => void; animations: boolean; overlayOpen: boolean; board: BattlegroundId; chooseBoard: () => void;
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
  const playerTurn = game.active === 'player' && !game.winner && !game.discovery;
  useEffect(() => { setSelection(null); }, [game]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelection(null); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const selectedCard = selection?.type === 'play' ? game.player.hand.find(c => c.uid === selection.uid) : undefined;
  const selectingSpell = selection?.type === 'play' || selection?.type === 'power';
  const allowed = selection && (selection.type !== 'play' || selectedCard) ? legalTargets(game, selection.type === 'attack' ? 'attack' : selection.type === 'power' ? 'spark' : CARD[selectedCard!.id].effect === 'silence' ? 'silence' : CARD[selectedCard!.id].effect === 'masik' ? 'masik' : CARD[selectedCard!.id].effect === 'echoMaxim' ? 'echoMaxim' : 'bolt') : [];
  const hit = (target: Target) => {
    if (!selection || !allowed.includes(target)) return;
    dispatch({ ...selection, target } as Action);
    setSelection(null);
  };
  const unavailableReason = powerProblem(game, 'player');
  const powerAvailable = !unavailableReason;
  const selectCard = (uid: number) => {
    if (!playerTurn) return;
    if (selection?.type === 'play' && selection.uid === uid) { setSelection(null); return; }
    if (targetNeeded(game, uid)) setSelection({ type: 'play', uid });
    else dispatch({ type: 'play', uid });
  };
  const hint = game.discovery ? game.discovery.side === 'player' ? 'Выбери карту раскопки.' : 'Борис выбирает карту раскопки…' : selection ? selection.type === 'attack' ? 'Выбери, кого атаковать' : selectedCard && CARD[selectedCard.id].effect === 'masik' ? 'Выбери существо или героя для немоты Масика' : selectedCard && CARD[selectedCard.id].effect === 'echoMaxim' ? 'Выбери своё существо для +1 к атаке' : selectedCard && CARD[selectedCard.id].effect === 'silence' ? 'Выбери своё или вражеское существо для немоты' : 'Выбери цель заклинания' : game.winner ? 'Партия завершена.' : playerTurn ? 'Твой ход. Пусть начнётся хаос.' : 'Борис обдумывает свой ход…';
  return <section className="battle-page page-enter">
    <div className="battle-topbar"><button className="text-button" onClick={back}><ArrowLeft size={16} /> Главное меню</button><span className="battle-mode-label"><span className="live-dot" /> ТРЕНИРОВКА С БОТОМ</span><div><button className="icon-button field-toggle" onClick={chooseBoard} aria-label="Выбор игрового поля"><Map size={18} /><span>Поле</span></button><button className={`icon-button history-toggle ${showLog ? 'active' : ''}`} onClick={() => setShowLog(!showLog)} aria-label="История сражения"><BookOpen size={18} /><span>История</span></button><button className="icon-button" onClick={help} aria-label="Правила боя"><CircleHelp size={18} /></button><button className="icon-button" onClick={settings} aria-label="Настройки"><Settings2 size={18} /></button><button className="icon-button" onClick={() => setConfirm(true)} aria-label="Сдаться"><Flag size={17} /></button></div></div>
    <div className={`battle-arena board-${board}`} data-board={board} aria-label={`Игровое поле: ${battleground(board).name}`} style={{ backgroundImage: `url("${boardImage(board)}")` }}>
      <div className="arena-glow" /><div className="last-action" role="status"><span>ПОСЛЕДНЕЕ ДЕЙСТВИЕ</span>{[...game.log].reverse().find(l => l.side !== 'system')?.text ?? 'Вы ходите первым'}</div><div className="table-corner top-left" /><div className="table-corner bottom-right" />
      <div className="opponent-hand" aria-label={`У Бориса ${game.bot.hand.length} карт`}>{game.bot.hand.map(c => <div className="card-back" data-combat-anchor={`bot:${c.uid}`} key={c.uid}><span>✦</span></div>)}</div>
      <div className="enemy-status"><Mana player={game.bot} compact /><span><Layers3 size={13} /> {game.bot.deck.length} в колоде</span></div>
      <div className="enemy-hero-row"><Hero inspect={inspect} player={game.bot} side="bot" active={game.active === 'bot' && !game.winner} targetable={playerTurn && allowed.includes('hero')} onClick={() => hit('hero')} /><HeroPower game={game} side="bot" inspect={inspect} /></div>
      {game.briefing && <button className="briefing-status" onClick={() => inspect(CARD.briefing, { zone: 'board', owner: 'player', note: `Осталось своих ходов: у вас ${game.briefing!.remainingTurns.player}, у Бориса ${game.briefing!.remainingTurns.bot}. Лимит: одно существо у каждого.` })}><BookOpen size={14} /><span>Держать в курсе<small>Вы: {game.briefing.remainingTurns.player} · Борис: {game.briefing.remainingTurns.bot}</small><small>1 существо · добор за 6</small></span></button>}
      {(['player', 'bot'] as const).map(side => game[side].quest && <button key={side} className={`quest-progress ${side}`} onClick={() => inspect(CARD['rash-quest'], { zone: 'board', owner: side, note: `Призвано РАШ: ${game[side].quest!.progress}/8. Награда: Волонтер-босс.` })}><Crown size={15} /><span>{side === 'bot' ? 'Борис: ' : ''}РАШ {game[side].quest!.progress}/8</span></button>)}
      <div className="battle-board enemy-board">{game.bot.board.length ? game.bot.board.map(m => <Unit key={m.uid} m={m} side="bot" selected={false} canSelect={false} targetable={playerTurn && allowed.includes(m.uid)} onClick={() => hit(m.uid)} inspect={() => inspect(CARD[m.id], { zone: 'board', owner: 'bot', minion: m })} />) : <span className="empty-board-hint">Здесь появятся существа соперника</span>}</div>
      <div className="board-divider"><span /><i>✦</i><span /></div>
      <div className="battle-board player-board">{game.player.board.length ? game.player.board.map(m => <Unit key={m.uid} m={m} side="player" selected={selection?.type === 'attack' && selection.uid === m.uid} canSelect={playerTurn && !selectingSpell && m.ready && !m.cannotAttack && m.attack > 0} targetable={playerTurn && allowed.includes(m.uid)} onClick={() => { if (!playerTurn) return; if (allowed.includes(m.uid)) { hit(m.uid); return; } if (selectingSpell) return; if (m.ready && !m.cannotAttack && m.attack > 0) setSelection(selection?.type === 'attack' && selection.uid === m.uid ? null : { type: 'attack', uid: m.uid }); }} inspect={() => inspect(CARD[m.id], { zone: 'board', owner: 'player', minion: m })} />) : <div className="summon-hint"><Swords size={25} /><span>Разыграй карту из руки</span></div>}</div>
      <div className="turn-control"><span>ХОД {Math.ceil(game.turn / 2)}</span><button className={`end-turn ${playerTurn ? '' : 'waiting'}`} disabled={!playerTurn} onClick={() => dispatch({ type: 'end' })}>{playerTurn ? <>Завершить<ChevronRight size={15} /></> : <><span className="thinking-dot" /> {game.discovery?.side === 'player' ? 'Выбор карты' : 'Ход Бориса'}</>}</button></div>
      <div className="own-hero-row"><Hero inspect={inspect} player={game.player} side="player" active={game.active === 'player' && !game.winner} targetable={playerTurn && allowed.includes('own-hero')} onClick={() => hit('own-hero')} /><HeroPower game={game} side="player" inspect={inspect} unavailableReason={unavailableReason} selected={selection?.type === 'power'} onClick={() => { if (!powerAvailable) { dispatch({ type: 'power' }); return; } if (activePower(game, 'player') === 'spark') setSelection(selection?.type === 'power' ? null : { type: 'power' }); else dispatch({ type: 'power' }); }} /></div>
      <div className={`battle-hint ${selection ? 'choosing' : ''}`} role="status">{selection ? <Swords size={15} /> : <Sparkles size={14} />}{hint}{selection && <button className="icon-button" onClick={() => setSelection(null)} aria-label="Отменить выбор"><X size={13} /></button>}</div>
      <div className="player-hand" aria-label="Карты в руке" style={{ '--hand-count': game.player.hand.length || 1 } as React.CSSProperties}>{game.player.hand.map((c, i) => <div key={c.uid} data-combat-anchor={`player:${c.uid}`} className={`hand-card-wrap ${c.expiresTurn !== undefined ? 'echo-copy' : ''} ${selection?.type === 'play' && selection.uid === c.uid ? 'selected' : ''}`} style={{ '--hand-i': i, '--hand-count': game.player.hand.length } as React.CSSProperties}><Card card={CARD[c.id]} cost={cardCost(game, c.id)} compact onInspect={() => inspect(CARD[c.id], { zone: 'hand', owner: 'player', cost: cardCost(game, c.id), note: c.expiresTurn !== undefined ? 'Копия эха исчезнет в конце этого хода.' : undefined })} playable={playerTurn && cardCost(game, c.id) <= game.player.mana} onClick={() => selectCard(c.uid)} /><button className="hand-info" onClick={() => inspect(CARD[c.id], { zone: 'hand', owner: 'player', cost: cardCost(game, c.id), note: c.expiresTurn !== undefined ? 'Копия эха исчезнет в конце этого хода.' : undefined })} aria-label={`Посмотреть ${CARD[c.id].name}`}><CircleHelp size={13} /></button></div>)}</div>
      <div className="arena-bottom"><span className="deck-counter"><Layers3 size={15} />{game.player.deck.length}<span>в колоде</span>{game.player.fatigue > 0 && <em>Усталость {game.player.fatigue}</em>}</span><Mana player={game.player} /><span className="hand-counter">{game.player.hand.length}/10 в руке</span></div>
      {showLog && <BattleHistory entries={game.log} inspect={inspect} close={() => setShowLog(false)} />}
    </div>
    <CombatEffects game={game} enabled={animations} />
    {game.discovery?.side === 'player' && !overlayOpen && <Discover game={game} dispatch={dispatch} inspect={inspect} back={back} />}
    {game.winner && showResult && <Modal title="Результат боя" close={back} className="result-modal"><div className={`result-emblem ${game.winner === 'player' ? 'victory' : ''}`}><Crown size={48} /></div><div className="eyebrow">ПАРТИЯ ОКОНЧЕНА</div><h2>{game.winner === 'player' ? 'Твоя взяла!' : game.winner === 'draw' ? 'Вот это ничья.' : 'Ещё по одной?'}</h2><p>{game.winner === 'player' ? 'Борис признаёт: твои мемы оказались сильнее.' : game.winner === 'draw' ? 'Два героя, одна судьба. Идеальный баланс.' : 'Даже легенды иногда проигрывают. Борис уже сдаёт карты.'}</p><div className="result-stats"><div><strong>{Math.ceil(game.turn / 2)}</strong><span>ХОДОВ</span></div><div><strong>{game.player.board.length}</strong><span>СУЩЕСТВ НА ПОЛЕ</span></div></div><button className="button primary" onClick={rematch}><Swords size={18} /> Ещё одна партия</button><button className="text-button" onClick={back}>В главное меню</button></Modal>}
    {confirm && <Modal title="Сдаться" close={() => setConfirm(false)} className="small-modal"><Flag className="modal-symbol" size={30} /><h2>Закончим партию?</h2><p>Борис получит победу. Вернуться в главное меню и продолжить бой позже можно без поражения.</p><button className="button danger" onClick={() => { dispatch({ type: 'concede' }); setConfirm(false); }}>Сдаться</button><button className="button secondary" onClick={() => setConfirm(false)}>Продолжить бой</button></Modal>}
  </section>;
}
