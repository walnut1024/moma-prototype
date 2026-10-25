import { Fragment, useEffect, useRef, useState } from 'react';
import { Plus, ChevronDown, CheckCircle2, AlertCircle, Upload, ArrowRight, FileText, Image, Video, AudioLines, Braces, Gauge, ListOrdered, File, Boxes, Building2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { FilterPagination, FilterReset, DEFAULT_PAGE_SIZE, normalizePageSize } from '../components/FilterControls';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import ModelMetadataForm, { Choice, Field } from './ModelMetadataForm';
import ModelBatchImport from './ModelBatchImport';
import { MODEL_TYPES, MODEL_CATEGORIES, MODEL_CATEGORY_DESCRIPTIONS, modelCategory, modelCode, modelSupplies, activeSupplyPrice, activeSupplySalePrice, displayTime, publicationChecks, priceItems, supplyModelUrl, floorDiscountDisplay } from './model-management';
import { modelProfileDraft } from './model-profile';
import { listed, modelLibrary, libraryRecord, operationalFacts, supplySalesStatus } from './model-operations';
import { Heading, Status, Notice, SearchBox, GridTable, Row, Cell, CopyId, Price, Modal, useOperations, ScopeFields } from './ModelOperationsUI';

import ModelOnboarding from './ModelOnboarding';
import ModelLibraryEditor from './ModelLibraryEditor';
import MaterialsHeader from './MaterialsHeader';
import SupplyActionDialog from './SupplyActionDialog';
import SupplyPriceEditor, { itemMoney } from './SupplyPriceEditor';
import { billingItemKey } from './provider-catalogue-pricing';
import SupplierModelListing from './SupplierModelListing';
import SupplierModelBatch from './SupplierModelBatch';
import { LISTING_FILTER_KEYS, listingAddress, validListingReturn, listingPreferences, rememberListing } from './supplier-listing';

const tabs = { supplies: '供应商与售价', history: '操作记录' };
function ModelList({ state, ops, open, act }) {
  const { params, go } = ops, query = params.get('q') || '', type = params.get('type') || 'all', filter = params.get('status') || 'all', attention = params.get('attention') === '1', provider = params.get('provider') || 'all';
  const baseRows = [...state.models].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).filter(model => (!query || [model.name, modelCode(model), modelProfileDraft(model).author].join(' ').toLowerCase().includes(query.trim().toLowerCase())) && (provider === 'all' || modelSupplies(state, model.id).some(supply => supply.provider?.id === provider)));
  const typeRows = baseRows.filter(model => type === 'all' || modelCategory(model.type) === type);
  const rows = typeRows.filter(model => (filter === 'all' || listed(model) === (filter === 'listed')) && (!attention || operationalFacts(state, model).issue));
  const size = normalizePageSize(params.get('size'));
  const page = Math.max(1, Math.min(Number(params.get('page')) || 1, Math.ceil(rows.length / size) || 1));
  const change = patch => go({ ...patch, page: null }, { replace: true });
  const problems = typeRows.filter(model => operationalFacts(state, model).issue).length;
  return <>{state.modelOnboardings.filter(item => item.status !== '已完成').length > 0 && <section className="mo-surface mo-draft-list"><h2>待继续配置</h2>{state.modelOnboardings.filter(item => item.status !== '已完成').map(item => <div key={item.id}><span>{state.providers.find(provider => provider.id === item.providerId)?.name} · {item.catalogueModelId}</span><Button variant="link" onClick={() => ops.go({ view: 'add', draft: item.id, step: item.step, model: null, provider: null })}>继续配置</Button></div>)}</section>}<section className="mo-surface"><TooltipProvider delayDuration={200}><Tabs value={type} onValueChange={type => change({ type: type === 'all' ? null : type })} className="mo-type-tabs"><TabsList variant="line" aria-label="模型类型">{[['all', '全部模型'], ...Object.entries(MODEL_CATEGORIES)].map(([key, label]) => {
    const description = MODEL_CATEGORY_DESCRIPTIONS[key];
    const trigger = <TabsTrigger value={key}>{label}<span className="mo-type-count">{key === 'all' ? baseRows.length : baseRows.filter(model => modelCategory(model.type) === key).length}</span></TabsTrigger>;
    return <Fragment key={key}>{description ? <Tooltip><TooltipTrigger asChild>{trigger}</TooltipTrigger><TooltipContent side="bottom">{description}</TooltipContent></Tooltip> : trigger}</Fragment>;
  })}</TabsList></Tabs></TooltipProvider><div className="mo-toolbar" role="group" aria-label="筛选条件"><span className="mo-perspective-label">模型视角</span><SearchBox value={query} onChange={q => change({ q: q || null })}/><span className="mo-filter-label">上架状态</span><Choice label="上架状态" value={filter} options={[['all', `全部状态 ${typeRows.length}`], ['listed', `已上架 ${typeRows.filter(listed).length}`], ['unlisted', `已下架 ${typeRows.filter(model => !listed(model)).length}`]]} onChange={status => change({ status })}/><span className="mo-filter-label">供应商</span><Choice label="供应商" value={provider} options={[['all', '全部供应商'], ...state.providers.map(item => [item.id, item.name])]} onChange={provider => change({ provider })}/><FilterReset onClick={() => change({ q: null, type: null, status: null, attention: null, provider: null })}/><label className="mo-check"><input type="checkbox" checked={attention} onChange={e => change({ attention: e.target.checked ? '1' : null })}/>仅看需处理 {problems}</label></div><GridTable className="mo-model-table" headings={['模型', '供应情况', '目录价', '上架状态', '操作']} empty={!rows.length}>{rows.slice((page - 1) * size, page * size).map(model => { const facts = operationalFacts(state, model), single = facts.ready.length === 1 && activeSupplySalePrice(state, model.id, facts.ready[0].id); return <Row key={model.id}><Cell><Button className="mo-model-name" title={model.name} variant="link" onClick={() => open(model)}>{model.name}</Button><small title={`${modelCode(model)} · ${MODEL_TYPES[model.type]}`}>{modelCode(model)} · {MODEL_TYPES[model.type]}</small></Cell><Cell><Button variant="link" onClick={() => open(model, 'supplies')}>{facts.available.length ? `${facts.available.length} 家可用` : facts.supplies.length ? `${facts.supplies.length} 家待验证` : '未接入'}</Button></Cell><Cell>{single ? <Price model={model} price={single}/> : facts.ready.length > 1 ? <Button variant="link" onClick={() => open(model)}>查看 {facts.ready.length} 家目录价</Button> : <span className="mo-muted">未配置</span>}</Cell><Cell><Status good={listed(model)}>{listed(model) ? '已上架' : '已下架'}</Status></Cell><Cell><div className="mo-row-actions"><Button variant="link" disabled={!ops.can} onClick={() => act(model, listed(model) ? 'unlist' : 'publish')}>{listed(model) ? '下架' : '上架'}</Button><Button variant="link" disabled={!ops.can || !facts.supplies.length} onClick={() => act(model, 'reprice')}>目录价设置</Button><Button variant="link" onClick={() => open(model)}>供应商设置</Button></div></Cell></Row>; })}</GridTable><FilterPagination total={rows.length} page={page} size={size} onPageChange={page => go({ page }, { replace: true })} onSizeChange={size => change({ size })}/></section></>;
}
const modalityIcons = { 文本: FileText, 图片: Image, 视频: Video, 音频: AudioLines, 向量: Braces, 相关性分数: Gauge, 排序结果: ListOrdered };
function TemplateModalities({ profile }) {
  const inputs = profile.inputModalities || [], outputs = profile.outputModalities?.length ? profile.outputModalities : profile.resultTypes || [];
  const label = `输入：${inputs.join('、') || '未填写'}；输出：${outputs.join('、') || '未填写'}`;
  const icons = values => values.length ? values.map(value => { const Icon = modalityIcons[value] || File; return <span key={value} title={value}><Icon aria-hidden="true"/></span>; }) : <span>—</span>;
  return <Tooltip><TooltipTrigger asChild><span className="mo-template-modalities" tabIndex={0} role="img" aria-label={label}><span>{icons(inputs)}</span><ArrowRight aria-hidden="true"/><span>{icons(outputs)}</span></span></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}
