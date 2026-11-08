import { useServiceDirectory, beginExperience, finishExperience } from './useServiceDirectory';
import { readExperienceDraft, saveExperienceDraft } from './experience-drafts.mjs';
import FrontPageHeader from "./components/FrontPageHeader";
import { Columns3 } from "lucide-react";
import { ArrowLeft, BrainCircuit, Copy, Plus, Send, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ModelSelectDialog from './ModelSelectDialog';
import './model-comparison.css';

const createColumn = (id, model) => ({ id, model, input: '', response: '', temperature: '0.7', topP: '0.8', deep: false, settings: false });
export default function ModelComparison({ onBack, owner = "" }) {
  const directory = useServiceDirectory('text'), catalog = directory.models;
  const defaults = () => catalog.filter(model => model.callable).slice(0, 2).map((model, index) => createColumn(index + 1, model.id));
  const [draft] = useState(() => { try { return readExperienceDraft(owner, 'comparison'); } catch { return { error: '对比草稿读取失败，请核对本地存储' }; } });
  const [columns, setColumns] = useState(draft.columns || defaults());
  useEffect(()=>{
    if(!columns.length && catalog.filter(row=>row.callable).length>=2)setColumns(defaults());
  },[catalog,columns.length]);
  const pending = useRef(new Map());
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
    if (columns.length < 2) { setNotice('请选择至少两个可体验模型进行对比'); return; }
    pending.current.clear();
    for (const column of columns.filter(column => sync || column.id === id)) {
      try { pending.current.set(column.id, beginExperience(directory, column.model, 'text')); update(column.id, { responseName: pending.current.get(column.id).modelName, response: '', error: '', pending: true }); }
      catch (error) { update(column.id, { error: error.message, pending: false }); }
    }
    if (!pending.current.size) return;
    setBusy(true); setNotice('');
    timer.current = setTimeout(async () => {
      await Promise.all([...pending.current].map(async ([columnId,ticket])=>{
        try {
          await finishExperience(ticket);
          if(pending.current.get(columnId)===ticket)update(columnId,{ response:'模拟回答：先明确目标与约束，再整理输入、处理步骤和验收标准。',error:'',pending:false,input:'' });
        } catch (error) { if(pending.current.get(columnId)===ticket)update(columnId,{ error:error.message,pending:false }); }
      }));
      pending.current.clear();setBusy(false);
    },650);
  }
  useEffect(() => { if (draft.error) { setNotice(draft.error); return; } try { saveExperienceDraft(owner, 'comparison', { columns: columns.map(row => ({ ...row, pending: false })) }); } catch { setNotice('对比草稿无法保存'); } }, [columns, owner]);
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); setNotice('已复制结果'); } catch { setNotice('复制失败，请手动选择文本'); }
  }
  return <section className="compare-page">
    <FrontPageHeader className="compare-heading" title="模型对比" description="向多个文本模型发送同一问题，直观比较回答质量、速度与参数差异" icon={Columns3} actions={<div className="compare-head-actions"><button type="button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true"/>返回单模型</button><label><span>同步输入</span><input type="checkbox" checked={sync} onChange={event => setSync(event.target.checked)}/><i aria-hidden="true"/></label><button type="button" onClick={() => { clearTimeout(timer.current); pending.current.clear(); setBusy(false); setColumns(defaults()); setNotice('已重置对比'); }}>重置</button><div className="compare-picker"><button type="button" className="compare-add" aria-haspopup="dialog" aria-expanded={pickerOpen} onClick={() => setPickerOpen(true)}><Plus size={16} aria-hidden="true"/>添加模型</button><ModelSelectDialog open={pickerOpen} models={catalog} value={columns.map(column => column.model)} multiple min={2} max={3} onApply={applyModels} onClose={() => setPickerOpen(false)}/></div></div>} />
    {(directory.error || directory.identityError || columns.length < 2) && <p role="status">{directory.error || directory.identityError || "至少需要两个可体验模型，点击添加模型选择"}</p>}
    <div className={`compare-grid columns-${columns.length}`}>
      {columns.map((column, index) => {
        const model = catalog.find(item => item.id === column.model) || { name: '模型已不可用', icon: 1, context: '未填写', output: '未填写', reason: '请重新选择模型' };
        return <article className="compare-column" key={column.id}>
          <div className="compare-model-bar"><div><BrainCircuit size={24} aria-hidden="true"/><select aria-label={`第 ${index + 1} 栏模型`} value={column.model} disabled={busy} onChange={event => { try { beginExperience(directory, event.target.value, 'text'); update(column.id, { model: event.target.value, response: '', error: '' }); } catch (error) { setNotice(error.message); } }}><option value="" disabled>请选择模型</option>{!catalog.some(item => item.id === column.model) && <option value={column.model}>模型已不可用</option>}{catalog.map(item => <option key={item.id} value={item.id} disabled={!item.callable}>{item.name}{!item.callable ? '（不可体验）' : ''}</option>)}</select></div>{columns.length > 2 && <button type="button" aria-label={`移除 ${model.name}`} onClick={() => setColumns(items => items.filter(item => item.id !== column.id))}><X size={18} aria-hidden="true"/></button>}</div>
          <p role="status">{column.error || (!model.callable ? model.reason : "")}</p><div className="compare-stage">{column.response ? <div className="compare-response"><div><BrainCircuit size={24} aria-hidden="true"/><strong>{column.responseName || model.name}</strong><span>{column.deep ? '深度思考' : '标准回答'}</span></div><p>{column.response}</p><button type="button" onClick={() => copy(column.response)}><Copy size={15} aria-hidden="true"/>复制回答</button></div> : <div className="compare-model-card"><div><BrainCircuit size={24} aria-hidden="true"/><span>{model.callable ? "可体验" : "不可体验"}</span><i>{model.billing}</i></div><h2>{model.name}</h2><p>{model.desc}</p><dl><div><dt>上下文</dt><dd>{model.context}</dd></div><div><dt>最大输出</dt><dd>{model.output}</dd></div></dl><footer><span>供应商</span><strong>{model.provider}</strong></footer></div>}</div>
          <form className="compare-composer" onSubmit={event => { event.preventDefault(); send(column.id); }}><textarea disabled={busy} aria-label={`第 ${index + 1} 栏输入`} value={column.input} onChange={event => changeInput(column.id, event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(column.id); } }} placeholder={sync ? '输入问题，将同步发送给全部模型' : `向 ${model.name} 提问`}/><div className="compare-tools"><button type="button" aria-pressed={column.deep} title="深度思考" onClick={() => update(column.id, { deep: !column.deep })}><BrainCircuit size={17} aria-hidden="true"/></button><button type="button" aria-expanded={column.settings} title="参数设置" onClick={() => update(column.id, { settings: !column.settings })}><SlidersHorizontal size={17} aria-hidden="true"/></button><span>{column.input.length}/6000</span><button className="compare-send" type="submit" aria-label={`发送给 ${sync ? '全部模型' : model.name}`} disabled={busy || !column.input.trim()}>{busy ? <i/> : <Send size={17} aria-hidden="true"/>}</button></div>{column.settings && <div className="compare-settings"><header><strong>{model.name} 参数</strong><button type="button" aria-label="关闭参数设置" onClick={() => update(column.id, { settings: false })}><X size={16}/></button></header><label><span>Temperature</span><output>{column.temperature}</output><input aria-label={`第 ${index + 1} 栏 Temperature`} type="range" min="0" max="2" step="0.1" value={column.temperature} onChange={event => update(column.id, { temperature: event.target.value })}/></label><label><span>Top P</span><output>{column.topP}</output><input aria-label={`第 ${index + 1} 栏 Top P`} type="range" min="0" max="1" step="0.05" value={column.topP} onChange={event => update(column.id, { topP: event.target.value })}/></label></div>}</form>
        </article>;
      })}
    </div>
    <p className="compare-notice" role="status">{notice}</p>
  </section>;
}
