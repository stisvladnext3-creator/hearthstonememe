import {CARD} from './cards';
import {grantKeyword} from './battle-keywords';
import type {Anchor,Game,Side} from './engine';
import type {CustomContinuation} from './custom-engine';

export const ADAPTATIONS={
 shield:{name:'Искрящийся щит',text:'Божественный щит.'},
 attack:{name:'Пылающие когти',text:'+3 к атаке.'},
 spores:{name:'Живые споры',text:'Предсмертный хрип: призывает два Растения 1/1.'},
 windfury:{name:'Скорость молнии',text:'Неистовство ветра.'},
 elusive:{name:'Жидкая оболочка',text:'Не может быть целью заклинаний и силы героя.'},
 taunt:{name:'Массивность',text:'Провокация.'},
 poisonous:{name:'Ядовитый плевок',text:'Яд.'},
 health:{name:'Каменная шкура',text:'+3 к здоровью.'},
 stealth:{name:'Скрывающий туман',text:'Маскировка до вашего следующего хода.'},
 stats:{name:'Вулканическая мощь',text:'+1/+1.'},
} as const;
export type AdaptationId=keyof typeof ADAPTATIONS;
export const ADAPTATION_IDS=Object.keys(ADAPTATIONS) as AdaptationId[];
export const ADAPT_TARGETS=['self','selectedFriendly','selectedEnemy','selectedMinion','selectedCharacter','friendlyMinions','enemyMinions','allMinions','randomFriendlyMinion','randomEnemyMinion'] as const;
export interface AdaptationChoice {side:Side;sourceId:string;sourceUid?:number;targets:Anchor[];options:AdaptationId[];remaining:number;continuation?:CustomContinuation;selected?:number|'hero'|'own-hero'}
export const isAdaptation=(id:unknown):id is AdaptationId=>typeof id==='string'&&Object.hasOwn(ADAPTATIONS,id);
export function adaptationOptions(random:()=>number):AdaptationId[]{const pool=[...ADAPTATION_IDS],choices:AdaptationId[]=[];while(choices.length<3)choices.push(pool.splice(Math.floor(random()*pool.length),1)[0]);return choices;}
export function applyAdaptation(g:Game,choice:AdaptationChoice,id:AdaptationId){
 for(const target of choice.targets){const m=g[target.side].board.find(m=>m.uid===target.uid&&m.health>0);if(!m)continue;
  if(id==='shield')grantKeyword(g,target.side,m.uid,'divineShield');
  if(id==='windfury')grantKeyword(g,target.side,m.uid,'windfury');
  if(id==='poisonous')grantKeyword(g,target.side,m.uid,'poisonous');
  if(id==='elusive')m.elusive=true;
  if(id==='taunt')m.taunt=true;
  if(id==='spores')m.adaptSpores=(m.adaptSpores??0)+1;
  if(id==='attack'||id==='stats'){const amount=id==='attack'?3:1;m.attack+=amount;m.attackBuff=(m.attackBuff??0)+amount;}
  if(id==='health'||id==='stats'){const amount=id==='health'?3:1;m.health+=amount;m.maxHealth+=amount;m.healthBuff=(m.healthBuff??0)+amount;}
  if(id==='stealth'&&(!m.stealth||m.stealthUntilTurn!==undefined)){m.stealth=true;m.stealthUntilTurn=g.turn+(g.active===target.side?2:1);}
 }
}
export function validAdaptation(g:Game,raw:unknown,hidden=false):raw is AdaptationChoice {
 if(!raw||typeof raw!=='object')return false;const a=raw as AdaptationChoice,uid=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>0;
 return ['player','bot'].includes(a.side)&&a.side===g.active&&typeof a.sourceId==='string'&&!!CARD[a.sourceId]
  &&(a.sourceUid===undefined||uid(a.sourceUid))&&Number.isSafeInteger(a.remaining)&&a.remaining>=1&&a.remaining<=10
  &&Array.isArray(a.options)&&a.options.length===(hidden?0:3)&&a.options.every(isAdaptation)&&new Set(a.options).size===a.options.length
  &&Array.isArray(a.targets)&&a.targets.length>=1&&a.targets.length<=14&&a.targets.every(t=>t&&['player','bot'].includes(t.side)&&uid(t.uid)&&g[t.side].board.some(m=>m.uid===t.uid&&m.health>0))
  &&(a.selected===undefined||a.selected==='hero'||a.selected==='own-hero'||uid(a.selected));
}
