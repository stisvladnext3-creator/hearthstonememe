import type { Game } from './engine';
import { CARD_PLAY_MS } from './card-play';

// Network snapshots are ordered, but two of them may arrive in one burst after
// a slow connection. Preserve a full entrance before presenting its result.
export class BattleTimeline {
  game: Game;
  until = 0;
  private queue: Game[] = [];
  private lastInput: Game;
  private lastCast = '';
  private castStarted = 0;
  constructor(input: Game, now: number) { this.game = input; this.lastInput = input; this.show(input, now); }
  push(input: Game, now: number) {
    if (input.id !== this.lastInput.id) {
      this.queue=[];this.until=0;this.lastCast='';this.lastInput=input;this.show(input,now);return this.game;
    }
    if (input !== this.lastInput) { this.queue.push(input);this.lastInput=input; }
    return this.advance(now);
  }
  advance(now: number) {
    if (now < this.until) return this.game;
    this.until=0;
    while(this.queue.length) { this.show(this.queue.shift()!,now);if(this.until>now)break; }
    return this.game;
  }
  private show(input: Game, now: number) {
    if (input.casting) {
      const c=input.casting,key=`${c.side}:${c.startedAt}:${c.cardId}:${c.action.type==='play'?c.action.uid:'power'}`;
      if(key!==this.lastCast){this.lastCast=key;this.castStarted=now;this.until=now+CARD_PLAY_MS;}
      this.game={...input,casting:{...c,startedAt:this.castStarted,endsAt:this.castStarted+CARD_PLAY_MS}};
    } else this.game=input;
  }
}
