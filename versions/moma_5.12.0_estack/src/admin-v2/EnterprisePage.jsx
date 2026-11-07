import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Banner, Button, Card, Form, Input, Radio, RadioGroup, Select, Space, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { PAGE_SIZES, normalizePageSize, FilterReset, FilterToolbar } from '../components/FilterControls';
import AdminPageHeading from './AdminPageHeading';
import { Choice, serviceOperationsUi } from './ServiceUI';
import { effectiveEnterpriseAdmins, enterpriseAdmins, enterpriseMetadataFields, enterpriseTenants, privateEnterprise } from './enterprise';
import { EnterpriseDialog, EnterpriseFacts, EnterpriseStatus, EnterpriseTable } from './EnterpriseUI';
import EnterpriseDetails from './EnterpriseDetails';
import EnterpriseStatusDialog from './EnterpriseStatusDialog';
import { countries, chinaRegions, industries, changeEnterpriseLocation } from './enterprise-options';

const { Text, Paragraph, Title } = Typography;
const newIds = () => Object.fromEntries(['tenant', 'user', 'member', 'organization'].map(key => [key, `${key}-${crypto.randomUUID()}`]));

function DropdownField({ label, value, options, onChange, placeholder = '请选择', disabled = false }) {
  const list = options.map(option => [option.value, option.label]);
  if (value && !options.some(option => option.value === value)) list.unshift([value, value + '（原值）']);
  return <Form.Slot label={label}><Choice label={label.replace(/ \*$/, '')} value={value || undefined} options={list}
    onChange={onChange} placeholder={placeholder} disabled={disabled} motion={false}/></Form.Slot>;
}

