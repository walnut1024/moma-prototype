import { ArrowLeft, BrainCircuit, Copy, Plus, Send, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ModelSelectDialog from './ModelSelectDialog';
import './model-comparison.css';

const catalog = [
  { name: 'DeepSeek/DeepSeek-V4-Pro', icon: 1, type: 'text', subscribed: true, billing: 'Token Plan', desc: '旗舰级 MoE 文本模型，擅长复杂推理、代码与长文本分析。', context: '1M', output: '128K', provider: '江苏移动' },
  { name: 'ZHIPU/GLM-5.2', icon: 3, type: 'text', subscribed: true, billing: '按量计费', desc: '面向长程任务的旗舰文本模型，兼顾推理质量与工具调用。', context: '1M', output: '128K', provider: '江苏联通' },
  { name: 'DeepSeek/DeepSeek-V4-Flash', icon: 1, type: 'text', subscribed: true, billing: '按量计费', desc: '高效轻量文本模型，适合低延迟问答与批量文本处理。', context: '1M', output: '64K', provider: '江苏移动' },
  { name: 'Qwen/Qwen3.7-Max', icon: 4, type: 'text', subscribed: false, billing: '按量计费', desc: '综合能力强的旗舰文本模型，覆盖办公、编程与智能体任务。', context: '1M', output: '128K', provider: '江苏移动', disabled: true },
];

const createColumn = (id, model) => ({ id, model, input: '', response: '', temperature: '0.7', topP: '0.8', deep: false, settings: false });
const answers = {
  'DeepSeek/DeepSeek-V4-Pro': '可以先明确目标与约束，再按“现状分析—关键问题—实施路径—衡量指标”展开。这样既能保证结论完整，也便于后续执行与复盘。',
  'ZHIPU/GLM-5.2': '建议将任务拆成目标、输入、处理步骤和交付物四部分，并为每一步补充负责人、完成时间与验收标准。',
  'DeepSeek/DeepSeek-V4-Flash': '快速建议：先定义结果，再补充必要背景，最后指定格式与篇幅。信息越明确，输出越稳定。',
};

export default function ModelComparison({ onBack, onNavigate }) {
  const [columns, setColumns] = useState([createColumn(1, catalog[0].name), createColumn(2, catalog[1].name)]);
  const [sync, setSync] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const update = (id, patch) => setColumns(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
  const changeInput = (id, value) => setColumns(items => items.map(item => sync || item.id === id ? { ...item, input: value } : item));
  function applyModels(names) {
    setColumns(items => names.map((name, index) => items.find(item => item.model === name) || createColumn(Date.now() + index, name)));
    setNotice(`已选择 ${names.length} 个对比模型`);
  }
  function send(id) {
    const source = columns.find(column => column.id === id);
    if (busy || !source?.input.trim()) return;
    setBusy(true); setNotice('');
    const targets = sync ? columns.map(column => column.id) : [id];
    // ponytail: deterministic local replies keep the comparison flow testable until model APIs are integrated.
    timer.current = setTimeout(() => {
      setColumns(items => items.map(item => targets.includes(item.id) ? { ...item, response: answers[item.model], input: sync ? '' : item.input } : item));
      setBusy(false); setNotice(sync ? `${targets.length} 个模型已完成对比` : `${source.model} 已完成生成`);
    }, 650);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); setNotice('已复制结果'); } catch { setNotice('复制失败，请手动选择文本'); }
  }
  return <section className="compare-page">
    <header className="compare-heading"><div><h1>模型对比</h1><p>向多个文本模型发送同一问题，直观比较回答质量、速度与参数差异</p></div><div className="compare-head-actions"><button type="button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true"/>返回单模型</button><label><span>同步输入</span><input type="checkbox" checked={sync} onChange={event => setSync(event.target.checked)}/><i aria-hidden="true"/></label><button type="button" onClick={() => { setColumns([createColumn(1, catalog[0].name), createColumn(2, catalog[1].name)]); setNotice('已重置对比'); }}>重置</button><div className="compare-picker"><button type="button" className="compare-add" aria-haspopup="dialog" aria-expanded={pickerOpen} onClick={() => setPickerOpen(true)}><Plus size={16} aria-hidden="true"/>添加模型</button><ModelSelectDialog open={pickerOpen} models={catalog} value={columns.map(column => column.model)} multiple min={2} max={3} onApply={applyModels} onClose={() => setPickerOpen(false)} onSubscribe={() => onNavigate?.('模型订购')}/></div></div></header>
    <div className={`compare-grid columns-${columns.length}`}>
      {columns.map((column, index) => {
        const model = catalog.find(item => item.name === column.model);
        return <article className="compare-column" key={column.id}>
          <div className="compare-model-bar"><div><img src={`/assets/model-${model.icon}.jpg`} alt=""/><select aria-label={`第 ${index + 1} 栏模型`} value={column.model} onChange={event => update(column.id, { model: event.target.value, response: '' })}>{catalog.map(item => <option key={item.name} value={item.name} disabled={item.disabled}>{item.name}{item.disabled ? '（未订购）' : ''}</option>)}</select></div>{columns.length > 2 && <button type="button" aria-label={`移除 ${model.name}`} onClick={() => setColumns(items => items.filter(item => item.id !== column.id))}><X size={18} aria-hidden="true"/></button>}</div>
          <div className="compare-stage">{column.response ? <div className="compare-response"><div><img src={`/assets/model-${model.icon}.jpg`} alt=""/><strong>{model.name}</strong><span>{column.deep ? '深度思考' : '标准回答'}</span></div><p>{column.response}</p><ol><li><strong>结构完整度</strong><span>{model.name.includes('Flash') ? '82' : model.name.includes('GLM') ? '88' : '92'}</span></li><li><strong>响应耗时</strong><span>{model.name.includes('Flash') ? '0.8s' : model.name.includes('GLM') ? '1.6s' : '2.3s'}</span></li><li><strong>输出 Tokens</strong><span>{model.name.includes('Flash') ? '68' : model.name.includes('GLM') ? '91' : '112'}</span></li></ol><button type="button" onClick={() => copy(column.response)}><Copy size={15} aria-hidden="true"/>复制回答</button></div> : <div className="compare-model-card"><div><img src={`/assets/model-${model.icon}.jpg`} alt=""/><span>已订购</span><i>{model.billing}</i></div><h2>{model.name}</h2><p>{model.desc}</p><dl><div><dt>上下文</dt><dd>{model.context}</dd></div><div><dt>最大输出</dt><dd>{model.output}</dd></div></dl><footer><span>供应商</span><strong>{model.provider}</strong></footer></div>}</div>
          <form className="compare-composer" onSubmit={event => { event.preventDefault(); send(column.id); }}><textarea aria-label={`第 ${index + 1} 栏输入`} value={column.input} onChange={event => changeInput(column.id, event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(column.id); } }} placeholder={sync ? '输入问题，将同步发送给全部模型' : `向 ${model.name} 提问`}/><div className="compare-tools"><button type="button" aria-pressed={column.deep} title="深度思考" onClick={() => update(column.id, { deep: !column.deep })}><BrainCircuit size={17} aria-hidden="true"/></button><button type="button" aria-expanded={column.settings} title="参数设置" onClick={() => update(column.id, { settings: !column.settings })}><SlidersHorizontal size={17} aria-hidden="true"/></button><span>{column.input.length}/6000</span><button className="compare-send" type="submit" aria-label={`发送给 ${sync ? '全部模型' : model.name}`} disabled={busy || !column.input.trim()}>{busy ? <i/> : <Send size={17} aria-hidden="true"/>}</button></div>{column.settings && <div className="compare-settings"><header><strong>{model.name} 参数</strong><button type="button" aria-label="关闭参数设置" onClick={() => update(column.id, { settings: false })}><X size={16}/></button></header><label><span>Temperature</span><output>{column.temperature}</output><input aria-label={`第 ${index + 1} 栏 Temperature`} type="range" min="0" max="2" step="0.1" value={column.temperature} onChange={event => update(column.id, { temperature: event.target.value })}/></label><label><span>Top P</span><output>{column.topP}</output><input aria-label={`第 ${index + 1} 栏 Top P`} type="range" min="0" max="1" step="0.05" value={column.topP} onChange={event => update(column.id, { topP: event.target.value })}/></label></div>}</form>
        </article>;
      })}
    </div>
    <p className="compare-notice" role="status">{notice}</p>
  </section>;
}
