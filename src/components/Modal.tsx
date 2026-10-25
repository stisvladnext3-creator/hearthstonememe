import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import FullscreenButton from './FullscreenButton';

export default function Modal({ title, close, children, className = '', dismissible = true }: {
  title: string; close: () => void; children: ReactNode; className?: string; dismissible?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onClose = useRef(close);
  useLayoutEffect(() => { onClose.current = close; }, [close]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose.current();
      if (e.key === 'Tab') {
        const focusable = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') ?? []);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = old; previous?.focus(); };
  }, [dismissible]);
  return <div className="modal-backdrop" onMouseDown={e => { if (dismissible && e.target === e.currentTarget) close(); }}>
    <div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <FullscreenButton />
      {dismissible && <button className="icon-button modal-close" onClick={close} aria-label="Закрыть"><X size={20} /></button>}
      {children}
    </div>
  </div>;
}
