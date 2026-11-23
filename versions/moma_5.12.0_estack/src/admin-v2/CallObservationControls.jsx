import { useChannelText } from './channel-language';
import { useId, useMemo, useState } from 'react';
import { Button, Card, Cascader, Select, Space, Tag, Typography } from '@douyinfe/semi-ui';
import { IconCalendar, IconFilter } from '@douyinfe/semi-icons';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import { FilterPresets, FilterToolbar } from '../components/FilterControls';
import { dayOf } from './analytics';
import {
  callPresets, observationKey, observationName, observationOptions, observationTime, searchObservationIdentities, uncollectedObservationKey,
} from './call-observations.mjs';
import { SemiDateRange, SemiMultiPick } from './SemiAnalyticsFilters';
import { AnalysisHelp } from './AnalysisMetric';

export function ObservationTimeRange({ filters, window, onChange, children }) {
  const t = useChannelText();
  const custom = filters.period === 'custom';
  const time = window ? observationTime(window.start).slice(0, 16) + ' — ' + observationTime(window.end).slice(0, 16) : '自定义';
  const start = window ? dayOf(window.start) : dayOf(Date.now());
  const end = window ? dayOf(Math.max(window.start, window.end - 1)) : start;
  return <>
    <FilterPresets label={t('时间筛选')} items={callPresets.map(([id,label]) => [id,t(label)])} value={filters.period} onChange={period => onChange({ period, start: '', end: '' })}>
      <SemiDateRange start={start} end={end} maxDays={365} presets={[]} rangeHint={t('单次最多 365 天')}
        trigger={<Button icon={<IconCalendar aria-hidden="true"/>} aria-pressed={custom} aria-label={t('自定义日期范围')}>{custom ? time : t('自定义')}</Button>}
        onChange={dates => onChange({ ...dates, period: 'custom' })}/>
    </FilterPresets>
    <Typography.Text type="secondary">{t('北京时间')}</Typography.Text>
    {window && <AnalysisHelp label={t('统计时间')}>{time}</AnalysisHelp>}
    {children}
  </>;
}

export function ObservationPick({ dimension, label, rows, filters, onChange }) {
  const t = useChannelText();
  const options = useMemo(() => observationOptions(rows, dimension), [rows, dimension]);
  const value = filters[dimension] ?? null;
  const selected = (value || []).filter(id => !options.some(item => item.id === id)).map(id => ({ id, name: id }));
  return <SemiMultiPick compact label={t(label)} items={selected.length ? [...options, ...selected] : options}
    value={value} onChange={ids => onChange({ [dimension]: ids })}/>;
}

export function ObservationIdentitySearch({ dimension, label, rows, filters, onChange }) {
  const [query, setQuery] = useState('');
  const id = useId();
  const scoped = Boolean(filters.tenant?.length);
  const hint = scoped ? `按名称或完整 ID 搜索${label}` : `按完整 ID 搜索${label}，或先选客户`;
  const { items, hasMore } = searchObservationIdentities(rows, dimension, filters.tenant, query);
  const selected = filters[dimension] || [];
  return <>
    <span className="sr-only" id={id}>{label}筛选</span>
    <Select size="small" className="admin-observe-identity" aria-labelledby={id} filter remote value={null}
      placeholder={hint} searchPosition="trigger" dropdownMatchSelectWidth={false} inputProps={{ 'aria-label': hint }}
      onSearch={setQuery} onDropdownVisibleChange={visible => { if (!visible) setQuery(''); }}
      optionList={items.map(item => ({ value: item.id, label: item.label, disabled: selected.includes(item.id) }))}
      emptyContent={<span role="status">{query.trim() ? '无匹配结果' : hint}</span>}
      innerBottomSlot={hasMore ? <Typography.Text type="secondary">仅显示前 20 项，请缩小搜索范围</Typography.Text> : null}
      onSelect={value => onChange({ [dimension]: [...selected, value] })}/>
  </>;
}

export function ObservationFilterLayout({ primary, actions, children }) {
  const t = useChannelText();
  const [open, setOpen] = useState(false);
  const id = useId();
  return <>
    <div className="admin-analysis-filter-row">
      <FilterToolbar>
        {primary}
        <Button size="small" icon={<IconFilter aria-hidden="true"/>} aria-expanded={open} aria-controls={id}
          onClick={() => setOpen(value => !value)}>{t(open ? '收起筛选' : '更多筛选')}</Button>
      </FilterToolbar>
      {actions}
    </div>
    <div id={id} hidden={!open}>
      {open && <div className="admin-observe-filter-groups">{children}</div>}
    </div>
  </>;
}

export function ObservationFilterGroup({ label, children }) {
  return <div role="group" aria-label={label} className="admin-observe-filter-group">
    <Typography.Text type="secondary">{label}</Typography.Text>
    <Space wrap>{children}</Space>
  </div>;
}

export function ObservationConditions({ conditions }) {
  return conditions.length > 0 && <div role="group" aria-label="已选条件">
    <Space wrap>{conditions.map(([label, value, clear, id = label]) =>
      <Tag key={id} closable onClose={clear}>{label}：{value}</Tag>)}</Space>
  </div>;
}

