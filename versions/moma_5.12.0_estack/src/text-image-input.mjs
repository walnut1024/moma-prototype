export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
export const supportsImageInput = model => model?.inputModalities?.includes('image') === true;

export function imageInputError(model, files, count = 0) {
  if (!supportsImageInput(model)) return '当前模型不支持图片输入，请切换支持图片的模型。';
  if (count + files.length > 4) return '每条消息最多添加 4 张图片。';
  if (files.some(file => !IMAGE_ACCEPT.split(',').includes(file.type))) return '仅支持 JPG、PNG、WebP 或 GIF 图片，请重新选择。';
  if (files.some(file => !file.size || file.size > 5 * 1024 * 1024)) return '图片不能为空，且每张不能超过 5 MB。';
  return '';
}
