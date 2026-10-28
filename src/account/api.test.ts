import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { AccountApi,confirmSession,discoverApi,safeApiUrl,type Session } from './api';
let store:Map<string,string>;
beforeEach(()=>{store=new Map();vi.stubEnv('VITE_ACCOUNT_API_URL','');vi.stubGlobal('location',new URL('https://game.github.io/memestone/'));vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)});});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('remembers the public API endpoint so a cached account can reopen when configuration is offline',async()=>{
 const url='https://accounts.example/memestone/api/index.php';vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({apiUrl:url})}));expect(await discoverApi()).toBe(url);
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));expect(await discoverApi()).toBe(url);
});
it('respects an explicitly disabled endpoint instead of reusing a cached one',async()=>{
 store.set('memestone.account-api.v1','https://accounts.example/api.php');vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({apiUrl:''})}));expect(await discoverApi()).toBeNull();expect(store.has('memestone.account-api.v1')).toBe(false);
});
it('does not accept plaintext remote HTTP endpoints, embedded credentials or token query strings',()=>{
 for(const raw of ['http://accounts.example/api.php','https://user:secret@accounts.example/api.php','https://accounts.example/api.php?token=secret','javascript:alert(1)'])expect(()=>safeApiUrl(raw)).toThrow();
 expect(safeApiUrl('http://127.0.0.1:8081/api/index.php')).toBe('http://127.0.0.1:8081/api/index.php');
});
it('negotiates a hosting-compatible session header for JSON and binary requests without putting the token in the URL',async()=>{
 const url='https://accounts.example/compat.php',token='a'.repeat(64),calls:{url:string;headers:Record<string,string>}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:URL|string,options:RequestInit)=>{calls.push({url:String(url),headers:options.headers as Record<string,string>});return{ok:true,json:async()=>String(url).includes('action=health')?{service:'memestone-accounts',configured:true,sessionHeader:'X-Memestone-Session'}:{ok:true},headers:new Headers({'content-type':'image/png'}),blob:async()=>new Blob(['png'],{type:'image/png'})};}));
 await new AccountApi(url).health();const api=new AccountApi(url,token);await api.me();await api.uploadArt(new Blob(['png'],{type:'image/png'}),'b'.repeat(64));await api.downloadArt({hash:'b'.repeat(64),format:'portrait',mime:'image/png',size:3});
 for(const call of calls.slice(1)){expect(call.headers.Authorization).toBe('Bearer '+token);expect(call.headers['X-Memestone-Session']).toBe(token);expect(call.url).not.toContain(token);}
});
it('keeps the previous transport for an older server that has not advertised the extra CORS header',async()=>{
 const calls:RequestInit[]=[];vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{calls.push(options);return{ok:true,json:async()=>({service:'memestone-accounts',configured:true})};}));const url='https://accounts.example/old.php';await new AccountApi(url).health();await new AccountApi(url,'b'.repeat(64)).me();expect(calls[1].headers).not.toHaveProperty('X-Memestone-Session');
});
it('explains a rejected fresh login as a session transport failure instead of activating a broken account',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:401,json:async()=>({error:{code:'unauthorized',message:'Войди ещё раз.'}})}));const session={token:'a'.repeat(64),expiresAt:Date.now()+10000,user:{id:'11111111-1111-4111-8111-111111111111'}} as Session;
 await expect(confirmSession('https://accounts.example/broken.php',session)).rejects.toMatchObject({code:'session_transport',message:expect.stringContaining('хостинг не принимает сессию')});
});
