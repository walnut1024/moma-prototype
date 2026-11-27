import { maskApiKey } from './api-key-utils.mjs';
import { shanghaiDate } from './shanghai-date.mjs';

export const ROLE_DEMOS = {
  personal: { label:'个人客户', name:'个人客户', role:'personal' },
  tenantAdmin: { label:'租户管理员', name:'租户管理员（演示）', role:'tenantAdmin', note:'全部项目·全权限' },
  projectAdmin: { label:'项目管理员', name:'项目管理员（演示）', role:'projectAdmin', note:'负责「客服生产」·预算/日志只读' },
  member: { label:'普通成员', name:'张晨（演示）', role:'member', note:'普通成员·在 2 个项目（默认/客服）' },
};

export const DEMO_ACTORS = {
  ...ROLE_DEMOS,
  viewer: { role:'member', name:'林晓（演示）', note:'普通成员·在 2 个项目（默认/客服）' },
  'agent-a': { role:'member', name:'李然（演示）', note:'普通成员·仅「客服生产」' },
  'agent-b': { role:'member', name:'周琪（演示）', note:'普通成员·仅「客服生产」' },
  'marketing-admin': { role:'projectAdmin', name:'吴敏（演示）', note:'项目管理员·负责「智能营销」' },
  'marketing-dev': { role:'member', name:'郑澜（演示）', note:'普通成员·仅「智能营销」' },
  'marketing-viewer': { role:'member', name:'苏婉（演示）', note:'普通成员·仅「智能营销」' },
  'rd-admin': { role:'projectAdmin', name:'孙浩（演示）', note:'项目管理员·负责「研发测试」' },
  'rd-dev1': { role:'member', name:'何鑫（演示）', note:'普通成员·仅「研发测试」' },
  'rd-dev2': { role:'member', name:'冯磊（演示）', note:'普通成员·仅「研发测试」' },
  'data-admin': { role:'projectAdmin', name:'韩雪（演示）', note:'项目管理员·负责「数据平台」' },
  'data-dev': { role:'member', name:'许阳（演示）', note:'普通成员·仅「数据平台」' },
};

const paygModels = ['GLM-5.2','Kimi-K3'];
const planModels = ['DeepSeek-V4-Flash-0731','GLM-5.1','GLM-5.2','GLM-5.3','GLM-5.3-Flash',
  'Kimi-K2.6','Kimi-K3','MiniMax-M2.5','Qwen3.7-Max'];
const projectFixtures = [
  {
    id:'personal-default', name:'默认项目', description:'个人的模型体验和 API 调用。', owner:'personal',
    members:[], models:paygModels, plans:[['通用模型包',174_300,500_000]],
  },
  {
    id:'company-default', name:'默认项目空间', description:'用于通用模型体验、团队联调与日常共享调用。',
    owner:'tenantAdmin', admins:['projectAdmin'], members:['member','viewer'], createdAt:'2026-11-01T09:00:00+08:00',
    models:paygModels, plans:[['通用模型包',320_000,1_000_000,'2027-01-18'],['联调模型包',500_000,500_000,'2027-02-12']], budget:5000, logCapture:true,
  },
  {
    id:'support', name:'客服生产', description:'客服问答生产环境，承载线上机器人与坐席助手调用。',
    owner:'projectAdmin', members:['member','viewer','agent-a','agent-b'], createdAt:'2026-11-01T14:00:00+08:00',
    models:paygModels, plans:[['客服模型包',300_000,1_500_000,'2027-03-09']], budget:2000,
  },
  {
    id:'marketing', name:'智能营销', description:'营销文案生成、活动策划与投放素材生产。',
    owner:'marketing-admin', members:['marketing-dev','marketing-viewer'], createdAt:'2026-11-05T10:30:00+08:00',
    models:['GLM-5.2'], plans:[['营销模型包',180_000,1_000_000,'2027-04-20']], budget:0,
  },
  {
    id:'research', name:'研发测试', description:'模型效果评测、回归测试与新特性联调。',
    owner:'rd-admin', members:['rd-dev1','rd-dev2'], createdAt:'2026-11-09T16:10:00+08:00',
    models:paygModels, plans:[], budget:20, logCapture:true,
  },
  {
    id:'data-platform', name:'数据平台', description:'数据清洗、标注与结构化抽取任务。',
    owner:'data-admin', members:['data-dev'], createdAt:'2026-11-12T09:45:00+08:00',
    models:['GLM-5.2'], plans:[], budget:0,
  },
];

