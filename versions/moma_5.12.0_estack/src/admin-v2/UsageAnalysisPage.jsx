import TableFieldHelp from '../components/TableFieldHelp';
import { workspaceStoragePrefix } from "../workspace-storage.mjs";
import Table from './AdminTable';
import AdminPageHeading from './AdminPageHeading';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Banner, Button, Card, DatePicker, Input, Space, Tabs, Toast, Typography } from '@douyinfe/semi-ui';
import { IconArrowUp, IconCalendar, IconChevronLeft, IconChevronRight, IconDownload, IconHandle, IconRefresh, IconSave, IconSearch } from '@douyinfe/semi-icons';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, FilterPresets, FilterReset, FilterToolbar } from '../components/FilterControls';
import SavedFilterViews from '../components/SavedFilterViews';
import { SemiDateRange as DateRange } from './SemiAnalyticsFilters';
import { Choice } from './ServiceUI';
import UsageTrend from './UsageTrend';
import UsageReport from './UsageReport';
import { dayOf } from './analytics';
import { UsageShare, UsageDistribution } from './UsageComposition';
import { defaultTrend, validTrendView, trendDimensions, tokenMetrics, usageDimensions, supplySummary } from './usage-trends';
import { formatUsageNumber, usageFacts, usageGroups, usageModelTypes, usagePreset, usagePresets, operationsPeriod, operationsPeriodFromQuery, usageFilterOptions } from './usage-analysis';
import { logCsv } from './call-observations.mjs';
import { analysisProjects, unassignedProject } from './analysis-projects.mjs';
import { latestRequests } from '../request-identity.mjs';
import { usageShare } from './usage-distributions';
import { defaultCardOrder, moveCard, normalizeCardOrder } from './usage-card-order';
import './semi-usage-analysis.css';

const { Text, Title } = Typography;
const percent = (value, total) => total > 0 ? `${(value / total * 100).toFixed(2)}%` : '—';
const amount = value => formatUsageNumber(value).replace('w', '万');
const labelFor = (collection, id) => collection.find(item => item.id === id)?.name || (id === '__unknown__' ? '未归属' : id);
const presets = usagePresets;
const calendarDay = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' });
const otherUsage = row => Object.entries(row.units).filter(([, value]) => value > 0).map(([unit, value]) => `${amount(value)} ${unit}`).join(' · ') || '—';
const cardOrderKey = workspaceStoragePrefix + 'usage-analysis:card-order';
const navLabels = Object.fromEntries([
  ['usage-token-trend', 'Token 调用量趋势'], ['usage-call-trend', '模型调用次数趋势'],
  ['usage-model-share', '模型调用次数占比'], ['usage-volume-share', '模型调用量占比'],
  ['usage-detail', '用量明细'],
]);
const trendIds = ['usage-token-trend', 'usage-call-trend'];
const shareIds = ['usage-model-share', 'usage-volume-share'];
const filterPanelIds = [...trendIds, ...shareIds];
const navGroups = Object.fromEntries(Object.entries(defaultCardOrder).flatMap(([group, ids]) => ids.map(id => [id, group])));
function readCardOrder() {
  try { return normalizeCardOrder(JSON.parse(localStorage.getItem(cardOrderKey))); }
  catch { return normalizeCardOrder(null); }
}
function SortableNavItem({ id, label, active, onSelect, onMove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id });
  return <div className="ua-native-sortable" data-dragging={isDragging || undefined} data-drop-target={isOver || undefined}
    ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
    <Button block size="small" theme={active ? 'light' : 'borderless'} type={active ? 'primary' : 'tertiary'} icon={<IconHandle aria-hidden="true"/>}
      aria-current={active ? 'location' : undefined} {...attributes} {...listeners} title={label}
      aria-label={`${label}，拖动或按上下方向键调整顺序`}
      onClick={() => { if (!isDragging) onSelect(id); }}
      onKeyDown={event => {
        const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
        if (step && !isDragging) { event.preventDefault(); onMove(id, step); }
        else listeners.onKeyDown?.(event);
      }}>
      {label}
    </Button>
  </div>;
}

const emptyFilters = () => ({ types: null, tenant: null, model: null, providers: [], channels: null, user: null });

