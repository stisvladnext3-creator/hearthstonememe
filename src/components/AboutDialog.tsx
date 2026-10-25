import { Flame, Layers3, Swords, Trophy, Zap, Target } from 'lucide-react';
import type { Stats } from '../storage';
import { CARDS } from '../game/cards';
import { HERO_CLASSES } from '../game/classes';
import Modal from './Modal';
import WindowPages from './WindowPages';
import PagedText from './PagedText';
const number = new Intl.NumberFormat('ru-RU');
export default function AboutDialog({ stats, deckSize, close, help }: { stats: Stats; deckSize: number; close: () => void; help: () => void }) {
  const metrics = [
    ['wins', 'Побед', stats.wins, Trophy], ['games', 'Завершено партий', stats.games, Swords], ['cardsPlayed', 'Карт разыграно', stats.cardsPlayed, Layers3],
    ['heroDamage', 'Урон героям', stats.heroDamage, Flame], ['minionDamage', 'Урон существам', stats.minionDamage, Target], ['manaSpent', 'Маны потрачено', stats.manaSpent, Zap],
  ] as const;
  const about = `Memestone — карточная игра для партии с ботом Борисом или другом в комнате. Доступны ${Object.keys(HERO_CLASSES).length} классов: ${Object.values(HERO_CLASSES).map(c => c.name).join(', ')}. У каждого своя сила героя. Перед боем выбирается сохранённая колода, а в начале партии работает муллиган.\n\nВ коллекции ${CARDS.length} карт и сил, включая общие и классовые карты, призывы и награды. Колоды содержат 30 карт и создаются для конкретного класса; в выбранной сейчас ${deckSize}/30. Награды за задачи нельзя положить в колоду.\n\nВ мастерской можно создавать существ, заклинания и героев, задавать эффекты и синергии, добавлять иллюстрации, импортировать и экспортировать JSON до 2000 КБ. В сетевой партии используемые определения карт передаются автоматически.\n\nКолоды, личные карты, настройки и статистика сохраняются в этом браузере. Статистика учитывает бои с ботом и игроками. Это независимый фан-проект, не связанный с Blizzard Entertainment. Платных покупок нет. Версия 0.18.1.`;
  return <Modal title="О проекте Memestone" close={close} className="about-modal paged-modal readable-profile"><h2>Memestone</h2><WindowPages pages={[
    { id: 'profile', label: 'Профиль', content: <div className="profile-content"><div className="profile-metrics">{metrics.map(([key, label, value, Icon]) => <div key={key} className="profile-metric" data-stat={key}><Icon size={21} /><strong>{number.format(value)}</strong><span>{label}</span></div>)}</div><div className="profile-explanation"><p>Ваши действия в боях с ботом и игроками. Урон — по противнику, включая броню и ответные удары; собственный урон и усталость не учитываются.</p><p>Победы и партии считаются после завершения боя. Новые показатели накапливаются с этого обновления; прежние победы и партии сохранены.</p></div></div> },
    { id: 'about', label: 'О проекте', content: <PagedText text={about} /> },
  ]} /><button className="button secondary window-done" onClick={help}>Открыть справочник</button></Modal>;
}
