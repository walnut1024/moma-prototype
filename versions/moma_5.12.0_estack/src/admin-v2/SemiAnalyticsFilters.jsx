import { useChannelText } from './channel-language';
import { useCallback, useContext, useEffect, useId, useState } from 'react';
import * as Semi from '@douyinfe/semi-ui';
import { AdminModal } from './AdminOverlay';
import { IconCalendar, IconChevronDown } from '@douyinfe/semi-icons';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { AdminUIContext } from '../components/admin-ui-context';
import { XaBanner, XaButton, XaCheckbox, XaInput, XaModal, XaPopover, XaSpace, XaTypography } from './xa24/HaloComponents.jsx';
import { XaDatePicker } from './xa24/HaloDatePicker.jsx';
import { TIME_PRESETS } from '../components/FilterControls';
import { dayOf, validAnalyticsRange } from './analytics';
import { usagePreset } from './usage-analysis';
import './semi-analytics.css';

const frontControls = { Banner: Semi.Banner, Button: Semi.Button, Checkbox: Semi.Checkbox, DatePicker: Semi.DatePicker,
  Input: Semi.Input, Modal: AdminModal, Space: Semi.Space, Text: Semi.Typography.Text, Paragraph: Semi.Typography.Paragraph };
const adminControls = { Banner: XaBanner, Button: XaButton, Checkbox: XaCheckbox, DatePicker: XaDatePicker,
  Input: XaInput, Modal: XaModal, Space: XaSpace, Text: XaTypography.Text, Paragraph: XaTypography.Paragraph };
const stamp = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function SemiDateRange({ start, end, onChange, granularity = 'day', allowLongRange = false, label = '自定义', trigger,
  latest, rangeHint, presets = TIME_PRESETS, maxDays = allowLongRange || granularity === 'week' ? 365 : 30 }) {
  const t = useChannelText();
  const admin = useContext(AdminUIContext);
  const { Banner, Button, DatePicker, Modal, Space, Text, Paragraph } = admin ? adminControls : frontControls;
  const calendar = admin ? <CalendarDays size={16} aria-hidden="true"/> : <IconCalendar aria-hidden="true"/>;
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
    <Button theme={trigger?.props['aria-pressed'] ? 'solid' : 'light'} icon={trigger ? trigger.props.icon : calendar}
      aria-label={trigger?.props['aria-label'] || '日期范围'} aria-pressed={trigger?.props['aria-pressed']} onClick={launch}>
      {trigger?.props.children || `${label ? label + ' · ' : ''}${start} — ${end}`}
    </Button>
    {open && <Modal visible title={t('日期范围')} width="min(560px, calc(100vw - 32px))" closeOnEsc maskClosable={false}
      okText={t('应用日期')} cancelText={t('取消')} okButtonProps={{ disabled: !valid, 'aria-label': t('应用日期') }} cancelButtonProps={{ 'aria-label': t('取消') }}
      onOk={() => { if (valid) { onChange({ start: range[0], end: range[1] }); setOpen(false); } }} onCancel={() => setOpen(false)}>
      <div className="admin-analytics-fields">
        {presets.length > 0 && <Space wrap>{presets.map(([id, name]) => <Button key={id} size="small"
          onClick={() => { const value = usagePreset(id); setRange([value.start, value.end]); }}>{name}</Button>)}</Space>}
        {narrow ? <div className="admin-date-pair">
          {['开始日期', '结束日期'].map((name, index) => <div key={name}>
            <Text id={`${dateId}-${index}`} type="secondary">{t(name)}</Text>
            <DatePicker aria-labelledby={`${dateId}-${index}`} type="date" onChangeWithDateFirst={false} format="yyyy-MM-dd" value={range[index] || ''}
              onChange={value => setRange(current => index === 0 ? [value || '', current[1] || ''] : [current[0] || '', value || ''])}
              disabledDate={disabledDate} placeholder={t(name)} zIndex={1200}/>
          </div>)}
        </div> : <DatePicker type="dateRange" onChangeWithDateFirst={false} format="yyyy-MM-dd" value={range} onChange={value => setRange(Array.isArray(value) ? value : [])}
          disabledDate={disabledDate} placeholder={[t('开始日期'), t('结束日期')]} zIndex={1200}/>}
        <Paragraph type="secondary">{t('北京时间')} · {rangeHint || (allowLongRange ? '单日按小时，2–30 天按日，31–365 天按周'
          : granularity === 'week' ? '周粒度最多 1 年（365 天）' : `单次最多 ${maxDays} 天`)} · {t('当日从 00:00 至当前时刻')}</Paragraph>
        {latest && <Paragraph type="tertiary">记录截至 {latest}，之后的范围可能暂无数据。</Paragraph>}
        {range.length === 2 && range.every(Boolean) && !valid && <Banner type="danger" closeIcon={null}
          description={range[0] > range[1] ? "结束日期不能早于开始日期。" : `请选择不晚于今天且不超过 ${maxDays} 天的日期范围。`}/>}
      </div>
    </Modal>}
  </>;
}

