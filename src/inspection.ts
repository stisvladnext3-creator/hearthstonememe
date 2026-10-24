import type { Minion, Side } from './game/engine';
import type { CardDef } from './game/cards';

export interface InspectionInfo {
  zone: 'hand' | 'board' | 'history' | 'hero' | 'power' | 'discover'; owner?: Side;
  cost?: number; minion?: Minion; note?: string;
}
export type Inspect = (card: CardDef, info?: InspectionInfo) => void;
