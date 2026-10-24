import { useState } from 'react';
import { phoneScreen, useViewport } from '../useViewport';
import { ArrowRight, BookOpen, Flame, Layers3, RefreshCw, Skull, Sparkles, Swords, WandSparkles, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { CARD } from '../game/cards';
import { heroCard } from '../game/presentation';
import type { HistoryEntry, HistoryEntity, HistoryKind } from '../game/history';
import type { Inspect } from '../inspection';
import { useLongPress } from '../useLongPress';
import { Art } from './Card';

const KINDS: Record<HistoryKind, { text: string; icon: React.ReactNode }> = {
  play: { text: 'Розыгрыш', icon: <Layers3 /> }, attack: { text: 'Атака', icon: <Swords /> },
  effect: { text: 'Эффект карты', icon: <Sparkles /> }, power: { text: 'Сила героя', icon: <WandSparkles /> },
  transform: { text: 'Превращение', icon: <RefreshCw /> }, death: { text: 'Гибель', icon: <Skull /> },
  draw: { text: 'Добор', icon: <BookOpen /> }, discard: { text: 'Карта сгорела', icon: <Flame /> },
  turn: { text: 'Новый ход', icon: <Sparkles /> }, finish: { text: 'Конец боя', icon: <Flame /> },
  discover: { text: 'Раскопка', icon: <BookOpen /> },
};
function Entity({ entity, inspect, note, small = false }: { entity: HistoryEntity; inspect: Inspect; note: string; small?: boolean }) {
  const open = () => {
    const card = entity.type === 'hero' ? heroCard(entity.id) : CARD[entity.id];
    if (card) inspect(card, { zone: 'history', owner: entity.side, note });
  };
  const gesture = useLongPress(open);
  return <button className={`history-entity ${entity.type} ${small ? 'small' : ''}`} onClick={open} {...gesture} aria-label={`Посмотреть ${entity.name}`}>
    <span className="history-portrait"><Art index={entity.art} cardId={entity.id} />{entity.type === 'power' && <WandSparkles className="entity-power-mark" size={12} />}</span>
    <span className="history-entity-name">{entity.name}</span>
  </button>;
}
export default function BattleHistory({ entries, inspect, close, opponent = 'Борис' }: { entries: HistoryEntry[]; inspect: Inspect; close: () => void; opponent?: string }) {
  const size = useViewport(), pageSize = phoneScreen(size) ? (size.height < 700 ? 1 : 2) : 5;
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(entries.length / pageSize)), current = Math.min(page, pages);
  return <aside className="battle-log illustrated-history" aria-label="История сражения"><div className="history-header"><div><span>ХРОНИКИ ТРАКТИРА</span><h3>История сражения</h3></div><button className="icon-button" aria-label="Закрыть журнал" onClick={close}><X size={20} /></button></div>
    <ol>{[...entries].reverse().slice((current - 1) * pageSize, current * pageSize).map(entry => {
      const kind = KINDS[entry.kind ?? (entry.side === 'system' ? 'turn' : 'effect')];
      return <li key={entry.id} className={`history-entry ${entry.side} history-${entry.kind ?? 'legacy'}`}>
        <div className="history-entry-heading"><span>ХОД {entry.turn ?? '—'} · {entry.side === 'player' ? 'ВЫ' : entry.side === 'bot' ? opponent.toUpperCase() : 'ТРАКТИР'}</span><span>{kind.icon}{kind.text}</span></div>
        {entry.hero && <div className="history-caster"><Entity entity={entry.hero} inspect={inspect} note={entry.text} small /><span>использует силу героя</span></div>}
        {entry.actor && <div className="history-participants"><Entity entity={entry.actor} inspect={inspect} note={entry.text} />{entry.target && <><span className="history-action-arrow">{entry.kind === 'attack' ? <Swords size={18} /> : <ArrowRight size={18} />}</span><Entity entity={entry.target} inspect={inspect} note={entry.text} /></>}</div>}
        {entry.result && <div className="history-transform-result"><RefreshCw size={15} /><span>Превращено в</span><Entity entity={entry.result} inspect={inspect} note={`${entry.text} Боевой клич не срабатывал.`} small /></div>}
        {entry.kind === 'attack' && <div className="history-damage"><span><Swords size={13} /> {entry.amount} урона</span>{entry.retaliation !== undefined && <span>В ответ: {entry.retaliation}</span>}</div>}
        <p>{entry.text}</p>
      </li>;
    })}</ol>
    <div className="history-pagination"><button aria-label="Предыдущая страница истории" disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft size={20} /></button><span>{current} / {pages}</span><button aria-label="Следующая страница истории" disabled={current >= pages} onClick={() => setPage(current + 1)}><ChevronRight size={20} /></button></div>
    <p className="history-tip">Нажми на изображение, чтобы прочитать описание.</p>
  </aside>;
}
