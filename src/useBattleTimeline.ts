import { useLayoutEffect, useRef, useState } from 'react';
import type { Game } from './game/engine';
import { BattleTimeline } from './game/battle-timeline';

export function useBattleTimeline(input: Game) {
  const timeline=useRef<BattleTimeline | null>(null);
  timeline.current??=new BattleTimeline(input,Date.now());
  const [game,setGame]=useState(timeline.current.game);
  useLayoutEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;
    const next=()=>{
      const t=timeline.current!;setGame(t.advance(Date.now()));
      if(t.until>Date.now())timer=setTimeout(next,t.until-Date.now()+1);
    };
    timeline.current!.push(input,Date.now());next();
    return()=>clearTimeout(timer);
  },[input]);
  return game;
}