function EnterpriseEditor({ state, tenant, kind, mode, apply, close, complete, inline = false, canWrite = true }) {
  const admins = tenant ? enterpriseAdmins(state, tenant) : [];
  const [form, setForm] = useState({ type: tenant?.type || '企业', notes: tenant?.notes || '', ...Object.fromEntries(enterpriseMetadataFields.map(field => [field.key, tenant?.[field.key] || (field.key === 'countryRegion' ? '中国' : field.key === 'companyName' && kind === 'edit' ? tenant.name : '')])), accountMode: 'new', adminName: '', login: '', email: '', phone: '', userId: '', adminPhones: Object.fromEntries(admins.map(member => [member.userId, state.users.find(user => user.id === member.userId)?.phone || ''])) });
  const [dirty, setDirty] = useState(false), [discard, setDiscard] = useState(false), [error, setError] = useState(''), [query, setQuery] = useState(''), [busy, setBusy] = useState(false);
  const pendingLeave = useRef(null);
  useEffect(() => {
    if (!dirty) return;
    const savedHash = location.hash;
    const guardUnload = event => { event.preventDefault(); event.returnValue = ''; };
    const guardNavigation = event => {
      const target = event.target.closest?.('.v2-sidebar button, .v2-sidebar [role="tab"], .v2-module-tabs [role="tab"], a[href^="#/"], .admin-banner-return');
      if (!target || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); event.stopPropagation();
      pendingLeave.current = () => target.click(); setDiscard(true);
    };
    const guardHash = event => {
      if (location.hash === savedHash) return;
      const destination = location.hash;
      history.replaceState(null, '', savedHash); event.stopImmediatePropagation();
      pendingLeave.current = () => { location.hash = destination; }; setDiscard(true);
    };
    addEventListener('beforeunload', guardUnload);
    document.addEventListener('click', guardNavigation, true);
    addEventListener('popstate', guardHash, true);
    addEventListener('hashchange', guardHash, true);
    return () => { removeEventListener('beforeunload', guardUnload); document.removeEventListener('click', guardNavigation, true); removeEventListener('popstate', guardHash, true); removeEventListener('hashchange', guardHash, true); };
  }, [dirty]);
  const edit = kind === 'edit', addAdmin = kind === 'add-admin';
  const update = (key, value) => { setForm(current => ({ ...current, [key]: value })); setDirty(true); setError(''); };
  const [regionState, setRegionState] = useState({ country: '', regions: [], loading: false, error: '' });
  const [regionRetry, setRegionRetry] = useState(0);
  const countryCode = countries.find(country => country.name === form.countryRegion)?.code;
  useEffect(() => {
    if (!countryCode || countryCode === 'CN' || addAdmin) return;
    let cancelled = false;
    setRegionState({ country: countryCode, regions: [], loading: true, error: '' });
    fetch(`/moma_5.12.0_estack/enterprise-regions/${countryCode}.json`).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(regions => {
      if (!cancelled) setRegionState({ country: countryCode, regions, loading: false, error: '' });
    }).catch(() => { if (!cancelled) setRegionState({ country: countryCode, regions: [], loading: false, error: '地域选项加载失败，请重试。' }); });
    return () => { cancelled = true; };
  }, [countryCode, addAdmin, regionRetry]);
  const regions = countryCode === 'CN' ? chinaRegions : regionState.country === countryCode ? regionState.regions : [];
  const regionLoaded = countryCode === 'CN' || (regionState.country === countryCode && !regionState.loading && !regionState.error);
  const provinceOptions = regions.length ? regions.map(region => ({ value: region.name, label: region.name })) : regionLoaded ? [{ value: '不适用', label: '不适用（无省份/州）' }] : [];
  const cities = regions.find(region => region.name === form.province)?.cities || [];
  const locationChange = (key, value) => { setForm(current => changeEnterpriseLocation(current, key, value)); setDirty(true); setError(''); };
  const candidates = state.users.filter(user => user.status === '正常' && `${user.name} ${user.login}`.toLowerCase().includes(query.toLowerCase()));
  const selected = state.users.find(user => user.id === form.userId);
  const sameName = !addAdmin && state.tenants.find(item => item.id !== tenant?.id && item.name.trim() === form.companyName.trim());
  const submit = event => {
    event.preventDefault(); if (busy || !canWrite) return; setBusy(true); setError('');
    try {
      const ids = newIds();
      const next = apply({ type: 'enterprise', operation: kind, tenantId: tenant?.id, mode, ids, data: form });
      const company = next.tenants.find(item => item.id === (tenant?.id || ids.tenant));
      if (edit) complete({ edited: true, tenant: company });
      else complete({ tenant: company, user: next.users.find(user => user.id === (form.accountMode === 'existing' ? form.userId : ids.user)), added: addAdmin });
    } catch (err) { setError(err.message); setBusy(false); }
  };
  const requestClose = () => { pendingLeave.current = null; if (dirty) setDiscard(true); else close(); };
  const abandon = () => { const leave = pendingLeave.current; close(); if (leave) setTimeout(leave, 0); };
  const field = (key, label, props = {}) => <Form.Slot label={{ text: label, name: `ent-${key}` }}>
    <Input id={`ent-${key}`} value={form[key]} onChange={value => update(key, value)} disabled={!canWrite} {...props}/>
  </Form.Slot>;
  const notes = <Form.Slot label={{ text: '备注', name: 'ent-notes' }}>
    <TextArea id="ent-notes" value={form.notes} maxLength={500} disabled={!canWrite} onChange={value => update('notes', value)}/>
  </Form.Slot>;
  const buttons = <div className="admin-form-actions">
    <Button disabled={busy} onClick={requestClose}>取消</Button>
    <Button htmlType="submit" theme="solid" disabled={!canWrite} loading={busy}>
      {edit ? '保存修改' : addAdmin ? '添加管理员' : '创建并开通'}
    </Button>
  </div>;
  const content = <>
    <form className="admin-analytics-fields admin-enterprise-form" onSubmit={submit}
      aria-label={edit ? '编辑政企用户信息' : addAdmin ? '添加企业管理员' : '新用户'}>
      {inline && <div className="admin-page-heading">
        <div><Title heading={5} component="h2">编辑信息</Title><Text type="secondary">User ID：{tenant.id}</Text></div>
        {buttons}
      </div>}
      {edit && <>
        <section className="admin-enterprise-form-section">
          <Title heading={5} component="h3">用户信息</Title>
          <div className="admin-enterprise-fields">
            <DropdownField label="客户类型" value={form.type} options={['政府', '企业'].map(value => ({ value, label: value }))}
              onChange={value => update('type', value)} disabled={!canWrite}/>
            {notes}
          </div>
        </section>
        <section className="admin-enterprise-form-section">
          <Title heading={5} component="h3">企业管理员</Title>
          {admins.length ? admins.map(member => {
            const user = state.users.find(item => item.id === member.userId);
            const id = `ent-phone-${member.id}`;
            return <div className="admin-enterprise-fields" key={member.id}>
              <Form.Slot label="姓名"><Text>{user?.name || member.name}</Text></Form.Slot>
              <Form.Slot label="账号"><Text>{user?.login || '登录身份缺失'}</Text></Form.Slot>
              <Form.Slot label={{ text: `手机号 *（${user?.login || member.name}）`, name: id }}>
                <Input id={id} required type="tel" maxLength={24} value={form.adminPhones[member.userId] || ''}
                  disabled={!canWrite} placeholder="中国大陆手机号，或 + 国际区号"
                  onChange={value => update('adminPhones', { ...form.adminPhones, [member.userId]: value })}/>
              </Form.Slot>
              <Form.Slot label="邮箱"><Text>{user?.email || '未填写'}</Text></Form.Slot>
            </div>;
          }) : <Paragraph type="secondary">待配置，可在组织及成员中添加管理员。</Paragraph>}
          <Paragraph type="secondary">手机号保存到该账号，供其所属政企用户共用。</Paragraph>
        </section>
      </>}
      {!addAdmin && <section className="admin-enterprise-form-section">
        <Title heading={5} component="h3">企业信息</Title>
        <div className="admin-enterprise-fields">
          {field('companyName', '公司/机构名称 *', { maxLength: 120, required: true, placeholder: '企业或机构主体全称' })}
          {field('taxId', '税号/统一社会信用代码 *', { maxLength: 32, required: true, placeholder: '填写主体税务标识' })}
        </div>
        {sameName && <Banner type="warning" closeIcon={null} description={`已有同名企业（${sameName.id}），请核对是否需要重复开户。`}/>}
      </section>}
      {!edit && <section className="admin-enterprise-form-section">
        <Title heading={5} component="h3">{addAdmin ? '管理员账号' : '首位企业管理员'}</Title>
        <RadioGroup type="button" aria-label="管理员账号来源" value={form.accountMode}
          onChange={event => update('accountMode', event.target.value)}>
          <Radio value="new">创建新登录账号</Radio><Radio value="existing">选择已有登录账号</Radio>
        </RadioGroup>
        {form.accountMode === 'new' ? <>
          <div className="admin-enterprise-fields">
            {field('adminName', '管理员姓名 *', { maxLength: 40, required: true, placeholder: '请输入姓名' })}
            {field('login', '登录账号 *', { minLength: 3, maxLength: 64, required: true, placeholder: '如 zhangsan' })}
            {field('phone', '手机号码 *', { type: 'tel', maxLength: 24, required: true, placeholder: '中国大陆手机号，或 + 国际区号' })}
            {field('email', '管理员邮箱', { type: 'email', placeholder: '选填' })}
          </div>
          <Paragraph type="secondary">登录账号支持 3–64 位字母、数字或 . _ @ -，不区分大小写。</Paragraph>
        </> : <>
          <Input aria-label="查找登录账号" prefix={<IconSearch aria-hidden="true"/>} showClear value={query}
            onChange={setQuery} placeholder="搜索姓名或登录账号"/>
          <div className="admin-enterprise-accounts admin-enterprise-member-scope" role="group" aria-label="已有登录账号">
            {candidates.map(user => {
              const relation = admins.find(member => member.userId === user.id);
              return <Button key={user.id} disabled={Boolean(relation)} aria-pressed={form.userId === user.id}
                theme={form.userId === user.id ? 'light' : 'borderless'} type={form.userId === user.id ? 'primary' : 'tertiary'}
                onClick={() => { setForm(current => ({ ...current, userId: user.id, phone: user.phone || '' })); setDirty(true); setError(''); }}>
                {user.name} · {user.login}{relation && (relation.status === '停用' ? '（已停用）' : '（已是本企业管理员）')}
              </Button>;
            })}
            {!candidates.length && <Text type="secondary">没有匹配的账号，请调整搜索或创建新账号。</Text>}
          </div>
          {selected && <div className="admin-enterprise-fields">
            <Form.Slot label="已选登录账号"><Text>{selected.name} · {selected.login}</Text></Form.Slot>
            {field('phone', '手机号码 *', { type: 'tel', maxLength: 24, required: true, placeholder: '请补录管理员手机号' })}
          </div>}
          {selected && <Paragraph type="secondary">手机号保存到该登录账号，供其所属企业共用。</Paragraph>}
        </>}
        <Banner type="info" closeIcon={null} description={form.accountMode === 'new'
          ? '企业管理员负责当前企业的组织、成员和项目。开通后请交接账号初始化信息。'
          : '企业管理员负责当前企业的组织、成员和项目。关联后沿用该人员现有登录方式。'}/>
      </section>}
      {!addAdmin && <>
        <section className="admin-enterprise-form-section">
          <Title heading={5} component="h3">地域与行业</Title>
          <div className="admin-enterprise-fields">
            <DropdownField label="国家/地区 *" value={form.countryRegion} options={countries.map(country => ({ value: country.name, label: country.name }))}
              disabled={!canWrite} onChange={value => locationChange('countryRegion', value)}/>
            <DropdownField label="省份/州 *" value={form.province} options={provinceOptions} disabled={!canWrite || !countryCode || !regionLoaded}
              placeholder={!countryCode ? '请先选择国家/地区' : regionState.country === countryCode && regionState.loading ? '正在加载…'
                : regionLoaded ? '请选择省份/州' : '等待地域选项'} onChange={value => locationChange('province', value)}/>
            <DropdownField label="城市" value={form.city} options={cities.map(city => ({ value: city, label: city }))}
              disabled={!canWrite || !form.province || !cities.length} placeholder={cities.length ? '请选择城市' : '暂无城市选项'}
              onChange={value => locationChange('city', value)}/>
            <DropdownField label="所属行业" value={form.industry} options={industries.map(([code, name]) => ({ value: name, label: code + ' ' + name }))}
              disabled={!canWrite} placeholder="请选择行业门类" onChange={value => update('industry', value)}/>
            <div className="admin-enterprise-wide">{field('address', '详细地址', { maxLength: 200, placeholder: '区县、街道及门牌等' })}</div>
          </div>
          {regionState.country === countryCode && regionState.error && <Banner type="danger" closeIcon={null}
            description={<Space wrap>{regionState.error}<Button size="small" theme="borderless" onClick={() => setRegionRetry(value => value + 1)}>重试</Button></Space>}/>}
          <Paragraph type="secondary">行业采用 GB/T 4754—2017。<Text link={{ href: '/moma_5.12.0_estack/enterprise-regions/README.txt', target: '_blank', rel: 'noreferrer' }}>地域数据来源</Text>，未覆盖的地址可填入详细地址。</Paragraph>
        </section>
        <section className="admin-enterprise-form-section">
          <Title heading={5} component="h3">业务联系</Title>
          <Paragraph type="secondary">联系人用于企业业务沟通，不自动获得管理员权限。</Paragraph>
          <div className="admin-enterprise-fields">
            {enterpriseMetadataFields.slice(7).map(item => <div key={item.key}>
              {field(item.key, item.label + (item.required ? ' *' : ''),
                { required: item.required, type: item.type || 'text', maxLength: item.max, placeholder: item.placeholder })}
            </div>)}
            {!edit && <div className="admin-enterprise-wide">{notes}</div>}
          </div>
        </section>
      </>}
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
      {!inline && buttons}
    </form>
    {discard && serviceOperationsUi.renderLeaveDialog({ cancel: () => { pendingLeave.current = null; setDiscard(false); }, discard: abandon })}
  </>;
  return inline ? content : <EnterpriseDialog wide title={addAdmin ? '添加企业管理员' : '新用户'} close={requestClose} closeOnEsc={!discard}
    description={addAdmin ? `所属企业：${tenant.name}` : '建立政企主体，并开通首位企业管理员。'}>{content}</EnterpriseDialog>;
}

