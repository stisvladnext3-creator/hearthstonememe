import {ADAPTATIONS} from './adaptation';
import { CARD, cardAbilities } from './cards';
import { abilityTargets, activePower, boardLimit, cardCost, legalTargets, powerProblem, simulateAction, targetNeeded, type Action, type Game, type Minion } from './engine';
import { registerCardPack } from './custom-cards';
import { isImmune } from './battle-keywords';
import { powerCardId } from './presentation';
import { trainingBot, type BotStyle } from './training-bots';

export interface BotSearchOptions { maxNodes?: number; depth?: number; width?: number }
const health = (p: Game['bot']) => p.health + p.armor;
const liveAttack = (m: Minion) => m.cannotAttack || m.ephemeral ? 0 : m.attack * (m.windfury ? 2 : 1);
function bodyValue(m: Minion) {
  const c = CARD[m.id];
  let value = 1 + liveAttack(m) * 1.25 + Math.min(m.health, 18) * .65 + (m.taunt ? 1.2 : 0);
  if (m.ephemeral) value *= .08;
  value+=(m.reborn?Math.min(12,(c.attack??0)*1.25+1.65):0)+(m.lifesteal?1+m.attack*.25:0)+(m.elusive?1.2:0)+Math.min(5,(m.adaptSpores??0)*2.5);
  if (!m.silenced) value += (m.divineShield ? 2.4 : 0) + (m.poisonous ? 3.5 : 0) + (m.stealth ? 1.4 : 0)
    + (m.immuneWhileAttacking ? 2.5 : 0) + (m.immuneOnOwnTurn ? 1.5 : 0) + (c.bulky ? 3 : 0)
    + (c.deathrattle ? c.deathrattle === 'clawFuryThree' ? 1 : 2.3 : 0)
    + (c.auraAttack ? 4 : 0) + (cardAbilities(c)?.rules.filter(r => ['turnEnd','turnStart'].includes(r.trigger)).reduce((n,r)=>n+(r.operation==='damage'?Math.max(0,r.amount)*1.25*(['self','ownHero','friendlyMinions','friendlyCharacters'].includes(r.target)?-1:1):3),0) ?? 0);
  return value;
}
function cardValue(g: Game, id: string) {
  const c = CARD[id], cost = cardCost(g,id,'bot');
  if (c.effect === 'concede') return -2;
  if (c.echo && g.bot.hand.some(h => h.id === id && h.expiresTurn !== undefined)) return .2;
  let value = 2.7 + Math.min(cost,7) * .13;
  if (cost > g.bot.maxMana + 2) value -= 1.3;
  if (c.effect === 'silence') value=1.4;
  if (c.quest || cardAbilities(c)?.quest) value=1;
  if (c.effect === 'deathwing' && g.bot.hand.length > 4) value -= 1;
  if (c.cannotAttack && !c.abilities && !g.bot.hand.some(h => CARD[h.id].effect === 'silence')) value -= 1;
  if (c.effect === 'heal' && g.bot.health < 18) value += 1.2;
  if (c.quest && g.bot.quest) value = .3;
  return value;
}
function questValue(g:Game,q:NonNullable<Game['bot']['quest']>){const data=cardAbilities(CARD[q.id])?.quest;const reward=q.id==='rash-quest'?'volunteer':data?.rewardId;const value=reward?Math.max(1,cardValue(g,reward)):3;return Math.min(2,value*.65)+value*.25*q.progress/(data?.goal??8);}
function score(g: Game, style: BotStyle): number {
  if (g.winner) return g.winner === 'bot' ? 1_000_000 : g.winner === 'draw' ? -5_000 : -1_000_000;
  const p=g.bot,e=g.player, own=health(p), enemy=health(e);
  const pressure = style==='burn' ? 1.15 : style==='control' ? .65 : .85;
  let value = Math.min(own,40)*.65 + Math.max(0,own-40)*.2 - enemy*pressure;
  // Life near zero is much more valuable than extra armor at full health.
  value -= Math.max(0,16-own)**2*.11;
  value += Math.max(0,15-enemy)**2*.045;
  value += p.board.reduce((n,m)=>n+bodyValue(m),0)*(style==='swarm'?1.15:1)
    - e.board.reduce((n,m)=>n+bodyValue(m),0)*1.08;
  value += p.hand.reduce((n,h)=>n+cardValue(g,h.id),0) - e.hand.length*2.2;
  const enemyDamage=e.board.reduce((n,m)=>n+liveAttack(m),0);
  const blockers=p.board.filter(m=>m.taunt&&!m.stealth).reduce((n,m)=>n+m.health+(m.divineShield?3:0),0);
  const reach=Math.max(0,enemyDamage-blockers);
  value -= Math.max(0,reach-own+1)*7 + (reach>=own ? 500 : 0);
  if (isImmune(g,'bot')&&g.active==='player') value += Math.min(20,enemyDamage)*1.4;
  if (p.quest) value += questValue(g,p.quest);
  if (e.quest) value -= questValue(g,e.quest)*.85;
  if (!p.deck.length) value -= (p.fatigue+1)*1.6;
  if (!e.deck.length) value += (e.fatigue+1)*.8;
  if (p.powerSilenceTurns) value -= p.powerSilenceTurns*.8;
  if (e.powerSilenceTurns) value += e.powerSilenceTurns*.8;
  return value;
}
function hash(text: string) { let n=2166136261;for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);return n>>>0; }
function shuffle(ids: string[], seed: number) {
  const a=[...ids].sort();let n=seed;
  for(let i=a.length-1;i>0;i--){n=(Math.imul(n,1664525)+1013904223)>>>0;const j=n%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;
}
// Neither the opponent's hidden identities, our deck order nor the game's RNG
// enter the search. Different independent samples prevent a lucky-roll oracle.
function observations(g: Game): Game[] {
  const seed=hash(JSON.stringify([g.turn,g.bot.health,g.bot.armor,g.bot.mana,g.bot.hand.map(h=>[h.uid,h.id]),g.bot.board,g.player.health,g.player.armor,g.player.board,g.player.hand.length,g.player.deck.length]));
  const picturesFree=g.customCards?.map(c=>({...c,text:'',flavor:'',editor:c.editor?{...c.editor,image:undefined,legacyText:undefined}:undefined}));
  return [0,1].map(i=>structuredClone({...g,log:[],events:[],rng:seed+i*104729,customCards:picturesFree,
    bot:{...g.bot,deck:shuffle(g.bot.deck,seed+i*104729)},
    player:{...g.player,hand:g.player.hand.map(h=>({uid:h.uid,id:'regular'})),deck:Array(g.player.deck.length).fill('regular')},
  }));
}
export function botActions(g: Game): Action[] {
  if(g.winner||g.active!=='bot')return [];
  if(g.adaptation)return g.adaptation.side==='bot'?g.adaptation.options.map(option=>({type:'adapt',option})):[];
  if(g.discovery)return g.discovery.side==='bot'?g.discovery.options.map(cardId=>({type:'discover',cardId})):[];
  const result:Action[]=[];const ids=new Set<string>();
  for(const h of g.bot.hand){
    const c=CARD[h.id];if(ids.has(h.id)||cardCost(g,h.id)>g.bot.mana||c.effect==='concede'||!['minion','spell','hero'].includes(c.kind))continue;ids.add(h.id);
    if(c.kind==='minion'&&g.bot.board.length>=boardLimit(g)||(c.quest||cardAbilities(c)?.quest)&&g.bot.quest)continue;
    if(targetNeeded(g,h.uid))for(const target of abilityTargets(g,h.uid))result.push({type:'play',uid:h.uid,target});
    else result.push({type:'play',uid:h.uid});
  }
  for(const m of g.bot.board)if(m.ready&&!m.cannotAttack&&m.attack>0)for(const target of legalTargets(g,'attack',m.uid))result.push({type:'attack',uid:m.uid,target});
  if(!powerProblem(g,'bot')){
    if(targetNeeded(g))for(const target of abilityTargets(g))result.push({type:'power',target});
    else result.push({type:'power'});
  }
  result.push({type:'end'});return result;
}
function priority(g: Game, a: Action) {
  if(a.type==='end')return -100;
  if(a.type==='discover'||a.type==='adapt')return 50;
  if(a.type==='mulligan'||a.type==='concede')return -1000;
  if(a.type==='attack'){
    const m=g.bot.board.find(m=>m.uid===a.uid)!;
    if(a.target==='hero')return m.attack>=health(g.player)?1000:20+m.attack;
    const t=g.player.board.find(m=>m.uid===a.target)!;
    return 20+(m.poisonous||t.health<=m.attack?bodyValue(t):0)+(CARD[m.id].bulky?8:0)-(m.health<=t.attack&&!m.divineShield&&!m.immuneWhileAttacking?bodyValue(m)*.4:0);
  }
  const id=a.type==='play'?g.bot.hand.find(h=>h.uid===a.uid)!.id:powerCardId(activePower(g,'bot')),c=CARD[id];
  if(c.effect==='silence'||c.effect==='masik'){
    const own=g.bot.board.find(m=>m.uid===a.target),enemy=g.player.board.find(m=>m.uid===a.target);
    return own?.cannotAttack||own?.ephemeral?90:enemy?.taunt?60:enemy&&!enemy.silenced?30:0;
  }
  const damage=c.effect==='bolt'?3:c.effect==='discoverBlast'?4:a.type==='power'&&activePower(g,'bot')==='spark'?1:0;
  if(damage){if(a.target==='hero')return damage>=health(g.player)?1000:35;const t=g.player.board.find(m=>m.uid===a.target);return t?30+(t.health<=damage?bodyValue(t):0):0;}
  return 20+(cardAbilities(c)?.rules.some(r=>r.trigger==='play'&&r.operation==='damage')?25:0)+(c.quest?30:0)+(c.auraAttack?15:0)+(c.cost<=g.bot.mana?c.cost:0);
}
function advance(g: Game,a: Action,style: BotStyle):Game|null {
  const result=simulateAction(g,'bot',a);if(result.error)return null;let next=result.state;
  // A future discovery is a contingent decision, not knowledge of its options.
  // Resolve it independently in each sample; the real decision is made anew.
  for(let n=0;n<12&&(next.discovery?.side==='bot'||next.adaptation?.side==='bot')&&!next.winner;n++){
    const actions:Action[]=next.adaptation?next.adaptation.options.map(option=>({type:'adapt',option})):next.discovery!.options.map(cardId=>({type:'discover',cardId}));
    const choices=actions.map(a=>simulateAction(next,'bot',a)).filter(r=>!r.error);
    if(!choices.length)break;choices.sort((a,b)=>score(b.state,style)-score(a.state,style));next=choices[0].state;
  }
  next.log=[];next.events=[];return next;
}
interface Node { states:Game[]; first:Action; value:number; depth:number }
// Compare every partial line at the same boundary: after our end effects and
// the opponent's natural draw. Otherwise ending falsely looks like losing a card.
const boundaryValue=(g:Game,style:BotStyle)=>score(g.active==='bot'&&!g.winner&&!g.discovery&&!g.adaptation?simulateAction(g,'bot',{type:'end'}).state:g,style);
const average=(states:Game[],style:BotStyle)=>states.reduce((n,g)=>n+boundaryValue(g,style),0)/states.length;
function signature(g:Game){return JSON.stringify([g.active,g.winner,g.bot,g.player.board,g.player.health,g.player.armor,g.player.quest,g.rashDeaths,g.briefing,g.customCounts,g.adaptation]);}
export function chooseBotAction(input: Game, options: BotSearchOptions = {}): Action {
  registerCardPack(input.customCards??[],'match');
  if(input.mulligan){const cheap=input.bot.hand.some(h=>CARD[h.id].kind==='minion'&&CARD[h.id].cost<=2);return {type:'mulligan',replace:input.bot.hand.filter(h=>{const c=CARD[h.id];return c.effect==='concede'||c.cost>3&&!c.quest||c.effect==='silence'&&!input.bot.hand.some(x=>CARD[x.id].cannotAttack)||c.kind==='spell'&&!c.quest&&!['bolt','discoverBlast'].includes(c.effect??'')||c.cost===3&&!cheap&&!c.quest;}).map(h=>h.uid)};}
  if(input.winner||input.active!=='bot')return {type:'end'};
  const style=trainingBot(input.trainingBotId).style;
  if(input.adaptation?.side==='bot'){const choices=input.adaptation.options.filter(option=>ADAPTATIONS[option]).map(option=>{const a:Action={type:'adapt',option};const result=simulateAction(observations(input)[0],'bot',a);return {a,value:result.error?-Infinity:average([result.state],style)};});choices.sort((a,b)=>b.value-a.value);return choices[0]?.a??{type:'end'};}
  if(input.discovery?.side==='bot'){
    const views=observations(input);let best:Action={type:'discover',cardId:input.discovery.options[0]},value=-Infinity;
    for(const cardId of input.discovery.options){const a:Action={type:'discover',cardId};const states=views.map(g=>advance(g,a,style));if(states.some(g=>!g))continue;const v=average(states as Game[],style);if(v>value){best=a;value=v;}}return best;
  }
  const maxNodes=options.maxNodes??650,depth=options.depth??12,width=options.width??5;
  const roots=observations(input),ended=roots.map(g=>advance(g,{type:'end'},style)!);
  let best:Node={states:ended,first:{type:'end'},value:average(ended,style),depth:0};
  if(ended.every(g=>g.winner==='bot'))return best.first;
  let beam:Node[]=[{states:roots,first:{type:'end'},value:average(roots,style),depth:0}],used=0;
  const seen=new Map<string,number>();
  for(let d=0;d<depth&&beam.length&&used<maxNodes;d++){
    const children:Node[]=[];
    for(const node of beam){
      const g=node.states[0];let actions=botActions(g).sort((a,b)=>priority(g,b)-priority(g,a));
      if(d)actions=actions.slice(0,14).concat(actions.filter(a=>a.type==='end'));
      for(const a of actions){if(used++>=maxNodes)break;
        // A sampled draw's identity is not available until it is really drawn.
        if(a.type==='play'&&node.states.some(s=>s.bot.hand.find(h=>h.uid===a.uid)?.id!==g.bot.hand.find(h=>h.uid===a.uid)?.id))continue;
        const next=node.states.map(s=>advance(s,a,style));if(next.some(s=>!s))continue;
        const states=next as Game[],value=average(states,style),first=d?node.first:a;
        const child={states,value,first,depth:d+1};
        if(value>best.value+.001||Math.abs(value-best.value)<.001&&(child.depth<best.depth||child.depth===best.depth&&priority(roots[0],first)>priority(roots[0],best.first)))best=child;
        if(states.every(s=>s.winner==='bot'))return first;
        if(a.type==='end'||states.some(s=>s.winner||s.active!=='bot'))continue;
        const key=signature(states[0]),previous=seen.get(key);if(previous!==undefined&&previous>=value-.001)continue;seen.set(key,value);children.push(child);
      }
    }
    children.sort((a,b)=>b.value-a.value);beam=children.slice(0,width);
  }
  return best.first;
}
