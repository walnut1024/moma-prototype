import { useState } from 'react';
import { IconImageStroked } from './xa24/HaloIcons.jsx';
import { normalizeModelLogo } from './model-profile';

const brandIcons = import.meta.glob('./model-icons/*.svg', { eager: true, import: 'default' });
const modelFamilies = [
  [/^deepseek/i, 'deepseek-color'], [/^kimi/i, 'kimi'], [/^(?:chatglm|glm)/i, 'zhipu-color'],
  [/^qwen/i, 'qwen-color'], [/^minimax/i, 'minimax-color'], [/^doubao/i, 'doubao-color'],
];

export function modelFamilyIcon(model) {
  for (const value of [model?.modelId?.split('/').pop(), model?.profile?.family, model?.name]) {
    const family = modelFamilies.find(([pattern]) => pattern.test(value || ''));
    if (family) return brandIcons['./model-icons/' + family[1] + '.svg'];
  }
}

export default function MaterialLogo({ src, alt, preview = false, model }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const image = src || modelFamilyIcon(model);
  const size = preview ? 'materials-logo-preview' : 'materials-logo';
  if (image && image !== failedSrc) return <img className={size} src={image} alt={alt}
    loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSrc(image)}/>;
  const label = image ? '图标加载失败' : '未上传图标';
  return <span className={size + ' materials-logo-empty'} role="img" aria-label={label} title={label}>
    <IconImageStroked aria-hidden="true"/>{preview && <small>{label}</small>}
  </span>;
}

export async function readMaterialLogo(file, maxSize = 1024 * 1024, thumbnailSize) {
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
  if (!thumbnailSize) return logo;
  const scale = Math.min(1, thumbnailSize / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.9);
}
