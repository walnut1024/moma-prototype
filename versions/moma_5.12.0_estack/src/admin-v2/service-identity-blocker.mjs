import { offerStage, providerOffer, serviceCallsEnabled } from '../service-access.mjs';

export function serviceIdentityBlockingMessage(model, providerId) {
  const entry = providerOffer(model, providerId);
  const stage = offerStage(model, entry);
  const listed = ['formal', 'gray'].includes(stage);
  const requiresStop = providerId ? entry?.callsEnabled !== false : model.callsEnabled === true;
  const serving = serviceCallsEnabled(model, entry);
  const status = listed ? '仍处于' + (stage === 'gray' ? '灰度上架' : '正式上架') + '状态' : stage === 'withdrawn' ? '已下架' : '未上架';
  if (!listed && !requiresStop) return '';
  if (requiresStop && !serving) return '当前服务已停止调用，但该渠道仍保留启用配置，' + status + '。请先停止该渠道服务' + (listed ? '并下架' : '') + '，再修改模型调用标识。';
  return '当前服务' + (serving ? '尚未停止' : '已停止') + '，' + status + '。请先' + (requiresStop ? '停止服务' : '') + (requiresStop && listed ? '并' : '') + (listed ? '下架' : '') + '，再修改模型调用标识。';
}
