import { Check } from 'lucide-react';
import { HERO_CLASSES, type HeroClass } from '../game/classes';
import { Art } from './Card';
import { ClassSymbol } from './DeckPicker';
import Modal from './Modal';

export default function HeroClassPicker({ value, change, confirm, close, name, changeName, starter, changeStarter }: {
  value: HeroClass; change: (value: HeroClass) => void; confirm: () => void; close: () => void;
  name: string; changeName: (value: string) => void; starter: boolean; changeStarter: (value: boolean) => void;
}) {
  return <Modal title="Создание колоды" close={close} className="hero-class-modal new-deck-modal">
    <div className="new-deck-header"><h2>Новая колода</h2><label>Название<input autoComplete="off" aria-label="Название новой колоды" maxLength={32} value={name} onChange={e => changeName(e.target.value)} /></label></div>
    <div className="hero-class-choices" aria-label="Класс новой колоды">{(Object.keys(HERO_CLASSES) as HeroClass[]).map(id => {
      const option = HERO_CLASSES[id];
      return <button key={id} className={'hero-class-choice ' + id + (value === id ? ' selected' : '')} aria-label={option.name} aria-pressed={value === id} onClick={() => change(id)}>
        <span className="class-portrait"><Art index={option.art} cardId={option.hero} /><ClassSymbol heroClass={id} /></span>
        <strong>{option.name}</strong><span className="class-power-name">{option.powerName}</span><span className="class-power-cost">{option.cost} маны · раз за ход</span>{value === id && <Check className="class-selected-mark" size={19} />}
      </button>;
    })}</div>
    <p className="new-deck-power-description"><strong>{HERO_CLASSES[value].powerName}.</strong> {HERO_CLASSES[value].description}</p>
    <label className="starter-deck-option"><input type="checkbox" checked={starter} onChange={e => changeStarter(e.target.checked)} />Начать со стартовой колоды из 30 карт</label>
    <p className="class-picker-note">Класс закрепляется за колодой. Карты общей коллекции доступны всем классам.</p>
    <button className="button primary window-done" disabled={!name.trim()} onClick={confirm}><Check size={17} />Создать колоду</button>
  </Modal>;
}
