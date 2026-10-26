export async function smallPicture(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 15_000_000) throw new Error('Выбери JPG, PNG или WebP до 15 МБ.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas'), scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#20180f'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [.8, .6, .4, .22]) { const data = canvas.toDataURL('image/jpeg', quality); if (data.length <= 48_000) return data; }
    throw new Error('Картинка слишком подробная. Выбери меньший файл.');
  } finally { bitmap.close(); }
}
