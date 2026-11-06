import { useState } from 'react';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Choice } from './ModelMetadataForm';
import { GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { TariffChoice } from './TariffDictionary';
import { tariffOptions, tariffScenarioUnit, tariffDictionaryEntries, appendCommonTariffScenarios, commonTariffNames } from './tariff-dictionary';

export default function ChannelPrices({ state, scenarios, disabled, onChange, ops, priceLabel = '采购价', separateCurrency = false, batchOnly = false, title = '计费项', modelType }) {
  const entries = tariffDictionaryEntries(state), available = tariffOptions(state, 'scenario');
  const row = (index, patch) => onChange(scenarios.map((item, i) => i === index ? { ...item, ...patch } : item));
  const currency = (item, index) => <Choice label={`渠道第 ${index + 1} 条币种`} value={item.currency} options={[...new Set([...tariffOptions(state, 'currency'), item.currency])].map(value => [value, value])} disabled={disabled} onChange={value => row(index, { currency: value })}/>;
  return <section className="supplier-channel-costs supplier-configuration-costs"><h3>{title}</h3>{ops?.conflict && <Notice error>其他页面已更新配置，当前输入保留。<Button type="button" variant="link" onClick={ops.reload}>载入最新配置</Button></Notice>}<div className="supplier-channel-toolbar"><div className="supplier-price-tools">{!batchOnly && <Button type="button" size="sm" variant="outline" disabled={disabled || scenarios.length >= 100} onClick={() => onChange([...scenarios, { name: '', listPrice: '', unit: '', currency: 'CNY' }])}><Plus data-icon="inline-start"/>添加计费项</Button>}<CommonTariffBatchButton modelType={modelType} state={state} scenarios={scenarios} disabled={disabled} onChange={onChange} label="批量添加常用计费项"/></div><Button type="button" variant="link" asChild><a href="#/admin-2/tariff-dictionary?tab=scenario" target="_blank" rel="noopener noreferrer">维护常用计费项<ExternalLink data-icon="inline-end"/></a></Button></div>
    <GridTable className={separateCurrency?'supplier-separated-price-table':''} headings={separateCurrency?['计费项', priceLabel, '货币', '计费单位', '操作']:['计费项', priceLabel, '计价单位', '操作']} empty={!scenarios.length} emptyMessage="请添加计费项。">{scenarios.map((item, index) => <Row key={index}>
      <Cell><TariffChoice label={`渠道第 ${index + 1} 条计费项`} kind="scenario" options={available} entries={entries} value={item.name} disabled={disabled} onChange={name => row(index, { name, unit: tariffScenarioUnit(state, name) })}/><Input aria-label={`渠道第 ${index + 1} 条适用条件`} maxLength={160} value={item.condition || ''} placeholder="适用条件（选填）" disabled={disabled} onChange={event => row(index, { condition: event.target.value })}/></Cell>
      <Cell><div className="supplier-price-input"><Input aria-label={`渠道第 ${index + 1} 条价格`} inputMode="decimal" placeholder="待配置" value={item.listPrice} disabled={disabled} onChange={event => row(index, { listPrice: event.target.value })}/>{!separateCurrency && currency(item,index)}</div></Cell>
      {separateCurrency && <Cell>{currency(item,index)}</Cell>}
      <Cell><TariffChoice label={`渠道第 ${index + 1} 条单位`} kind="unit" options={tariffOptions(state, 'unit')} value={item.unit} disabled={disabled} onChange={unit => row(index, { unit })}/></Cell><Cell><Button type="button" variant="ghost" size={batchOnly ? 'sm' : 'icon-sm'} title="删除计费项" aria-label={`删除渠道计费项 ${index + 1}`} disabled={disabled} onClick={() => onChange(scenarios.filter((_, i) => i !== index))}>{batchOnly ? '删除' : <Trash2/>}</Button></Cell>
    </Row>)}</GridTable>

  </section>;
}

export function CommonTariffBatchButton({ state, scenarios, disabled, onChange, label = '批量添加计费项', modelType }) {
  const [batch, setBatch] = useState(false), [selected, setSelected] = useState([]), [query, setQuery] = useState(''), [error, setError] = useState(''),[all,setAll]=useState(false);
  const entries = tariffDictionaryEntries(state), available = tariffOptions(state, 'scenario');
  return <><Button type="button" size="sm" variant="outline" disabled={disabled || scenarios.length >= 100} onClick={() => { setSelected([]); setQuery(''); setError(''); setBatch(true); }}>{label}</Button>
    {batch && <Modal title={label} onClose={() => setBatch(false)}><div className="supplier-common-items"><Input aria-label="搜索常用计费项" placeholder="搜索中文 / 英文名称" value={query} onChange={event => setQuery(event.target.value)}/><div className="supplier-common-toolbar"><Button type="button" variant={all?"outline":"default"} onClick={()=>setAll(false)}>常用计费项</Button><Button type="button" variant={all?"default":"outline"} onClick={()=>setAll(true)}>全部计费项（{available.length}）</Button><span>已选 {selected.length} 项</span></div><div className="supplier-common-item-options">{(all || query.trim()?available:commonTariffNames(available,modelType)).filter(name => { const entry = entries.find(item => item.kind === 'scenario' && item.name === name); return `${name} ${entry?.englishName || ''}`.toLowerCase().includes(query.trim().toLowerCase()); }).map(name => { const added = scenarios.some(row => row.name.trim().toLowerCase() === name.toLowerCase()); return <label key={name}><input type="checkbox" checked={added || selected.includes(name)} disabled={disabled || added} onChange={event => setSelected(event.target.checked ? [...selected, name] : selected.filter(item => item !== name))}/><span>{name}</span><small>{added ? '已添加' : tariffScenarioUnit(state, name)}</small></label>; })}</div>{error && <Notice error>{error}</Notice>}<div className="supplier-key-actions"><Button type="button" variant="outline" onClick={() => setBatch(false)}>取消</Button><Button type="button" disabled={disabled || !selected.length} onClick={() => { try { onChange(appendCommonTariffScenarios(scenarios, selected, state, 'CNY')); setBatch(false); } catch (issue) { setError(issue.message); } }}>添加所选项</Button></div></div></Modal>}
  </>;
}
