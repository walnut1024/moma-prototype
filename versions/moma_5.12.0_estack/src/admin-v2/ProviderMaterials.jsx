import { useEffect, useRef, useState } from 'react';
import { Button, Empty, Space, Tabs, Typography } from '@douyinfe/semi-ui';
import { IconPlus } from '@douyinfe/semi-icons';
import AdminActionMenu from './AdminActionMenu';
import Table from './AdminTable';
import { Choice, Notice } from './ServiceUI';
import { SearchBox, useOperations } from './ModelOperationsUI';
import MaterialsHeader, { materialOperationsUi } from './MaterialsHeader';
import ProviderMaterialProfile from './ProviderMaterialProfile';
import MaterialLogo from './MaterialLogo';
import ModelBatchImport from './ModelBatchImport';
import SupplyRegistrationDialog from './SupplyRegistrationDialog';
import { providerCode, PROVIDER_TYPES } from './provider-management';
import { catalogueType } from './SupplierModelMultiSelect';
import { operationsReturn } from './model-pricing-workspace';
import { materialChannelCount, materialProviders, materialSource, providerMaterialModels, viewMaterialChannels } from './provider-materials';

const pageSize = 20;
const pageNumber = (value, count) => Math.min(Math.max(1, Number.parseInt(value, 10) || 1), Math.ceil(count / pageSize) || 1);
const pageRows = (rows, page) => rows.slice((page - 1) * pageSize, page * pageSize);
const listParams = { provider: null, view: null, tab: null, edit: null, returnTo: null, modelQ: null, modelPage: null };

function ProviderList({ state, ops, providers }) {
  const query = ops.params.get('q') || '';
  const sourceType = ops.params.get('type') || 'all';
  const rows = providers.filter(row => (sourceType === 'all' || sourceType === row.sourceType)
    && (row.name + ' ' + providerCode(row)).toLowerCase().includes(query.trim().toLowerCase()));
  const page = pageNumber(ops.params.get('page'), rows.length);
  const update = patch => ops.go(patch, { replace: true, preserveScroll: true });
  const open = (provider, edit) => ops.go({ provider: provider.id, view: null, tab: edit ? 'profile' : null, edit: edit ? '1' : null });
  return <>
    <div className="materials-toolbar">
      <div className="materials-filters">
        <SearchBox placeholder="搜索服务商名称或编码" value={query} onChange={q => update({ q: q || null, page: null })}/>
        <Choice label="筛选供给类型" value={sourceType} options={[[ 'all', '全部供给类型' ], ...Object.entries(PROVIDER_TYPES)]}
          onChange={type => update({ type: type === 'all' ? null : type, page: null })}/>
      </div>
      <Space wrap>
        <AdminActionMenu label="批量导入" disabled={!ops.can} items={[
          { node: 'item', name: '服务商资料', onClick: () => ops.go({ view: 'import' }) },
          { node: 'item', name: '供应关系', onClick: () => ops.go({ view: 'relations' }) },
        ]}>批量导入</AdminActionMenu>
        <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!ops.can} onClick={() => ops.go({ view: 'new' })}>添加服务商</Button>
      </Space>
    </div>
    <Table rowKey="id" dataSource={pageRows(rows, page)} scroll={{ x: 'max(100%, 900px)' }} empty="没有符合条件的服务商"
      pagination={{ pageSize, currentPage: page, total: rows.length, onPageChange: page => update({ page }) }} columns={[
      { title: '服务商名称', width: 220, render: (_, row) => <Button theme="borderless" onClick={() => open(row)}>{row.name}</Button> },
      { title: '服务商编码', width: 160, render: (_, row) => <Typography.Text className="materials-code">{providerCode(row)}</Typography.Text> },
      { title: '服务商 Logo', width: 120, render: (_, row) => <MaterialLogo key={row.logo || ''} src={row.logo} alt={row.name + '的服务商 Logo'}/> },
      { title: '供给类型', width: 150, render: (_, row) => PROVIDER_TYPES[row.sourceType] || '—' },
      { title: '已登记模型数', align: 'right', width: 130, render: (_, row) => <Button theme="borderless" aria-label={`查看 ${row.name} 的供应模型`} onClick={() => open(row)}>{providerMaterialModels(state, row).length}</Button> },
      { title: '操作', width: 150, render: (_, row) => <Space>
        <Button theme="borderless" disabled={!ops.can} onClick={() => open(row, true)}>编辑</Button>
        <Button theme="borderless" onClick={() => viewMaterialChannels(ops, row.id)}>查看渠道</Button>
      </Space> },
    ]}/>
  </>;
}

