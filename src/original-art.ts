// Shared originals and downloaded illustrations are bundled with the game here.
// Paths are relative to public/, so Vite's deployment base is respected.
export type ImageFormat = 'card' | 'editor' | 'portrait';
export interface ArtCredit { title: string; author: string; source: string; license: string; licenseUrl: string }
export interface SharedArtwork { path: string; format: ImageFormat; position?: string; size?: string; credit?: ArtCredit }
function generatedAtlas(file: 'a' | 'b', column: number, row: number): SharedArtwork {
  return { path: `art/generated/characters-${file}.png`, format: 'portrait', position: `${column * 100 / 3}% ${row * 100}%`, size: '400% 200%' };
}
export const ORIGINAL_ART: Record<string, SharedArtwork> = {
  galinka: generatedAtlas('a', 0, 0),
  goodgame: generatedAtlas('a', 1, 0),
  ruslan: generatedAtlas('a', 2, 0),
  casino: generatedAtlas('a', 3, 0),
  trachukcha: generatedAtlas('a', 0, 1),
  me: generatedAtlas('a', 1, 1),
  deathwing: generatedAtlas('a', 2, 1),
  maratik: generatedAtlas('a', 3, 1),
  jaina: generatedAtlas('b', 0, 0),
  'rds-power': generatedAtlas('b', 1, 0),
  'fool-power': generatedAtlas('b', 2, 0),
  maxim: generatedAtlas('b', 3, 0),
  volunteer: generatedAtlas('b', 0, 1),
  oy: generatedAtlas('b', 1, 1),
  'rds-guard': generatedAtlas('b', 2, 1),
  'rds-helper': generatedAtlas('b', 3, 1),
  rash: generatedAtlas('b', 2, 1),
  'rash-volunteer': generatedAtlas('b', 2, 1),
  'jaina-rusher': { path: 'art/generated/jaina-maxim.png', format: 'portrait', position: '50% 0%', size: '300% 100%' },
  'jaina-volunteer': { path: 'art/generated/jaina-maxim.png', format: 'portrait', position: '0% 0%', size: '300% 100%' },
  'paper-army': { path: 'art/user/new-cards-atlas.png', format: 'portrait', position: '0% 0%', size: '200% 200%' },
  paper: { path: 'art/user/new-cards-atlas.png', format: 'portrait', position: '0% 0%', size: '200% 200%' },
  briefing: { path: 'art/user/new-cards-atlas.png', format: 'portrait', position: '100% 0%', size: '200% 200%' },
  'briefing-power': { path: 'art/user/new-cards-atlas.png', format: 'portrait', position: '100% 0%', size: '200% 200%' },
  'rash-quest': { path: 'art/user/new-cards-atlas.png', format: 'portrait', position: '0% 100%', size: '200% 200%' },
  'echo-maxim': { path: 'art/generated/jaina-maxim.png', format: 'portrait', position: '100% 0%', size: '300% 100%' },
  masik: { path: 'art/user/masik-portrait.png', format: 'portrait', position: 'center 30%' },
  vasiliy: { path: 'art/web/vasiliy.jpg', format: 'portrait', position: '68% 25%', size: '180% auto', credit: {
    title: 'Mystica from British Empire Cattery', author: 'BritishEmpire',
    source: 'https://commons.wikimedia.org/wiki/File:Mystica_from_British_Empire_Cattery.jpg',
    license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  } },
  dragonslayer: { path: 'art/web/dragonslayer.jpg', format: 'portrait', position: 'center 75%', credit: {
    title: 'Saint George and the Dragon', author: 'Raphael',
    source: 'https://commons.wikimedia.org/wiki/File:Raphael_-_Saint_George_and_the_Dragon_-_Google_Art_Project.jpg',
    license: 'Public domain', licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
  } },
  'dog-spell': { path: 'art/web/dog-spell.jpg', format: 'portrait', credit: {
    title: 'Yellow Labrador Looking', author: 'Elf; обработка Djmirko',
    source: 'https://commons.wikimedia.org/wiki/File:YellowLabradorLooking_new.jpg',
    license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  } },
};
