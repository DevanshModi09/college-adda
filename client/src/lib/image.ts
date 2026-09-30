/**
 * Shrinks a photo in the browser before upload: longest side at most `maxSide` px,
 * re-encoded as JPEG. A 5 MB phone photo usually ends up around 150–300 KB.
 * GIFs are kept as-is (re-encoding would drop the animation) if they're small enough.
 */
export async function prepareImage(file: File, maxSide = 1280, quality = 0.82): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Pick a JPEG, PNG, WebP or GIF');
  if (file.type === 'image/gif') {
    if (file.size > 1.4 * 1024 * 1024) throw new Error('GIF is too big (max 1.4 MB)');
    return readAsDataUrl(file);
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs get a white background instead of black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}
