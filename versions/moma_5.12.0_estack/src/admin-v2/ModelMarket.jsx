import AdminStatus from './AdminStatus';
import Table, { AdminPagination } from './AdminTable';
import AdminActionMenu from './AdminActionMenu';
import AdminCollapsePanel from './AdminCollapsePanel';
import { useRef, useState } from 'react';
import { Button, Card, Collapse, Empty, Input, InputNumber, RadioGroup, Space, Typography } from '@douyinfe/semi-ui';
import { IconBox, IconChevronRight, IconHandle, IconImageStroked, IconMicrophoneStroked, IconSearch, IconTextStroked, IconVideoStroked } from '@douyinfe/semi-icons';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useOperations } from './ModelOperationsUI';
import { Choice, CopyId, Field, Modal, Notice, serviceOperationsUi } from './ServiceUI';
import { libraryRecord, MODEL_CATALOGUE_TYPES } from './model-library';
import { modelCategory, moneyDisplay, priceItems } from './model-management';
import { modelProfileDraft } from './model-profile';
import { activeModelSalePrice, serviceHeaderStatus } from './service-workspace';
import ModelModuleHeading from './ModelModuleHeading';
import ServiceListingDialog from './ServiceListingDialog';
import { marketSupplyGroups } from './model-market-supplies';
import { orderedMarketModels } from './model-market-order';
import './model-market.css';

const filters = [
  { key: 'type', label: '模型类型', options: [['all', '全部类型'], ...Object.entries(MODEL_CATALOGUE_TYPES)] },
  { key: 'status', label: '上架状态', options: [['all', '全部状态'], ...['正式上架', '灰度上架', '已下架'].map(status => [status, status])] },
  { key: 'visibility', label: '广场展示', options: [['all', '全部展示设置'], ['visible', '允许展示'], ['hidden', '隐藏']] },
];
const pageSize = 20;
const cardSupplierLimit = 3;
const viewOptions = [{ label: '列表', value: 'list' }, { label: '卡片', value: 'cards' }];
const emptyMessage = '没有符合条件的模型服务';
const cardCollision = args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

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
  const source = libraryRecord(state, model.id) || model;
  const profile = modelProfileDraft(source);
  const outputModalities = profile.outputModalities || [];
  const resultTypes = (profile.resultTypes || []).filter(value => value !== '生成文本' || !outputModalities.includes('文本'));
  const outputs = [...new Set([...outputModalities, ...resultTypes])];
  const context = source.capabilities?.context;
  const groups = marketSupplyGroups(state, model);
  const channelCount = groups.reduce((count, group) => count + group.channels.size, 0);
  const sale = model.serviceMode === 'standard' ? activeModelSalePrice(state, model.id) : null;
  const rates = priceItems(sale, model);
  const basicRates = ['输入', '输出', '单价'].flatMap(name => {
    const items = rates.filter(item => item.name === name);
    const [item] = items;
    return items.length === 1 && !item.condition && item.amount != null && item.currency && item.unit ? [item] : [];
  });
  const showBasicRates = basicRates.length > 0 && basicRates.length <= 2;
  return <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} data-dragging={isDragging || undefined}>
    <Card className="market-model-card" footer={<div className="market-card-footer">
      <Space wrap>
        <AdminStatus value={serviceHeaderStatus(model).service}/>
        <MarketVisibility model={model}/>
      </Space>
      {actions}
    </div>}>
      <div className="market-card-heading">
        <MarketLogo key={profile.logo || ''} src={profile.logo}/>
        <div className="market-card-identity">
          <Typography.Title heading={6} component="h3" ellipsis={{ rows: 2, showTooltip: true }}>{model.name}</Typography.Title>
          <CopyId value={model.modelId} label="模型编码" ellipsis={{ showTooltip: true }}/>
        </div>
        <Button theme="borderless" size="small" className="market-order-handle market-card-order"
          icon={<IconHandle size="small" aria-hidden="true"/>} {...attributes} {...listeners}
          aria-label={`拖动 ${model.name} 调整顺序，序号 ${position}`} title="拖动调整顺序"
          disabled={!canReorder} aria-disabled={!canReorder || savingOrder}>{position}</Button>
      </div>
      <Typography.Paragraph className="market-card-description" type="secondary" ellipsis={{ rows: 2, showTooltip: true }}>{source.description || '暂无简介'}</Typography.Paragraph>
      <div className="market-card-facts">
        <dl>
          <div><dt>输入类型</dt><dd title={profile.inputModalities?.join('、')}><MarketModalities values={profile.inputModalities}/></dd></div>
          <div><dt>输出类型</dt><dd title={outputs.join('、')}><MarketModalities values={outputs}/></dd></div>
          <div><dt>上下文</dt><dd>{context > 0 ? `${Number(context).toLocaleString('zh-CN')} Token` : '—'}</dd></div>
          <div><dt>模型作者</dt><dd title={profile.author}>{profile.author || '—'}</dd></div>
          {showBasicRates ? basicRates.map(item => {
            const rate = `${item.currency} ${moneyDisplay(item.amount)} / ${item.unit.replace(/^元\//, '')}`;
            return <div key={item.name}><dt>{item.name}售价</dt><dd title={rate}>{rate}</dd></div>;
          }) : <div><dt>平台售价</dt><dd>{model.serviceMode === 'provider' ? '按渠道服务定价' : sale ? '按计费项定价' : '暂无生效售价'}</dd></div>}
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

