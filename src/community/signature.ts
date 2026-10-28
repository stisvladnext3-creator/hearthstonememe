import { profileKey, profileScope } from '../account/scope';
const encoder=new TextEncoder();
export const toBytes=(value:Uint8Array):ArrayBuffer=>Uint8Array.from(value).buffer as ArrayBuffer;
export function base64(value:Uint8Array){let s='';for(let i=0;i<value.length;i+=8192)s+=String.fromCharCode(...value.subarray(i,i+8192));return btoa(s);}
export const fromBase64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function hash(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export interface Identity {owner:string;key:JsonWebKey;privateKey:CryptoKey}
let current:Promise<Identity>|undefined;
let identityScope='';
const publicKey=(key:JsonWebKey)=>({kty:'EC',crv:'P-256',x:key.x,y:key.y});
export async function ownerOf(key:JsonWebKey){if(key.kty!=='EC'||key.crv!=='P-256'||typeof key.x!=='string'||typeof key.y!=='string'||key.d)throw new Error('Некорректная подпись.');return hash(JSON.stringify(publicKey(key)));}
export function identity(){if(identityScope!==profileScope()){identityScope=profileScope();current=undefined;}return current??=loadIdentity().catch(e=>{current=undefined;throw e;});}
async function loadIdentity():Promise<Identity>{
 const name=profileKey('community-key'),raw=localStorage.getItem(name);
 let privateKey:CryptoKey,key:JsonWebKey;
 if(raw){const saved=JSON.parse(raw);privateKey=await crypto.subtle.importKey('jwk',saved.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);key=saved.key;}
 else{const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);privateKey=keys.privateKey;key=publicKey(await crypto.subtle.exportKey('jwk',keys.publicKey));localStorage.setItem(name,JSON.stringify({key,privateKey:await crypto.subtle.exportKey('jwk',privateKey)}));}
 return {owner:await ownerOf(key),key,privateKey};
}
export async function sign(value:unknown,who:Identity){return base64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},who.privateKey,encoder.encode(JSON.stringify(value)))));}
export async function verify(value:unknown,key:JsonWebKey,signature:string){try{const pub=await crypto.subtle.importKey('jwk',key,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,toBytes(fromBase64(signature)),encoder.encode(JSON.stringify(value)));}catch{return false;}}
