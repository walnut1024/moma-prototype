import { useChannelText } from './channel-language';
import { useRef, useState } from 'react';
import { internalSpace } from '../operating-space.mjs';
import { Banner, Button, Card, Input, Space, Tabs, Toast, Typography } from '@douyinfe/semi-ui';
import { IconArrowLeft, IconSearch } from '@douyinfe/semi-icons';
import { maskApiKey } from '../api-key-utils.mjs';
import { DEFAULT_PAGE_SIZE, FilterToolbar, PAGE_SIZES } from '../components/FilterControls';
import { PROJECT_ADMIN, projectModelEnabled, projectRole, projectRoleLabel } from '../project-access.mjs';
import { projectSpend } from '../project-call.mjs';
import { activeProjectSpendBudget, millionTokens, PROJECT_BUDGET_PERIODS } from '../project-token-budget.mjs';
import { EnterpriseDialog, EnterpriseFacts, EnterpriseStatus, EnterpriseTable } from './EnterpriseUI';
import { Choice, CopyId } from './ServiceUI';
import { customerKeys, customerModelIds, keyProjectAccess, yuanMicros } from './customer-projects.mjs';
import { enterpriseProjectDepartment } from './enterprise-members';
import { canAccessPage } from './navigation.mjs';
import { tenantHref } from './access-control.mjs';
import { useTenantData } from '../useTenantData';
import { ProjectLifecycleDialog, ProjectMembers, ProjectModels, ProjectSettings, ProjectTokenBudget, projectLifecycle } from '../components/ProjectConfiguration';
import AdminPageHeading from './AdminPageHeading';
import '../components/project-workspace.css';

const { Text, Title } = Typography;
const time = value => Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未记录';
const quantity = (amount, unit) => Number.isFinite(amount) ? amount.toLocaleString('zh-CN') + ' ' + unit : '—';
const budget = project => Object.hasOwn(project,'tokenBudget')
  ? project.tokenBudget?.limit ? millionTokens(project.tokenBudget.limit) + ' 百万 Tokens' : '不限'
  : project.spendBudget ? yuanMicros(project.spendBudget.amountMicros)
  : project.budget > 0 ? quantity(project.budget, 'Token') : '未配置';
const owner = (state, project) => state.users.find(row => row.id === project.ownerId)?.name || project.ownerId || '未记录';
const links = [
  ['customer-usage-detail', '项目用量', 'customer'],
  ['logs', '调用日志', 'tenant'],
  ['audit-logs', '审计日志', 'tenant'],
];
const projectViews = { overview:'项目概览', members:'项目成员', limits:'预算与限流', keys:'API 密钥' };

