import { Check, Map } from 'lucide-react';
import { BATTLEGROUNDS, boardImage, type BattlegroundId } from '../battlegrounds';

export default function BoardPicker({ value, change }: { value: BattlegroundId; change: (id: BattlegroundId) => void }) {
  return <fieldset className="board-picker"><legend><Map size={18} /> Игровое поле</legend><div className="board-options">
    {BATTLEGROUNDS.map(board => <label className={`board-option ${value === board.id ? 'chosen' : ''}`} key={board.id}>
      <input type="radio" name="battleground" value={board.id} checked={value === board.id} onChange={() => change(board.id)} />
      <span className="board-preview" style={{ backgroundImage: `url("${boardImage(board.id)}")` }}>{value === board.id && <span><Check size={18} /></span>}</span>
      <strong>{board.name}</strong><small>{board.description}</small>
    </label>)}
  </div><p>Выбор сохраняется. Поле можно менять во время боя.</p></fieldset>;
}
