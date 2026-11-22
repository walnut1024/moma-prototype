import MarketCardDialogs from './MarketCardDialogs';
import { marketCardIndex, marketCardStatus, marketCardStatuses } from '../market-cards.mjs';
import { modelIdentity, modelServiceIdentity } from '../model-identities.mjs';
import { serviceReferences } from '../service-access.mjs';
import AdminStatus from './AdminStatus';
import Table, { AdminPagination } from './AdminTable';
import AdminCollapsePanel from './AdminCollapsePanel';
import { useMemo, useRef, useState } from 'react';
import { Button, Card, Collapse, Empty, Input, InputNumber, RadioGroup, Space, Typography } from '@douyinfe/semi-ui';
import { IconBox, IconChevronRight, IconHandle, IconImageStroked, IconMicrophoneStroked, IconPlus, IconSearch, IconTextStroked, IconVideoStroked } from '@douyinfe/semi-icons';
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
import { providerServices, serviceCallIdentifiers } from './service-workspace';
import { offerKey } from '../service-access.mjs';
import ModelModuleHeading from './ModelModuleHeading';
import { marketSupplyGroups } from './model-market-supplies';
import { orderedMarketModels } from './model-market-order';
import './model-market.css';

const filters = [
  { key: 'type', label: '模型类型', options: [['all', '全部类型'], ...Object.entries(MODEL_CATALOGUE_TYPES)] },
  { key: 'visibility', label: '可见性', options: [['all', '全部'], ...Object.entries(marketCardStatuses)] },
];
const visibilityColors = { preview: 'blue', gray: 'orange', formal: 'green' };
const marketFilterKeys = ['q', 'type', 'visibility', 'page'];
const pageSize = 20;
const cardSupplierLimit = 3;
const viewOptions = [{ label: '列表', value: 'list' }, { label: '卡片', value: 'cards' }];
const emptyMessage = '没有符合条件的模型卡片';
const cardCollision = args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
function scopeLabel(card) {
  if (marketCardStatus(card) === 'withdrawn') return '—';
  if (card.status === 'preview') return '全部用户';
  if (card.scope.type === 'all') return '全部用户';
  return Object.entries({ tenantIds: '租户', organizationIds: '组织', projectIds: '项目' })
    .flatMap(([key, label]) => card.scope[key]?.length ? [label + '（' + card.scope[key].length + '）'] : []).join('、');
}

function CardVisibility({ card }) {
  const key = marketCardStatus(card);
  return <AdminStatus value={marketCardStatuses[key]} color={visibilityColors[key]}/>;
}

function MarketSupplies({ groups, expandedProviderId = null }) {
  if (!groups.length) return <Typography.Text type="tertiary">待关联服务商和渠道</Typography.Text>;
  return <ul className="market-supplies" aria-label="服务商与渠道">{groups.map(({ id, name, channels }) => <li key={id || 'missing'}>
    {channels.size ? <Collapse defaultActiveKey={expandedProviderId && id === expandedProviderId ? [id || 'missing'] : []}>
      <AdminCollapsePanel itemKey={id || 'missing'} header={<span className="market-supply-row">
        <span>{name}</span><Typography.Text type="tertiary" size="small">{channels.size} 条渠道</Typography.Text>
      </span>}>
        <ul className="market-channel-names">{[...channels].map(([channelId, label]) => <li key={channelId}>{label}</li>)}</ul>
      </AdminCollapsePanel>
    </Collapse> : <div className="market-supply-row">
      <Typography.Text>{name}</Typography.Text><Typography.Text type="tertiary" size="small">待关联渠道</Typography.Text>
    </div>}
  </li>)}</ul>;
}

function MarketVisibility({ model }) {
  return <AdminStatus value={model.marketVisible === false ? '隐藏' : '允许展示'}/>;
}

