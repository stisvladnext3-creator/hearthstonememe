import {useState} from 'react';
import {BookOpen,ChevronLeft,ChevronRight,Swords} from 'lucide-react';
import {TRAINING_BOTS,trainingBot,type TrainingBot} from '../game/training-bots';
import {HERO_CLASSES} from '../game/classes';
import {CARD} from '../game/cards';
import {phoneScreen,useViewport} from '../useViewport';
import Modal from './Modal';
import {Art} from './Card';
import {ClassSymbol} from './DeckPicker';

export default function TrainingPicker({initial,close,confirm}:{initial:string;close:()=>void;confirm:(bot:TrainingBot)=>void}) {
 const size=useViewport(),phone=phoneScreen(size),pageSize=phone?size.width>size.height?6:4:6;
 const [id,setId]=useState(trainingBot(initial).id),[page,setPage]=useState(()=>Math.floor(TRAINING_BOTS.findIndex(b=>b.id===trainingBot(initial).id)/pageSize)),[showDeck,setShowDeck]=useState(false),[deckPage,setDeckPage]=useState(0);
 const bot=trainingBot(id),hero=HERO_CLASSES[bot.heroClass],pages=Math.ceil(TRAINING_BOTS.length/pageSize),current=Math.min(page,pages-1);
 const cards=[...new Set(bot.deck)].sort((a,b)=>CARD[a].cost-CARD[b].cost),rows=phone?size.height<500?5:8:10,deckPages=Math.ceil(cards.length/rows);
 return <><Modal title="Соперник для тренировки" close={close} dismissible={!showDeck} className="deck-picker-modal training-picker-modal">
  <header className="deck-picker-heading"><h2>Соперник для тренировки</h2></header>
  <div className="deck-picker-layout"><section className="deck-cabinet" aria-label="Тренировочные соперники"><div className="training-grid">{TRAINING_BOTS.slice(current*pageSize,(current+1)*pageSize).map(b=><button key={b.id} className={`deck-slot training-slot ${b.heroClass} ${b.id===id?'chosen':''}`} aria-pressed={b.id===id} aria-label={`Соперник ${b.name}, ${HERO_CLASSES[b.heroClass].name}`} onClick={()=>setId(b.id)}><div className="deck-slot-banner"><Art index={b.id==='boris'?9:HERO_CLASSES[b.heroClass].art} cardId={b.id==='boris'?'boris':HERO_CLASSES[b.heroClass].hero}/><strong>{b.name}</strong></div><span className="deck-slot-class"><ClassSymbol heroClass={b.heroClass}/><small>{HERO_CLASSES[b.heroClass].name}</small></span><span className="training-deck-name">{b.deckName}</span></button>)}</div><nav className="deck-picker-pages" aria-label="Страницы соперников"><button aria-label="Предыдущие соперники" disabled={!current} onClick={()=>setPage(current-1)}><ChevronLeft/></button><span>{current+1}/{pages} · {TRAINING_BOTS.length} соперников</span><button aria-label="Следующие соперники" disabled={current+1>=pages} onClick={()=>setPage(current+1)}><ChevronRight/></button></nav></section>
  <aside className={`deck-hero-preview training-preview ${bot.heroClass}`}><span className="deck-preview-class"><ClassSymbol heroClass={bot.heroClass}/>{hero.name}</span><div className="deck-preview-portrait"><Art index={bot.id==='boris'?9:hero.art} cardId={bot.id==='boris'?'boris':hero.hero}/></div><h3>{bot.name}</h3><strong className="training-archetype">{bot.deckName}</strong><p>{bot.description}</p><button className="button secondary training-view-deck" onClick={()=>{setDeckPage(0);setShowDeck(true);}}><BookOpen size={16}/>Состав колоды</button><button className="deck-play-button" aria-label="Тренироваться" onClick={()=>confirm(bot)}><Swords/><span>В бой</span></button></aside>
  </div>
 </Modal>
  {showDeck&&<Modal title={`Колода: ${bot.deckName}`} close={()=>setShowDeck(false)} className="training-deck-modal paged-modal"><header><h2>{bot.deckName}</h2><p>{bot.name} · {hero.name} · 30 карт</p></header><div className="training-deck-list">{cards.slice(deckPage*rows,(deckPage+1)*rows).map(id=><div key={id}><span className="mini-mana">{CARD[id].cost}</span><strong>{CARD[id].name}</strong><span>×{bot.deck.filter(x=>x===id).length}</span></div>)}</div><nav className="history-pagination"><button aria-label="Предыдущая страница колоды соперника" disabled={!deckPage} onClick={()=>setDeckPage(deckPage-1)}><ChevronLeft/></button><span>{deckPage+1}/{deckPages}</span><button aria-label="Следующая страница колоды соперника" disabled={deckPage+1>=deckPages} onClick={()=>setDeckPage(deckPage+1)}><ChevronRight/></button></nav></Modal>}
 </>;
}
