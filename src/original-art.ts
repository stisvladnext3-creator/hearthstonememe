// Shared originals and downloaded illustrations are bundled with the game here.
// Paths are relative to public/, so Vite's deployment base is respected.
export type ImageFormat = 'card' | 'editor' | 'portrait';
export interface ArtCredit { title: string; author: string; source: string; license: string; licenseUrl: string }
export interface SharedArtwork { path: string; format: ImageFormat; position?: string; size?: string; credit?: ArtCredit }
export const ORIGINAL_ART: Record<string, SharedArtwork> = {
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