const keyNames = { 'agent-a':'坐席助手 A 组密钥', 'agent-b':'坐席助手 B 组密钥' };
const DAY = 86_400_000;
const dailyInputs = [1460,2140,890,3280,1870,4550,2620];

function projectRole(actorId, project) {
  if (actorId === 'personal') return project.owner === actorId ? '所有者' : '';
  if (project.owner === 'personal') return '';
  if (actorId === 'tenantAdmin') return '租户管理员';
  if (project.owner === actorId || project.admins?.includes(actorId)) return '项目管理员';
  return project.members.includes(actorId) ? '普通成员' : '';
}

export function roleDemoWorkspace(requestedActor, projectId) {
  const actorId = Object.hasOwn(DEMO_ACTORS, requestedActor) ? requestedActor : 'tenantAdmin';
  const actor = DEMO_ACTORS[actorId];
  const {role} = actor;
  const personal = role === 'personal';
  const canManageTenant = role === 'tenantAdmin';
  const allowed = projectFixtures.filter(row => projectRole(actorId,row));
  const projects = allowed.map(row => ({
    id:row.id, name:row.name, description:row.description, owner:DEMO_ACTORS[row.owner].name,
    role:projectRole(actorId,row), memberCount:1+(row.admins?.length || 0)+row.members.length,
    createdAt:row.createdAt, models:[...row.models], budget:row.budget, logCapture:Boolean(row.logCapture),
  }));
  const selected = allowed.find(row => row.id === projectId) || allowed[0];
  const project = projects.find(row => row.id === selected.id);
  const canManageProject = personal || canManageTenant || project.role === '项目管理员';
  const canConfigureProject = personal || canManageTenant;
  const members = [selected.owner,...(selected.admins || []),...selected.members]
    .map((id,index) => ({
      id, index, name:DEMO_ACTORS[id].name, role:projectRole(id,selected),
      model:selected.models[index % selected.models.length],
    }))
    .filter(row => canManageProject || row.id === actorId);
  const people = members.map(({id,name,role}) => ({id,name,role}));

  const now = Date.now();
  const keys = members.map(({id,name,model,index}) => ({
    id:`key-${project.id}-${id}`, name:personal ? '个人开发密钥' : keyNames[id] || `${name.replace('（演示）','')}的调用密钥`,
    masked:maskApiKey(`sk-demo-••••••${project.id.slice(-2)}0${index+1}`),
    user:name, projectId:project.id, model, status:'生效中', createdAt:project.createdAt || shanghaiDate(new Date(now)),
    billing:selected.plans.length && index%2 && !keyNames[id] ? 'Token Plan' : '按量计费',
  }));
  const dateRecords = (volume, day, rangeOffset) => {
    const date = shanghaiDate(new Date(now-(dailyInputs.length-1-day+rangeOffset)*DAY));
    return members.map(({id,name,model,index}, memberIndex) => {
      const failed = day===2 && index===1;
      const input = failed ? 0 : Math.round((volume+index*380)*(rangeOffset ? .85 : 1));
      const output = failed ? 0 : Math.round(input*(.24+index*.04));
      const billing = keys[memberIndex].billing;
      return {
        id:`req-${project.id}-${id}-${date}`, date, createdAt:`${date}T${String(9+(day+index)%11).padStart(2,'0')}:30:00+08:00`,
        model, user:name, projectId:project.id, keyId:keys[memberIndex].id, input, output, billing, source:'API 调用',
        cost:Number(((input*2+output*6)/1_000_000).toFixed(4)), status:failed ? '失败' : '成功',
      };
    });
  };
  const records = dailyInputs.flatMap((volume,day) => dateRecords(volume,day,0));
  const previousRecords = dailyInputs.flatMap((volume,day) => dateRecords(volume,day,7));
  const plans = selected.plans.map(([name,used,total,expiry],index) => ({
    id:`plan-${project.id}-${index+1}`, name, used, total, models:[...planModels],
    expiresAt:expiry || shanghaiDate(new Date(now+(42+index*24)*DAY)),
  }));

  return {
    actor, actorId, role, personal, canOrder:personal||canManageTenant, canManageProject, canManageTenant, canConfigureProject,
    projects, project, records, previousRecords, keys, plans, people,
  };
}
