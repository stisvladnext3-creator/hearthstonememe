import { ArrowUpRight, Layers3, Swords, Trophy } from 'lucide-react';
import type { Stats } from '../storage';
import { CARDS } from '../game/cards';
import Modal from './Modal';
import WindowPages from './WindowPages';
export default function AboutDialog({ stats, deckSize, close, help }: { stats: Stats; deckSize: number; close: () => void; help: () => void }) {
  return <Modal title="О проекте Memestone" close={close} className="about-modal paged-modal"><h2>Memestone</h2><WindowPages pages={[
    { id: 'profile', label: 'Профиль', content: <div><p>Большие легенды. Своя компания.</p><div className="profile-stats"><div><Trophy size={18} /><strong>{stats.wins}</strong> побед</div><div><Swords size={18} /><strong>{stats.games}</strong> партий</div><div><Layers3 size={18} /><strong>{deckSize}</strong> карт в колоде</div></div><p>Статистика учитывает партии с ботом. Колода и настройки сохраняются в этом браузере.</p></div> },
    { id: 'about', label: 'О проекте', content: <div><p>Фанатская карточная игра: бой против Бориса, сетевые комнаты для двоих и коллекция из {CARDS.length} карт. Волонтер-босс доступен как награда за задачу.</p><p>Оформление создано по твоим примерам. Свои фотографии и готовые карты можно загрузить в подробном просмотре карты.</p><p>Независимый фан-проект, не связанный с Blizzard Entertainment. Платных покупок нет.</p></div> },
  ]} /><button className="button secondary window-done" onClick={help}>Открыть правила <ArrowUpRight size={16} /></button></Modal>;
}
