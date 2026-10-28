import {useEffect,useRef} from 'react';
import {CARD} from './game/cards';
import type {Game} from './game/engine';
import {playCardSound,type PlayingSound} from './card-audio';
export function useCardSounds(game:Game,sound:boolean,volume:number){
 const seen=useRef(game.events.at(-1)?.id??0),match=useRef(game.id),cast=useRef(''),playing=useRef<PlayingSound|undefined>(undefined);
 useEffect(()=>{
  if(match.current!==game.id){match.current=game.id;seen.current=game.events.at(-1)?.id??0;cast.current='';playing.current?.stop();}
  const current=game.casting,key=current?`${game.id}:${current.side}:${current.startedAt}:${current.cardId}`:'';
  if(current&&key!==cast.current){cast.current=key;const clip=CARD[current.cardId]?.editor?.sound;if(sound&&volume>0&&clip)playing.current=playCardSound(clip,volume);}
  for(const e of game.events)if(e.id>seen.current&&e.kind==='power'&&e.cardId){const c=CARD[e.cardId];if(!c?.editor?.animation&&c?.editor?.sound&&sound&&volume>0)playing.current=playCardSound(c.editor.sound,volume);}
  seen.current=game.events.at(-1)?.id??0;
 },[game,sound,volume]);
 useEffect(()=>{if(!sound||volume===0)playing.current?.stop();else playing.current?.volume(volume);},[sound,volume]);
 useEffect(()=>()=>playing.current?.stop(),[]);
}