function ModelCallIdentifiers({ model }) {
  const identifiers = serviceCallIdentifiers(model);
  return identifiers.length ? <Space vertical align="start" spacing={4}>{identifiers.map(value =>
    <CopyId key={value} value={value} label="模型调用标识" ellipsis={{ showTooltip: true }}/>)}</Space> : <Typography.Text type="tertiary">未配置</Typography.Text>;
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

function MarketCard({ state, model, position, canReorder, savingOrder, actions, openSupplies }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: model.id, disabled: !canReorder || savingOrder, data: { name: model.name },
  });
  const source = model;
  const profile = modelProfileDraft(source);
  const outputModalities = profile.outputModalities || [];
  const resultTypes = (profile.resultTypes || []).filter(value => value !== '生成文本' || !outputModalities.includes('文本'));
  const outputs = [...new Set([...outputModalities, ...resultTypes])];
  const context = source.capabilities?.context;
  const groups = marketSupplyGroups(state, model);
  const channelCount = groups.reduce((count, group) => count + group.channels.size, 0);
  return <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} data-dragging={isDragging || undefined}>
    <Card className="market-model-card" footer={<div className="market-card-footer">
      <Space wrap>
        <CardVisibility card={model.card}/>
      </Space>
      {actions}
    </div>}>
      <div className="market-card-heading">
        <MarketLogo key={profile.logo || ''} src={profile.logo}/>
        <div className="market-card-identity">
          <Typography.Title heading={6} component="h3" ellipsis={{ rows: 2, showTooltip: true }}>{model.name}</Typography.Title>
          <CopyId value={modelIdentity(state,model).canonical_slug} label="模型编码"/>
          {serviceReferences({...state,models:[model]}).map(service=><CopyId key={service.id} value={service.model_service_id} label="模型服务 ID" ellipsis={{showTooltip:true}}/>)}
          <ModelCallIdentifiers model={model}/>
        </div>
        <Button theme="borderless" size="small" className="market-order-handle market-card-order"
          icon={<IconHandle size="small" aria-hidden="true"/>} {...attributes} {...listeners}
          aria-label={`拖动 ${model.name} 调整顺序，序号 ${position}`} title="拖动调整顺序"
          disabled={!canReorder} aria-disabled={!canReorder || savingOrder}>{position}</Button>
      </div>
      <Typography.Paragraph className="market-card-description" type="secondary" ellipsis={{ rows: 2, showTooltip: true }}>{source.description || '暂无简介'}</Typography.Paragraph>
      <div className="market-card-facts">
        <dl>
          <div><dt>输入模态</dt><dd title={profile.inputModalities?.join('、')}><MarketModalities values={profile.inputModalities}/></dd></div>
          <div><dt>输出模态</dt><dd title={outputs.join('、')}><MarketModalities values={outputs}/></dd></div>
          <div><dt>上下文长度</dt><dd>{materialContextLabel(context) || '—'}</dd></div>
          <div><dt>模型作者</dt><dd title={profile.author}>{profile.author || '—'}</dd></div>
          <div><dt>关联服务</dt><dd>{model.card.linked.length} 个服务</dd></div>
          <div><dt>可见范围</dt><dd>{scopeLabel(model.card)}</dd></div>
        </dl>
        <div className="market-card-supply">
          <div className="market-card-supply-title">
            <span>服务商与渠道<small>{groups.length} 家服务商 · {channelCount} 条渠道</small></span>
            {groups.length > 0 && <Button theme="borderless" size="small" aria-label={`查看 ${model.name} 的全部服务商与渠道`}
              onClick={event => openSupplies(event, model.id)}>查看全部</Button>}
          </div>
          <ul className="market-supplies market-card-supply-preview" aria-label="服务商摘要">
            {groups.length ? groups.slice(0, cardSupplierLimit).map(({ id, name, channels }) => <li key={id || 'missing'}>
              <Button block theme="borderless" type="tertiary" size="small" title={name}
                onClick={event => openSupplies(event, model.id, id)}>
                <span className="market-supply-row"><span>{name}</span>
                  <span className="market-channel-count">{channels.size ? `${channels.size} 条渠道` : '待关联渠道'} <IconChevronRight size="small" aria-hidden="true"/></span>
                </span>
              </Button>
            </li>) : <li className="market-supply-row">待关联服务商和渠道</li>}
          </ul>
        </div>
      </div>
    </Card>
  </li>;
}

