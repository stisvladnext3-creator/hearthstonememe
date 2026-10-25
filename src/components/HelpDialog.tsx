import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import Modal from './Modal';
import PagedText from './PagedText';
import { HANDBOOK } from '../game/handbook';
const categories = [['all', 'Всё'], ['basics', 'Основы'], ['keywords', 'Ключевые слова'], ['heroes', 'Герои']] as const;
export default function HelpDialog({ close }: { close: () => void }) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState<string>('all'), [id, setId] = useState(HANDBOOK[0].id);
  const articles = useMemo(() => HANDBOOK.filter(a => (query.trim() || category === 'all' || a.category === category) && `${a.title} ${a.text}`.toLowerCase().includes(query.trim().toLowerCase())), [query, category]);
  const index = Math.max(0, articles.findIndex(a => a.id === id)), article = articles[index];
  return <Modal title="Как играть" close={close} className="help-modal handbook-modal">
    <header className="readable-heading"><h2>Правила и справочник</h2><p>Механики игры и каждое ключевое слово отдельно</p></header>
    <label className="handbook-search"><Search size={18} /><input value={query} onChange={e => { setQuery(e.target.value); if (e.target.value) setCategory('all'); }} placeholder="Найти правило или ключевое слово" aria-label="Поиск по правилам" /></label>
    <div className="handbook-categories" role="tablist" aria-label="Разделы справочника">{categories.map(([key, name]) => <button key={key} role="tab" aria-selected={key === category} onClick={() => { setCategory(key); setQuery(''); setId(HANDBOOK.find(a => key === 'all' || a.category === key)!.id); }}>{name}</button>)}</div>
    {article ? <><div className="handbook-select"><button aria-label="Предыдущая статья" disabled={index === 0} onClick={() => setId(articles[index - 1].id)}><ChevronLeft size={20} /></button><select aria-label="Статья справочника" value={article.id} onChange={e => setId(e.target.value)}>{articles.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select><button aria-label="Следующая статья" disabled={index + 1 === articles.length} onClick={() => setId(articles[index + 1].id)}><ChevronRight size={20} /></button></div><article className="handbook-article"><h3>{article.title}</h3><PagedText key={article.id} text={article.text} /></article></> : <div className="handbook-empty">Ничего не найдено. Попробуйте другое слово.</div>}
    <footer className="handbook-footer"><span>Найдено: {articles.length}</span><button className="button primary" onClick={close}>Всё понятно</button></footer>
  </Modal>;
}
