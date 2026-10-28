import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ORIGINAL_ART, type SharedArtwork, type ImageFormat } from './original-art';
import { readArtwork, storeArtwork } from './account/art-storage';
import { PROFILE_REFRESHED, profileChanged, profileScope } from './account/scope';

export interface Artwork extends Omit<SharedArtwork, 'path'> { url: string }
interface ArtContext {
  images: Record<string, Artwork>;
  save: (id: string, file: File, format: ImageFormat) => Promise<void>;
  remove: (id: string) => Promise<void>;
}
const Context = createContext<ArtContext>({ images: {}, save: async () => {}, remove: async () => {} });
export const useArtwork = () => useContext(Context);
function sharedImage(image: SharedArtwork): Artwork {
  const { path, ...metadata } = image;
  return { ...metadata, url: import.meta.env.BASE_URL + path };
}
export function ArtworkProvider({ children }: { children: ReactNode }) {
  const scope=profileScope();
  const [images, setImages] = useState<Record<string, Artwork>>(() => Object.fromEntries(
    Object.entries(ORIGINAL_ART).map(([id, a]) => [id, sharedImage(a)]),
  ));
  const urls = useRef(new Set<string>());
  useEffect(() => {
    let cancelled = false,generation=0;
    const load=()=>{const run=++generation;void (async () => {
        const saved = await readArtwork(scope);
        if (cancelled||run!==generation) return;
        const loaded: Record<string, Artwork> = {};
        for (const a of saved) {
          if (!(a.blob instanceof Blob) || !['card', 'editor', 'portrait'].includes(a.format)) continue;
          const url = URL.createObjectURL(a.blob); urls.current.add(url);
          loaded[a.id] = { url, format: a.format };
        }
        setImages({ ...Object.fromEntries(Object.entries(ORIGINAL_ART).map(([id,a])=>[id,sharedImage(a)])), ...loaded });
    })().catch(() => { /* Shared images still work when device storage is unavailable. */ });};
    load();window.addEventListener(PROFILE_REFRESHED,load);
    const allocated = urls.current;
    return () => { cancelled = true;window.removeEventListener(PROFILE_REFRESHED,load); allocated.forEach(URL.revokeObjectURL); allocated.clear(); };
  }, [scope]);
  useEffect(() => {
    const active = new Set(Object.values(images).map(a => a.url));
    for (const url of urls.current) if (!active.has(url)) { URL.revokeObjectURL(url); urls.current.delete(url); }
  }, [images]);
  const save = async (id: string, file: File, format: ImageFormat) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Выбери JPG, PNG или WebP.');
    if (file.size > 15 * 1024 * 1024) throw new Error('Максимальный размер картинки — 15 МБ.');
    const bitmap = await createImageBitmap(file).catch(() => { throw new Error('Не удалось открыть эту картинку.'); });
    bitmap.close();
    await storeArtwork({ id, blob: file, format },scope);
    profileChanged(['artwork'],scope);
    const url = URL.createObjectURL(file); urls.current.add(url);
    setImages(previous => ({ ...previous, [id]: { url, format } }));
  };
  const remove = async (id: string) => {
    await storeArtwork(id,scope);
    profileChanged(['artwork'],scope);
    setImages(previous => {
      const next = { ...previous }; delete next[id];
      const original = ORIGINAL_ART[id];
      if (original) next[id] = sharedImage(original);
      return next;
    });
  };
  return <Context.Provider value={{ images, save, remove }}>{children}</Context.Provider>;
}
