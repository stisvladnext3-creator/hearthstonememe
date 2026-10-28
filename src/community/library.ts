import {CARD} from '../game/cards';
import {saveCustomLibrary,userCards} from '../game/custom-cards';
import {references} from '../game/custom-schema';
import {deckLimit, deckLimitLabel,type DeckBook} from '../decks';
import {read} from '../storage';
import {validatePublication,type Publication} from './model';
export interface Installation { id:string; kind:Publication['kind']; title:string; author:string; cover?:string; cardIds:string[]; deckId?:string }
interface Manifest {version:1;items:Installation[];pins?:string[]}
const pinned=()=>{const ids=read<Manifest>('community-library',{version:1,items:[]})?.pins;return Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[];};
export function installedItems():Installation[]{const value=read<Manifest>('community-library',{version:1,items:[]});return value?.version===1&&Array.isArray(value.items)?value.items.filter(i=>i&&typeof i.id==='string'&&Array.isArray(i.cardIds)&&i.cardIds.every(id=>typeof id==='string')&&typeof i.title==='string'&&typeof i.author==='string'&&['card','deck','expansion'].includes(i.kind)):[];}
export function installPublication(raw:Publication,book:DeckBook):{book:DeckBook;added:number;installation:Installation}{
  const p=validatePublication(raw),items=installedItems(),previous=items.find(i=>i.id===p.id);
  const matching=p.deck?book.decks.find(d=>d.heroClass===p.deck!.heroClass&&[...d.cards].sort().join(',')===[...p.deck!.cards].sort().join(',')):undefined;
  const haveDeck=previous?.deckId&&book.decks.find(d=>d.id===previous.deckId)||matching;
  if(p.kind==='deck'&&!haveDeck&&book.decks.length>=deckLimit())throw new Error(`Сохранено ${deckLimitLabel()} колод. Удали ненужную колоду перед добавлением новой.`);
  const library=userCards(),merged=new Map(library.map(c=>[c.id,c]));for(const card of p.cards)merged.set(card.id,card);
  const deckId=p.kind==='deck'?(haveDeck?haveDeck.id:crypto.randomUUID()):undefined;
  const nextBook=p.deck&&!haveDeck?{...book,decks:[...book.decks,{...p.deck,id:deckId!,cards:[...p.deck.cards]}],selectedId:deckId!}:book;
  const installation:Installation={id:p.id,kind:p.kind,title:p.title,author:p.author,cardIds:p.cards.map(c=>c.id),...(p.cover?{cover:p.cover}:{}),...(deckId?{deckId}:{})};
  const owned=new Set(items.flatMap(i=>i.cardIds)),pins=[...new Set([...pinned(),...library.filter(c=>!owned.has(c.id)).map(c=>c.id)])];
  saveCustomLibrary([...merged.values()],{'community-library':{version:1,pins,items:[...items.filter(i=>i.id!==p.id),installation]},decks:nextBook});
  return {book:nextBook,added:merged.size-library.length,installation};
}
export function removeExpansion(id:string,book:DeckBook):{book:DeckBook;removed:number;protected:number}{
  const items=installedItems(),item=items.find(i=>i.id===id&&i.kind==='expansion');if(!item)throw new Error('Дополнение не найдено.');
  const all=userCards(),previousIds=new Set(items.flatMap(i=>i.cardIds)),remaining=items.filter(i=>i.id!==id);
  const kept=new Set([...pinned(),...all.filter(c=>!previousIds.has(c.id)).map(c=>c.id),...remaining.flatMap(i=>i.cardIds)]);
  const visit=(id:string)=>{for(const ref of CARD[id]?references(CARD[id]):[]){if(CARD[ref]?.editor&&!kept.has(ref)){kept.add(ref);visit(ref);}}};
  [...kept].forEach(visit);
  const removed=new Set(all.filter(c=>!kept.has(c.id)).map(c=>c.id));
  const nextBook={...book,decks:book.decks.map(d=>({...d,cards:d.cards.filter(id=>!removed.has(id))}))};
  saveCustomLibrary(all.filter(c=>!removed.has(c.id)),{'community-library':{version:1,pins:pinned(),items:remaining},decks:nextBook});
  return {book:nextBook,removed:removed.size,protected:item.cardIds.filter(id=>kept.has(id)).length};
}
