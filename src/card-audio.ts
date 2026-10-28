import {pcmSound,soundSamples,SOUND_RATE,SOUND_MAX_MS,type CardSound} from './game/play-media';
let context:AudioContext|undefined;
function audioContext(){return context??=new AudioContext();}
export function unlockCardAudio(){try{void audioContext().resume().catch(()=>{});}catch{/* Sound is optional. */}}
export interface PlayingSound{stop:()=>void;volume:(value:number)=>void}
let current:PlayingSound|undefined;
export function playCardSound(sound:CardSound,volume=100):PlayingSound|undefined{
 const samples=soundSamples(sound);if(!samples)return;
 try{
  const audio=audioContext();void audio.resume().catch(()=>{});const buffer=audio.createBuffer(1,samples.length,SOUND_RATE),channel=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++)channel[i]=samples[i]/32768;
  current?.stop();const source=audio.createBufferSource(),gain=audio.createGain();source.buffer=buffer;source.connect(gain);gain.connect(audio.destination);
  let stopped=false;const handle:PlayingSound={volume:value=>{gain.gain.value=Math.max(0,Math.min(1,value/100));},stop:()=>{if(stopped)return;stopped=true;try{source.stop();}catch{/* Already ended. */}source.disconnect();gain.disconnect();if(current===handle)current=undefined;}};
  handle.volume(volume);current=handle;source.onended=handle.stop;source.start();return handle;
 }catch{return;}
}
export async function loadCardSound(file:File):Promise<{sound:CardSound;trimmed:boolean}>{
 if(file.size>10*1024*1024)throw new Error('Выбери звуковой файл до 10 МБ.');
 const decoder=new AudioContext();try{
  const buffer=await decoder.decodeAudioData(await file.arrayBuffer()).catch(()=>{throw new Error('Не удалось открыть звук. Попробуй MP3, WAV, OGG или M4A.');});
  const duration=Math.min(buffer.duration,SOUND_MAX_MS/1000),frames=Math.floor(duration*SOUND_RATE);if(!frames)throw new Error('В файле нет звука.');
  const offline=new OfflineAudioContext(1,frames,SOUND_RATE),source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start();
  const rendered=await offline.startRendering();return{sound:pcmSound(rendered.getChannelData(0),file.name),trimmed:buffer.duration>SOUND_MAX_MS/1000};
 }finally{await decoder.close().catch(()=>{});}
}
