import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { CARD } from './game/cards';
import { read, write } from './storage';
import { PROFILE_REFRESHED } from './account/scope';

export const CARD_APPEARANCES = [
  { id: 'standard', name: 'Классическое' },
  { id: 'signature', name: 'Тёмное' },
  { id: 'diamond', name: 'Алмазное' },
] as const;
export type CardAppearance = typeof CARD_APPEARANCES[number]['id'];
type Choices = Record<string, CardAppearance>;
function loadChoices(): Choices {
  const saved = read<unknown>('card-appearances', null);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
  return Object.fromEntries(Object.entries(saved).filter(([id, choice]) => CARD[id]?.rarity === 'legendary'
    && (choice === 'signature' || choice === 'diamond')));
}
const Context = createContext<{ choices: Choices; select: (id: string, appearance: CardAppearance) => void }>({ choices: {}, select: () => {} });
export const useCardAppearances = () => useContext(Context);
export function CardAppearanceProvider({ children }: { children: ReactNode }) {
  const [choices, setChoices] = useState(loadChoices);
  useEffect(()=>{const refresh=()=>setChoices(loadChoices());window.addEventListener(PROFILE_REFRESHED,refresh);return()=>window.removeEventListener(PROFILE_REFRESHED,refresh);},[]);
  useEffect(() => { write('card-appearances', choices); }, [choices]);
  const select = (id: string, appearance: CardAppearance) => {
    if (CARD[id]?.rarity !== 'legendary' || !CARD_APPEARANCES.some(a => a.id === appearance)) return;
    setChoices(previous => {
      const next = { ...previous };
      if (appearance === 'standard') delete next[id]; else next[id] = appearance;
      return next;
    });
  };
  return <Context.Provider value={{ choices, select }}>{children}</Context.Provider>;
}
