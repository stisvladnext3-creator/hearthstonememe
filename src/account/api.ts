import type { ArchivedMatch,MatchSummary } from './archive';
import type { ArtReference,Records,RemoteState } from './model';

export interface Account {id:string;email:string;name:string;role:'player'|'admin';verified:boolean;capabilities:{allCards:boolean;unlimitedResources:boolean}}
export interface Session {token:string;expiresAt:number;user:Account}
export class ApiError extends Error {constructor(message:string,public status=0,public code='network'){super(message);}}
export function validAccount(v:unknown):v is Account{if(!v||typeof v!=='object')return false;const a=v as Account;return /^[a-f0-9-]{36}$/i.test(a.id)&&typeof a.email==='string'&&typeof a.name==='string'&&['player','admin'].includes(a.role)&&typeof a.verified==='boolean'&&!!a.capabilities&&typeof a.capabilities.allCards==='boolean'&&typeof a.capabilities.unlimitedResources==='boolean';}
export function validSession(v:unknown):v is Session{const s=v as Session;return !!s&&/^[a-f0-9]{64}$/.test(s.token)&&Number.isFinite(s.expiresAt)&&validAccount(s.user);}
export function safeApiUrl(raw:string):string{
 const url=new URL(raw,location.href);
 if(url.username||url.password||url.hash||url.search||url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Некорректный адрес сервера аккаунтов.');return url.href;
}
export class AccountApi {
 constructor(public readonly url:string,private readonly token=''){}
 private endpoint(action:string,query:Record<string,string>={}){const u=new URL(this.url);u.searchParams.set('action',action);for(const[k,v]of Object.entries(query))u.searchParams.set(k,v);return u.href;}
 async request<T>(action:string,method='GET',body?:unknown,query:Record<string,string>={},timeout=30000):Promise<T>{
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeout);
  try{
   const headers:Record<string,string>={};if(this.token)headers.Authorization='Bearer '+this.token;if(body!==undefined)headers['Content-Type']='application/json';
   const response=await fetch(this.endpoint(action,query),{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:abort.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
   const data=await response.json().catch(()=>null);
   if(!response.ok)throw new ApiError(typeof data?.error?.message==='string'?data.error.message:'Не удалось связаться с сервером.',response.status,data?.error?.code??'server');
   if(data===null)throw new ApiError('Сервер аккаунтов не ответил.');return data as T;
  }catch(e){if(e instanceof ApiError)throw e;throw new ApiError('Нет связи с сервером. Прогресс сохраняется на этом устройстве.');}finally{clearTimeout(timer);}
 }
 async health(){const h=await this.request<{service:string;configured:boolean;mailEnabled:boolean}>('health','GET',undefined,{},4000);if(h.service!=='memestone-accounts'||!h.configured)throw new ApiError('Сервер аккаунтов ещё настраивается.');return h;}
 login(email:string,password:string){return this.request<Session>('login','POST',{email,password});}
 register(email:string,password:string,name:string){return this.request<Session|{requiresVerification:true}>('register','POST',{email,password,name});}
 me(){return this.request<{user:Account;mailEnabled:boolean}>('me');}
 logout(){return this.request<{ok:true}>('logout','POST',{});}
 state(){return this.request<RemoteState>('state');}
 patch(expectedRevision:number,changes:Records){return this.request<{revision:number;applied:Records}>('state','PUT',{expectedRevision,changes});}
 async uploadArt(blob:Blob,hash:string):Promise<Omit<ArtReference,'format'>>{
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),120000);
  try{const r=await fetch(this.endpoint('art',{hash}),{method:'PUT',headers:{Authorization:'Bearer '+this.token,'Content-Type':blob.type},body:blob,signal:abort.signal,credentials:'omit',referrerPolicy:'no-referrer'}),v=await r.json();if(!r.ok)throw new ApiError(v.error?.message??'Не удалось загрузить картинку.',r.status,v.error?.code);return v;}catch(e){if(e instanceof ApiError)throw e;throw new ApiError('Картинка сохранена на устройстве и загрузится после восстановления связи.');}finally{clearTimeout(timer);}
 }
 async downloadArt(ref:ArtReference){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),120000);
  try{const r=await fetch(this.endpoint('art',{hash:ref.hash}),{headers:{Authorization:'Bearer '+this.token},signal:abort.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw new ApiError('Не удалось загрузить картинку аккаунта.',r.status);const size=Number(r.headers.get('content-length'));if(size>15728640)throw new ApiError('Картинка слишком большая.');const blob=await r.blob();if(blob.size>15728640||!['image/jpeg','image/png','image/webp'].includes(blob.type))throw new ApiError('Некорректная картинка аккаунта.');return blob;}catch(e){if(e instanceof ApiError)throw e;throw new ApiError('Не удалось загрузить картинки. Проверь соединение.');}finally{clearTimeout(timer);}
 }
 putHistory(match:ArchivedMatch){return this.request<{ok:true}>('history','POST',match);}
 history(offset=0,limit=10){return this.request<{items:MatchSummary[];total:number}>('history','GET',undefined,{offset:String(offset),limit:String(limit)});}
 historyDetail(id:string){return this.request<ArchivedMatch>('history','GET',undefined,{id});}
}
export async function discoverApi():Promise<string|null>{
 const explicit=import.meta.env.VITE_ACCOUNT_API_URL as string|undefined;if(explicit)return safeApiUrl(explicit);
 const base=new URL(import.meta.env.BASE_URL,location.href);
 const key='memestone.account-api.v1';let cached:string|null=null;try{const raw=localStorage.getItem(key);if(raw)cached=safeApiUrl(raw);}catch{/* The endpoint cache is optional. */}
 try{const response=await fetch(new URL('account-config.json',base),{cache:'no-store',signal:AbortSignal.timeout(4000)});if(response.ok){const config=await response.json();if(typeof config.apiUrl==='string'){if(config.apiUrl.trim()){const found=safeApiUrl(new URL(config.apiUrl,base).href);try{localStorage.setItem(key,found);}catch{/* Continue without discovery cache. */}return found;}cached=null;try{localStorage.removeItem(key);}catch{/* Continue in guest mode. */}}}}catch{/* A known endpoint lets cached accounts open without a network connection. */}
 if(cached)return cached;
 if(location.hostname.endsWith('github.io'))return null;
 const url=safeApiUrl(new URL('api/index.php',base).href);try{await new AccountApi(url).health();return url;}catch{return null;}
}
