import { useChannelText } from './channel-language';
import MarketCardDialogs from './MarketCardDialogs';
import { marketCardIndex, marketCardServices, marketCardStatus, marketCardStatuses } from '../market-cards.mjs';
import AdminStatus from './AdminStatus';
import Table, { AdminPagination } from './AdminTable';
import AdminActionMenu from './AdminActionMenu';
import AdminCollapsePanel from './AdminCollapsePanel';
import { useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, Input, InputNumber, RadioGroup, Space, Typography } from './xa24/HaloUI.jsx';
import { Collapse } from './xa24/HaloUI.jsx';
import { ChevronDown } from 'lucide-react';
import { IconBox, IconChevronRight, IconHandle, IconImageStroked, IconMicrophoneStroked, IconPlus, IconTextStroked, IconVideoStroked } from './xa24/HaloIcons.jsx';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useOperations } from './ModelOperationsUI';
import { Choice, CopyId, Field, Modal, Notice, serviceOperationsUi } from './ServiceUI';
import { modelCatalogue, MODEL_CATALOGUE_TYPES } from './model-library';
import { modelCategory } from './model-management';
import { modelProfileDraft } from './model-profile';
import { materialContextLabel } from './model-material-fields';
import { marketDemoState } from './model-market-demo';
import { commitAdminState } from './state-transaction';
import { offerKey, offerStage, providerOffer } from '../service-access.mjs';
import ModelModuleHeading from './ModelModuleHeading';
import { marketSupplyGroups } from './model-market-supplies';
import { registeredServiceUpstreams } from './service-model-mappings';
import { orderedMarketModels } from './model-market-order';
import './model-pricing-workspace.css';
import './model-market.css';

const filters = [
  { key: 'visibility', label: '可见性', all: '全部可见性', englishAll: 'All visibility states', options: Object.entries(marketCardStatuses) },
  { key: 'type', label: '模型类型', all: '全部模型类型', englishAll: 'All model types', options: Object.entries(MODEL_CATALOGUE_TYPES) },
];
const visibilityColors = { preview: 'blue', gray: 'orange', formal: 'green' };
const marketFilterKeys = ['q', 'type', 'visibility', 'page'];
const pageSize = 20;
const cardSupplierLimit = 3;
const emptyMessage = '没有符合条件的模型卡片';
const saleStages = { formal: '在售', gray: '灰度在售', paused: '已停售', withdrawn: '已停售', unlisted: '未开售' };
const cardCollision = args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
function scopeLabel(card, t) {
  if (marketCardStatus(card) === 'withdrawn') return '—';
  if (card.status === 'preview') return t('全部用户');
  if (card.scope.type === 'all') return t('全部用户');
  return Object.entries({ tenantIds: '租户', organizationIds: '组织', projectIds: '项目' })
    .flatMap(([key, label]) => card.scope[key]?.length ? [t(label) + '（' + card.scope[key].length + '）'] : []).join('、');
}

function CardVisibility({ card }) {
  const key = marketCardStatus(card);
  return <AdminStatus value={marketCardStatuses[key]} color={visibilityColors[key]}/>;
}

function MarketSupplies({ groups, expandedProviderId = null }) {
  const translateLabel = useChannelText();
  if (!groups.length) return <Typography.Text type="tertiary">{translateLabel("待关联服务商和上游模型")}</Typography.Text>;
  return <ul className="market-supplies" aria-label={translateLabel("服务商与上游模型")}>{groups.map(({ id, name, channels }) => <li key={id || 'missing'}>
    {channels.size ? <Collapse defaultActiveKey={expandedProviderId && id === expandedProviderId ? [id || 'missing'] : []}>
      <AdminCollapsePanel itemKey={id || 'missing'} header={<span className="market-supply-row">
        <span>{name}</span><Typography.Text type="tertiary" size="small">{channels.size} 个上游模型</Typography.Text>
      </span>}>
        <ul className="market-channel-names">{[...channels].map(([channelId, label]) => <li key={channelId}>{label}</li>)}</ul>
      </AdminCollapsePanel>
    </Collapse> : <div className="market-supply-row">
      <Typography.Text>{name}</Typography.Text><Typography.Text type="tertiary" size="small">{translateLabel("待关联上游模型")}</Typography.Text>
    </div>}
  </li>)}</ul>;
}

