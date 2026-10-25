import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function PagedText({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState([text]);
  const [page, setPage] = useState(0);
  useLayoutEffect(() => {
    const box = ref.current; if (!box) return;
    let alive = true;
    const fit = () => {
      if (!alive || box.clientHeight < 1 || box.clientWidth < 1) return;
      const measure = document.createElement('p');
      measure.className = 'paged-text-copy';
      Object.assign(measure.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: 'auto', visibility: 'hidden', pointerEvents: 'none' });
      box.append(measure);
      const words = text.split(/(?<=\s)/), chunks: string[] = [];
      let start = 0;
      while (start < words.length) {
        let lo = start + 1, hi = words.length, best = lo;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          measure.textContent = words.slice(start, mid).join('').trim();
          if (measure.scrollHeight <= box.clientHeight + .5) { best = mid; lo = mid + 1; } else hi = mid - 1;
        }
        chunks.push(words.slice(start, best).join('').trim()); start = best;
      }
      measure.remove();
      setPages(current => current.join('\u0000') === chunks.join('\u0000') ? current : chunks.length ? chunks : ['']);
    };
    setPage(0); fit(); const observer = new ResizeObserver(fit); observer.observe(box);
    void document.fonts.ready.then(fit); document.fonts.addEventListener('loadingdone', fit);
    return () => { alive = false; observer.disconnect(); document.fonts.removeEventListener('loadingdone', fit); };
  }, [text]);
  const current = Math.min(page, pages.length - 1);
  return <div className="paged-text"><div ref={ref} className="paged-text-body"><p className="paged-text-copy">{pages[current]}</p></div>{pages.length > 1 && <div className="reader-pagination" aria-label="Страницы текста"><button aria-label="Предыдущая страница текста" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={17} /></button><span>{current + 1} / {pages.length}</span><button aria-label="Следующая страница текста" disabled={current + 1 === pages.length} onClick={() => setPage(current + 1)}><ChevronRight size={17} /></button></div>}</div>;
}
