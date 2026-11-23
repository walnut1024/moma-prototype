import { useEffect, useId, useState } from 'react';
import { Banner, Button, Card, Input, Spin, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { FilterToolbar, normalizePageSize, PAGE_SIZES } from '../components/FilterControls';
import { ProjectFields } from '../components/ProjectConfiguration';
import { activeProjectMembers } from '../project-access.mjs';
import { customerProject } from '../personal-project.mjs';
import { activeCustomer } from '../service-access.mjs';
import { useTenantData } from '../useTenantData';
import { isManagedCustomerAccount } from './account-data-source';
import { adminProjectHref, adminProjectListHref } from './access-control.mjs';
import AdminPageHeading from './AdminPageHeading';
import { useChannelText } from './channel-language';
import CustomerProjectDetails, { AdminProjectTable } from './CustomerProjectDetails';
import { EnterpriseDialog } from './EnterpriseUI';
import { Choice } from './ServiceUI';

function CreateProject({ tenants, state, initialTenant, internal, close, onCreated }) {
  const t = useChannelText();
  const formId = useId();
  const [tenantId, setTenantId] = useState(initialTenant || '');
  const [fields, setFields] = useState({name:'',description:''});
  const [admin, setAdmin] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const tenant = useTenantData({enabled:Boolean(tenantId),adminTenantId:tenantId});
  const ready = tenant.identity?.tenantId===tenantId && tenant.canCreateProject;
  const active = new Set(activeProjectMembers(state,tenantId).map(member=>member.id));
  const members = ready ? tenant.organization.members.filter(row=>row.status==='已加入' && active.has(row.id)) : [];
  const dismiss = () => { if (!busy) close(); };
  const selected = members.some(row=>row.id===admin?.id);
  const selectedTenant = tenants.find(row=>row.id===tenantId);
  async function submit(event) {
    event.preventDefault();
    if (!selectedTenant || !selected || busy) return;
    setBusy(true);
    setError('');
    try {
      await tenant.createProject({...fields,administratorId:admin.id},admin.options);
    } catch (issue) {
      setError(issue.message);
      setBusy(false);
      return;
    }
    onCreated(tenantId);
  }
  return <EnterpriseDialog title={t('新建项目')} close={dismiss} closeOnEsc={!busy} footer={<>
    <Button onClick={dismiss} disabled={busy}>{t('取消')}</Button>
    <Button form={formId} htmlType="submit" theme="solid" loading={busy} disabled={!selected}>{t('创建')}</Button>
  </>}>
    <form id={formId} className="project-form" onSubmit={submit}>
      {internal ? <Typography.Text>{selectedTenant?.name}</Typography.Text>
        : <Choice label="所属租户" placeholder={t('请选择企业租户')} disabled={busy} filter
          value={tenantId || undefined} options={tenants.map(row=>[row.id,row.name + ' · ' + row.id])}
          onChange={id=>{setTenantId(id);setAdmin(null);setError('');}}/>}
      {ready ? <>
        {members.length ? <Choice label="项目管理员" placeholder={t('请选择首位项目管理员')} disabled={busy} filter
          options={members.map(row=>[row.id,[row.name,row.account].filter(Boolean).join(' · ')])}
          value={admin?.id} onChange={id=>{setAdmin({id,options:{expectedRevision:tenant.revision,identityKey:tenant.identity.key}});setError('');}}/>
          : <Typography.Text type="secondary">{t('暂无可指定的企业成员')}</Typography.Text>}
        <ProjectFields value={fields} setValue={setFields} tenant={tenant}/>
      </> : tenantId && (tenant.error || tenant.identity?.tenantId===tenantId
        ? <Banner type="warning" closeIcon={null} description={tenant.error || t('当前租户不可新建项目')}/>
        : <Spin spinning aria-label={t('正在加载项目成员')}/>)}
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
    </form>
  </EnterpriseDialog>;
}

export default function AdminProjects({ state, params, internal, reload, conflict, dirtyRef }) {
  const t = useChannelText();
  const [filters, setFilters] = useState(params);
  const [creating, setCreating] = useState(false);
  useEffect(()=>setFilters(params),[params]);
  const tenantId = filters.get('tenant') || (internal ? state.spacePolicy.internalTenantId : '');
  const projectId = filters.get('project');
  const tab = filters.get('tab');
  useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[projectId,tab]);
  const query = filters.get('q') || '';
  const tenants = state.tenants.filter(isManagedCustomerAccount);
  const byTenant = new Map(tenants.map(row=>[row.id,row]));
  const tenant = byTenant.get(tenantId);
  const canWrite = state.currentRole==='平台管理员' && !state.commerceReadOnly && !state.storageError && !conflict;
  const creatable = tenants.filter(row=>['企业','政府'].includes(row.type) && activeCustomer(row));
  const visible = state.projects.flatMap(row=>{
    if (!byTenant.has(row.tenantId) || tenantId && row.tenantId!==tenantId) return [];
    try { return customerProject(state,row) || []; }
    catch { return []; }
  });
  const search = query.trim().toLowerCase();
  const listed = visible.filter(row=>[row.name,row.id].some(value=>String(value || '').toLowerCase().includes(search)))
    .sort((a,b)=>String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const size = normalizePageSize(filters.get('size'));
  const page = Math.max(1,Math.min(Math.floor(Number(filters.get('page'))) || 1,Math.ceil(listed.length/size) || 1));
  const update = (patch, replace = false) => {
    const next = new URLSearchParams(location.hash.split('?')[1] || '');
    for (const [key,value] of Object.entries(patch)) {
      if (value) next.set(key,value);
      else next.delete(key);
    }
    const href = adminProjectHref(next);
    if (replace) {
      history.replaceState(null,'',href);
      setFilters(next);
    } else location.hash=href;
  };
  const back = () => { location.hash=adminProjectListHref(filters); };
  if (tenantId && !tenant) return <Banner type="warning" closeIcon={null} description={t('当前租户不可用')}/>;
  if (projectId) {
    const project = tenant && visible.find(row=>row.id===projectId && row.tenantId===tenant.id);
    return project ? <CustomerProjectDetails key={tenant.id+'/'+project.id} state={state} tenant={tenant} project={project}
      tab={tab} onTabChange={tab=>update({tab:tab==='overview' ? '' : tab})} back={back}
      canWrite={canWrite} reload={reload} dirtyRef={dirtyRef}/>
      : <div className="admin-page-stack">
        <AdminPageHeading title={t('项目详情')}><Button onClick={back}>{t('返回项目列表')}</Button></AdminPageHeading>
        <Banner type="warning" closeIcon={null} description={t('项目不存在或不属于当前租户。')}/>
      </div>;
  }
  return <div className="admin-page-stack">
    <AdminPageHeading title={t('项目管理')}>
      {canWrite && creatable.length>0 && (!tenant || creatable.some(row=>row.id===tenant.id)) &&
        <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} onClick={()=>setCreating(true)}>{t('新建项目')}</Button>}
    </AdminPageHeading>
    <Card><div className="admin-analytics-fields">
      <FilterToolbar>
        <Input className="admin-list-search" aria-label={t('搜索项目')} placeholder={t('搜索项目名称或 ID')} showClear
          prefix={<IconSearch aria-hidden="true"/>} value={query} onChange={q=>update({q,page:''},true)}/>
        {!internal && state.currentRole==='平台管理员' && <Choice label="所属租户" translateOptions filter value={tenantId}
          options={[[ '', '全部租户' ],...tenants.map(row=>[row.id,row.name+' · '+row.id])]}
          onChange={tenant=>update({tenant,page:''},true)}/>}
      </FilterToolbar>
      <AdminProjectTable state={state} tenants={tenants} projects={listed.slice((page-1)*size,page*size)}
        empty={query.trim() ? '没有匹配的项目' : '暂无项目'}
        onProject={(project,tab)=>update({tenant:project.tenantId,project:project.id,tab,fromList:tenantId ? '' : 'all'})}
        pagination={{currentPage:page,pageSize:size,total:listed.length,pageSizeOpts:PAGE_SIZES,showTotal:true,showSizeChanger:true,
          onPageChange:page=>update({page},true),onPageSizeChange:size=>update({size,page:''},true)}}/>
    </div></Card>
    {creating && canWrite && <CreateProject state={state} tenants={creatable} initialTenant={tenantId} internal={internal}
      close={()=>setCreating(false)} onCreated={createdTenant=>{
        setCreating(false);
        update({q:'',page:'',tenant:tenantId && !internal ? createdTenant : ''},true);
        Toast.success(t('项目已创建'));
        void reload();
      }}/>}
  </div>;
}
