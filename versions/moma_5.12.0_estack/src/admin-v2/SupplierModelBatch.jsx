import { useState } from 'react';
import { Button, Card, Checkbox, Collapse, Input, Steps, Typography } from '@douyinfe/semi-ui';
import { Choice, Field } from './ModelMetadataForm';
import { Heading, Notice, GridTable, Row, Cell, ScopeFields, Price } from './ModelOperationsUI';
import { CompletePriceTable } from './SupplyPriceEditor';
import { modelLibrary, libraryRecord } from './model-operations';
import { priceItems } from './model-management';
import { markedUpItems, parseSaleAmount } from './provider-catalogue-pricing';
import { supplierListingRows, supplierBatchEntry, previewSupplierBatch, listingPreferences, rememberCatalogueSelection, selectedCatalogueIds } from './supplier-listing';

const steps = ['核对关联与价格', '检查配置', '确认上架'];

export default function SupplierModelBatch({ state, ops, home, viewSwitch }) {
  const provider = state.providers.find(item => item.id === ops.params.get('provider'));
  const catalogue = supplierListingRows(state, provider);
  const batch = listingPreferences(localStorage).batch;
  const selectedRows = batch?.providerId === provider?.id && Array.isArray(batch.ids) ? catalogue.filter(row => batch.ids.includes(row.catalogueModelId)) : [];
  const [entries, setEntries] = useState(() => {
    return selectedRows.filter(row => !row.selling).map(row => supplierBatchEntry(state, row));
  });
  const [stage, setStage] = useState(ops.params.get('batchMode') === 'review' ? 'check' : 'configure');
  const [check, setCheck] = useState(() => ops.params.get('batchMode') === 'review' && provider && entries.length ? previewSupplierBatch(state, 'submitSupplierBatch', provider.id, entries) : null), [markup, setMarkup] = useState('20');
  const [applyScope, setApplyScope] = useState(false), [scope, setScope] = useState({ openScope: 'all', tenantIds: [] }), [done, setDone] = useState(0);
  const library = modelLibrary(state);
  const setEntry = (id, patch) => { setEntries(current => current.map(entry => entry.catalogueModelId === id ? { ...entry, ...patch } : entry)); ops.dirty(true); ops.setError(''); };
  const payload = () => entries.map(entry => ({ ...entry, ...(applyScope ? { listingScope: scope } : {}) }));
  const inspect = () => { setCheck(previewSupplierBatch(state, 'submitSupplierBatch', provider.id, payload())); setStage('review'); };
  const publish = async () => {
    if (!check?.ready.length || check.revision !== state.revision) return;
    const next = await ops.run('submitSupplierBatch', { providerId: provider.id, items: check.ready });
    if (!next) return;
    setDone(check.ready.length); setStage('done');
    const completed = new Set(check.ready.map(item => item.catalogueModelId));
    rememberCatalogueSelection(localStorage, provider, selectedCatalogueIds(localStorage, provider).filter(id => !completed.has(id)));
  };
  const maintainMaster = entry => ops.go({ view: 'template', template: entry.libraryId || null, code: entry.catalogueModelId, returnListing: location.hash }, { base: 'model-templates' });
  if (!provider || !entries.length) return <><Heading title="批量配置与上架"/><Notice error={!provider || !selectedRows.length}>{provider && selectedRows.length ? '本批次模型已上架，可返回列表继续管理。' : '服务商或所选目录模型已变化，请返回列表重新选择。'}<Button theme="borderless" type="tertiary" onClick={home}>返回服务商视角</Button></Notice></>;
  const stale = check && check.revision !== state.revision;
  const step = stage === 'configure' ? 0 : stage === 'check' ? 1 : 2;
  return <>
    <Heading title="批量配置与上架" description={`${provider.name} · 已选 ${entries.length} 个目录模型`}>{viewSwitch}<Button theme="light" onClick={home}>返回服务商视角</Button></Heading>
    <Card>
      <div className="supplier-batch-steps" aria-hidden="true" inert>
        <Steps type="basic" size="small" current={step} status={stage === 'done' ? 'finish' : 'process'}>
          {steps.map(label => <Steps.Step key={label} title={label}/>)}
        </Steps>
      </div>
      <div className="sr-only" role="status">上架步骤 {step + 1} / {steps.length}，{steps[step]}</div>
    </Card>
    {stage === 'configure' ? <Card><div className="ss-body mo-supplier-batch">
      <div className="mo-batch-tools"><Field label="加价比例（%）"><Input aria-label="批量加价比例" inputMode="decimal" value={markup} disabled={!ops.can} onChange={value => setMarkup(value)}/></Field><Button theme="light" disabled={!ops.can} onClick={() => {
        try { const next = entries.map(entry => { const row = catalogue.find(row => row.catalogueModelId === entry.catalogueModelId); return { ...entry, prices: markedUpItems(row.costs, markup) }; }); setEntries(next); ops.dirty(true); ops.setError(''); }
        catch (error) { ops.setError(error.message); }
      }}>按采购价批量填入</Button><p>逐计费项计算平台售价，保留币种、单位和适用条件；可展开模型单独调整。</p></div>
      <div className="mo-batch-scope"><Checkbox checked={applyScope} disabled={!ops.can} onChange={event => { setApplyScope(event.target.checked); if (!event.target.checked) setEntries(current => current.map(entry => ({ ...entry, listingScope: null }))); ops.dirty(true); }}>统一设置所选模型的订购范围</Checkbox>{applyScope ? <ScopeFields state={state} {...scope} disabled={!ops.can} onChange={(openScope, tenantIds) => { setScope({ openScope, tenantIds }); ops.dirty(true); }}/> : <p>沿用各项已保存的范围；未设置时保留已有模型范围，新模型默认为全部租户。确认页将逐项展示。</p>}</div>
      <Collapse defaultActiveKey={[entries[0].catalogueModelId]}>{entries.map(entry => {
        const row = catalogue.find(row => row.catalogueModelId === entry.catalogueModelId), master = libraryRecord(state, entry.libraryId);
        if (!row) return <Notice error key={entry.catalogueModelId}>目录模型 {entry.catalogueModelId} 已移除，请返回列表重新选择。</Notice>;
        const needsIdentity = master && !row.model && master.modelId !== row.catalogueModelId;
        return <Collapse.Panel key={entry.catalogueModelId} itemKey={entry.catalogueModelId} header={
          <div className="supplier-batch-model-heading">
            <Typography.Text strong>{entry.catalogueModelId}</Typography.Text>
            <Typography.Text type="secondary">{master?.name || '待关联模型资料'}</Typography.Text>
            <Typography.Text type="tertiary">{entry.prices.length} 个计费项 · {row.issue || '配置完整'}</Typography.Text>
          </div>
        }><div className="ss-body mo-batch-model-body">
          <div className="mo-form-grid"><Field label="关联模型资料 *"><Choice label={`关联模型资料 ${entry.catalogueModelId}`} value={entry.libraryId || '__none'} disabled={!ops.can} options={[[ '__none', '请选择模型资料'], ...library.map(item => [item.id, `${item.name} · ${item.modelId}`])]} onChange={id => { const record = libraryRecord(state, id); setEntry(entry.catalogueModelId, { libraryId: record?.id || '', libraryRevision: record?.updatedAt || '', confirmedIdentity: false }); }}/></Field><Field label="服务商接入地址 *"><Choice label={`接入地址 ${entry.catalogueModelId}`} value={entry.endpointId || '__none'} disabled={!ops.can} options={[[ '__none', '请选择已配置接入'], ...state.endpoints.filter(item => item.providerId === provider.id).map(item => [item.id, item.baseUrl || item.name])]} onChange={id => setEntry(entry.catalogueModelId, { endpointId: id === '__none' ? '' : id })}/></Field></div>
          <div className="mo-row-actions"><Button theme="borderless" type="tertiary" disabled={!ops.can} onClick={() => maintainMaster(entry)}>{master ? '维护模型资料' : '登记模型资料'}</Button><Button theme="borderless" type="tertiary" onClick={() => ops.proceed(() => { location.hash = '#/admin-2/providers?provider=' + encodeURIComponent(provider.id) + '&tab=catalogue'; })}>维护服务商目录与接入</Button><Button theme="borderless" type="tertiary" disabled={!ops.can} onClick={() => ops.proceed(() => { setEntries(current => current.map(value => value.catalogueModelId === entry.catalogueModelId ? { ...supplierBatchEntry(state, { ...row, draft: null }), draftId: row.draft?.id || "" } : value)); ops.dirty(true); ops.setError(''); })}>重新载入本项配置</Button></div>
          {needsIdentity && <Checkbox checked={entry.confirmedIdentity} disabled={!ops.can} onChange={event => setEntry(entry.catalogueModelId, { confirmedIdentity: event.target.checked })}>已核对目录模型与所选平台模型的身份和版本一致</Checkbox>}
          <CompletePriceTable cost={row.costs} sale={priceItems(row.sale, master || { type: 'text' })} rows={entry.prices} disabled={!ops.can} setRows={prices => setEntry(entry.catalogueModelId, { prices })}/>
        </div></Collapse.Panel>;
      })}</Collapse>
      <div className="admin-form-actions"><Button theme="solid" disabled={!ops.can} onClick={inspect}>预览并检查配置</Button></div>
    </div></Card> : <Card><div className="ss-body mo-supplier-batch">
      {stage === 'done' ? <Notice>已上架 {done} 个模型，另有 {check.blocked.length} 个待处理。未通过检查的项目未提交。</Notice> : <><Typography.Title heading={4} component="h2">{stage === 'review' ? '确认上架销售' : '配置检查结果'}</Typography.Title><p>本次可继续 {check.ready.length} 个，待处理 {check.blocked.length} 个。{stage === 'review' ? '确认后将发布平台售价并开放订购；其他服务商保持原配置。' : '保存合格项的关联、未上架售价及检查结果，销售和服务状态保持到最终确认。'}</p></>}
      {stale && stage !== 'done' && <Notice error>数据已有修订，请返回配置重新核对；当前输入保留。</Notice>}
      <GridTable headings={['目录模型', '关联平台模型', '平台售价', '订购范围', '检查结果']} empty={false}>{entries.map(entry => {
        const blocked = check.blocked.find(item => item.catalogueModelId === entry.catalogueModelId), master = libraryRecord(state, entry.libraryId), listingScope = applyScope ? scope : entry.listingScope || master;
        return <Row key={entry.catalogueModelId}><Cell><code>{entry.catalogueModelId}</code></Cell><Cell>{master?.name || '未关联'}</Cell><Cell>{blocked ? '待核对' : <Price model={master} price={{ items: entry.prices.map(item => ({ ...item, amount: parseSaleAmount(item.amount, false) })) }}/>}</Cell><Cell>{listingScope?.openScope === 'selected' ? `${listingScope.tenantIds.length} 个指定租户` : '全部租户'}</Cell><Cell>{blocked ? <span className="mo-pending">{blocked.reason}</span> : stage === 'done' ? '已上架销售' : stage === 'review' ? '检查通过，待确认上架' : '配置检查通过'}</Cell></Row>;
      })}</GridTable>
      <div className="admin-form-actions">{stage === 'done' ? <Button onClick={home}>返回服务商视角</Button> : <><Button theme="light" onClick={() => { setStage('configure'); setCheck(null); }}>返回配置</Button><Button theme="solid" disabled={!ops.can || stale || !check.ready.length} onClick={publish}>{`确认上架 ${check.ready.length} 个模型`}</Button></>}</div>
    </div></Card>}
  </>;
}
