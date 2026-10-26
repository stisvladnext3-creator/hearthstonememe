import { CARD, deckCopyLimit, type CardDef } from '../game/cards';
import { belongsToClass, validHeroClass } from '../game/classes';
import { packForCards, validateCardPack } from '../game/custom-cards';
import type { SavedDeck } from '../decks';
export type PublicationKind = 'card' | 'deck' | 'expansion';
export const PUBLICATION_NAMES = {card:'Карта',deck:'Колода',expansion:'Дополнение'} as const;
export interface Publication {
  version:1; id:string; owner:string; kind:PublicationKind; title:string; author:string; description:string; createdAt:number;
  cover?:string; cards:CardDef[]; roots:string[]; deck?:Pick<SavedDeck,'name'|'heroClass'|'cards'>;
}
export interface PublishSeed { kind?:PublicationKind; roots?:string[]; deckId?:string }
const label=(v:unknown,max:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
export const validImage=(v:unknown):v is string=>typeof v==='string'&&v.length<=48_000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
export function validatePublication(raw:unknown):Publication {
  if(!raw||typeof raw!=='object')throw new Error('Публикация повреждена.');
  const p=raw as Publication;
  if(p.version!==1||!/^([a-f0-9]{16})-[a-f0-9-]{36}$/.test(p.id)||!/^([a-f0-9]{64})$/.test(p.owner)||!p.id.startsWith(p.owner.slice(0,16)+'-')
    ||!['card','deck','expansion'].includes(p.kind)||!label(p.title,60)||!label(p.author,24)||typeof p.description!=='string'||p.description.length>500||/[\x00-\x08\x0b-\x1f\x7f]/.test(p.description)
    ||!Number.isSafeInteger(p.createdAt)||p.createdAt<1||p.createdAt>Date.now()+300_000||p.cover!==undefined&&!validImage(p.cover))throw new Error('Некорректные сведения публикации.');
  const cards=validateCardPack(p.cards),map=new Map(cards.map(c=>[c.id,c]));
  if((p.kind!=='deck'&&!cards.length)||!Array.isArray(p.roots)||(p.kind!=='deck'&&!p.roots.length)||p.roots.length>60||new Set(p.roots).size!==p.roots.length||p.roots.some(id=>typeof id!=='string'||!map.has(id))||p.kind==='card'&&p.roots.length!==1)throw new Error('В публикации нет выбранных карт.');
  if(p.kind==='deck') {
    const d=p.deck;
    if(!d||!label(d.name,32)||!validHeroClass(d.heroClass)||!Array.isArray(d.cards)||d.cards.length!==30)throw new Error('Для публикации нужна готовая колода из 30 карт.');
    const find=(id:string)=>map.get(id)??(!id.startsWith('custom-')?CARD[id]:undefined);
    for(const id of d.cards){const c=find(id);if(!c||!['minion','spell','hero'].includes(c.kind)||c.reward||!belongsToClass(c,d.heroClass)||d.cards.filter(x=>x===id).length>deckCopyLimit(c))throw new Error('Колода нарушает правила класса, количества карт или копий.');}
  } else if(p.deck!==undefined)throw new Error('Колода не соответствует типу публикации.');
  return {...p,cards};
}
export function makePublication(owner:string, data:{kind:PublicationKind;title:string;author:string;description:string;cover?:string;roots:string[];deck?:SavedDeck}):Publication {
  const cards=packForCards(data.kind==='deck'?data.deck?.cards??[]:data.roots);
  return validatePublication({version:1,id:owner.slice(0,16)+'-'+crypto.randomUUID(),owner,kind:data.kind,title:data.title.trim(),author:data.author.trim(),description:data.description.trim(),createdAt:Date.now(),
    ...(data.cover?{cover:data.cover}:{}),roots:data.kind==='deck'?cards.map(c=>c.id):data.roots,cards,...(data.deck?{deck:{name:data.deck.name,heroClass:data.deck.heroClass,cards:[...data.deck.cards]}}:{})});
}