export default function EnterprisePage({ state, transact, deploymentTarget }) {
  const [params, setParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const [editor, setEditor] = useState(null);
  const [result, setResult] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  useEffect(() => {
    const sync = () => {
      const next = new URLSearchParams(location.hash.split('?')[1] || '');
      setParams(next);
      setEditor(previous => previous?.tenant && previous.tenant.id !== next.get('enterprise') ? null : previous);
    };
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  }, []);
  const navigate = (patch, replace = false) => {
    const next = new URLSearchParams(location.hash.split('?')[1] || '');
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const hash = `#/admin-2/tenants${next.size ? `?${next}` : ''}`;
    if (replace) history.replaceState(null, '', hash);
    else location.hash = hash;
    setParams(next);
  };
  const mode = params.get('scenario') === 'private' ? 'private' : 'cloud';
  const all = enterpriseTenants(state);
  const defaultTenant = privateEnterprise(state);
  const companies = mode === 'private' ? all.filter(item => item.id === defaultTenant?.id) : all;
  const detailId = params.get('enterprise');
  const tenant = companies.find(item => item.id === detailId);
  const query = params.get('q') || '';
  const status = params.get('status') || '';
  const canWrite = !state.storageError && ['平台管理员', '运营人员'].includes(state.currentRole);
  const hasCapacity = mode === 'cloud' || !all.length;
  const apply = action => transact({ ...action, mode });
  const rows = companies.filter(item =>
    (!status || item.status === status) && [item.id, item.name].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const size = normalizePageSize(params.get('size'));
  const page = Math.max(1, Math.min(Math.floor(Number(params.get('page'))) || 1, Math.ceil(rows.length / size) || 1));
  const askToggle = (tenant, member) => setConfirmation({ tenant, member });
  const open = (item, tab = '') => navigate({ enterprise: item.id, tab, project: '' });
  const editing = editor?.kind === 'edit';
  const handover = result ? [
    '【企业账号交接信息】', `企业：${result.tenant.name}`, `user_id：${result.tenant.id}`, `管理员：${result.user.name}`,
    `登录账号：${result.user.login}`, `手机号码：${result.user.phone || '未填写'}`,
    `账号初始化：${result.user.initialized ? '已完成，沿用现有登录方式' : '待设置密码'}`,
  ].join('\n') : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(handover); Toast.success('已复制账号交接信息'); }
    catch { Toast.error('复制失败，请选择交接信息文本手动复制'); }
  };
  return <div className="admin-page-stack admin-enterprise-page">
    {deploymentTarget && createPortal(<div className="admin-banner-field">
      <Text id="admin-deployment-picker-label" type="secondary" size="small">部署方式</Text>
      <Select aria-labelledby="admin-deployment-picker-label" size="small" position="bottomRight" value={mode} disabled={Boolean(editor)}
        onSelect={value => {
          if (value !== mode) navigate({ scenario: value === 'private' ? 'private' : '', enterprise: '', tab: '', project: '', page: '', q: '', status: '' });
        }}
        optionList={[{ value: 'cloud', label: '私有云' }, { value: 'private', label: '私有化' }]}/>
    </div>, deploymentTarget)}
    <AdminPageHeading title={detailId ? tenant?.name || '政企详情' : '政企用户'} description={detailId
      ? '管理企业管理员、查看组织成员、项目空间及 API 密钥。'
      : '以政府机构或企业为主体开通，由管理员统一管理组织成员及模型服务资源。'}>
      {tenant && <Space wrap>
        <EnterpriseStatus value={tenant.status} enterprise/>
        <Button type={tenant.status === '停用' ? 'primary' : 'danger'} disabled={!canWrite || editing} onClick={() => askToggle(tenant)}>
          {tenant.status === '停用' ? '账号解冻' : '账号冻结'}
        </Button>
      </Space>}
      {!detailId && <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!canWrite || !hasCapacity}
        title={!hasCapacity ? '单企业容量已用完，请进入企业详情管理账号' : !canWrite ? '当前角色仅可查看' : undefined}
        onClick={() => setEditor({ kind: 'create' })}>新用户</Button>}
    </AdminPageHeading>
    {mode === 'private' && <Banner type="info" closeIcon={null} description={`默认企业：${defaultTenant?.name || '尚未开户'}。当前部署仅管理默认企业。`}/>}
    {!canWrite && <Banner type="info" closeIcon={null} description={state.storageError ? '数据读取失败，请恢复数据后再操作。'
      : '当前角色仅可查看企业信息。平台管理员和运营人员可执行开户及账号管理。'}/>}
    {!detailId ? <Card>
      <FilterToolbar className="admin-list-toolbar">
        <Input className="admin-list-search" aria-label="搜索企业" prefix={<IconSearch aria-hidden="true"/>} showClear value={query}
          placeholder="搜索 User ID、用户名" onChange={q => navigate({ q, page: '' }, true)}/>
        <Choice label="企业状态" value={status || 'all'} options={[[ 'all', '全部状态' ], [ '正常', '已启用' ], [ '需关注', '需关注' ], [ '停用', '已冻结' ]]}
          onChange={value => navigate({ status: value === 'all' ? '' : value, page: '' }, true)}/>
        <FilterReset onClick={() => navigate({ q: '', status: '', page: '' }, true)}/>
      </FilterToolbar>
      <EnterpriseTable minWidth={950} columns={[
        { title: '用户名 / User ID', width: 275 }, { title: '客户类型', width: 95 }, { title: '企业管理员', width: 175 },
        { title: '成员数', width: 80, align: 'right' }, { title: '状态', width: 100 }, { title: '操作', width: 185 },
      ]} rows={rows.slice((page - 1) * size, page * size).map(item => {
        const members = enterpriseAdmins(state, item);
        const primary = effectiveEnterpriseAdmins(state, item)[0] || members[0];
        const user = primary && state.users.find(row => row.id === primary.userId);
        return { id: item.id, cells: [
          <Space><Avatar size="extra-small" aria-hidden="true">{Array.from(item.name)[0]}</Avatar>
            <div className="admin-table-record">
              <Button size="small" theme="borderless" onClick={() => open(item)}>{item.name}</Button>
              <Text size="small" type="secondary" code>{item.id}</Text>
            </div>
          </Space>,
          item.type,
          <div className="admin-table-record"><Text>{primary?.name || '待配置'}{members.length > 1 ? ` 等 ${members.length} 人` : ''}</Text>
            <Text type="secondary" size="small">{user?.login || '—'}</Text></div>,
          state.memberships.filter(member => member.tenantId === item.id).length,
          <EnterpriseStatus value={item.status} enterprise/>,
          <Space spacing={4}>
            <Button size="small" theme="borderless" onClick={() => open(item)}>详情</Button>
            <Button size="small" theme="borderless" disabled={!canWrite} onClick={() => { open(item, 'info'); setEditor({ kind: 'edit', tenant: item }); }}>编辑</Button>
            <Button size="small" theme="borderless" disabled={!canWrite} onClick={() => askToggle(item)}>{item.status === '停用' ? '解冻' : '冻结'}</Button>
          </Space>,
        ] };
      })} empty={query || status ? '没有匹配的企业，请调整筛选条件。' : '尚未创建企业，点击“新用户”开始开户。'}
        pagination={{ currentPage: page, pageSize: size, total: rows.length, pageSizeOpts: PAGE_SIZES, showTotal: true, showSizeChanger: true,
          onPageChange: value => navigate({ page: String(value) }, true), onPageSizeChange: value => navigate({ size: String(value), page: '' }, true) }}/>
    </Card> : !tenant ? <Banner type="warning" closeIcon={null} description="企业不存在或不属于当前部署方式，请返回企业列表。"/> : <>
      {tenant.status === '停用' && <Banner type="warning" closeIcon={null} description="企业账号已冻结，所属成员和资源记录保留。解冻后可继续管理账号。"/>}
      <EnterpriseDetails key={tenant.id} state={state} tenant={tenant} params={params} navigate={navigate} canWrite={canWrite}
        setEditor={setEditor} setResult={setResult} askToggle={askToggle} askKey={key => setConfirmation({ tenant, key })} editing={editing}
        editForm={editing && <EnterpriseEditor key={`edit-${tenant.id}`} inline state={state} tenant={tenant} kind="edit" mode={mode}
          apply={apply} canWrite={canWrite} close={() => setEditor(null)} complete={() => { setEditor(null); Toast.success('政企用户信息已保存'); }}/>}/>
    </>}
    {editor && !editing && <EnterpriseEditor key={`${editor.kind}-${editor.tenant?.id || 'new'}`} state={state} tenant={editor.tenant}
      kind={editor.kind} mode={mode} apply={apply} canWrite={canWrite} close={() => setEditor(null)}
      complete={value => { setEditor(null); setResult(value); }}/>}
    {result && <EnterpriseDialog title={result.handover ? '账号交接信息' : result.added ? '企业管理员已添加' : '企业账号已开通'}
      description="请核对企业与管理员信息，妥善保管账号交接资料。" close={() => setResult(null)}>
      <EnterpriseFacts rows={[
        ['用户名称', result.tenant.name], ['user_id', result.tenant.id], ['管理员', result.user.name],
        ['登录账号', result.user.login], ['手机号码', result.user.phone || '未填写'],
        ['账号初始化', result.user.initialized ? '已完成，沿用现有登录方式' : '待设置密码'],
      ]}/>
      <Form.Slot label={{ text: '账号交接信息', name: 'ent-handover' }}><TextArea id="ent-handover" readOnly value={handover}/></Form.Slot>
      <div className="admin-form-actions">
        <Button onClick={copy}>复制交接信息</Button>
        <Button theme="solid" onClick={() => { open(result.tenant, 'members'); setResult(null); }}>查看企业</Button>
      </div>
    </EnterpriseDialog>}
    {confirmation && <EnterpriseStatusDialog key={(confirmation.key || confirmation.member || confirmation.tenant).id} state={state}
      confirmation={confirmation} apply={apply} canWrite={canWrite} close={() => setConfirmation(null)}
      complete={() => { setConfirmation(null); Toast.success('状态已更新'); }}/>}
  </div>;
}