function ProviderModels({ state, ops, provider }) {
  const [registering, setRegistering] = useState(false);
  const trigger = useRef(null);
  const query = ops.params.get('modelQ') || '';
  const rows = providerMaterialModels(state, provider).filter(({ master }) =>
    (master.name + ' ' + master.modelId).toLowerCase().includes(query.trim().toLowerCase()));
  const page = pageNumber(ops.params.get('modelPage'), rows.length);
  const update = patch => ops.go(patch, { replace: true, preserveScroll: true });
  return <>
    <div className="materials-toolbar">
      <div className="materials-filters"><SearchBox placeholder="搜索模型展示名或规范模型标识" value={query}
        onChange={modelQ => update({ modelQ: modelQ || null, modelPage: null })}/></div>
      <Space wrap>
        <Button disabled={!ops.can} onClick={() => ops.go({ view: 'modelImport' })}>批量导入并登记</Button>
        <Button theme="solid" disabled={!ops.can} onClick={event => { trigger.current = event.currentTarget; setRegistering(true); }}>登记供应模型</Button>
      </Space>
    </div>
    <Table rowKey="id" dataSource={pageRows(rows, page)} scroll={{ x: 'max(100%, 730px)' }} empty={query ? '没有符合条件的模型' : '暂无已登记模型'}
      pagination={{ pageSize, currentPage: page, total: rows.length, onPageChange: modelPage => update({ modelPage }) }} columns={[
      { title: '模型展示名', width: 200, render: (_, { master }) => <Button theme="borderless" onClick={() =>
        ops.go({ view: 'template', template: master.id, materialMode: 'view', returnTo: materialSource(location.hash) }, { base: 'model-templates', reset: true })}>{master.name}</Button> },
      { title: '规范模型标识', width: 220, render: (_, { master }) => <Typography.Text className="materials-code">{master.modelId}</Typography.Text> },
      { title: '模型类型', width: 120, render: (_, { master }) => catalogueType(master.type) },
      { title: '渠道数', align: 'right', width: 80, render: (_, row) => materialChannelCount(row) },
      { title: '操作', width: 110, render: (_, { master }) => <Button theme="borderless" onClick={() => viewMaterialChannels(ops, provider.id, master.id)}>查看渠道</Button> },
    ]}/>
    {registering && <SupplyRegistrationDialog state={state} ops={ops} provider={provider} close={() => {
      setRegistering(false);
      ops.setError('');
      requestAnimationFrame(() => trigger.current?.focus());
    }}/>}
  </>;
}

export default function ProviderMaterials(props) {
  const { state, transact } = props;
  const ops = useOperations({ ...props, ...materialOperationsUi }, 'provider-materials');
  const { params, go } = ops;
  const providers = materialProviders(state);
  const providerId = params.get('provider');
  const provider = providers.find(row => row.id === providerId) || state.providers.find(row => row.id === providerId && !row.deletedAt);
  const view = params.get('view'), tab = params.get('tab') === 'profile' ? 'profile' : 'models';
  const editing = params.get('edit') === '1';
  const returnTo = operationsReturn(params.get('returnTo'));
  const title = useRef(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, [providerId, view]);
  const back = () => returnTo ? ops.proceed(() => { location.hash = returnTo; }) : go(listParams);
  const saved = id => {
    if (view === 'new' && returnTo?.startsWith('#/admin-2/providers')) {
      go({ provider: id, perspective: 'suppliers', tab: 'catalogue' }, { base: 'providers', reset: true, saved: true });
    } else go({ provider: id, view: null, edit: null, tab: view === 'new' ? null : 'profile' }, { saved: true });
  };
  const importKind = view === 'modelImport' && provider ? 'model' : view === 'import' ? 'provider' : view === 'relations' ? 'relation' : null;
  return <div className="semi-materials materials-page">
    <MaterialsHeader active="provider-materials" ops={ops}/>
    {!importKind && ops.conflict && <div className="materials-description"><Notice error>资料已有修订，当前输入保留。<Button theme="borderless" onClick={ops.reload}>载入最新数据</Button></Notice></div>}
    {(providerId || view) && <div className="materials-description">
      <Button theme="borderless" onClick={importKind && provider ? () => go({ view: null }) : back}>
        {importKind && provider ? '返回供应模型' : returnTo?.startsWith('#/admin-2/providers') ? '返回渠道接入' : returnTo ? '返回来源页面' : '返回服务商列表'}
      </Button>
    </div>}
    {importKind ? <div className="materials-description">
      <Typography.Title heading={4}><span ref={title} tabIndex={-1}>{importKind === 'provider' ? '批量导入服务商资料' : importKind === 'relation' ? '批量导入供应关系' : '批量导入并登记'}</span></Typography.Title>
      <ModelBatchImport key={view + (provider?.id || '')} kind={importKind} providerId={provider?.id} state={state} ops={ops} transact={transact}
        close={saved => provider ? go({ view: null }, { saved }) : go(listParams, { saved })}/>
    </div> : view === 'new' ? <>
      <Typography.Title heading={4}><span ref={title} tabIndex={-1}>添加服务商</span></Typography.Title>
      <ProviderMaterialProfile key="new" editing ops={ops} cancel={back} saved={saved}/>
    </> : provider ? <>
      <Typography.Title heading={4}><span ref={title} tabIndex={-1}>{provider.name}</span></Typography.Title>
      <Tabs activeKey={tab} onChange={tab => go({ tab: tab === 'profile' ? tab : null, edit: null }, { preserveScroll: true })} aria-label="服务商资料详情">
        <Tabs.TabPane itemKey="models" tab="供应模型">{tab === 'models' && <ProviderModels key={provider.id} state={state} ops={ops} provider={provider}/>}</Tabs.TabPane>
        <Tabs.TabPane itemKey="profile" tab="基础资料">{tab === 'profile' && <ProviderMaterialProfile
          key={provider.id + (editing ? ':edit' : ':view:' + provider.updatedAt)} provider={provider}
          editing={editing} ops={ops} saved={saved} edit={() => go({ edit: '1' })} cancel={() => go({ edit: null })}/>}</Tabs.TabPane>
      </Tabs>
    </> : providerId ? <Empty description="服务商不存在或已移除"/>
      : <ProviderList state={state} ops={ops} providers={providers}/>}
    {ops.leaveDialog}
  </div>;
}
