export const roleDemoLabels = {
  home: ['首页','Home'],
  'model-market': ['模型广场','Model Square'],
  projects: ['项目管理','Project Management'],
  text: ['文本生成','Text Generation'],
  image: ['图片生成','Image Generation'],
  video: ['视频生成','Video Generation'],
  voice: ['语音识别','Speech Recognition'],
  'model-order': ['模型订购','Model Subscription'],
  'api-keys': ['API 密钥管理','API Key Management'],
  'usage-statistics': ['用量统计','Usage Statistics'],
  'call-logs': ['调用日志','Call Logs'],
  'smart-route': ['智能路由','Smart Route'],
  'model-ranking': ['模型排行榜','Model Ranking'],
  'token-calculator': ['Token计算器','Token Calculator'],
  'tool-connection': ['工具接入','Tool Access'],
};

export function roleDemoNavigation({ personal, canOrder, canManageProject }) {
  return [
    { id:'public', labels:['',''], items:['home','model-market',...(!personal && canManageProject ? ['projects'] : [])] },
    { id:'experience', labels:['模型体验','Model Experience'], items:['text','image','video','voice'] },
    { id:'subscription', labels:['订购服务','Subscription Services'], items:[...(canOrder ? ['model-order'] : []),'api-keys'] },
    { id:'usage', labels:['用量计费','Usage Billing'], items:['usage-statistics','call-logs'] },
    { id:'tools', labels:['辅助工具','Tools'], items:['smart-route','model-ranking','token-calculator','tool-connection'] },
  ];
}

export function roleDemoPage(workspace, requested, tab) {
  const page = requested === 'quota-manage' ? 'api-keys' : requested;
  if (page === 'projects' && !workspace.personal && ['general','models','members','budget','logs'].includes(tab)) return page;
  if (page === 'smart-route' && !workspace.canOrder) return 'home';
  return roleDemoNavigation(workspace).some(group=>group.items.includes(page)) ? page : 'home';
}
