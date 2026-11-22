import { useServiceDirectory, beginExperience, finishExperience } from './useServiceDirectory';
import { readExperienceDraft, saveExperienceDraft } from './experience-drafts.mjs';
import FrontPageHeader from "./components/FrontPageHeader";
import { Columns3 } from "lucide-react";
import { ArrowLeft, BrainCircuit, Copy, Plus, Send, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, Modal, Select, Slider, Switch, Tag, TextArea } from '@douyinfe/semi-ui';
import ModelSelectDialog from './ModelSelectDialog';
import './model-comparison.css';

const createColumn = (id, model) => ({ id, model, input: '', response: '', temperature: '0.7', topP: '0.8', deep: false, settings: false });
export default function ModelComparison({ onBack, owner = "", project }) {
  const directory = useServiceDirectory('text',project), catalog = directory.models;
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
  const labelId = useId();
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
          const result=await finishExperience(ticket,{prompt:source.input});
          if(pending.current.get(columnId)===ticket)update(columnId,{response:result.experience?.answer || result.choices?.[0]?.message?.content || '',
            error:result.invocationError?.message || '',pending:false,input:''});
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
    <FrontPageHeader className="compare-heading" title="模型对比" description="向多个语言模型发送同一问题，直观比较回答质量、速度与参数差异" icon={Columns3}
      actions={<div className="compare-head-actions">
        <Button type="tertiary" icon={<ArrowLeft size={16}/>} onClick={onBack}>返回单模型</Button>
        <div className="compare-sync"><span id={labelId+'-sync'}>同步输入</span>
          <Switch aria-labelledby={labelId+'-sync'} checked={sync} onChange={setSync} /></div>
        <Button type="tertiary" onClick={() => { clearTimeout(timer.current); pending.current.clear(); setBusy(false); setColumns(defaults()); setNotice('已重置对比'); }}>重置</Button>
        <Button theme="solid" icon={<Plus size={16}/>} aria-haspopup="dialog" aria-expanded={pickerOpen} onClick={() => setPickerOpen(true)}>添加模型</Button>
        <ModelSelectDialog open={pickerOpen} models={catalog} value={columns.map(column => column.model)} multiple min={2} max={3} onApply={applyModels} onClose={() => setPickerOpen(false)}/>
      </div>} />
    {(directory.error || directory.identityError || columns.length < 2) && <p role="status">{directory.error || directory.identityError || "至少需要两个可体验模型，点击添加模型选择"}</p>}
    <div className={`compare-grid columns-${columns.length}`}>
      {columns.map((column, index) => {
        const model = catalog.find(item => item.id === column.model) || { name: '模型已不可用', icon: 1, context: '未填写', output: '未填写', reason: '请重新选择模型' };
        return <article className="compare-column" key={column.id}>
          <div className="compare-model-bar"><div><BrainCircuit size={24} aria-hidden="true"/>
            <span id={labelId+column.id} className="sr-only">第 {index+1} 栏模型</span>
            <Select aria-labelledby={labelId+column.id} value={column.model} disabled={busy} placeholder="请选择模型"
              optionList={[...(!catalog.some(item=>item.id===column.model) ? [{value:column.model,label:'模型已不可用',disabled:true}] : []),
                ...catalog.map(item=>({value:item.id,label:item.name+(!item.callable?'（不可体验）':''),disabled:!item.callable}))]}
              onChange={value=>{try{beginExperience(directory,value,'text');update(column.id,{model:value,response:'',error:''});}
                catch(error){setNotice(error.message);}}} />
          </div>{columns.length>2 && <Button theme="borderless" type="tertiary" icon={<X size={16}/>}
            aria-label={`移除 ${model.name}`} onClick={()=>setColumns(items=>items.filter(item=>item.id!==column.id))}/>}</div>
          <p role="status">{column.error || (!model.callable ? model.reason : '')}</p>
          <div className="compare-stage">{column.response ? <div className="compare-response">
            <div><BrainCircuit size={24} aria-hidden="true"/><strong>{column.responseName || model.name}</strong><Tag>{column.deep?'深度思考':'标准回答'}</Tag></div>
            <p>{column.response}</p><Button theme="borderless" type="tertiary" icon={<Copy size={15}/>} onClick={()=>copy(column.response)}>复制回答</Button>
          </div> : <div className="compare-model-card">
            <div><BrainCircuit size={24} aria-hidden="true"/><Tag color={model.callable?'green':'grey'}>{model.callable?'可体验':'不可体验'}</Tag><Tag>{model.billing}</Tag></div>
            <h2>{model.name}</h2><p>{model.desc}</p><dl><div><dt>上下文</dt><dd>{model.context}</dd></div><div><dt>最大输出</dt><dd>{model.output}</dd></div></dl>
            <footer><span>供应商</span><strong>{model.provider}</strong></footer>
          </div>}</div>
          <form className="compare-composer" onSubmit={event=>{event.preventDefault();send(column.id);}}>
            <TextArea borderless rows={3} resize="none" disabled={busy} aria-label={`第 ${index+1} 栏输入`} value={column.input}
              onChange={value=>changeInput(column.id,value)}
              onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();send(column.id);}}}
              placeholder={sync?'输入问题，将同步发送给全部模型':`向 ${model.name} 提问`} />
            <div className="compare-tools">
              <Button theme={column.deep?'light':'borderless'} icon={<BrainCircuit size={17}/>} aria-label="深度思考" aria-pressed={column.deep}
                onClick={()=>update(column.id,{deep:!column.deep})}/>
              <Button theme="borderless" icon={<SlidersHorizontal size={17}/>} aria-label="参数设置" aria-haspopup="dialog"
                onClick={()=>update(column.id,{settings:true})}/>
              <span>{column.input.length}/6000</span>
              <Button className="compare-send" theme="solid" htmlType="submit" icon={<Send size={17}/>} loading={column.pending}
                aria-label={`发送给 ${sync?'全部模型':model.name}`} disabled={busy || !column.input.trim()}/>
            </div>
          </form>
          <Modal visible={column.settings} title={model.name+' 参数'} width="min(440px, calc(100vw - 24px))"
            onCancel={()=>update(column.id,{settings:false})}
            footer={<Button theme="solid" onClick={()=>update(column.id,{settings:false})}>完成</Button>}>
            <div className="tx-parameter-fields">
              <div>Temperature <output>{column.temperature}</output>
                <Slider aria-label={`第 ${index+1} 栏 Temperature`} min={0} max={2} step={0.1} value={Number(column.temperature)}
                  onChange={value=>update(column.id,{temperature:String(value)})}/>
              </div>
              <div>Top P <output>{column.topP}</output>
                <Slider aria-label={`第 ${index+1} 栏 Top P`} min={0} max={1} step={0.05} value={Number(column.topP)}
                  onChange={value=>update(column.id,{topP:String(value)})}/>
              </div>
            </div>
          </Modal>
        </article>;
      })}
    </div>
    <p className="compare-notice" role="status">{notice}</p>
  </section>;
}
