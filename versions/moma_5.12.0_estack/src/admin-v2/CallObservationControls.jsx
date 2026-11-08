import { useMemo, useState } from 'react';
import { Button, Card, Cascader, Typography } from '@douyinfe/semi-ui';
import { IconCalendar } from '@douyinfe/semi-icons';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import { FilterPresets } from '../components/FilterControls';
import { dayOf } from './analytics';
import {
  callPresets, observationKey, observationName, observationOptions, observationTime, uncollectedObservationKey,
} from './call-observations.mjs';
import { SemiDateRange, SemiMultiPick } from './SemiAnalyticsFilters';
import { AnalysisHelp } from './AnalysisMetric';

export function ObservationTimeRange({ filters, window, onChange, children }) {
  const custom = filters.period === 'custom';
  const time = window ? observationTime(window.start).slice(0, 16) + ' — ' + observationTime(window.end).slice(0, 16) : '自定义';
  const start = window ? dayOf(window.start) : dayOf(Date.now());
  const end = window ? dayOf(Math.max(window.start, window.end - 1)) : start;
  return <>
    <FilterPresets items={callPresets} value={filters.period} onChange={period => onChange({ period, start: '', end: '' })}>
      <SemiDateRange start={start} end={end} maxDays={365} presets={[]} rangeHint="单次最多 365 天"
        trigger={<Button icon={<IconCalendar aria-hidden="true"/>} aria-pressed={custom} aria-label="自定义日期范围">{custom ? time : '自定义'}</Button>}
        onChange={dates => onChange({ ...dates, period: 'custom' })}/>
    </FilterPresets>
    <Typography.Text type="secondary">北京时间</Typography.Text>
    {window && <AnalysisHelp label="统计时间">{time}</AnalysisHelp>}
    {children}
  </>;
}

export function ObservationPick({ dimension, label, rows, filters, onChange }) {
  const options = useMemo(() => observationOptions(rows, dimension), [rows, dimension]);
  const value = filters[dimension] ?? null;
  const selected = (value || []).filter(id => !options.some(item => item.id === id)).map(id => ({ id, name: id }));
  return <SemiMultiPick compact label={label} items={selected.length ? [...options, ...selected] : options}
    value={value} onChange={ids => onChange({ [dimension]: ids })}/>;
}

const supplyLabel = '服务商 / 渠道';
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
  return useMemo(() => {
    const providers = new Map(), channelNames = new Map();
    const add = (provider, channel, providerName, channelName) => {
      const id = providerValue(provider);
      if (!providers.has(id)) {
        const label = provider == null ? '全部服务商' : keyLabel(provider, '服务商', providerName);
        providers.set(id, { value: id, label, channels: new Map() });
      }
      const node = providers.get(id);
      if (channel != null && !node.channels.has(channel)) {
        const label = keyLabel(channel, '渠道', channelName);
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
      ...node, selectedLabel: node.label + '（全部渠道）',
      ...(channels.size > 0 && { children: distinguishOptions([...channels.values()])
        .map(child => ({ ...child, selectedLabel: node.label + ' / ' + child.label })) }),
    }));
    const value = (selection || []).map(([provider, channel]) => channel == null
      ? [providerValue(provider)] : [providerValue(provider), channel]);
    const items = selection == null ? null : value.map(([provider, channel]) => {
      const node = treeData.find(item => item.value === provider);
      return channel == null ? node.selectedLabel : node.children.find(item => item.value === channel).selectedLabel;
    });
    return { treeData, value, group: { label: supplyLabel, items } };
  }, [rows, selection]);
}

export function ObservationSupplyPick({ treeData, value, group, onChange }) {
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
    maxTagCount={1} showRestTagsPopover displayProp="selectedLabel" insetLabel={supplyLabel} aria-label={supplyLabel + '筛选'}
    placeholder={placeholder} searchPlaceholder={open ? '搜索服务商或渠道' : placeholder} emptyContent="无匹配结果"
    onDropdownVisibleChange={setOpen}
    className="admin-observation-supply" dropdownClassName="admin-observation-supply-menu"
    treeData={treeData} value={value} onChange={change}/>;
}

export function ObservationPlot({ title, actions, compact = true, ...props }) {
  return <Card title={<Typography.Title heading={5} component="h2">{title}</Typography.Title>} headerExtraContent={actions}>
    <TimeSeriesChart compact={compact} label={title} height={260} {...props}/>
  </Card>;
}
