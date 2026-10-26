import {Shield,Flame,Leaf,Wind,EyeOff,ShieldCheck,Skull,Heart,CloudMoon,Swords,Sparkles} from 'lucide-react';
import {ADAPTATIONS} from '../game/adaptation';
import {CARD} from '../game/cards';
import type {Action,Game} from '../game/engine';
import Modal from './Modal';
const icons={shield:Shield,attack:Flame,spores:Leaf,windfury:Wind,elusive:EyeOff,taunt:ShieldCheck,poisonous:Skull,health:Heart,stealth:CloudMoon,stats:Swords};
export default function AdaptationDialog({game,dispatch,back}:{game:Game;dispatch:(action:Action)=>void;back:()=>void}) {
 const pending=game.adaptation!;
 return <Modal title="Адаптация" close={back} dismissible={false} className="adaptation-modal"><header><span><Sparkles size={18}/>{CARD[pending.sourceId].name}</span><h2>Выбери адаптацию</h2><p>Одно улучшение для {pending.targets.length===1?'существа':`всех выбранных существ (${pending.targets.length})`}.{pending.remaining>1?` Осталось выборов: ${pending.remaining}.`:''}</p></header><div className="adaptation-options">{pending.options.map(id=>{const option=ADAPTATIONS[id],Icon=icons[id];return <button key={id} className={`adaptation-option ${id}`} aria-label={option.name+': '+option.text} onClick={()=>dispatch({type:'adapt',option:id})}><span className="adaptation-icon"><Icon/></span><strong>{option.name}</strong><p>{option.text}</p><span className="adaptation-choose">Выбрать</span></button>;})}</div><footer><p>В каждом выборе — три разных улучшения из десяти.</p><button className="text-button" onClick={back}>Выбрать позже — в главное меню</button></footer></Modal>;
}
