import type {MqttClient} from 'mqtt';
import type {CardDef} from '../game/cards';
import {normalizeCustomCard} from '../game/custom-schema';
import {validHeroClass,type HeroClass} from '../game/classes';
import {validatePublication,validImage,type Publication,type PublicationKind} from './model';
import {base64,fromBase64,hash,identity,ownerOf,sign,toBytes,verify} from './signature';
import {cachePublication,cachedPublication,forgetPublication,ownedPublications} from './cache';
const ROOT=import.meta.env.VITE_COMMUNITY_TOPIC||'memestone/community-v1',CHUNK=24_000,MAX_BYTES=2_100_000,MAX_ENTRIES=240;
export interface CatalogMeta {version:1;id:string;owner:string;kind:PublicationKind;title:string;author:string;createdAt:number;count:number;cover?:string;preview?:CardDef;heroClass?:HeroClass;hash:string;parts:number;key:JsonWebKey;signature:string;removed?:boolean}
export interface CatalogState {entries:CatalogMeta[];status:'connecting'|'ready'|'error';error:string}
export const EMPTY_CATALOG:CatalogState={entries:[],status:'connecting',error:''};
const signedValue=({signature:_signature,...value}:CatalogMeta)=>value;
const metaValue=(p:Publication)=>({version:1 as const,id:p.id,owner:p.owner,kind:p.kind,title:p.title,author:p.author,createdAt:p.createdAt,count:p.cards.length,...(p.cover?{cover:p.cover}:{}),...(p.kind==='card'?{preview:p.cards.find(c=>c.id===p.roots[0])}:{}),...(p.deck?{heroClass:p.deck.heroClass}:{})});
async function validMeta(raw:unknown):Promise<CatalogMeta|null>{
 try{const m=raw as CatalogMeta;if(!m||m.version!==1||typeof m.id!=='string'||!/^[a-f0-9]{16}-[a-f0-9-]{36}$/.test(m.id)||typeof m.owner!=='string'||!m.id.startsWith(m.owner.slice(0,16)+'-')||m.owner!==await ownerOf(m.key)
  ||!['card','deck','expansion'].includes(m.kind)||typeof m.title!=='string'||!m.title.trim()||m.title.length>60||typeof m.author!=='string'||!m.author.trim()||m.author.length>24||/[\x00-\x1f\x7f]/.test(m.title+m.author)||!Number.isSafeInteger(m.createdAt)||m.createdAt<1||m.createdAt>Date.now()+300_000
  ||!Number.isInteger(m.count)||m.count<1||m.count>60||!Number.isInteger(m.parts)||m.parts<1||m.parts>120||typeof m.hash!=='string'||!/^[a-f0-9]{64}$/.test(m.hash)||typeof m.signature!=='string'||m.signature.length>150||m.cover!==undefined&&!validImage(m.cover)||m.heroClass!==undefined&&!validHeroClass(m.heroClass)||m.kind==='card'&&!normalizeCustomCard(m.preview)||m.removed!==undefined&&m.removed!==true)return null;
  return await verify(signedValue(m),m.key,m.signature)?m:null;
 }catch{return null;}
}
export class CommunityCatalog {
 private client?:MqttClient;private entries=new Map<string,CatalogMeta>();private retired=new Set<string>();private disposed=false;private started:Promise<void>;private restoring:Promise<void>=Promise.resolve();private state:CatalogState={...EMPTY_CATALOG};
 private requests=new Map<string,{meta:CatalogMeta;parts:Map<number,string>;resolve:(p:Publication)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>;promise:Promise<Publication>;finishing:boolean}>();
 constructor(private change:(state:CatalogState)=>void,private root=ROOT){this.started=this.connect();}
 private update(status:CatalogState['status'],error=''){this.state={entries:[...this.entries.values()].sort((a,b)=>b.createdAt-a.createdAt),status,error};this.change(this.state);}
 private async connect(){
  try{const {default:mqtt}=await import('mqtt');if(this.disposed)return;
   const client=mqtt.connect('wss://public.cloud.shiftr.io',{username:'public',password:'public',clientId:'ms-catalog-'+crypto.randomUUID(),protocolVersion:4,clean:true,reconnectPeriod:3000,connectTimeout:12000,keepalive:30});this.client=client;
   client.on('connect',()=>{client.subscribe(`${this.root}/index/+`,{qos:1},error=>{if(error){this.update('error','Не удалось загрузить каталог.');return;}this.update('ready');this.restoring=this.restoreOwn();});for(const req of this.requests.values())client.subscribe(`${this.root}/body/${req.meta.id}/+`,{qos:1});});
   client.on('message',(topic,payload)=>{if(payload.length>120_000)return;let value:unknown;try{value=JSON.parse(new TextDecoder().decode(payload));}catch{return;}
    if(topic.startsWith(`${this.root}/index/`)){void this.receiveMeta(value,topic.slice((this.root+'/index/').length));return;}
    const rest=topic.slice((this.root+'/body/').length).split('/'),req=this.requests.get(rest[0]),i=Number(rest[1]);
    if(!topic.startsWith(this.root+'/body/')||!req||!Number.isInteger(i)||i<0||i>=req.meta.parts||typeof value!=='string'||value.length>CHUNK)return;
    req.parts.set(i,value);if(req.parts.size===req.meta.parts&&!req.finishing){req.finishing=true;void this.finishRequest(req.meta.id);}
   });client.on('error',()=>this.update('error','Каталог временно недоступен. Попробуйте обновить список.'));client.on('offline',()=>this.update('connecting'));client.on('close',()=>{if(!this.disposed)this.update(this.state.error?'error':'connecting',this.state.error);});
  }catch{this.update('error','Не удалось подключиться к каталогу.');}
 }
 private async receiveMeta(raw:unknown,id:string){const meta=await validMeta(raw);if(this.disposed||!meta||id!==meta.id)return;if(meta.removed){this.retired.add(id);this.entries.delete(id);this.update(this.state.status);return;}if(this.retired.has(id))return;if(!this.entries.has(id)&&this.entries.size>=MAX_ENTRIES)return;this.entries.set(id,meta);this.update(this.state.status);}
 private async ready(){
  await this.started;if(this.disposed)throw new Error('Каталог закрыт.');if(this.client?.connected)return;
  await new Promise<void>((resolve,reject)=>{const connected=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{this.client?.off('connect',connected);reject(new Error('Не удалось подключиться к каталогу за 15 секунд.'));},15000);this.client?.once('connect',connected);});
 }
 private async write(topic:string,value:unknown){await this.ready();return new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Сервис не подтвердил публикацию. Попробуйте ещё раз.')),20000);this.client!.publish(topic,JSON.stringify(value),{qos:1,retain:true},e=>{clearTimeout(timer);if(e)reject(e);else resolve();});});}
 private async encode(p:Publication){const text=JSON.stringify(p);if(new TextEncoder().encode(text).length>MAX_BYTES)throw new Error('Слишком большая публикация. Уменьшите картинки или количество карт.');const compressed=await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();const value=base64(new Uint8Array(compressed));return {text,parts:Array.from({length:Math.ceil(value.length/CHUNK)},(_,i)=>value.slice(i*CHUNK,(i+1)*CHUNK))};}
 private async publishBody(p:Publication){const who=await identity();if(who.owner!==p.owner)throw new Error('Эта публикация принадлежит другому автору.');const {text,parts}=await this.encode(p);const unsigned={...metaValue(p),hash:await hash(text),parts:parts.length,key:who.key};const meta:CatalogMeta={...unsigned,signature:await sign(unsigned,who)};
  for(let i=0;i<parts.length;i++)await this.write(`${this.root}/body/${p.id}/${i}`,parts[i]);
  await this.write(`${this.root}/index/${p.id}`,meta);this.entries.set(p.id,meta);this.update('ready');return meta;
 }
 async publish(raw:Publication){const p=validatePublication(raw);await cachePublication(p);return this.publishBody(p);}
 private async restoreOwn(){try{const who=await identity();for(const p of await ownedPublications(who.owner)){if(this.disposed)break;await this.publishBody(validatePublication(p));}}catch{/* Existing retained entries remain available even if the local cache cannot be restored. */}}
 async withdraw(meta:CatalogMeta){await this.restoring;const who=await identity();if(who.owner!==meta.owner)throw new Error('Можно снять только свою публикацию.');const unsigned={...signedValue(meta),removed:true as const};await this.write(`${this.root}/index/${meta.id}`,{...unsigned,signature:await sign(unsigned,who)});await forgetPublication(meta.id);this.entries.delete(meta.id);this.update('ready');}
 async fetch(meta:CatalogMeta):Promise<Publication>{
  if(meta.removed)throw new Error('Публикация снята автором.');
  try{const cached=await cachedPublication(meta.id);if(cached&&await hash(JSON.stringify(cached))===meta.hash)return validatePublication(cached);}catch{/* Fetch a clean copy from the catalog. */}
  const old=this.requests.get(meta.id);if(old)return old.promise;
  await this.ready();const existing=this.requests.get(meta.id);if(existing)return existing.promise;let resolve!:(p:Publication)=>void,reject!:(e:Error)=>void;const promise=new Promise<Publication>((a,b)=>{resolve=a;reject=b;});
  const timer=setTimeout(()=>{this.requests.delete(meta.id);void this.client?.unsubscribe(`${this.root}/body/${meta.id}/+`);reject(new Error('Набор не загрузился за 20 секунд. Попробуйте ещё раз.'));},20000);
  this.requests.set(meta.id,{meta,parts:new Map(),resolve,reject,timer,promise,finishing:false});this.client!.subscribe(`${this.root}/body/${meta.id}/+`,{qos:1},e=>{if(e){clearTimeout(timer);this.requests.delete(meta.id);reject(new Error('Не удалось загрузить карты.'));}});return promise;
 }
 private async finishRequest(id:string){const req=this.requests.get(id);if(!req)return;try{
  const binary=fromBase64(Array.from({length:req.meta.parts},(_,i)=>req.parts.get(i)!).join(''));
  const reader=new Blob([toBytes(binary)]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();const chunks:Uint8Array[]=[];let size=0;
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_BYTES){await reader.cancel();throw new Error('Слишком большой набор.');}chunks.push(part.value);}
  const text=await new Blob(chunks.map(toBytes)).text();if(await hash(text)!==req.meta.hash)throw new Error('Контрольная сумма набора не совпадает.');const p=validatePublication(JSON.parse(text));
  if(JSON.stringify(metaValue(p))!==JSON.stringify(Object.fromEntries(Object.entries(signedValue(req.meta)).filter(([k])=>!['hash','parts','key','removed'].includes(k)))))throw new Error('Описание публикации не совпадает с набором.');
  try{await cachePublication(p);}catch{/* Adding to the personal library still performs its own durable write. */}req.resolve(p);
 }catch(e){req.reject(new Error(e instanceof Error?e.message:'Повреждённый набор.'));}finally{clearTimeout(req.timer);this.requests.delete(id);this.client?.unsubscribe(`${this.root}/body/${id}/+`);}}
 refresh(){if(this.client?.connected)this.client.subscribe(`${this.root}/index/+`,{qos:1});else this.client?.reconnect();}
 close(){this.disposed=true;this.client?.end(true);for(const req of this.requests.values()){clearTimeout(req.timer);req.reject(new Error('Каталог закрыт.'));}this.requests.clear();}
}
