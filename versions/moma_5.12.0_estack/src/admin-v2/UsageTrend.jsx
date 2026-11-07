import { useState } from 'react';
import { Button, Card, Checkbox, Input, Popover, Space, Toast, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import { IconMaximize, IconMore } from '@douyinfe/semi-icons';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import { chartColor } from '../components/chart-style.mjs';
import { AnalysisHelp } from './AnalysisMetric';
import { Choice } from './ServiceUI';
import UsageFilterBar from './UsageFilterBar';
import { usageFacts, usageFilterOptions } from './usage-analysis';
import { tokenMetrics, trendDimensions, trendSeries, visibleTrendIds, supplySummary } from './usage-trends';

const { Text, Title, Paragraph } = Typography;

export default function UsageTrend({ state, range, clock, filters, onChange, calls, settings, onSettings, onCopy }) {
  const title = calls ? '模型调用次数趋势' : 'Token 调用量趋势';
  const [expanded, setExpanded] = useState(false), [query, setQuery] = useState(''), [menuOpen, setMenuOpen] = useState(false);
  const facts = usageFacts(state, range, filters, clock);
  const options = usageFilterOptions(state);
  const trend = trendSeries(state, facts, filters, settings, calls);
  const grouped = settings.dimension !== 'total';
  const selected = visibleTrendIds(trend.groups, settings.curves);
  const series = (grouped ? [...(settings.showTotal ? [trend.total] : []), ...trend.groups] : [trend.total]).map(item => ({ ...item, color: item.color || chartColor({ label: item.id }) }));
  const names = series.filter(item => item.total || selected.includes(item.id)).map(item => item.label);
  const matching = trend.groups.filter(item => `${item.label} ${item.code} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  const change = value => { onChange(value); onSettings({ ...settings, curves: null }); };
  const selectSetting = (key, value) => onSettings({ ...settings, [key]: value, ...(key === 'dimension' ? { curves: null } : {}) });
  const empty = filters.model?.length === 0 ? '未选择模型，请调整筛选' : filters.channels?.length === 0 && !filters.providers.length ? '未选择服务商或渠道，请调整筛选' : filters.user?.length === 0 ? '未选择用户，请调整筛选' : !trend.applicable ? '所选模型不按 Token 计量' : !facts.current.length ? '所选条件下暂无调用记录' : grouped && !names.length ? '暂无可显示曲线，请选择曲线或恢复默认' : null;
  const unknown = settings.dimension === 'tenantId' && facts.current.some(row => !row.tenantId);
  const metricControl = !calls && <Choice label={`${title}Token口径`} size="small" value={settings.metric}
    options={tokenMetrics} onSelect={value => selectSetting('metric', value)} zIndex={1200}/>;
  const dimensionControl = <Choice label={`${title}展示方式`} size="small" value={settings.dimension}
    options={trendDimensions} onSelect={value => selectSetting('dimension', value)} zIndex={1200}/>;
  const curveHelp = <AnalysisHelp label={`${title}曲线`}>
    {grouped && `默认显示本时段累计${calls ? '调用次数' : 'Token 用量'}前 5 项。隐藏曲线不改变范围合计。`}
    调用次数按最终请求去重；服务商按实际渠道归属。Token 仅包含 Token 计量记录。
  </AnalysisHelp>;
  const picker = <Popover trigger="click" position="bottomRight" visible={menuOpen} motion={false} zIndex={1200}
    onVisibleChange={open => { setMenuOpen(open); if (open) setQuery(''); }}
    content={({ initialFocusRef }) => <div ref={initialFocusRef} tabIndex={-1} className="admin-analytics-picker admin-analytics-fields" aria-label={`${title}曲线设置`}>
      {grouped && <>
        <Input aria-label={`${title}搜索曲线`} placeholder="搜索名称或 ID" value={query} onChange={setQuery}/>
        <Space wrap>
          <Button theme="borderless" size="small" aria-label="显示全部曲线" onClick={() => selectSetting('curves', trend.groups.map(item => item.id))}>全选</Button>
          <Button theme="borderless" size="small" aria-label="恢复默认曲线" onClick={() => selectSetting('curves', null)}>重置</Button>
          {curveHelp}
        </Space>
        <div className="admin-analytics-options" role="group" aria-label="显示曲线">
          {matching.map(item => <Checkbox key={item.id} aria-label={`显示 ${item.label}`} checked={selected.includes(item.id)}
            onChange={event => selectSetting('curves', event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}>
            <Text title={item.label}>{item.label}</Text>
          </Checkbox>)}
          {!matching.length && <Text type="secondary" role="status">暂无匹配曲线</Text>}
        </div>
      </>}
      <div className="admin-analytics-picker-footer">
        {grouped && <>
          <Text type="secondary">已选 {selected.length}/{trend.groups.length}</Text>
          <Checkbox aria-label="同时显示范围合计" checked={settings.showTotal}
            onChange={event => selectSetting('showTotal', event.target.checked)}>叠加合计</Checkbox>
        </>}
        <Button theme="borderless" size="small" aria-label="将筛选条件应用到另一张趋势图"
          onClick={() => { onCopy(); setMenuOpen(false); Toast.success('已将筛选条件应用到另一张趋势图'); }}>同步筛选</Button>
        {!grouped && curveHelp}
      </div>
    </div>}>
    <Button size="small" theme={grouped ? 'light' : 'borderless'} aria-expanded={menuOpen}
      aria-label={grouped ? `${title}选择曲线` : `${title}更多设置`}
      icon={grouped ? undefined : <IconMore aria-hidden="true"/>}>
      {grouped ? `曲线 ${selected.length}/${trend.groups.length}` : undefined}
    </Button>
  </Popover>;
  const filterBar = <UsageFilterBar state={state} filters={filters} onChange={change} title={title} controls={metricControl}>{picker}</UsageFilterBar>;
  const plot = height => <>
    {empty ? <Paragraph type="secondary" className="ua-native-chart-empty" style={{ minHeight: height }} role="status">{empty}</Paragraph> :
      <TimeSeriesChart compact height={height} showData={false} label={title} labels={trend.buckets.map(bucket => bucket.label)}
        series={series} selectedNames={names} onSelectNames={next => onSettings({ ...settings,
          curves: trend.groups.filter(item => next.includes(item.label)).map(item => item.id), showTotal: next.includes(trend.total.label),
        })} unit={calls ? '次' : 'Token'}/>}
    {!empty && (grouped || trend.pending > 0) && <Paragraph type="tertiary" size="small" role="status">
      {grouped && `共 ${trend.groups.length} 项，${settings.curves === null && trend.groups.length > 5
        ? `按本时段累计${calls ? '调用次数' : 'Token 用量'}显示前 5 项` : `显示 ${selected.length} 项`}。`}
      {trend.pending > 0 && ` ${trend.pending} 条记录计量待确认，涉及时间点显示断点。`}
      {unknown && ' 缺少客户 ID 的请求计入未归属客户。'}
    </Paragraph>}
  </>;
  const close = () => { setMenuOpen(false); setExpanded(false); };
  return <>
    <Card title={<Title heading={5} component="h2">{title}</Title>} headerExtraContent={<Space wrap>
      {dimensionControl}
      <Button size="small" theme="borderless" type="tertiary" icon={<IconMaximize aria-hidden="true"/>}
        aria-label={`放大${title}`} onClick={() => { setMenuOpen(false); setExpanded(true); }}/>
    </Space>}>
      {expanded ? <div className="ua-native-trend-placeholder" aria-hidden="true"/> : <>{filterBar}{plot(280)}</>}
    </Card>
    {expanded && <Modal visible title={title} closeOnEsc footer={null} maskClosable={false}
      width="min(1120px, calc(100vw - 32px))" onCancel={close}>
      <div className="admin-analytics-fields" onKeyDownCapture={event => {
        if (event.key !== 'Escape') return;
        // A closed Semi popover still intercepts Escape on its trigger.
        const trigger = event.target.closest('[aria-haspopup="dialog"][aria-controls]');
        if (trigger && !document.getElementById(trigger.getAttribute('aria-controls'))) {
          event.stopPropagation();
          close();
        }
      }}>
        <Paragraph type="secondary">{range.start} — {range.end} · 北京时间 · {supplySummary(filters, options, true)}</Paragraph>
        <div className="ua-native-trend-dimension">{dimensionControl}</div>
        {filterBar}
        {plot(460)}
      </div>
    </Modal>}
  </>;
}
