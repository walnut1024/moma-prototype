import { useState } from 'react';
import { Checkbox, Input } from '@douyinfe/semi-ui';
import { Choice } from './ModelMetadataForm';
import { MODEL_TYPES } from './model-management';
import { modelLibrary } from './model-library';
import { Pagination } from './ModelOperationsUI';

export default function ChannelModelReferencePicker({ state, rows, onChange, disabled, reservedCount = 0, expanded = false }) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(1), [type, setType] = useState('all');
  const models = modelLibrary(state).filter(row => (type === 'all' || row.type === type) && `${row.name} ${row.modelId}`.toLowerCase().includes(query.toLowerCase().trim()));
  const current = Math.min(page, Math.max(1, Math.ceil(models.length / 20)));
  return <details className="supplier-reference-picker" open={expanded || undefined}><summary>从资料库批量选择</summary><div className="supplier-reference-body"><Input aria-label="搜索参考模型" placeholder="搜索模型展示名 / 编码" value={query} onChange={value => { setQuery(value); setPage(1); }}/><Choice label="参考模型类型" value={type} options={[[ 'all', '全部类型' ], ...Object.entries(MODEL_TYPES)]} onChange={value => { setType(value); setPage(1); }}/><div className="supplier-reference-options">{models.slice((current - 1) * 20, current * 20).map(model => {
    const included = rows.some(row => row.libraryId === model.id);
    return <Checkbox key={model.id} checked={included} disabled={disabled || !included && rows.length + reservedCount >= 50} onChange={event => onChange(event.target.checked ? [...rows, { id: crypto.randomUUID(), libraryId: model.id, upstreamModelId: model.modelId, scenarios: [], selected: true, confirmed: true, source: 'reference' }] : rows.filter(row => row.libraryId !== model.id))}><span>{model.name}<small>{model.modelId} · {MODEL_TYPES[model.type]}</small></span></Checkbox>;
  })}</div>{!models.length && <p role="status">没有匹配的模型资料</p>}<Pagination count={models.length} page={current} setPage={setPage} size={20}/></div></details>;
}
