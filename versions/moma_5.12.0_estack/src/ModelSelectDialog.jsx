import { assertExperienceSelection } from './service-directory.mjs';
import { Search, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Checkbox, Input, Modal, Radio, Select, Table, Tabs, Tag } from '@douyinfe/semi-ui';
import { chooseModel, filterModels, modelCategory, modelSupplier } from './model-selection.mjs';
import './model-select-dialog.css';

export default function ModelSelectDialog({ open, models, value, multiple = false, min = 1, max = 1, onApply, onClose, task = 'text' }) {
  const selectionId = useId();
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [supplierQuery, setSupplierQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [provider, setProvider] = useState('全部供应商');
  const [billing, setBilling] = useState('全部计费');
  const [callableOnly, setCallableOnly] = useState(true);

  useEffect(() => {
    if (!open) return;
    const names = Array.isArray(value) ? value : [value];
    setSelected(names.filter(name => models.some(model => model.id === name && model.callable)));
    setError(''); setQuery(''); setSupplierQuery(''); setCategory('全部');
    setProvider('全部供应商'); setBilling('全部计费'); setCallableOnly(true);
  }, [open]);

  const categories = ['全部', ...new Set(models.map(model => modelCategory(model.type)))];
  const providers = ['全部供应商', ...new Set(models.map(modelSupplier))];
  const filters = { query, category, provider, billing, callableOnly };
  const visible = filterModels(models, filters);
  const supplierCounts = filterModels(models, { ...filters, provider: '全部供应商' });
  const categoryCounts = filterModels(models, { ...filters, category: '全部' });
  const validSelection = selected.length >= min && selected.length <= max && selected.every(id => models.some(model => model.id === id && model.callable));

  function choose(model) { setSelected(items => chooseModel(items, model, multiple, max)); }
  const disabled = model => !model.callable || (multiple && !selected.includes(model.id) && selected.length >= max);
  const columns = [
    { title:<span className="sr-only">选择</span>, width:56, render:(_,model) => {
      const Control = multiple ? Checkbox : Radio;
      return <div onClick={event => event.stopPropagation()}>
        <Control name={selectionId} checked={selected.includes(model.id)} disabled={disabled(model)}
          aria-label={`选择 ${model.name} · ${model.provider}`} onChange={() => choose(model)} />
      </div>;
    } },
    { title:'模型名称', width:240, render:(_,model) => <>
      <span className="model-select-name" title={[model.name, model.desc].filter(Boolean).join('：')}>{model.name}</span>
      <small className="model-select-model-id">{model.provider} · {model.callId}</small>
    </> },
    { title:'类型', width:82, render:(_,model) => modelCategory(model.type) },
    { title:'计费方式', dataIndex:'billing', width:104 },
    { title:'体验状态', width:118, render:(_,model) => <Tag color={model.callable?'green':'grey'}>{model.callable ? '可体验' : model.reason}</Tag> },
  ];
  const footer = <div className="model-select-footer">
    <div className="model-select-current">{multiple ? <>
      <span>已选 {selected.length} 个模型（{min}–{max} 个）</span>
      {selected.map(id => {
        const model = models.find(model => model.id === id);
        const label = model ? `${model.name} · ${modelSupplier(model)}` : '已不可用';
        return <Button type="tertiary" size="small" key={id} title={label} aria-label={`移除 ${label}`}
          icon={<X size={12}/>} iconPosition="right" onClick={() => setSelected(items => items.filter(item => item !== id))}>
          {label}
        </Button>;
      })}
    </> : <><span>已选：</span><strong title={selected[0]}>{models.find(model => model.id === selected[0])?.name || '请选择模型'}</strong></>}</div>
    <Button type="tertiary" onClick={onClose}>取消</Button>
    <Button theme="solid" disabled={!validSelection} onClick={() => {
      try { selected.forEach(id => assertExperienceSelection(id, task)); if (onApply(multiple ? selected : selected[0]) !== false) onClose(); }
      catch (issue) { setError(issue.message); }
    }}>应用</Button>
  </div>;

  return <Modal visible={open} title={multiple ? '添加对比模型' : '选择模型'} onCancel={onClose}
    width="min(960px, calc(100vw - 20px))" className="model-select-dialog" footer={footer}>
      {error && <Banner type="danger" description={error} />}
      <div className="model-select-body">
        <section className="model-select-suppliers" aria-label="模型供应商">
          <h3>供应商</h3>
          <Input prefix={<Search size={16} aria-hidden="true"/>} aria-label="搜索供应商" placeholder="搜索供应商" value={supplierQuery} onChange={setSupplierQuery} />
          <nav aria-label="供应商筛选">{providers.filter(item => item.toLowerCase().includes(supplierQuery.trim().toLowerCase())).map(item => {
            const count = item === '全部供应商' ? supplierCounts.length : supplierCounts.filter(model => modelSupplier(model) === item).length;
            return <Button type={provider === item?'primary':'tertiary'} theme={provider === item?'light':'borderless'}
              aria-pressed={provider === item} key={item} onClick={() => setProvider(item)}><span>{item}</span><small>{count}</small></Button>;
          })}</nav>
          {providers.every(item => !item.toLowerCase().includes(supplierQuery.trim().toLowerCase())) && <p className="model-select-supplier-empty">无匹配供应商</p>}
        </section>
        <section className="model-select-results" aria-label="模型目录">
          <div className="model-select-toolbar">
            <Input className="model-select-search" prefix={<Search size={16} aria-hidden="true"/>} autoFocus aria-label="搜索模型"
              placeholder="搜索模型名称" value={query} onChange={setQuery} />
            <Select value={billing} onChange={setBilling} className="model-select-billing" aria-label="计费方式"
              optionList={['全部计费', ...new Set(models.map(model => model.billing))].map(value => ({value,label:value}))} />
            <Checkbox checked={callableOnly} onChange={event => setCallableOnly(event.target.checked)}>仅看可体验</Checkbox>
          </div>
          <div className="model-select-categories">
            <Tabs activeKey={category} onChange={setCategory} aria-label="模型类型筛选"
              tabList={categories.map(item => ({itemKey:item,tab:<>{item}<small>{item === '全部' ? categoryCounts.length : categoryCounts.filter(model => modelCategory(model.type) === item).length}</small></>}))} />
            <span aria-live="polite">共 {visible.length} 个模型</span>
          </div>
          <Table className="model-select-table" aria-label="模型列表" columns={columns} dataSource={visible} rowKey="id"
            size="small" pagination={false} scroll={{x:600,y:330}} onRow={model => ({
              'data-selected':selected.includes(model.id), 'data-unavailable':disabled(model),
              onClick:() => { if (!disabled(model)) choose(model); },
            })}
            empty={<div><p>没有匹配的模型</p><Button theme="borderless" onClick={() => {
              setQuery(''); setSupplierQuery(''); setProvider('全部供应商'); setCategory('全部'); setBilling('全部计费'); setCallableOnly(false);
            }}>清除筛选，查看全部模型</Button></div>} />
        </section>
      </div>
  </Modal>;
}