function MarketVisibility({ model }) {
  return <AdminStatus value={model.marketVisible === false ? '隐藏' : '允许展示'}/>;
}

function ModelCallIdentifiers({ services }) {
  const identifiers = [...new Set(services.map(service => service.callId))];
  return identifiers.length ? <Space vertical align="start" spacing={4}>{identifiers.map(value =>
    <CopyId key={value} value={value} label="模型 ID" ellipsis={{ showTooltip: true }}/>)}</Space> : <Typography.Text type="tertiary">未配置</Typography.Text>;
}

const modalityIcons = { 文本: IconTextStroked, 图片: IconImageStroked, 音频: IconMicrophoneStroked, 视频: IconVideoStroked };

function MarketModalities({ values }) {
  if (!values?.length) return '—';
  return <span className="market-card-modalities">{values.map(value => {
    const Icon = modalityIcons[value];
    return <span key={value}>{Icon && <Icon size="small" aria-hidden="true"/>}{value}</span>;
  })}</span>;
}

function MarketLogo({ src }) {
  const [failed, setFailed] = useState(false);
  return <span className="market-card-logo" aria-hidden="true">{src && !failed
    ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>
    : <IconBox size="large"/>}</span>;
}

function MarketCard({ model, services, groups, position, canReorder, savingOrder, actions, openSupplies }) {
  const translateLabel = useChannelText();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: model.id, disabled: !canReorder || savingOrder, data: { name: model.name },
  });
  const source = model;
  const profile = modelProfileDraft(source);
  const outputModalities = profile.outputModalities || [];
  const resultTypes = (profile.resultTypes || []).filter(value => value !== '生成文本' || !outputModalities.includes('文本'));
  const outputs = [...new Set([...outputModalities, ...resultTypes])];
  const context = source.capabilities?.context;
  const channelCount = groups.reduce((count, group) => count + group.channels.size, 0);
  return <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} data-dragging={isDragging || undefined}>
    <Card className="market-model-card">
      <div className="market-card-heading">
        <MarketLogo key={profile.logo || ''} src={profile.logo}/>
        <div className="market-card-identity">
          <Typography.Title heading={6} component="h3" ellipsis={{ rows: 2, showTooltip: true }}>{model.name}</Typography.Title>
          {services.map(service => <CopyId key={service.id} value={service.id} label="模型服务 ID" ellipsis={{showTooltip:true}}/>)}
          <ModelCallIdentifiers services={services}/>
        </div>
        <Button theme="borderless" size="small" className="market-order-handle market-card-order"
          icon={<IconHandle size="small" aria-hidden="true"/>} {...attributes} {...listeners}
          aria-label={`拖动 ${model.name} 调整顺序，序号 ${position}`} title="拖动调整顺序"
          disabled={!canReorder} aria-disabled={!canReorder || savingOrder}>{position}</Button>
      </div>
      <Typography.Paragraph className="market-card-description" type="secondary" ellipsis={{ rows: 2, showTooltip: true }}>{source.description || '暂无简介'}</Typography.Paragraph>
      <div className="market-card-facts">
        <dl>
          <div><dt>{translateLabel("输入模态")}</dt><dd title={profile.inputModalities?.join('、')}><MarketModalities values={profile.inputModalities}/></dd></div>
          <div><dt>{translateLabel("输出模态")}</dt><dd title={outputs.join('、')}><MarketModalities values={outputs}/></dd></div>
          <div><dt>{translateLabel("上下文长度")}</dt><dd>{materialContextLabel(context) || '—'}</dd></div>
          <div><dt>{translateLabel("模型作者")}</dt><dd title={profile.author}>{profile.author || '—'}</dd></div>
          <div><dt>{translateLabel("关联服务")}</dt><dd>{translateLabel(model.card.linked.length === 1 ? '1 个服务' : '{count} 个服务').replace('{count}', model.card.linked.length)}</dd></div>
          <div><dt>{translateLabel("可见范围")}</dt><dd>{scopeLabel(model.card, translateLabel)}</dd></div>
        </dl>
        <div className="market-card-supply">
          <div className="market-card-supply-title">
            <span>{translateLabel("服务商与上游模型")}<small>{groups.length} 家服务商 · {channelCount} 个上游模型</small></span>
            {groups.length > 0 && <Button theme="borderless" size="small" aria-label={`查看 ${model.name} 的全部服务商与上游模型`}
              onClick={event => openSupplies(event, model.id)}>{translateLabel("查看全部")}</Button>}
          </div>
          <ul className="market-supplies market-card-supply-preview" aria-label="服务商摘要">
            {groups.length ? groups.slice(0, cardSupplierLimit).map(({ id, name, channels }) => <li key={id || 'missing'}>
              <Button block theme="borderless" type="tertiary" size="small" title={name}
                onClick={event => openSupplies(event, model.id, id)}>
                <span className="market-supply-row"><span>{name}</span>
                  <span className="market-channel-count">{channels.size ? `${channels.size} 个上游模型` : '待关联上游模型'} <IconChevronRight size="small" aria-hidden="true"/></span>
                </span>
              </Button>
            </li>) : <li className="market-supply-row">{translateLabel("待关联服务商和上游模型")}</li>}
          </ul>
        </div>
      </div>
      <footer className="market-card-footer">
        <CardVisibility card={model.card}/>
        {actions}
      </footer>
    </Card>
  </li>;
}

