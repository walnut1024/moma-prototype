import { useEffect, useState } from 'react';
import { Banner, Card, Input, Tabs, Typography } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { PAGE_SIZES, normalizePageSize, FilterReset, FilterToolbar } from '../components/FilterControls';
import AdminPageHeading from './AdminPageHeading';
import { EnterpriseFacts, EnterpriseStatus, EnterpriseTable } from './EnterpriseUI';
import { Choice } from './ServiceUI';
import { maskIndividualValue } from './individual-users';
import { tenantHref, userAffiliations } from './access-control.mjs';
const { Text } = Typography;

export default function UsersPage({ state }) {
  const [params, setParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  useEffect(() => { const sync = () => setParams(new URLSearchParams(location.hash.split('?')[1] || '')); addEventListener('hashchange', sync); return () => removeEventListener('hashchange', sync); }, []);
  const update = patch => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) { if (value) next.set(key, value); else next.delete(key); }
    history.replaceState(null, '', '#/admin-2/users' + (next.size ? '?' + next : '')); setParams(next);
  };
  const id = params.get('user'), user = state.users.find(row => row.id === id);
  const q = params.get('q') || '', status = params.get('status') || '', tenantId = params.get('tenant') || '';
  const rows = state.users.filter(user => state.accountUserIds?.includes(user.id) && (state.spacePolicy?.operatingMode !== 'internal' || state.memberships.some(member => member.userId === user.id && member.tenantId === state.spacePolicy.internalTenantId)) && (!status || user.status === status) && (!tenantId || userAffiliations(state, user.id).some(row => row.tenant.id === tenantId)) && [user.id, user.name, user.nickname, user.login, user.phone].some(value => String(value || '').toLowerCase().includes(q.trim().toLowerCase())));
  const size = normalizePageSize(params.get('size')), page = Math.max(1, Math.min(Number(params.get('page')) || 1, Math.ceil(rows.length / size) || 1));
  const affiliations = user ? userAffiliations(state, user.id) : [];
  const tab = ['info', 'tenants', 'projects'].includes(params.get('tab')) ? params.get('tab') : 'info';
  const tenantLink = (tenant, tab, label = tenant.name) => <Text link={{ href:tenantHref(tenant, tab ? { tab } : {}) }}>{label}</Text>;
  return <div className="admin-page-stack admin-enterprise-page">
    <AdminPageHeading title={id ? user?.name || user?.nickname || '用户不存在' : '用户管理'}/>
    {!id ? <Card><FilterToolbar>
      <Input className="admin-list-search" aria-label="搜索用户" prefix={<IconSearch/>} showClear value={q} placeholder="搜索姓名、手机号、账号或用户 ID" onChange={q => update({ q, page:'' })}/>
      <Choice label="账号状态" value={status} options={[[ '', '全部状态' ], [ '正常', '已启用' ], [ '停用', '已停用' ]]} onChange={status => update({ status, page:'' })}/>
      <Choice label="所属租户" filter value={tenantId} options={[[ '', '全部租户' ], ...state.tenants.map(tenant => [tenant.id, tenant.name])]} onChange={tenant => update({ tenant, page:'' })}/>
      <FilterReset onClick={() => update({ q:'', status:'', tenant:'', page:'' })}/>
    </FilterToolbar><EnterpriseTable columns={['用户 / ID', '登录账号', '手机号码', '所属租户', '账号状态', '操作']} rows={rows.slice((page - 1) * size, page * size).map(user => ({ id:user.id, cells:[
      <div className="admin-table-record"><Text link={{ href:'#/admin-2/users?' + new URLSearchParams({ ...Object.fromEntries(params), user:user.id }) }}>{user.name || user.nickname || user.id}</Text><Text code size="small" type="secondary">{user.id}</Text></div>,
      user.login || '—', maskIndividualValue('phone', user.phone), userAffiliations(state, user.id).length + ' 个', <EnterpriseStatus value={user.status}/>,
      <Text link={{ href:'#/admin-2/users?' + new URLSearchParams({ ...Object.fromEntries(params), user:user.id }) }}>详情</Text>,
    ] }))} empty="暂无匹配的用户" pagination={{ currentPage:page, pageSize:size, total:rows.length, pageSizeOpts:PAGE_SIZES, showTotal:true, showSizeChanger:true, onPageChange:page => update({ page:String(page) }), onPageSizeChange:size => update({ size:String(size), page:'' }) }}/></Card>
      : !user ? <Banner type="warning" closeIcon={null} description="用户不存在或不在当前管理范围内。"/> : <Card>
        <Tabs activeKey={tab} onChange={tab => update({ tab })} tabList={[{ itemKey:'info', tab:'基本信息' }, { itemKey:'tenants', tab:'所属租户' }, { itemKey:'projects', tab:'所属项目' }]}/>
        <div className="admin-analytics-fields">
          {tab === 'info' && <EnterpriseFacts rows={[[ '用户 ID', user.id ], [ '姓名', maskIndividualValue('adminName', user.name) ], [ '昵称', user.nickname || '—' ], [ '登录账号', user.login || '—' ], [ '手机号码', maskIndividualValue('phone', user.phone) ], [ '邮箱', maskIndividualValue('email', user.email) ], [ '账号状态', <EnterpriseStatus value={user.status}/> ]]}/>}
          {tab === 'tenants' && <EnterpriseTable columns={['租户', '类型', '租户内角色', '所属部门', '成员状态', '操作']} rows={affiliations.map(row => ({ id:row.tenant.id, cells:[tenantLink(row.tenant), row.tenant.type, row.role, state.organizations.find(org => org.id === row.member?.organizationId && org.tenantId === row.tenant.id)?.name || '—', <EnterpriseStatus value={row.status}/>, tenantLink(row.tenant, row.tenant.type === '个人' ? 'info' : 'members', row.tenant.type === '个人' ? '查看租户' : '管理成员')] }))} empty="尚未加入租户"/>}
          {tab === 'projects' && <EnterpriseTable columns={['项目 / ID', '所属租户', '项目角色', '项目状态', '操作']} rows={affiliations.flatMap(row => row.projects.map(({ project, role }) => ({ id:project.id, cells:[<div className="admin-table-record"><Text>{project.name}</Text><Text code size="small" type="secondary">{project.id}</Text></div>, tenantLink(row.tenant), role, <EnterpriseStatus value={project.status}/>, tenantLink(row.tenant, 'projects', '查看项目')] })))} empty="暂无可访问项目"/>}
        </div>
      </Card>}
  </div>;
}
