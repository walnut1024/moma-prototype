import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '../components/ui/button';

import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '../components/ui/command';

import { TARIFF_KINDS } from './tariff-dictionary';
import './supplier-workbench.css';

export function TariffChoice({ label, kind, value, options, entries = [], disabled, onChange }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const text = query.trim(), entry = name => entries.find(item => (kind === 'currency' ? item.code : item.name) === name);
  const display = name => kind === 'currency' && entry(name) ? name + ' · ' + entry(name).name : name;
  const matches = options.filter(name => [name, entry(name)?.name, entry(name)?.englishName].join(' ').toLowerCase().includes(text.toLowerCase()));
  const placeholder = kind === 'currency' ? '请选择货币' : '请选择或输入';
  const select = name => { onChange(name); setOpen(false); };
  return <Popover open={open} onOpenChange={next => { setOpen(next); setQuery(''); }}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={label} title={display(value) || placeholder} disabled={disabled} className="supplier-tariff-choice"><span>{display(value) || placeholder}</span><ChevronsUpDown data-icon="inline-end"/></Button></PopoverTrigger><PopoverContent className="supplier-tariff-options" align="start"><Command shouldFilter={false}><CommandInput maxLength={kind === 'unit' ? 40 : 80} aria-label={`搜索或输入${label}`} placeholder={kind === 'currency' ? '搜索代码或中英文名称' : '搜索常用项或输入自定义值'} value={query} onValueChange={setQuery}/><CommandList aria-label={`${label}选项`}><CommandEmpty>{kind === 'currency' ? '暂无匹配货币，请在“模型资料 → 货币”中维护。' : '暂无常用项，请输入自定义值。'}</CommandEmpty><CommandGroup heading={`常用${TARIFF_KINDS[kind]}`}>{matches.map(name => <CommandItem key={name} value={name} data-checked={value === name} onSelect={() => select(name)}><span>{display(name)}{entry(name)?.englishName && <small className="supplier-tariff-english">{entry(name).englishName}</small>}</span></CommandItem>)}</CommandGroup>{kind !== 'currency' && text && !options.some(item => item.toLowerCase() === text.toLowerCase()) && <CommandGroup heading="自定义"><CommandItem value={`custom:${text}`} onSelect={() => select(text)}>使用“{text}”</CommandItem></CommandGroup>}</CommandList></Command></PopoverContent></Popover>;
}
