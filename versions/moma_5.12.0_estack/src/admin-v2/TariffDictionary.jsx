import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ChevronsUpDown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { Card, CardContent } from '../components/ui/card';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '../components/ui/command';
import { Field } from './ModelMetadataForm';
import { GridTable, Row, Cell, Modal, Status, Notice, useOperations } from './ModelOperationsUI';
import { TARIFF_KINDS, tariffDictionaryEntries, tariffDictionaryId } from './tariff-dictionary';
import './supplier-workbench.css';
import { operationsReturn } from './model-pricing-workspace';
import { Tabs,TabsList,TabsTrigger } from '../components/ui/tabs';

export function TariffDictionaryPage(props) {
  const ops = useOperations(props, 'tariff-dictionary');
  const tab = ops.params.get('tab'), kind = Object.hasOwn(TARIFF_KINDS, tab) ? tab : 'scenario';
  return <div className="mo-workbench supplier-workbench"><div className="mp-heading"><h1>计量配置</h1><Button variant="outline" onClick={()=>ops.proceed(()=>{location.hash=operationsReturn(ops.params.get('returnTo')) || '#/admin-2/model-costs';})}>返回</Button></div><Tabs value={kind} onValueChange={tab=>ops.go({tab})}><TabsList variant="line" aria-label="计量配置">{Object.entries(TARIFF_KINDS).map(([id,label])=><TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}</TabsList></Tabs><TariffDictionary key={kind} kind={kind} state={props.state} ops={ops}/>{ops.error && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}</div>;
}

export function TariffChoice({ label, kind, value, options, entries = [], disabled, onChange }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const text = query.trim(), entry = name => entries.find(item => (kind === 'currency' ? item.code : item.name) === name);
  const display = name => kind === 'currency' && entry(name) ? name + ' · ' + entry(name).name : name;
  const matches = options.filter(name => [name, entry(name)?.name, entry(name)?.englishName].join(' ').toLowerCase().includes(text.toLowerCase()));
  const placeholder = kind === 'currency' ? '请选择货币' : '请选择或输入';
  const select = name => { onChange(name); setOpen(false); };
  return <Popover open={open} onOpenChange={next => { setOpen(next); setQuery(''); }}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={label} title={display(value) || placeholder} disabled={disabled} className="supplier-tariff-choice"><span>{display(value) || placeholder}</span><ChevronsUpDown data-icon="inline-end"/></Button></PopoverTrigger><PopoverContent className="supplier-tariff-options" align="start"><Command shouldFilter={false}><CommandInput maxLength={kind === 'unit' ? 40 : 80} aria-label={`搜索或输入${label}`} placeholder={kind === 'currency' ? '搜索代码或中英文名称' : '搜索常用项或输入自定义值'} value={query} onValueChange={setQuery}/><CommandList aria-label={`${label}选项`}><CommandEmpty>{kind === 'currency' ? '暂无匹配货币，请在资料管理的货币页维护。' : '暂无常用项，请输入自定义值。'}</CommandEmpty><CommandGroup heading={`常用${TARIFF_KINDS[kind]}`}>{matches.map(name => <CommandItem key={name} value={name} data-checked={value === name} onSelect={() => select(name)}><span>{display(name)}{entry(name)?.englishName && <small className="supplier-tariff-english">{entry(name).englishName}</small>}</span></CommandItem>)}</CommandGroup>{kind !== 'currency' && text && !options.some(item => item.toLowerCase() === text.toLowerCase()) && <CommandGroup heading="自定义"><CommandItem value={`custom:${text}`} onSelect={() => select(text)}>使用“{text}”</CommandItem></CommandGroup>}</CommandList></Command></PopoverContent></Popover>;
}

function DictionaryEditor({ entry, kind, state, ops, close }) {
  const [name, setName] = useState(entry?.name || ''), [englishName, setEnglishName] = useState(entry?.englishName || ''), [code, setCode] = useState(entry?.code || ''), [unitId, setUnitId] = useState(entry?.unitId || ''), [description, setDescription] = useState(entry?.description || '');
  const units = tariffDictionaryEntries(state).filter(item => item.kind === 'unit' && (item.status === '已启用' || item.id === unitId));
  const update = (setter, value) => { setter(value); ops.dirty(true); ops.setError(''); };
  const label = TARIFF_KINDS[kind], cancel = () => ops.proceed(close);
  return <Modal title={kind === 'scenario' && !entry ? '新增计费项' : `${entry ? '编辑' : '新增'}${label}`} description="用于采购与平台售价。已被价格或草稿引用的名称和货币代码不可修改；可停用，已有配置和历史保留。" onClose={cancel}><form className="supplier-key-form" noValidate onSubmit={async event => {
    event.preventDefault();
    if (await ops.run('tariffDictionary', { operation: 'save', id: entry?.id, kind, name, englishName, code, unitId, description })) close();
  }}><Field label="中文名称" hint={kind === 'unit' ? '只填计量单位，如百万 Token、张；货币单独选择。' : kind === 'currency' ? '如人民币、美元。' : '如输入 Token、输出 Token、缓存读取 Token；名称须体现计量对象。'}><Input aria-label="中文名称" value={name} maxLength={kind === 'unit' ? 40 : 80} disabled={!ops.can} aria-invalid={Boolean(ops.error)} onChange={event => update(setName, event.target.value)}/></Field><Field label="英文名称" hint="最多 80 个英文字符，用于识别和搜索常用项。"><Input aria-label="英文名称" value={englishName} maxLength={80} disabled={!ops.can} onChange={event => update(setEnglishName, event.target.value)}/></Field>{kind === 'scenario' && <Field label="计价单位" hint="选择此计费项的默认计价单位，配置模型价格时自动带出。没有合适单位时，请先在计价单位中维护。"><Select value={unitId || undefined} disabled={!ops.can} onValueChange={value => update(setUnitId, value)}><SelectTrigger aria-label="计价单位"><SelectValue placeholder="请选择单位"/></SelectTrigger><SelectContent>{units.map(item => <SelectItem key={item.id} value={item.id} disabled={item.status !== '已启用'}>{item.name}{item.status !== '已启用' ? '（已停用）' : ''}{item.englishName ? ' · ' + item.englishName : ''}</SelectItem>)}</SelectContent></Select></Field>}{kind === 'scenario' && <Field label="计费说明" hint="说明计量对象及适用口径，选填，最多 160 字。"><Input aria-label="计费说明" value={description} maxLength={160} disabled={!ops.can} onChange={event => update(setDescription, event.target.value)}/></Field>}{kind === 'currency' && <Field label="货币代码" hint="ISO 4217 三位大写代码，如 CNY、USD。"><Input aria-label="货币代码" value={code} maxLength={3} disabled={!ops.can} onChange={event => update(setCode, event.target.value.toUpperCase())}/></Field>}{ops.error && <p className="supplier-key-error" role="alert">{ops.error}</p>}<div className="supplier-key-actions"><Button variant="outline" type="button" onClick={cancel}>取消</Button><Button type="submit" disabled={!ops.can}>保存字典项</Button></div></form></Modal>;
}

export default function TariffDictionary({ state, ops, kind }) {
  const label = TARIFF_KINDS[kind];
  const [query, setQuery] = useState(''), [editing, setEditing] = useState(null), [removing, setRemoving] = useState(null), trigger = useRef(null), addTrigger = useRef(null);
  const entries = useMemo(() => tariffDictionaryEntries(state), [state.tariffDictionary]);
  const [ids, setIds] = useState({}), [idError, setIdError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all(entries.map(async item => [item.id, await tariffDictionaryId(item.id)])).then(values => {
      if (active) { setIds(Object.fromEntries(values)); setIdError(''); }
    }).catch(() => { if (active) setIdError('字典 ID 加载失败，请刷新后重试。'); });
    return () => { active = false; };
  }, [entries]);
  const rows = entries.filter(item => item.kind === kind && [ids[item.id], item.name, item.englishName, item.code].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const edit = (event, entry) => { trigger.current = event.currentTarget; ops.setError(''); setEditing({ entry, kind }); };
  const close = () => { setEditing(null); setRemoving(null); ops.setError(''); requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : addTrigger.current)?.focus()); };
  return <>{idError && <Notice error>{idError}</Notice>}<Card className="supplier-card supplier-detail-card"><CardContent><div className="supplier-toolbar supplier-dictionary-toolbar"><Input type="search" aria-label={`搜索${label}`} placeholder={`搜索${label} ID / 中文或英文名称`} value={query} onChange={event => setQuery(event.target.value)}/><Button ref={addTrigger} size="sm" disabled={!ops.can} onClick={event => edit(event, null)}><Plus data-icon="inline-start"/>{kind === 'unit' ? '新增单位' : kind === 'currency' ? '新增货币' : '新增计费项'}</Button></div><GridTable className="supplier-dictionary-table" headings={['名称', ...(kind === 'currency' ? ['货币代码'] : kind === 'scenario' ? ['计价单位'] : []), '来源', '状态', '操作']} empty={!rows.length} emptyMessage={query.trim() ? '没有匹配的字典项，请调整搜索条件。' : `尚未维护${label}，请添加常用项。`}>{rows.map(item => { const unit = tariffDictionaryEntries(state).find(row => row.kind === 'unit' && row.id === item.unitId); return <Row key={item.id}><Cell><strong>{item.name}</strong>{item.englishName && <small>{item.englishName}</small>}<details className="supplier-dictionary-reference"><summary>查看标识</summary><code aria-busy={!ids[item.id]}>{ids[item.id] || '—'}</code></details></Cell>{kind === 'scenario' && <Cell>{unit ? unit.name + (unit.status === '已启用' ? '' : '（已停用）') : <span className="supplier-key-pending">待配置</span>}</Cell>}{kind === 'currency' && <Cell><code>{item.code}</code></Cell>}<Cell>{item.builtin ? '内置' : '自定义'}</Cell><Cell><Status good={item.status === '已启用'}>{item.status}</Status></Cell><Cell>{item.builtin ? <span className="supplier-key-pending">内置只读</span> : <div className="supplier-row-actions"><Button variant="outline" size="sm" disabled={!ops.can} aria-label={`编辑 ${item.name}`} onClick={event => edit(event, item)}>编辑</Button><Button variant="ghost" size="sm" disabled={!ops.can} aria-label={`${item.status === '已启用' ? '停用' : '启用'} ${item.name}`} onClick={async () => await ops.run('tariffDictionary', { operation: 'status', id: item.id, status: item.status === '已启用' ? '已停用' : '已启用' })}>{item.status === '已启用' ? '停用' : '启用'}</Button><Button variant="ghost" size="sm" className="text-destructive" disabled={!ops.can} aria-label={`删除 ${item.name}`} onClick={event => { trigger.current = event.currentTarget; ops.setError(''); setRemoving(item); }}>删除</Button></div>}</Cell></Row>; })}</GridTable></CardContent></Card>{editing && <DictionaryEditor key={editing.entry?.id || editing.kind} entry={editing.entry} kind={editing.kind} state={state} ops={ops} close={close}/>} {removing && <Modal title="删除自定义字典项" description={`确认删除“${removing.name}”？仅可删除未被价格、草稿或计费项引用的条目。已有历史引用时，可改为停用。`} onClose={close}>{ops.error && <p role="alert" className="supplier-key-error">{ops.error}</p>}<div className="supplier-key-actions"><Button variant="outline" onClick={close}>取消</Button><Button variant="destructive" disabled={!ops.can} onClick={async () => { if (await ops.run('tariffDictionary', { operation: 'delete', id: removing.id })) close(); }}>确认删除</Button></div></Modal>}</>;
}