export function observationConditions(rows, filters, dimensions, onChange) {
  return dimensions.flatMap(([dimension, label]) => {
    const selected = filters[dimension];
    if (selected == null) return [];
    const names = new Map(observationOptions(rows, dimension).map(item => [item.id, item.name]));
    if (selected.length && (dimension === 'user' || dimension === 'key')) {
      return selected.map(id => [label, names.get(id) || id,
        () => onChange({ [dimension]: selected.length === 1 ? null : selected.filter(value => value !== id) }),
        JSON.stringify([dimension, id])]);
    }
    const value = selected.map(id => names.get(id) || id).join('、') || '未选择';
    return [[label, value, () => onChange({ [dimension]: null })]];
  });
}

const supplyLabel = '服务商 / 连接';
const anyProvider = 0;
const providerValue = provider => provider ?? anyProvider;
const keyLabel = (id, label, name) => id === uncollectedObservationKey ? '未采集' + label : name || id;
function distinguishOptions(nodes) {
  const counts = new Map();
  for (const { label } of nodes) counts.set(label, (counts.get(label) || 0) + 1);
  return nodes.map(node => counts.get(node.label) > 1 ? { ...node, label: node.label + ' · ' + node.value } : node)
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

export function useObservationSupply(rows, selection) {
  const t = useChannelText();
  return useMemo(() => {
    const providers = new Map(), channelNames = new Map();
    const add = (provider, channel, providerName, channelName) => {
      const id = providerValue(provider);
      if (!providers.has(id)) {
        const label = provider == null ? t('全部服务商') : keyLabel(provider, t('服务商'), providerName);
        providers.set(id, { value: id, label, channels: new Map() });
      }
      const node = providers.get(id);
      if (channel != null && !node.channels.has(channel)) {
        const label = keyLabel(channel, t('连接'), channelName);
        node.channels.set(channel, { value: channel, label });
      }
    };
    for (const row of rows) {
      const channel = observationKey(row, 'channel'), name = observationName(row, 'channel');
      if (!channelNames.has(channel)) channelNames.set(channel, name);
      add(observationKey(row, 'provider'), channel, observationName(row, 'provider'), name);
    }
    for (const [provider, channel] of selection || []) {
      add(provider, channel, null, provider == null ? channelNames.get(channel) : null);
    }
    const treeData = distinguishOptions([...providers.values()]).map(({ channels, ...node }) => ({
      ...node, selectedLabel: node.label + t('（全部连接）'),
      ...(channels.size > 0 && { children: distinguishOptions([...channels.values()])
        .map(child => ({ ...child, selectedLabel: node.label + ' / ' + child.label })) }),
    }));
    const value = (selection || []).map(([provider, channel]) => channel == null
      ? [providerValue(provider)] : [providerValue(provider), channel]);
    const items = selection == null ? null : value.map(([provider, channel]) => {
      const node = treeData.find(item => item.value === provider);
      return channel == null ? node.selectedLabel : node.children.find(item => item.value === channel).selectedLabel;
    });
    return { treeData, value, group: { label: t(supplyLabel), items } };
  }, [rows, selection, t]);
}

export function ObservationSupplyPick({ treeData, value, group, onChange }) {
  const t = useChannelText();
  const [open, setOpen] = useState(false);
  const placeholder = group.items === null ? '全部' : '未选择';
  const change = paths => {
    const added = paths.length > value.length && paths.find(([provider, channel]) =>
      !value.some(([p, c]) => p === provider && c === channel));
    const selected = added ? paths.filter(([provider, channel]) =>
      provider !== added[0] || (channel == null) === (added.length === 1)) : paths;
    const supply = !selected.length || selected.some(([provider, channel]) => provider === anyProvider && channel == null)
      ? null : selected.map(([provider, channel]) => [provider === anyProvider ? null : provider, channel ?? null]);
    onChange({ supply });
  };
  return <Cascader multiple size="small" motion={false} showClear checkRelation="unRelated" filterLeafOnly={false}
    filterTreeNode={(query, path, node) => (path + ' ' + node.value).toLowerCase().includes(query.trim().toLowerCase())}
    maxTagCount={1} showRestTagsPopover displayProp="selectedLabel" insetLabel={t(supplyLabel)} aria-label={t('服务商 / 连接筛选')}
    placeholder={t(placeholder)} searchPlaceholder={t(open ? '搜索服务商或连接' : placeholder)} emptyContent={t('无匹配结果')}
    onDropdownVisibleChange={setOpen}
    className="admin-observation-supply" dropdownClassName="admin-observation-supply-menu"
    treeData={treeData} value={value} onChange={change}/>;
}

export function ObservationPlot({ title, actions, compact = true, ...props }) {
  return <Card title={<Typography.Title heading={5} component="h2">{title}</Typography.Title>} headerExtraContent={actions}>
    <TimeSeriesChart compact={compact} label={title} height={260} {...props}/>
  </Card>;
}