export default function UsageAnalysisPage({ state }) {
  const route = new URLSearchParams(location.hash.split('?')[1] || '');
  const [scope, setScope] = useState(() => ({ tenant: route.get('tenant') || '', project: route.get('project') || '' }));
  const routeUser = route.get('user'), routeModel = route.get('model');
  const baseFilters = useMemo(() => ({ ...emptyFilters(), user: routeUser ? [routeUser] : null, model: routeModel ? [routeModel] : null }), [routeUser, routeModel]);
  const [clock, setClock] = useState(() => Date.now());
  const initial = operationsPeriodFromQuery(route, clock);
  const [period, setPeriod] = useState(initial.period);
  const [historyRange, setRange] = useState(initial.range);
  const [tab, setTab] = useState('history'), [provider, setProvider] = useState(null);
  const live = tab === 'live';
  const range = useMemo(() => live ? usagePreset('today', clock) : historyRange, [live, clock, historyRange]);
  const single = range.start === range.end;
  const [panelFilters, setPanelFilters] = useState(() => Object.fromEntries(filterPanelIds.map(id => [id, { ...emptyFilters(), user: route.has('user') ? [route.get('user')] : null, model: route.has('model') ? [route.get('model')] : null }])));
  const [trends, setTrends] = useState(() => Object.fromEntries(trendIds.map(id => [id, defaultTrend()])));
  const [shares, setShares] = useState(() => Object.fromEntries(shareIds.map(id => [id, { dimension: 'modelId', metric: 'total' }])));
  const [detailMode, setDetailMode] = useState(route.has('project') ? 'projectId' : 'tenantId'), [query, setQuery] = useState(''), [page, setPage] = useState(0), [size, setSize] = useState(DEFAULT_PAGE_SIZE), [sort, setSort] = useState('total');
  const [navOpen, setNavOpen] = useState(true), [activeSection, setActiveSection] = useState('usage-token-trend');
  const [savedOrder, setSavedOrder] = useState(readCardOrder), [cardOrder, setCardOrder] = useState(savedOrder), [saveError, setSaveError] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const navLock = useRef(0);
  useEffect(() => {
    const restore = () => {
      const [page, query] = location.hash.split('?');
      if (page !== '#/admin-2/usage-analysis') return;
      const params = new URLSearchParams(query);
      const now = Date.now(), selected = operationsPeriodFromQuery(params, now);
      setTab('history');
      setProvider(null);
      setScope({ tenant: params.get('tenant') || '', project: params.get('project') || '' });
      setClock(now);
      setPeriod(selected.period);
      setRange(selected.range);
      setPage(0);
    };
    addEventListener('hashchange', restore);
    return () => removeEventListener('hashchange', restore);
  }, []);
  const navItems = [...(live ? [] : ['usage-distribution']), ...cardOrder.overview, 'usage-detail'];
  const customOrder = Object.keys(defaultCardOrder).some(group => cardOrder[group].some((id, index) => id !== defaultCardOrder[group][index]));
  const unsavedOrder = Object.keys(defaultCardOrder).some(group => cardOrder[group].some((id, index) => id !== savedOrder[group][index]));
  useEffect(() => {
    const sections = navItems.map(id => document.getElementById(id)).filter(Boolean);
    const update = () => { if (performance.now() >= navLock.current) setActiveSection((sections.filter(section => section.getBoundingClientRect().top <= 160).at(-1) || sections[0])?.id || 'usage-token-trend'); };
    update();
    document.defaultView.addEventListener('scroll', update, { passive: true });
    return () => document.defaultView.removeEventListener('scroll', update);
  });
  const goTo = id => { navLock.current = performance.now() + 700; setActiveSection(id); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const moveNav = (id, step) => {
    const group = navGroups[id], visible = cardOrder[group];
    const index = visible.indexOf(id), target = visible[Math.max(0, Math.min(visible.length - 1, index + step))];
    if (target) setCardOrder(order => moveCard(order, group, id, target));
  };
  const saveOrder = () => {
    try { localStorage.setItem(cardOrderKey, JSON.stringify(cardOrder)); setSavedOrder(cardOrder); setSaveError(false); Toast.success("图表布局已保存"); }
    catch { setSaveError(true); Toast.error("布局保存失败，请检查浏览器存储"); }
  };
  const setPanelFilter = (id, value) => setPanelFilters(previous => ({ ...previous, [id]: value }));
  const changeTab = value => { setTab(value); setClock(Date.now()); setProvider(null); setPage(0); };
  const choosePeriod = value => {
    const now = Date.now(), nextRange = usagePreset(value, now);
    setClock(now);
    setPeriod(value);
    setRange(nextRange);
    setProvider(null);
    setPage(0);
    writeRoute({ period: value, ...nextRange });
  };
  const projects = useMemo(() => analysisProjects(state, scope.tenant), [state, scope.tenant]);
  const scopedState = useMemo(() => ({ ...state, requests: latestRequests(state.requests).filter(row =>
    (!scope.tenant || row.tenantId === scope.tenant) && (!scope.project || (row.projectId || unassignedProject) === scope.project)) }), [state, scope]);
  const result = useMemo(() => usageFacts(scopedState, range, baseFilters, clock), [scopedState, range, baseFilters, clock]);
  const current = result?.current || [], usageWindow = result?.window;
  const totalTokens = useMemo(() => usageShare(current, 'modelId', 'total').total, [current]);
  const groups = useMemo(() => usageGroups(current, detailMode), [current, detailMode]);
  const projectMode = detailMode === 'projectId';
  const collection = { tenantId: state.tenants, modelId: state.models, projectId: projects }[detailMode];
  const detailLabel = { tenantId: '客户名称/ID', modelId: '模型展示名/ID', projectId: '项目名称/ID' }[detailMode];
  const projectFor = id => projects.find(project => project.id === (id === '__unknown__' ? unassignedProject : id));
  const name = id => projectMode && id === '__unknown__' ? '未记录项目' : labelFor(collection, id);
  const detailRows = groups.filter(row => (name(row.id) + ' ' + row.id).toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b[sort] - a[sort] || a.id.localeCompare(b.id));
  const projectHref = id => {
    const customer = projectFor(id)?.tenantId;
    return customer ? '#/admin-2/customer-usage-detail?' + new URLSearchParams({ customer, project: id, period: live ? 'today' : period, start: range.start, end: range.end }) : null;
  };
  const writeRoute = patch => {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    history.replaceState(history.state, '', '#/admin-2/usage-analysis' + (params.size ? '?' + params : ''));
  };
  const changeScope = next => {
    writeRoute(next);
    setScope(next);
    setProvider(null);
    setPage(0);
  };
  const detailPages = Math.max(1, Math.ceil(detailRows.length / size));
  const detailPage = Math.min(page, detailPages - 1);
  const periodName = period === 'custom' ? `${range.start}—${range.end}` : presets.find(([id]) => id === period)?.[1];
  const viewGroups = [
    { label: '客户', text: scope.tenant ? labelFor(state.tenants, scope.tenant) : '全部客户' },
    { label: '项目', text: scope.project ? labelFor(projects, scope.project) : '全部项目' },
    { label: '时间', text: `${period === 'custom' ? '自定义' : periodName}（${range.start} — ${range.end}）` },
  ];
  const filterOptions = usageFilterOptions(scopedState);
  const curveOptions = { modelId: filterOptions.models, category: usageModelTypes, providerId: filterOptions.providers, tenantId: state.tenants };
  const savedGroups = [...viewGroups, ...Object.entries(panelFilters).map(([id, value]) => ({ label: navLabels[id], text: [
    ['model', '模型', filterOptions.models], ['channels', '渠道', filterOptions.channels], ['user', '用户', filterOptions.users],
  ].map(([key, label, items]) => key === 'channels' && value.providers.length ? supplySummary(value, filterOptions, true) : value[key] === null ? `全部${label}` : value[key].map(item => labelFor(items, item)).join('、') || `未选择${label}`).concat(trends[id] ? [trendDimensions.find(([key]) => key === trends[id].dimension)[1], ...(id === 'usage-token-trend' ? [tokenMetrics.find(([key]) => key === trends[id].metric)[1]] : []), trends[id].showTotal ? '显示范围合计' : '', trends[id].dimension !== 'total' ? trends[id].curves === null ? '默认曲线' : `已选曲线：${trends[id].curves.map(key => labelFor(curveOptions[trends[id].dimension] || [], key)).join('、') || '无'}` : ''] : shares[id] ? [usageDimensions.find(([key]) => key === shares[id].dimension)[1], ...(id === 'usage-volume-share' ? [tokenMetrics.find(([key]) => key === shares[id].metric)[1]] : [])] : []).filter(Boolean).join(' · ') }))];
  const exportCsv = () => {
    try {
    const header = [detailLabel, ...(projectMode ? ['项目 ID', '客户 ID'] : []), 'Token 调用量', '输入 Token', '输出 Token', '其他用量（分单位）', '模型调用次数', 'Token 占比'];
    const data = detailRows.map(row => [name(row.id), ...(projectMode ? [row.id === '__unknown__' ? '' : row.id, projectFor(row.id)?.tenantId || ''] : []), row.tokenCalls ? row.total : '—', row.tokenCalls ? row.input : '—', row.tokenCalls ? row.output : '—', otherUsage(row), row.calls, row.tokenCalls ? percent(row.total, totalTokens) : '—']);
    const csv = logCsv([[`统计范围：${range.start}—${range.end}`, '北京时间', '客户 ID', scope.tenant, '项目 ID', scope.project], header, ...data]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `用量明细-${range.start}-${range.end}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); Toast.success("已开始下载用量明细");
    } catch { Toast.error("导出失败，请重试"); }
  };
  const applyDate = value => {
    const current = Date.now();
    const selected = operationsPeriod('custom', value, current);
    setClock(current);
    setPeriod(selected.period);
    setRange(selected.range);
    setProvider(null);
    setPage(0);
    writeRoute({ period: selected.period, ...selected.range });
  };
  const applyView = view => {
    if (!validTrendView(view, filterPanelIds, trendIds, shareIds)) {
      Toast.error('视图配置无效，请重新保存');
      return false;
    }
    const current = Date.now();
    const restored = operationsPeriod(view.period, view.range, current);
    setClock(current);
    setPeriod(restored.period);
    setRange(restored.range);
    const nextScope = view.scope && ['tenant', 'project'].every(key => typeof view.scope[key] === 'string')
      ? view.scope : { tenant: '', project: '' };
    setScope(nextScope);
    writeRoute({ ...nextScope, period: restored.period, ...restored.range });
    setPanelFilters(Object.fromEntries(filterPanelIds.map(id => [id, view.panelFilters[id]])));
    setTrends(view.trends);
    setShares(view.shares);
    setProvider(null);
    setPage(0);
  };
  const columns = [
    { title: detailLabel, dataIndex: 'id', render: id => {
      const href = projectMode && projectHref(id);
      return href ? <Text link={{ href }}>{name(id)}</Text> : name(id);
    } },
    ...(projectMode ? [{ title: '客户', dataIndex: 'id', key: 'tenant', render: id => {
      const tenant = projectFor(id)?.tenantId;
      return tenant ? labelFor(state.tenants, tenant) : '—';
    } }] : []),
    ...[['Token 调用量', 'total'], ['输入 Token', 'input'], ['输出 Token', 'output']].map(([title, dataIndex]) => ({
      title, dataIndex, align: 'right', render: (value, row) => amount(row.tokenCalls ? value : null),
    })),
    { title: <TableFieldHelp name="其他用量" description="非 Token 用量按各自单位分别显示，例如张、秒或字符。"/>, key: 'other', align: 'right', render: (_, row) => otherUsage(row) },
    { title: '模型调用次数', dataIndex: 'calls', align: 'right', render: amount },
    { title: <TableFieldHelp name="Token 占比" description="该行 Token 调用量占当前筛选范围内 Token 总量的比例。"/>, key: 'share', align: 'right', render: (_, row) => row.tokenCalls ? percent(row.total, totalTokens) : '—' },
  ];
  const renderCard = id => {
    const filters = panelFilters[id], onChange = value => setPanelFilter(id, value);
    if (shareIds.includes(id)) return <UsageShare state={scopedState} range={range} clock={clock} filters={filters} onChange={onChange}
      volume={id === 'usage-volume-share'} settings={shares[id]} onSettings={value => setShares(previous => ({ ...previous, [id]: value }))}/>;
    return <UsageTrend state={scopedState} range={range} clock={clock} filters={filters} onChange={onChange} calls={id === 'usage-call-trend'}
      settings={trends[id]} onSettings={value => setTrends(previous => ({ ...previous, [id]: value }))} onCopy={() => {
        const target = trendIds.find(item => item !== id);
        setPanelFilter(target, structuredClone(panelFilters[id]));
        setTrends(previous => ({ ...previous, [target]: { ...previous[target], curves: null } }));
      }}/>;
  };
  return <div className="admin-page-stack ua-native-usage">
    <AdminPageHeading title="用量数据"><Button icon={<IconDownload aria-hidden="true"/>} disabled={!detailRows.length} onClick={exportCsv}>导出用量明细</Button></AdminPageHeading>
    <Tabs type="line" activeKey={tab} onChange={changeTab} aria-label="用量数据视图" tabList={[{ itemKey: 'history', tab: '历史数据' }, { itemKey: 'live', tab: '今日实时预测' }]}/>
    <Card className="ua-native-time">
      <div className="admin-analysis-filter-row">
        {live ? <Space wrap>
          <Text>数据截至 {new Date(clock).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）</Text>
          <Button size="small" icon={<IconRefresh aria-hidden="true"/>} onClick={() => setClock(Date.now())}>刷新</Button>
        </Space> : <><FilterToolbar>
          <div className="admin-time-presets" role="group" aria-label="统计方式">
            <Button size="small" theme={single ? 'solid' : 'light'} aria-pressed={single} onClick={() => !single && applyDate({ start: range.end, end: range.end })}>按日</Button>
            <Button size="small" theme={single ? 'light' : 'solid'} aria-pressed={!single} onClick={() => single && choosePeriod('7d')}>按时间范围</Button>
          </div>
          {single ? <DatePicker aria-label="统计日期" type="date" format="yyyy-MM-dd" value={range.end} showClear={false}
            onChangeWithDateFirst={false} disabledDate={date => calendarDay.format(date) > dayOf(Date.now())}
            onChange={date => { if (typeof date === 'string' && date) applyDate({ start: date, end: date }); }}/> :
            <DateRange presets={presets} start={range.start} end={range.end} granularity={usageWindow?.weekly ? 'week' : 'day'}
              trigger={<Button icon={<IconCalendar aria-hidden="true"/>} aria-label="日期范围">{range.start} — {range.end}</Button>} allowLongRange onChange={applyDate}/>}
          <FilterPresets label="统计时间范围" value={period} onChange={choosePeriod} items={presets}/>
          <Text type="secondary" title="时间范围作用于全部图表与明细">北京时间</Text>
          <Choice label="客户" value={scope.tenant} options={[[ '', '全部客户' ], ...state.tenants.map(row => [row.id, row.name])]}
            onSelect={tenant => changeScope({ tenant, project: '' })}/>
          <Choice label="项目" value={scope.project} options={[[ '', '全部项目' ], ...projects.map(row => [row.id, row.id === unassignedProject ? row.name : row.name + ' · ' + row.id]),
            ...(scope.project && !projects.some(row => row.id === scope.project) ? [[scope.project, scope.project]] : [])]}
            onSelect={project => changeScope({ ...scope, project })}/>
          <FilterReset onClick={() => { choosePeriod('yesterday'); changeScope({ tenant: '', project: '' }); }}/>
        </FilterToolbar>
        <SavedFilterViews notify={Toast} scope="admin-usage-analysis-composition" showCurrent={false}
          saveDescription="保存时间、各图筛选、趋势展示方式、Token 口径及占比统计维度。"
          value={{ period, range, scope, panelFilters, trends, shares }} onApply={applyView} groups={savedGroups} currentGroups={viewGroups} disabled={!usageWindow}/></>}
      </div>
    </Card>
    {result && <UsageReport state={scopedState} range={range} result={result} filters={baseFilters} clock={clock} live={live} provider={provider} onProvider={setProvider}/>}
    {usageWindow && !live && <section className="ua-report-distribution" id="usage-distribution">
      <UsageDistribution facts={current} single={single}/>
    </section>}
    {!usageWindow ? <Banner type="danger" closeIcon={null} description="请选择有效日期范围：不超过 365 天，且不能晚于今日。"/> : (
      <div className="ua-native-layout" data-nav-open={navOpen}>
        <aside className="ua-native-nav" aria-label="图表导航">
          <Card bodyStyle={navOpen ? undefined : { padding: 12 }}>
            <div className="ua-native-nav-head">
              {navOpen && <Text strong>图表导航</Text>}
              <Button theme="borderless" type="tertiary" size="small" aria-label={navOpen ? '收起图表导航' : '展开图表导航'} aria-expanded={navOpen}
                icon={navOpen ? <IconChevronRight aria-hidden="true"/> : <IconChevronLeft aria-hidden="true"/>} onClick={() => setNavOpen(value => !value)}/>
            </div>
            {navOpen && <div className="ua-native-nav-body">
              <Space>
                <Button size="small" theme="borderless" icon={<IconSave aria-hidden="true"/>}
                  aria-label={saveError ? '保存失败，请检查浏览器存储' : '保存当前布局'} disabled={!unsavedOrder} onClick={saveOrder}/>
                <Button size="small" theme="borderless" type="tertiary" icon={<IconRefresh aria-hidden="true"/>} aria-label="恢复默认布局"
                  title="恢复默认布局（保存后生效）" disabled={!customOrder} onClick={() => setCardOrder(normalizeCardOrder(null))}/>
              </Space>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
                if (over && navGroups[active.id] === navGroups[over.id]) setCardOrder(order => moveCard(order, navGroups[active.id], active.id, over.id));
              }}>
                <nav aria-label="跳转及排序图表">
                  {!live && <Button block size="small" theme={activeSection === 'usage-distribution' ? 'light' : 'borderless'}
                    aria-current={activeSection === 'usage-distribution' ? 'location' : undefined}
                    onClick={() => goTo('usage-distribution')}>{single ? '客户分层与 Token 分段' : '客户调用量分层'}</Button>}
                  {Object.entries(defaultCardOrder).map(([group]) => (
                    <SortableContext key={group} items={cardOrder[group]} strategy={verticalListSortingStrategy}>
                      {cardOrder[group].map(id => <SortableNavItem key={id} id={id} label={navLabels[id]} active={activeSection === id}
                        onSelect={goTo} onMove={moveNav}/>)}
                    </SortableContext>
                  ))}
                  <Button block size="small" theme={activeSection === 'usage-detail' ? 'light' : 'borderless'}
                    aria-current={activeSection === 'usage-detail' ? 'location' : undefined} onClick={() => goTo('usage-detail')}>用量明细</Button>
                </nav>
              </DndContext>
              <Button theme="borderless" type="tertiary" size="small" icon={<IconArrowUp aria-hidden="true"/>}
                onClick={() => document.defaultView.scrollTo({ top: 0, behavior: 'smooth' })}>回到顶部</Button>
            </div>}
          </Card>
        </aside>
        <div className="ua-native-sections">
          {cardOrder.overview.map(id => <section key={id} id={id}>{renderCard(id)}</section>)}
          <section id="usage-detail">
            <Card title={<Space wrap><Title heading={5} component="h2">用量明细</Title><Text type="secondary">{range.start}—{range.end}</Text></Space>}
              headerExtraContent={<Button icon={<IconDownload aria-hidden="true"/>} disabled={!detailRows.length} onClick={exportCsv}>导出</Button>}>
              <div className="admin-list-toolbar">
                <div className="admin-time-presets" role="group" aria-label="明细汇总维度">
                  {[[ 'tenantId', '按客户' ], [ 'modelId', '按模型' ], [ 'projectId', '按项目' ]].map(([value, label]) => (
                    <Button key={value} size="small" theme={detailMode === value ? 'solid' : 'light'} aria-pressed={detailMode === value}
                      onClick={() => { if (value !== detailMode) { setDetailMode(value); setPage(0); setQuery(''); } }}>{label}</Button>
                  ))}
                </div>
                <Choice label="明细排序" value={sort} options={[[ 'total', '按 Token 排序' ], [ 'calls', '按调用次数排序' ]]}
                  onSelect={value => { setSort(value); setPage(0); }}/>
                <Input className="admin-list-search" prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索明细"
                  placeholder="搜索名称" value={query} onChange={value => { setQuery(value); setPage(0); }}/>
              </div>
              <Table rowKey="id" size="small" dataSource={detailRows.slice(detailPage * size, (detailPage + 1) * size)}
                columns={columns} empty="所选范围暂无明细记录"
                scroll={{ x: 'max(100%, 860px)' }}
                pagination={{ currentPage: detailPage + 1, total: detailRows.length, pageSize: size, showTotal: true, showSizeChanger: true, pageSizeOpts: PAGE_SIZES,
                  onPageChange: value => setPage(value - 1), onPageSizeChange: value => { setSize(value); setPage(0); } }}/>
            </Card>
          </section>
        </div>
      </div>
    )}
  </div>;
}
