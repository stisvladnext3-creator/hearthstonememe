import { useEffect, useLayoutEffect, useState } from 'react';
import { BookOpen, ChevronRight, CircleHelp, Crown, Flag, Flame, RefreshCw, Settings, Shield, Sparkles, Swords, X, Zap } from 'lucide-react';
import { CARD, cardAbilities, type CardDef } from '../game/cards';
import { abilityTargets, cardCost, legalTargets, powerProblem, targetNeeded, type Action, type Game, type Minion, type Player, type Side, type Target } from '../game/engine';
import { Art, Card } from './Card';
import Modal from './Modal';
import CombatEffects from './CombatEffects';
import BattleHistory from './BattleHistory';
import Discover from './Discover';
import { heroDefinition, heroCard } from '../game/presentation';
import { useLongPress } from '../useLongPress';
import type { Inspect } from '../inspection';
import HeroPower from './HeroPower';
import Mulligan from './Mulligan';
import DeckPile from './DeckPile';
import { battleground, boardImage, type BattlegroundId } from '../battlegrounds';
import type { BattleSettingsActions } from './SettingsDialog';
import HistoryRail from './HistoryRail';

type Selection = { type: 'play' | 'attack'; uid: number } | { type: 'power' };
function HandCardFace({ card, cost, playable, play, inspect }: { card: CardDef; cost: number; playable: boolean; play: () => void; inspect: () => void }) {
  const gesture = useLongPress(inspect);
  return <button className="hand-card-button" aria-label={`${card.name}, ${cost} маны`} title={card.text} onClick={play} {...gesture}>
    <Card card={card} cost={cost} compact playable={playable} />
  </button>;
}
function Mana({ player, compact = false }: { player: Player; compact?: boolean }) {
  return <div className={`mana-bar ${compact ? 'small' : ''}`} aria-label={`Мана ${player.mana} из ${player.maxMana}`}><strong>{player.mana}<span>/{player.maxMana}</span></strong><div>{Array.from({ length: 10 }, (_, n) => <i key={n} className={`${n < player.mana ? 'filled' : ''} ${n >= player.maxMana ? 'locked' : ''}`} />)}</div></div>;
}
function Hero({ player, side, targetable, onClick, active, inspect }: { player: Player; side: Side; targetable: boolean; onClick: () => void; active: boolean; inspect: Inspect }) {
  const gesture = useLongPress(() => inspect(heroCard(player.hero), { zone: 'hero', owner: side, note: player.powerSilenceTurns ? `Сила героя отключена немотой. Осталось своих ходов: ${player.powerSilenceTurns}.` : undefined }));
  const hero = heroDefinition(player.hero);
  return <div className={`hero-panel hero-${player.hero} ${side} ${active ? 'active' : ''}`}>
    <div className="hero-label"><strong>{player.name ?? hero.name}</strong></div>
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
  return <div className="unit-wrap"><button data-combat-anchor={`${side}:${m.uid}`} className={`board-unit ${m.taunt ? 'taunt' : ''} ${m.stealth ? 'stealth' : ''} ${canSelect ? 'ready' : ''} ${selected ? 'selected' : ''} ${targetable ? 'targetable' : ''}`} onClick={onClick} {...gesture} aria-label={`${c.name}: ${m.attack} атаки, ${m.health} здоровья${canSelect ? ', готов атаковать' : ''}`} title={`${c.name}. ${c.text}`}>
    <Art index={c.art} cardId={c.id} /><div className="unit-shade" /><span className="unit-name">{c.name}</span>
    {m.origin === 'transformed' && <span className="origin-badge" title="Превращение: боевой клич не срабатывал"><RefreshCw size={11} /></span>}
    {m.charge && !m.silenced && <span className="charge-badge" title="Рывок: может атаковать сразу после выхода"><Zap size={12} /></span>}
    {m.rush && !m.silenced && <span className="rush-badge" title="Натиск: сразу атакует существ, героя — со следующего своего хода"><Swords size={12} /></span>}
    {(c.deathrattle || c.editor?.rules.some(r => r.trigger === 'death')) && !m.silenced && <span className="deathrattle-badge" title={c.text.slice(c.text.indexOf('Предсмертный хрип:'))}>☠</span>}
    {c.bulky && !m.silenced && <span className="bulky-badge" title="Громоздкий: половина атаки по соседям цели">↔</span>}
    {m.stealth && <span className="stealth-badge" title="Маскировка: нельзя выбрать целью вражеской атаки или способности">◉</span>}
    {m.taunt && <Shield className="taunt-icon" size={17} />}
    {!m.ready && !m.cannotAttack && <span className="sleep-mark">zZ</span>}
    {m.cannotAttack && <span className="sleep-mark"><X size={15} /></span>}
    {m.silenced && <span className="silence-mark">Немота</span>}
    <span className="unit-attack">{m.attack}</span><span className={`unit-health ${m.health < m.maxHealth ? 'damaged' : ''}`}>{m.health}</span>
  </button><button className="unit-info" onClick={inspect} aria-label={`Подробнее о ${c.name}`}><CircleHelp size={11} /></button></div>;
}
export default function Battle({ game, dispatch, back, menu, rematch, inspect, settings, animations, overlayOpen, board, multiplayer }: {
  game: Game; dispatch: (action: Action) => void; back: () => void; menu?: () => void; rematch: () => void; inspect: Inspect; settings: (actions: BattleSettingsActions) => void; animations: boolean; overlayOpen: boolean; board: BattlegroundId;
  multiplayer?: { code: string; opponent: string; connected: boolean; blocked: string; notice: string; rematchSelf: boolean; rematchOpponent: boolean };
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
  const opponent = multiplayer?.opponent ?? 'Борис';
  const playerTurn = game.active === 'player' && !game.winner && !game.mulligan && !game.discovery && !multiplayer?.blocked;
  // A repeated network snapshot is the same position. Reset before paint only
  // when the match advances, so a late render cannot cancel a fresh target tap.
  useLayoutEffect(() => { setSelection(null); }, [game.id, game.active, game.turn, game.nextLog, !!game.discovery, !!game.mulligan]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelection(null); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const selectedCard = selection?.type === 'play' ? game.player.hand.find(c => c.uid === selection.uid) : undefined;
  const selectingSpell = selection?.type === 'play' || selection?.type === 'power';
  const allowed = selection && (selection.type !== 'play' || selectedCard) ? selection.type === 'attack' ? legalTargets(game, 'attack', selection.uid) : abilityTargets(game, selection.type === 'play' ? selection.uid : undefined) : [];
  const hit = (target: Target) => {
    if (!selection || !allowed.includes(target)) return;
    dispatch({ ...selection, target } as Action);
    setSelection(null);
  };
  const unavailableReason = multiplayer?.blocked || powerProblem(game, 'player');
  const powerAvailable = !unavailableReason;
  const selectCard = (uid: number) => {
    if (!playerTurn) return;
    if (selection?.type === 'play' && selection.uid === uid) { setSelection(null); return; }
    if (targetNeeded(game, uid)) setSelection({ type: 'play', uid });
    else dispatch({ type: 'play', uid });
  };
  const hint = multiplayer?.blocked || (game.discovery ? game.discovery.side === 'player' ? 'Выбери карту раскопки.' : `${opponent} выбирает карту раскопки…` : selection ? selection.type === 'attack' ? 'Выбери, кого атаковать' : selectedCard && CARD[selectedCard.id].effect === 'masik' ? 'Выбери существо или героя для немоты Масика' : selectedCard && CARD[selectedCard.id].effect === 'echoMaxim' ? 'Выбери своё существо для +1 к атаке' : selectedCard && CARD[selectedCard.id].effect === 'silence' ? 'Выбери своё или вражеское существо для немоты' : 'Выбери цель заклинания' : game.winner ? 'Партия завершена.' : playerTurn ? 'Твой ход. Пусть начнётся хаос.' : `${opponent} обдумывает свой ход…`);
  return <section className="battle-page page-enter">
    <div className={`battle-arena board-${board}`} data-board={board} aria-label={`Игровое поле: ${battleground(board).name}`} style={{ backgroundImage: `url("${boardImage(board)}")` }}>
      <button className="battle-settings icon-button" onClick={() => settings({ leave: menu ?? back, concede: () => setConfirm(true), finished: !!game.winner, online: !!multiplayer })} aria-label="Настройки"><Settings size={21} /></button>
      <HistoryRail entries={game.log} open={() => setShowLog(true)} />
      {multiplayer && (multiplayer.notice || !multiplayer.connected) && <div className="online-notice" role="status">{multiplayer.notice || 'Ждём соединения с соперником…'}</div>}<div className="arena-glow" /><div className="table-corner top-left" /><div className="table-corner bottom-right" />
      <div className="opponent-hand" data-combat-anchor="bot:hand" aria-label={`У ${opponent} ${game.bot.hand.length} карт`}>{game.bot.hand.map(c => <div className="card-back" data-combat-anchor={`bot:${c.uid}`} key={c.uid}><span>✦</span></div>)}</div>
      <div className="enemy-status"><Mana player={game.bot} compact /></div>
      <div className="enemy-hero-row"><Hero inspect={inspect} player={game.bot} side="bot" active={game.active === 'bot' && !game.winner} targetable={playerTurn && allowed.includes('hero')} onClick={() => hit('hero')} /><HeroPower game={game} side="bot" inspect={inspect} /></div>
      {game.briefing && <button className="briefing-status" onClick={() => inspect(CARD.briefing, { zone: 'board', owner: 'player', note: `Осталось своих ходов: у вас ${game.briefing!.remainingTurns.player}, у ${opponent} ${game.briefing!.remainingTurns.bot}. Лимит: одно существо у каждого.` })}><BookOpen size={14} /><span>Держать в курсе<small>Вы: {game.briefing.remainingTurns.player} · {opponent}: {game.briefing.remainingTurns.bot}</small><small>1 существо · добор за 6</small></span></button>}
      {(['player', 'bot'] as const).map(side => game[side].quest && <button key={side} className={`quest-progress ${side}`} onClick={() => inspect(CARD[game[side].quest!.id], { zone: 'board', owner: side, note: CARD[game[side].quest!.id].text })}><Crown size={15} /><span>{side === 'bot' ? `${opponent}: ` : ''}{CARD[game[side].quest!.id].effect === 'rashQuest' ? 'РДШ' : 'Задача'} {game[side].quest!.progress}/{cardAbilities(CARD[game[side].quest!.id])?.quest?.goal ?? 8}</span></button>)}
      <div className="battle-board enemy-board">{game.bot.board.map(m => <Unit key={m.uid} m={m} side="bot" selected={false} canSelect={false} targetable={playerTurn && allowed.includes(m.uid)} onClick={() => hit(m.uid)} inspect={() => inspect(CARD[m.id], { zone: 'board', owner: 'bot', minion: m })} />)}</div>
      <div className="board-divider"><span /><i>✦</i><span /></div>
      <div className="battle-board player-board">{game.player.board.map(m => <Unit key={m.uid} m={m} side="player" selected={selection?.type === 'attack' && selection.uid === m.uid} canSelect={playerTurn && !selectingSpell && m.ready && !m.cannotAttack && m.attack > 0 && legalTargets(game, 'attack', m.uid).length > 0} targetable={playerTurn && allowed.includes(m.uid)} onClick={() => { if (!playerTurn) return; if (allowed.includes(m.uid)) { hit(m.uid); return; } if (selectingSpell) return; if (m.ready && !m.cannotAttack && m.attack > 0 && legalTargets(game, 'attack', m.uid).length > 0) setSelection(selection?.type === 'attack' && selection.uid === m.uid ? null : { type: 'attack', uid: m.uid }); }} inspect={() => inspect(CARD[m.id], { zone: 'board', owner: 'player', minion: m })} />)}</div>
      <div className="turn-control"><span>ХОД {Math.ceil(game.turn / 2)}</span><button className={`end-turn ${playerTurn ? '' : 'waiting'}`} disabled={!playerTurn} onClick={() => dispatch({ type: 'end' })}>{playerTurn ? <>Завершить<ChevronRight size={15} /></> : <><span className="thinking-dot" /> {multiplayer?.blocked ? 'Ждём связь' : game.discovery?.side === 'player' ? 'Выбор карты' : `Ход ${opponent === 'Борис' ? 'Бориса' : opponent}`}</>}</button></div>
      <div className="own-hero-row"><Hero inspect={inspect} player={game.player} side="player" active={game.active === 'player' && !game.winner} targetable={playerTurn && allowed.includes('own-hero')} onClick={() => hit('own-hero')} /><HeroPower game={game} side="player" inspect={inspect} unavailableReason={unavailableReason} selected={selection?.type === 'power'} onClick={() => { if (!powerAvailable) { dispatch({ type: 'power' }); return; } if (targetNeeded(game)) setSelection(selection?.type === 'power' ? null : { type: 'power' }); else dispatch({ type: 'power' }); }} /></div>
      {(selection || multiplayer?.blocked || game.discovery) && <div className={`battle-hint ${selection ? 'choosing' : ''}`} role="status">{selection ? <Swords size={15} /> : <Sparkles size={14} />}{hint}{selection && <button className="icon-button" onClick={() => setSelection(null)} aria-label="Отменить выбор"><X size={13} /></button>}</div>}
      <div className="mobile-hero-name">{game.player.name ?? heroDefinition(game.player.hero).name}</div>
      <div className="player-hand" data-combat-anchor="player:hand" aria-label="Карты в руке" style={{ '--hand-count': game.player.hand.length || 1 } as React.CSSProperties}>{game.player.hand.map((c, i) => <div key={c.uid} data-combat-anchor={`player:${c.uid}`} className={`hand-card-wrap ${c.expiresTurn !== undefined ? 'echo-copy' : ''} ${selection?.type === 'play' && selection.uid === c.uid ? 'selected' : ''}`} style={{ '--hand-i': i, '--hand-count': game.player.hand.length } as React.CSSProperties}><HandCardFace card={CARD[c.id]} cost={cardCost(game, c.id, 'player')} inspect={() => inspect(CARD[c.id], { zone: 'hand', owner: 'player', cost: cardCost(game, c.id, 'player'), note: c.expiresTurn !== undefined ? 'Копия эха исчезнет в конце этого хода.' : undefined })} playable={playerTurn && cardCost(game, c.id, 'player') <= game.player.mana} play={() => selectCard(c.uid)} /><button className="hand-info" onClick={() => inspect(CARD[c.id], { zone: 'hand', owner: 'player', cost: cardCost(game, c.id, 'player'), note: c.expiresTurn !== undefined ? 'Копия эха исчезнет в конце этого хода.' : undefined })} aria-label={`Посмотреть ${CARD[c.id].name}`}><CircleHelp size={13} /></button></div>)}</div>
      <div className="player-mana"><Mana player={game.player} /></div>
      <DeckPile side="player" player={game.player} /><DeckPile side="bot" player={game.bot} />{showLog && <BattleHistory entries={game.log} inspect={inspect} close={() => setShowLog(false)} opponent={opponent} />}
    </div>
    <CombatEffects game={game} enabled={animations} />
    {game.mulligan && !overlayOpen && <Mulligan game={game} dispatch={dispatch} inspect={inspect} blocked={!!multiplayer?.blocked} back={back} />}
    {game.discovery?.side === 'player' && !overlayOpen && !multiplayer?.blocked && <Discover game={game} dispatch={dispatch} inspect={inspect} back={back} />}
    {game.winner && showResult && <Modal title="Результат боя" close={back} className="result-modal"><div className={`result-emblem ${game.winner === 'player' ? 'victory' : ''}`}><Crown size={48} /></div><div className="eyebrow">ПАРТИЯ ОКОНЧЕНА</div><h2>{game.winner === 'player' ? 'Твоя взяла!' : game.winner === 'draw' ? 'Вот это ничья.' : 'Ещё по одной?'}</h2><p>{game.winner === 'player' ? multiplayer ? `Ты побеждаешь в партии с ${opponent}.` : 'Борис признаёт: твои мемы оказались сильнее.' : game.winner === 'draw' ? 'Два героя, одна судьба. Идеальный баланс.' : multiplayer ? `${opponent} побеждает. Можно сыграть ещё одну партию.` : 'Даже легенды иногда проигрывают. Борис уже сдаёт карты.'}</p><div className="result-stats"><div><strong>{Math.ceil(game.turn / 2)}</strong><span>ХОДОВ</span></div><div><strong>{game.player.board.length}</strong><span>СУЩЕСТВ НА ПОЛЕ</span></div></div><button className="button primary" disabled={!!multiplayer && (!multiplayer.connected || multiplayer.rematchSelf)} onClick={rematch}><Swords size={18} />{multiplayer?.rematchSelf ? 'Ждём согласия соперника' : 'Ещё одна партия'}</button>{multiplayer?.rematchOpponent && !multiplayer.rematchSelf && <p className="rematch-invite">Соперник предлагает сыграть ещё раз.</p>}<button className="text-button" onClick={back}>{multiplayer ? 'В комнату' : 'В главное меню'}</button></Modal>}
    {confirm && <Modal title="Сдаться" close={() => setConfirm(false)} className="small-modal"><Flag className="modal-symbol" size={30} /><h2>Закончим партию?</h2><p>{multiplayer ? `${opponent} получит победу. Можно остаться в комнате и договориться о новой партии.` : 'Борис получит победу. Вернуться в главное меню и продолжить бой позже можно без поражения.'}</p><button className="button danger" onClick={() => { dispatch({ type: 'concede' }); setConfirm(false); }}>Сдаться</button><button className="button secondary" onClick={() => setConfirm(false)}>Продолжить бой</button></Modal>}
  </section>;
}