export default function ModelMarket(props) {
  const ops = useOperations({ ...props, ...serviceOperationsUi }, 'model-market');
  const { params, go } = ops;
  const [editing, setEditing] = useState(null);
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
  const type = params.get('type'), status = params.get('status'), visibility = params.get('visibility');
  const ordered = orderedMarketModels(props.state);
  const positions = new Map(ordered.map((model, index) => [model.id, index + 1]));
  const rows = ordered.filter(model =>
    [model.name, model.modelId].join(' ').toLowerCase().includes(search) &&
    (!type || modelCategory(model.type) === type) &&
    (!status || serviceHeaderStatus(model).service === status) &&
    (!visibility || (model.marketVisible === false ? 'hidden' : 'visible') === visibility));
  const currentPage = Math.min(Math.max(1, Number.parseInt(params.get('page'), 10) || 1), Math.ceil(rows.length / pageSize) || 1);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const view = params.get('view') === 'list' ? 'list' : 'cards';
  const changePage = page => go({ page: page === 1 ? null : page }, { replace: true, preserveScroll: true });
  const changeFilters = patch => go({ ...patch, page: null }, { replace: true, preserveScroll: true });
  const model = editing && props.state.models.find(row => row.id === editing.id);
  const supplyModel = supplyDetail && props.state.models.find(row => row.id === supplyDetail.modelId);
  const openSupplies = (event, modelId, providerId = null) => {
    trigger.current = event.currentTarget;
    setSupplyDetail({ modelId, providerId });
  };
  const closeSupplies = () => {
    setSupplyDetail(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const changed = editing && (!model || model.archivedAt || model.updatedAt !== editing.revision);
  const stage = ops.params.get('listing');
  const listingModel = ['formal', 'gray', 'withdrawn'].includes(stage) && props.state.models.find(row =>
    row.id === ops.params.get('model') && !row.archivedAt && row.serviceMode);
  const close = () => {
    setEditing(null);
    ops.setError('');
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
  const open = (row, action) => {
    ops.setError('');
    setEditing({ id: row.id, name: row.name, action, visible: row.marketVisible === false, revision: row.updatedAt });
  };
  const listingActions = row => [
    { node: 'item', name: '正式上架', onClick: () => ops.go({ model: row.id, listing: 'formal' }) },
    { node: 'item', name: '灰度上架', onClick: () => ops.go({ model: row.id, listing: 'gray' }) },
    { node: 'item', name: '下架', disabled: row.listingStatus !== '已上架', onClick: button => { trigger.current = button; if (row.serviceMode==='provider') ops.go({model:row.id,listing:'withdrawn'}); else open(row,'stopSales'); } },
  ];
  const actions = row => <Space wrap>
    <AdminActionMenu label={`上架操作 ${row.name}`} items={listingActions(row)} disabled={!ops.can || busy}>上架操作</AdminActionMenu>
    <Button theme="borderless" disabled={!ops.can || busy} onClick={event => { trigger.current = event.currentTarget; open(row, 'marketVisibility'); }}>{row.marketVisible === false ? '允许展示' : '隐藏模型'}</Button>
  </Space>;
  const stop = editing?.action === 'stopSales';
  const actionTitle = stop ? '下架' : editing?.visible ? '允许展示' : '隐藏模型';

  return <div className="semi-services sp-workspace">
    <ModelModuleHeading module="market">
      <RadioGroup type="button" aria-label="模型广场视图" options={viewOptions} value={view}
        onChange={event => go({ view: event.target.value === 'list' ? 'list' : null }, { replace: true, preserveScroll: true })}/>
    </ModelModuleHeading>
    <div className="sp-filters">
      <Input prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索模型展示名或模型编码" placeholder="模型展示名 / 模型编码" value={query} onChange={q => changeFilters({ q: q || null })}/>
      {filters.map(({ key, label, options }) => <Field key={key} label={label}>
        <Choice label={`筛选${label}`} value={params.get(key) || 'all'} options={options}
          onChange={value => changeFilters({ [key]: value === 'all' ? null : value })}/>
      </Field>)}
      <Button onClick={() => changeFilters({ q: null, type: null, status: null, visibility: null })}>重置筛选</Button>
    </div>
    {!editing && !orderEdit && ops.error && <Notice error>{ops.error}</Notice>}
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
    </> : <Empty description={emptyMessage}/> : <Table size="small" rowKey="id" dataSource={pageRows}
      scroll={{ x: 1180 }} pagination={{ pageSize, currentPage, total: rows.length, onPageChange: changePage }} empty={emptyMessage}
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
      { title: '序号', width: 88, render: (_, row) => orderButton(row) },
      { title: '模型展示名', dataIndex: 'name' },
      { title: '模型编码', dataIndex: 'modelId' },
      { title: '服务商与渠道', width: 260, render: (_, row) => <MarketSupplies groups={marketSupplyGroups(props.state, row)}/> },
      { title: '上架状态', render: (_, row) => <AdminStatus value={serviceHeaderStatus(row).service}/> },
      { title: '广场展示设置', render: (_, row) => <MarketVisibility model={row}/> },
      { title: '操作', width: 206, fixed: 'right', render: (_, row) => actions(row) },
    ]}/>}
    {supplyModel && <Modal title="服务商与渠道" description={supplyModel.name} wide centered onClose={closeSupplies}
      footer={<Button onClick={closeSupplies}>关闭</Button>}>
      <div className="market-supply-detail">
        <MarketSupplies groups={marketSupplyGroups(props.state, supplyModel)} expandedProviderId={supplyDetail.providerId}/>
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
    {listingModel && <ServiceListingDialog key={listingModel.id + stage} state={props.state} model={listingModel} ops={ops} stage={stage}
      close={() => ops.proceed(() => {
        ops.go({ model: null, listing: null }, { saved: true, replace: true, preserveScroll: true });
        requestAnimationFrame(() => trigger.current?.focus());
      })}/>}
    {editing && <Modal title={actionTitle} description={editing.name} onClose={() => !busy && close()} footer={<>
      <Button theme="light" disabled={busy} onClick={close}>取消</Button>
      <Button loading={busy} disabled={!ops.can || changed || busy} onClick={async () => {
        setBusy(true);
        try {
          const data = stop ? { confirmed: true } : { visible: editing.visible };
          if (await ops.run(editing.action, { ...data, expectedUpdatedAt: editing.revision }, editing.id)) close();
        } finally { setBusy(false); }
      }}>确认{stop ? '下架' : editing.visible ? '展示' : '隐藏'}</Button>
    </>}>
      <p>{stop ? '下架后，客户无法新订购或调用此模型服务。' : editing.visible ? '允许符合上架、启用和客户授权条件的模型在用户侧广场展示。' : '从用户侧模型广场及其详情隐藏此模型。'}</p>
      {changed && <Notice error>服务配置已变化，请关闭后重新核对。</Notice>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
    {ops.leaveDialog}
  </div>;
}
