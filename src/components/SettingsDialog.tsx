import { Check, Shield, Sparkles, Volume2, VolumeX } from 'lucide-react';
import type { BattlegroundId } from '../battlegrounds';
import Modal from './Modal';
import WindowPages from './WindowPages';
import BoardPicker from './BoardPicker';
export type Settings = { sound: boolean; motion: boolean; board: BattlegroundId };
export default function SettingsDialog({ value, change, close }: { value: Settings; change: (settings: Settings) => void; close: () => void }) {
  return <Modal title="Настройки" close={close} className="settings-modal paged-modal"><WindowPages pages={[
    { id: 'settings', label: 'Настройки', content: <div className="settings-general"><h2>Как тебе удобно</h2>
      <label className="setting-row"><span><strong>{value.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}Звуки действий</strong><small>Короткие магические звуки</small></span><input type="checkbox" checked={value.sound} onChange={e => change({ ...value, sound: e.target.checked })} /><i className="toggle" /></label>
      <label className="setting-row"><span><strong><Sparkles size={18} />Анимации</strong><small>Удары, добор и появление карт</small></span><input type="checkbox" checked={value.motion} onChange={e => change({ ...value, motion: e.target.checked })} /><i className="toggle" /></label>
      <div className="settings-note"><Shield size={17} /><p>Колода, оформление и бой сохраняются в этом браузере.</p></div></div> },
    { id: 'boards', label: 'Игровое поле', content: <BoardPicker value={value.board} change={board => change({ ...value, board })} /> },
  ]} /><button className="button primary window-done" onClick={close}>Сохранено <Check size={16} /></button></Modal>;
}
