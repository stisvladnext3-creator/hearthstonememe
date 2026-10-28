import { CARD, CARDS, STARTER_DECK, classDeck, type CardDef } from '../game/cards';
import { validateCardPack } from '../game/custom-cards';
import { references } from '../game/custom-schema';
import { emptyMetrics, METRIC_KEYS, validMetrics } from '../game/metrics';
import { HERO_CLASSES, validHeroClass } from '../game/classes';
import type { Stats } from '../storage';
import { profileKey, profileScope } from './scope';

export type Records = Record<string, unknown | null>;
export interface RemoteState { revision:number;records:Records }
export interface ArtReference { hash:string;format:'card'|'editor'|'portrait';mime:string;size:number }
export const nativeIds=new Set(CARDS.filter(c=>!c.editor).map(c=>c.id));
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function stable(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(object(value))return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value)??'null';
}
const equal=(a:unknown,b:unknown)=>stable(a??null)===stable(b??null);
export const digest=async(value:string|ArrayBuffer)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value))].map(n=>n.toString(16).padStart(2,'0')).join('');
function raw<T>(key:string,fallback:T,scope:string):T {try{return JSON.parse(localStorage.getItem(profileKey(key,scope))??'null')??fallback;}catch{return fallback;}}
function sourceId(scope:string){const key=profileKey('legacy-stats-id',scope);let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;}
export function initializeAccountDecks(scope:string,remote:RemoteState){
  if(remote.revision!==0||Object.keys(remote.records).length||localStorage.getItem(profileKey('decks',scope))!==null)return;
  const decks=Object.keys(HERO_CLASSES).map(heroClass=>({id:'starter-'+heroClass,name:'Стартовый '+HERO_CLASSES[heroClass as keyof typeof HERO_CLASSES].name.toLowerCase(),heroClass,cards:classDeck(STARTER_DECK,heroClass as keyof typeof HERO_CLASSES)}));
  localStorage.setItem(profileKey('decks',scope),JSON.stringify({version:1,decks,selectedId:decks[0].id}));
}
export function captureRecords(scope=profileScope()):Records {
  const result:Records=Object.create(null),book=raw<{decks?:unknown[];selectedId?:string}>('decks',{},scope);
  for(const [order,deck]of(book.decks??[]).entries())if(object(deck)&&typeof deck.id==='string')result['deck:'+deck.id]={...deck,order};
  if(typeof book.selectedId==='string')result['selected:deck']=book.selectedId;
  for(const c of raw<CardDef[]>('custom-cards',[],scope))if(c&&typeof c.id==='string')result['card:'+c.id]=c;
  const library=raw<{items?:{id:string}[];pins?:string[]}>('community-library',{},scope);
  for(const p of library.items??[])if(p&&typeof p.id==='string')result['installation:'+p.id]=p;
  for(const id of library.pins??[])if(typeof id==='string')result['pin:'+id]=true;
  for(const [id,choice]of Object.entries(raw<Record<string,string>>('card-appearances',{},scope)))result['appearance:'+id]=choice;
  for(const [id,ref]of Object.entries(raw<Records>('art-index',{},scope)))if(ref)result['art:'+id]=ref;
  for(const key of ['settings','online-name','training-bot']){const value=raw(key,null,scope);if(value!==null)result['preferences:'+key]=value;}
  const stats=raw<Partial<Stats>>('stats',{},scope),sum={...emptyMetrics(),wins:0,games:0};
  if(object(stats.matches))for(const [id,m]of Object.entries(stats.matches))if(validMetrics(m)&&typeof m.finished==='boolean'){
    const checkpoint={...Object.fromEntries(METRIC_KEYS.map(k=>[k,m[k]])),finished:m.finished,...(typeof m.won==='boolean'?{won:m.won}:{})};
    result['stat:'+id]=checkpoint;for(const k of METRIC_KEYS)sum[k]+=m[k];if(m.finished){sum.games++;if(m.won)sum.wins++;}
  }
  const baseline={...emptyMetrics(),wins:0,games:0};
  for(const k of [...METRIC_KEYS,'wins','games'] as const)baseline[k]=Math.max(0,Number.isSafeInteger(stats[k])?stats[k]!-sum[k]:0);
  // Each imported legacy total has a stable origin. Reimporting a device must
  // not count its pre-account wins again.
  const oldBases=raw<Records>('legacy-stats-bases',{},scope);
  for(const [id,value]of Object.entries(oldBases))if(validMetrics(value)&&object(value))result['legacy:'+id]=value;
  const represented={...emptyMetrics(),wins:0,games:0};
  for(const v of Object.values(oldBases))if(object(v))for(const k of [...METRIC_KEYS,'wins','games'] as const)represented[k]+=typeof v[k]==='number'?v[k] as number:0;
  const own={...baseline};for(const k of [...METRIC_KEYS,'wins','games'] as const)own[k]=Math.max(0,own[k]-represented[k]);
  if(Object.values(own).some(n=>n>0))result['legacy:'+sourceId(scope)]=own;
  return result;
}
function mergeCounter(a:unknown,b:unknown){const l=object(a)?a:{},r=object(b)?b:{},result:Record<string,unknown>={};for(const k of [...METRIC_KEYS,'wins','games'])if(k in l||k in r)result[k]=Math.max(Number(l[k])||0,Number(r[k])||0);if('finished'in l||'finished'in r){result.finished=!!(l.finished||r.finished);const chosen=r.finished?r:l;if(typeof chosen.won==='boolean')result.won=chosen.won;}return result;}
export async function mergeRecords(base:Records,local:Records,remote:Records):Promise<{records:Records;conflicts:number}>{
  const result:Records=Object.create(null);let conflicts=0;
  for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
    const b=base[key]??null,l=local[key]??null,r=remote[key]??null;
    if(key.startsWith('stat:')||key.startsWith('legacy:')){result[key]=l===null&&r===null?null:mergeCounter(l,r);continue;}
    if(equal(l,b)){result[key]=r;continue;}if(equal(r,b)||equal(l,r)){result[key]=l;continue;}
    if(key.startsWith('deck:')){
      result[key]=r===null||l===null?null:r;
      const preserved=l===null?r:l;
      if(object(preserved)){
        const id=String(preserved.id).slice(0,55)+'~'+(await digest(stable(preserved))).slice(0,20);
        result['deck:'+id]={...preserved,id,name:(String(preserved.name).slice(0,20)+' · копия').slice(0,32)};conflicts++;
      }
    }else result[key]=l===null||r===null?null:r;
  }
  // A referenced custom token/power can be removed on another device while a
  // new card that needs it is created offline. Keep this dependency available.
  const all={...base,...remote,...local};
  const visit=(id:string,seen=new Set<string>())=>{if(seen.has(id))return;seen.add(id);const c=result['card:'+id];if(!object(c))return;for(const ref of references(c as unknown as CardDef)){const key='card:'+ref;if(!nativeIds.has(ref)&&!result[key]&&object(all[key])){result[key]=all[key];result['pin:'+ref]=true;}visit(ref,seen);}};
  for(const key of Object.keys(result))if(key.startsWith('card:')&&result[key])visit(key.slice(5));
  return {records:result,conflicts};
}
export function recordPatch(base:Records,next:Records):Records {const result:Records=Object.create(null);for(const key of new Set([...Object.keys(base),...Object.keys(next)]))if(!equal(base[key],next[key]))result[key]=next[key]??null;return result;}
export function totals(records:Records):Stats {
  const result:Stats={...emptyMetrics(),wins:0,games:0,lastResult:null,matches:{}};
  for(const [key,value]of Object.entries(records)){
    if(!object(value)||!validMetrics(value))continue;
    const fields=value as typeof value&{finished?:boolean;won?:boolean;wins?:number;games?:number};
    if(key.startsWith('stat:')&&typeof fields.finished==='boolean'){
      const id=key.slice(5),m={...emptyMetrics(),finished:fields.finished,...(typeof fields.won==='boolean'?{won:fields.won}:{})};
      for(const k of METRIC_KEYS){m[k]=value[k];result[k]=Math.min(Number.MAX_SAFE_INTEGER,result[k]+value[k]);}
      result.matches[id]=m;if(m.finished){result.games++;if(m.won)result.wins++;result.lastResult=id;}
    }else if(key.startsWith('legacy:'))for(const k of [...METRIC_KEYS,'wins','games'] as const){const n=fields[k];if(typeof n==='number'&&Number.isSafeInteger(n)&&n>=0)result[k]=Math.min(Number.MAX_SAFE_INTEGER,result[k]+n);}
  }
  return result;
}
export function materialize(records:Records):Record<string,unknown>{
  const custom=Object.entries(records).filter(([k,v])=>k.startsWith('card:')&&v!==null).map(([,v])=>v),cards=validateCardPack(custom,'library');
  const allowed=new Set([...nativeIds,...cards.map(c=>c.id)]),decks=Object.entries(records).filter(([k,v])=>k.startsWith('deck:')&&object(v)).map(([,v])=>v as Record<string,unknown>).filter(d=>typeof d.id==='string'&&typeof d.name==='string'&&validHeroClass(d.heroClass)&&Array.isArray(d.cards)).sort((a,b)=>Number(a.order??0)-Number(b.order??0)||String(a.id).localeCompare(String(b.id))).map(d=>({id:d.id,name:String(d.name).slice(0,32),heroClass:d.heroClass,cards:(d.cards as unknown[]).filter((id):id is string=>typeof id==='string'&&allowed.has(id)&&!CARD[id]?.reward).slice(0,30)}));
  const selected=records['selected:deck'],bases=Object.fromEntries(Object.entries(records).filter(([k,v])=>k.startsWith('legacy:')&&v).map(([k,v])=>[k.slice(7),v]));
  const result:Record<string,unknown>={'custom-cards':cards,decks:{version:1,decks,selectedId:decks.some(d=>d.id===selected)?selected:decks[0]?.id??null},'community-library':{version:1,items:Object.entries(records).filter(([k,v])=>k.startsWith('installation:')&&object(v)).map(([,v])=>v),pins:Object.keys(records).filter(k=>k.startsWith('pin:')&&records[k]===true).map(k=>k.slice(4))},'card-appearances':Object.fromEntries(Object.entries(records).filter(([k,v])=>k.startsWith('appearance:')&&['signature','diamond'].includes(String(v))).map(([k,v])=>[k.slice(11),v])),stats:totals(records),'legacy-stats-bases':bases};
  for(const k of ['settings','online-name','training-bot'])result[k]=records['preferences:'+k]??null;
  result['art-index']=Object.fromEntries(Object.entries(records).filter(([k,v])=>k.startsWith('art:')&&v).map(([k,v])=>[k.slice(4),v]));
  return result;
}
export function applyRecords(records:Records,scope=profileScope()){
  const values=materialize(records),previous=new Map(Object.keys(values).map(k=>[profileKey(k,scope),localStorage.getItem(profileKey(k,scope))]));
  try{for(const [k,v]of Object.entries(values)){if(v===null)localStorage.removeItem(profileKey(k,scope));else localStorage.setItem(profileKey(k,scope),JSON.stringify(v));}}
  catch(error){for(const [k,v]of previous){if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}throw error;}
}
export function starterRecord(value:unknown){if(!object(value)||!validHeroClass(value.heroClass)||!Array.isArray(value.cards))return false;return ['Твои правила','Стартовый '+HERO_CLASSES[value.heroClass].name.toLowerCase()].includes(String(value.name))&&stable(value.cards)===stable(classDeck(STARTER_DECK,value.heroClass));}
export function hasProgress(records:Records){return Object.entries(records).some(([k,v])=>v!==null&&(k.startsWith('card:')||k.startsWith('installation:')||k.startsWith('stat:')||k.startsWith('legacy:')||k.startsWith('art:')||k.startsWith('deck:')&&!starterRecord(v)));}
