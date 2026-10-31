import { useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '../components/ui/command';
import { libraryRecord, modelLibrary } from './model-library';
import { Modal, Notice } from './ModelOperationsUI';
import { onboardingModelOptions } from './onboarding-presets';
import MinimalModelForm from './MinimalModelForm';

export default function SupplyModelPicker({ state, value, disabled, onChange, ops, includePresets = false, referenceModelIds = [], onCreateInline }) {
  const [open, setOpen] = useState(false), [creating, setCreating] = useState(false), [discarding, setDiscarding] = useState(false), options = (includePresets ? onboardingModelOptions(state) : modelLibrary(state)).sort((left, right) => Number(referenceModelIds.includes(right.modelId)) - Number(referenceModelIds.includes(left.modelId))), selected = options.find(row => row.id === value) || libraryRecord(state, value);
  const trigger = useRef(null), form = useRef(null), parentDirty = useRef(false), childDirty = useRef(false);
  const close = () => { setCreating(false); setDiscarding(false); childDirty.current = false; ops.dirty(parentDirty.current); ops.setError(''); requestAnimationFrame(() => trigger.current?.focus()); };
  const childOps = { ...ops, dirty: dirty => { childDirty.current = dirty; ops.dirty(parentDirty.current || dirty); }, run: (...args) => { const next = ops.run(...args); ops.dirty(parentDirty.current || !next && childDirty.current); return next; } };
  const resume = () => { setDiscarding(false); requestAnimationFrame(() => form.current?.querySelector('input')?.focus()); };
  const cancel = () => discarding ? resume() : childDirty.current ? setDiscarding(true) : close();
  return <><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button ref={trigger} type="button" variant="outline" role="combobox" aria-label="选择模型" aria-expanded={open} disabled={disabled} className="supplier-configuration-model"><span>{selected?.name || '请选择模型'}</span><ChevronDown/></Button></PopoverTrigger><PopoverContent align="start" className="supplier-configuration-model-options"><Command><CommandInput aria-label="搜索配置模型" placeholder="搜索模型名称 / 模型编码"/><CommandList><CommandEmpty>没有匹配的模型</CommandEmpty><CommandGroup>{options.map(model => <CommandItem key={model.id} value={model.id + ' ' + model.name + ' ' + model.modelId} onSelect={() => { onChange(model.id); setOpen(false); }}><span>{model.name}<small>{model.modelId}{referenceModelIds.includes(model.modelId) ? ' · 供应商参考' : model.modelPresetId ? ' · 内置目录' : ''}</small></span>{selected?.id === model.id && <Check/>}</CommandItem>)}</CommandGroup></CommandList></Command><Button type="button" variant="link" disabled={disabled} onClick={() => { setOpen(false); if (onCreateInline) { onCreateInline(); return; } parentDirty.current = ops.hasUnsaved(); childDirty.current = false; ops.setError(''); setCreating(true); }}>{onCreateInline ? '输入新模型 ID' : '新增模型资料'}</Button></PopoverContent></Popover>{creating && <Modal wide title="新增模型资料" description="保存后返回当前表单，不自动登记供应关系。" onClose={cancel}><div ref={form} hidden={discarding} onSubmit={event => event.stopPropagation()}><MinimalModelForm ops={childOps} onCancel={cancel} onSaved={(next, id) => { close(); onChange(id, next); }}/></div>{discarding && <div><Notice>放弃未保存的模型资料？</Notice><div className="supplier-key-actions"><Button type="button" variant="outline" autoFocus onClick={resume}>继续编辑</Button><Button type="button" onClick={close}>放弃修改</Button></div></div>}</Modal>}</>;
}
