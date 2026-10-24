import { useState, type ReactNode } from 'react';

export default function WindowPages({ pages }: { pages: { id: string; label: string; content: ReactNode }[] }) {
  const [selected, setSelected] = useState(pages[0].id);
  const active = pages.find(p => p.id === selected) ?? pages[0];
  return <div className="window-pages"><div className="window-tabs" role="tablist" aria-label="Вкладки окна">
    {pages.map(p => <button key={p.id} type="button" role="tab" aria-selected={active.id === p.id} aria-controls={`window-${p.id}`} onClick={() => setSelected(p.id)}>{p.label}</button>)}
  </div><div className={`window-panel panel-${active.id}`} id={`window-${active.id}`} role="tabpanel" aria-label={active.label}>{active.content}</div></div>;
}
