import { useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { supplySummary, toggleSupplyGroup, toggleSupplyChannel } from './usage-trends';
import { supplyPickerGroups, supplyPickerSelectionSummary } from './usage-supply-picker';

export default function UsageSupplyPicker({ filters, options, onChange }) {
  const treeId = useId();
  const [open, setOpen] = useState(false), [expanded, setExpanded] = useState([]), [query, setQuery] = useState('');
  const [draft, setDraft] = useState({ providers: [], channels: [] }), [all, setAll] = useState(false);
  const channels = options.channels;
  const selected = item => all || draft.providers.includes(item.groupId) || draft.channels.includes(item.id);
  const materialized = () => all ? { providers: options.providers.map(item => item.id), channels: [] } : draft;
  const groups = supplyPickerGroups(options, query);
  const updateGroup = (id, checked) => { setDraft(toggleSupplyGroup(materialized(), id, channels, checked)); setAll(false); };
  const summary = supplyPickerSelectionSummary(draft, channels, all);
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) { setDraft({ providers: [...filters.providers], channels: [...(filters.channels || [])] }); setAll(filters.channels === null && !filters.providers.length); setExpanded([]); setQuery(''); } }}>
    <PopoverTrigger asChild><Button variant="outline" className="ua-compact-chip" data-active={filters.channels !== null || filters.providers.length > 0} aria-label="服务商与渠道筛选" title={supplySummary(filters, options, true)}><span className="truncate">{supplySummary(filters, options)}</span><ChevronDown/></Button></PopoverTrigger>
    <PopoverContent align="start" className="ua-supply-picker" aria-label="服务商与渠道多选">
      <div className="ua-picker-toolbar">
        <Input aria-label="搜索服务商或渠道" placeholder="搜索服务商 / 渠道名称或 ID" value={query} onChange={event => { const next = event.target.value; setQuery(next); setExpanded(next.trim() ? supplyPickerGroups(options, next).map(item => item.id) : []); }}/>
        <label className="ua-supply-all" title="勾选服务商即选择其全部渠道"><Checkbox aria-label="全部服务商" checked={all ? true : draft.providers.length || draft.channels.length ? 'indeterminate' : false} onCheckedChange={checked => { setAll(checked === true); setDraft({ providers: [], channels: [] }); }}/>全部服务商</label>
      </div>
      <div className="ua-supply-list" role="group" aria-label="服务商与渠道选项">
        {groups.map((item, index) => {
          const whole = all || draft.providers.includes(item.id);
          const count = whole ? item.totalChannels : channels.filter(channel => channel.groupId === item.id && draft.channels.includes(channel.id)).length;
          const status = whole || count > 0 && count === item.totalChannels ? true : count > 0 ? 'indeterminate' : false;
          const isExpanded = expanded.includes(item.id);
          const panelId = `${treeId}-${index}`;
          const duplicate = groups.some(provider => provider.id !== item.id && provider.displayName === item.displayName);
          const name = `${item.displayName}${duplicate ? ` · ${item.code || item.id}` : ''}`;
          return <div className="ua-supply-group" key={item.id}>
            <div className="ua-supply-row">
              <Button variant="ghost" size="icon" className="ua-supply-expand" aria-label={`${isExpanded ? '收起' : '展开'} ${name} 的渠道`} aria-expanded={isExpanded} aria-controls={isExpanded ? panelId : undefined} disabled={!item.totalChannels} onClick={() => setExpanded(previous => isExpanded ? previous.filter(id => id !== item.id) : [...previous, item.id])}>{isExpanded ? <ChevronDown/> : <ChevronRight/>}</Button>
              <label title="选择该服务商的全部渠道，包含后续新增渠道"><Checkbox aria-label={`选择服务商 ${name} 的全部渠道`} checked={status} onCheckedChange={checked => updateGroup(item.id, checked === true)}/><span title={`${name} / ${item.id}`}>{item.displayName}{duplicate && <small> · {item.code || item.id}</small>}</span></label>
              <small>{!item.totalChannels ? '暂无渠道' : whole ? `全部 ${item.totalChannels} 渠道` : count ? `已选 ${count}/${item.totalChannels} 渠道` : `${item.totalChannels} 渠道`}</small>
            </div>
            {isExpanded && <div className="ua-supply-children" id={panelId} role="group" aria-label={`${name}的渠道`}>{item.channels.map(channel => <label className="ua-supply-channel" key={channel.id}><Checkbox aria-label={`选择渠道 ${channel.name} ${channel.code || channel.id}`} checked={selected(channel)} onCheckedChange={checked => { setDraft(toggleSupplyChannel(materialized(), channel, channels, checked === true)); setAll(false); }}/><span title={`${channel.name}（${channel.code || channel.id}）`}>{channel.name}<small>（{channel.code || channel.id}）</small></span></label>)}</div>}
          </div>;
        })}
        {!groups.length && <p className="ua-picker-empty">暂无匹配结果</p>}
      </div>
      <footer><span title={summary}>{summary}</span><Button size="sm" variant="ghost" onClick={() => { setAll(false); setDraft({ providers: [], channels: [] }); }}>清空</Button><Button size="sm" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button size="sm" onClick={() => { onChange({ ...filters, providers: all ? [] : draft.providers, channels: all ? null : draft.channels }); setOpen(false); }}>确定</Button></footer>
    </PopoverContent>
  </Popover>;
}
