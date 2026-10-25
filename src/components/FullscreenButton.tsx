import { useEffect, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';

type ScreenDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void | Promise<void> };
type ScreenElement = HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };
export default function FullscreenButton({ global = false, notify }: { global?: boolean; notify?: (message: string) => void }) {
  const doc = document as ScreenDocument;
  const [expanded, setExpanded] = useState(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
  const [message, setMessage] = useState('');
  useEffect(() => {
    const update = () => setExpanded(!!(document.fullscreenElement || (document as ScreenDocument).webkitFullscreenElement));
    document.addEventListener('fullscreenchange', update); document.addEventListener('webkitfullscreenchange', update);
    return () => { document.removeEventListener('fullscreenchange', update); document.removeEventListener('webkitfullscreenchange', update); };
  }, []);
  const toggle = async () => {
    setMessage(''); const root = document.documentElement as ScreenElement;
    try {
      if (doc.fullscreenElement) await doc.exitFullscreen();
      else if (doc.webkitFullscreenElement) await doc.webkitExitFullscreen?.();
      else if (root.requestFullscreen) await root.requestFullscreen();
      else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
      else throw new Error('unavailable');
    } catch {
      const text = 'Полный экран недоступен в этом браузере. Можно открыть игру с главного экрана телефона.';
      if (notify) notify(text); else setMessage(text);
    }
  };
  return <><button type="button" className={`fullscreen-button ${global ? 'global-fullscreen' : ''}`} onClick={() => { void toggle(); }} aria-label={expanded ? 'Выйти из полноэкранного режима' : 'На весь экран'} title={expanded ? 'Выйти из полноэкранного режима' : 'На весь экран'}>{expanded ? <Minimize size={19} /> : <Maximize size={19} />}</button>{message && <div className="fullscreen-feedback" role="status">{message}</div>}</>;
}
