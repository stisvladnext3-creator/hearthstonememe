import { Fragment,createContext,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { AccountApi,ApiError,discoverApi,validAccount,validSession,type Account,type Session } from './api';
import { AccountSync,type SyncNotice } from './sync';
import { applyRecords,captureRecords,digest,hasProgress,mergeRecords,stable,starterRecord } from './model';
import { profileKey,profileRefreshed,profileScope,setProfileScope } from './scope';
import { restoreCustomCards } from '../game/custom-cards';
import { cachedMatches,cacheMatch } from './archive';
import { readArtwork,storeArtwork } from './art-storage';
import { setTestAccount } from './access';

interface AccountContextValue {
 user:Account|null;configured:boolean;apiUrl:string|null;notice:SyncNotice;canImport:boolean;recovery:{type:'verify'|'reset';token:string}|null;
 login:(email:string,password:string)=>Promise<void>;register:(email:string,password:string,name:string)=>Promise<boolean>;logout:()=>Promise<void>;
 sync:()=>Promise<void>;retryServer:()=>Promise<void>;importGuest:()=>Promise<void>;client:()=>AccountApi|null;
 changeName:(name:string)=>Promise<void>;changePassword:(currentPassword:string,password:string)=>Promise<void>;clearRecovery:()=>void;
}
const Context=createContext<AccountContextValue|null>(null);
export function useAccount(){const value=useContext(Context);if(!value)throw new Error('Account provider missing');return value;}
const sessionKey=(url:string)=>'memestone.auth.v1.'+encodeURIComponent(url);
const loadSession=(url:string):Session|null=>{try{const s=JSON.parse(localStorage.getItem(sessionKey(url))??'null');return validSession(s)&&s.expiresAt>Date.now()?s:null;}catch{return null;}};
const saveSession=(url:string,s:Session|null)=>{try{if(s)localStorage.setItem(sessionKey(url),JSON.stringify(s));else localStorage.removeItem(sessionKey(url));}catch{/* In-memory login can still work. */}};
function recoveryFromUrl(){const params=new URLSearchParams(location.hash.slice(1)),type=params.get('account'),token=params.get('token');return (type==='verify'||type==='reset')&&token&&/^[a-f0-9]{64}$/.test(token)?{type,token} as const:null;}
export function AccountProvider({children}:{children:ReactNode}){
 const [url,setUrl]=useState<string|null>(null),[configured,setConfigured]=useState(false),[session,setSession]=useState<Session|null>(null),[ready,setReady]=useState<string|null>(null);
 const [notice,setNotice]=useState<SyncNotice>({status:'loading',message:'Загружаем профиль…'}),[canImport,setCanImport]=useState(false),[recovery,setRecovery]=useState(recoveryFromUrl);
 const [target,setTarget]=useState<{serial:number;value:Session|null;offline:boolean}|null>(null),serial=useRef(0),sync=useRef<AccountSync|null>(null),generation=useRef(0),sessionRef=useRef<Session|null>(null),urlRef=useRef<string|null>(null);
 const switchSession=useCallback((value:Session|null,offline=false)=>{sessionRef.current=value;setReady(null);setTarget({serial:++serial.current,value,offline});},[]);
 useEffect(()=>{let cancelled=false;void(async()=>{
   const found=await discoverApi();if(cancelled)return;setUrl(found);urlRef.current=found;
   if(!found){switchSession(null);return;}const cached=loadSession(found);
   if(!cached)switchSession(null);
   try{await new AccountApi(found).health();if(cancelled)return;setConfigured(true);if(cached){const {user}=await new AccountApi(found,cached.token).me();if(cancelled)return;if(!validAccount(user))throw new Error('Некорректный аккаунт.');const current={...cached,user};saveSession(found,current);switchSession(current);}}
   catch(e){if(cancelled)return;if(e instanceof ApiError&&e.status===401){saveSession(found,null);switchSession(null);}else if(cached)switchSession(cached,true);}
 })().catch(()=>{if(!cancelled)switchSession(null);});return()=>{cancelled=true;};},[switchSession]);
 useLayoutEffect(()=>{
  if(!target)return;const current=++generation.current;sync.current?.stop();sync.current=null;
  const value=target.value,scope=value?.user.id??'guest';setProfileScope(scope);setTestAccount(value?.user.role==='admin'&&value.user.capabilities.unlimitedResources);restoreCustomCards();setSession(value);setCanImport(false);
  if(!value||!urlRef.current){setNotice({status:'saved',message:'Гостевой прогресс сохраняется на этом устройстве.'});setReady(scope);return;}
  const controller=new AccountSync(scope,new AccountApi(urlRef.current,value.token),v=>{if(current===generation.current){setNotice(v);if(v.status==='saved')setConfigured(true);}});sync.current=controller;
  const finish=()=>{if(current!==generation.current)return;restoreCustomCards();setReady(scope);void(async()=>{const guest=captureRecords('guest'),signature=await digest(stable(guest));if(current===generation.current)setCanImport(hasProgress(guest)&&localStorage.getItem(profileKey('guest-import',scope))!==signature);})().catch(()=>{});controller.start();};
  if(target.offline){setNotice({status:'offline',message:'Нет связи. Прогресс сохраняется на этом устройстве.'});finish();}else void controller.sync().finally(finish);
  return()=>controller.stop();
 },[target]);
 const client=useCallback(()=>{const s=sessionRef.current,u=urlRef.current;return s&&u?new AccountApi(u,s.token):null;},[]);
 const login=async(email:string,password:string)=>{if(!url)throw new Error('Вход пока недоступен.');const s=await new AccountApi(url).login(email.trim().toLowerCase(),password);if(!validSession(s))throw new Error('Не удалось войти в аккаунт.');saveSession(url,s);setConfigured(true);switchSession(s);};
 const register=async(email:string,password:string,name:string)=>{if(!url)throw new Error('Регистрация пока недоступна.');const result=await new AccountApi(url).register(email.trim().toLowerCase(),password,name);if('requiresVerification'in result)return true;if(!validSession(result))throw new Error('Не удалось создать аккаунт.');saveSession(url,result);switchSession(result);return false;};
 const logout=async()=>{await sync.current?.sync();const api=client();try{await api?.logout();}catch{/* Logout removes local credentials even offline. */}if(url)saveSession(url,null);switchSession(null);};
 const retryServer=async()=>{const found=url??await discoverApi();if(!found)throw new Error('Вход пока недоступен. Попробуй позже.');await new AccountApi(found).health();setUrl(found);urlRef.current=found;setConfigured(true);};
 const importGuest=async()=>{const scope=profileScope();if(scope==='guest')return;await sync.current?.sync();const guest=captureRecords('guest'),local=captureRecords(scope);if(!hasProgress(local))for(const key of Object.keys(local))if(key.startsWith('deck:')&&starterRecord(local[key]))delete local[key];
   const {records}=await mergeRecords({},local,guest);for(const image of await readArtwork('guest'))await storeArtwork(image,scope);applyRecords(records,scope);
   for(const row of await cachedMatches('guest'))await cacheMatch(row.value,false,scope);
   localStorage.setItem(profileKey('guest-import',scope),await digest(stable(guest)));restoreCustomCards();profileRefreshed();setCanImport(false);await sync.current?.sync();
 };
 const changeName=async(name:string)=>{const api=client(),s=sessionRef.current;if(!api||!s||!url)return;const result=await api.request<{user:Account}>('profile','POST',{name});if(!validAccount(result.user))throw new Error('Не удалось сохранить имя.');const next={...s,user:result.user};sessionRef.current=next;saveSession(url,next);setSession(next);};
 const changePassword=async(currentPassword:string,password:string)=>{const api=client();if(!api||!url)return;const next=await api.request<Session>('password-change','POST',{currentPassword,password});if(!validSession(next))throw new Error('Не удалось обновить пароль.');saveSession(url,next);switchSession(next);};
 const clearRecovery=()=>{setRecovery(null);if(location.hash.startsWith('#account='))history.replaceState(null,'',location.pathname+location.search);};
 return <Context.Provider value={{user:session?.user??null,configured,apiUrl:url,notice,canImport,recovery,login,register,logout,sync:async()=>{await sync.current?.sync();},retryServer,importGuest,client,changeName,changePassword,clearRecovery}}>{ready===null?<div className="account-startup"><div><LoaderCircle className="spinning" size={34}/><h1>Memestone</h1><p>{notice.status==='loading'?'Загружаем профиль…':notice.message}</p></div></div>:<Fragment key={ready}>{children}</Fragment>}</Context.Provider>;
}
