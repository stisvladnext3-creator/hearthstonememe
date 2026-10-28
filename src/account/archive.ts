import { validMetrics, emptyMetrics, type MatchMetrics } from '../game/metrics';
import type { Game } from '../game/engine';
import type { CardDef } from '../game/cards';
import type { HistoryEntry } from '../game/history';
import { heroDefinition } from '../game/presentation';
import { profileChanged, profileDatabase, profileScope } from './scope';
export interface MatchSummary {id:string;endedAt:number;startedAt?:number;turns:number;outcome:'win'|'loss'|'draw';opponent:string;playerHero:string;opponentHero:string;mode:'training'|'online';metrics:MatchMetrics}
export interface ArchivedMatch extends MatchSummary {log:HistoryEntry[];cards:CardDef[]}
interface CachedMatch {id:string;value:ArchivedMatch;uploaded:boolean}
const started=new Map<string,number>();
function database(scope:string):Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(profileDatabase('memestone-match-history',scope),1);r.onupgradeneeded=()=>r.result.createObjectStore('matches',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('Не удалось открыть историю матчей.'));});}
export function validSummary(v:unknown):v is MatchSummary{if(!v||typeof v!=='object')return false;const m=v as MatchSummary;return typeof m.id==='string'&&m.id.length<=100&&Number.isSafeInteger(m.endedAt)&&Number.isSafeInteger(m.turns)&&['win','loss','draw'].includes(m.outcome)&&typeof m.opponent==='string'&&typeof m.playerHero==='string'&&typeof m.opponentHero==='string'&&['training','online'].includes(m.mode)&&validMetrics(m.metrics);}
export const summaryOf=({log:_log,cards:_cards,...summary}:ArchivedMatch):MatchSummary=>summary;
export async function cachedMatches(scope=profileScope()):Promise<CachedMatch[]>{const db=await database(scope);try{return await new Promise((resolve,reject)=>{const r=db.transaction('matches').objectStore('matches').getAll();r.onsuccess=()=>resolve(r.result.filter((r:CachedMatch)=>r&&validSummary(r.value)&&Array.isArray(r.value.log)&&Array.isArray(r.value.cards)));r.onerror=()=>reject(r.error);});}finally{db.close();}}
export async function cacheMatch(value:ArchivedMatch,uploaded:boolean,scope=profileScope()):Promise<void>{
 if(!validSummary(value)||!Array.isArray(value.log)||!Array.isArray(value.cards))throw new Error('Некорректная история матча.');
 const db=await database(scope);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('matches','readwrite'),store=tx.objectStore('matches'),r=store.get(value.id);r.onsuccess=()=>{const old=r.result as CachedMatch|undefined;if(old){if(uploaded&&!old.uploaded)store.put({...old,uploaded:true});}else store.put({id:value.id,value,uploaded});};tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(new Error('Не удалось сохранить историю матча.'));});}finally{db.close();}
}
export function observeMatch(game:Game,online=false,scope=profileScope()):Promise<void>{
 const key=scope+':'+game.id;if(!started.has(key))started.set(key,Date.now());
 if(!game.winner)return Promise.resolve();
 const value:ArchivedMatch={id:game.id,endedAt:Date.now(),startedAt:started.get(key),turns:Math.ceil(game.turn/2),outcome:game.winner==='player'?'win':game.winner==='draw'?'draw':'loss',opponent:game.bot.name??heroDefinition(game.bot.hero).name,playerHero:game.player.hero,opponentHero:game.bot.hero,mode:online?'online':'training',metrics:{...(game.player.metrics??emptyMetrics())},log:structuredClone(game.log),cards:structuredClone(game.customCards??[])};
 return cacheMatch(value,false,scope).then(()=>profileChanged(['history'],scope));
}
export async function trimCachedMatches(scope=profileScope()){
 const all=(await cachedMatches(scope)).sort((a,b)=>b.value.endedAt-a.value.endedAt),remove=all.slice(100).filter(r=>r.uploaded);if(!remove.length)return;
 const db=await database(scope);try{await new Promise<void>((resolve,reject)=>{const t=db.transaction('matches','readwrite');for(const r of remove)t.objectStore('matches').delete(r.id);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}finally{db.close();}
}
