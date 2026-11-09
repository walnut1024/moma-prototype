import { useState } from 'react';
import { Banner, Button, Card, Input, Space, Tabs, Typography } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { maskApiKey } from '../api-key-utils.mjs';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, FilterToolbar } from '../components/FilterControls';
import { Choice } from './ServiceUI';
import { EnterpriseDialog, EnterpriseFacts, EnterpriseStatus, EnterpriseTable } from './EnterpriseUI';
import EnterpriseMembers from './EnterpriseMembers';
import { enterpriseProjectDepartment } from './enterprise-members';
import { enterpriseAdmins, enterpriseDisplayValue, enterpriseGrant, enterpriseMetadataFields } from './enterprise';
import { accountDataSourceLabel } from './account-data-source';

export const enterpriseTabs = { info: '基本信息', members: '组织及成员', projects: '项目空间', keys: 'API 密钥' };
const { Paragraph, Text, Title } = Typography;
const time = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—';
const number = value => Number(value || 0).toLocaleString('zh-CN');

function MetadataFacts({ tenant, fields }) {
  return <EnterpriseFacts rows={fields.map(field => [
    field.label, enterpriseDisplayValue(field.key, tenant[field.key]) || (field.key === 'countryRegion' ? '中国' : '未填写'),
  ])}/>;
}

