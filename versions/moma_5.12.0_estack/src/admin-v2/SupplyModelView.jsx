import { useState } from 'react';
import { Button } from '../components/ui/button';
import { SearchBox, Notice } from './ModelOperationsUI';
import ProviderCatalogue from './ProviderCatalogue';

export function SupplyModelSidebar({ models, selected, ops }) {
  const [query, setQuery] = useState('');
  const matches = models.filter(row => (row.name + ' ' + row.code).toLowerCase().includes(query.trim().toLowerCase()));
  return <><SearchBox value={query} placeholder="搜索模型名称 / ID" onChange={setQuery}/><nav className="supplier-sidebar-options supplier-model-options" aria-label="供应模型">{matches.map(row => <Button key={row.id} variant="ghost" aria-pressed={selected?.id === row.id} title={row.code} onClick={() => ops.go({ supplyModel: row.id })}><span>{row.name}</span>{!row.master && models.some(other => other.id !== row.id && other.name === row.name) && <small>{row.entries[0].provider.name}</small>}</Button>)}{!matches.length && <p role="status">没有匹配的模型</p>}</nav></>;
}

export default function SupplyModelView({ state, selected, ops }) {
  const requested = ops.params.get('supplyModel');
  return <section className="supplier-body supplier-model-panel"><div className="supplier-model-heading"><div><h2>{selected?.name || '模型供给'}</h2>{selected?.master?.maker && <span>开发者：{selected.master.maker}</span>}</div></div>{selected ? <>{!selected.master && <div className="supplier-resource-notice"><Notice>该供应模型尚未关联统一模型资料。<Button variant="link" onClick={() => ops.go({ perspective: 'suppliers', provider: selected.entries[0].provider.id, tab: 'catalogue', supplyModel: null })}>关联模型资料</Button></Notice></div>}<ProviderCatalogue key={selected.id} state={state} entries={selected.entries} ops={ops}/></> : <div className="mo-empty" role="status">{requested ? '当前模型供给已变化，请重新选择模型。' : '尚未配置模型供给，请添加渠道。'}</div>}</section>;
}
