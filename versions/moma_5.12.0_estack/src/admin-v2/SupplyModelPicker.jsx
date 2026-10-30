import { useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '../components/ui/command';
import { libraryRecord, modelLibrary } from './model-library';
import { Modal } from './ModelOperationsUI';
import ModelLibraryEditor from './ModelLibraryEditor';

export default function SupplyModelPicker({ state, value, disabled, onChange, ops }) {
  const [open, setOpen] = useState(false), [creating, setCreating] = useState(false), selected = libraryRecord(state, value);
  const trigger = useRef(null), parentDirty = useRef(false), childDirty = useRef(false);
  const close = () => { setCreating(false); ops.dirty(parentDirty.current); ops.setError(''); requestAnimationFrame(() => trigger.current?.focus()); };
  const childOps = { ...ops, dirty: dirty => { childDirty.current = dirty; ops.dirty(parentDirty.current || dirty); }, run: (...args) => { const next = ops.run(...args); ops.dirty(parentDirty.current || !next && childDirty.current); return next; } };
  const cancel = () => childDirty.current ? ops.proceed(close) : close();
  return <><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button ref={trigger} type="button" variant="outline" role="combobox" aria-label="选择模型" aria-expanded={open} disabled={disabled} className="supplier-configuration-model"><span>{selected?.name || '请选择模型'}</span><ChevronDown/></Button></PopoverTrigger><PopoverContent align="start" className="supplier-configuration-model-options"><Command><CommandInput aria-label="搜索配置模型" placeholder="搜索模型名称 / ID"/><CommandList><CommandEmpty>没有匹配的模型</CommandEmpty><CommandGroup>{modelLibrary(state).map(model => <CommandItem key={model.id} value={model.id + ' ' + model.name + ' ' + model.modelId} onSelect={() => { onChange(model.id); setOpen(false); }}><span>{model.name}<small>{model.modelId}</small></span>{selected?.id === model.id && <Check/>}</CommandItem>)}</CommandGroup></CommandList></Command><Button type="button" variant="link" disabled={disabled} onClick={() => { parentDirty.current = ops.hasUnsaved(); childDirty.current = false; setOpen(false); ops.setError(''); setCreating(true); }}>新增模型资料</Button></PopoverContent></Popover>{creating && <Modal wide title="新增模型资料" description="保存后返回当前表单，不自动登记供应关系。" onClose={cancel}><div onSubmit={event => event.stopPropagation()}><ModelLibraryEditor state={state} ops={childOps} onCancel={cancel} onSaved={(next, id) => { close(); onChange(id); }}/></div></Modal>}</>;
}
