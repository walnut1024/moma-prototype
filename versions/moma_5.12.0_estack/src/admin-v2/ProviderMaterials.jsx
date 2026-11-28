import { useChannelText } from './channel-language';
import { PROTOCOL_ENDPOINT_LABEL, protocolAndEndpoint } from './workbench-protocol';
import { useEffect, useRef, useState } from 'react';
import { Button, Empty, Space, Tabs, Typography } from './xa24/HaloUI.jsx';
import { IconPlus } from './xa24/HaloIcons.jsx';
import Table from './AdminTable';
import { AdminModal } from './AdminOverlay';
import { Choice, Notice } from './ServiceUI';
import { SearchBox, useOperations } from './ModelOperationsUI';
import AdminPageHeading from './AdminPageHeading';
import MaterialsHeader, { materialOperationsUi } from './MaterialsHeader';
import ProviderMaterialProfile from './ProviderMaterialProfile';
import MaterialLogo from './MaterialLogo';
import ModelBatchImport from './ModelBatchImport';
import SupplyRegistrationDialog from './SupplyRegistrationDialog';
import { providerCode, PROVIDER_TYPES } from './provider-management';
import { SupplierOfferEditor } from './SupplierOfferEditor';
import { offerFields } from './supplier-offer-fields';
import { catalogueType } from './SupplierModelMultiSelect';
import { operationsReturn } from './model-pricing-workspace';
import { materialProviders, providerMaterialModels } from './provider-materials';
import { isBuiltinMoma } from './moma-provider';

const pageSize = 20;
const pageNumber = (value, count) => Math.min(Math.max(1, Number.parseInt(value, 10) || 1), Math.ceil(count / pageSize) || 1);
const pageRows = (rows, page) => rows.slice((page - 1) * pageSize, page * pageSize);
const listParams = { provider: null, view: null, tab: null, edit: null, returnTo: null, modelQ: null, modelPage: null };

function ProviderList({ state, ops, providers }) {
  const translateLabel = useChannelText();
  const [removing, setRemoving] = useState(null);
  const [removingBusy, setRemovingBusy] = useState(false);
  const trigger = useRef(null);
  const filters = useRef(null);
  const query = ops.params.get('q') || '';
  const sourceType = ops.params.get('type') || 'all';
  const rows = providers.filter(row => (sourceType === 'all' || sourceType === row.sourceType)
    && (row.name + ' ' + providerCode(row)).toLowerCase().includes(query.trim().toLowerCase()));
  const page = pageNumber(ops.params.get('page'), rows.length);
  const update = patch => ops.go(patch, { replace: true, preserveScroll: true });
  const open = (provider, edit) => ops.go({ provider: provider.id, view: null, tab: edit ? 'profile' : null, edit: edit ? '1' : null });
  const closeRemoval = () => {
    setRemoving(null);
    ops.setError('');
    requestAnimationFrame(() => {
      const target = trigger.current?.isConnected ? trigger.current : filters.current?.querySelector('input');
      target?.focus();
    });
  };
  const remove = async () => {
    if (!removing || removingBusy) return;
    setRemovingBusy(true);
    try {
      const next = await ops.run('provider', { operation: 'profileRemove', objectId: removing.id,
        values: { expectedUpdatedAt: removing.updatedAt ?? null, confirmed: true } });
      if (next) closeRemoval();
    } finally { setRemovingBusy(false); }
  };
  return <>
    <div className="materials-toolbar">
      <div className="materials-filters" ref={filters}>
        <SearchBox placeholder={translateLabel("搜索服务商名称或编码")} value={query} onChange={q => update({ q: q || null, page: null })}/>
        <Choice translateOptions label="筛选供给类型" value={sourceType} options={[[ 'all', '全部供给类型' ], ...Object.entries(PROVIDER_TYPES)]}
          onChange={type => update({ type: type === 'all' ? null : type, page: null })}/>
      </div>
      <Space wrap className="materials-toolbar-actions">
        <Button disabled={!ops.can} onClick={() => ops.go({ view: 'import' })}>{translateLabel("批量导入服务商资料")}</Button>
        <Button disabled={!ops.can} onClick={() => ops.go({ view: 'relations' })}>{translateLabel("批量导入供应关系")}</Button>
        <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!ops.can} onClick={() => ops.go({ view: 'new' })}>{translateLabel("新建服务商")}</Button>
      </Space>
    </div>
    <Table rowKey="id" dataSource={pageRows(rows, page)} scroll={{ x: 'max(100%, 780px)' }} empty="没有符合条件的服务商"
      pagination={{ pageSize, currentPage: page, total: rows.length, onPageChange: page => update({ page }) }} columns={[
      { title: '服务商名称', width: 220, render: (_, row) => <Button className="materials-model-name" theme="borderless" onClick={() => open(row)}><MaterialLogo key={row.logo} src={row.logo} alt=""/>{row.name}</Button> },
      { title: '服务商编码', width: 160, render: (_, row) => <Typography.Text className="materials-code" copyable>{providerCode(row)}</Typography.Text> },
      { title: '供给类型', width: 150, render: (_, row) => translateLabel(PROVIDER_TYPES[row.sourceType]) || '—' },
      { title: '供应模型数', align: 'right', width: 130, render: (_, row) => <Button theme="borderless" aria-label={`查看 ${row.name} 的供应模型`} onClick={() => open(row)}>{providerMaterialModels(state, row).length}</Button> },
      { title: '操作', width: 145, fixed: 'right', render: (_, row) => <Space>
        <Button theme="borderless" disabled={!ops.can} onClick={() => open(row, true)}>{translateLabel("编辑")}</Button>
        {!isBuiltinMoma(row) && row.builtinCatalogue !== 'inference' && <Button theme="borderless" type="danger" disabled={!ops.can}
          aria-label={translateLabel("删除") + ' ' + row.name} onClick={event => {
            trigger.current = event.currentTarget;
            ops.setError('');
            setRemoving(row);
          }}>{translateLabel("删除")}</Button>}
      </Space> },
    ]}/>
    {removing && <AdminModal visible title={translateLabel('删除服务商')} okText={translateLabel('确认删除')}
      confirmLoading={removingBusy} okButtonProps={{ type: 'danger', disabled: !ops.can }}
      onCancel={() => { if (!removingBusy) closeRemoval(); }} onOk={remove}>
      <Typography.Paragraph strong>{removing.name}</Typography.Paragraph>
      <Typography.Paragraph>{translateLabel('删除后，新建连接时将无法选择该服务商。已有连接仍可查看和维护')}</Typography.Paragraph>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </AdminModal>}
  </>;
}

