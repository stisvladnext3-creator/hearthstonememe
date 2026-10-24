import { CARD } from '../game/cards';
import { POWER_CARDS } from '../game/presentation';
import { activePower, type Game, type Side } from '../game/engine';
import type { Inspect } from '../inspection';
import { useLongPress } from '../useLongPress';
import { Art } from './Card';

export default function HeroPower({ game, side, inspect, unavailableReason, selected = false, onClick }: {
  game: Game; side: Side; inspect: Inspect; unavailableReason?: string; selected?: boolean; onClick?: () => void;
}) {
  const player = game[side];
  const power = CARD[POWER_CARDS[activePower(game, side)]];
  const enemy = side === 'bot';
  const status = player.powerSilenceTurns ? `Немота: ${player.powerSilenceTurns}` : player.powerUsed ? 'Использована' : unavailableReason && !enemy ? 'Недоступна' : 'Сила героя';
  const note = player.powerSilenceTurns ? `Сила героя отключена немотой. Осталось своих ходов: ${player.powerSilenceTurns}.` : player.powerUsed ? 'Сила героя уже использована в этом ходу.' : unavailableReason;
  const open = () => inspect(power, { zone: 'power', owner: side, note });
  const gesture = useLongPress(open);
  return <button className={`hero-power ${enemy ? 'enemy-power' : 'own-power'} ${selected ? 'selected' : ''} ${player.powerSilenceTurns ? 'silenced-power' : ''} ${player.powerUsed ? 'used-power' : ''}`}
    aria-disabled={enemy ? undefined : !!unavailableReason} {...gesture} onClick={enemy ? open : onClick}
    title={`${power.name}: ${power.text}${note ? ` ${note}` : ''}`}
    aria-label={`${enemy ? 'Сила героя противника' : 'Сила героя'} ${power.name}, ${power.cost} маны`}>
    <span className="power-orb"><Art index={power.art} cardId={power.id} /><span>{power.cost}</span></span>
    <strong>{power.name}</strong><small>{status}</small>
  </button>;
}
