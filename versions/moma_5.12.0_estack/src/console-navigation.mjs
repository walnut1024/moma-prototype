export function consoleNavigation({ personal, internal, canManage }) {
  return [
    { id:'public', label:'', scope:'space', items:[personal ? '概览' : '空间总览','模型广场'] },
    { id:'experience', scope:'project', label:'模型体验', items:['文本生成','图片生成','视频生成','语音识别'] },
    { label:'智能路由', scope:'project' },
    { label:'API 密钥', scope:'project' },
    { id:'observation', scope:'project', label:'用量观测', items:['用量统计','调用观测','调用日志'] },
    ...(!internal && canManage ? [{id:'orders',label:'订购与费用',items:['模型订购','订购与账单']}] : []),
    ...(personal ? [{label:'使用设置'}] : [{id:'management',label:'管理设置',items:['项目管理','组织及成员',...(canManage ? ['操作记录'] : [])]}]),
  ];
}

export function consoleActiveItem(page, personal) {
  if (page === '模型详情') return '模型广场';
  if (page === '项目概览') return personal ? '概览' : '项目管理';
  if (page === '项目设置') return personal ? '使用设置' : '项目管理';
  return page;
}
