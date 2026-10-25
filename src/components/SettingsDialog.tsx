import { useEffect, useState } from 'react';
import type { BattlegroundId } from '../battlegrounds';
import Modal from './Modal';
import BoardPicker from './BoardPicker';

export type Settings = { sound: boolean; volume: number; motion: boolean; board: BattlegroundId };
export default function SettingsDialog({ value, change, close, help, about, previewSound }: {
  value: Settings; change: (settings: Settings) => void; close: () => void;
  help: () => void; about: () => void; previewSound: () => void;
}) {
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [screenError, setScreenError] = useState('');
  useEffect(() => {
    const update = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const toggleScreen = async () => {
    setScreenError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setScreenError('Не удалось включить полный экран.'); }
  };
  return <Modal title="Настройки" close={close} className="settings-modal hearth-options">
    <header className="options-title"><h2>Настройки</h2></header>
    <div className="options-paper"><div className="options-grid">
      <section className="options-section options-graphics" aria-labelledby="options-graphics"><h3 id="options-graphics">Графика</h3>
        <label className="options-check"><input type="checkbox" checked={value.motion} onChange={e => change({ ...value, motion: e.target.checked })} /><span>Анимации<small>Удары, добор и появление карт</small></span></label>
        {document.fullscreenEnabled && <label className="options-check"><input type="checkbox" checked={fullscreen} onChange={() => { void toggleScreen(); }} /><span>Полный экран</span></label>}
        {screenError && <p className="options-error" role="status">{screenError}</p>}
      </section>
      <section className="options-section options-sound" aria-labelledby="options-sound"><h3 id="options-sound">Звук</h3>
        <label className="options-volume" htmlFor="options-volume">Громкость <output htmlFor="options-volume">{value.volume}%</output></label>
        <div className="options-slider"><input id="options-volume" type="range" min="0" max="100" step="1" aria-label="Громкость звуков" value={value.volume} onChange={e => change({ ...value, volume: Number(e.target.value) })} /></div>
        <label className="options-check"><input type="checkbox" checked={value.sound} onChange={e => change({ ...value, sound: e.target.checked })} /><span>Звуки действий</span></label>
        <button className="options-action" disabled={!value.sound || value.volume === 0} onClick={previewSound}>Проверить звук</button>
      </section>
      <section className="options-section options-boards" aria-labelledby="options-boards"><h3 id="options-boards">Игровое поле</h3><BoardPicker value={value.board} change={board => change({ ...value, board })} /></section>
      <section className="options-section options-extra" aria-labelledby="options-extra"><h3 id="options-extra">Дополнительно</h3>
        <button className="options-action" onClick={help}>Правила игры</button><button className="options-action" onClick={about}>Об игре</button>
        <p>Колода, оформление и бой сохраняются в этом браузере.</p>
      </section>
    </div></div>
    <button className="options-action options-done" onClick={close}>Сохранено</button>
  </Modal>;
}