function TemplateList({ state, ops }) {
  const [query, setQuery] = useState(''), [type, setType] = useState('all'), [page, setPage] = useState(1), [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [infoId, setInfoId] = useState(null), infoTrigger = useRef(null), infoPanel = useRef(null);
  const records = modelLibrary(state);
  const inspected = records.find(template => template.id === infoId);
  const closeInfo = () => ops.proceed(() => { setInfoId(null); ops.dirty(false); ops.setError(''); requestAnimationFrame(() => infoTrigger.current?.isConnected && infoTrigger.current.focus()); });
  const rows = records.filter(template => (!query || [template.name, template.modelId, template.profile?.author].join(' ').toLowerCase().includes(query.toLowerCase())) && (type === 'all' || modelCategory(template.type) === type));
  const current = Math.min(page, Math.ceil(rows.length / size) || 1);
  return <TooltipProvider delayDuration={200}><section className="mo-surface"><div className="mo-toolbar" role="group" aria-label="筛选条件"><SearchBox value={query} onChange={value => { setQuery(value); setPage(1); }} placeholder="搜索模型名称 / 作者 / 编码"/><span className="mo-filter-label">模型类型</span><Choice label="模型类型" value={type} options={[[ 'all', '全部类型'], ...Object.entries(MODEL_CATEGORIES)]} onChange={value => { setType(value); setPage(1); }}/><FilterReset onClick={() => { setQuery(''); setType('all'); setPage(1); }}/></div><GridTable className="mo-template-table" headings={['模型名称', '模型编码', '作者', '模型发布时间', '模型类型', '适用场景', '输入 / 输出', '上下文大小', '操作']} empty={!rows.length}>{rows.slice((current - 1) * size, current * size).map(template => {
    const profile = modelProfileDraft(template);
    return <Row key={template.id}><Cell><Button variant="link" className="mo-template-name" title={template.name} onClick={event => { infoTrigger.current = event.currentTarget; setInfoId(template.id); }}>{template.name}</Button></Cell><Cell><code title={template.modelId}>{template.modelId || '—'}</code></Cell><Cell>{profile.author || template.maker || '—'}</Cell><Cell>{profile.releaseDate || '—'}</Cell><Cell>{MODEL_CATEGORIES[modelCategory(template.type)]}</Cell><Cell><span title={profile.scenarios?.join('、')}>{profile.scenarios?.join('、') || '—'}</span></Cell><Cell><TemplateModalities profile={profile}/></Cell><Cell>{template.capabilities.context ? template.capabilities.context / 1024 + 'K Token' : '—'}</Cell><Cell><Button variant="link" onClick={() => ops.go({ view: 'template', template: template.id })}>编辑</Button></Cell></Row>;
  })}</GridTable><FilterPagination total={rows.length} page={current} size={size} onPageChange={setPage} onSizeChange={value => { setSize(value); setPage(1); }}/></section>{inspected && <Modal drawer title={inspected.name} description={inspected.modelId + ' · ' + (inspected.profile?.author || inspected.maker || '作者未填写')} onClose={closeInfo}><div ref={infoPanel} tabIndex={-1} className="mo-template-info"><div className="mo-template-info-meta"><Field label="模型发布时间"><span className="mm-fact-value">{inspected.profile?.releaseDate || '—'}</span></Field><Field label="适用场景"><span className="mm-fact-value">{inspected.profile?.scenarios?.join('、') || '—'}</span></Field></div>{ops.error && <Notice error>{ops.error}</Notice>}<ModelMetadataForm key={inspected.id + inspected.updatedAt} model={inspected} readOnly/><div className="mo-footer"><Button variant="outline" onClick={closeInfo}>关闭</Button><Button disabled={!ops.can} onClick={() => ops.go({ view: 'template', template: inspected.id })}>维护模型资料</Button></div></div></Modal>}</TooltipProvider>;
}
function ProviderComparison({ state, model, ops, onAction }) {
  const supplies = modelSupplies(state, model.id);
  return <GridTable className="mo-supply-prices-table" headings={['供应商 / 供应商模型 URL', '计费项 / 适用条件', '计价单位', '供应商价格', '平台目录价', '底线折扣', '状态', '操作']} empty={!supplies.length} emptyMessage="尚未接入供应商，请通过上方“接入供应商”添加。">{supplies.map(supply => {
    const cost = activeSupplyPrice(state, supply.id), sale = activeSupplySalePrice(state, model.id, supply.id), costs = priceItems(cost, model), sales = priceItems(sale, model);
    const rows = costs.length ? costs : [null], status = supplySalesStatus(supply);
    return <Fragment key={supply.id}>{rows.map((item, index) => <Row key={item ? billingItemKey(item) : 'missing'}>{index === 0 && <Cell rowSpan={rows.length}><strong>{supply.provider?.name || '供应商已失效'}</strong><div className="mo-supply-url">{supplyModelUrl(supply, model) ? <CopyId value={supplyModelUrl(supply, model)} label="供应商模型 URL"/> : 'URL 待配置'}</div></Cell>}<Cell>{item?.name || '待配置'}{item?.condition && <small>{item.condition}</small>}</Cell><Cell>{item?.unit || '—'}</Cell><Cell>{itemMoney(item)}</Cell><Cell>{itemMoney(item && sales.find(row => billingItemKey(row) === billingItemKey(item)))}</Cell>{index === 0 && <><Cell rowSpan={rows.length}>{floorDiscountDisplay(sale)}</Cell><Cell rowSpan={rows.length}><Status good={status === '上架售卖'}>{status}</Status></Cell><Cell rowSpan={rows.length}><div className="mo-row-actions"><Button variant="link" disabled={!ops.can || !supply.provider || !supply.endpoint} onClick={() => onAction('testSupply', supply)}>连通性测试</Button><Button variant="link" disabled={!ops.can} onClick={() => onAction('price', supply)}>修改平台目录价</Button>{status !== '上架售卖' && <Button variant="link" disabled={!ops.can} onClick={() => onAction('publishSupply', supply)}>上架销售</Button>}{status === '上架售卖' && <Button variant="link" disabled={!ops.can} onClick={() => onAction('unlistSupply', supply)}>下架停售</Button>}{status !== '停止服务' && <Button variant="link" disabled={!ops.can} onClick={() => onAction('stopSupply', supply)}>停止服务</Button>}</div></Cell></>}</Row>)}</Fragment>;
  })}</GridTable>;
}
export default function ModelManagement(props) {
  const { state } = props, baseOps = useOperations(props, props.templatePage ? 'model-templates' : 'listing'), { params } = baseOps;
  const rememberedView = listingPreferences(localStorage).perspective;
  const perspective = params.get('perspective') === 'suppliers' || !params.has('perspective') && rememberedView === 'suppliers' ? 'suppliers' : 'models';
  const isList = !props.templatePage && !params.get('view') && !params.get('model');
  const restoreList = useRef(true);
  const rememberCurrentList = () => rememberListing(localStorage, { perspective, [perspective]: { address: listingAddress(params, perspective), scrollY: window.scrollY } });
  useEffect(() => {
    if (!isList || location.hash.split('?')[0] !== '#/admin-2/listing') { restoreList.current = true; return; }
    const saved = listingPreferences(localStorage)[perspective];
    if (!params.size && validListingReturn(saved?.address)) { baseOps.go(Object.fromEntries(new URLSearchParams(saved.address.split('?')[1])), { saved: true, replace: true }); return; }
    rememberListing(localStorage, { perspective });
    if (restoreList.current) {
      restoreList.current = false;
      const scrollY = saved?.address === listingAddress(params, perspective) && Number.isFinite(saved.scrollY) ? Math.max(0, saved.scrollY) : 0;
      const frame = requestAnimationFrame(() => window.scrollTo(0, scrollY));
      return () => cancelAnimationFrame(frame);
    }
  }, [params, isList, perspective]);
  const go = (patch, options = {}) => {
    if (isList && (patch.model || ['add', 'import', 'supplier-batch'].includes(patch.view))) {
      rememberCurrentList(); patch = { ...patch, listingReturn: listingAddress(params, perspective) };
    }
    const nextView = Object.hasOwn(patch, 'view') ? patch.view : params.get('view') || (props.templatePage ? 'templates' : null);
    baseOps.go(patch, { ...options, base: options.base || (['templates', 'template', 'templateImport'].includes(nextView) ? 'model-templates' : 'listing') });
  };
  const ops = { ...baseOps, go }, drawerTrigger = useRef(null);
  const [dialog, setDialog] = useState(null);
  const model = state.models.find(item => item.id === params.get('model')), view = params.get('view') || (props.templatePage ? 'templates' : null), tab = tabs[params.get('tab')] ? params.get('tab') : 'supplies';
  const template = libraryRecord(state, params.get('template'));
  const returnFromLibrary = (id, saved = false) => validListingReturn(params.get('returnListing')) ? ops.proceed(() => { location.hash = params.get('returnListing'); }) : params.get('returnModel') ? go({ view: null, template: null, returnModel: null, model: params.get('returnModel'), tab: null }, { base: 'listing', saved }) : params.get('returnDraft') ? go({ view: 'add', template: null, returnDraft: null, draft: params.get('returnDraft'), library: id || params.get('library'), step: 'metadata' }, { base: 'listing', saved }) : go({ view: 'templates', template: null }, { saved });
  const home = () => validListingReturn(params.get('listingReturn')) ? ops.proceed(() => { location.hash = params.get('listingReturn'); }) : params.get('origin')?.startsWith('#/admin-2/providers') ? ops.proceed(() => { location.hash = params.get('origin'); }) : go({ view: null, model: null, step: null, tab: null, template: null, return: null, supply: null, chosen: null, draft: null, provider: null, catalogue: null });
  const switchPerspective = next => {
    if (!next || next === perspective) return;
    ops.proceed(() => {
      if (isList) rememberCurrentList(); restoreList.current = true;
      const saved = listingPreferences(localStorage)[next]?.address;
      const nextParams = new URLSearchParams(validListingReturn(saved)?.split('?')[1] || '');
      const patch = Object.fromEntries(LISTING_FILTER_KEYS.map(key => [key, nextParams.get(key)]));
      go({ ...patch, perspective: next, view: null, model: null, draft: null, step: null, batchMode: null, listingReturn: null }, { saved: true, replace: true });
    });
  };
  const batch = (provider, ids, review = false) => {
    rememberListing(localStorage, { batch: { providerId: provider.id, ids } });
    go({ view: 'supplier-batch', provider: provider.id, model: null, draft: null, batchMode: review ? 'review' : 'configure' });
  };
  const open = (model, target = 'supplies') => {
    const draft = state.modelOnboardings.find(item => item.modelId === model.id && item.status !== '已完成');
    if (target === 'price') { act(model, 'reprice'); return; }
    if (target === 'basic') { go({ view: 'template', template: model.id, model: null, tab: null, returnModel: model.id }, { base: 'model-templates' }); return; }
    if (target === 'supply') { go({ view: 'add', model: draft ? null : model.id, draft: draft?.id, step: draft?.step || 'select', provider: null, catalogue: null }); return; }
    go({ model: model.id, view: null, tab: null, step: null }, { preserveScroll: true });
  };
  const act = (model, kind, item) => ops.proceed(() => { drawerTrigger.current = document.activeElement; const supplies = modelSupplies(state, model.id); setDialog({ modelId: model.id, kind: kind === 'reprice' ? supplies.length === 1 ? 'price' : 'choosePrice' : kind, item: kind === 'reprice' && supplies.length === 1 ? supplies[0] : item }); });
  const viewSwitch = <TooltipProvider delayDuration={200}><ToggleGroup type="single" value={perspective} onValueChange={switchPerspective} spacing={0} aria-label="管理视角" className="mo-perspective-switch">{[['models', '模型视角', Boxes], ['suppliers', '供应商视角', Building2]].map(([value, label, Icon]) => <Tooltip key={value}><TooltipTrigger asChild><ToggleGroupItem value={value} aria-label={label}><Icon/></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom">{label}</TooltipContent></Tooltip>)}</ToggleGroup></TooltipProvider>;
  let content;
  if (view === 'templates') content = <><MaterialsHeader active="model-templates" ops={ops}><Button variant="outline" disabled={!ops.can} onClick={() => go({ view: 'templateImport' })}>批量导入</Button><Button disabled={!ops.can} onClick={() => go({ view: 'template', template: null })}><Plus/>新建资料</Button></MaterialsHeader><TemplateList state={state} ops={ops}/></>;
  else if (view === 'template' && params.get('template') && !template) content = <Notice error>模型资料不存在。<Button variant="link" onClick={() => returnFromLibrary()}>返回</Button></Notice>;
  else if (view === 'template') content = <><Heading title={template ? '维护模型资料' : '新建模型资料'} description="资料保存后，所有引用页面同步展示；能力规格变更需要确认影响。"/><section className="mo-surface mo-pad"><ModelLibraryEditor key={template?.id || 'new'} state={state} record={template} onboardingId={params.get('returnDraft')} initial={state.modelOnboardings.find(item => item.id === params.get('returnDraft'))?.model || { modelId: params.get('code') || '', name: params.get('code') || '' }} ops={ops} onCancel={() => returnFromLibrary(template?.id)} onSaved={(next,id) => returnFromLibrary(id,true)}/></section></>;
  else if (['import','templateImport'].includes(view)) content = <><Heading title={view === 'import' ? '批量导入模型' : '批量导入模型资料'} description="先校验，再确认导入；相同模型编码不会覆盖。"/><section className="mo-surface mo-pad"><ModelBatchImport key={view} mode={view === 'templateImport' ? 'template' : 'model'} state={view === 'templateImport' ? { ...state, models: modelLibrary(state) } : state} can={ops.can} dirty={ops.dirty} run={(operation, data) => ops.run(view === 'templateImport' ? 'templateImport' : operation, data, null, view === 'import')} close={saved => go({ view: view === 'templateImport' ? 'templates' : null }, { saved: saved === true })}/></section></>;
  else if (view === 'supplier-batch') content = <SupplierModelBatch key={params.get('provider') + ':' + params.get('batchMode')} state={state} ops={ops} home={home} viewSwitch={viewSwitch}/>;
  else if (view === 'add') content = <ModelOnboarding key={params.get('draft') || [params.get('provider'), params.get('catalogue'), model?.id].join(':')} state={state} ops={ops} home={home}/>;
  else content = <><Heading title={<><Boxes/>服务管理</>} description="管理服务接入、平台目录价和上下架。">{viewSwitch}<Popover><PopoverTrigger asChild><Button disabled={!ops.can}><Plus data-icon="inline-start"/>添加模型<ChevronDown data-icon="inline-end"/></Button></PopoverTrigger><PopoverContent align="end" className="mo-menu"><Button variant="ghost" onClick={() => go({ view: 'add', step: 'select', draft: null, model: null, provider: null, catalogue: null })}>添加模型</Button><Button variant="ghost" onClick={() => go({ view: 'import' })}><Upload data-icon="inline-start"/>批量导入</Button></PopoverContent></Popover></Heading>{perspective === 'suppliers' ? <SupplierModelListing key={params.get('supplier') || 'default'} state={state} ops={ops} open={open} batch={batch}/> : <ModelList state={state} ops={ops} open={open} act={act}/>}</>;
  const dialogModel = dialog && state.models.find(item => item.id === dialog.modelId);
  const close = () => ops.proceed(() => { setDialog(null); ops.dirty(false); requestAnimationFrame(() => drawerTrigger.current?.isConnected && drawerTrigger.current.focus()); });
  return <div className={`mo-workbench${view === 'templates' ? ' mo-catalog-workbench mo-template-workbench' : !view ? ' mo-catalog-workbench mo-model-list-workbench' : ''}`}>{content}{!view && params.has('model') && !props.templatePage && (model ? <ModelSupplierDrawer state={state} model={model} ops={ops} tab={tab} onTabChange={tab => go({ tab }, { replace: true })} close={home} act={(kind, supply) => act(model, kind, supply)} connect={() => go({ view: 'add', step: 'select', draft: null, provider: null, catalogue: null })}/> : <Modal wide drawer title="模型不存在" onClose={home}><Notice error>该模型已不存在，请关闭后重新选择。</Notice></Modal>)}{ops.error && !dialog && !(model && !view) && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}{dialogModel && (['testSupply', 'publishSupply', 'unlistSupply', 'stopSupply'].includes(dialog.kind) ? <SupplyActionDialog key={dialog.kind + dialog.item.id} state={state} model={dialogModel} supplyId={dialog.item.id} kind={dialog.kind} ops={ops} close={close}/> : dialog.kind === 'choosePrice' ? <Modal title="选择调价供给" description="请选择供应商及调用 Model ID，售价按供给分别维护。" onClose={close}>{modelSupplies(state, dialogModel.id).map(item => <Button key={item.id} variant="outline" onClick={() => setDialog({ ...dialog, kind: 'price', item })}>{item.provider?.name} · {item.callId || item.upstreamModelId}</Button>)}</Modal> : dialog.kind === 'price' ? <Modal title="目录价设置" description="修改当前供应商对应模型的平台目录价。" drawer onClose={close}><SupplyPriceEditor key={dialog.item.id} state={state} model={dialogModel} ops={ops} supply={modelSupplies(state,dialogModel.id).find(item => item.id === dialog.item.id)} onCancel={close} onSaved={() => setDialog(null)}/>{ops.error && <Notice error>{ops.error}</Notice>}</Modal> : dialog.kind === 'scope' ? <ScopeDialog state={state} model={dialogModel} ops={ops} close={close} saved={() => setDialog(null)}/> : <Modal title={dialog.kind === 'publish' ? `上架 ${dialogModel.name}` : `下架 ${dialogModel.name}`} description={dialog.kind === 'publish' ? '检查通过后，该模型可供租户订购。' : '下架后停止新增订购。资料、价格和历史记录保留。'} onClose={close}>{dialog.kind === 'publish' ? <ul className="mo-checks">{publicationChecks(state,dialogModel).map(check => <li key={check.label}>{check.passed ? <CheckCircle2/> : <AlertCircle/>}{check.label}{!check.passed && <Button variant="link" onClick={() => { setDialog(null); open(dialogModel, check.tab === 'pricing' ? 'price' : check.tab === 'basic' ? 'basic' : 'supply'); }}>前往配置</Button>}</li>)}</ul> : <p className="mo-muted">已有订购的调用行为沿用当前平台权限规则。</p>}<div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can || dialog.kind === 'publish' && publicationChecks(state,dialogModel).some(check => !check.passed)} onClick={() => { if (ops.run(dialog.kind, { id: dialog.item?.id }, dialogModel.id, true)) setDialog(null); }}>确认{dialog.kind === 'publish' ? '上架' : '下架'}</Button></div>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>)}</div>;
}
function ModelSupplierDrawer({ state, model, ops, tab, onTabChange, close, act, connect }) {
  const supplies = modelSupplies(state, model.id);
  const records = state.audits.filter(item => item.objectId === model.id).slice(0, 100);
  return <Modal wide drawer title={model.name + ' · 供应商与售价'} description={'模型编码：' + modelCode(model)} onClose={close}>
    <div className="mo-model-supplier-workspace">
      <div className="mo-model-drawer-actions"><Status good={listed(model)}>{listed(model) ? '已上架' : '已下架'}</Status><Button variant="outline" disabled={!ops.can} onClick={() => act('scope')}>订购范围</Button><Button variant="outline" disabled={!ops.can || !supplies.length} onClick={() => act('reprice')}>目录价设置</Button><Button disabled={!ops.can} onClick={connect}><Plus data-icon="inline-start"/>接入供应商</Button></div>
      <Tabs value={tab} onValueChange={onTabChange} className="mo-detail-tabs"><TabsList variant="line" aria-label="模型设置">{Object.entries(tabs).map(([key, label]) => <TabsTrigger key={key} value={key}>{label}</TabsTrigger>)}</TabsList></Tabs>
      {tab === 'supplies' ? <ProviderComparison state={state} model={model} ops={ops} onAction={act}/> : <GridTable headings={['时间', '操作人', '操作', '结果']} empty={!records.length} emptyMessage="暂无操作记录">{records.map(item => <Row key={item.id}><Cell>{displayTime(item.createdAt)}</Cell><Cell>{item.actor}</Cell><Cell>{item.action}</Cell><Cell>{item.result}</Cell></Row>)}</GridTable>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </div>
  </Modal>;
}
function ScopeDialog({ state, model, ops, close, saved }) { const [value,setValue] = useState({ openScope:model.openScope, tenantIds:model.tenantIds || [] }); return <Modal title="订购范围" description="设置允许新增订购的租户，已有权益记录保留。" onClose={close}><ScopeFields state={state} {...value} disabled={!ops.can} onChange={(openScope,tenantIds) => { setValue({openScope,tenantIds}); ops.dirty(true); }}/><div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can} onClick={() => { if (ops.run('scope',value,model.id,true)) saved(); }}>保存范围</Button></div>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>; }
