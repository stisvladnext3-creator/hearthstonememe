import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { applyRecords,captureRecords,hasProgress,initializeAccountDecks,mergeRecords,recordPatch,totals,type Records } from './model';
import { profileDatabase,profileKey,roomSaveKey,setProfileScope } from './scope';
import { read,write } from '../storage';
import { deckLimit,loadDeckBook,saveDeckBook } from '../decks';
import { setTestAccount } from './access';
import { emptyMetrics } from '../game/metrics';
import { newCustomCard } from '../game/custom-cards';
import { newRule } from '../game/custom-schema';
import {pcmSound} from '../game/play-media';

const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
let store:Map<string,string>;
beforeEach(()=>{store=new Map();setProfileScope('guest');setTestAccount(false);vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)});});
afterEach(()=>{setProfileScope('guest');setTestAccount(false);vi.unstubAllGlobals();});
const deck=(name='Маг',cards=['regular'])=>({id:'one',name,heroClass:'mage' as const,cards,order:0});
it('keeps guest, two accounts, artwork databases and live room caches separate',()=>{
 write('online-name','Гость');setProfileScope(alice);expect(read('online-name','')).toBe('');write('online-name','Алиса');setProfileScope(bob);write('online-name','Боб');
 setProfileScope(alice);expect(read('online-name','')).toBe('Алиса');expect(profileDatabase('images')).not.toBe(profileDatabase('images',bob));expect(roomSaveKey()).not.toBe(roomSaveKey(bob));
 setProfileScope('guest');expect(read('online-name','')).toBe('Гость');expect(profileKey('stats')).toBe('memestone.v1.stats');expect(()=>setProfileScope('../bad')).toThrow();
});
it('seeds the same five starters on new devices and respects a deliberately empty cloud library',()=>{
 initializeAccountDecks(alice,{revision:0,records:{}});initializeAccountDecks(bob,{revision:0,records:{}});expect(store.get(profileKey('decks',alice))).toBe(store.get(profileKey('decks',bob)));
 expect(hasProgress(captureRecords(alice))).toBe(false);setProfileScope(alice);expect(loadDeckBook().decks).toHaveLength(5);
 store.delete(profileKey('decks',bob));initializeAccountDecks(bob,{revision:2,records:{'deck:one':null}});expect(store.has(profileKey('decks',bob))).toBe(false);
});
it('combines independent deck edits and additions rather than overwriting the snapshot',async()=>{
 const base={'deck:one':deck()},local={...base,'deck:two':{...deck('Вторая'),id:'two'}},remote={'deck:one':deck('Новое имя')};
 const merged=await mergeRecords(base,local,remote);expect(merged.conflicts).toBe(0);expect(merged.records['deck:one']).toEqual(remote['deck:one']);expect(merged.records['deck:two']).toEqual(local['deck:two']);
});
it('preserves both concurrent versions with a deterministic conflict copy',async()=>{
 const base={'deck:one':deck()},local={'deck:one':deck('Телефон')},remote={'deck:one':deck('Компьютер')};
 const first=await mergeRecords(base,local,remote),again=await mergeRecords(base,local,remote);expect(first.conflicts).toBe(1);expect(first.records).toEqual(again.records);expect(first.records['deck:one']).toEqual(remote['deck:one']);
 const copy=Object.entries(first.records).find(([k])=>k!=='deck:one')!;expect(copy[1]).toMatchObject({name:'Телефон · копия'});
 const repeat=await mergeRecords(base,first.records,remote);expect(Object.keys(repeat.records)).toHaveLength(2);
});
it('deletes the original but retains an independently edited version of a removed deck',async()=>{
 const base={'deck:one':deck()},merged=await mergeRecords(base,{'deck:one':deck('Офлайн')},{});expect(merged.records['deck:one']).toBeNull();expect(Object.values(merged.records).filter(Boolean)).toHaveLength(1);
 expect(recordPatch({'deck:one':null},{})).toEqual({});expect(recordPatch(base,{})).toEqual({'deck:one':null});
});
it('removes a cloud-deleted preference instead of uploading the old device value again',()=>{
 store.set(profileKey('online-name',alice),JSON.stringify('Прежнее имя'));applyRecords({'preferences:online-name':null},alice);expect(captureRecords(alice)['preferences:online-name']).toBeUndefined();
});
it('restores the selected animation and embedded sound on another account device',()=>{
 const c=newCustomCard();c.editor!.animation='portal';c.editor!.sound=pcmSound(new Float32Array(1600),'voice.wav');applyRecords({['card:'+c.id]:c},alice);const captured=captureRecords(alice);applyRecords(captured,bob);const restored=captureRecords(bob)['card:'+c.id];expect(restored).toEqual(captured['card:'+c.id]);expect((restored as typeof c).editor!.sound).toEqual(c.editor!.sound);
});
it('counts each match once while combining monotonic metrics from two devices',async()=>{
 const a={...emptyMetrics(),cardsPlayed:5,heroDamage:8,finished:true,won:true},b={...a,cardsPlayed:2,heroDamage:12,finished:false,won:false};
 const merged=await mergeRecords({}, {'stat:m1':a},{'stat:m1':b,'stat:m2':{...emptyMetrics(),finished:true,won:false}}),stats=totals(merged.records);
 expect(stats).toMatchObject({cardsPlayed:5,heroDamage:12,games:2,wins:1});expect(stats.matches.m1).toMatchObject({finished:true,won:true});
});
it('migrates legacy wins with unknown per-match outcomes without counting totals twice',async()=>{
 store.set(profileKey('stats','guest'),JSON.stringify({cardsPlayed:15,heroDamage:20,minionDamage:8,manaSpent:22,games:2,wins:1,matches:{old:{cardsPlayed:10,heroDamage:12,minionDamage:3,manaSpent:14,finished:true},old2:{cardsPlayed:5,heroDamage:8,minionDamage:5,manaSpent:8,finished:true}}}));
 const original=captureRecords('guest');expect(totals(original)).toMatchObject({games:2,wins:1,cardsPlayed:15});applyRecords(original,alice);
 const once=captureRecords(alice),twice=(await mergeRecords({},once,original)).records;expect(totals(twice)).toMatchObject({games:2,wins:1,cardsPlayed:15});expect(recordPatch(once,captureRecords(alice))).toEqual({});
 applyRecords(twice,alice);expect(totals(captureRecords(alice))).toMatchObject({games:2,wins:1,cardsPlayed:15});
});
it('retains custom dependencies referenced by an offline card when another device removes them',async()=>{
 const token={...newCustomCard(),kind:'token' as const},parent=newCustomCard();parent.editor!.rules=[{...newRule(),operation:'summon',target:'ownHero',cardId:token.id}];
 const base:Records={['card:'+token.id]:token},local={...base,['card:'+parent.id]:parent};
 const merged=await mergeRecords(base,local,{});expect(merged.records['card:'+token.id]).toEqual(token);expect(merged.records['pin:'+token.id]).toBe(true);
});
it('retains saved conflict copies above the creation limit and grants unlimited creation only to the admin capability',()=>{
 setProfileScope(alice);const decks=Array.from({length:22},(_,i)=>({...deck('Колода '+i),id:String(i)}));saveDeckBook({version:1,decks,selectedId:'0'});expect(loadDeckBook().decks).toHaveLength(22);expect(deckLimit()).toBe(18);setTestAccount(true);expect(deckLimit()).toBe(Infinity);setTestAccount(false);expect(deckLimit()).toBe(18);
});