function CustomerProjectKeys({ state, tenant, project }) {
  const translateLabel = useChannelText();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [inspectId, setInspectId] = useState(null);
  const keys = customerKeys(state, tenant.id).filter(key=>key.projectId===project.id);
  const allowedModels = customerModelIds(state, tenant.id);
  const byModel = new Map(state.models.map(model => [model.id, model.name]));
  const rows = keys.filter(key => `${key.name} ${key.keyId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const current = Math.max(1, Math.min(page, Math.ceil(rows.length / size) || 1));
  const inspect = keys.find(key => key.id === inspectId);
  const access = key => keyProjectAccess(tenant, project, key, allowedModels);
  const inspectedAccess = inspect && access(inspect);
  const keyGrant = inspect && state.grants.find(row => row.subjectType === 'key' && row.subjectId === inspect.id && row.status === '生效中');
  const modelNames = ids => (ids || []).map(id => byModel.get(id) || id).join('、') || '无';
  const columns = ['API 密钥名称 / ID', 'API 密钥',
    '可用模型范围', 'API 密钥状态', '有效期', '操作'];
  return <>
    <FilterToolbar>
      <Input className="admin-list-search" aria-label="搜索 API 密钥" placeholder="API 密钥名称或完整 ID" showClear
        prefix={<IconSearch aria-hidden="true"/>} value={query} onChange={value => { setQuery(value); setPage(1); }}/>
    </FilterToolbar>
    <EnterpriseTable minWidth={760} columns={columns} empty="暂无匹配的 API 密钥"
        rows={rows.slice((current - 1) * size, current * size).map(key => {
          const { models, reason } = access(key);
          return { id:key.id, cells:[
            <div className="admin-table-record"><Text>{key.name}</Text><Text type="secondary" size="small">{key.keyId}</Text></div>,
            maskApiKey(key.secretPreview),
            reason ? '不可用' : models.length + ' 个',
            <EnterpriseStatus value={key.status}/>, key.expiresAt ? time(key.expiresAt) : '长期有效',
            <Button size="small" theme="borderless" aria-label={'查看 '+key.name+' 密钥详情'} onClick={()=>setInspectId(key.id)}>{translateLabel("详情")}</Button>,
          ] };
        })}
        pagination={{ currentPage:current, pageSize:size, total:rows.length, pageSizeOpts:PAGE_SIZES, showTotal:true, showSizeChanger:true,
          onPageChange:setPage, onPageSizeChange:value => { setSize(value); setPage(1); } }}/>
    {inspect && <EnterpriseDialog title="API 密钥详情" description={inspect.name} close={() => setInspectId(null)}
      footer={<Button onClick={() => setInspectId(null)}>{translateLabel("关闭")}</Button>}>
      <EnterpriseFacts rows={[
        ['API 密钥 ID', inspect.keyId], ['所属项目', project.name],
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

export function AdminProjectTable({ state, tenants, projects, onProject, pagination, empty }) {
  const available = new Map();
  const byTenant = new Map(tenants.map(tenant=>[tenant.id,tenant]));
  const keyCounts = new Map();
  for (const key of customerKeys(state)) {
    const keyScope = key.tenantId + '/' + key.projectId;
    keyCounts.set(keyScope, (keyCounts.get(keyScope) || 0) + 1);
  }
  return <EnterpriseTable pagination={pagination} minWidth={1160} columns={[
    {title:'项目名称 / ID',width:210}, {title:'所属租户',width:124}, {title:'所属部门',width:144}, {title:'负责人',width:92},
    {title:'项目预算',width:102}, {title:'可用模型数',width:96}, {title:'API 密钥',width:88},
    {title:'创建人',width:85}, {title:'创建时间',width:158}, {title:'状态',width:82},
  ]} empty={empty}
    rows={projects.map(project => {
      const tenant = byTenant.get(project.tenantId);
      const keyCount = keyCounts.get(project.tenantId + '/' + project.id) || 0;
      if (!available.has(project.tenantId)) available.set(project.tenantId, customerModelIds(state,project.tenantId));
      return {id:project.id,cells:[
        <div className="admin-table-record"><Button size="small" theme="borderless" onClick={()=>onProject(project)}>
          {project.name}</Button><Text size="small" type="secondary">{project.id}</Text></div>,
        tenant.name,
        tenant.type==='个人' ? '—' : enterpriseProjectDepartment(state,project), owner(state,project), budget(project),
        project.status==='正常' ? [...available.get(project.tenantId)].filter(modelId=>projectModelEnabled(project,modelId)).length : 0,
        keyCount ? <Button size="small" theme="borderless" aria-label={'查看 '+project.name+' 的 API 密钥'}
          onClick={()=>onProject(project,'keys')}>{keyCount} 个</Button> : '0 个',
        project.createdBy || '未记录', time(project.createdAt), <EnterpriseStatus value={project.status}/>,
      ]};
    })}/>;
}

function ProjectAdministratorDialog({ tenant, project, close, onSaved }) {
  const t = useChannelText();
  const [selection, setSelection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const accounts = new Map(tenant.organization.members.map(row=>[row.id,row.account]));
  const choices = (tenant.projectMembers[project.id] || []).filter(row=>row.role!==PROJECT_ADMIN)
    .map(row=>[row.id,[row.name,accounts.get(row.id)].filter(Boolean).join(' · ')]);
  const selected = choices.some(([id])=>id===selection?.memberId);
  const dismiss = () => { if (!saving) close(); };
  async function save() {
    if (saving || !selected) return;
    setSaving(true);
    setError('');
    try {
      const { memberId, ...options } = selection;
      await tenant.updateProject(project.id,'members',{memberId,role:PROJECT_ADMIN},options);
    } catch (issue) {
      setError(issue.message);
      setSaving(false);
      return;
    }
    onSaved();
  }

  return <EnterpriseDialog title={t('指定项目管理员')} description={project.name} close={dismiss} closeOnEsc={!saving}
    footer={<>
      <Button onClick={dismiss} disabled={saving}>{t('取消')}</Button>
      {!!choices.length && <Button theme="solid" onClick={()=>void save()} loading={saving} disabled={!selected}>{t('确认指定')}</Button>}
    </>}>
    {choices.length ? <Choice label="选择企业成员" placeholder={t('选择企业成员')} filter showClear disabled={saving}
      options={choices} value={selection?.memberId} onChange={memberId=>{
        setSelection(memberId ? {memberId,expectedRevision:tenant.revision,identityKey:tenant.identity.key} : null);
        setError('');
      }}/> : <Text type="secondary">{t('暂无可指定的企业成员')}</Text>}
    {error && <Banner type="danger" closeIcon={null} description={error}/>}
  </EnterpriseDialog>;
}

export default function CustomerProjectDetails({ state, tenant, project, tab, onTabChange, back, canWrite, reload, dirtyRef }) {
  const translateLabel = useChannelText();
  const [assigning,setAssigning] = useState(false);
  const [lifecycle,setLifecycle] = useState('');
  const assignTrigger = useRef(null);
  const enterprise = tenant.type !== '个人';
  const canConfigure = canWrite && ['正常','需关注'].includes(tenant.status) && project.status!=='已删除';
  const workspace = useTenantData({adminTenantId:tenant.id,enabled:canConfigure});
  const current = canConfigure && workspace.projects.find(row=>row.id===project.id && row.canManage && row.status!=='已删除');
  const editor = {
    ...workspace,
    updateProject:async (...args)=>{
      const result = await workspace.updateProject(...args);
      void reload();
      return result;
    },
  };
  const canAssign = enterprise && current;
  const closeAssignment = () => {
    setAssigning(false);
    requestAnimationFrame(()=>assignTrigger.current?.focus({preventScroll:true}));
  };
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
    return <Button key={page} onClick={() => window.open('#/admin-2/'+page+'?'+params,'_blank','noopener')}>
      {translateLabel(internal && page==='customer-usage-detail' ? '项目成本归集' : label)}
    </Button>;
  });
  const spendBudget = activeProjectSpendBudget(project);
  const spend = spendBudget && projectSpend(state, project, null, Date.now(), internal);
  const members = enterprise ? state.memberships.flatMap(member => {
    const role = projectRole(project, { ...member, status:'正常' });
    if (!role) return [];
    const user = state.users.find(row => row.id === member.userId);
    return [{ id:member.id, name:member.memberName || user?.name || member.name || member.userId, role,
      inactive:member.status!=='正常' || user?.status!=='正常',
      memberStatus:<EnterpriseStatus value={member.status}/>, loginStatus:user ? <EnterpriseStatus value={user.status}/> : '身份不存在' }];
  }) : [];
  const overview = <div className="admin-tenant-project-facts">
    <EnterpriseFacts rows={[
      ['项目说明', project.description || '—'], ['负责人', owner(state, project)],
      ...(enterprise ? [['所属部门', enterpriseProjectDepartment(state, project)]] : []),
      ['输入输出留存', project.retainContent ? '已开启' : '仅保存元数据'],
    ]}/>
    <EnterpriseFacts rows={[
      ['项目 ID', <CopyId value={project.id} label="项目 ID" copyAtStart/>],
      ['创建人', project.createdBy || '未记录'], ['创建时间', time(project.createdAt)], ['最近更新', time(project.updatedAt)],
    ]}/>
  </div>;
  const limits = <div className="admin-analytics-fields">
    <EnterpriseFacts rows={[
      ['项目预算', budget(project)],
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
    ]}/>
    <Title heading={6} component="h3">{translateLabel('模型权限与限流')}</Title>
    {(project.inheritsSpaceModels || project.modelPermissions == null) && <Text type="secondary">继承租户模型授权</Text>}
    <EnterpriseTable columns={['模型', '项目 RPM', '项目 TPM', '授权状态']} empty="暂无已授权的模型"
      rows={permissions.map(({ modelId, rpm, tpm }) => ({ id:modelId, cells:[models.get(modelId) || modelId,
        quantity(rpm, '次/分钟'), quantity(tpm, 'Token/分钟'), project.status !== '正常' ? '项目当前不可用'
          : allowedModels.has(modelId) ? '已授权' : '空间订购、授权或服务状态受限',
      ] }))}/>
  </div>;
  const selectedTab = Object.hasOwn(projectViews,tab) && (enterprise || tab!=='members') ? tab : 'overview';
  const lifecycleActions = current && workspace.canCreateProject ? current.status==='停用' ? ['start','delete'] : ['delete'] : [];
  return <div className="admin-page-stack">
    <div>
      <Button theme="borderless" type="tertiary" icon={<IconArrowLeft aria-hidden="true"/>} onClick={back}>{translateLabel('返回项目列表')}</Button>
    </div>
    <AdminPageHeading title={project.name} description={<Text link={{href:tenantHref(tenant)}}>{tenant.name}</Text>}>
      <Space wrap>
        <EnterpriseStatus value={project.status}/>
        {records}
      </Space>
    </AdminPageHeading>
    {canConfigure && workspace.error && <Banner type="warning" closeIcon={null} description={<>
      {workspace.error} <Button onClick={workspace.reload}>{translateLabel('重试')}</Button>
    </>}/>}
    <Card>
      <Tabs className="admin-tenant-project-tabs" tabPaneMotion={false} keepDOM={false}
        aria-label={translateLabel('项目详情')} activeKey={selectedTab} onChange={onTabChange}>
      <Tabs.TabPane itemKey="overview" tab={translateLabel(projectViews.overview)}>
        {current && enterprise && <div className="admin-tenant-project-actions">
          <ProjectSettings tenant={editor} project={current} mode="details"/>
          {lifecycleActions.map(intent=><Button key={intent} type={intent==='delete' ? 'danger' : 'primary'}
            onClick={()=>setLifecycle(intent)}>{translateLabel(projectLifecycle[intent].label)}</Button>)}
        </div>}
        {overview}
      </Tabs.TabPane>
      {enterprise && <Tabs.TabPane itemKey="members" tab={translateLabel(projectViews.members)}>
        <div className="admin-analytics-fields">
          {canAssign && <div className="admin-tenant-project-actions">
            <Button theme="solid" onClick={event=>{
              assignTrigger.current=event.currentTarget;
              setAssigning(true);
            }}>{translateLabel('指定项目管理员')}</Button>
          </div>}
          {current ? <ProjectMembers tenant={editor} project={current} adminMembers={members}/>
            : <EnterpriseTable columns={['成员', '项目角色', '企业成员状态', '登录身份状态']} empty="暂无明确分配的项目成员"
              rows={members.map(row=>({id:row.id,cells:[row.name,translateLabel(projectRoleLabel(row.role)),row.memberStatus,row.loginStatus]}))}/>}
        </div>
      </Tabs.TabPane>}
      <Tabs.TabPane itemKey="limits" tab={translateLabel(projectViews.limits)}>
        {current ? <div className="admin-analytics-fields">
          {enterprise ? <ProjectTokenBudget tenant={editor} project={current}/>
            : <ProjectSettings tenant={editor} project={current} showAudit={false}/>}
          <Title heading={6} component="h3">{translateLabel('模型权限与限流')}</Title>
          <ProjectModels tenant={editor} project={current} dirtyRef={dirtyRef}/>
        </div> : limits}
      </Tabs.TabPane>
      <Tabs.TabPane itemKey="keys" tab={translateLabel(projectViews.keys)}>
        <div className="admin-analytics-fields"><CustomerProjectKeys state={state} tenant={tenant} project={project}/></div>
      </Tabs.TabPane>
      </Tabs>
    </Card>
    {canAssign && assigning && <ProjectAdministratorDialog tenant={editor} project={current} close={closeAssignment}
      onSaved={()=>{
        closeAssignment();
        Toast.success(translateLabel('项目管理员已指定'));
      }}/>}
    {current && lifecycle && <ProjectLifecycleDialog tenant={editor} project={current} intent={lifecycle}
      onClose={()=>setLifecycle('')} onDone={()=>setLifecycle('')}/>}
  </div>;
}
