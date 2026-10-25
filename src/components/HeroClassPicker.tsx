import { Check, Shield, Sparkles, Swords } from 'lucide-react';
import { HERO_CLASSES, type HeroClass } from '../game/classes';
import { Art } from './Card';
import Modal from './Modal';

export default function HeroClassPicker({ value, change, confirm, close, start = false, replace = false }: {
  value: HeroClass; change: (value: HeroClass) => void; confirm: () => void; close: () => void; start?: boolean; replace?: boolean;
}) {
  return <Modal title="Выбор класса" close={close} className="hero-class-modal">
    <span className="eyebrow">ТВОЙ ГЕРОЙ</span><h2>Выбери свой класс</h2>
    <div className="hero-class-choices" aria-label="Доступные классы">{(Object.keys(HERO_CLASSES) as HeroClass[]).map(id => {
      const option = HERO_CLASSES[id], warrior = id === 'warrior';
      return <button key={id} className={'hero-class-choice ' + id + (value === id ? ' selected' : '')} aria-label={option.name} aria-pressed={value === id} onClick={() => change(id)}>
        <span className="class-portrait"><Art index={option.art} cardId={option.hero} />{warrior ? <Shield /> : <Sparkles />}</span>
        <strong>{option.name}</strong><span className="class-power-name">{option.powerName}</span><p>{option.description}</p><span className="class-power-cost">{option.cost} маны · раз за ход</span>{value === id && <Check className="class-selected-mark" size={19} />}
      </button>;
    })}</div>
    <p className="class-picker-note">{start ? 'Класс и колода будут использованы в новом бою.' : 'Выбранный класс будет использован при создании комнаты или входе в неё.'}</p>
    <button className="button primary window-done" onClick={confirm}>{start ? <Swords size={17} /> : <Check size={17} />}{start ? replace ? 'Начать новый бой' : 'Начать бой' : 'Выбрать класс'}</button>
  </Modal>;
}
