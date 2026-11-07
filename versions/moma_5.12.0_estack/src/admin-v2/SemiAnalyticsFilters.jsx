import { useEffect, useId, useState } from 'react';
import { Banner, Button, Checkbox, DatePicker, Input, Popover, Space, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import { IconCalendar, IconChevronDown } from '@douyinfe/semi-icons';
import { TIME_PRESETS } from '../components/FilterControls';
import { dayOf, validAnalyticsRange } from './analytics';
import { usagePreset } from './usage-analysis';
import './semi-analytics.css';

const { Text, Paragraph } = Typography;
const stamp = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function SemiDateRange({ start, end, onChange, granularity = 'day', allowLongRange = false, label = '自定义', trigger,
  latest, rangeHint, presets = TIME_PRESETS, maxDays = allowLongRange || granularity === 'week' ? 365 : 30 }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState([start, end]);
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 600px)').matches);
  const dateId = useId();
  useEffect(() => {
    const media = matchMedia('(max-width: 600px)');
    const update = event => setNarrow(event.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const today = dayOf(Date.now());
  const valid = range.length === 2 && range.every(Boolean) && range[1] <= today
    && validAnalyticsRange(range[0], range[1], granularity, Date.now(), maxDays);
  const launch = () => { setRange([start, end]); setOpen(true); };
  const disabledDate = date => stamp(date) > today;
  return <>
    <Button theme={trigger?.props['aria-pressed'] ? 'solid' : 'light'} icon={trigger ? trigger.props.icon : <IconCalendar aria-hidden="true"/>}
      aria-label={trigger?.props['aria-label'] || '日期范围'} aria-pressed={trigger?.props['aria-pressed']} onClick={launch}>
      {trigger?.props.children || `${label ? label + ' · ' : ''}${start} — ${end}`}
    </Button>
    {open && <Modal visible title="日期范围" width="min(560px, calc(100vw - 32px))" closeOnEsc maskClosable={false}
      okText="应用日期" okButtonProps={{ disabled: !valid, 'aria-label': '应用日期' }} cancelButtonProps={{ 'aria-label': '取消' }}
      onOk={() => { if (valid) { onChange({ start: range[0], end: range[1] }); setOpen(false); } }} onCancel={() => setOpen(false)}>
      <div className="admin-analytics-fields">
        {presets.length > 0 && <Space wrap>{presets.map(([id, name]) => <Button key={id} size="small"
          onClick={() => { const value = usagePreset(id); setRange([value.start, value.end]); }}>{name}</Button>)}</Space>}
        {narrow ? <div className="admin-date-pair">
          {['开始日期', '结束日期'].map((name, index) => <div key={name}>
            <Text id={`${dateId}-${index}`} type="secondary">{name}</Text>
            <DatePicker aria-labelledby={`${dateId}-${index}`} type="date" onChangeWithDateFirst={false} format="yyyy-MM-dd" value={range[index] || ''}
              onChange={value => setRange(current => index === 0 ? [value || '', current[1] || ''] : [current[0] || '', value || ''])}
              disabledDate={disabledDate} placeholder={name} zIndex={1200}/>
          </div>)}
        </div> : <DatePicker type="dateRange" onChangeWithDateFirst={false} format="yyyy-MM-dd" value={range} onChange={value => setRange(Array.isArray(value) ? value : [])}
          disabledDate={disabledDate} placeholder={['开始日期', '结束日期']} zIndex={1200}/>}
        <Paragraph type="secondary">北京时间 · {rangeHint || (allowLongRange ? '单日按小时，2–30 天按日，31–365 天按周'
          : granularity === 'week' ? '周粒度最多 1 年（365 天）' : `单次最多 ${maxDays} 天`)} · 当日从 00:00 至当前时刻</Paragraph>
        {latest && <Paragraph type="tertiary">记录截至 {latest}，之后的范围可能暂无数据。</Paragraph>}
        {range.length === 2 && range.every(Boolean) && !valid && <Banner type="danger" closeIcon={null}
          description={range[0] > range[1] ? "结束日期不能早于开始日期。" : `请选择不晚于今天且不超过 ${maxDays} 天的日期范围。`}/>}
      </div>
    </Modal>}
  </>;
}

export function SemiMultiPick({ label, value, onChange, items, searchPlaceholder, compact = false, hint }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [draft, setDraft] = useState(value);
  const selected = new Set(draft === null ? items.map(item => item.id) : draft);
  const matches = items.filter(item => `${item.name} ${item.id} ${item.searchText || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const visible = onlySelected ? matches.filter(item => selected.has(item.id)) : matches;
  const selectedIds = items.filter(item => selected.has(item.id)).map(item => item.id);
  const allChecked = matches.length > 0 && matches.every(item => selected.has(item.id));
  const toggle = (ids, checked) => {
    const change = new Set(ids);
    setDraft(checked ? [...new Set([...selected, ...ids])] : [...selected].filter(id => !change.has(id)));
  };
  const display = value === null || value.length === items.length ? `全部${label}` : value.length ? `${label}（已选 ${value.length}）` : `${label}（未选择）`;
  return <Popover trigger="click" position="bottomLeft" motion={false} visible={open} onVisibleChange={next => {
    setOpen(next);
    if (next) { setDraft(value); setQuery(''); setOnlySelected(false); }
  }} content={({ initialFocusRef }) => <div ref={initialFocusRef} tabIndex={-1} className="admin-analytics-picker admin-analytics-fields" aria-label={`${label}多选`}>
    {hint && <Paragraph type="tertiary" size="small">{hint}</Paragraph>}
    <Input aria-label={`搜索${label}`} placeholder={searchPlaceholder || `搜索${label}名称或 ID`} value={query} onChange={setQuery}/>
    <Checkbox checked={allChecked} disabled={!matches.length}
      onChange={event => toggle(matches.map(item => item.id), event.target.checked)}>
      {query ? `全选搜索结果（${matches.length}）` : `全选全部${label}（${items.length}）`}
    </Checkbox>
    <Space wrap>
      <Text type="secondary">已选择 {selectedIds.length} 项</Text>
      <Button size="small" theme="borderless" aria-pressed={onlySelected} onClick={() => setOnlySelected(!onlySelected)}>仅看已选</Button>
      <Button size="small" theme="borderless" disabled={!selectedIds.length} onClick={() => setDraft([])}>清空</Button>
    </Space>
    <div className="admin-analytics-options">
      {visible.map(item => <Checkbox key={item.id} checked={selected.has(item.id)}
        onChange={event => toggle([item.id], event.target.checked)}>{item.name}</Checkbox>)}
      {!visible.length && <Text type="secondary">无匹配结果</Text>}
    </div>
    <div className="admin-analytics-picker-footer">
      <Text type="secondary">共 {visible.length} 项{onlySelected ? '（已选）' : query ? '（搜索结果）' : ''}</Text>
      <Space>
        <Button size="small" onClick={() => { setDraft(value); setOpen(false); }}>取消</Button>
        <Button size="small" theme="solid" onClick={() => { onChange(selectedIds.length === items.length ? null : selectedIds); setOpen(false); }}>
          确定（{selectedIds.length}）
        </Button>
      </Space>
    </div>
  </div>}>
    <Button size={compact ? 'small' : 'default'} icon={<IconChevronDown aria-hidden="true"/>} iconPosition="right"
      aria-label={`${label}筛选`} aria-expanded={open}>{compact ? `${label}：${value === null ? '全部' : value.length + '个'}` : display}</Button>
  </Popover>;
}