function ScopeList({ state, tenant, projects, keys, params, navigate, askKey, canWrite }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [inspect, setInspect] = useState(null);
  const grant = enterpriseGrant(state, tenant.id);
  const projectId = params.get('project') || '';
  const selectedProject = projects.find(project => project.id === projectId);
  const rows = keys.filter(key =>
    (!projectId || key.projectId === projectId) && `${key.name} ${key.keyId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const current = Math.max(1, Math.min(page, Math.ceil(rows.length / size) || 1));
  const effectiveModels = key => state.models.filter(model => key.modelIds.includes(model.id) && (!grant || grant.modelIds.includes(model.id)));
  const projectName = key => projects.find(project => project.id === key.projectId)?.name || '归属异常';
  return <>
    <Title heading={5} component="h2">API 密钥</Title>
    <Paragraph type="secondary">企业账号冻结或项目停用会拦截调用，API 密钥自身状态单独保留。</Paragraph>
    <FilterToolbar>
      <Input className="admin-list-search" aria-label="搜索企业 API 密钥" placeholder="API 密钥名称或完整 ID" showClear
        prefix={<IconSearch aria-hidden="true"/>} value={query} onChange={value => { setQuery(value); setPage(1); }}/>
      <Choice label="所属项目" value={projectId}
        options={[[ '', '全部项目' ], ...projects.map(project => [project.id, project.name]),
          ...(projectId && !selectedProject ? [[projectId, '项目归属异常']] : [])]}
        onChange={project => { navigate({ project }); setPage(1); }}/>
    </FilterToolbar>
    {projectId && !selectedProject ? <Banner type="danger" closeIcon={null} description="所选项目不属于当前企业，请选择有效项目。"/>
      : <EnterpriseTable minWidth={880} columns={['API 密钥名称/ID', 'API 密钥', '所属项目', '授权交集', 'API 密钥状态', '操作']}
        empty="暂无匹配的 API 密钥。企业管理员可在前台创建。"
        rows={rows.slice((current - 1) * size, current * size).map(key => ({ id: key.id, cells: [
          <div className="admin-table-record"><Text>{key.name}</Text><Text type="secondary" size="small">{key.keyId}</Text></div>,
          maskApiKey(key.secretPreview), projectName(key),
          <Button size="small" theme="borderless" onClick={() => setInspect(key)}>{effectiveModels(key).length} 个</Button>,
          <EnterpriseStatus value={key.status}/>,
          <Space spacing={4}>
            <Button size="small" theme="borderless" onClick={() => setInspect(key)}>详情</Button>
            {['有效', '停用'].includes(key.status) && <Button size="small" theme="borderless"
              disabled={!canWrite || (tenant.status === '停用' && key.status === '停用')}
              onClick={() => askKey(key)}>{key.status === '停用' ? '启用' : '停用'}</Button>}
          </Space>,
        ] }))}
        pagination={{ currentPage: current, pageSize: size, total: rows.length, pageSizeOpts: PAGE_SIZES, showTotal: true, showSizeChanger: true,
          onPageChange: setPage, onPageSizeChange: value => { setSize(value); setPage(1); } }}/>}
    {inspect && <EnterpriseDialog title="API 密钥详情" description={`${tenant.name} · ${inspect.name}`} close={() => setInspect(null)} footer={<><Button onClick={() => setInspect(null)}>关闭</Button></>}>
      <EnterpriseFacts rows={[
        ['API 密钥 ID', inspect.keyId], ['所属项目', projectName(inspect)], ['API 密钥状态', inspect.status],
        ['调用条件', tenant.status === '停用' ? '企业账号已冻结，调用被拒绝'
          : projects.find(project => project.id === inspect.projectId)?.status === '停用' ? '项目已停用，调用被拒绝'
            : '需同时满足 API 密钥状态、模型开放范围、额度与网关规则'],
        ['最近调用', time(inspect.lastUsedAt)], ['有效模型范围', effectiveModels(inspect).map(model => model.name).join('、') || '无'],
      ]}/>
      <Paragraph type="secondary">有效模型范围是企业授权与 API 密钥授权的交集，模型开放规则仍参与调用校验。</Paragraph>
    </EnterpriseDialog>}
  </>;
}

export default function EnterpriseDetails({ state, tenant, params, navigate, canWrite, setEditor, setResult, askToggle, askKey, editing, editForm }) {
  const tab = Object.hasOwn(enterpriseTabs, params.get('tab')) ? params.get('tab') : 'info';
  const projects = state.projects.filter(item => item.tenantId === tenant.id);
  const keys = state.apiKeys.filter(item => item.tenantId === tenant.id);
  const admins = enterpriseAdmins(state, tenant);
  const organizations = state.organizations.filter(item => item.tenantId === tenant.id);
  return <Card>
    <Tabs activeKey={tab} onChange={value => navigate({ tab: value, project: '' }, true)}>
      {Object.entries(enterpriseTabs).map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={label} disabled={editing}/>)}
    </Tabs>
    <div className="admin-analytics-fields">
      {tab === 'info' && (editing ? editForm : <>
        <div className="admin-page-heading">
          <Title heading={5} component="h2">用户信息</Title>
          <Button disabled={!canWrite} onClick={() => setEditor({ kind: 'edit', tenant })}>编辑信息</Button>
        </div>
        <EnterpriseFacts rows={[
          ['用户名称', tenant.name], ['user_id', tenant.id], ['客户类型', tenant.type], ['数据来源', accountDataSourceLabel(tenant)],
          ['创建时间', time(tenant.createdAt)], ['最近更新', time(tenant.updatedAt)],
          ['企业根组织', organizations.find(org => org.parentId === null)?.name || '待配置'], ['备注', tenant.notes || '—'],
        ]}/>
        <Title heading={5} component="h2">企业管理员</Title>
        {admins.length ? admins.map(member => {
          const user = state.users.find(item => item.id === member.userId);
          return <EnterpriseFacts key={member.id} rows={[
            ['姓名', enterpriseDisplayValue('adminName', user?.name || member.name) || '未填写'],
            ['账号', user?.login || '未填写'], ['手机号', enterpriseDisplayValue('phone', user?.phone) || '未填写'],
            ['邮箱', enterpriseDisplayValue('email', user?.email) || '未填写'],
            ...((member.status !== '正常' || user?.status !== '正常') ? [['管理员状态',
              !user ? '登录身份缺失' : member.status !== '正常' ? '成员已停用' : '登录身份已停用']] : []),
          ]}/>;
        }) : <Text type="secondary">待配置</Text>}
        <Title heading={5} component="h2">企业信息</Title>
        <MetadataFacts tenant={tenant} fields={enterpriseMetadataFields.slice(0, 2)}/>
        <Title heading={5} component="h2">地域与行业</Title>
        <MetadataFacts tenant={tenant} fields={enterpriseMetadataFields.slice(2, 7)}/>
        <Title heading={5} component="h2">业务联系</Title>
        <MetadataFacts tenant={tenant} fields={enterpriseMetadataFields.slice(7)}/>
      </>)}
      {tab === 'members' && <EnterpriseMembers state={state} tenant={tenant} projects={projects} canWrite={canWrite}
        setEditor={setEditor} setResult={setResult} askToggle={askToggle}/>}
      {tab === 'projects' && <>
        <Title heading={5} component="h2">企业项目</Title>
        <EnterpriseTable minWidth={850} columns={['项目名称 / 编号', '所属部门', '负责人',
          { title: '项目预算（Token）', align: 'right' }, 'API 密钥', '状态']} empty="该企业尚无项目"
          rows={projects.map(project => ({ id: project.id, cells: [
            <div className="admin-table-record"><Text>{project.name}</Text><Text type="secondary" size="small">{project.id}</Text></div>,
            enterpriseProjectDepartment(state, project), state.users.find(user => user.id === project.ownerId)?.name || project.ownerId || '—',
            number(project.budget),
            <Button size="small" theme="borderless" onClick={() => navigate({ tab: 'keys', project: project.id })}>
              {keys.filter(key => key.projectId === project.id).length} 个
            </Button>, <EnterpriseStatus value={project.status}/>,
          ] }))}/>
      </>}
      {tab === 'keys' && <ScopeList state={state} tenant={tenant} projects={projects} keys={keys} params={params}
        navigate={navigate} askKey={askKey} canWrite={canWrite}/>}
    </div>
  </Card>;
}
