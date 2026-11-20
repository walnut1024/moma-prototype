import { customerProject, personalDefaultProject } from '../personal-project.mjs';
import { useState } from 'react';
import { internalSpace } from '../operating-space.mjs';
import { Banner, Button, Input, Space, Spin, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { maskApiKey } from '../api-key-utils.mjs';
import { DEFAULT_PAGE_SIZE, FilterToolbar, PAGE_SIZES } from '../components/FilterControls';
import { projectModelEnabled, projectRole } from '../project-access.mjs';
import { projectSpend } from '../project-call.mjs';
import { activeProjectSpendBudget, millionTokens, PROJECT_BUDGET_PERIODS } from '../project-token-budget.mjs';
import { EnterpriseDialog, EnterpriseFacts, EnterpriseStatus, EnterpriseTable } from './EnterpriseUI';
import { Choice } from './ServiceUI';
import { customerKeys, customerModelIds, keyProjectAccess, yuanMicros } from './customer-projects.mjs';
import { enterpriseProjectDepartment } from './enterprise-members';
import { canAccessPage } from './navigation.mjs';
import { adminProjectHref } from './access-control.mjs';
import { useTenantData } from '../useTenantData';
import { ProjectCreateDialog } from '../components/ProjectConfiguration';
import AdminActionMenu from './AdminActionMenu';

const { Text, Title } = Typography;
const time = value => Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未记录';
const quantity = (amount, unit) => Number.isFinite(amount) ? amount.toLocaleString('zh-CN') + ' ' + unit : '—';
const budget = project => Object.hasOwn(project,'tokenBudget')
  ? project.tokenBudget?.limit ? millionTokens(project.tokenBudget.limit) + ' 百万 Tokens' : '不限'
  : project.spendBudget ? yuanMicros(project.spendBudget.amountMicros)
  : project.budget > 0 ? quantity(project.budget, 'Token') : '未配置';
const owner = (state, project) => state.users.find(row => row.id === project.ownerId)?.name || project.ownerId || '未记录';
const projectRows = (state, tenant) => state.projects.filter(row => row.tenantId === tenant.id).map(row => {
  try { return customerProject(state,row) || row; } catch { return row; }
});
const links = [
  ['customer-usage-detail', '项目用量', 'customer'],
  ['logs', '调用日志', 'tenant'],
  ['audit-logs', '审计日志', 'tenant'],
];

export function CustomerProjectKeys({ state, tenant, projectId = '', onProjectChange }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [inspectId, setInspectId] = useState(null);
  const projects = projectRows(state, tenant);
  let scopeError='';
  if (tenant.type === '个人') {
    try {
      const fixed=personalDefaultProject(state,tenant.id);
      if(projectId && projectId !== fixed.id) throw Error('项目不存在或不属于当前客户。');
      projectId=fixed.id;
    } catch(error) { scopeError=error.message; }
  }
  const byProject = new Map(projects.map(project => [project.id, project]));
  const keys = customerKeys(state, tenant.id);
  const allowedModels = customerModelIds(state, tenant.id);
  const byModel = new Map(state.models.map(model => [model.id, model.name]));
  const rows = keys.filter(key => (!projectId || key.projectId === projectId) &&
    `${key.name} ${key.keyId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const current = Math.max(1, Math.min(page, Math.ceil(rows.length / size) || 1));
  const inspect = keys.find(key => key.id === inspectId);
  const access = key => keyProjectAccess(tenant, byProject.get(key.projectId), key, allowedModels);
  const inspectedAccess = inspect && access(inspect);
  const keyGrant = inspect && state.grants.find(row => row.subjectType === 'key' && row.subjectId === inspect.id && row.status === '生效中');
  const modelNames = ids => (ids || []).map(id => byModel.get(id) || id).join('、') || '无';
  const columns = ['API 密钥名称 / ID', 'API 密钥', ...(onProjectChange ? ['所属项目'] : []),
    '可用模型范围', 'API 密钥状态', '有效期', '操作'];
  if (scopeError) return <Banner type="warning" closeIcon={null} description={scopeError}/>;
  return <>
    <Title heading={5} component="h2">API 密钥</Title>
    <FilterToolbar>
      <Input className="admin-list-search" aria-label="搜索 API 密钥" placeholder="API 密钥名称或完整 ID" showClear
        prefix={<IconSearch aria-hidden="true"/>} value={query} onChange={value => { setQuery(value); setPage(1); }}/>
      {onProjectChange && <Choice label="所属项目" value={projectId} options={[[ '', '全部项目' ],
        ...projects.map(project => [project.id, project.name]),
        ...(projectId && !byProject.has(projectId) ? [[projectId, '项目归属异常']] : [])]}
        onChange={value => { onProjectChange(value); setInspectId(null); setPage(1); }}/>}
    </FilterToolbar>
    {projectId && !byProject.has(projectId) ? <Banner type="warning" closeIcon={null} description="项目不存在或不属于当前客户。"/>
      : <EnterpriseTable minWidth={880} columns={columns} empty="暂无匹配的 API 密钥"
        rows={rows.slice((current - 1) * size, current * size).map(key => {
          const { models, reason } = access(key);
          return { id:key.id, cells:[
            <div className="admin-table-record"><Text>{key.name}</Text><Text type="secondary" size="small">{key.keyId}</Text></div>,
            maskApiKey(key.secretPreview), ...(onProjectChange ? [byProject.get(key.projectId)?.name || '归属异常'] : []),
            reason ? '不可用' : models.length + ' 个',
            <EnterpriseStatus value={key.status}/>, key.expiresAt ? time(key.expiresAt) : '长期有效',
            <Button size="small" theme="borderless" aria-label={'查看 '+key.name+' 密钥详情'} onClick={()=>setInspectId(key.id)}>详情</Button>,
          ] };
        })}
        pagination={{ currentPage:current, pageSize:size, total:rows.length, pageSizeOpts:PAGE_SIZES, showTotal:true, showSizeChanger:true,
          onPageChange:setPage, onPageSizeChange:value => { setSize(value); setPage(1); } }}/>}
    {inspect && <EnterpriseDialog title="API 密钥详情" description={inspect.name} close={() => setInspectId(null)}
      footer={<Button onClick={() => setInspectId(null)}>关闭</Button>}>
      <EnterpriseFacts rows={[
        ['API 密钥 ID', inspect.keyId], ['所属项目', byProject.get(inspect.projectId)?.name || '归属异常'],
        ['API 密钥状态', <EnterpriseStatus value={inspect.status}/>], ['有效期', inspect.expiresAt ? time(inspect.expiresAt) : '长期有效'],
        ['Key 配置模型', modelNames(inspect.modelIds)], ['可用模型范围', inspectedAccess.reason ? '无' : modelNames(inspectedAccess.models)],
        ['调用条件', inspectedAccess.reason || '受额度、限流、订购及网关规则约束'],
        ['计费方式', inspect.billingType || '未记录'], ['消费预算', inspect.budgetMicros == null ? '未配置' : yuanMicros(inspect.budgetMicros)],
        ['套餐抵扣预算', quantity(inspect.planBudgetTokens, 'Token')], ['Key QPM', quantity(inspect.qpmLimit, '次/分钟')],
        ['Key TPM', quantity(inspect.tpmLimit, 'Token/分钟')],
        ...(keyGrant ? [['Key 配置额度', quantity(keyGrant.limit, 'Token')], ['Key 额度已用', quantity(keyGrant.used, 'Token')]] : []),
        ...(inspect.ipAllowlist?.length ? [['IP 白名单配置', inspect.ipAllowlist.join('、')]] : []),
        ['最近调用', time(inspect.lastUsedAt)],
      ]}/>
    </EnterpriseDialog>}
  </>;
}

export function EnterpriseProjectTable({ state, tenant, projects, onProject, onKeys, pagination, empty = "该客户尚无项目" }) {
  const available = customerModelIds(state,tenant.id);
  const keyCounts = new Map();
  for (const key of customerKeys(state, tenant.id)) keyCounts.set(key.projectId, (keyCounts.get(key.projectId) || 0) + 1);
  return <EnterpriseTable pagination={pagination} minWidth={990} columns={['项目名称 / ID', '所属部门', '负责人',
    '项目预算', '可用模型数', 'API 密钥', '创建人', '创建时间', '状态']} empty={empty}
    rows={projects.map(project => {
      const keyCount = keyCounts.get(project.id) || 0;
      return {id:project.id,cells:[
        <div className="admin-table-record"><Button size="small" theme="borderless" onClick={()=>onProject(project.id)}>
          {project.name}</Button><Text size="small" type="secondary">{project.id}</Text></div>,
        enterpriseProjectDepartment(state,project), owner(state,project), budget(project),
        project.status==='正常' ? [...available].filter(modelId=>projectModelEnabled(project,modelId)).length : 0,
        keyCount ? <Button size="small" theme="borderless" aria-label={'查看 '+project.name+' 的 API 密钥'}
          onClick={()=>onKeys(project.id)}>{keyCount} 个</Button> : '0 个',
        project.createdBy || '未记录', time(project.createdAt), <EnterpriseStatus value={project.status}/>,
      ]};
    })}/>;
}

function TenantProjectCreate({ tenantId, onClose, onCreated }) {
  const tenant = useTenantData({adminTenantId:tenantId});
  if (tenant.identity && tenant.canCreateProject) return <ProjectCreateDialog tenant={tenant} onClose={onClose} onCreated={onCreated}/>;
  return <EnterpriseDialog title="新建项目" close={onClose} footer={<Button onClick={onClose}>取消</Button>}>
    {tenant.error || tenant.identity
      ? <Banner type="warning" closeIcon={null} description={tenant.error || '当前租户不可新建项目'}/>
      : <Spin spinning aria-label="正在加载租户项目配置"/>}
  </EnterpriseDialog>;
}

export default function CustomerProjectDetails({ state, tenant, projectId, navigate, manageProjects, createProjects, reload }) {
  const [creating,setCreating] = useState(false);
  const projects = projectRows(state, tenant);
  const enterprise = tenant.type !== '个人';
  if (!enterprise) {
    try {
      const fixed = personalDefaultProject(state,tenant.id);
      if (projectId && projectId !== fixed.id) return <Banner type="warning" closeIcon={null} description="项目不存在或不属于当前客户。"/>;
      projectId = fixed.id;
    } catch (error) { return <Banner type="warning" closeIcon={null} description={error.message}/>; }
  }
  if (!projectId) {
    return <>
      <div className="admin-page-heading">
        <Title heading={5} component="h2">项目列表</Title>
        {createProjects && <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} onClick={()=>setCreating(true)}>新建项目</Button>}
      </div>
      <EnterpriseProjectTable state={state} tenant={tenant} projects={projects}
        onProject={project => navigate({ project })} onKeys={project => navigate({ tab:'keys', project })}/>
      {creating && <TenantProjectCreate tenantId={tenant.id} onClose={()=>setCreating(false)}
        onCreated={()=>{
          setCreating(false);
          Toast.success('项目已创建');
          void reload();
        }}/>}
    </>;
  }
  const project = projects.find(row => row.id === projectId);
  if (!project) return <>
    <Button onClick={() => navigate({ project:'' })}>返回项目列表</Button>
    <Banner type="warning" closeIcon={null} description="项目不存在或不属于当前客户。"/>
  </>;
  const allowedModels = customerModelIds(state, tenant.id);
  const models = new Map(state.models.map(model => [model.id, model.name]));
  const permissions = project.inheritsSpaceModels ? [...allowedModels].map(modelId =>
    project.modelPermissions?.find(row => row.modelId === modelId) || {modelId})
    : project.modelPermissions ?? [...allowedModels].map(modelId => ({ modelId }));
  const internal=internalSpace(state.spacePolicy,tenant);
  const records = links.filter(([page])=>canAccessPage(state.currentRole,page)).map(([page,label,tenantParam])=>{
    const params = new URLSearchParams({
      [tenantParam]:tenant.id, project:project.id,
      ...(page==='customer-usage-detail' && {period:'today',...(internal && {scope:'organization'})}),
      ...(page==='logs' && {view:'requests'}),
    });
    return {node:'item',key:page,name:internal && page==='customer-usage-detail' ? '项目成本归集' : label,
      onClick:()=>window.open('#/admin-2/'+page+'?'+params,'_blank','noopener')};
  });
  const spendBudget = activeProjectSpendBudget(project);
  const spend = spendBudget && projectSpend(state, project, null, Date.now(), internal);
  const members = enterprise ? state.memberships.flatMap(member => {
    const role = projectRole(project, { ...member, status:'正常' });
    if (!role) return [];
    const user = state.users.find(row => row.id === member.userId);
    return [{ id:member.id, cells:[member.memberName || user?.name || member.name || member.userId, role,
      <EnterpriseStatus value={member.status}/>, user ? <EnterpriseStatus value={user.status}/> : '身份不存在'] }];
  }) : [];
  return <>
    <div className="admin-page-heading">
      <Space wrap>
        <Title heading={5} component="h2">{project.name}</Title>
        <EnterpriseStatus value={project.status}/>
      </Space>
      <Space wrap>
        {enterprise && <Button theme="borderless" type="tertiary" onClick={()=>navigate({project:''})}>返回项目列表</Button>}
        {records.length>0 && <AdminActionMenu label="查看项目记录" items={records}>查看记录</AdminActionMenu>}
        {manageProjects && project.status!=='已删除' && <Button onClick={()=>
          window.open(adminProjectHref({tenant:tenant.id,project:project.id}),'_blank','noopener')}>配置项目</Button>}
      </Space>
    </div>
    <EnterpriseFacts rows={[
      ['项目 ID', project.id], ['项目说明', project.description || '—'], ['负责人', owner(state, project)],
      ...(enterprise ? [['所属部门', enterpriseProjectDepartment(state, project)]] : []),
      ['创建人', project.createdBy || '未记录'], ['创建时间', time(project.createdAt)],
      ['最近更新', time(project.updatedAt)], ['项目预算', budget(project)],
      ...(project.tokenBudget ? [
        ['预算周期', PROJECT_BUDGET_PERIODS[project.tokenBudget.period]],
        ['项目 TPM', quantity(project.tokenBudget.tpm, 'Tokens/分钟')],
        ['项目 RPM', quantity(project.tokenBudget.rpm, '次/分钟')],
        ['每日批处理 Token 限额', project.tokenBudget.dailyBatchLimit == null ? '—'
          : millionTokens(project.tokenBudget.dailyBatchLimit) + ' 百万 Tokens'],
      ] : []),
      ...(spend ? [[internal ? '累计内部成本' : '累计已核算费用', yuanMicros(spend.spent)],
        ...(spend.unpriced ? [['未核算调用', quantity(spend.unpriced, '次')]] : []),
        ['预警阈值', quantity(spendBudget.warnAt, '%')],
        ['达到上限后', spendBudget.stop ? '停止按量调用' : '继续调用']] : []),
      ['输入输出留存', project.retainContent ? '已开启' : '仅保存元数据'],
    ]}/>
    {enterprise && <>
      <Title heading={5} component="h2">项目成员</Title>
      <EnterpriseTable columns={['成员', '项目角色', '企业成员状态', '登录身份状态']} rows={members} empty="暂无明确分配的项目成员"/>
    </>}
    <Title heading={5} component="h2">模型权限与限流</Title>
    {(project.inheritsSpaceModels || project.modelPermissions == null) && <Text type="secondary">继承客户模型授权</Text>}
    <EnterpriseTable columns={['模型', '项目 RPM', '项目 TPM', '授权状态']} empty="暂无已开通的模型"
      rows={permissions.map(({ modelId, rpm, tpm }) => ({ id:modelId, cells:[models.get(modelId) || modelId,
        quantity(rpm, '次/分钟'), quantity(tpm, 'Token/分钟'), project.status !== '正常' ? '项目当前不可用'
          : allowedModels.has(modelId) ? '已开通' : '空间订购、授权或服务状态受限',
      ] }))}/>
    <CustomerProjectKeys key={project.id} state={state} tenant={tenant} projectId={project.id}/>
  </>;
}
