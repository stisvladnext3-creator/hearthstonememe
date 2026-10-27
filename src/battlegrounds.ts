export const BATTLEGROUNDS = [
  { id: 'jungle', name: 'Затерянные джунгли', description: 'Древние руины, каменные змеи, лианы и светящийся источник.', image: 'art/jungle-board.png' },
  { id: 'knights', name: 'Фиолетовая цитадель', description: 'Каменные рыцари, золото и фиолетовые знамёна.', image: 'art/knights-board.png' },
  { id: 'tavern', name: 'Стол в трактире', description: 'Зелёное сукно, свечи и магические кристаллы.', image: 'art/battlefield.png' },
  { id: 'forge', name: 'Огненная кузница', description: 'Лава, наковальня, шестерни и оружейная мастерская.', image: 'art/forge-board.png' },
] as const;
export type BattlegroundId = typeof BATTLEGROUNDS[number]['id'];
export function battleground(id: unknown) {
  return BATTLEGROUNDS.find(board => board.id === id) ?? BATTLEGROUNDS[0];
}
export function boardImage(id: BattlegroundId) {
  return `${import.meta.env.BASE_URL}${battleground(id).image}`;
}
