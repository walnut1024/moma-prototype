import { customerProject, personalDefaultProject } from '../personal-project.mjs';
import { useState } from 'react';
import { internalSpace } from '../operating-space.mjs';
import { Banner, Button, Input, Space, Typography } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { maskApiKey } from '../api-key-utils.mjs';
import { DEFAULT_PAGE_SIZE, FilterToolbar, PAGE_SIZES } from '../components/FilterControls';
import { projectRole } from '../project-access.mjs';
import { projectSpend } from '../project-call.mjs';
import { EnterpriseDialog, EnterpriseFacts, EnterpriseStatus, EnterpriseTable } from './EnterpriseUI';
import { Choice } from './ServiceUI';
import { customerKeys, customerModelIds, keyProjectAccess, yuanMicros } from './customer-projects.mjs';
import { enterpriseProjectDepartment } from './enterprise-members';
import { canAccessPage } from './navigation.mjs';

const { Text, Title } = Typography;
const time = value => Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未记录';
const quantity = (amount, unit) => Number.isFinite(amount) ? amount.toLocaleString('zh-CN') + ' ' + unit : '—';
const budget = project => project.spendBudget ? yuanMicros(project.spendBudget.amountMicros)
  : project.budget > 0 ? quantity(project.budget, 'Token') : '未配置';
const owner = (state, project) => state.users.find(row => row.id === project.ownerId)?.name || project.ownerId || '未记录';
const projectRows = (state, tenant) => state.projects.filter(row => row.tenantId === tenant.id).map(row => {
  try { return customerProject(state,row) || row; } catch { return row; }
});
const links = [
  ['customer-usage-detail', '项目用量', 'customer'],
  ['logs', '调用日志', 'tenant'],
  ['audit-logs', '审计日志', 'tenant'],
  ['bills', '客户账单', 'tenant'],
];

export function CustomerProjectKeys({ state, tenant, projectId = '', onProjectChange, askKey, canWrite }) {
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
            <Button size="small" theme="borderless" onClick={() => setInspectId(key.id)}>{reason ? '不可用' : models.length + ' 个'}</Button>,
            <EnterpriseStatus value={key.status}/>, key.expiresAt ? time(key.expiresAt) : '长期有效',
            <Space spacing={4}>
              <Button size="small" theme="borderless" onClick={() => setInspectId(key.id)}>详情</Button>
              {askKey && ['有效', '停用'].includes(key.status) && <Button size="small" theme="borderless"
                disabled={!canWrite || (tenant.status === '停用' && key.status === '停用')}
                onClick={() => askKey(key)}>{key.status === '停用' ? '启用' : '停用'}</Button>}
            </Space>,
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

export default function CustomerProjectDetails({ state, tenant, projectId, navigate, askKey, canWrite }) {
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
    const keyCounts = new Map();
    for (const key of customerKeys(state, tenant.id)) keyCounts.set(key.projectId, (keyCounts.get(key.projectId) || 0) + 1);
    return <>
      <Title heading={5} component="h2">项目管理</Title>
      <EnterpriseTable minWidth={850} columns={['项目名称 / ID', ...(enterprise ? ['所属部门', '负责人'] : []),
        '项目预算', 'API 密钥', '创建时间', '状态']} empty="该客户尚无项目"
        rows={projects.map(project => ({ id:project.id, cells:[
          <div className="admin-table-record"><Button size="small" theme="borderless" onClick={() => navigate({ project:project.id })}>
            {project.name}</Button><Text size="small" type="secondary">{project.id}</Text></div>,
          ...(enterprise ? [enterpriseProjectDepartment(state, project), owner(state, project)] : []), budget(project),
          <Button size="small" theme="borderless" onClick={() => navigate({ tab:'keys', project:project.id })}>{keyCounts.get(project.id) || 0} 个</Button>,
          time(project.createdAt), <EnterpriseStatus value={project.status}/>,
        ] }))}/>
    </>;
  }
  const project = projects.find(row => row.id === projectId);
  if (!project) return <>
    <Button onClick={() => navigate({ project:'' })}>返回项目空间</Button>
    <Banner type="warning" closeIcon={null} description="项目不存在或不属于当前客户。"/>
  </>;
  const allowedModels = customerModelIds(state, tenant.id);
  const models = new Map(state.models.map(model => [model.id, model.name]));
  const permissions = project.inheritsSpaceModels ? [...allowedModels].map(modelId =>
    project.modelPermissions?.find(row => row.modelId === modelId) || {modelId})
    : project.modelPermissions ?? [...allowedModels].map(modelId => ({ modelId }));
  const internal=internalSpace(state.spacePolicy,tenant);
  const spend = project.spendBudget && projectSpend(state, project, null, Date.now(), internal);
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
      {enterprise && <Button onClick={() => navigate({ project:'' })}>返回项目管理</Button>}
    </div>
    <Space wrap>{links.filter(([page]) => canAccessPage(state.currentRole, page) && (!internal || page!=='bills')).map(([page, label, tenantParam]) =>
      <a key={page} href={'#/admin-2/' + page + '?' + new URLSearchParams({ [tenantParam]:tenant.id, project:project.id, ...(page==='customer-usage-detail' && {period:'today'}) })}>{internal && page==='customer-usage-detail' ? '项目成本归集' : label}</a>)}</Space>
    <EnterpriseFacts rows={[
      ['项目 ID', project.id], ['项目说明', project.description || '—'], ['负责人', owner(state, project)],
      ...(enterprise ? [['所属部门', enterpriseProjectDepartment(state, project)]] : []),
      ['创建时间', time(project.createdAt)], ['最近更新', time(project.updatedAt)], ['项目预算', budget(project)],
      ...(spend ? [[internal ? '累计内部成本' : '累计已核算费用', yuanMicros(spend.spent)],
        ...(spend.unpriced ? [['未核算调用', quantity(spend.unpriced, '次')]] : []),
        ['预警阈值', quantity(project.spendBudget.warnAt, '%')],
        ['达到上限后', project.spendBudget.stop ? '停止按量调用' : '继续调用']] : []),
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
    <CustomerProjectKeys key={project.id} state={state} tenant={tenant} projectId={project.id} askKey={askKey} canWrite={canWrite}/>
  </>;
}
