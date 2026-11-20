import { useEffect, useState } from 'react';
import { Banner, Button, Card, Input, Space, Typography } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { PAGE_SIZES, normalizePageSize, FilterReset, FilterToolbar } from '../components/FilterControls';
import AdminPageHeading from './AdminPageHeading';
import { Choice } from './ServiceUI';
import { enterpriseAdmins } from './enterprise';
import { EnterpriseStatus, EnterpriseTable } from './EnterpriseUI';
import EnterprisePage from './EnterprisePage';
import IndividualUsersPage from './IndividualUsersPage';
import { isManagedCustomerAccount, accountDataSource, accountDataSourceOptions } from './account-data-source';
import { tenantHref } from './access-control.mjs';

export default function CustomerPage(props) {
  const { state, internal, transactIndividual, conflict, dirtyRef } = props;
  const [params, setParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  useEffect(() => { const sync = () => setParams(new URLSearchParams(location.hash.split('?')[1] || '')); addEventListener('hashchange', sync); return () => removeEventListener('hashchange', sync); }, []);
  const update = patch => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) { if (value) next.set(key, value); else next.delete(key); }
    history.replaceState(null, '', '#/admin-2/tenants' + (next.size ? '?' + next : '')); setParams(next);
  };
  if (internal || params.has('enterprise') || params.get('create') === 'enterprise') return <EnterprisePage {...props}/>;
  if (params.has('personal') || params.get('create') === 'personal') return <IndividualUsersPage state={state} transact={transactIndividual} conflict={conflict} dirtyRef={dirtyRef}/>;
  const q = params.get('q') || '', type = params.get('type') || '', status = params.get('status') || '';
  const rows = state.tenants.filter(tenant => isManagedCustomerAccount(tenant) && (!params.get("source") || accountDataSource(tenant) === params.get("source")) && (!type || (type === '个人' ? tenant.type === '个人' : ['企业', '政府'].includes(tenant.type))) && (!status || tenant.status === status) && `${tenant.name} ${tenant.id}`.toLowerCase().includes(q.trim().toLowerCase()));
  const size = normalizePageSize(params.get('size')), page = Math.max(1, Math.min(Number(params.get('page')) || 1, Math.ceil(rows.length / size) || 1));
  const canWrite = !state.commerceReadOnly && !conflict && !state.storageError && ['平台管理员', '运营人员'].includes(state.currentRole);
  return <div className="admin-page-stack admin-enterprise-page">
    <AdminPageHeading title="租户管理"><Space wrap>
      {state.spacePolicy?.personalEnabled!==false && <Button disabled={!canWrite} onClick={() => { location.hash = '#/admin-2/tenants?create=personal'; }}>开通个人租户</Button>}
      <Button theme="solid" disabled={!canWrite} onClick={() => { location.hash = '#/admin-2/tenants?create=enterprise'; }}>开通企业租户</Button>
    </Space></AdminPageHeading>
    {(conflict || state.storageError) && <Banner type="warning" closeIcon={null} description={conflict ? '数据已变化，请载入新版本后再操作。' : '数据读取失败，请恢复数据后再操作。'}/>}
    <Card><FilterToolbar>
      <Input className="admin-list-search" aria-label="搜索租户" prefix={<IconSearch/>} showClear value={q} placeholder="搜索租户名称或租户 ID" onChange={q => update({ q, page: '' })}/>
      <Choice label="租户类型" value={type} options={[[ '', '全部类型' ], [ '政企', '政企' ], [ '个人', '个人' ]]} onChange={type => update({ type, page: '' })}/>
      <Choice label="租户状态" value={status} options={[[ '', '全部状态' ], [ '正常', '已启用' ], [ '需关注', '需关注' ], [ '停用', '已冻结' ]]} onChange={status => update({ status, page: '' })}/>
      <Choice label="数据来源" value={params.get("source") || "all"} options={accountDataSourceOptions} onChange={source => update({ source:source === "all" ? "" : source, page:"" })}/>
      <FilterReset onClick={() => update({ q:'', type:'', status:'', source:'', page:'' })}/>
    </FilterToolbar>
    <EnterpriseTable columns={['租户名称 / ID', '租户类型', '管理员 / 持有人', '服务等级', '状态', '开户时间', '操作']} rows={rows.slice((page - 1) * size, page * size).map(tenant => ({ id:tenant.id, cells:[
      <div className="admin-table-record"><Typography.Text link={{ href:tenantHref(tenant, {}, params) }}>{tenant.name}</Typography.Text><Typography.Text code size="small" type="secondary">{tenant.id}</Typography.Text></div>,
      tenant.type, state.users.find(user=>user.id===(tenant.type==='个人' ? tenant.ownerId : enterpriseAdmins(state,tenant)[0]?.userId))?.name || '—',
      tenant.serviceLevel || '—', <EnterpriseStatus value={tenant.status} enterprise/>, tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}) : '—', <Typography.Text link={{ href:tenantHref(tenant, {}, params) }}>详情</Typography.Text>,
    ] }))} empty="暂无匹配的租户" pagination={{ currentPage:page, pageSize:size, total:rows.length, pageSizeOpts:PAGE_SIZES, showTotal:true, showSizeChanger:true, onPageChange:page => update({ page:String(page) }), onPageSizeChange:size => update({ size:String(size), page:'' }) }}/></Card>
  </div>;
}
