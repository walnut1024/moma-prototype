import { useChannelText } from './channel-language';
import { modelIdentity } from '../model-identities.mjs';
import TableFieldHelp from '../components/TableFieldHelp';
import { workspaceStoragePrefix } from "../workspace-storage.mjs";
import Table from './AdminTable';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Banner, Button, Card, Input, Space, Toast, Typography } from './xa24/HaloUI.jsx';
import { IconArrowUp, IconChevronLeft, IconChevronRight, IconDownload, IconHandle, IconRefresh, IconSave, IconSearch } from './xa24/HaloIcons.jsx';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/FilterControls';
import SavedFilterViews from '../components/SavedFilterViews';
import { Choice } from './ServiceUI';
import UsageTrend from './UsageTrend';
import UsageReport from './UsageReport';
import UsageStatisticsFilters from './UsageStatisticsFilters';
import UsageStatisticsOverview from './UsageStatisticsOverview';
import { UsageShare, UsageDistribution } from './UsageComposition';
import { defaultTrend, validTrendView, trendDimensions, tokenMetrics, usageDimensions, supplySummary } from './usage-trends';
import { formatUsageNumber, usageCategory, usageFacts, usageGroups, usageModelTypes, usagePreset, usagePresets, operationsPeriod, operationsPeriodFromQuery, usageFilterOptions } from './usage-analysis';
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
const otherUsage = row => Object.entries(row.units).filter(([, value]) => value > 0).map(([unit, value]) => `${amount(value)} ${unit}`).join(' · ') || '—';
const cardOrderKey = workspaceStoragePrefix + 'usage-analysis:card-order';
const artwork = import.meta.env.BASE_URL + 'assets/xa-call-statistics.png';
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
const emptyFacets = () => ({ types: [], providers: [], models: [], million: false });
const restoreFacets = value => value && Array.isArray(value.types) && Array.isArray(value.providers) && Array.isArray(value.models)
  ? { types: value.types, providers: value.providers, models: value.models.slice(0, 5), million: value.million === true }
  : emptyFacets();