export function SemiMultiPick({ label, value, onChange, items, searchPlaceholder, compact = false, hint }) {
  const t = useChannelText();
  const admin = useContext(AdminUIContext);
  const { Button, Checkbox, Input, Space, Text, Paragraph } = admin ? adminControls : frontControls;
  const arrow = admin ? <ChevronDown size={16} aria-hidden="true"/> : <IconChevronDown aria-hidden="true"/>;
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
  const changeOpen = next => {
    setOpen(next);
    if (next) { setDraft(value); setQuery(''); setOnlySelected(false); }
  };
  const focusSearch = useCallback(input => {
    if (open) input?.focus({ preventScroll: true });
  }, [open]);
  const panel = initialFocusRef => <div ref={initialFocusRef} tabIndex={-1} className="admin-analytics-picker admin-analytics-fields" aria-label={`${label}多选`}>
    {hint && <Paragraph type="tertiary" size="small">{hint}</Paragraph>}
    <Input ref={admin ? focusSearch : undefined} aria-label={`搜索${label}`} placeholder={searchPlaceholder || t('搜索{label}名称或 ID').replace('{label}',label)} value={query} onChange={setQuery}/>
    <Checkbox checked={allChecked} disabled={!matches.length}
      onChange={event => toggle(matches.map(item => item.id), event.target.checked)}>
      {query ? t('全选搜索结果（{count}）').replace('{count}',matches.length) : t('全选全部{label}（{count}）').replace('{label}',label).replace('{count}',items.length)}
    </Checkbox>
    <Space wrap>
      <Text type="secondary">{t('已选择 {count} 项').replace('{count}', selectedIds.length)}</Text>
      <Button size="small" theme="borderless" aria-pressed={onlySelected} onClick={() => setOnlySelected(!onlySelected)}>{t('仅看已选')}</Button>
      <Button size="small" theme="borderless" disabled={!selectedIds.length} onClick={() => setDraft([])}>{t('清除')}</Button>
    </Space>
    <div className="admin-analytics-options">
      {visible.map(item => <Checkbox key={item.id} checked={selected.has(item.id)}
        onChange={event => toggle([item.id], event.target.checked)}>{item.name}</Checkbox>)}
      {!visible.length && <Text type="secondary">{t('无匹配结果')}</Text>}
    </div>
    <div className="admin-analytics-picker-footer">
      <Text type="secondary">{t('共 {count} 项').replace('{count}',visible.length)}{t(onlySelected ? '（已选）' : query ? '（搜索结果）' : '')}</Text>
      <Space>
        <Button size="small" onClick={() => { setDraft(value); setOpen(false); }}>{t('取消')}</Button>
        <Button size="small" theme="solid" onClick={() => { onChange(selectedIds.length === items.length ? null : selectedIds); setOpen(false); }}>
          {t('确定')} ({selectedIds.length})
        </Button>
      </Space>
    </div>
  </div>;
  const trigger = <Button size={compact ? 'small' : 'default'} icon={arrow} iconPosition="right"
    aria-label={`${label}筛选`} aria-expanded={open}>{compact ? t('{label}：{selection}').replace('{label}',label).replace('{selection}',value === null ? t('全部') : t('{count}个').replace('{count}',value.length)) : display}</Button>;
  return admin
    ? <XaPopover open={open} onChange={changeOpen} placement="bottom-start" content={panel()}>{trigger}</XaPopover>
    : <Semi.Popover trigger="click" position="bottomLeft" motion={false} visible={open}
        onVisibleChange={changeOpen} content={({ initialFocusRef }) => panel(initialFocusRef)}>{trigger}</Semi.Popover>;
}
