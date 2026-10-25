import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Crown, Flame, Gem, Shield, Swords } from 'lucide-react';
import { CARD, RARITY_NAMES, type CardDef } from '../game/cards';
import { HERO_CLASSES } from '../game/classes';
import type { InspectionInfo } from '../inspection';
import Modal from './Modal';
import WindowPages from './WindowPages';
import { Card, kindLabel } from './Card';
import { CardRules } from './CardRules';
import CardAppearancePicker from './CardAppearancePicker';
import ArtworkCredit from './ArtworkCredit';
import ArtworkUpload from './ArtworkUpload';
function descriptionPages(text: string) {
  const result: string[] = [];
  while (text.length > 240) { const space = text.lastIndexOf(' ', 240), end = space >= 80 ? space : 240; result.push(text.slice(0, end)); text = text.slice(end).trimStart(); }
  result.push(text); return result;
}

export default function CardDetails({ card, info, close, notify }: { card: CardDef; info?: InspectionInfo; close: () => void; notify: (text: string) => void }) {
  const m = info?.minion;
  const [rulePage, setRulePage] = useState(0);
  const rulePages = descriptionPages(card.text);
  const shownRule = Math.min(rulePage, rulePages.length - 1);
  const notes = [
    info?.note,
    m && (m.origin === 'transformed' ? 'Появилось через превращение. Боевой клич не срабатывал.' : m.origin === 'summoned' ? 'Призвано эффектом. Боевой клич не срабатывал.' : 'Разыграно из руки.'),
    m?.createdBy && m.origin !== 'played' && `Источник: ${CARD[m.createdBy]?.name ?? m.createdBy}.`,
    m?.charge && !m.silenced && 'Рывок: может атаковать сразу, включая героя.',
    m?.rush && !m.silenced && 'Натиск: в ход призыва атакует только существ.',
    m?.silenced && 'Немота: способности отключены.', m?.taunt && 'Провокация активна.',
    m?.cannotAttack && 'Не может атаковать.', m?.auraBonus && `Аура: +${m.auraBonus} к атаке.`,
    m && card.bulky && !m.silenced && 'Громоздкий: половина атаки по соседям цели, с округлением вверх.',
    m?.stealth && 'Маскировка: враг не может выбрать целью. Снимается при атаке или нанесении урона.',
    m && (card.deathrattle || card.editor?.rules.some(r => r.trigger === 'death')) && !m.silenced && 'Предсмертный хрип активен.',
    info?.cost !== undefined && `Текущая стоимость: ${info.cost} маны.`,
  ].filter(Boolean);
  const preview = <div className="detail-card-area"><Card card={card} cost={info?.cost} /></div>;
  return <Modal title={card.name} close={close} className={'card-detail-modal paged-modal' + (card.editor ? ' custom-card-detail' : '')}><WindowPages pages={[
    { id: 'card', label: 'Карта', content: <div className="card-overview">{preview}<div className="card-detail-copy"><h2>{card.name}</h2>
      <div className="detail-tags"><span className={card.rarity}>{card.rarity === 'legendary' ? <Crown size={12} /> : <Gem size={12} />}{RARITY_NAMES[card.rarity]}</span><span>{card.reward ? 'Награда за задачу' : kindLabel(card.kind)}</span><span className={'card-class-label ' + (card.heroClass ?? 'neutral')}>{card.heroClass ? HERO_CLASSES[card.heroClass].name : 'Общая карта'}</span></div>
      <p className="effect-description"><CardRules text={card.editor && card.text.length > 260 ? card.text.slice(0, 210) + '… Полное описание — во вкладке «Правила».' : card.text} /></p><div className={`detail-stats ${m ? 'live-unit-stats' : ''}`}><div><span className="mana-mini">{info?.cost ?? card.cost}</span>МАНА</div>
        {card.attack !== undefined && <><div><Swords size={16} /><strong>{m?.attack ?? card.attack}</strong>АТАКА</div><div><Flame size={16} /><strong>{m ? `${m.health}/${m.maxHealth}` : card.health}</strong>ЗДОРОВЬЕ</div></>}
        {!!card.armor && <div><Shield size={16} /><strong>{card.armor}</strong>БРОНЯ</div>}</div><span className="owned-label"><Check size={15} />{card.reward ? 'Можно получить за выполнение задачи' : 'Есть в коллекции'}</span>
    </div></div> },
    ...(card.editor ? [{ id: 'rules', label: 'Правила', content: <div className="custom-card-rules"><h2>{card.name}</h2><p><CardRules text={rulePages[shownRule]} /></p><div className="workshop-footer"><button aria-label="Предыдущая часть описания" disabled={shownRule <= 0} onClick={() => setRulePage(shownRule - 1)}><ChevronLeft size={18} /></button><span>{shownRule + 1} / {rulePages.length}</span><button aria-label="Следующая часть описания" disabled={shownRule >= rulePages.length - 1} onClick={() => setRulePage(shownRule + 1)}><ChevronRight size={18} /></button></div></div> }] : []),
    { id: 'details', label: 'Детали', content: <div className="card-detail-copy"><h2>{card.name}</h2>{info && <div className="inspection-context"><strong>{info.zone === 'board' ? 'Сейчас на столе' : info.zone === 'hand' ? 'Карта в руке' : info.zone === 'history' ? 'Событие из истории' : info.zone === 'power' ? 'Сила героя' : info.zone === 'discover' ? 'Вариант раскопки' : 'Герой'}</strong>
      {m && <p>Атака: <b>{m.attack}</b> · Здоровье: <b>{m.health}/{m.maxHealth}</b></p>}{notes.map((n, i) => <p key={i}><CardRules text={String(n)} /></p>)}</div>}
      {!!card.editor?.tags.length && <p>Метки синергий: <b>{card.editor.tags.join(", ")}</b>.</p>}<p className="flavor-text">{card.flavor}</p><ArtworkCredit cardId={card.id} /></div> },
    ...(card.rarity === 'legendary' ? [{ id: 'appearance', label: 'Оформление', content: <div className="appearance-layout">{preview}<CardAppearancePicker card={card} /></div> }] : []),
    { id: 'artwork', label: 'Картинка', content: <div className="appearance-layout artwork-layout">{preview}<div className="card-detail-copy"><h2>{card.name}</h2><ArtworkUpload card={card} notify={notify} /></div></div> },
  ]} /></Modal>;
}