export default function ModelMarket(live) {
  const t = useChannelText();
  const [demo, setDemo] = useState(null);
  const savedFilters = useRef(null);
  const props = demo ? { ...live, state: demo, conflict: false, transact: action => {
    const next = commitAdminState(demo, action);
    setDemo(next);
    return next;
  }} : live;
  const ops = useOperations({ ...props, ...serviceOperationsUi }, 'model-market');
  const { params, go } = ops;
  const [cardDialog, setCardDialog] = useState(null);
  const [supplyDetail, setSupplyDetail] = useState(null);
  const [orderEdit, setOrderEdit] = useState(null);
  const [drag, setDrag] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const trigger = useRef(null);
  const searchInput = useRef(null);
  const cardDragRevision = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const query = params.get('q') || '';
  const search = query.trim().toLowerCase();
  const type = params.get('type'), visibility = params.get('visibility');
  const view = params.get('view') === 'cards' ? 'cards' : 'list';
  const ordered = useMemo(() => marketCardIndex(props.state, orderedMarketModels(props.state)), [props.state]);
  const servicesById = useMemo(() => new Map(marketCardServices(props.state).map(service => [service.id, service])), [props.state]);
  const upstreamsById = useMemo(() => new Map(view === 'cards' && props.state.marketModelServices?.some(service => service.channelIds?.length)
    ? registeredServiceUpstreams(props.state).map(channel => [channel.id, channel]) : []), [props.state, view]);
  const linkedServices = model => model.card.linked.map(id => servicesById.get(id)).filter(Boolean);
  const linkedUpstreams = model => linkedServices(model).flatMap(service => (service.channelIds || []).flatMap(id => {
    const channel = upstreamsById.get(id);
    return channel ? [{ id: JSON.stringify([service.id, id]), service, channel }] : [];
  }));
  const linkedSources = model => linkedServices(model).flatMap(service => {
    const source = service.sourceId && props.state.models.find(row => row.id === service.sourceId);
    return source ? [{ model: source, providerId: service.providerId, channelId: service.channelId, service }] : [];
  });
  const supplyGroups = (model, upstreams) => marketSupplyGroups(props.state, { sources: linkedSources(model), upstreams });
  const cardsById = new Map(ordered.map(row => [row.cardId, row]));
  const materials = useMemo(() => modelCatalogue(props.state), [props.state]);
  const openCard = (kind, cardId, button) => ops.proceed(() => {
    if (button) trigger.current = button;
    ops.setError('');
    setCardDialog({ kind, cardId });
  });
  const closeCard = (deleted = false) => {
    setCardDialog(null);
    ops.setError('');
    ops.dirty(false);
    requestAnimationFrame(() => (deleted ? searchInput.current : trigger.current)?.focus());
  };
  const cardRow = cardsById.get(cardDialog?.cardId);
  const positions = new Map(ordered.map((model, index) => [model.id, index + 1]));
  const rows = ordered.filter(model =>
    [model.name, model.description, ...model.card.linked,
      ...linkedServices(model).map(service => service.callId)].join(' ').toLowerCase().includes(search) &&
    (!type || modelCategory(model.type) === type) &&
    (!Object.hasOwn(marketCardStatuses, visibility) || marketCardStatus(model.card) === visibility));
  const currentPage = Math.min(Math.max(1, Number.parseInt(params.get('page'), 10) || 1), Math.ceil(rows.length / pageSize) || 1);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const changePage = page => go({ page: page === 1 ? null : page }, { replace: true, preserveScroll: true });
  const changeFilters = patch => go({ ...patch, page: null }, { replace: true, preserveScroll: true });
  const toggleDemo = () => ops.proceed(() => {
    if (demo) {
      setDemo(null);
      go(savedFilters.current, { saved: true, replace: true, preserveScroll: true });
      return;
    }
    savedFilters.current = Object.fromEntries(marketFilterKeys.map(key => [key, params.get(key)]));
    setDemo(marketDemoState(live.state.currentRole));
    go(Object.fromEntries(marketFilterKeys.map(key => [key, null])), { saved: true, replace: true, preserveScroll: true });
  });
  const supplyModel = supplyDetail && ordered.find(row => row.id === supplyDetail.modelId);
  const supplyUpstreams = supplyModel ? linkedUpstreams(supplyModel) : [];
  const legacySupplyRows = supplyModel ? linkedSources(supplyModel).flatMap(({ model, providerId, channelId, service }) => {
    const entry = providerId && providerOffer(model, channelId || providerId);
    return entry ? [{ model, entry, service }] : [];
  }) : [];
  const openSupplies = (event, modelId, providerId = null) => {
    trigger.current = event.currentTarget;
    setSupplyDetail({ modelId, providerId, displayCard: ordered.some(row => row.id === modelId && !row.legacy) });
  };
  const closeSupplies = () => {
    setSupplyDetail(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const closeOrder = () => ops.proceed(() => {
    setOrderEdit(null);
    ops.setError('');
    requestAnimationFrame(() => trigger.current?.focus());
  });
  const saveOrder = async (modelId, position, expectedRevision) => {
    if (!ops.can || busy || position === positions.get(modelId)) return null;
    setBusy(true);
    try {
      return await ops.run('marketReorder', { position, expectedRevision }, modelId);
    } finally {
      setBusy(false);
    }
  };
  const endDrag = () => { setDrag(null); setDropTarget(null); };
  const orderButton = row => <Button theme="borderless" className="market-order-handle"
    aria-label={`调整 ${row.name} 的序号`} title="拖动或点击调整序号"
    disabled={!ops.can || busy || ordered.length < 2} draggable={ops.can && !busy && ordered.length > 1}
    onClick={event => {
      trigger.current = event.currentTarget;
      ops.setError('');
      setOrderEdit({ id: row.id, name: row.name, position: positions.get(row.id), revision: props.state.revision });
    }}
    onDragStart={event => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.id);
      setDrag({ id: row.id, revision: props.state.revision });
    }} onDragEnd={endDrag}>
    <IconHandle size="small" aria-hidden="true"/>{positions.get(row.id)}
  </Button>;
  const orderChanged = orderEdit && orderEdit.revision !== props.state.revision;
  const position = Number(orderEdit?.position);
  const validPosition = Number.isSafeInteger(position) && position >= 1 && position <= ordered.length;
  const toggleChannelVisibility = async ({ model, entry }, button) => {
    setBusy(true);
    try {
      await ops.run('serviceProviderListing', {
        providerId: offerKey(entry), enabled: entry.marketVisible === false, expectedUpdatedAt: model.updatedAt,
      }, model.id);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => button.focus());
    }
  };
  const editAction = row => <Button size="small" theme="borderless" disabled={!ops.can || busy}
    onClick={event => openCard('edit', row.cardId, event.currentTarget)}>{t('编辑信息')}</Button>;
  const listActions = row => <Space spacing={12} className="market-list-actions">
    {editAction(row)}
    <AdminActionMenu label={`${row.name} ${t('更多', 'More')}`} disabled={!ops.can || busy} items={[
      { key: 'link', name: t('关联模型服务'), onClick: button => openCard('link', row.cardId, button) },
      { key: 'status', name: t('设置可见性'), onClick: button => openCard('status', row.cardId, button) },
      { key: 'delete', name: t('删除'), type: 'danger', onClick: button => openCard('delete', row.cardId, button) },
    ]}><span className="market-more-label">{t('更多', 'More')} <ChevronDown size={14} aria-hidden="true"/></span></AdminActionMenu>
  </Space>;
  const actions = row => <Space wrap>
    {editAction(row)}
    <Button size="small" theme="borderless" disabled={!ops.can || busy} onClick={event => openCard('link', row.cardId, event.currentTarget)}>{t('关联模型服务')}</Button>
    <Button size="small" theme="borderless" disabled={!ops.can || busy} onClick={event => openCard('status', row.cardId, event.currentTarget)}>{t('设置可见性')}</Button>
    <Button size="small" theme="borderless" type="danger" disabled={!ops.can || busy}
      onClick={event => openCard('delete', row.cardId, event.currentTarget)}>{t('删除')}</Button>
  </Space>;
  return <div className="semi-services admin-page-stack">
    <ModelModuleHeading module="market" className="market-heading xa24-entry-header"/>
    <Card className="market-workspace-card xa24-page-card">
      {demo && <p className="market-demo-note" role="status">模拟数据仅用于当前页面，退出后清除。</p>}
      <div className="market-toolbar xa24-toolbar">
        <Space wrap spacing={4}>
          <Button theme="solid" icon={<IconPlus/>} disabled={!ops.can || busy}
            onClick={event => openCard('create', null, event.currentTarget)}>{t('新建模型卡片')}</Button>
          <Button onClick={toggleDemo}>{t(demo ? '退出模拟' : '模拟数据')}</Button>
        </Space>
        <Space wrap spacing={12} className="market-filters">
          <RadioGroup type="button" className="market-view-switch" aria-label={t("模型广场视图")}
            options={[{ value: 'list', label: t('列表视图', 'List view') }, { value: 'cards', label: t('卡片视图', 'Card view') }]} value={view}
            onChange={event => go({ view: event.target.value === 'cards' ? 'cards' : null }, { replace: true, preserveScroll: true })}/>
          <Input ref={searchInput} className="market-search" icon="search" showClear aria-label={t("搜索模型展示名称、模型服务 ID 或模型 ID")}
            placeholder={t('搜索模型展示名称、模型服务 ID 或模型 ID')} value={query} onChange={q => changeFilters({ q: q || null })}/>
          {filters.map(({ key, label, all, englishAll, options }) => <Choice key={key} className="market-select" translateOptions showClear
            label={label} value={params.get(key) || ''} options={[[ '', t(all, englishAll) ], ...options]}
            onChange={value => changeFilters({ [key]: value || null })}/>)}
          {(query || type || visibility) && <Button onClick={() => changeFilters({ q: null, type: null, visibility: null })}>{t('重置筛选')}</Button>}
        </Space>
      </div>
      {!orderEdit && !cardDialog && ops.error && <Notice error>{ops.error}</Notice>}
      {view === 'cards' ? rows.length ? <>
        <DndContext sensors={sensors} collisionDetection={cardCollision} accessibility={{
          screenReaderInstructions: { draggable: '按空格开始拖动，用方向键移动，再按空格放下，按 Esc 取消。' },
          announcements: {
            onDragStart: ({ active }) => `已拿起 ${active.data.current.name}。`,
            onDragOver: ({ over }) => over ? `移至序号 ${positions.get(over.id)}。` : undefined,
            onDragEnd: ({ over }) => over ? '已放下卡片。' : '已取消拖动。',
            onDragCancel: () => '已取消拖动。',
          },
        }} onDragStart={() => { cardDragRevision.current = props.state.revision; }}
          onDragEnd={({ active, over }) => {
            if (over && active.id !== over.id) void saveOrder(active.id, positions.get(over.id), cardDragRevision.current);
          }}>
          <SortableContext items={pageRows.map(row => row.id)} strategy={rectSortingStrategy}>
            <ul className="market-card-grid" aria-label={t("模型卡片")}>
              {pageRows.map(row => <MarketCard key={row.id} model={row} services={linkedServices(row)} groups={supplyGroups(row, linkedUpstreams(row))} position={positions.get(row.id)}
                canReorder={ops.can && pageRows.length > 1} savingOrder={busy} actions={actions(row)} openSupplies={openSupplies}/>)}
            </ul>
          </SortableContext>
        </DndContext>
        <AdminPagination className="market-card-pagination" total={rows.length} pageSize={pageSize} currentPage={currentPage} onPageChange={changePage}/>
      </> : <Empty description={t(emptyMessage)}/> : <Table className="market-model-table" size="small" rowKey="id" dataSource={pageRows}
        scroll={{ x: 'max(100%, 1128px)' }} pagination={{ pageSize, currentPage, total: rows.length, onPageChange: changePage }} empty={emptyMessage}
        onRow={row => ({
          className: dropTarget === row.id ? 'market-order-target' : undefined,
          onDragOver: event => {
            if (!drag || drag.id === row.id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDropTarget(row.id);
          },
          onDrop: event => {
            if (!drag || drag.id === row.id) return;
            event.preventDefault();
            endDrag();
            void saveOrder(drag.id, positions.get(row.id), drag.revision);
          },
        })} columns={[
        { title: '模型展示名称', width: 228, render: (_, row) => {
          const { logo, author } = modelProfileDraft(row);
          return <div className="market-list-model"><MarketLogo key={logo || ''} src={logo}/>
            <div className="market-list-identity">
              <Typography.Text strong ellipsis={{ showTooltip: true }}>{row.name}</Typography.Text>
              {author && <Typography.Text size="small" type="secondary">{author}</Typography.Text>}
            </div>
          </div>;
        } },
        { title: '可见性', width: 153, render: (_, row) => {
          const status = marketCardStatus(row.card);
          return <span className="market-list-visibility" data-status={status}>{t(marketCardStatuses[status])}</span>;
        } },
        { title: '模型类型', width: 145, render: (_, row) => t(MODEL_CATALOGUE_TYPES[modelCategory(row.type)] || row.type) },
        { title: '序号', width: 109, render: (_, row) => orderButton(row) },
        { title: '关联模型服务', width: 150, render: (_, row) => row.card.linked.length
          ? <Button size="small" theme="borderless" onClick={event => openCard('link', row.cardId, event.currentTarget)}>{t(row.card.linked.length === 1 ? '1 个服务' : '{count} 个服务').replace('{count}', row.card.linked.length)}</Button>
          : t('未关联') },
        { title: '可见范围', width: 173, render: (_, row) => scopeLabel(row.card, t) },
        { title: '操作', width: 220, render: (_, row) => listActions(row) },
      ]}/>}
    </Card>
    {cardDialog && (cardDialog.kind === 'create' || cardRow) && <MarketCardDialogs
      key={cardDialog.kind + ':' + cardDialog.cardId} kind={cardDialog.kind} row={cardRow} state={props.state}
      materials={materials} internal={props.internal} ops={ops} close={closeCard} open={openCard}/>}
    {supplyModel && <Modal title={t("服务商与上游模型")} description={supplyModel.name} wide centered onClose={() => !busy && closeSupplies()}
      footer={<Button disabled={busy} onClick={closeSupplies}>{t("关闭")}</Button>}>
      <div className="market-supply-detail">
        <MarketSupplies groups={supplyGroups(supplyModel, supplyUpstreams)} expandedProviderId={supplyDetail.providerId}/>
        {supplyUpstreams.length > 0 && <Table rowKey="id" dataSource={supplyUpstreams} pagination={false} columns={[
          { title: '服务商', render: (_, row) => row.channel.provider.name },
          { title: '上游模型 ID', render: (_, row) => <CopyId value={row.channel.upstreamModelId} label="上游模型 ID"/> },
          { title: '模型服务 ID', render: (_, row) => <CopyId value={row.service.id} label="模型服务 ID"/> },
          { title: '模型 ID', render: (_, row) => row.service.callId },
          { title: '售卖状态', render: (_, row) => <AdminStatus value={saleStages[row.service.saleStage] || saleStages.unlisted}/> },
        ]}/>}
        {legacySupplyRows.length > 0 && (
          <Table rowKey={row => row.service.id} dataSource={legacySupplyRows} pagination={false}
            columns={[
              { title: '连接', render: (_, { entry }) => entry.channelName || props.state.providers.find(provider => provider.id === entry.providerId)?.name || '—' },
              { title: '模型服务 ID', render: (_, { service }) => <CopyId value={service.id} label="模型服务 ID"/> },
              { title: '模型 ID', render: (_, { service }) => service.callId || '待配置' },
              { title: '售卖状态', render: (_, { model, entry }) => <Space vertical align="start" spacing={4}><AdminStatus value={entry.salesPaused ? '已停售' : saleStages[offerStage(model, entry)]}/>{entry.callsEnabled === false && entry.channelUnavailableReason && <Typography.Text type="tertiary" size="small">{entry.channelUnavailableReason}</Typography.Text>}</Space> },
              ...(!supplyDetail.displayCard ? [{ title: '广场展示', render: (_, { entry }) => <MarketVisibility model={entry}/> },
              { title: '操作', render: (_, row) => <Button theme="borderless" disabled={!ops.can} aria-disabled={busy}
                aria-label={`${row.entry.marketVisible === false ? '允许展示' : '隐藏'} ${row.service.callId || row.entry.channelName || row.entry.providerId}`}
                onClick={event => { if (!busy) void toggleChannelVisibility(row, event.currentTarget); }}>{row.entry.marketVisible === false ? '允许展示' : '隐藏'}</Button> }] : []),
            ]}/>
        )}
        {ops.error && <Notice error>{ops.error}</Notice>}
      </div>
    </Modal>}
    {orderEdit && <Modal title="调整序号" description={orderEdit.name} onClose={() => !busy && closeOrder()} footer={<>
      <Button theme="light" disabled={busy} onClick={closeOrder}>{t("取消")}</Button>
      <Button loading={busy} disabled={!ops.can || busy || orderChanged || !validPosition || position === positions.get(orderEdit.id)}
        onClick={async () => { if (await saveOrder(orderEdit.id, position, orderEdit.revision)) closeOrder(); }}>{t("保存")}</Button>
    </>}>
      <Field label="新序号">
        <InputNumber aria-label="新序号" autoFocus value={orderEdit.position} disabled={busy || orderChanged}
          onChange={position => { setOrderEdit({ ...orderEdit, position }); ops.dirty(true); }}/>
      </Field>
      {orderChanged && <Notice error>模型广场已有修订，请重新打开后调整。</Notice>}
      {!validPosition && <Notice error>{`序号须为 1 到 ${ordered.length} 的整数`}</Notice>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
    {ops.leaveDialog}
  </div>;
}
