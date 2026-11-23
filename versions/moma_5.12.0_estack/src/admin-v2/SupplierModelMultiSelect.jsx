import { useState } from 'react';
import { Checkbox, Empty, Input, Typography } from '@douyinfe/semi-ui';
import { modelReleaseOrder, modelCatalogue } from './model-library';
import { SUPPLIER_REGISTRATION_LIMIT } from './supplier-model-registration';
import { modelTypeLabel } from '../model-types.mjs';

export const catalogueType = type => modelTypeLabel(type) || type;
export default function SupplierModelMultiSelect({ state, registered, value, disabled, onChange }) {
  const [query, setQuery] = useState('');
  const options = modelCatalogue(state).sort(modelReleaseOrder).filter(row => [row.name, row.modelId, row.profile?.version, catalogueType(row.type)].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="supplier-model-multiselect supplier-model-multiselect-inline"><Input autoFocus aria-label="搜索模型资料" placeholder="搜索模型展示名称 / 模型编码 / 版本" value={query} onChange={value => setQuery(value)}/><div className="supplier-model-select-options" role="group" aria-label="模型资料">{options.map(model => {
    const exists = registered.includes(model.id), checked = value.includes(model.id);
    return <Checkbox key={model.id} className="supplier-model-option" checked={checked || exists} disabled={disabled || exists || !checked && value.length >= SUPPLIER_REGISTRATION_LIMIT} onChange={() => onChange(checked ? value.filter(id => id !== model.id) : [...value, model.id])}><span>{model.name}<small>{[model.modelId, model.profile?.version, catalogueType(model.type), model.profile?.releaseDate, exists && '已添加'].filter(Boolean).join(' · ')}</small></span></Checkbox>;
  })}{!options.length && <Empty description={<span role="status">没有匹配的模型</span>}/>}</div><Typography.Text type="secondary">已选 {value.length} / {SUPPLIER_REGISTRATION_LIMIT}</Typography.Text></div>;
}
