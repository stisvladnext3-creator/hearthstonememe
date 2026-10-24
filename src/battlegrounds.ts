export const BATTLEGROUNDS = [
  { id: 'knights', name: 'Фиолетовая цитадель', description: 'Каменные рыцари, золото и фиолетовые знамёна.', image: 'art/knights-board.png' },
  { id: 'tavern', name: 'Стол в трактире', description: 'Зелёное сукно, свечи и магические кристаллы.', image: 'art/battlefield.png' },
] as const;
export type BattlegroundId = typeof BATTLEGROUNDS[number]['id'];
export function battleground(id: unknown) {
  return BATTLEGROUNDS.find(board => board.id === id) ?? BATTLEGROUNDS[0];
}
export function boardImage(id: BattlegroundId) {
  return `${import.meta.env.BASE_URL}${battleground(id).image}`;
}
