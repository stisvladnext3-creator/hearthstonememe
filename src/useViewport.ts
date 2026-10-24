import { useEffect, useState } from 'react';
const measure = () => ({ width: window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight });
export const phoneScreen = (s: { width: number; height: number }) => s.width <= 960 || s.height <= 600 && s.width <= 1180;
export function useViewport() {
  const [size, setSize] = useState(measure);
  useEffect(() => {
    const update = () => setSize(measure());
    window.addEventListener('resize', update); window.visualViewport?.addEventListener('resize', update);
    return () => { window.removeEventListener('resize', update); window.visualViewport?.removeEventListener('resize', update); };
  }, []);
  return size;
}
