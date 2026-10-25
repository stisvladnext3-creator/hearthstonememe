import { afterEach, expect, it, vi } from 'vitest';
import { CARD, STARTER_DECK, classDeck, deckError } from './cards';
import { HERO_CLASSES, belongsToClass, matchesClass, type HeroClass } from './classes';
import { createGame } from './engine';
import { createDeck, loadDeckBook, readyDeck } from '../decks';
import { createRoomGame, roomGameView, validRoomView } from '../online/protocol';
import { copyCardTemplate } from './custom-presets';
import { normalizeCustomCard } from './custom-schema';
import { savedRoom } from '../online/room';

const classes=Object.keys(HERO_CLASSES) as HeroClass[];
afterEach(()=>vi.unstubAllGlobals());
it('assigns all five named cards to their requested class and keeps the new quest, reward and dinosaur neutral',()=>{
 for(const [id,heroClass] of [['marshal-mars','cat'],['general-mikhalych','cat'],['bolt','mage'],['draw','mage'],['paper-army','warlock']]){
  expect(CARD[id].heroClass).toBe(heroClass);expect(matchesClass(CARD[id],heroClass)).toBe(true);expect(matchesClass(CARD[id],'neutral')).toBe(false);
  for(const cl of classes)expect(belongsToClass(CARD[id],cl)).toBe(cl===heroClass);
  expect(normalizeCustomCard(copyCardTemplate(CARD[id]))?.heroClass).toBe(heroClass);
 }
 for(const id of ['stegosaurus','incinerate-quest','t34','lizard'])expect(matchesClass(CARD[id],'neutral')).toBe(true);
 expect(CARD.stegosaurus).toMatchObject({cost:3,attack:2,health:3,taunt:true,tribe:'Динозавр',rarity:'common'});
});
it.each(classes)('keeps ready, initial and room decks legal for class %s after reassigning built-in cards',cl=>{
 const deck=createDeck(cl,'Своя');expect(deck.cards).toHaveLength(30);expect(readyDeck(deck)).toBe(true);expect(deckError(deck.cards,cl)).toBeUndefined();
 const g=createGame(undefined,922,undefined,undefined,{player:cl,bot:cl});
 for(const p of [g.player,g.bot])expect([...p.deck,...p.hand.map(c=>c.id)].every(id=>belongsToClass(CARD[id],cl))).toBe(true);
 const r=createRoomGame(deck.cards,deck.cards,'А','Б',922,'classes',undefined,{host:cl,guest:cl});expect(validRoomView(roomGameView(r,'player'))).toBe(true);
});
it('repairs reclassified cards in existing decks, preserves names, sizes, selection and unrelated missing-card drafts',()=>{
 const decks=classes.map((cl,i)=>({id:'old-'+i,name:'Колода '+cl,heroClass:cl,cards:[...STARTER_DECK]}));
 decks[0].cards[0]='missing-definition';
 vi.stubGlobal('localStorage',{getItem:(key:string)=>key==='memestone.v1.decks'?JSON.stringify({version:1,decks,selectedId:'old-2'}):null});
 const saved=loadDeckBook();expect(saved.selectedId).toBe('old-2');expect(saved.decks[0].cards).toHaveLength(29);
 for(const d of saved.decks.slice(1)){expect(d.cards).toHaveLength(30);expect(readyDeck(d)).toBe(true);expect(d.cards).toEqual(classDeck(STARTER_DECK,d.heroClass));}
});

it('keeps a saved room and its game resumable when old native deck cards change class',()=>{
 const host=classDeck(STARTER_DECK,'warrior'),guest=classDeck(STARTER_DECK,'mage');
 const game=createRoomGame(host,guest,'А','Б',80,'existing-room',undefined,{host:'warrior',guest:'mage'});
 const saved={role:'host',code:'ABC234',revision:3,self:{name:'А',token:'host-token',heroClass:'warrior',deck:STARTER_DECK},guest:{name:'Б',token:'guest-token',heroClass:'mage',deck:STARTER_DECK},game};
 vi.stubGlobal('sessionStorage',{getItem:()=>JSON.stringify(saved)});const restored=savedRoom();expect(restored?.game?.id).toBe('existing-room');expect(restored?.revision).toBe(3);
 expect(restored?.self.deck).toEqual(host);expect(restored?.guest?.deck).toEqual(guest);
});
