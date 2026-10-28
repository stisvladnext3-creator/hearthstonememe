import {RefreshCw,Swords,X,Zap} from 'lucide-react';
import type {CardDef} from '../game/cards';
import type {Minion} from '../game/engine';
import {hasDeathrattle} from '../game/visual-effects';

export default function UnitBadges({card:c,minion:m}:{card:CardDef;minion:Minion}){
  return <>
    {m.origin === 'transformed' && <span className="origin-badge" title="Превращение: боевой клич не срабатывал"><RefreshCw size={11} /></span>}
    {m.charge && !m.silenced && <span className="charge-badge" title="Рывок: может атаковать сразу после выхода"><Zap size={12} /></span>}
    {m.rush && !m.silenced && <span className="rush-badge" title="Натиск: сразу атакует существ, героя — со следующего своего хода"><Swords size={12} /></span>}
    {hasDeathrattle(c,m) && <span className="deathrattle-badge" title={m.adaptSpores?`Живые споры: призовёт ${m.adaptSpores*2} Растений 1/1.`:c.text.slice(c.text.indexOf('Предсмертный хрип:'))}>☠</span>}
    {c.bulky && !m.silenced && <span className="bulky-badge" title="Громоздкий: половина атаки по соседям цели">↔</span>}
    {m.reborn&&<span className="reborn-badge" title="Перерождение: вернётся с 1 здоровьем">↻</span>}
    {m.lifesteal&&<span className="lifesteal-badge" title="Похищение жизни: нанесённый урон лечит героя">♥</span>}
    {m.elusive&&<span className="elusive-badge" title="Не может быть целью заклинаний и силы героя">◇</span>}
    {m.windfury && <span className="windfury-badge" title="Неистовство ветра: две атаки за ход">≋</span>}
    {m.poisonous && <span className="poison-badge" title="Яд: нанесённый существу урон смертелен">☠</span>}
    {m.stealth && <span className="stealth-badge" title="Маскировка: нельзя выбрать целью вражеской атаки или способности">◉</span>}
    {!m.ready && !m.cannotAttack && <span className="sleep-mark">zZ</span>}
    {m.cannotAttack && <span className="sleep-mark"><X size={15} /></span>}
    {m.silenced && <span className="silence-mark">Немота</span>}
  </>;
}
