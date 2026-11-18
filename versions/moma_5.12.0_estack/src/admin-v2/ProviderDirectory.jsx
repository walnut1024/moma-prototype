import { useEffect, useRef, useState } from 'react';
import { modelDisplayName } from '../model-identities.mjs';
import { Button, Input, Space, TextArea, Tooltip, Upload } from '@douyinfe/semi-ui';
import { IconEdit2Stroked, IconUpload } from '@douyinfe/semi-icons';
import { AdminSideSheet } from './AdminOverlay';
import Table from './AdminTable';
import AnalysisMetric from './AnalysisMetric';
import { CopyId, SearchBox, Notice } from './ModelOperationsUI';
import { Field } from './ServiceUI';
import MaterialLogo, { readMaterialLogo } from './MaterialLogo';
import SupplierCreationDialog from './SupplierCreationDialog';
import { providerApiKeyRows, providerCode, PROVIDER_TYPES } from './provider-management';
import { supplierChannelAssociations, supplierChannelName, supplierChannelResources, supplierBaseUrls } from './supplier-resources';
import ChannelCandidateEditor from './ChannelCandidateEditor';
import { catalogueType } from './SupplierModelMultiSelect';
import { RemovalButton } from './ProviderRemovalDialog';
import './semi-materials.css';

export default function ProviderDirectory({ state, providers, byProvider, ops, onDetails }) {
  const [drawer, setDrawer] = useState(null);
  const [modelPage, setModelPage] = useState(1);
  const trigger = useRef(null);
  const { params, go } = ops;
  const query = params.get('listQ') || '';
  const matches = providers.filter(row => `${row.id} ${row.name} ${providerCode(row)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pageSize = 20;
  const page = Math.min(Math.max(1, Number.parseInt(params.get('listPage'), 10) || 1), Math.ceil(matches.length / pageSize) || 1);
  const selected = providers.find(row => row.id === drawer?.id);
  const registeredModels = id => (byProvider.get(id) || []).filter(group => group.modelId);
  const modelRows = drawer?.kind === 'models' && selected ? registeredModels(selected.id) : [];
  const modelPageSize = 10;
  const currentModelPage = Math.min(modelPage, Math.ceil(modelRows.length / modelPageSize) || 1);
  const update = patch => go(patch, { replace: true, preserveScroll: true });
  const open = (event, id, kind) => {
    trigger.current = event.currentTarget;
    ops.setError('');
    setModelPage(1);
    setDrawer({ id, kind });
  };
  const close = () => {
    setDrawer(null);
    ops.setError('');
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : document.querySelector('.supplier-directory-search input'))?.focus());
  };
  return <>
    <div className="admin-analysis-metrics admin-analysis-metrics-four">
      <AnalysisMetric title="服务商总数" value={providers.length}/>
      <AnalysisMetric title="已启用服务商" value={providers.filter(row => row.status === '已启用').length} help="配置状态为已启用，不代表上游实时在线。"/>
      <AnalysisMetric title="已停用服务商" value={providers.filter(row => ['停用', '已停用'].includes(row.status)).length}/>
      <AnalysisMetric title="实时在线状态" value="未采集" help="需要持续健康探测结果，不能用启用状态或一次连接测试代替。"/>
    </div>
    <div className="supplier-directory-search"><SearchBox placeholder="搜索 Provider ID / 服务商名称 / 服务商编码" value={query} onChange={listQ => update({ listQ: listQ || null, listPage: null })}/></div>
    <Table className="supplier-directory-table" rowKey="id" tableLayout="fixed" scroll={{ x: 1280 }} dataSource={matches.slice((page - 1) * pageSize, page * pageSize)}
      empty={query ? '没有匹配的服务商' : '暂无服务商'}
      pagination={{ pageSize, currentPage: page, total: matches.length, hideOnSinglePage: true, onPageChange: listPage => update({ listPage }) }} columns={[
        { title: '服务商', width: 'clamp(176px, 17vw, 240px)', render: (_, row) =>
          <div className="supplier-directory-identity">
            <Button className="supplier-owner-link" theme="borderless" size="small" onClick={() => onDetails(row.id)}>
              <MaterialLogo key={row.logo} src={row.logo} alt="" fallback={null}/>
              {row.name}
            </Button>
          </div> },
        { title: '服务商编码', width: 220, render: (_, row) => <CopyId copyAtStart ellipsis value={providerCode(row)} label="服务商编码"/> },
        { title: '供给类型', width: 142, render: (_, row) => PROVIDER_TYPES[row.sourceType] || '—' },
        { title: '已登记模型', width: 112, align: 'right', render: (_, row) =>
          <Button className="supplier-directory-count" theme="borderless" size="small" aria-label={`查看 ${row.name} 的已登记模型`}
            onClick={event => open(event, row.id, 'models')}>{registeredModels(row.id).length}</Button> },
        { title: 'API 密钥池', width: 108, align: 'right', render: (_, row) => providerApiKeyRows(state, row).length },
        { title: '服务商地址 Base URL', width: 320, render: (_, row) => {
          const urls = supplierBaseUrls(state, row);
          return urls.length ? <ul className="supplier-directory-addresses">{urls.map(url => <li key={url}><CopyId copyAtStart value={url} label="Base URL"/></li>)}</ul> : '—';
        } },
        { title: '操作', width: 176, fixed: 'right', render: (_, row) => <Space spacing={4}>
          <Button theme="borderless" size="small" disabled={!ops.can} aria-label={`编辑 ${row.name}`}
            onClick={event => open(event, row.id, 'edit')}>编辑</Button>
          <RemovalButton state={state} ops={ops} target={{ providerId: row.id }} label="删除" ariaLabel={'删除服务商 ' + row.name}/>
        </Space> },
      ]}/>
    {selected && drawer.kind === 'models' && <AdminSideSheet visible title={`${selected.name} · 已登记模型`}
      width="min(720px, 100vw)" onCancel={close} closeOnEsc>
      <Table className="supplier-registered-models" rowKey="id" empty="暂无已登记模型"
        dataSource={modelRows.slice((currentModelPage - 1) * modelPageSize, currentModelPage * modelPageSize)}
        pagination={{ pageSize: modelPageSize, currentPage: currentModelPage, total: modelRows.length, hideOnSinglePage: true, onPageChange: setModelPage }} columns={[
          { title: '模型', render: (_, group) => <div className="supplier-directory-identity">
            <span>{modelDisplayName(state, group.master?.id) || group.name}</span>
            <span className="supplier-identity-code"><CopyId copyAtStart value={group.master?.modelId} label="模型编码"/></span>
          </div> },
          { title: '模型类型', width: 100, render: (_, group) =>
            catalogueType(group.master?.type || group.entry?.type) || '—' },
        ]}/>
    </AdminSideSheet>}
    {selected && drawer.kind === 'edit' && <ProviderSummaryEditor key={selected.id} state={state} provider={selected} ops={ops} close={close}/>}
  </>;
}

function FieldEditButton({ label, disabled, onClick }) {
  return <Tooltip content={label}><Button className="supplier-directory-edit-icon" theme="borderless" size="small"
    aria-label={label} icon={<IconEdit2Stroked aria-hidden="true"/>} disabled={disabled} onClick={onClick}/></Tooltip>;
}

function ProviderSummaryEditor({ state, provider, ops, close }) {
  const currentValues = () => ({ name: provider.name, code: providerCode(provider), logo: provider.logo || '', website: provider.website || '', description: provider.description || '', expectedUpdatedAt: provider.updatedAt ?? null });
  const [values, setValues] = useState(currentValues);
  const [editable, setEditable] = useState({});
  const [saving, setSaving] = useState(false), [uploading, setUploading] = useState(false);
  const [channelId, setChannelId] = useState(null);
  const [addressBusy, setAddressBusy] = useState(false);
  const addressTrigger = useRef(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const channels = supplierChannelResources(state, provider);
  const channel = channels.find(row => row.id === channelId);
  const stale = values.expectedUpdatedAt !== (provider.updatedAt ?? null);
  const disabled = !ops.can || stale || saving || uploading || Boolean(channel);
  const changed = ['name', 'logo', 'website', 'description'].some(key => values[key] !== (provider[key] || ''));
  const editField = (field, label) => <FieldEditButton label={label} disabled={disabled || editable[field]}
    onClick={() => setEditable(current => ({ ...current, [field]: true }))}/>;
  const set = (field, value) => {
    setValues(current => ({ ...current, [field]: value }));
    ops.setError('');
    ops.dirty(true);
  };
  const upload = async ([file]) => {
    if (!file || disabled) return;
    setUploading(true);
    try {
      const logo = await readMaterialLogo(file, 512 * 1024);
      if (active.current) set('logo', logo);
    } catch (error) { if (active.current) ops.setError(error.message); }
    finally { if (active.current) setUploading(false); }
  };
  const submit = async () => {
    setSaving(true);
    try {
      if (await ops.run('provider', { operation: 'profile', objectId: provider.id, values: { introduction: provider.introduction || '', documentation: provider.documentation || '', contact: provider.contact || '', contactInfo: provider.contactInfo || '', sourceType: provider.sourceType, ...values } })) close();
    } finally { setSaving(false); }
  };
  const closeAddress = () => {
    setChannelId(null);
    setAddressBusy(false);
    setValues(currentValues());
    ops.setError('');
    requestAnimationFrame(() => document.querySelector(`.supplier-directory-editor button[aria-label="${CSS.escape(addressTrigger.current)}"]`)?.focus());
  };
  const linked = channel && (supplierChannelAssociations(state, provider, channel.id).length || state.modelSupplies.some(row => row.endpointId === channel.id && row.status !== '已移除'));
  return <SupplierCreationDialog drawer className="supplier-directory-editor" title="编辑服务商" description={provider.name}
    cancel={() => { if (!saving && !uploading && !addressBusy) ops.proceed(close); }} cancelLabel={channel ? '关闭' : '取消'}
    submit={submit} action={channel ? undefined : saving ? '保存中…' : '保存'}
    disabled={disabled || !changed || !values.name.trim() || !values.code.trim()}>
    <Field label="服务商名称" required={editable.name}>
      {editField('name', '编辑服务商名称')}
      {editable.name ? <Input autoFocus aria-label="服务商名称" value={values.name} disabled={disabled} onChange={value => set('name', value)}/>
        : <span>{values.name}</span>}
    </Field>
    <Field label="Provider ID"><CopyId copyAtStart value={provider.id} label="Provider ID"/></Field>
    <Field label="服务商编码"><CopyId copyAtStart value={values.code} label="服务商编码"/></Field>
    <Field label="供给类型">{PROVIDER_TYPES[provider.sourceType] || '—'}</Field>
    <Field label="图标" hint={editable.logo && 'PNG、JPEG、WebP，最大 512 KB'}>
      {editField('logo', '编辑图标')}
      <Space wrap>
        <MaterialLogo key={values.logo} src={values.logo} alt={values.name + '的图标'} preview/>
        {editable.logo && <>
          <Upload accept="image/png,image/jpeg,image/webp" uploadTrigger="custom" fileList={[]} showUploadList={false} disabled={disabled} onFileChange={upload}>
            <Button autoFocus icon={<IconUpload aria-hidden="true"/>} loading={uploading} disabled={disabled}>{values.logo ? '更换图标' : '上传图标'}</Button>
          </Upload>
          {values.logo && <Button theme="borderless" type="danger" disabled={disabled} onClick={() => set('logo', '')}>移除图标</Button>}
        </>}
      </Space>
      {editable.logo && <Input aria-label="服务商图标 URL" placeholder="或输入图片 URL" value={values.logo.startsWith('data:') ? '' : values.logo} disabled={disabled} onChange={value => set('logo', value)}/>}
    </Field>
    <Field label="官网">{editField('website', '编辑官网')}{editable.website ? <Input aria-label="官网" value={values.website} disabled={disabled} maxLength={1000} onChange={value => set('website', value)}/> : <span>{values.website || '—'}</span>}</Field>
    <Field label="描述">{editField('description', '编辑描述')}{editable.description ? <TextArea aria-label="描述" value={values.description} disabled={disabled} maxCount={300} getValueLength={value => [...value].length} rows={3} onChange={value => set('description', value)}/> : <span>{values.description || '—'}</span>}</Field>
    <Field label="服务商地址 Base URL">{channels.length ? <ul className="supplier-directory-addresses">{channels.map(endpoint => <li key={endpoint.id}>
      <FieldEditButton label={`编辑地址 · ${supplierChannelName(provider, endpoint)}`} disabled={!ops.can || saving || uploading || addressBusy || channelId === endpoint.id}
        onClick={event => {
          addressTrigger.current = event.currentTarget.getAttribute('aria-label');
          ops.proceed(() => {
            ops.setError('');
            setValues(currentValues());
            setEditable({});
            setChannelId(endpoint.id);
          });
        }}/>
      <CopyId copyAtStart value={endpoint.baseUrl} label="Base URL"/>
      {channelId === endpoint.id && (linked || endpoint.candidateConfiguration
        ? <ChannelCandidateEditor key={endpoint.id} inline addressOnly state={state} provider={provider} endpoint={endpoint} ops={ops} close={closeAddress} onBusyChange={setAddressBusy}/>
        : <UnlinkedAddressEditor key={endpoint.id} provider={provider} channel={endpoint} ops={ops} close={closeAddress} onBusyChange={setAddressBusy}/>)}
    </li>)}</ul> : '—'}</Field>
    {stale && !channel && <Notice error>服务商资料已有修订，请重新打开核对。</Notice>}
    {ops.error && !channel && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}

function UnlinkedAddressEditor({ provider, channel, ops, close, onBusyChange }) {
  const [baseUrl, setBaseUrl] = useState(channel.baseUrl || '');
  const [expectedUpdatedAt] = useState(channel.updatedAt ?? null);
  const [saving, setSaving] = useState(false);
  const stale = expectedUpdatedAt !== (channel.updatedAt ?? null);
  return <section className="supplier-address-editor" aria-label={`编辑地址 · ${supplierChannelName(provider, channel)}`}>
    <Input autoFocus aria-label="服务商地址 Base URL" value={baseUrl} disabled={!ops.can || saving || stale} onChange={value => {
      setBaseUrl(value);
      ops.dirty(true);
      ops.setError('');
    }}/>
    <Notice>保存后需重新测试并启用渠道。</Notice>
    {stale && <Notice error>渠道已有修订，请重新打开核对。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="admin-form-actions">
      <Button disabled={saving} onClick={() => ops.proceed(close)}>取消</Button>
      <Button theme="solid" disabled={!ops.can || saving || stale || !baseUrl.trim() || baseUrl.trim() === channel.baseUrl} onClick={async () => {
        setSaving(true);
        onBusyChange(true);
        try {
          if (await ops.run('supplierChannelEdit', { providerId: provider.id, endpointId: channel.id, unlinkedAddress: true, expectedUpdatedAt, baseUrl })) close();
        } finally { setSaving(false); onBusyChange(false); }
      }}>{saving ? '保存中…' : '保存地址'}</Button>
    </div>
  </section>;
}
