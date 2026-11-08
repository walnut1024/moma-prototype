import { useState } from 'react';
import { normalizeModelLogo } from './model-profile';

export default function MaterialLogo({ src, alt, preview = false }) {
  const [failed, setFailed] = useState(false);
  return src && !failed
    ? <img className={preview ? 'materials-logo-preview' : 'materials-logo'} src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>
    : '—';
}

export async function readMaterialLogo(file, maxSize = 1024 * 1024) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > maxSize) {
    const limit = maxSize === 1024 * 1024 ? '1 MB' : maxSize / 1024 + ' KB';
    throw Error(`Logo 仅支持 ${limit} 以内的 PNG、JPEG 或 WebP 图片`);
  }
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(Error('读取图片失败，请重新选择'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const logo = normalizeModelLogo(data);
  const image = new Image();
  image.src = logo;
  await image.decode().catch(() => { throw Error('图片无法读取，请选择有效的 PNG、JPEG 或 WebP 图片'); });
  return logo;
}
