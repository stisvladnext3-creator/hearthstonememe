export const MINION_ENTRANCES = ['stone', 'portal', 'ember', 'nature', 'storm', 'shadow', 'celestial'] as const;
export const SPELL_CASTS = ['arcane', 'flame', 'frost', 'venom', 'void'] as const;
export type Entrance = typeof MINION_ENTRANCES[number] | typeof SPELL_CASTS[number];
export const ENTRANCE_NAMES:Record<Entrance,string>={stone:'Каменный удар',portal:'Портал',ember:'Огненное появление',nature:'Пробуждение природы',storm:'Гроза',shadow:'Тени',celestial:'Звёздный свет',arcane:'Чародейская печать',flame:'Огненная спираль',frost:'Ледяные кристаллы',venom:'Ядовитые пузыри',void:'Разлом пустоты'};
export const validEntrance=(v:unknown):v is Entrance=>typeof v==='string'&&Object.hasOwn(ENTRANCE_NAMES,v);
export interface CardSound {data:string;name:string;duration:number}
export const SOUND_RATE=16000,SOUND_MAX_MS=5000,SOUND_MAX_BYTES=44+SOUND_RATE*SOUND_MAX_MS/1000*2;
const PREFIX='data:audio/wav;base64,';
// Only our small PCM format travels with a card. Validate the actual container,
// not just a MIME label, before accepting imports or network definitions.
export function soundSamples(raw:unknown):Int16Array|null{
 if(!raw||typeof raw!=='object')return null;const s=raw as CardSound;
 if(typeof s.name!=='string'||!s.name.trim()||s.name.length>80||/[\u0000-\u001f\u007f]/.test(s.name)||!Number.isSafeInteger(s.duration)||s.duration<1||s.duration>SOUND_MAX_MS||typeof s.data!=='string'||!s.data.startsWith(PREFIX)||s.data.length>PREFIX.length+Math.ceil(SOUND_MAX_BYTES/3)*4||!/^data:audio\/wav;base64,[A-Za-z0-9+/]+={0,2}$/.test(s.data))return null;
 try{
  const bytes=Uint8Array.from(atob(s.data.slice(PREFIX.length)),c=>c.charCodeAt(0));if(bytes.length<46||bytes.length>SOUND_MAX_BYTES)return null;
  const view=new DataView(bytes.buffer),tag=(n:number)=>String.fromCharCode(...bytes.slice(n,n+4)),length=bytes.length-44;
  if(tag(0)!=='RIFF'||tag(8)!=='WAVE'||tag(12)!=='fmt '||tag(36)!=='data'||view.getUint32(4,true)!==bytes.length-8||view.getUint32(16,true)!==16||view.getUint16(20,true)!==1||view.getUint16(22,true)!==1||view.getUint32(24,true)!==SOUND_RATE||view.getUint32(28,true)!==SOUND_RATE*2||view.getUint16(32,true)!==2||view.getUint16(34,true)!==16||view.getUint32(40,true)!==length||length%2||s.duration!==Math.ceil(length/2/SOUND_RATE*1000))return null;
  const samples=new Int16Array(length/2);for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(44+i*2,true);return samples;
 }catch{return null;}
}
export function pcmSound(samples:Float32Array,name:string):CardSound{
 const count=Math.min(samples.length,SOUND_RATE*SOUND_MAX_MS/1000);if(!count)throw new Error('В файле нет звука.');
 const bytes=new Uint8Array(44+count*2),v=new DataView(bytes.buffer),tag=(offset:number,text:string)=>{for(let i=0;i<text.length;i++)v.setUint8(offset+i,text.charCodeAt(i));};
 tag(0,'RIFF');v.setUint32(4,bytes.length-8,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,SOUND_RATE,true);v.setUint32(28,SOUND_RATE*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,count*2,true);
 for(let i=0;i<count;i++){const n=Math.max(-1,Math.min(1,Number.isFinite(samples[i])?samples[i]:0));v.setInt16(44+i*2,Math.round(n*(n<0?32768:32767)),true);}
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return{data:PREFIX+btoa(binary),name:name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80)||'Звук карты',duration:Math.ceil(count/SOUND_RATE*1000)};
}
