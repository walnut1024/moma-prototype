import { useState } from 'react';
import { Banner, Card, Input, Tabs, Typography } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { DEFAULT_PAGE_SIZE, FilterToolbar, PAGE_SIZES } from '../components/FilterControls';
import { maskApiKey } from '../api-key-utils.mjs';
import { adminProjectHref } from './access-control.mjs';
import AdminPageHeading from './AdminPageHeading';
import { EnterpriseProjectFacts } from './EnterpriseDetails';
import { enterpriseProjectDepartment } from './enterprise-members';
import { EnterpriseStatus, EnterpriseTable } from './EnterpriseUI';
import { Choice } from './ServiceUI';

const { Text } = Typography;
const time = value => Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('zh-CN', { timeZone:'Asia/Shanghai', hour12:false }) : '—';

export default function AdminProjects({ state, params, internal }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const customer = internal ? '' : params.get('customer') || '';
  const projectScope = internal ? { scope:'organization' } : customer ? { customer } : {};
  const projectId = params.get('project');
  const tenants = new Map(state.tenants.map(row => [row.id, row]));
  const projects = state.projects.filter(row => tenants.has(row.tenantId) && (!customer || customer === row.tenantId));
  const project = projectId && projects.find(row => row.id === projectId);
  const selectCustomer = id => {
    setPage(1);
    location.hash = adminProjectHref(id ? { customer:id } : {});
  };

  if (state.storageError) return <Banner type="warning" closeIcon={null} description={state.storageError} />;
  if (projectId && !project) return <Banner type="warning" closeIcon={null} title="项目当前不可访问"
    description={<Text link={{ href:adminProjectHref(projectScope) }}>返回项目管理</Text>} />;
  if (project) {
    const keys = state.apiKeys.filter(row => row.tenantId === project.tenantId && row.projectId === project.id && row.kind !== 'experience');
    const audits = state.audits.filter(row => row.tenantId === project.tenantId && row.projectId === project.id);
    const usageHref = '#/admin-2/customer-usage-detail?' + new URLSearchParams({
      customer:project.tenantId, project:project.id, period:'today', ...(internal && projectScope),
    });
    return <div className="admin-page-stack admin-enterprise-page">
      <AdminPageHeading title={project.name}><Text link={{ href:usageHref }}>{internal ? '查看用量与成本' : '查看用量'}</Text></AdminPageHeading>
      <Card title="项目配置"><EnterpriseProjectFacts state={state} tenant={tenants.get(project.tenantId)} project={project} /></Card>
      <Card title="API Key">
        <EnterpriseTable columns={['名称', 'API Key', '状态', '有效期']} empty="暂无 API Key" rows={keys.map(row => ({
          id:row.id, cells:[row.name, maskApiKey(row.secretPreview), <EnterpriseStatus value={row.status} />, row.expiresAt ? time(row.expiresAt) : '长期有效'],
        }))} />
      </Card>
      <Card title="操作记录">
        <EnterpriseTable columns={['时间', '操作人', '操作', '对象 ID', '结果']} empty="暂无项目操作记录" rows={audits.map(row => ({
          id:row.id, cells:[time(row.createdAt), row.actor, row.action, row.objectId, row.result],
        }))} />
      </Card>
    </div>;
  }

  const rows = projects.filter(row => (!status || row.status === status) && (!department || row.organizationId === department)
    && `${row.name} ${row.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  const currentPage = Math.min(page, Math.ceil(rows.length / size) || 1);
  const tab = params.get('tab') === 'callable-models' ? 'callable-models' : 'list';
  return <div className="admin-page-stack admin-enterprise-page">
    <AdminPageHeading title="项目管理" />
    <Card>
      <Tabs activeKey={tab} onChange={key => {
        location.hash = adminProjectHref({ ...projectScope, ...(key === 'list' ? {} : { tab:key }) });
      }}>
        <Tabs.TabPane itemKey="list" tab="项目列表" />
        <Tabs.TabPane itemKey="callable-models" tab="项目可调用模型" />
      </Tabs>
      {tab === 'list' && <>
        <FilterToolbar>
          <Input className="admin-list-search" aria-label="搜索项目" prefix={<IconSearch />} showClear value={query}
            placeholder="搜索项目名称或 ID" onChange={value => { setQuery(value); setPage(1); }} />
          {!internal && <Choice label="所属客户" value={customer} onChange={selectCustomer} options={[
            ['', '全部客户'], ...[...tenants.values()].map(row => [row.id, row.name]),
            ...(customer && !tenants.has(customer) ? [[customer, '客户不可用']] : []),
          ]} />}
          {internal && <Choice label="主责部门" value={department} onChange={value => { setDepartment(value); setPage(1); }} options={[
            ['', '全部部门'], ...new Map(projects.filter(row => row.organizationId)
              .map(row => [row.organizationId, enterpriseProjectDepartment(state, row)])),
          ]} />}
          <Choice label="项目状态" value={status} onChange={value => { setStatus(value); setPage(1); }}
            options={[[ '', '全部状态' ], ...[...new Set(projects.map(row => row.status))].map(value => [value, value])]} />
        </FilterToolbar>
        <EnterpriseTable columns={['项目名称 / ID', ...(!internal ? ['所属客户'] : []), '主责部门', '状态', '创建时间']}
          rows={rows.slice((currentPage - 1) * size, currentPage * size).map(row => ({
            id:row.id, cells:[
              <div className="admin-table-record">
                <Text link={{ href:adminProjectHref({ ...projectScope, project:row.id }) }}>{row.name}</Text>
                <Text type="secondary" size="small">{row.id}</Text>
              </div>,
              ...(!internal ? [tenants.get(row.tenantId).name] : []),
              enterpriseProjectDepartment(state, row), <EnterpriseStatus value={row.status} />, time(row.createdAt),
            ],
          }))} empty="暂无匹配的项目" pagination={{ currentPage, pageSize:size, total:rows.length, pageSizeOpts:PAGE_SIZES,
            showTotal:true, showSizeChanger:true, onPageChange:setPage, onPageSizeChange:value => { setSize(value); setPage(1); } }} />
      </>}
    </Card>
  </div>;
}
