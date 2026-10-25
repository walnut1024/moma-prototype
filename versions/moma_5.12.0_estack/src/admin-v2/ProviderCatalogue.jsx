import { Fragment, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Choice, Field } from './ModelMetadataForm';
import { MODEL_TYPES } from './model-management';
import { GridTable, Row, Cell, Modal } from './ModelOperationsUI';
import { catalogueMoneyDisplay, cataloguePriceDraft, cataloguePurchasePrice, cataloguePurchasePriceInput } from './provider-catalogue-pricing';
import { tariffDictionaryEntries, tariffOptions, appendCommonTariffScenarios, tariffScenarioUnit } from './tariff-dictionary';
import { TariffChoice } from './TariffDictionary';
import { catalogueModelMatch } from './model-operations';
import { providerCatalogueIds, providerCatalogueModel } from './moma-provider';
import { providerCataloguePrice, isPayAsYouGoPrice } from './moma-catalogue-prices';
import CatalogueConnectionEditor from './CatalogueConnectionEditor';
import { catalogueConnections } from './provider-model-connections';
import { connectionCredentialsReady, connectionTestPassed } from './connection-state';
import { displayTime } from './model-management';
import { PROTOCOLS } from './provider-management';

const blankScenario = () => ({ name: '', listPrice: '', unit: '', currency: 'CNY' });
const pending = <span className="supplier-key-pending">待配置</span>;
const amount = (value, currency) => value == null ? pending : `${currency && currency !== 'CNY' ? currency + ' ' : ''}${catalogueMoneyDisplay(value)}`;

function CommonScenarioBatch({ state, names, rows, currency, disabled, onAdd }) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState([]), [query, setQuery] = useState(''), [error, setError] = useState('');
  const existing = new Set(rows.map(item => item.name.trim().toLowerCase()));
  const visible = names.filter(name => [name, tariffDictionaryEntries(state).find(item => item.kind === 'scenario' && item.name === name)?.englishName].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <Popover open={open} onOpenChange={next => { setOpen(next); setSelected([]); setQuery(''); setError(''); }}><PopoverTrigger asChild><Button type="button" size="sm" disabled={disabled}><Plus data-icon="inline-start"/>批量添加常用计费项</Button></PopoverTrigger><PopoverContent align="end" className="supplier-bulk-scenarios"><strong>选择常用计费项</strong><Input aria-label="搜索常用计费项" placeholder="搜索常用计费项" value={query} onChange={event => setQuery(event.target.value)}/><fieldset className="supplier-bulk-options"><legend className="sr-only">选择要添加的计费项</legend>{visible.map(name => {
    const added = existing.has(name.toLowerCase());
    return <label key={name}><Checkbox aria-label={`批量选择 ${name}`} checked={added || selected.includes(name)} disabled={disabled || added} onCheckedChange={checked => { setSelected(checked === true ? [...selected, name] : selected.filter(item => item !== name)); setError(''); }}/><span>{name}<small className="supplier-tariff-english">{tariffScenarioUnit(state, name) || '单位待配置'}</small></span>{added && <small>已添加</small>}</label>;
  })}{!visible.length && <p>没有匹配的常用计费项。</p>}</fieldset><small className="supplier-price-hint">新增行按计费项带出计价单位，未配置或已停用的单位需手动选择。已添加的同名计费项会跳过。</small>{error && <p role="alert" className="supplier-key-error">{error}</p>}<div className="supplier-key-actions"><Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>取消选择</Button><Button type="button" size="sm" disabled={disabled || !selected.length} onClick={() => {
    try { onAdd(appendCommonTariffScenarios(rows, selected, state, currency)); setOpen(false); } catch (issue) { setError(issue.message); }
  }}>添加 {selected.length} 行</Button></div></PopoverContent></Popover>;
}