export default function UsageAnalysisPage({ state }) {
  const translateLabel = useChannelText();
  const route = new URLSearchParams(location.hash.split('?')[1] || '');
  const [scope, setScope] = useState(() => ({ tenant: route.get('tenant') || '', project: route.get('project') || '' }));
  const routeUser = route.get('user'), routeModel = route.get('model');
  const baseFilters = useMemo(() => ({ ...emptyFilters(), user: routeUser ? [routeUser] : null, model: routeModel ? [routeModel] : null }), [routeUser, routeModel]);
  const [clock, setClock] = useState(() => Date.now());
  const initial = operationsPeriodFromQuery(route, clock);
  const [period, setPeriod] = useState(initial.period);
  const [historyRange, setRange] = useState(initial.range);
  const [facets, setFacets] = useState(emptyFacets);
  const selection = useMemo(() => ({ period, range: historyRange, scope, ...facets }), [period, historyRange, scope, facets]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rankingOrigin, setRankingOrigin] = useState(null);
  const pendingRankReturn = useRef(null);
  useEffect(() => {
    if (detailsOpen || !pendingRankReturn.current) return;
    const rank = document.getElementById(pendingRankReturn.current);
    pendingRankReturn.current = null;
    if (!rank) return;
    let frame;
    const reveal = () => {
      if (!rank.querySelector('.ua-statistics-card-heading')) return;
      observer.disconnect();
      // HaloE mounts the card contents after React renders the section.
      frame = requestAnimationFrame(() => {
        rank.focus({ preventScroll: true });
        rank.scrollIntoView({ block: 'start' });
      });
    };
    const observer = new MutationObserver(reveal);
    observer.observe(rank, { childList: true, subtree: true });
    reveal();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [detailsOpen]);
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
      setFacets(emptyFacets());
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
  const applyStatistics = next => {
    const now = Date.now(), selected = operationsPeriod(next.period, next.range, now);
    setClock(now);
    setPeriod(selected.period);
    setRange(selected.range);
    setScope(next.scope);
    setFacets(restoreFacets(next));
    setProvider(null);
    setPage(0);
    writeRoute({ ...next.scope, period: selected.period, ...selected.range });
  };
  const resetStatistics = () => {
    const next = { period: 'yesterday', range: usagePreset('yesterday'), scope: { tenant: '', project: '' }, ...emptyFacets() };
    applyStatistics(next);
    return next;
  };
  const projects = useMemo(() => analysisProjects(state, scope.tenant), [state, scope.tenant]);
  const scopedState = useMemo(() => {
    const types = new Map(state.models.map(model => [model.id, model.type]));
    const providers = new Map(state.endpoints.map(endpoint => [endpoint.id, endpoint.providerId]));
    const requests = latestRequests(state.requests).filter(row =>
      (!scope.tenant || row.tenantId === scope.tenant) &&
      (!scope.project || (row.projectId || unassignedProject) === scope.project) &&
      (!facets.types.length || facets.types.includes(usageCategory(types.get(row.modelId) ?? row.modelType))) &&
      (!facets.providers.length || facets.providers.includes(row.providerId || providers.get(row.endpointId) || '__unknown__')) &&
      (!facets.models.length || facets.models.includes(row.modelId)));
    return { ...state, requests };
  }, [state, scope, facets]);
  const result = useMemo(() => usageFacts(scopedState, range, baseFilters, clock), [scopedState, range, baseFilters, clock]);
  const current = result?.current || [], usageWindow = result?.window;
  const totalTokens = useMemo(() => usageShare(current, 'modelId', 'total').total, [current]);
  const groups = useMemo(() => usageGroups(current, detailMode), [current, detailMode]);
  const projectMode = detailMode === 'projectId';
  const collection = { tenantId: state.tenants, modelId: state.models, projectId: projects }[detailMode];
  const detailLabel = { tenantId: '租户名称/ID', modelId: '模型展示名称 / 模型编码', projectId: '项目名称/ID' }[detailMode];
  const projectFor = id => projects.find(project => project.id === (id === '__unknown__' ? unassignedProject : id));
  const name = id => {
    if (projectMode && id === '__unknown__') return '未记录项目';
    if (detailMode === 'modelId') {
      const model = collection.find(item => item.id === id);
      if (model) return [model.name, modelIdentity(state, model).canonical_slug].filter(Boolean).join(' / ') || '未记录';
    }
    return labelFor(collection, id);
  };
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
  const detailPages = Math.max(1, Math.ceil(detailRows.length / size));
  const detailPage = Math.min(page, detailPages - 1);
  const periodName = period === 'custom' ? `${range.start}—${range.end}` : presets.find(([id]) => id === period)?.[1];
  const viewGroups = [
    { label: '租户', text: scope.tenant ? labelFor(state.tenants, scope.tenant) : '全部租户' },
    { label: '项目', text: scope.project ? labelFor(projects, scope.project) : '全部项目' },
    { label: '时间', text: `${period === 'custom' ? '自定义' : periodName}（${range.start} — ${range.end}）` },
  ];
  const filterOptions = usageFilterOptions(scopedState);
  const curveOptions = { modelId: filterOptions.models, category: usageModelTypes, providerId: filterOptions.providers, tenantId: state.tenants };
  const savedGroups = [...viewGroups, ...Object.entries(panelFilters).map(([id, value]) => ({ label: navLabels[id], text: [
    ['model', '模型', filterOptions.models], ['channels', '连接', filterOptions.channels], ['user', '用户', filterOptions.users],
  ].map(([key, label, items]) => key === 'channels' && value.providers.length ? supplySummary(value, filterOptions, true) : value[key] === null ? `全部${label}` : value[key].map(item => labelFor(items, item)).join('、') || `未选择${label}`).concat(trends[id] ? [trendDimensions.find(([key]) => key === trends[id].dimension)[1], ...(id === 'usage-token-trend' ? [tokenMetrics.find(([key]) => key === trends[id].metric)[1]] : []), trends[id].showTotal ? '显示范围合计' : '', trends[id].dimension !== 'total' ? trends[id].curves === null ? '默认曲线' : `已选曲线：${trends[id].curves.map(key => labelFor(curveOptions[trends[id].dimension] || [], key)).join('、') || '无'}` : ''] : shares[id] ? [usageDimensions.find(([key]) => key === shares[id].dimension)[1], ...(id === 'usage-volume-share' ? [tokenMetrics.find(([key]) => key === shares[id].metric)[1]] : [])] : []).filter(Boolean).join(' · ') }))];
  const exportCsv = () => {
    try {
    const header = [detailLabel, ...(projectMode ? ['项目 ID', '租户 ID'] : []), 'Token 调用量', '输入 Token', '输出 Token', '其他用量（分单位）', '模型调用次数', 'Token 占比'];
    const data = detailRows.map(row => [name(row.id), ...(projectMode ? [row.id === '__unknown__' ? '' : row.id, projectFor(row.id)?.tenantId || ''] : []), row.tokenCalls ? row.total : '—', row.tokenCalls ? row.input : '—', row.tokenCalls ? row.output : '—', otherUsage(row), row.calls, row.tokenCalls ? percent(row.total, totalTokens) : '—']);
    const csv = logCsv([[`统计范围：${range.start}—${range.end}`, '北京时间', '租户 ID', scope.tenant, '项目 ID', scope.project], header, ...data]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `用量明细-${range.start}-${range.end}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); Toast.success("已开始下载用量明细");
    } catch { Toast.error("导出失败，请重试"); }
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
    setFacets(restoreFacets(view.facets));
    setProvider(null);
    setPage(0);
  };
  const columns = [
    { title: detailLabel, dataIndex: 'id', render: id => {
      const href = projectMode && projectHref(id);
      return href ? <Text link={{ href }}>{name(id)}</Text> : name(id);
    } },
    ...(projectMode ? [{ title: '租户', dataIndex: 'id', key: 'tenant', render: id => {
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
  const openRank = (dimension, id, cardId) => {
    setDetailMode(dimension);
    setQuery(id);
    setPage(0);
    setRankingOrigin(cardId);
    setDetailsOpen(true);
    requestAnimationFrame(() => {
      const detail = document.getElementById('usage-detail');
      detail?.focus({ preventScroll: true });
      detail?.scrollIntoView({ block: 'start' });
    });
  };
  const closeDetails = () => {
    pendingRankReturn.current = rankingOrigin;
    setRankingOrigin(null);
    setDetailsOpen(false);
  };
  return <div className="admin-page-stack ua-native-usage">
    <div className="ua-statistics-hero xa24-entry-header">
      <div>
        <h1>{translateLabel('用量数据')}</h1>
        <p>{translateLabel('按时间、服务商和模型查看 Token 用量及调用趋势。')}</p>
      </div>
      <img className="xa24-entry-art" src={artwork} width="80" height="80" alt=""/>
    </div>
    <UsageStatisticsFilters selection={selection} state={state} live={live} clock={clock} onRefresh={() => setClock(Date.now())}
      onApply={applyStatistics} onReset={resetStatistics}
      views={<div className="ua-statistics-pills" role="group" aria-label="用量数据视图">
        {[['history', '历史数据'], ['live', '今日实时预测']].map(([value, label]) => (
          <Button key={value} size="small" theme={tab === value ? 'light' : 'borderless'}
            aria-pressed={tab === value} onClick={() => changeTab(value)}>{translateLabel(label)}</Button>
        ))}
      </div>}
      details={<Button size="small" theme="borderless" aria-expanded={detailsOpen} aria-controls="usage-analysis-details"
        onClick={() => detailsOpen ? closeDetails() : setDetailsOpen(true)}>{translateLabel('深入分析')}</Button>}/>
    {!usageWindow && <Banner type="danger" closeIcon={null} description="请选择有效日期范围：不超过 365 天，且不能晚于今日。"/>}
    {result && !detailsOpen && live && <UsageReport state={scopedState} range={range} result={result} filters={baseFilters}
      clock={clock} live provider={provider} onProvider={setProvider}/>}
    {result && !detailsOpen && !live && <UsageStatisticsOverview result={result} state={scopedState} million={facets.million} onChoose={openRank}/>}
    {detailsOpen && <section id="usage-analysis-details" aria-label="深入分析" className="ua-statistics-details">
      <div className="ua-statistics-details-actions">
        {!live && <SavedFilterViews notify={Toast} scope="admin-usage-analysis-composition" showCurrent={false}
          saveDescription="保存时间、各图筛选、趋势展示方式、Token 口径及占比统计维度。"
          value={{ period, range, scope, panelFilters, trends, shares, facets }} onApply={applyView}
          groups={savedGroups} currentGroups={viewGroups} disabled={!usageWindow}/>}
        <Button icon={<IconDownload aria-hidden="true"/>} disabled={!detailRows.length} onClick={exportCsv}>导出用量明细</Button>
      </div>
    {result && <UsageReport state={scopedState} range={range} result={result} filters={baseFilters} clock={clock} live={live} provider={provider} onProvider={setProvider}/>}
    {usageWindow && !live && <section className="ua-report-distribution" id="usage-distribution">
      <UsageDistribution facts={current} single={single}/>
    </section>}
    {usageWindow && (
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
                    onClick={() => goTo('usage-distribution')}>{single ? '租户分层与 Token 分段' : '租户调用量分层'}</Button>}
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
          <section id="usage-detail" tabIndex={-1}>
            <Card title={<Space wrap><Title heading={5} component="h2">用量明细</Title><Text type="secondary">{range.start}—{range.end}</Text></Space>}
              headerExtraContent={<Space wrap>
                {rankingOrigin && <Button icon={<IconChevronLeft aria-hidden="true"/>} onClick={closeDetails}>{translateLabel('返回排行')}</Button>}
                <Button icon={<IconDownload aria-hidden="true"/>} disabled={!detailRows.length} onClick={exportCsv}>导出</Button>
              </Space>}>
              <div className="admin-list-toolbar">
                <div className="admin-time-presets" role="group" aria-label="明细汇总维度">
                  {[[ 'tenantId', '按租户' ], [ 'modelId', '按模型' ], [ 'projectId', '按项目' ]].map(([value, label]) => (
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
    </section>}
  </div>;
}