export default function ModelMarket(live) {
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
  const cardDragRevision = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const query = params.get('q') || '';
  const search = query.trim().toLowerCase();
  const type = params.get('type'), visibility = params.get('visibility');
  const ordered = useMemo(() => marketCardIndex(props.state, orderedMarketModels(props.state)), [props.state]);
  const cardsById = new Map(ordered.map(row => [row.cardId, row]));
  const materials = useMemo(() => modelCatalogue(props.state), [props.state]);
  const openCard = (kind, cardId, button) => ops.proceed(() => {
    if (button) trigger.current = button;
    ops.setError('');
    setCardDialog({ kind, cardId });
  });
  const closeCard = () => {
    setCardDialog(null);
    ops.setError('');
    ops.dirty(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const cardRow = cardsById.get(cardDialog?.cardId);
  const positions = new Map(ordered.map((model, index) => [model.id, index + 1]));
  const rows = ordered.filter(model =>
    [model.name, model.description, modelIdentity(props.state,model).id, modelIdentity(props.state,model).canonical_slug, ...serviceReferences({ ...props.state, models:[model] }).map(service=>service.model_service_id), ...serviceCallIdentifiers(model)].join(' ').toLowerCase().includes(search) &&
    (!type || modelCategory(model.type) === type) &&
    (!Object.hasOwn(marketCardStatuses, visibility) || marketCardStatus(model.card) === visibility));
  const currentPage = Math.min(Math.max(1, Number.parseInt(params.get('page'), 10) || 1), Math.ceil(rows.length / pageSize) || 1);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const view = params.get('view') === 'cards' ? 'cards' : 'list';
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
  const supplyModel = supplyDetail && props.state.models.find(row => row.id === supplyDetail.modelId);
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
  const toggleChannelVisibility = async (entry, button) => {
    setBusy(true);
    try {
      await ops.run('serviceProviderListing', {
        providerId: offerKey(entry), enabled: entry.marketVisible === false, expectedUpdatedAt: supplyModel.updatedAt,
      }, supplyModel.id);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => button.focus());
    }
  };
  const actions = (row, inList = false) => <Space wrap={!inList} spacing={inList ? 4 : 8} className={inList ? 'market-list-actions' : undefined}>
    <Button size="small" theme="borderless" disabled={!ops.can || busy} onClick={event => openCard('edit', row.cardId, event.currentTarget)}>编辑信息</Button>
    <Button size="small" theme="borderless" disabled={!ops.can || busy} onClick={event => openCard('link', row.cardId, event.currentTarget)}>关联模型服务</Button>
    <Button size="small" theme="borderless" disabled={!ops.can || busy} onClick={event => openCard('status', row.cardId, event.currentTarget)}>设置可见性</Button>
  </Space>;
  return <div className="semi-services sp-workspace">
    <ModelModuleHeading module="market" className="market-heading">
      <Space wrap spacing={12} className="market-heading-actions">
        <Button theme="light" onClick={toggleDemo}>{demo ? '退出模拟' : '模拟数据'}</Button>
        <Button theme="solid" icon={<IconPlus/>} disabled={!ops.can || busy}
          onClick={event => openCard('create', null, event.currentTarget)}>新建模型卡片</Button>
        <RadioGroup type="button" aria-label="模型广场视图" options={viewOptions} value={view}
          onChange={event => go({ view: event.target.value === 'cards' ? 'cards' : null }, { replace: true, preserveScroll: true })}/>
      </Space>
    </ModelModuleHeading>
    {demo && <Notice>模拟数据仅用于当前页面，退出后清除。</Notice>}
    <div className="sp-filters">
      <Input prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索模型展示名、模型编码、模型服务 ID 或模型调用标识" placeholder="模型展示名 / 模型编码 / 模型服务 ID / 模型调用标识" value={query} onChange={q => changeFilters({ q: q || null })}/>
      {filters.map(({ key, label, options }) => <Field key={key} label={label}>
        <Choice label={`筛选${label}`} value={params.get(key) || 'all'} options={options}
          onChange={value => changeFilters({ [key]: value === 'all' ? null : value })}/>
      </Field>)}
      <Button onClick={() => changeFilters({ q: null, type: null, visibility: null })}>重置筛选</Button>
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
          <ul className="market-card-grid" aria-label="模型卡片">
            {pageRows.map(row => <MarketCard key={row.id} state={props.state} model={row} position={positions.get(row.id)}
              canReorder={ops.can && pageRows.length > 1} savingOrder={busy} actions={actions(row)} openSupplies={openSupplies}/>)}
          </ul>
        </SortableContext>
      </DndContext>
      <AdminPagination className="market-card-pagination" total={rows.length} pageSize={pageSize} currentPage={currentPage} onPageChange={changePage}/>
    </> : <Empty description={emptyMessage}/> : <Table className="market-model-table" size="small" rowKey="id" dataSource={pageRows}
      scroll={{ x: '100%' }} pagination={{ pageSize, currentPage, total: rows.length, onPageChange: changePage }} empty={emptyMessage}
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
      { title: '序号', width: '9%', render: (_, row) => orderButton(row) },
      { title: '模型', render: (_, row) => <Space className="market-list-identity" vertical align="start" spacing={2}>
        <Typography.Text strong ellipsis={{ showTooltip: true }}>{row.name}</Typography.Text>
        {row.canonicalSlug && <CopyId value={row.canonicalSlug} label="模型编码" ellipsis={{ showTooltip: true }}/>}
      </Space> },
      { title: '类型', width: '8%', render: (_, row) => MODEL_CATALOGUE_TYPES[modelCategory(row.type)] || row.type },
      { title: '关联服务', width: '12%', render: (_, row) => row.card.linked.length
        ? <Button size="small" theme="borderless" onClick={event => openCard('link', row.cardId, event.currentTarget)}>{row.card.linked.length} 个服务</Button>
        : '未关联' },
      { title: '可见范围', width: '14%', render: (_, row) => scopeLabel(row.card) },
      { title: '可见性', width: '9%', render: (_, row) => <CardVisibility card={row.card}/> },
      { title: '操作', width: 280, render: (_, row) => actions(row, true) },
    ]}/>}
    {cardDialog && (cardDialog.kind === 'create' || cardRow) && <MarketCardDialogs
      key={cardDialog.kind + ':' + cardDialog.cardId} kind={cardDialog.kind} row={cardRow} state={props.state}
      materials={materials} internal={props.internal} ops={ops} close={closeCard} open={openCard}/>}
    {supplyModel && <Modal title="服务商与渠道" description={supplyModel.name} wide centered onClose={() => !busy && closeSupplies()}
      footer={<Button disabled={busy} onClick={closeSupplies}>关闭</Button>}>
      <div className="market-supply-detail">
        <MarketSupplies groups={marketSupplyGroups(props.state, supplyModel)} expandedProviderId={supplyDetail.providerId}/>
        {providerServices(supplyModel).length > 0 && (
          <Table rowKey={offerKey} dataSource={providerServices(supplyModel)} pagination={false}
            columns={[
              { title: '渠道', render: (_, row) => row.channelName || props.state.providers.find(provider => provider.id === row.providerId)?.name || '—' },
              { title: '模型服务 ID', render: (_,row)=><CopyId value={modelServiceIdentity(props.state,supplyModel,offerKey(row))} label="模型服务 ID"/> },
              { title: '模型调用标识', dataIndex: 'callId', render: value => value || '待配置' },
              { title: '上架状态', render: (_, row) => <Space vertical align="start" spacing={4}><AdminStatus value={row.listingStage === 'formal' ? '正式上架' : row.listingStage === 'gray' ? '灰度上架' : '已下架'}/>{row.callsEnabled === false && row.channelUnavailableReason && <Typography.Text type="tertiary" size="small">{row.channelUnavailableReason}</Typography.Text>}</Space> },
              ...(!supplyDetail.displayCard ? [{ title: '广场展示', render: (_, row) => <MarketVisibility model={row}/> },
              { title: '操作', render: (_, row) => <Button theme="borderless" disabled={!ops.can} aria-disabled={busy}
                aria-label={`${row.marketVisible === false ? '允许展示' : '隐藏'} ${row.callId || row.channelName || row.providerId}`}
                onClick={event => { if (!busy) void toggleChannelVisibility(row, event.currentTarget); }}>{row.marketVisible === false ? '允许展示' : '隐藏'}</Button> }] : []),
            ]}/>
        )}
        {ops.error && <Notice error>{ops.error}</Notice>}
      </div>
    </Modal>}
    {orderEdit && <Modal title="调整序号" description={orderEdit.name} onClose={() => !busy && closeOrder()} footer={<>
      <Button theme="light" disabled={busy} onClick={closeOrder}>取消</Button>
      <Button loading={busy} disabled={!ops.can || busy || orderChanged || !validPosition || position === positions.get(orderEdit.id)}
        onClick={async () => { if (await saveOrder(orderEdit.id, position, orderEdit.revision)) closeOrder(); }}>保存</Button>
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
