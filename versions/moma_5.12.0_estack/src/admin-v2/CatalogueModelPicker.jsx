import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from '../components/ui/command';
import { providerCatalogueIds } from './moma-provider';

export function CatalogueModelPicker({ provider, value, disabled, onChange, modelIds }) {
  const [open, setOpen] = useState(false);
  const models = provider ? modelIds || providerCatalogueIds(provider) : [];
  const selected = models.includes(value) ? value : '';
  const placeholder = !provider ? '请先选择供应商' : !models.length ? '该供应商暂无目录模型' : '搜索并选择目录模型';
  return <><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-label="目录模型" aria-expanded={open} disabled={disabled || !provider || !models.length} className="mo-catalogue-trigger"><span title={selected || placeholder}>{selected || placeholder}</span><ChevronDown/></Button></PopoverTrigger><PopoverContent align="start" className="mo-catalogue-picker"><Command><CommandInput aria-label="搜索目录模型" placeholder="搜索供应商 Model ID"/><CommandList><CommandEmpty>未找到匹配的目录模型</CommandEmpty><CommandGroup>{models.map(id => <CommandItem key={id} value={id} onSelect={() => { if (id !== value) onChange(id); setOpen(false); }}><span>{id}</span>{selected === id && <Check/>}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover>{value && !selected && <small role="alert">原选目录模型已失效，请重新选择。</small>}</>;
}
