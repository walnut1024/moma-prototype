import { Check, Search, SquareArrowOutUpRight, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import './model-select-dialog.css';

const categoryName = type => ({ text: '文本', multimodal: '多模态', image: '图片', video: '视频', voice: '语音' }[type] || '文本');

export default function ModelSelectDialog({ open, models, value, multiple = false, min = 1, max = 1, onApply, onClose, onSubscribe }) {
  const dialog = useRef();
  const initial = Array.isArray(value) ? value : [value];
  const [selected, setSelected] = useState(initial);
  const [active, setActive] = useState(initial[0] || models[0]?.name);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [provider, setProvider] = useState('全部供应商');
  const [billing, setBilling] = useState('全部计费');

  useEffect(() => {
    const node = dialog.current;
    if (open && !node.open) {
      setSelected(Array.isArray(value) ? value : [value]);
      setActive((Array.isArray(value) ? value[0] : value) || models[0]?.name);
      setQuery(''); setCategory('全部'); setProvider('全部供应商'); setBilling('全部计费');
      node.showModal();
    } else if (!open && node?.open) node.close();
  }, [open, value, models]);

  const categories = useMemo(() => ['全部', ...new Set(models.map(model => categoryName(model.type)))], [models]);
  const providers = useMemo(() => ['全部供应商', ...new Set(models.map(model => model.name.split('/')[0]))], [models]);
  const visible = models.filter(model => {
    const matchesQuery = model.name.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (category === '全部' || categoryName(model.type) === category) && (provider === '全部供应商' || model.name.startsWith(`${provider}/`)) && (billing === '全部计费' || model.billing === billing);
  });
  const detail = models.find(model => model.name === active) || visible[0] || models[0];

  function choose(model) {
    setActive(model.name);
    if (!model.subscribed && !multiple) return;
    if (!multiple) return setSelected([model.name]);
    setSelected(items => items.includes(model.name) ? items.length > min ? items.filter(name => name !== model.name) : items : items.length < max && model.subscribed ? [...items, model.name] : items);
  }

  function close() { dialog.current?.close(); onClose(); }

  return <dialog ref={dialog} className="model-select-dialog" aria-label={multiple ? '选择对比模型' : '选择模型'} onCancel={event => { event.preventDefault(); close(); }}>
    <div className="model-select-shell">
      <header>
        <div className="model-select-title"><h2>{multiple ? '添加对比模型' : '选择模型'}</h2><p>选择适合当前任务的模型与计费方式</p></div>
        <label><Search size={17} aria-hidden="true"/><input autoFocus aria-label="搜索模型" placeholder="搜索模型名称" value={query} onChange={event => setQuery(event.target.value)}/><kbd>ESC</kbd></label>
        <button type="button" aria-label="关闭模型选择" onClick={close}><X size={20}/></button>
        <div className="model-select-filters">
          <select aria-label="模型供应商" value={provider} onChange={event => setProvider(event.target.value)}>{providers.map(item => <option key={item}>{item}</option>)}</select>
          <select aria-label="计费方式" value={billing} onChange={event => setBilling(event.target.value)}><option>全部计费</option><option>Token Plan</option><option>按量计费</option></select>
        </div>
      </header>
      <main>
        <nav aria-label="模型分类">{categories.map(item => <button type="button" className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}><span>{item}</span><small>{item === '全部' ? models.length : models.filter(model => categoryName(model.type) === item).length}</small></button>)}</nav>
        <section className="model-select-list" aria-label="模型列表">{visible.length ? visible.map(model => {
          const checked = selected.includes(model.name);
          return <button type="button" key={model.name} className={active === model.name ? 'active' : ''} aria-pressed={checked} onClick={() => choose(model)}><span><strong>{model.name}</strong><small>{model.desc || `${categoryName(model.type)}生成模型`}</small><i className={model.subscribed ? 'subscribed' : 'unsubscribed'}>{model.subscribed ? '已订购' : '未订购'}</i><i className={model.billing === 'Token Plan' ? 'plan' : 'metered'}>{model.billing}</i></span>{checked && <Check size={18} aria-hidden="true"/>}</button>;
        }) : <p>没有匹配的模型</p>}</section>
        <aside>{detail && <><div className="model-detail-top"><div><h2>{detail.name}</h2><span className="model-type-badge">{categoryName(detail.type)}模型</span><span className={detail.subscribed ? 'model-state-badge subscribed' : 'model-state-badge unsubscribed'}>{detail.subscribed ? '已订购' : '未订购'}</span><span className={detail.billing === 'Token Plan' ? 'model-state-badge plan' : 'model-state-badge metered'}>{detail.billing}</span></div>{!detail.subscribed && <button type="button" onClick={() => { close(); onSubscribe?.(); }}>前往订购<SquareArrowOutUpRight size={16} aria-hidden="true"/></button>}</div><p>{detail.desc || '适用于当前模型体验场景，选择后可查看生成效果。'}</p>{(detail.context || detail.output) && <dl>{detail.context && <div><dt>上下文</dt><dd>{detail.context}</dd></div>}{detail.output && <div><dt>最大输出</dt><dd>{detail.output}</dd></div>}</dl>}</>}</aside>
      </main>
      <footer>
        <div>{selected.map(name => <button type="button" key={name} onClick={() => multiple && selected.length > min && setSelected(items => items.filter(item => item !== name))}>{name}{multiple && <X size={13}/>}</button>)}</div>
        <button type="button" onClick={close}>取消</button>
        <button type="button" className="primary" disabled={selected.length < min} onClick={() => { onApply(multiple ? selected : selected[0]); close(); }}>应用{multiple ? `（${selected.length} 个模型）` : ''}</button>
      </footer>
    </div>
  </dialog>;
}
