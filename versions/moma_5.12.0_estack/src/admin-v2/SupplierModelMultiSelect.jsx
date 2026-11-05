import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Input } from '../components/ui/input';
import { modelCatalogue } from './model-library';
import { SUPPLIER_REGISTRATION_LIMIT } from './supplier-model-registration';

export const catalogueType = type => ({ text: '文本', image: '视觉 · 图像', video: '视觉 · 视频', multimodal: '多模态', audio: '语音', embedding: '向量', rerank: '重排' }[type] || type);
export default function SupplierModelMultiSelect({ state, registered, value, disabled, onChange }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const options = modelCatalogue(state).filter(row => `${row.name} ${row.modelId} ${catalogueType(row.type)}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-label="选择模型" aria-expanded={open} disabled={disabled} className="supplier-configuration-model"><span>{value.length ? `已选 ${value.length} 个模型` : '搜索并选择模型'}</span><ChevronDown/></Button></PopoverTrigger><PopoverContent align="start" className="supplier-configuration-model-options supplier-model-multiselect"><Input autoFocus aria-label="搜索模型目录" placeholder="搜索模型名称 / 编码 / 类型" value={query} onChange={event => setQuery(event.target.value)}/><div className="supplier-model-select-options" role="group" aria-label="统一模型目录">{options.map(model => {
    const exists = registered.includes(model.id), checked = value.includes(model.id);
    return <label key={model.id}><input type="checkbox" checked={checked || exists} disabled={disabled || exists || !checked && value.length >= SUPPLIER_REGISTRATION_LIMIT} onChange={() => onChange(checked ? value.filter(id => id !== model.id) : [...value, model.id])}/><span>{model.name}<small>{catalogueType(model.type)}{model.profile?.releaseDate ? ` · ${model.profile.releaseDate}` : ''}{exists ? ' · 已添加' : ''}</small></span></label>;
  })}{!options.length && <p role="status">没有匹配的模型</p>}</div><Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>完成选择</Button></PopoverContent></Popover>;
}
