import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {Play,Square,Upload,Volume2,Trash2} from 'lucide-react';
import {CARD,type CardDef} from '../game/cards';
import {ENTRANCE_NAMES,type Entrance} from '../game/play-media';
import {isCreature,usesCardEntrance} from '../game/visual-effects';
import {loadCardSound,playCardSound,type PlayingSound} from '../card-audio';
import type {EditorData} from '../game/custom-schema';
import {CardPlayVisual} from './CardPlayEffects';
import {CombatEffectArtwork} from './CombatEffects';
import {Art} from './Card';

export default function CardPlayPreview({card,change}:{card:CardDef;change:(patch:Partial<EditorData>)=>void}){
 const [run,setRun]=useState(0),[phase,setPhase]=useState<'idle'|'casting'|'landed'>('idle'),[playing,setPlaying]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[volume,setVolume]=useState(80),[bounds,setBounds]=useState({width:400,height:300});
 const scene=useRef<HTMLDivElement>(null),sound=useRef<PlayingSound|undefined>(undefined),timers=useRef<ReturnType<typeof setTimeout>[]>([]),generation=useRef(0),mounted=useRef(true);
 const stop=()=>{timers.current.forEach(clearTimeout);timers.current=[];sound.current?.stop();sound.current=undefined;setPlaying(false);setPhase('idle');};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;timers.current.forEach(clearTimeout);sound.current?.stop();};},[]);
 useEffect(()=>{stop();},[card.kind,card.editor?.animation,card.editor?.sound]);
 useEffect(()=>{sound.current?.volume(volume);},[volume]);
 useLayoutEffect(()=>{const el=scene.current!;const resize=()=>setBounds({width:el.clientWidth,height:el.clientHeight});resize();const observer=new ResizeObserver(resize);observer.observe(el);return()=>observer.disconnect();},[]);
 const upload=async(file?:File)=>{if(!file)return;stop();const current=++generation.current;setLoading(true);setError('');setMessage('');try{const result=await loadCardSound(file);if(!mounted.current||current!==generation.current)return;change({sound:result.sound});setMessage(result.trimmed?'Используются первые 5 секунд файла.':'Звук загружен.');}catch(e){if(mounted.current&&current===generation.current)setError(e instanceof Error?e.message:'Не удалось загрузить звук.');}finally{if(mounted.current&&current===generation.current)setLoading(false);}};
 const play=()=>{stop();setRun(n=>n+1);setPlaying(true);setPhase('casting');if(card.editor?.sound&&volume>0)sound.current=playCardSound(card.editor.sound,volume);timers.current.push(setTimeout(()=>setPhase('landed'),1500),setTimeout(()=>setPlaying(false),Math.max(1500,card.editor?.sound?.duration??0)));};
 const creature=isCreature(card),classic=!usesCardEntrance(card),size=Math.min(bounds.width*.75,bounds.height*.95,290),width=Math.min(bounds.width*.2,bounds.height*.44,90);
 const style={'--cast-size':size+'px','--cast-dx':-bounds.width*.3+'px','--cast-dy':bounds.height*.4+'px','--cast-width':width+'px','--cast-height':width*1.3+'px','--spell-x':-Math.min(bounds.width*.3,110)+'px','--spell-y':-Math.min(bounds.height*.24,60)+'px','--cast-elapsed':'0ms',left:'55%',top:'46%'} as CSSProperties;
 const inherited=card.editor?.artSourceId,source=inherited&&CARD[inherited]?.kind==='power'?inherited:undefined;
 return <div className="editor-play-media"><div className="play-media-controls">
  <label className="editor-field"><span>Анимация розыгрыша</span><select aria-label="Анимация розыгрыша" value={card.editor?.animation??''} onChange={e=>change({animation:e.target.value?e.target.value as Entrance:undefined})}><option value="">{card.kind==='power'?'Прежний эффект силы героя':'Автоматически'}</option>{Object.entries(ENTRANCE_NAMES).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
  <div className="play-sound-file"><span>Звук розыгрыша</span><label className="button secondary"><Upload size={15}/>{loading?'Обрабатываем…':'Загрузить звук'}<input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac" aria-label="Загрузить звук розыгрыша" disabled={loading} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>{card.editor?.sound&&<div className="play-sound-info"><span title={card.editor.sound.name}>{card.editor.sound.name}<small>{(card.editor.sound.duration/1000).toLocaleString('ru-RU',{maximumFractionDigits:2})} с</small></span><button className="icon-button" aria-label="Удалить звук карты" onClick={()=>{generation.current++;setLoading(false);change({sound:undefined});setMessage('');setError('');}}><Trash2 size={16}/></button></div>}</div>
  <label className="play-preview-volume"><Volume2 size={16}/><span>Громкость предпросмотра</span><output>{volume}%</output><input type="range" min="0" max="100" value={volume} aria-label="Громкость предпросмотра" onChange={e=>setVolume(Number(e.target.value))}/></label>
  <div className="play-preview-actions"><button className="button primary" disabled={loading} onClick={play}><Play size={16}/>{playing?'Ещё раз':'Предпросмотр'}</button><button className="button secondary" disabled={!playing&&phase==='idle'} onClick={stop} aria-label="Остановить предпросмотр"><Square size={15}/></button></div>
  <p className={error?'play-media-message error':'play-media-message'} role={error?'alert':'status'}>{error||message||'MP3, WAV, OGG или M4A до 10 МБ. Фрагмент до 5 с. В бою звук зависит от настроек.'}</p>
 </div><div className="play-preview-scene" ref={scene} aria-label="Предпросмотр розыгрыша карты" style={{backgroundImage:`url("${import.meta.env.BASE_URL}art/forge-board.png")`}}>
  {phase==='idle'&&<span className="play-preview-prompt">Нажми «Предпросмотр»</span>}
  {phase==='casting'&&(classic?<div className="combat-effects preview-classic-power" key={run}><CombatEffectArtwork event={{id:run,kind:'power',side:'player',cardId:source,target:{side:'bot',uid:'hero'}}} delay={0} from={{x:bounds.width*.18,y:bounds.height*.65,width:45,height:45}} to={{x:bounds.width*.68,y:bounds.height*.23,width:45,height:45}}/></div>:<CardPlayVisual key={run} card={card} style={style}/>)}
  {phase==='landed'&&<div className={'preview-landed '+(creature?'preview-minion':'preview-spell')}><Art index={card.art} cardId={card.id} picture={card.editor?.image} sourceId={card.editor?.artSourceId} view={card.editor?.imageView}/>{creature&&<><strong>{card.attack}</strong><strong>{card.health}</strong></>}</div>}
  <span className="play-preview-caption">{card.name} · {classic?'Эффект силы героя':'Розыгрыш 1,5 с'}</span>
 </div></div>;
}
