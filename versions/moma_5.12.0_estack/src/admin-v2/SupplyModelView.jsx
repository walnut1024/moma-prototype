import { useState } from 'react';
import { Button, Card, Typography } from '@douyinfe/semi-ui';
import { SearchBox, Notice } from './ModelOperationsUI';
import { catalogueType } from './SupplierModelMultiSelect';
import SupplierModelCatalogue from './SupplierModelCatalogue';

export function SupplyModelSidebar({ models, selected, ops }) {
  const [query, setQuery] = useState('');
  const matches = models.filter(row => (row.name + ' ' + row.code).toLowerCase().includes(query.trim().toLowerCase()));
  return <><SearchBox value={query} placeholder="搜索模型展示名 / 规范模型标识" onChange={setQuery}/><nav className="supplier-sidebar-options supplier-model-options" aria-label="已接入模型">{matches.map(row => <Button key={row.id} type={selected?.id === row.id ? 'primary' : 'tertiary'} theme={selected?.id === row.id ? 'light' : 'borderless'} aria-pressed={selected?.id === row.id} title={row.code} onClick={() => ops.go({ supplyModel: row.id })}><span>{row.name}</span>{!row.master && models.some(other => other.id !== row.id && other.name === row.name) && <small>{row.entries[0].provider.name}</small>}</Button>)}{!matches.length && <p role="status">没有匹配的模型</p>}</nav></>;
}

export default function SupplyModelView({ state, selected, ops }) {
  const requested = ops.params.get('supplyModel');
  return <Card className="supplier-model-panel" bodyStyle={{ padding: 0 }}><div className="supplier-model-heading"><div><Typography.Title heading={4} component="h2">{selected?.name || '已接入模型'}</Typography.Title>{selected?.code && <code>{selected.code}</code>}{selected?.master && <span>{catalogueType(selected.master.type)}{selected.master.profile?.releaseDate ? ` · ${selected.master.profile.releaseDate}` : ''}{selected.master.maker ? ` · ${selected.master.maker}` : ''}</span>}</div></div>{selected ? <>{!selected.master && <div className="supplier-resource-notice"><Notice>该供应模型尚未关联统一模型资料。<Button theme="borderless" type="tertiary" onClick={() => ops.go({ perspective: 'suppliers', provider: selected.entries[0].provider.id, tab: 'catalogue', supplyModel: null })}>关联模型资料</Button></Notice></div>}<SupplierModelCatalogue key={selected.id} state={state} modelEntries={selected.entries} ops={ops}/></> : <div className="mo-empty" role="status">{requested ? '当前模型供给已变化，请重新选择模型。' : '尚未接入模型，请在服务商视图接入新模型。'}</div>}</Card>;
}
