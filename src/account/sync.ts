import { restoreCustomCards } from '../game/custom-cards';
import { cachedMatches,cacheMatch,trimCachedMatches } from './archive';
import { artworkIndex,readArtwork,replaceArtwork,storeArtwork,type SavedArtwork } from './art-storage';
import { AccountApi, ApiError } from './api';
import { applyRecords,captureRecords,digest,initializeAccountDecks,mergeRecords,recordPatch,stable,type ArtReference,type Records,type RemoteState } from './model';
import { PROFILE_CHANGED,profileKey,profileRefreshed } from './scope';

export type SyncStatus='loading'|'syncing'|'saved'|'offline'|'error';
export interface SyncNotice {status:SyncStatus;message:string;lastSync?:number;reason?:'reauth'|'server-session'}
const cancelled=()=>new DOMException('Account changed','AbortError');
function readBase(scope:string):RemoteState{try{const value=JSON.parse(localStorage.getItem(profileKey('sync-base',scope))??'null');if(value&&Number.isSafeInteger(value.revision)&&value.records&&typeof value.records==='object')return value;}catch{/* A fresh pull can recover the cache. */}return {revision:0,records:{}};}
export class AccountSync {
 private alive=true;private running:Promise<void>|null=null;private dirty=false;private timer:ReturnType<typeof setTimeout>|undefined;private interval:ReturnType<typeof setInterval>|undefined;
 private base:RemoteState;lastSync?:number;
 constructor(public readonly scope:string,public readonly api:AccountApi,private notice:(v:SyncNotice)=>void){this.base=readBase(scope);}
 private assert(){if(!this.alive)throw cancelled();}
 private report(status:SyncStatus,message:string,reason?:SyncNotice['reason']){if(this.alive)this.notice({status,message,lastSync:this.lastSync,...(reason?{reason}:{})});}
 start(){window.addEventListener(PROFILE_CHANGED,this.change);window.addEventListener('online',this.wake);window.addEventListener('focus',this.wake);this.interval=setInterval(this.wake,20000);}
 stop(){this.alive=false;clearTimeout(this.timer);clearInterval(this.interval);window.removeEventListener(PROFILE_CHANGED,this.change);window.removeEventListener('online',this.wake);window.removeEventListener('focus',this.wake);}
 private change=(event:Event)=>{const detail=(event as CustomEvent<{scope:string;keys:string[]}>).detail;if(detail.scope!==this.scope||!detail.keys.some(k=>!['game','sync-base'].includes(k)))return;this.dirty=true;clearTimeout(this.timer);this.report('syncing','Сохраняем прогресс…');this.timer=setTimeout(()=>void this.sync(),800);};
 private wake=()=>{void this.sync();};
 async sync():Promise<void>{if(this.running){this.dirty=true;return this.running;}if(!this.alive)return;const work=this.run().catch(error=>{if(!this.alive||error?.name==='AbortError')return;if(error instanceof ApiError&&error.status===401){if(error.code==='session_header_missing')this.report('error',error.message,'server-session');else this.report('error','Сервер не принимает текущую сессию. Войди ещё раз; если ошибка повторяется сразу после входа, обнови сервер аккаунтов на хостинге.','reauth');return;}this.report(error instanceof ApiError&&error.status===0?'offline':'error',error instanceof Error?error.message:'Не удалось сохранить прогресс.');}).finally(()=>{this.running=null;if(this.alive&&this.dirty){clearTimeout(this.timer);this.timer=setTimeout(()=>void this.sync(),1500);}});this.running=work;return work;}
 private setBase(value:RemoteState){this.assert();localStorage.setItem(profileKey('sync-base',this.scope),JSON.stringify(value));this.base=value;}
 private async prepareArtwork(){
  const images=await readArtwork(this.scope);this.assert();
  for(let image of images){
   this.assert();if(!image.hash){image={...image,hash:await digest(await image.blob.arrayBuffer())};this.assert();await storeArtwork(image,this.scope);}
   const old=this.base.records['art:'+image.id] as ArtReference|undefined;
   if(old?.hash!==image.hash){await this.api.uploadArt(image.blob,image.hash!);this.assert();}
  }
 }
 private async apply(records:Records){
  this.assert();const local=await readArtwork(this.scope);this.assert();const existing=new Map(local.map(i=>[i.hash,i]));
  const refs=Object.entries(records).filter(([k,v])=>k.startsWith('art:')&&v!==null).map(([k,v])=>[k.slice(4),v as ArtReference] as const),images:SavedArtwork[]=[];
  for(const [id,ref]of refs){this.assert();if(!ref||!/^[a-f0-9]{64}$/.test(ref.hash))throw new Error('Некорректная картинка профиля.');let image=existing.get(ref.hash);
   if(!image){const blob=await this.api.downloadArt(ref);this.assert();if(await digest(await blob.arrayBuffer())!==ref.hash)throw new Error('Не удалось проверить картинку профиля.');image={id,blob,format:ref.format,hash:ref.hash};}
   images.push({...image,id,format:ref.format});
  }
  // A local edit can happen while images download. Merge it again before the
  // atomic localStorage write, so an incoming snapshot cannot erase that edit.
  const current=captureRecords(this.scope),merged=await mergeRecords(this.base.records,current,records);this.assert();
  const unchanged=Object.keys(recordPatch(current,merged.records)).length===0&&stable(artworkIndex(this.scope))===stable(Object.fromEntries(refs));
  if(unchanged)return;
  // Preserve any newly saved image from the same download window.
  const latest=await readArtwork(this.scope);this.assert();const finalImages=new Map(images.map(i=>[i.id,i]));for(const i of latest){const ref=merged.records['art:'+i.id] as ArtReference|undefined;if(ref?.hash===i.hash)finalImages.set(i.id,i);}
  const before=new Map(['custom-cards','decks','community-library','card-appearances','stats','legacy-stats-bases','settings','online-name','training-bot','art-index'].map(k=>[profileKey(k,this.scope),localStorage.getItem(profileKey(k,this.scope))]));
  const artChanged=refs.length!==local.length||refs.some(([id,ref])=>!local.some(i=>i.id===id&&i.hash===ref.hash&&i.format===ref.format));
  applyRecords(merged.records,this.scope);
  try{if(artChanged)await replaceArtwork([...finalImages.values()].filter(i=>!!merged.records['art:'+i.id]),this.scope);this.assert();}catch(e){for(const [k,v]of before){if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}throw e;}
  restoreCustomCards();profileRefreshed();if(merged.conflicts)this.report('syncing','Сохранена отдельная копия колоды, изменённой на двух устройствах.');
 }
 private async run(){
  this.dirty=false;this.report('syncing','Сохраняем прогресс…');
  for(let attempt=0;attempt<6;attempt++){
   this.assert();const remote=await this.api.state();this.assert();
   if(!Number.isSafeInteger(remote.revision)||!remote.records||typeof remote.records!=='object')throw new Error('Не удалось прочитать профиль.');
   initializeAccountDecks(this.scope,remote);
   await this.prepareArtwork();this.assert();
   const local=captureRecords(this.scope),merged=await mergeRecords(this.base.records,local,remote.records);this.assert();
   await this.apply(merged.records);this.assert();this.setBase(remote);
   const desired=captureRecords(this.scope),patch=recordPatch(remote.records,desired),entries=Object.entries(patch);
   try{
    let batch:Records=Object.create(null),bytes=0;
    const send=async()=>{if(!Object.keys(batch).length)return;this.assert();const next=await this.api.patch(this.base.revision,batch);this.assert();this.setBase({revision:next.revision,records:{...this.base.records,...next.applied}});batch=Object.create(null);bytes=0;};
    for(const [k,v]of entries){const n=new TextEncoder().encode(JSON.stringify([k,v])).length;if(bytes+n>2000000||Object.keys(batch).length>=200)await send();batch[k]=v;bytes+=n;}await send();
   }catch(e){if(e instanceof ApiError&&e.code==='sync_conflict')continue;throw e;}
   for(const row of await cachedMatches(this.scope)){this.assert();if(!row.uploaded){await this.api.putHistory(row.value);this.assert();await cacheMatch(row.value,true,this.scope);}}
   await trimCachedMatches(this.scope);this.assert();
   if(Object.keys(recordPatch(this.base.records,captureRecords(this.scope))).length){this.dirty=true;continue;}
   this.lastSync=Date.now();this.report('saved','Прогресс сохранён в аккаунте.');return;
  }
  this.dirty=true;this.report('syncing','Сохраняем изменения с другого устройства…');
 }
 get empty(){return !Object.values(this.base.records).some(Boolean);}
}
