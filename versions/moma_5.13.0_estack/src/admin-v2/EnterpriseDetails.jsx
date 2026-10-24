import { money, currentSpend } from '../project-domain.mjs';
import { maskApiKey } from '../api-key-utils.mjs';
import { Fragment, useState } from 'react';
import EnterpriseMembers from './EnterpriseMembers';
import { enterpriseProjectDepartment } from './enterprise-members';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { DEFAULT_PAGE_SIZE, FilterPagination } from '../components/FilterControls';
import { enterpriseAdmins, enterpriseDisplayValue, enterpriseGrant, enterpriseMetadataFields } from './enterprise';

export const enterpriseTabs = { info: '基本信息', members: '组织及成员', projects: '项目空间', keys: 'API Key' };
const time = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—';
function MetadataFacts({ tenant, fields, className = 'ent-metadata-facts' }) {
  return <dl className={`ent-facts ${className}`}>{fields.map(field => <Fragment key={field.key}><dt>{field.label}{field.required && <span className="ent-required" aria-label="必填"> *</span>}</dt><dd>{enterpriseDisplayValue(field.key, tenant[field.key]) || (field.key === 'countryRegion' ? '中国' : <span className="ent-unfilled">未填写</span>)}</dd></Fragment>)}</dl>;
}
function Table({ columns, rows, empty = '暂无数据' }) {
  return <div className="ent-table-wrap"><table className="ent-table"><thead><tr>{columns.map(col => <th key={col}>{col}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="ent-empty">{empty}</p>}</div>;
}
function ScopeList({ state, tenant, projects, keys, params, navigate, Status, askKey, canWrite, Modal }) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(1), [size, setSize] = useState(DEFAULT_PAGE_SIZE), [inspect, setInspect] = useState(null);
  const grant = enterpriseGrant(state, tenant.id), projectId = params.get('project') || '';
  const selectedProject = projects.find(project => project.id === projectId);
  const rows = keys.filter(key => (!projectId || key.projectId === projectId) && `${key.name} ${key.keyId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const current = Math.max(1, Math.min(page, Math.ceil(rows.length / size) || 1));
  const effectiveModels = key => state.models.filter(model => key.modelIds.includes(model.id) && (!grant || grant.modelIds.includes(model.id)));
  return <><div className="ent-section-head"><div><h2>API Key</h2><p>查看企业所属凭证及模型范围；企业账号冻结或项目停用会拦截调用，Key 自身状态单独保留。</p></div></div><div className="ent-toolbar"><Input aria-label="搜索企业 Key" placeholder="Key 名称或完整 ID" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}/><select aria-label="所属项目" value={projectId} onChange={e => { navigate({ project: e.target.value }); setPage(1); }}><option value="">全部项目</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select><span className="ent-count">{rows.length} 个 Key</span></div>
    {projectId && !selectedProject ? <p className="ent-error">所选项目不属于当前企业，请选择有效项目。</p> : <Table columns={['Key 名称/Key ID', 'API Key', '所属项目', '授权交集', 'Key 状态', '操作']} empty="暂无匹配的 Key。企业管理员可在前台创建。" rows={rows.slice((current - 1) * size, current * size).map(key => ({ id: key.id, cells: [<span>{key.name}<small>{key.keyId}</small></span>, maskApiKey(key.secretPreview), projects.find(project => project.id === key.projectId)?.name || '归属异常', <button className="ent-link" onClick={() => setInspect(key)}>{effectiveModels(key).length} 个</button>, <Status value={key.status}/>, <div className="ent-row-actions"><button className="ent-link" onClick={() => setInspect(key)}>详情</button>{['有效', '停用'].includes(key.status) && <button className="ent-link" disabled={!canWrite || (tenant.status === '停用' && key.status === '停用')} onClick={() => askKey(key)}>{key.status === '停用' ? '启用' : '停用'}</button>}</div>] }))}/>}
    <FilterPagination total={rows.length} page={current} size={size} onPageChange={setPage} onSizeChange={value => { setSize(value); setPage(1); }}/>
    {inspect && <Modal title="API Key 详情" description={`${tenant.name} · ${inspect.name}`} close={() => setInspect(null)}><div className="ent-result"><dl className="ent-facts"><dt>Key ID</dt><dd>{inspect.keyId}</dd><dt>所属项目</dt><dd>{projects.find(project => project.id === inspect.projectId)?.name || '归属异常'}</dd><dt>Key 状态</dt><dd>{inspect.status}</dd><dt>调用条件</dt><dd>{tenant.status === '停用' ? '企业账号已冻结，调用被拒绝' : projects.find(project => project.id === inspect.projectId)?.status === '停用' ? '项目已停用，调用被拒绝' : '需同时满足 Key 状态、模型开放范围、额度与网关规则'}</dd><dt>最近调用</dt><dd>{time(inspect.lastUsedAt)}</dd><dt>有效模型范围</dt><dd>{effectiveModels(inspect).map(model => model.name).join('、') || '无'}</dd></dl><p className="ent-hint">此处展示企业授权与 Key 授权的交集；模型自身开放规则仍会参与调用校验。</p></div><div className="ent-modal-footer"><Button onClick={() => setInspect(null)}>关闭</Button></div></Modal>}
  </>;
}

export default function EnterpriseDetails({ state, tenant, params, navigate, canWrite, setEditor, setResult, askToggle, askKey, Modal, Status, editing, editForm }) {
  const tab = Object.hasOwn(enterpriseTabs, params.get('tab')) ? params.get('tab') : 'info';
  const projects = state.projects.filter(item => item.tenantId === tenant.id), keys = state.apiKeys.filter(item => item.tenantId === tenant.id), admins = enterpriseAdmins(state, tenant);
  const organizations = state.organizations.filter(item => item.tenantId === tenant.id);
  return <><Tabs value={tab} onValueChange={value => navigate({ tab: value, project: '' }, true)} className="ent-panel ent-detail"><TabsList variant="line">{Object.entries(enterpriseTabs).map(([id, label]) => <TabsTrigger key={id} value={id} disabled={editing}>{label}</TabsTrigger>)}</TabsList>
    <TabsContent value="info">{editing ? editForm : <>
      <div className="ent-section-head"><h2>用户信息</h2><Button variant="outline" disabled={!canWrite} onClick={() => setEditor({ kind: 'edit', tenant })}>编辑信息</Button></div>
      <dl className="ent-facts ent-platform-facts">
        <dt>用户名称</dt><dd>{tenant.name}</dd><dt>user_id</dt><dd>{tenant.id}</dd>
        <dt>客户类型</dt><dd>{tenant.type}</dd>
        <dt>创建时间</dt><dd>{time(tenant.createdAt)}</dd><dt>最近更新</dt><dd>{time(tenant.updatedAt)}</dd>
        <dt>企业根组织</dt><dd>{organizations.find(org => org.parentId === null)?.name || '待配置'}</dd>
        <dt>备注</dt><dd>{tenant.notes || '—'}</dd>
      </dl>
      <div className="ent-section-head"><h2>企业管理员</h2></div>
      {admins.length ? admins.map(member => {
        const user = state.users.find(item => item.id === member.userId);
        return <dl key={member.id} className="ent-facts ent-metadata-facts ent-admin-details">
          <dt>姓名</dt><dd>{enterpriseDisplayValue('adminName', user?.name || member.name) || '未填写'}</dd>
          <dt>账号</dt><dd>{user?.login || '未填写'}</dd>
          <dt>手机号<span className="ent-required" aria-label="必填"> *</span></dt><dd>{enterpriseDisplayValue('phone', user?.phone) || '未填写'}</dd>
          <dt>邮箱</dt><dd>{enterpriseDisplayValue('email', user?.email) || '未填写'}</dd>
          {(member.status !== '正常' || user?.status !== '正常') && <><dt>管理员状态</dt><dd className="ent-admin-inactive">{!user ? '登录身份缺失' : member.status !== '正常' ? '成员已停用' : '登录身份已停用'}</dd></>}
        </dl>;
      }) : <p className="ent-unfilled ent-inline-note">待配置</p>}
      <div className="ent-section-head"><h2>企业信息</h2></div><MetadataFacts tenant={tenant} fields={enterpriseMetadataFields.slice(0, 2)} className="ent-profile-facts"/>
      <div className="ent-section-head"><h2>地域与行业</h2></div><MetadataFacts tenant={tenant} fields={enterpriseMetadataFields.slice(2, 7)}/>
      <div className="ent-section-head"><h2>业务联系</h2></div><MetadataFacts tenant={tenant} fields={enterpriseMetadataFields.slice(7)}/></>}
    </TabsContent>
    <TabsContent value="members"><EnterpriseMembers key={tenant.id} state={state} tenant={tenant} projects={projects} canWrite={canWrite} setEditor={setEditor} setResult={setResult} askToggle={askToggle} Modal={Modal} Status={Status}/></TabsContent>
    <TabsContent value="projects"><div className="ent-section-head"><div><h2>企业项目</h2><p>项目由企业管理员在前台维护；点击 Key 数量查看该项目的凭证。</p></div><span>{projects.length} 个项目</span></div><Table columns={['项目名称 / 编号', '所属部门', '负责人', '本期费用 / 金额预算', 'API Key', '状态']} empty="该企业尚无项目" rows={projects.map(project => ({ id: project.id, cells: [<span>{project.name}<small>{project.id}</small></span>, enterpriseProjectDepartment(state, project), state.users.find(user => user.id === project.ownerId)?.name || project.ownerId || '—', <>{money(currentSpend(state, project))}<small>{project.moneyBudget == null ? '不限预算' : money(project.moneyBudget)}</small></>, <button className="ent-link" onClick={() => navigate({ tab: 'keys', project: project.id })}>{keys.filter(key => key.projectId === project.id).length} 个</button>, <Status value={project.status}/>] }))}/></TabsContent>
    <TabsContent value="keys"><ScopeList key={tenant.id} state={state} tenant={tenant} projects={projects} keys={keys} params={params} navigate={navigate} Status={Status} askKey={askKey} canWrite={canWrite} Modal={Modal}/></TabsContent>
  </Tabs></>;
}
