import { BookOpen, Crown, Layers3, Maximize, Settings2, Trophy, Users } from 'lucide-react';
import { CARDS } from '../game/cards';

export default function WoodMenu({ resume, start, collection, help, settings, profile, wins, rooms }: {
  resume: boolean; start: () => void; collection: () => void; help: () => void; settings: () => void; profile: () => void; wins: number; rooms: () => void;
}) {
  return <section className="wood-menu page-enter" aria-label="Главное меню Memestone">
    <div className="wood-menu-background" /><div className="wood-menu-light" />
    <div className="wood-topbar"><button className="wood-counter" onClick={collection} aria-label="Открыть коллекцию"><Layers3 size={25} /><strong>{CARDS.length}</strong></button>
      <div><button className="wood-counter wins" onClick={profile} aria-label="Статистика побед"><strong>{wins}</strong><Trophy size={26} /></button>{document.fullscreenEnabled && <button className="wood-small-button" aria-label="На весь экран" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => {}); }}><Maximize size={23} /></button>}<button className="wood-small-button" aria-label="Настройки" onClick={settings}><Settings2 size={29} /></button></div>
    </div>
    <div className="wood-medallion"><div className="wood-title"><span>◆</span><h1>Memestone</h1><span>◆</span></div><span className="wood-subtitle">ТВОИ КАРТЫ. ТВОИ ПРАВИЛА.</span>
      <div className="wood-buttons"><button className="wood-main-button" onClick={start} aria-label={resume ? 'Продолжить бой' : 'В бой'}><span>{resume ? 'Продолжить' : 'Играть'}</span></button><button className="wood-main-button" onClick={collection}><span>Моя коллекция</span></button><button className="wood-main-button" onClick={help}><span>Как играть</span></button><button className="wood-main-button wood-rooms-button" onClick={rooms}><span><Users size={22} />Комнаты</span></button></div>
      <svg className="wood-flourish" viewBox="0 0 440 85" aria-hidden="true"><path d="M20 47C50 5 100 12 95 43 90 68 52 63 65 43M120 45C155 85 205 57 191 30 182 15 164 20 170 36M420 47C390 5 340 12 345 43 350 68 388 63 375 43M320 45C285 85 235 57 249 30 258 15 276 20 270 36" /><path d="m207 44 13-13 13 13-13 13Z" /></svg>
      <p className="wood-bot-label">Трактирщик Борис уже сдаёт карты</p>
    </div>
    <button className="wood-side-button profile" onClick={profile}><span className="wood-side-caption">Профиль</span><span className="wood-emblem"><Crown /></span></button>
    <button className="wood-side-button collection" onClick={collection}><span className="wood-emblem"><Layers3 /></span><span className="wood-side-caption">Коллекция</span></button>
    <button className="wood-side-button rules" onClick={help}><span className="wood-side-caption">Правила</span><span className="wood-emblem"><BookOpen /></span></button>
    <button className="wood-side-button settings" onClick={settings}><span className="wood-emblem"><Settings2 /></span><span className="wood-side-caption">Настройки</span></button>
    <div className="wood-bottom-note"><span>MEMESTONE · ТЕСТОВАЯ ВЕРСИЯ 0.11.0</span><span>СДЕЛАНО ДЛЯ СВОИХ</span></div>
  </section>;
}
