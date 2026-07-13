// Автооптимизация больших изображений в браузере перед загрузкой: если файл > ~9.5 МБ,
// уменьшаем до 2560px по большей стороне и пережимаем в JPEG (качество подбирается), чтобы
// уложиться в лимит сервера (10 МБ). GIF и небольшие файлы не трогаем.

const MAX_BYTES = 9.5 * 1024 * 1024;
const MAX_DIM = 2560;

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Не удалось прочитать файл'));
    r.readAsDataURL(file);
  });
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось открыть изображение'));
    img.src = src;
  });
}
function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

/** Вернёт оптимизированный File (JPEG) для крупных изображений, иначе — исходный. */
export async function optimizeImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png)$/.test(file.type) || file.size <= MAX_BYTES) return file;
  try {
    const img = await loadImage(await readDataUrl(file));
    let { width, height } = img;
    const scale = Math.max(width, height) > MAX_DIM ? MAX_DIM / Math.max(width, height) : 1;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);
    let quality = 0.85;
    let blob = await toBlob(canvas, quality);
    while (blob && blob.size > MAX_BYTES && quality > 0.4) {
      quality -= 0.1;
      blob = await toBlob(canvas, quality);
    }
    if (!blob) return file;
    const name = `${file.name.replace(/\.[^.]+$/, '')}.jpg`;
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file; // при любой ошибке — грузим оригинал (сервер сам проверит лимит)
  }
}