function ProviderModels({ state, ops, provider }) {
  const translateLabel = useChannelText();
  const [registering, setRegistering] = useState(false);
  const [editing,setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [removingBusy, setRemovingBusy] = useState(false);
  const trigger = useRef(null);
  const query = ops.params.get('modelQ') || '';
  const rows = providerMaterialModels(state, provider).map(row => ({ ...row, offer:offerFields(row,provider) })).filter(({ offer }) =>
    [offer.name,offer.code,...offer.bindings.map(b => b.upstream)].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const page = pageNumber(ops.params.get('modelPage'), rows.length);
  const update = patch => ops.go(patch, { replace: true, preserveScroll: true });
  const closeRemoval = () => {
    setRemoving(null);
    ops.setError('');
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const remove = async () => {
    setRemovingBusy(true);
    try {
      const next = await ops.run('provider', { operation: 'catalogueRemove', objectId: provider.id,
        values: { modelId: removing.modelId, expectedUpdatedAt: removing.providerUpdatedAt, confirmed: true } });
      if (next) closeRemoval();
    } finally { setRemovingBusy(false); }
  };
  return <>
    <div className="materials-toolbar">
      <div className="materials-filters"><SearchBox placeholder="搜索模型展示名称、上游模型 ID 或模型编码" value={query}
        onChange={modelQ => update({ modelQ: modelQ || null, modelPage: null })}/></div>
      <Space wrap className="materials-toolbar-actions">
        <Button disabled={!ops.can} onClick={() => ops.go({ view: 'modelImport' })}>批量导入并添加</Button>
        <Button theme="solid" disabled={!ops.can} onClick={event => { trigger.current = event.currentTarget; setRegistering(true); }}>添加供应模型</Button>
      </Space>
    </div>
    <Table rowKey="id" dataSource={pageRows(rows, page)} scroll={{ x: 'max(100%, 730px)' }} empty={query ? '没有符合条件的模型' : '暂无供应模型'}
      pagination={{ pageSize, currentPage: page, total: rows.length, onPageChange: modelPage => update({ modelPage }) }} columns={[
      { title: '模型展示名称', width: 170, render: (_, { offer }) => offer.name },
      { title: '上游模型 ID', width: 170, render: (_, { offer }) => [...new Set(offer.bindings.map(b => b.upstream).filter(Boolean))].join('、') || '—' },
      { title: '模型编码', width: 160, render: (_, { master }) => <Typography.Text className="materials-code">{master.modelId}</Typography.Text> },
      { title: '模型类型', width: 120, render: (_, { master }) => catalogueType(master.type) },
      { title: PROTOCOL_ENDPOINT_LABEL, width: 300, render: (_, { offer }) => offer.bindings.length ? offer.bindings.map((b,i) => <div key={i}>{protocolAndEndpoint(b.protocol, b.url)}</div>) : '—' },
      { title: '操作', width: 110, fixed: 'right', render: (_, row) => <Space>
        <Button theme="borderless" disabled={!ops.can} onClick={() => setEditing(row.offer)}>{translateLabel("编辑")}</Button>
        <Button theme="borderless" type="danger" disabled={!ops.can} aria-label={'删除供应模型 ' + row.offer.name}
          onClick={event => {
            const button = event.currentTarget;
            ops.proceed(() => {
              trigger.current = button;
              ops.setError('');
              setRemoving({ modelId: row.modelId, name: row.offer.name, providerUpdatedAt: provider.updatedAt ?? null });
            });
          }}>{translateLabel("删除")}</Button>
      </Space> },
    ]}/>
    {editing && <SupplierOfferEditor offer={editing} provider={provider} ops={ops} close={() => setEditing(null)}/>}
    {removing && <AdminModal visible centered title="删除供应模型" cancelText="取消" okText="确认删除"
      confirmLoading={removingBusy} okButtonProps={{ type: 'danger', disabled: !ops.can || Boolean(ops.conflict) }}
      onCancel={() => { if (!removingBusy) closeRemoval(); }} onOk={remove}>
      <Typography.Paragraph>确认删除「{removing.name}」的供应记录？已接入的上游模型、模型服务和售卖保留。</Typography.Paragraph>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </AdminModal>}
    {registering && <SupplyRegistrationDialog state={state} ops={ops} provider={provider} close={() => {
      setRegistering(false);
      ops.setError('');
      requestAnimationFrame(() => trigger.current?.focus());
    }}/>}
  </>;
}

export default function ProviderMaterials(props) {
  const translateLabel = useChannelText();
  const { state, transact } = props;
  const ops = useOperations({ ...props, ...materialOperationsUi }, 'provider-materials');
  const { params, go } = ops;
  const providers = materialProviders(state);
  const providerId = params.get('provider');
  const provider = providers.find(row => row.id === providerId) || state.providers.find(row => row.id === providerId && !row.deletedAt && !row.profileRemovedAt);
  const view = params.get('view'), tab = params.get('tab') === 'profile' ? 'profile' : 'models';
  const editing = params.get('edit') === '1';
  const returnTo = operationsReturn(params.get('returnTo'));
  const title = useRef(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, [providerId, view]);
  const back = () => returnTo ? ops.proceed(() => { location.hash = returnTo; }) : go(listParams);
  const saved = id => go({ provider: id, view: null, edit: null, tab: view === 'new' ? null : 'profile' }, { saved: true });
  const importKind = view === 'modelImport' && provider ? 'model' : view === 'import' ? 'provider' : view === 'relations' ? 'relation' : null;
  const conflictNotice = !importKind && ops.conflict && <div className="materials-description"><Notice error>资料已有修订，当前输入保留。<Button theme="borderless" onClick={ops.reload}>载入最新数据</Button></Notice></div>;
  if (!view && !providerId) return <div className="semi-materials admin-page-stack">
    <MaterialsHeader active="provider-materials" ops={ops}>
      {conflictNotice}
      <ProviderList state={state} ops={ops} providers={providers}/>
    </MaterialsHeader>
    {ops.leaveDialog}
  </div>;
  return <div className="semi-materials materials-page">
    {(view || !provider) && <AdminPageHeading title="服务商资料" className="materials-heading"/>}
    {conflictNotice}
    {(view || (providerId && !provider)) && <div className="materials-description">
      <Button theme="borderless" onClick={importKind && provider ? () => go({ view: null }) : back}>
        {importKind && provider ? '返回供应模型' : returnTo?.startsWith('#/admin-2/providers-reference') ? '返回模型接入' : returnTo ? '返回来源页面' : '返回服务商列表'}
      </Button>
    </div>}
    {importKind ? <div className="materials-description">
      <Typography.Title heading={4}><span ref={title} tabIndex={-1}>{importKind === 'provider' ? '批量导入服务商资料' : importKind === 'relation' ? '批量导入供应关系' : '批量导入并添加'}</span></Typography.Title>
      <ModelBatchImport key={view + (provider?.id || '')} kind={importKind} providerId={provider?.id} state={state} ops={ops} transact={transact}
        close={saved => provider ? go({ view: null }, { saved }) : go(listParams, { saved })}/>
    </div> : view === 'new' ? <>
      <Typography.Title heading={4}><span ref={title} tabIndex={-1}>{translateLabel("新建服务商")}</span></Typography.Title>
      <ProviderMaterialProfile key="new" editing ops={ops} cancel={back} saved={saved}/>
    </> : provider ? <>
      <Typography.Title heading={4}><span ref={title} tabIndex={-1}>{provider.name}</span></Typography.Title>
      <Tabs activeKey={tab} onChange={tab => go({ tab: tab === 'profile' ? tab : null, edit: null }, { preserveScroll: true })} aria-label="服务商资料详情">
        <Tabs.TabPane itemKey="models" tab={translateLabel("供应模型")}>{tab === 'models' && <ProviderModels key={provider.id} state={state} ops={ops} provider={provider}/>}</Tabs.TabPane>
        <Tabs.TabPane itemKey="profile" tab={translateLabel("基础资料")}>{tab === 'profile' && <ProviderMaterialProfile
          key={provider.id + (editing ? ':edit' : ':view:' + provider.updatedAt)} provider={provider}
          editing={editing} ops={ops} saved={saved} edit={() => go({ edit: '1' })} cancel={() => go({ edit: null })}/>}</Tabs.TabPane>
      </Tabs>
    </> : <Empty description="服务商不存在或已删除"/>}
    {ops.leaveDialog}
  </div>;
}
