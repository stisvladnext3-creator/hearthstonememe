import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { discoverApi,safeApiUrl } from './api';
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
