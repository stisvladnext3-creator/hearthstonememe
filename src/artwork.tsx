import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ORIGINAL_ART, type ImageFormat } from './original-art';

export interface Artwork { url: string; format: ImageFormat }
interface SavedArtwork { id: string; blob: Blob; format: ImageFormat }
interface ArtContext {
  images: Record<string, Artwork>;
  save: (id: string, file: File, format: ImageFormat) => Promise<void>;
  remove: (id: string) => Promise<void>;
}
const Context = createContext<ArtContext>({ images: {}, save: async () => {}, remove: async () => {} });
export const useArtwork = () => useContext(Context);
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('memestone-original-art', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('images', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('Браузер не разрешил хранение изображений.'));
  });
}
async function storeImage(image: SavedArtwork | string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('images', 'readwrite');
      const store = tx.objectStore('images');
      if (typeof image === 'string') store.delete(image); else store.put(image);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new Error('Не удалось сохранить картинку. Проверь свободное место.'));
    });
  } finally { db.close(); }
}
export function ArtworkProvider({ children }: { children: ReactNode }) {
  const [images, setImages] = useState<Record<string, Artwork>>(() => Object.fromEntries(
    Object.entries(ORIGINAL_ART).map(([id, a]) => [id, { url: import.meta.env.BASE_URL + a.path, format: a.format }]),
  ));
  const urls = useRef(new Set<string>());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await database();
      try {
        const saved = await new Promise<SavedArtwork[]>((resolve, reject) => {
          const req = db.transaction('images').objectStore('images').getAll();
          req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        });
        if (cancelled) return;
        const loaded: Record<string, Artwork> = {};
        for (const a of saved) {
          if (!(a.blob instanceof Blob) || !['card', 'editor', 'portrait'].includes(a.format)) continue;
          const url = URL.createObjectURL(a.blob); urls.current.add(url);
          loaded[a.id] = { url, format: a.format };
        }
        setImages(previous => ({ ...previous, ...loaded }));
      } finally { db.close(); }
    })().catch(() => { /* Shared images still work when device storage is unavailable. */ });
    const allocated = urls.current;
    return () => { cancelled = true; allocated.forEach(URL.revokeObjectURL); allocated.clear(); };
  }, []);
  useEffect(() => {
    const active = new Set(Object.values(images).map(a => a.url));
    for (const url of urls.current) if (!active.has(url)) { URL.revokeObjectURL(url); urls.current.delete(url); }
  }, [images]);
  const save = async (id: string, file: File, format: ImageFormat) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Выбери JPG, PNG или WebP.');
    if (file.size > 15 * 1024 * 1024) throw new Error('Максимальный размер картинки — 15 МБ.');
    const bitmap = await createImageBitmap(file).catch(() => { throw new Error('Не удалось открыть эту картинку.'); });
    bitmap.close();
    await storeImage({ id, blob: file, format });
    const url = URL.createObjectURL(file); urls.current.add(url);
    setImages(previous => ({ ...previous, [id]: { url, format } }));
  };
  const remove = async (id: string) => {
    await storeImage(id);
    setImages(previous => {
      const next = { ...previous }; delete next[id];
      const original = ORIGINAL_ART[id];
      if (original) next[id] = { url: import.meta.env.BASE_URL + original.path, format: original.format };
      return next;
    });
  };
  return <Context.Provider value={{ images, save, remove }}>{children}</Context.Provider>;
}
