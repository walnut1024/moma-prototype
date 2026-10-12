import { Search, SquareArrowOutUpRight, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from './components/ui/button';
import { Checkbox } from './components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import { Input } from './components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { chooseModel, filterModels, modelCategory, modelSupplier } from './model-selection.mjs';
import './model-select-dialog.css';

export default function ModelSelectDialog({ open, models, value, multiple = false, min = 1, max = 1, onApply, onClose }) {
  const selectionId = useId();
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [supplierQuery, setSupplierQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [provider, setProvider] = useState('全部供应商');
  const [billing, setBilling] = useState('全部计费');
  const [subscribedOnly, setSubscribedOnly] = useState(true);

  useEffect(() => {
    if (!open) return;
    const names = Array.isArray(value) ? value : [value];
    setSelected(names.filter(name => models.some(model => model.name === name && model.subscribed)));
    setQuery(''); setSupplierQuery(''); setCategory('全部');
    setProvider('全部供应商'); setBilling('全部计费'); setSubscribedOnly(true);
  }, [open, value, models]);

  const categories = ['全部', ...new Set(models.map(model => modelCategory(model.type)))];
  const providers = ['全部供应商', ...new Set(models.map(modelSupplier))];
  const filters = { query, category, provider, billing, subscribedOnly };
  const visible = filterModels(models, filters);
  const supplierCounts = filterModels(models, { ...filters, provider: '全部供应商' });
  const categoryCounts = filterModels(models, { ...filters, category: '全部' });
  const orderUrl = `/${location.pathname.split('/').filter(Boolean)[0]}/?page=model-order`;
  const validSelection = selected.length >= min && selected.length <= max;

  function choose(model) { setSelected(items => chooseModel(items, model, multiple, max)); }

  return <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <DialogContent className="model-select-dialog" showCloseButton={false}>
      <header className="model-select-heading">
        <div><DialogTitle>{multiple ? '添加对比模型' : '选择模型'}</DialogTitle><DialogDescription>按供应商和模型类型查找</DialogDescription></div>
        <Button type="button" variant="ghost" size="icon" aria-label="关闭模型选择" onClick={onClose}><X size={20}/></Button>
      </header>
      <div className="model-select-body">
        <aside className="model-select-suppliers" aria-label="模型供应商">
          <h3>供应商</h3>
          <label className="model-select-search"><Search size={16} aria-hidden="true"/><Input aria-label="搜索供应商" placeholder="搜索供应商" value={supplierQuery} onChange={event => setSupplierQuery(event.target.value)}/></label>
          <nav aria-label="供应商筛选">{providers.filter(item => item.toLowerCase().includes(supplierQuery.trim().toLowerCase())).map(item => {
            const count = item === '全部供应商' ? supplierCounts.length : supplierCounts.filter(model => modelSupplier(model) === item).length;
            return <Button type="button" variant="ghost" className={provider === item ? 'active' : ''} aria-pressed={provider === item} key={item} onClick={() => setProvider(item)}><span>{item}</span><small>{count}</small></Button>;
          })}</nav>
          {providers.every(item => !item.toLowerCase().includes(supplierQuery.trim().toLowerCase())) && <p className="model-select-supplier-empty">无匹配供应商</p>}
        </aside>
        <section className="model-select-results" aria-label="模型目录">
          <div className="model-select-toolbar">
            <label className="model-select-search"><Search size={17} aria-hidden="true"/><Input autoFocus aria-label="搜索模型" placeholder="搜索模型名称" value={query} onChange={event => setQuery(event.target.value)}/></label>
            <Select value={billing} onValueChange={setBilling}><SelectTrigger className="model-select-billing" aria-label="计费方式"><SelectValue/></SelectTrigger><SelectContent>{['全部计费', ...new Set(models.map(model => model.billing))].map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
            <label className="model-select-subscribed"><Checkbox checked={subscribedOnly} onCheckedChange={checked => setSubscribedOnly(checked === true)}/>仅看已订购</label>
          </div>
          <div className="model-select-categories"><Tabs value={category} onValueChange={setCategory}><TabsList variant="line" aria-label="模型类型筛选">{categories.map(item => <TabsTrigger key={item} value={item}>{item}<small>{item === '全部' ? categoryCounts.length : categoryCounts.filter(model => modelCategory(model.type) === item).length}</small></TabsTrigger>)}</TabsList></Tabs><span aria-live="polite">共 {visible.length} 个模型</span></div>
          <div className="model-select-table-scroll">
            <table className="model-select-table" aria-label="模型列表">
              <colgroup><col className="model-col-select"/><col/><col className="model-col-type"/><col className="model-col-billing"/><col className="model-col-status"/></colgroup>
              <thead><tr><th scope="col"><span className="sr-only">选择</span></th><th scope="col">模型名称</th><th scope="col">类型</th><th scope="col">计费方式</th><th scope="col">订购状态</th></tr></thead>
              <tbody>{visible.map(model => {
                const checked = selected.includes(model.name);
                const disabled = !model.subscribed || (multiple && !checked && selected.length >= max);
                return <tr key={model.name} data-selected={checked} data-unavailable={!model.subscribed} onClick={() => !disabled && choose(model)}>
                  <td><input type={multiple ? 'checkbox' : 'radio'} name={selectionId} checked={checked} disabled={disabled} aria-label={`选择 ${model.name}`} onClick={event => event.stopPropagation()} onChange={() => choose(model)}/></td>
                  <td><span className="model-select-name" title={[model.name, model.desc].filter(Boolean).join('：')}>{model.name}</span></td><td>{modelCategory(model.type)}</td><td>{model.billing}</td>
                  <td>{model.subscribed ? <span className="model-select-status">已订购</span> : <a href={orderUrl} target="_blank" rel="noopener noreferrer" aria-label={`去订购 ${model.name}（在新页签打开）`} onClick={event => event.stopPropagation()}>去订购<SquareArrowOutUpRight size={14} aria-hidden="true"/></a>}</td>
                </tr>;
              })}</tbody>
            </table>
            {!visible.length && <div className="model-select-empty"><p>没有匹配的模型</p><Button type="button" variant="link" onClick={() => { setQuery(''); setSupplierQuery(''); setProvider('全部供应商'); setCategory('全部'); setBilling('全部计费'); setSubscribedOnly(false); }}>清除筛选，查看全部模型</Button></div>}
          </div>
        </section>
      </div>
      <footer className="model-select-footer"><div className="model-select-current">{multiple ? <><span>已选 {selected.length} 个模型（{min}–{max} 个）</span>{selected.map(name => <Button type="button" variant="outline" size="xs" key={name} aria-label={`移除 ${name}`} onClick={() => setSelected(items => items.filter(item => item !== name))}>{name}<X size={12}/></Button>)}</> : <><span>已选：</span><strong title={selected[0]}>{selected[0] || '请选择模型'}</strong></>}</div><Button type="button" variant="outline" onClick={onClose}>取消</Button><Button type="button" className="model-select-apply" disabled={!validSelection} onClick={() => { onApply(multiple ? selected : selected[0]); onClose(); }}>应用</Button></footer>
    </DialogContent>
  </Dialog>;
}