export function CataloguePriceEditor({ state, provider, modelId, ops, close, manageDictionary, adding = false }) {
  const names = tariffOptions(state, 'scenario').filter(name => provider.id !== 'provider-moma' || isPayAsYouGoPrice({ name }));
  const units = tariffOptions(state, 'unit').filter(unit => provider.id !== 'provider-moma' || isPayAsYouGoPrice({ unit }));
  const [value, setValue] = useState(() => {
    const draft = cataloguePriceDraft(adding ? undefined : providerCataloguePrice(provider, modelId));
    return { ...draft, scenarios: draft.scenarios.length ? draft.scenarios : [blankScenario()] };
  });
  const [newModelId, setModelId] = useState('');
  const [protocol, setProtocol] = useState('OpenAI'), [baseUrl, setBaseUrl] = useState('');
  const [modelType, setModelType] = useState('text');
  const [endpoint, setEndpoint] = useState('');
  const change = next => { setValue(next); ops.dirty(true); ops.setError(''); };
  const scenario = (index, patch) => change({ ...value, scenarios: value.scenarios.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const preview = item => {
    try { return cataloguePurchasePriceInput(item, value.discountFactor); }
    catch { return ''; }
  };
  const cancel = () => ops.proceed(close);
  return <Modal wide title={adding ? '添加模型' : '修改目录价'} description={adding ? provider.name : modelId} onClose={cancel}><form className={`supplier-price-form${adding ? ' supplier-catalogue-add-form' : ''}`} noValidate onSubmit={event => {
    event.preventDefault();
    if (ops.run('provider', { operation: adding ? 'catalogueAdd' : 'cataloguePrice', objectId: provider.id, values: { scenarios: value.scenarios, modelId: adding ? newModelId : modelId, ...(adding ? { modelType, endpoint, protocol, baseUrl, discountFactor: value.discountFactor } : {}) } })) close();
  }}>
    <div className="supplier-price-body">
      {adding && <div className="supplier-catalogue-add-fields">
        <Field label="供应商"><Input aria-label="供应商" readOnly tabIndex={-1} value={provider.name}/></Field>
        <Field label="模型ID *" hint="区分大小写，最多 200 字。"><Input aria-label="模型ID" required autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={200} placeholder="请输入模型ID" value={newModelId} disabled={!ops.can} onChange={event => { setModelId(event.target.value); ops.dirty(true); ops.setError(''); }}/></Field>
        <Field label="模型类型 *"><Choice label="模型类型" value={modelType} options={Object.entries(MODEL_TYPES)} disabled={!ops.can} onChange={type => { setModelType(type); ops.dirty(true); ops.setError(''); }}/></Field>
        <Field label="Endpoint *" hint="填写以 / 开头的接口路径或完整 HTTP/HTTPS 地址。"><Input aria-label="Endpoint" required autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={2048} placeholder="/v1/chat/completions 或 https://api.example.com/v1/chat/completions" value={endpoint} disabled={!ops.can} onChange={event => { setEndpoint(event.target.value); ops.dirty(true); ops.setError(''); }}/></Field>
        <Field label="协议 *"><Choice label="协议" value={protocol} options={PROTOCOLS.map(value => [value, value])} disabled={!ops.can} onChange={value => { setProtocol(value); ops.dirty(true); ops.setError(''); }}/></Field>
        <Field label="接入地址（Base URL）*" hint={provider.sourceType === 'selfHosted' ? '填写完整 HTTP / HTTPS 服务地址。' : '填写完整 HTTPS 服务地址。'}><Input aria-label="接入地址（Base URL）" required autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={2048} placeholder="https://api.example.com/v1" value={baseUrl} disabled={!ops.can} onChange={event => { setBaseUrl(event.target.value); ops.dirty(true); ops.setError(''); }}/></Field>
        <Field label="采购折扣系数" hint="默认 1；0–1，最多 6 位小数。采购价默认按目录价 × 折扣系数计算，可手动修改。"><Input aria-label="采购折扣系数" inputMode="decimal" placeholder="1" value={value.discountFactor} disabled={!ops.can} onChange={event => change({ ...value, discountFactor: event.target.value })}/></Field>
      </div>}
      <div className="supplier-price-scenes-heading"><h3>计费项</h3><div className="supplier-row-actions"><Button variant="ghost" size="sm" type="button" onClick={manageDictionary}>维护资费字典</Button><Button variant="outline" size="sm" type="button" disabled={!ops.can || value.scenarios.length >= 100} onClick={() => change({ ...value, scenarios: [...value.scenarios, blankScenario()] })}>添加自定义计费项</Button><CommonScenarioBatch state={state} names={names} rows={value.scenarios} currency={blankScenario().currency} disabled={!ops.can} onAdd={scenarios => change({ ...value, scenarios })}/></div></div>
      <p className="supplier-price-hint">{adding ? '至少填写一条计费项；计费项、目录价和计价单位必填，免费请填 0。' : '按供应商报价选择适用计费项，长度档位、时段等差异请在资费字典中维护为独立计费项。新报价采用人民币，历史外币报价保留币种标识，不进行汇率换算。'}</p>
      <p id="catalogue-purchase-hint" className="supplier-price-hint">采购价默认按目录价 × 采购折扣系数计算，可手动修改，最多 6 位小数；手动值不随目录价或折扣变化，清空后恢复自动计算。</p>
      <GridTable className="supplier-price-input-table" headings={['计费项', '目录价（单位：元）', '计价单位', '采购价（单位：元）', '操作']} empty={!value.scenarios.length} emptyMessage="尚无计费项，请选择常用项或添加自定义项配置价格。">{value.scenarios.map((item, index) => <Row key={index}>
        <Cell><TariffChoice label={`第 ${index + 1} 条计费项`} kind="scenario" options={names} entries={tariffDictionaryEntries(state).filter(item => item.kind === 'scenario').map(item => ({ ...item, description: tariffScenarioUnit(state, item.name) || '单位待配置' }))} value={item.name} disabled={!ops.can} onChange={name => scenario(index, { name, unit: tariffScenarioUnit(state, name) })}/>{item.condition && <Input className="supplier-price-condition-input" aria-label={`第 ${index + 1} 条适用条件`} placeholder="适用条件（选填）" maxLength={160} value={item.condition || ''} disabled={!ops.can} onChange={event => scenario(index, { condition: event.target.value })}/>}</Cell>
        <Cell>{item.currency && item.currency !== 'CNY' && <small>{item.currency}</small>}<Input aria-label={`第 ${index + 1} 条目录价`} inputMode="decimal" placeholder={adding ? '必填，免费填 0' : '待配置'} value={item.listPrice} disabled={!ops.can} onChange={event => scenario(index, { listPrice: event.target.value })}/></Cell>
        <Cell><TariffChoice label={`第 ${index + 1} 条计价单位`} kind="unit" options={units} entries={tariffDictionaryEntries(state).filter(item => item.kind === 'unit')} value={item.unit} disabled={!ops.can} onChange={unit => scenario(index, { unit })}/></Cell>
        <Cell className="supplier-price-number"><Input aria-label={`第 ${index + 1} 条采购价`} aria-describedby="catalogue-purchase-hint" inputMode="decimal" placeholder="自动计算，可手动填写" value={preview(item)} disabled={!ops.can} onChange={event => scenario(index, { purchasePrice: event.target.value })} onBlur={() => { if (item.purchasePrice === '') scenario(index, { purchasePrice: undefined }); }}/></Cell>
        <Cell><Button type="button" size="icon-sm" variant="ghost" aria-label={`移除第 ${index + 1} 条计费项`} disabled={!ops.can} onClick={() => change({ ...value, scenarios: value.scenarios.filter((_, i) => i !== index) })}><Trash2/></Button></Cell>
      </Row>)}</GridTable>
    </div>
    {ops.error && <p role="alert" className="supplier-key-error">{ops.error}</p>}
    <div className="supplier-price-footer"><span>{adding ? '保存到当前供应商目录；添加到服务管理及上架需另行配置。' : '修改目录价、采购价与计费项，采购折扣系数保持不变。'}</span><Button variant="outline" type="button" onClick={cancel}>取消</Button><Button type="submit" disabled={!ops.can}>{adding ? '保存模型' : '保存目录价'}</Button></div>
  </form></Modal>;
}

function CatalogueDiscountEditor({ provider, modelId, ops, close }) {
  const [discountFactor, setDiscount] = useState(() => cataloguePriceDraft(providerCataloguePrice(provider, modelId)).discountFactor);
  const cancel = () => ops.proceed(close);
  return <Modal title="修改折扣系数" description={modelId} onClose={cancel}><form className="supplier-key-form" noValidate onSubmit={event => {
    event.preventDefault();
    if (ops.run('provider', { operation: 'catalogueDiscount', objectId: provider.id, values: { modelId, discountFactor } })) close();
  }}>
    <Field label="采购折扣系数" hint="此模型所有计费项共用。0–1，最多 6 位小数；例如 0.8 为八折，1 为原价。默认 1 为原价，留空保存时按 1。"><Input aria-label="采购折扣系数" aria-invalid={Boolean(ops.error)} aria-describedby={ops.error ? 'catalogue-discount-error' : undefined} inputMode="decimal" placeholder="例如 0.8" value={discountFactor} disabled={!ops.can} onChange={event => { setDiscount(event.target.value); ops.dirty(true); ops.setError(''); }}/></Field>
    <p className="supplier-price-hint">仅修改采购折扣系数，目录价与计费项保持不变。自动采购价随折扣重新计算，手动填写的采购价保留。</p>
    {ops.error && <p role="alert" id="catalogue-discount-error" className="supplier-key-error">{ops.error}</p>}
    <div className="supplier-key-actions"><Button variant="outline" type="button" onClick={cancel}>取消</Button><Button type="submit" disabled={!ops.can}>保存折扣系数</Button></div>
  </form></Modal>;
}

export default function ProviderCatalogue({ state, provider, ops, manageDictionary, onStop }) {
  const [editing, setEditing] = useState(null), [query, setQuery] = useState(''), trigger = useRef(null);
  const ids = providerCatalogueIds(provider), visible = ids.filter(id => id.toLowerCase().includes(query.trim().toLowerCase()));
  const close = () => { setEditing(null); ops.setError(''); requestAnimationFrame(() => trigger.current?.focus()); };
  return <>
    <div className="supplier-toolbar"><Input type="search" aria-label="搜索目录模型" placeholder="搜索模型名称 / Model ID" value={query} onChange={event => setQuery(event.target.value)}/><span className="supplier-key-pending">{visible.length} / {ids.length} 个模型</span></div>
    <GridTable className="supplier-catalogue-table" headings={['Model ID / 模型', '接入地址 / 协议', '计费项', '目录价（单位：元）', '计价单位', '采购折扣系数', '采购价（单位：元）', '操作']} empty={!visible.length} emptyMessage={ids.length ? '没有匹配的模型，请调整搜索条件。' : '尚未登记模型，请添加 Model ID。'}>{visible.map(id => {
      const connections = catalogueConnections(state, provider, id);
      let match;
      try { match = catalogueModelMatch(state, provider.id, id); } catch { match = {}; }
      const entry = providerCataloguePrice(provider, id), scenes = entry?.scenarios.length ? entry.scenarios : [null], catalogue = providerCatalogueModel(provider, id);
      return <Fragment key={id}>{scenes.map((item, index) => <Row key={index}>
        {index === 0 && <Cell className="supplier-catalogue-identity" rowSpan={scenes.length}><code>{id}</code>{catalogue && <><small>{MODEL_TYPES[catalogue.type]}</small><small className="supplier-url" title={catalogue.endpoint}>{catalogue.endpoint}</small></>}</Cell>}
        {index === 0 && <Cell className="supplier-catalogue-connection" rowSpan={scenes.length}>{connections.length ? connections.map(endpoint => <div className="supplier-model-connection" key={endpoint.id}><small>{endpoint.protocol} · {endpoint.status === '运行中' ? '已启用' : endpoint.status === '需关注' ? '需关注' : '已停用'}</small><code className="supplier-url">{endpoint.baseUrl}</code><small>{connectionTestPassed(endpoint) ? '检查通过' : endpoint.connectionTest?.result === '失败' ? '检查失败' : '待检查'} · {displayTime(endpoint.connectionTest?.testedAt)}</small>{endpoint.connectionTest?.result === '失败' && <small>{endpoint.connectionTest.message}</small>}<div className="supplier-row-actions"><Button variant="link" size="sm" disabled={!ops.can} onClick={() => connectionCredentialsReady(endpoint, provider) ? ops.run('checkConnection', { endpointId: endpoint.id }) : ops.go({ tab: 'api-keys' })}>{connectionCredentialsReady(endpoint, provider) ? '检查并启用' : '配置 API Key'}</Button>{['运行中', '需关注'].includes(endpoint.status) && <Button variant="link" size="sm" disabled={!ops.can} onClick={() => onStop(endpoint)}>停用</Button>}</div></div>) : pending}</Cell>}
        <Cell>{item ? <span className="supplier-catalogue-item" title={item.name + (item.condition ? `（${item.condition}）` : '')}>{item.name}{item.condition ? `（${item.condition}）` : ''}</span> : pending}</Cell><Cell className="supplier-price-number">{amount(item?.listPrice, item?.currency)}</Cell><Cell>{item?.unit || '—'}</Cell>
        {index === 0 && <Cell className="supplier-price-number" rowSpan={scenes.length}>{entry.discountFactor / 1000000}</Cell>}
        <Cell className="supplier-price-number">{amount(cataloguePurchasePrice(item?.listPrice, entry?.discountFactor, item?.purchasePrice), item?.currency)}</Cell>
        {index === 0 && <Cell className="supplier-catalogue-action" rowSpan={scenes.length}><div className="supplier-catalogue-actions"><Button variant="link" size="sm" disabled={!ops.can && !match.supply} aria-label={(match.supply ? '查看模型：' : '添加到服务管理：') + id} onClick={() => ops.proceed(() => {
          const next = new URLSearchParams(match.supply ? { model: match.model.id, tab: 'supplies' } : { view: 'add', step: 'select', provider: provider.id, catalogue: id, origin: location.hash });
          location.hash = '#/admin-2/listing?' + next;
        })}>{match.supply ? '查看模型' : '添加到服务管理'}</Button>{[['connection', connections.length ? '编辑接入地址' : '配置接入地址'], ['discount', '修改折扣系数'], ['price', '修改目录价']].map(([kind, label]) => <Button key={kind} variant="link" size="sm" disabled={!ops.can} aria-label={`${label}：${id}`} onClick={event => { trigger.current = event.currentTarget; ops.setError(''); setEditing({ modelId: id, kind }); }}>{label}</Button>)}</div></Cell>}
      </Row>)}</Fragment>;
    })}</GridTable>
    {editing && (editing.kind === 'connection' ? <CatalogueConnectionEditor key={editing.modelId} state={state} provider={provider} modelId={editing.modelId} ops={ops} close={close}/> : editing.kind === 'discount' ? <CatalogueDiscountEditor key={editing.modelId} provider={provider} modelId={editing.modelId} ops={ops} close={close}/> : <CataloguePriceEditor key={editing.modelId} state={state} provider={provider} modelId={editing.modelId} ops={ops} close={close} manageDictionary={manageDictionary}/>)}
  </>;
}
