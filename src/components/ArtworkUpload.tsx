import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useArtwork } from '../artwork';
import type { CardDef } from '../game/cards';
import type { ImageFormat } from '../original-art';

export default function ArtworkUpload({ card, notify }: { card: CardDef; notify: (text: string) => void }) {
  const { images, save, remove } = useArtwork();
  const input = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<ImageFormat>('card');
  const [busy, setBusy] = useState(false);
  return <div className="artwork-upload"><strong>Твоя картинка</strong><p>Загрузи оригинал из галереи. Фотография останется без перерисовки.</p>
    <label>Что на изображении?<select aria-label="Формат изображения" value={format} onChange={e => setFormat(e.target.value as ImageFormat)}><option value="card">Готовая карта целиком</option><option value="editor">Скриншот редактора с рекламой</option><option value="portrait">Только фотография</option></select></label>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label={`Загрузить оригинал ${card.name}`} className="visually-hidden" onChange={async e => {
      const file = e.target.files?.[0]; if (!file) return;
      setBusy(true);
      try { await save(card.id, file, format); notify('Оригинал добавлен. Его видно в коллекции и в бою.'); }
      catch (error) { notify(error instanceof Error ? error.message : 'Не удалось сохранить картинку.'); }
      finally { setBusy(false); if (input.current) input.current.value = ''; }
    }} />
    <div><button className="button secondary" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={16} />{busy ? 'Сохраняю…' : images[card.id] ? 'Заменить картинку' : 'Добавить оригинал'}</button>{images[card.id] && <button className="icon-button" disabled={busy} aria-label="Убрать свою картинку" onClick={async () => { try { await remove(card.id); notify('Локальная картинка убрана.'); } catch { notify('Не удалось убрать картинку.'); } }}><Trash2 size={16} /></button>}</div><small>Видно только тебе на этом устройстве.</small>
  </div>;
}
