import { CARD } from '../game/cards';
import { powerCardId } from '../game/presentation';
import { activePower, powerCost, type Game, type Side } from '../game/engine';
import type { Inspect } from '../inspection';
import { useLongPress } from '../useLongPress';
import { Art } from './Card';

export default function HeroPower({ game, side, inspect, unavailableReason, selected = false, onClick }: {
  game: Game; side: Side; inspect: Inspect; unavailableReason?: string; selected?: boolean; onClick?: () => void;
}) {
  const player = game[side];
  const power = CARD[powerCardId(activePower(game, side))];
  const cost = powerCost(activePower(game, side), game, side);
  const enemy = side === 'bot';
  const status = player.powerSilenceTurns ? `Немота: ${player.powerSilenceTurns}` : player.powerUsed ? 'Использована' : unavailableReason && !enemy ? 'Недоступна' : 'Сила героя';
  const note = player.powerSilenceTurns ? `Сила героя отключена немотой. Осталось своих ходов: ${player.powerSilenceTurns}.` : player.powerUsed ? 'Сила героя уже использована в этом ходу.' : unavailableReason;
  const open = () => inspect(power, { zone: 'power', owner: side, note, cost });
  const gesture = useLongPress(open);
  return <button className={`hero-power ${power.id === 'storm-power' ? 'storm-power' : ''} ${enemy ? 'enemy-power' : 'own-power'} ${selected ? 'selected' : ''} ${player.powerSilenceTurns ? 'silenced-power' : ''} ${player.powerUsed ? 'used-power' : ''}`}
    aria-disabled={enemy ? undefined : !!unavailableReason} {...gesture} onClick={enemy ? open : onClick}
    title={`${power.name}: ${power.text}${note ? ` ${note}` : ''}`}
    aria-label={`${enemy ? 'Сила героя противника' : 'Сила героя'} ${power.name}, ${cost} маны`}>
    <span className="power-orb" data-combat-anchor={`${side}:power`}><Art index={power.art} cardId={power.id} /><span>{cost}</span></span>
    <strong>{power.name}</strong><small>{status}</small>
  </button>;
}
