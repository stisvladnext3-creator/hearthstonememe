import { useId } from 'react';
import type { Minion } from '../game/engine';

export default function UnitEnchantments({ minion: m, aura, immune }: { minion: Minion; aura: boolean; immune: boolean }) {
  const id = useId().replaceAll(':', '');
  return <span className="unit-enchantments" aria-hidden="true">
    {aura && <span className="unit-aura-fire"><i /><i /><i /><i /><i /><i /></span>}
    {m.taunt && <svg className="unit-taunt-frame" viewBox="0 0 100 140" preserveAspectRatio="none"><defs><linearGradient id={id+'steel'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f2e8ce"/><stop offset=".2" stopColor="#929792"/><stop offset=".48" stopColor="#353c3e"/><stop offset=".67" stopColor="#d6d7c2"/><stop offset="1" stopColor="#777a70"/></linearGradient></defs><path d="M9 23 23 13Q50-3 77 13L91 23 91 91Q85 115 50 135 15 115 9 91Z" fill="none" stroke="#24282b" strokeWidth="12"/><path d="M9 23 23 13Q50-3 77 13L91 23 91 91Q85 115 50 135 15 115 9 91Z" fill="none" stroke={`url(#${id}steel)`} strokeWidth="8"/><path d="M15 26 27 18Q50 4 73 18L85 26 85 90Q79 110 50 127 21 110 15 90Z" fill="none" stroke="#c8c2a4" strokeWidth="1.5"/></svg>}
    {m.windfury && <svg className="unit-wind-veil" viewBox="0 0 120 160"><path d="M12 67C-6 40 40 10 89 25S130 70 99 86M105 100C128 128 69 161 25 138S-4 96 22 87M18 108C-3 89 6 64 26 55"/></svg>}
    {m.stealth && <span className="unit-stealth-mist" />}
    {m.reborn && <span className="unit-reborn-halo" />}
    {m.lifesteal && <svg className="unit-lifesteal-wings" viewBox="0 0 150 65"><path d="M66 36Q38 0 5 12L24 29 6 30 31 45 20 50Q47 64 66 45M84 36Q112 0 145 12L126 29 144 30 119 45 130 50Q103 64 84 45"/></svg>}
    {m.elusive && <span className="unit-elusive-glass" />}
    {immune && <span className="unit-immunity-shell" />}
    {m.divineShield && <span className="unit-divine-bubble" />}
  </span>;
}
