import { useEffect, useRef, type PointerEvent, type MouseEvent, type KeyboardEvent } from 'react';

export function useLongPress(inspect?: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const origin = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const callback = useRef(inspect); callback.current = inspect;
  const cancel = () => { if (timer.current !== undefined) window.clearTimeout(timer.current); timer.current = undefined; };
  useEffect(() => cancel, []);
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (!callback.current || e.button !== 0) return;
      cancel(); suppressClick.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => { suppressClick.current = true; timer.current = undefined; callback.current?.(); }, 450);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (timer.current !== undefined && Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 12) {
        cancel(); suppressClick.current = true;
      }
    },
    onPointerUp: cancel,
    onPointerCancel() { cancel(); suppressClick.current = true; },
    onPointerLeave: cancel,
    onClickCapture(e: MouseEvent<HTMLElement>) {
      if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; }
    },
    onContextMenu(e: MouseEvent<HTMLElement>) {
      if (!callback.current) return;
      e.preventDefault(); cancel();
      if (!suppressClick.current) { suppressClick.current = true; callback.current(); }
    },
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      if (callback.current && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) { e.preventDefault(); callback.current(); }
    },
  };
}
