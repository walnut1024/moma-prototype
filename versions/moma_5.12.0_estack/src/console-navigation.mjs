export function consoleNavigation({ personal, internal, canManage, canManageOrganization }) {
  return [
    { id:'public', label:'', scope:'space', items:['首页','模型广场'] },
    { id:'experience', scope:'project', label:'模型体验', items:['文本生成','图片生成','视频生成','语音识别'] },
    { id:'connection', scope:'project', label:'接入与调用', items:['API 密钥','工具接入','智能路由'] },
    { id:'observation', scope:'project', label:'调用观测', items:['用量统计','调用日志'] },
    ...(!internal && canManage ? [{label:'模型订购'}] : []),
    { label:'账户管理' },
    { id:'system', label:'系统管理', scope:'space', items:personal ? ['使用设置'] : [...(canManageOrganization ? ['组织及成员'] : []),'项目管理'] },
  ];
}

export function consoleActiveItem(page, personal) {
  if (['模型详情','模型排行'].includes(page)) return '模型广场';
  if (['项目管理','我的项目'].includes(page)) return '项目管理';
  if (page === '订购与账单') return '模型订购';
  if (page === '调用日志留存') return '调用日志';
  if (['配额管理','密钥操作记录'].includes(page)) return 'API 密钥';
  if (page === '空间总览' || page === '项目概览' && personal) return '首页';
  if (page === '项目设置' && personal) return '使用设置';
  if (page === '项目概览' || page === '项目设置') return '项目管理';
  return page;
}
