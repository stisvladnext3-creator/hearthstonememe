import { BookOpen, Sparkles } from 'lucide-react';
import type { HistoryEntry } from '../game/history';
import { Art } from './Card';

export default function HistoryRail({ entries, open }: { entries: HistoryEntry[]; open: () => void }) {
  const recent = entries.filter(entry => entry.side !== 'system').slice(-3).reverse();
  return <button className="history-rail" onClick={open} aria-label="История сражения" title="История сражения">
    <BookOpen className="history-rail-book" size={22} />
    <span className="history-rail-events" aria-hidden="true">{recent.map(entry => {
      const entity = entry.actor ?? entry.hero ?? entry.target;
      return <span key={entry.id} className={`history-rail-event ${entry.side}`}>
        {entity ? <Art index={entity.art} cardId={entity.id} /> : <Sparkles size={16} />}
      </span>;
    })}</span>
  </button>;
}
