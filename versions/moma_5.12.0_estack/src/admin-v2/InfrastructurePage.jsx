import { Fragment, Suspense, lazy, useEffect, useId, useRef, useState } from 'react';
import { Banner, Button, Card, Checkbox, Empty, Input, InputNumber, Select, Space, Switch, Tabs, TextArea, Toast, Typography } from './xa24/HaloUI.jsx';
import { Collapse } from './xa24/HaloUI.jsx';
import { IconArrowDown, IconArrowUp, IconPlus, IconRefresh, IconSearch } from './xa24/HaloIcons.jsx';
import AdminDescriptions from './AdminDescriptions';
import AdminCollapsePanel from './AdminCollapsePanel';
import AdminActionMenu from './AdminActionMenu';
import { AdminModal, AdminSideSheet } from './AdminOverlay';
import AdminPageHeading from './AdminPageHeading';
import AdminStatus from './AdminStatus';
import AdminTable, { AdminPagination } from './AdminTable';
import { MODEL_SERVICE_VIEWS } from './ModelServiceViews';
import { RESOURCE_VIEWS } from './ResourceViews';
import { serviceOperationsUi } from './ServiceUI';
import { useChannelText } from './channel-language';
import TableFieldHelp from '../components/TableFieldHelp';
import { resourceId } from '../resource-id.mjs';
import { deployableModels } from './deployments';
import { canMutate } from './state-transaction';
import { isInfrastructurePage } from './navigation.mjs';
import { changeInfrastructure, INFRASTRUCTURE_STORAGE, infrastructurePages, readInfrastructure } from './infrastructure-state';
import { readInferenceDemoInfrastructure } from './inference-demo-infrastructure.js';
import './infrastructure.css';

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const timestamp = new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Shanghai',
});
const blank = value => value == null || value === '' || Array.isArray(value) && !value.length;
const shown = (field, draft, records, row) => !field.visible || field.visible(draft, records, row);
const disabled = (field, draft, row, records) => Boolean(row && field.editable === false ||
  (typeof field.disabled === 'function' ? field.disabled(draft, row, records) : field.disabled));
const allowed = (rule, row, records) => typeof rule === 'function' ? rule(row, records) : rule !== false;
const labelOf = (row) => row.displayName || row.name;
const normalized = value => typeof value === 'string' ? value.trim() : value;
const emptyRecords = Object.fromEntries(Object.keys(infrastructurePages).map(id => [id, []]));
const views = { ...MODEL_SERVICE_VIEWS, ...RESOURCE_VIEWS };
const changesInfrastructure = action => Boolean(action.apply || action.editor || action.deployModelFile ||
  action.panel === 'delete' || action.target?.mode === 'create');
const ModelFileDeploymentDrawer = lazy(() => import('./DeploymentManagement').then(module => ({ default:module.ModelFileDeploymentDrawer })));

function scrollTableWithArrowKeys(event) {
  if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const body = event.currentTarget.querySelector('.xa24-table-scroll');
  if (!body || body.scrollWidth <= body.clientWidth) return;
  event.preventDefault();
  body.scrollBy({ left: event.key === 'ArrowLeft' ? -40 : 40 });
}

function readSource(inferenceDemo) {
  try { return inferenceDemo ? readInferenceDemoInfrastructure() : readInfrastructure(); }
  catch { return null; }
}

function getOptions(options, records, draft, row) {
  const list = typeof options === 'function' ? options(records, draft, row) : options;
  return (list ?? []).map(option => typeof option === 'object' ? option : { value: option, label: option });
}

function display(column, row, records) {
  const raw = row[column.key];
  const value = column.format ? column.format(raw, row, records) : raw;
  if (blank(value)) return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  return Array.isArray(value) ? value.join('、') : value;
}

function filterMatch(option, recordValue) {
  if (Array.isArray(option)) return option.some(value => filterMatch(value, recordValue));
  return Array.isArray(recordValue) ? recordValue.includes(option) : recordValue === option;
}

function initialDraft(page, row, records, params) {
  const search = params instanceof URLSearchParams ? params : undefined;
  return Object.fromEntries((page.fields ?? []).map(field => {
    const preset = search ? (field.multiple ? search.getAll(field.key) : search.get(field.key)) : params?.[field.key];
    const initial = typeof field.defaultValue === 'function' ? field.defaultValue(records, search, row) : field.defaultValue;
    const value = blank(preset) ? undefined : field.multiple && !Array.isArray(preset) ? [preset] : preset;
    const previous = row?.[field.key];
    return [field.key, value ?? previous ?? initial ?? (field.multiple ? [] : field.type === 'switch' ? false : '')];
  }));
}

function prepareFields(page, draft, records, row, t) {
  const values = {};
  for (const field of page.fields) {
    if (!shown(field, draft, records, row)) continue;
    const { key, type, label, min, max, required, options } = field;
    const value = normalized(draft[key]);
    if (row && disabled(field, draft, row, records)) {
      values[key] = row[key];
      continue;
    }
    if (blank(value)) {
      if (required) throw Error(t('请填写') + t(label));
      values[key] = value;
      continue;
    }
    const number = Number(value);
    if (type === 'number' && (!Number.isFinite(number) || number < (min ?? -Infinity) ||
        number > (max ?? Infinity) || field.step === 1 && !Number.isInteger(number))) {
      throw Error(t(label) + t('超出允许范围'));
    }
    if (type === 'select') {
      const candidates = getOptions(options, records, draft, row);
      const selected = Array.isArray(value) ? value : [value];
      if (!selected.every(item => candidates.some(candidate => String(candidate.value) === String(item) && !candidate.disabled))) {
        throw Error(t('请重新选择') + t(label));
      }
    }
    values[key] = type === 'number' ? number : value;
  }
  const issue = page.validate?.(values, records, row);
  if (issue) throw Error(t(issue));
  return { ...values, ...page.save?.(values, records, row) };
}

function InfrastructureField({ field, value, draft, row, records, onChange, t, Fields }) {
  const id = useId();
  const label = t(field.label);
  const common = {
    id,
    disabled: disabled(field, draft, row, records),
    'aria-labelledby': id + '-label',
    'aria-required': Boolean(field.required),
    'aria-describedby': field.help ? id + '-help' : undefined,
  };
  const placeholder = field.placeholder ? t(field.placeholder) : undefined;
  const Custom = Fields?.[field.type];
  if (field.type === 'checkbox') return <div className="infra-field infra-field-wide">
    <Checkbox disabled={common.disabled} checked={Boolean(value)} onChange={event => onChange(event.target.checked)}>{label}</Checkbox>
    {field.help && <Typography.Text type="tertiary" size="small">{t(field.help)}</Typography.Text>}
  </div>;
  let control;
  if (Custom) {
    control = <Custom {...common} field={field} value={value} onChange={onChange}
      draft={draft} row={row} records={records} t={t}/>;
  } else if (field.type === 'select') {
    const options = getOptions(field.options, records, draft, row);
    control = <Select {...common} placeholder={placeholder || t('请选择')}
      value={value === '' ? undefined : value} multiple={field.multiple} showClear={!field.required} filter
      optionList={options.map(option => ({ ...option, label: t(option.label) }))} onChange={next => onChange(next ?? (field.multiple ? [] : ''))}/>;
  } else if (field.type === 'switch') {
    control = <Switch {...common} checked={Boolean(value)} onChange={onChange}/>;
  } else if (field.type === 'number') {
    control = <InputNumber {...common} value={value} placeholder={placeholder} min={field.min} max={field.max}
      step={field.step} onChange={onChange}/>;
  } else if (field.type === 'textarea') {
    control = <TextArea {...common} rows={4} value={value} placeholder={placeholder} onChange={onChange}/>;
  } else {
    control = <Input {...common} value={value} placeholder={placeholder} autoComplete="off" onChange={onChange}/>;
  }
  return <div className={`infra-field${field.type === 'textarea' || field.fullWidth ? ' infra-field-wide' : ''}`}>
    <label htmlFor={id} id={id + '-label'}>{label}{field.required && <span aria-hidden="true" className="infra-required"> *</span>}</label>
    {control}
    {field.help && <Typography.Text id={id + '-help'} type="tertiary" size="small">{t(field.help)}</Typography.Text>}
  </div>;
}

function InfrastructureForm({ page, row, records, preset, t, onSave, onClose, previous, wasDirty = false, dirtyRef, busy, Fields, FormNotice }) {
  const id = useId();
  const [draft, setDraft] = useState(() => initialDraft(page, row, records, preset));
  const [error, setError] = useState('');
  const errorSummary = useRef(null);
  const [discard, setDiscard] = useState(false);
  const [changed, setChanged] = useState(wasDirty);
  useEffect(() => { if (error) errorSummary.current?.focus(); }, [error]);
  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    setError('');
    try { await onSave(draft); }
    catch (issue) { setError(issue.message); }
  };
  const close = () => {
    if (busy) return;
    if (changed) setDiscard(true);
    else onClose();
  };
  const groups = new Map();
  for (const field of page.fields) {
    if (!shown(field, draft, records, row)) continue;
    const group = field.group ?? '';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(field);
  }
  const renderGroup = (group, fields) => <section className="infra-fields" key={group} aria-label={group ? t(group) : undefined}>
    {group && !page.collapsibleGroups?.includes(group) && <Typography.Title heading={5} component="h3">{t(group)}</Typography.Title>}
    {fields.map(field => <InfrastructureField key={field.key} field={field} row={row}
      value={draft[field.key]} draft={draft} records={records} t={t} Fields={Fields}
      onChange={value => {
        setDraft(current => ({ ...current, [field.key]: value, ...page.onFieldChange?.(current, field.key, value, records, row) }));
        setChanged(true);
        dirtyRef.current = true;
        setError('');
      }}/>)}
  </section>;
  return <>
    <AdminSideSheet title={t(page.editorTitle ?? (row ? `编辑${page.title}` : page.createLabel ?? `添加${page.title}`))} visible
      className="infra-sheet" width="min(620px, 100vw)" onCancel={close} closeOnEsc={!discard && !busy}
      footer={<>
        {previous && <Button disabled={busy} onClick={() => previous(draft, changed)}>{t('上一步')}</Button>}
        <Button disabled={busy} onClick={close}>{t('取消')}</Button>
        <Button type="primary" theme="solid" htmlType="submit" form={id} loading={busy}>
          {t((typeof page.submitLabel==='function' ? page.submitLabel(draft,records,row) : page.submitLabel) || '保存')}
        </Button>
      </>}>
      <form className="infra-form" id={id} onSubmit={submit}>
        {error && <div ref={errorSummary} tabIndex={-1}><Banner type="danger" closeIcon={null} description={error}/></div>}
        {[...groups].map(([group, fields]) => page.collapsibleGroups?.includes(group) ?
          <Collapse key={group} keepDOM><AdminCollapsePanel itemKey={group} header={t(group)}>{renderGroup(group, fields)}</AdminCollapsePanel></Collapse> :
          renderGroup(group, fields))}
        {FormNotice && <FormNotice draft={draft} row={row} records={records}/>}
      </form>
    </AdminSideSheet>
    {discard && serviceOperationsUi.renderLeaveDialog({ cancel: () => setDiscard(false), discard: onClose })}
  </>;
}

function saveFile({ name, content, type }) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function InfrastructurePage({ pageId, state, params, navigate, dirtyRef, dispatch, conflict,
  inferenceDemo = false, interactiveDemo = false, demoInfrastructure, changeDemoInfrastructure }) {
  const t = useChannelText();
  const headingId = useId();
  const page = infrastructurePages[pageId];
  const keepActionsVisible = isInfrastructurePage(pageId);
  const columnsKey = INFRASTRUCTURE_STORAGE + ':columns:' + pageId;
  const { Header, Detail, Extra, ExpandedRow, Fields, Cells, FormNotice, Card: CardView, Editor, Empty: EmptyView, afterCreate } = views[pageId] ?? {};
  const practiceNodes = interactiveDemo && pageId === 'ops-nodes' && Boolean(changeDemoInfrastructure) &&
    canMutate(state.currentRole, { type: 'update', collection: 'clusters' });
  const readOnlyDemo = inferenceDemo && !practiceNodes;
  const [savedSource, setSource] = useState(() => interactiveDemo ? null : readSource(inferenceDemo));
  const source = interactiveDemo ? demoInfrastructure : savedSource;
  const [storageError, setStorageError] = useState('');
  const [keyword, setKeyword] = useState(params.get('q') ?? '');
  const [filters, setFilters] = useState(() => {
    const deploymentBenchmark = pageId === 'ops-benchmarks' && params.get('view') === 'create' && params.has('targetId');
    return Object.fromEntries((page.filters ?? []).flatMap(({ key, multiple }) => {
      if (!params.has(key) || deploymentBenchmark && ['clusterId', 'targetMode'].includes(key)) return [];
      return [[key, multiple ? params.getAll(key) : params.get(key)]];
    }));
  });
  const [tab, setTab] = useState(0);
  const [sort, setSort] = useState(null);
  const isCatalogue = pageId==='ops-model-library';
  const [currentPage, setCurrentPage] = useState(()=>{
    const page = isCatalogue ? Number(params.get('catalogPage')) : 1;
    return Number.isSafeInteger(page) && page>0 ? page : 1;
  });
  const catalogueTop = useRef(isCatalogue && params.has('catalogTop') ? Number(params.get('catalogTop')) : null);
  const catalogueFocus = useRef(isCatalogue ? params.get('catalogFocus') : null);
  const [pageSize, setPageSize] = useState(page.initialPageSize ?? 10);
  const [editor, setEditor] = useState(() => !readOnlyDemo && params.get('view') === 'create' && page.fields?.length ? { preset: params } : null);
  const [fileDeployment, setFileDeployment] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(() => page.views?.includes(params.get('layout')) ? params.get('layout') : page.views?.[0] ?? 'table');
  const [selected, setSelected] = useState([]);
  const [hidden, setHidden] = useState(() => {
    const defaults = page.defaultHiddenColumns ?? [];
    if (inferenceDemo) return defaults;
    try {
      const stored = JSON.parse(localStorage.getItem(columnsKey));
      return Array.isArray(stored) ? stored : defaults;
    } catch { return defaults; }
  });
  const [showColumns, setShowColumns] = useState(false);
  const [draftHidden, setDraftHidden] = useState([]);
  const [expanded, setExpanded] = useState([]);
  const pending = useRef(false);
  const loadMarker = useRef(null);

  const refresh = () => {
    if (interactiveDemo) return Boolean(demoInfrastructure);
    try {
      setSource(inferenceDemo ? readInferenceDemoInfrastructure() : readInfrastructure());
      setStorageError('');
      return true;
    } catch {
      setStorageError('无法读取运维演示数据。请刷新后重试。');
      return false;
    }
  };
  useEffect(() => {
    refresh();
    const sync = event => {
      if (event.key == null || event.key === INFRASTRUCTURE_STORAGE) refresh();
    };
    if (!inferenceDemo) window.addEventListener('storage', sync);
    return () => { window.removeEventListener('storage', sync); dirtyRef.current = false; };
  }, [dirtyRef, inferenceDemo, interactiveDemo]);

  const shared = {
    clusters: state.clusters, deployments: state.deployments.filter(row => !row.retiredAt),
    routes: state.routes, endpoints: state.endpoints,
    deployableModels: deployableModels(state),
    actorRole: state.currentRole,
    actorName: state.admins.find(account => account.id === state.adminSession?.accountId)?.name,
  };
  const records = { ...shared, ...(source ?? emptyRecords) };
  const rows = records[pageId] ?? [];
  const tabs = page.tabs ?? [];
  const activeTab = tabs[tab];
  const query = keyword.trim().toLocaleLowerCase();
  const hasFilters = Boolean(query || Object.values(filters).some(value => !blank(value)));
  const candidates = page.searchRows ? page.searchRows(rows, query) : rows;
  const filtered = candidates.filter(row => {
    if (page.showRow && !page.showRow(row, records)) return false;
    if (activeTab?.key && !filterMatch(activeTab.value, row[activeTab.key])) return false;
    if (!(page.filters ?? []).every(({ key, match }) => blank(filters[key]) ||
        (match ? match(filters[key], row, records) : filterMatch(filters[key], row[key])))) return false;
    if (page.searchRows || !query) return true;
    const searchKeys = page.searchKeys ?? ['name', 'displayName'];
    const searchable = page.searchMatches ? page.searchMatches(row, query, records) :
      [row.id, ...searchKeys.map(key => row[key])].some(value => String(value ?? '').toLocaleLowerCase().includes(query));
    return searchable;
  });
  if (sort) {
    const field = page.columns.find(column => column.key === sort.key);
    const sortValue = row => field.sortValue ? field.sortValue(row, records) : field.key === 'name' ? display(field, row, records) : row[field.key];
    filtered.sort((left, right) => {
      const a = sortValue(left), b = sortValue(right);
      return sort.direction * (typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a ?? ''), String(b ?? '')));
    });
  }
  const pageNumber = Math.max(1, Math.min(currentPage, Math.ceil(filtered.length / pageSize)));
  const displayed = view === 'cards' && page.loadMore ? filtered.slice(0, pageSize * currentPage) : filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
  useEffect(()=>{
    const top = catalogueTop.current;
    if (!source || top==null || !Number.isSafeInteger(top) || top<0) return undefined;
    const frame = requestAnimationFrame(()=>{
      const focusId = catalogueFocus.current;
      if (focusId?.startsWith('model-catalogue-')) document.getElementById(focusId)?.focus({preventScroll:true});
      window.scrollTo({top,behavior:'instant'});
      catalogueTop.current=null;
      catalogueFocus.current=null;
    });
    return ()=>cancelAnimationFrame(frame);
  },[source,displayed.length]);
  const canLoadMore = view === 'cards' && page.loadMore && displayed.length < filtered.length;
  const loadOnScroll = canLoadMore && page.loadOnScroll && typeof IntersectionObserver !== 'undefined';
  useEffect(() => {
    if (!loadOnScroll || !loadMarker.current) return undefined;
    const marker = loadMarker.current;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.unobserve(marker);
      setCurrentPage(page => page + 1);
    });
    observer.observe(marker);
    return () => observer.disconnect();
  }, [loadOnScroll, currentPage]);
  const standalone = params.get('view') === 'detail' && params.has('record');
  const detailContext = standalone ? { id: params.get('record'), panel: params.get('panel') } : detail;
  const selectedDetail = inferenceDemo && detailContext?.panel === 'delete' ? undefined : rows.find(row => row.id === detailContext?.id);
  const selectedRows = rows.filter(row => selected.includes(row.id));
  const writable = !readOnlyDemo && Boolean(source && !storageError);
  const canDeployFile = writable && !conflict && !state.storageError && canMutate(state.currentRole,{type:'deploymentOperation'});

  const listQuery = () => {
    const query = new URLSearchParams();
    if (keyword) query.set('q', keyword);
    if (page.views?.length > 1) query.set('layout', view);
    Object.entries(filters).forEach(([key, value]) => {
      if (!blank(value)) (Array.isArray(value) ? value : [value]).forEach(item => query.append(key, item));
    });
    if (isCatalogue) {
      query.set('catalogPage',String(currentPage));
      query.set('catalogTop',String(Math.max(0,Math.round(window.scrollY))));
    }
    return query;
  };
  const openDetail = (row, settings = {}) => {
    const options = typeof settings === 'string' ? { panel: settings } : settings;
    if (page.detailRoute && !options.fields && !options.sheet) {
      const query = listQuery();
      query.set('view', 'detail');
      query.set('record', row.id);
      if (options.panel) query.set('panel', options.panel);
      navigate(pageId + '?' + query);
    } else setDetail({ id: row.id, ...options, label: options.label ?? options.title });
  };
  const closeDetail = () => {
    if (!standalone) setDetail(null);
    else {
      const query = listQuery();
      navigate(pageId + (query.size ? '?' + query : ''));
    }
  };
  const openEditor = (options = {}) => {
    if (!readOnlyDemo) setEditor(options);
  };
  const closeEditor = () => {
    dirtyRef.current = false;
    setEditor(null);
    if (params.get('view') === 'create') {
      const query = listQuery();
      navigate(pageId + (query.size ? '?' + query : ''));
    }
  };
  const commit = async (change, message) => {
    if (!writable || pending.current) throw Error(t('保存暂不可用，请重试。'));
    pending.current = true;
    setBusy(true);
    try {
      const update = inferenceDemo ? changeDemoInfrastructure : changeInfrastructure;
      const next = await update(pageId, (latest, local, modelSource) => change(latest, { ...shared, ...local }, modelSource));
      if (!inferenceDemo) setSource(next);
      if (message) Toast.success(t(message));
      return next;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const editorPage = editor?.action
    ? { ...page, ...editor.action.editor, editorTitle: editor.title ?? editor.action.editor.title,
        validate: editor.action.editor.validate, save: editor.action.editor.save }
    : { ...page, editorTitle: editor?.title };
  const save = async draft => {
    let createdRow;
    await commit((latest, all) => {
      const previous = editor.row && latest.find(row => row.id === editor.row.id);
      const editRule = editor.action ? editor.action.when : editorPage.editable;
      if (editor.row && (JSON.stringify(previous) !== JSON.stringify(editor.row) ||
          !allowed(editRule, previous, all))) {
        throw Error(t('此记录已在其他页面更新，请关闭表单后重新编辑。'));
      }
      const patch = prepareFields(editorPage, draft, all, previous, t);
      const uniqueBy = editorPage.uniqueBy ?? ['name'];
      if (uniqueBy.length && uniqueBy.every(key => !blank(patch[key] ?? previous?.[key])) &&
          latest.some(row => row.id !== previous?.id && uniqueBy.every(key => collator.compare(String(row[key]), String(patch[key] ?? previous?.[key])) === 0))) {
        throw Error(t('同名记录已存在。'));
      }
      const now = timestamp.format(new Date());
      const next = previous
        ? { ...previous, ...patch, id: previous.id, updatedAt: now }
        : { status: '可用', createdAt: now, ...patch, id: resourceId(pageId) };
      if (!previous) createdRow = next;
      return previous ? latest.map(row => row.id === previous.id ? next : row) : [next, ...latest];
    }, '已保存');
    closeEditor();
    if (afterCreate && createdRow) {
      try { await afterCreate({ row: createdRow, params, dispatch, records, navigate }); }
      catch (issue) { Toast.error(issue.message); }
    }
  };
  const closeFileDeployment = () => {
    const { opener, left, top } = fileDeployment;
    dirtyRef.current=false;
    setFileDeployment(null);
    requestAnimationFrame(()=>{
      if (opener?.isConnected) opener.focus({preventScroll:true});
      window.scrollTo({left,top,behavior:'instant'});
    });
  };
  const runAction = (action, row, opener) => {
    if (readOnlyDemo && changesInfrastructure(action)) return;
    if (action.deployModelFile) {
      if (canDeployFile) setFileDeployment({ id:row.id, opener, left:window.scrollX, top:window.scrollY });
      return;
    }
    if (action.target) {
      const { page: target, field } = action.target;
      const query = new URLSearchParams();
      if (field) query.set(field, action.value?.(row, records) ?? row.id);
      navigate(target + (query.size ? '?' + query : ''));
      return;
    }
    if (action.download) {
      try { saveFile(action.download(row, records)); }
      catch (issue) { Toast.error(issue.message); }
      return;
    }
    if (action.editor) {
      const { editor: config } = action;
      openEditor({ row: config.create ? undefined : row, action, preset: config.prefill?.(row, records) });
      return;
    }
    if (action.detail || action.panel) {
      openDetail(row, { fields: action.detail, panel: action.panel, label: action.label, sheet: action.sheet });
      return;
    }
    if (action.confirm === false) void execute({ action, row });
    else setConfirmation({ action, row });
  };
  const execute = async ({ row, action, batch }) => {
    try {
      await commit((latest, all) => {
        if (batch) {
          const current = latest.filter(item => batch.some(record => item.id === record.id));
          if (current.length !== batch.length || current.some(item => JSON.stringify(item) !== JSON.stringify(batch.find(row => row.id === item.id))) ||
              action.when && !action.when(current, all)) throw Error(t('选中的记录已更新，请重新选择。'));
          const updated = action.apply(current, all);
          const byId = new Map(updated.map(item => [item.id, item]));
          const rows = latest.flatMap(item => current.some(row => row.id === item.id) ? (byId.has(item.id) ? [byId.get(item.id)] : []) : [item]);
          return action.related ? { rows, related: action.related(current, all) } : rows;
        }
        const current = latest.find(item => item.id === row.id);
        if (JSON.stringify(current) !== JSON.stringify(row) || action?.when && !action.when(current, all)) {
          throw Error(t('此记录已更新，请核对后重试。'));
        }
        if (!action) {
          const reason = page.canDelete?.(current, all);
          if (!allowed(page.deletable, current, all) || reason) throw Error(t(reason || '此记录无法删除'));
          const rows = latest.filter(item => item.id !== row.id);
          return page.deleteRelated ? { rows, related: page.deleteRelated(current, all) } : rows;
        }
        const patch = action.apply(current, all);
        const rows = latest.map(item => item.id === row.id ? {
          ...item, ...patch, id: row.id, updatedAt: timestamp.format(new Date()),
        } : item);
        return action.related ? { rows, related: action.related(current, all) } : rows;
      }, action ? '操作已完成' : '已删除');
      setConfirmation(null);
      if (!action && detailContext?.id === row?.id) closeDetail();
      if (batch) setSelected([]);
    } catch (issue) { Toast.error(issue.message); }
  };

  const hasNameColumn = page.columns.some(column => column.key === 'name');
  const renderActions = (row, { allowEdit = true, panelActions = {} } = {}) => {
    const items = [];
    if (!hasNameColumn && page.showDetailsAction !== false) items.push({ key: 'details', name: t('详情'), onClick: () => openDetail(row) });
    const editingAllowed = allowed(page.editable, row, records);
    if (allowEdit && page.fields?.length && page.editable && (keepActionsVisible || !inferenceDemo && editingAllowed)) {
      items.push({ key: 'edit', name: t('编辑'), disabled: !writable || !editingAllowed, onClick: () => openEditor({ row }) });
    }
    let hasDeleteAction = false;
    for (const action of page.actions ?? []) {
      if (!allowed(action.visible, row, records)) continue;
      const actionAllowed = allowed(action.when, row, records);
      if (!keepActionsVisible && (!actionAllowed || inferenceDemo && changesInfrastructure(action))) continue;
      if (action.label === '删除') hasDeleteAction = true;
      const changesRecord = keepActionsVisible ? changesInfrastructure(action) : Boolean(action.apply || action.editor);
      items.push({ key: action.label, name: t(action.label), type: action.danger ? 'danger' : undefined,
        disabled: !actionAllowed || action.deployModelFile && !canDeployFile || !writable && changesRecord ||
          Boolean(typeof action.disabled === 'function' ? action.disabled(row, records) : action.disabled),
        onClick: opener => panelActions[action.panel] ? panelActions[action.panel]() : runAction(action, row, opener) });
    }
    const deletingAllowed = allowed(page.deletable, row, records);
    if (page.deletable && (keepActionsVisible ? !hasDeleteAction : !inferenceDemo && deletingAllowed)) {
      items.push({ key: 'delete', name: t('删除'), type: 'danger', disabled: !writable || !deletingAllowed, onClick: () => {
        const reason = page.canDelete?.(row, records);
        if (reason) Toast.warning(t(reason));
        else setConfirmation({ row });
      } });
    }
    if (!items.length) return null;
    return page.actionMenu || keepActionsVisible ? <AdminActionMenu label={`${labelOf(row)} ${t('操作')}`}
      items={items.map(item=>({node:'item',...item}))}>{keepActionsVisible ? t('操作') : undefined}</AdminActionMenu> : <Space wrap spacing={4}>
      {items.map(({ key, name, ...props }) => <Button key={key} theme="borderless" size="small" {...props}>{name}</Button>)}
    </Space>;
  };
  const columns = page.columns.filter(column => !hidden.includes(column.key) || column.key === 'name').map(column => {
    const sorted = sort?.key === column.key;
    const sortIcon = sorted && (sort.direction === 1 ? <IconArrowUp aria-hidden="true"/> : <IconArrowDown aria-hidden="true"/>);
    return {
      dataIndex: column.key,
      title: column.sorter || column.tip ? <TableFieldHelp name={column.label} description={column.tip}
        sortIcon={sortIcon || undefined} onSort={column.sorter ? () => {
          setSort({ key: column.key, direction: sorted ? -sort.direction : 1 });
          setCurrentPage(1);
        } : undefined}/> : column.label,
      onHeaderCell: () => ({ scope: 'col', 'aria-sort': sorted ? sort.direction === 1 ? 'ascending' : 'descending' : undefined }),
      width: column.width,
      align: column.align,
      render: (_, row) => {
        const Custom = Cells?.[column.key];
        if (Custom) return <Custom row={row} column={column} records={records} openDetail={openDetail} t={t}
          setFilter={(key, value) => {
            setFilters(previous => ({ ...previous, [key]: typeof value === 'function' ? value(previous[key]) : value }));
            setCurrentPage(1);
          }}/>;
        const content = display(column, row, records);
        if (column.status) return <AdminStatus value={content}
          color={typeof column.color === 'function' ? column.color(content, row) : column.color}/>;
        if (column.key !== 'name') return content;
        return <div className="admin-table-record">
          <Button theme="borderless" size="small" onClick={() => openDetail(row)}>{content}</Button>
          {column.secondaryKey && !blank(row[column.secondaryKey]) &&
            <Typography.Text type="tertiary" size="small">{row[column.secondaryKey]}</Typography.Text>}
        </div>;
      },
    };
  });
  if (page.actions?.length || page.editable && page.fields?.length || page.deletable || !hasNameColumn) {
    columns.push({ key: 'actions', title: '操作', width: keepActionsVisible ? 88 : page.actionWidth ?? 178,
      fixed: keepActionsVisible ? 'right' : undefined, render: (_, row) => renderActions(row) });
  }
  const selectable = (!inferenceDemo || keepActionsVisible) && (page.rowSelection || page.batchActions?.length > 0);
  const rowSelection = selectable ? { selectedRowKeys: selected, onChange: setSelected,
    getCheckboxProps: row => ({ disabled: !allowed(page.rowSelection, row, records) }) } : undefined;
  const tableWidth = page.tableWidth ?? columns.reduce((width, column) => width + (column.width ?? 106), selectable ? 42 : 0);
  const info = detailContext?.fields ?? page.detail ?? page.columns;
  const widgetProps = { pageId, page, records, rows, filtered, selectedRows, clearSelection: () => setSelected([]), params, navigate, listQuery, commit, refresh, openDetail, openEditor, closeEditor, dispatch: readOnlyDemo ? undefined : dispatch, t, busy: busy || readOnlyDemo, inferenceDemo, interactiveDemo, writable };
  const renderDetail = selectedDetail && (Detail && !detailContext?.fields ?
    <Detail {...widgetProps} detail={detailContext} row={selectedDetail} panel={detailContext.panel} close={closeDetail} standalone={standalone}
      renderActions={renderActions}/> :
    <AdminDescriptions align="left" data={info.map(column => ({
      key: t(column.label), value: column.status ? <AdminStatus value={display(column, selectedDetail, records)}/> :
        <Typography.Text className="infra-detail-value" copyable={column.copyable}>{display(column, selectedDetail, records)}</Typography.Text>,
    }))}/>);
  const runBatch = action => {
    if (!selectedRows.length || readOnlyDemo && !action.download || action.when && !action.when(selectedRows, records)) return;
    if (action.download) {
      try { saveFile(action.download(selectedRows, records, page.columns.filter(column => !hidden.includes(column.key)))); }
      catch (issue) { Toast.error(issue.message); }
    } else if (action.confirm === false) void execute({ action, batch: selectedRows });
    else setConfirmation({ action, batch: selectedRows });
  };
  const action = confirmation?.action;
  const rowOrBatch = confirmation?.batch ?? confirmation?.row;
  const confirmText = typeof action?.confirm === 'function' ? action.confirm(rowOrBatch, records)
    : action?.confirm || (confirmation?.batch ? `对选中的 ${confirmation.batch.length} 条记录执行${action.label}？`
      : action ? `对「${labelOf(confirmation.row)}」执行${action.label}？` : confirmation
        ? `删除「${labelOf(confirmation.row)}」？` : '');
  const pageActions = <Space wrap>
    {Header && (!inferenceDemo || keepActionsVisible) && <Header {...widgetProps}/>}
    {page.quickLinks?.map(link => <Button key={link.page} onClick={() => navigate(link.page)}>{t(link.label)}</Button>)}
    {(!inferenceDemo || keepActionsVisible) && page.createLabel && !page.hideCreate && <Button type="primary" theme="solid" icon={<IconPlus/>} disabled={!writable}
      onClick={() => openEditor()}>{t(page.createLabel)}</Button>}
    {page.batchInToolbar && page.batchActions?.map(action => <Button key={action.label} type={action.danger ? 'danger' : 'primary'}
      disabled={!writable || !selectedRows.length || !allowed(action.when, selectedRows, records)}
      onClick={() => runBatch(action)}>{t(action.toolbarLabel || action.label)}{selectedRows.length > 0 && `（${selectedRows.length}）`}</Button>)}
  </Space>;

  return <div className="admin-page-stack infra-page">
    <AdminPageHeading title={<span id={headingId}>{standalone && selectedDetail ? labelOf(selectedDetail) : t(page.title)}</span>}
      description={!standalone && page.description ? t(page.description) : undefined}>
      {standalone ? <Button onClick={closeDetail}>{t('返回列表')}</Button> : !page.actionsInToolbar && pageActions}
    </AdminPageHeading>
    {storageError && <Banner type="danger" closeIcon={null} description={t(storageError)}/>}
    {standalone ? selectedDetail ? renderDetail : <Banner type="warning" closeIcon={null} description={t('记录不存在')}/> : <Card>
      {tabs.length > 0 && <Tabs activeKey={String(tab)} onChange={key => { setTab(Number(key)); setCurrentPage(1); }}>
        {tabs.map((item, index) => <Tabs.TabPane key={item.label} itemKey={String(index)} tab={t(item.label)}/>)}
      </Tabs>}
      <div className="admin-list-toolbar">
        <Input className="admin-list-search" prefix={<IconSearch/>} showClear
          placeholder={t(page.searchPlaceholder ?? '搜索名称或 ID')} aria-label={t(page.searchPlaceholder ?? '搜索名称或 ID')}
          value={keyword} onChange={value => { setKeyword(value); setCurrentPage(1); }}/>
        {page.filters?.map(filter => {
          const labelId = `${headingId}-${filter.key}`;
          return <Fragment key={filter.key}>
            <span className="sr-only" id={labelId}>{t(filter.label)}</span>
            <Select aria-labelledby={labelId} placeholder={t(filter.label)}
              value={filters[filter.key] ?? undefined} multiple={filter.multiple} filter={filter.searchable}
              showClear className="infra-filter"
              optionList={getOptions(filter.options, records, filters).map(item => ({ ...item, label: t(item.label) }))}
              onChange={value => { setFilters(previous => ({ ...previous, [filter.key]: value })); setCurrentPage(1); }}/>
          </Fragment>;
        })}
        {!page.hideResetFilter && <Button theme="borderless" type="tertiary" disabled={!hasFilters}
          onClick={() => { setKeyword(''); setFilters({}); setCurrentPage(1); }}>{t('重置')}</Button>}
        <Button icon={<IconRefresh/>} theme="borderless" type="tertiary" aria-label={t('刷新')}
          onClick={() => { refresh(); if (page.loadOnScroll) setCurrentPage(1); }}/>
        {page.views?.length > 1 && <Space>
          {page.views.map(item => <Button key={item} aria-pressed={item === view} type={item === view ? 'primary' : 'tertiary'}
            theme={item === view ? 'light' : 'borderless'} onClick={() => { setView(item); setCurrentPage(1); }}>
            {t(item === 'cards' ? '卡片视图' : '列表视图')}
          </Button>)}
        </Space>}
        {page.columnSettings && view === 'table' && <Button theme="borderless" onClick={() => { setDraftHidden(hidden); setShowColumns(true); }}>
          {t('列设置')}
        </Button>}
        {ExpandedRow && !page.hideExpandAll && view === 'table' && displayed.length > 0 && <Button theme="borderless"
          onClick={() => setExpanded(expanded.length ? [] : displayed.map(row => row.id))}>
          {t(expanded.length ? '全部收起' : '全部展开')}
        </Button>}
        {page.actionsInToolbar && <div className="infra-toolbar-actions">{pageActions}</div>}
      </div>
      {Extra && (!inferenceDemo || keepActionsVisible) && <Extra {...widgetProps}/>}
      {(selectedRows.length > 0 || keepActionsVisible && page.batchActions?.length > 0) && !page.batchInToolbar && !page.hideSelectionSummary && <Space wrap className="infra-batch-actions">
        {selectedRows.length > 0 && <Typography.Text>{`已选 ${selectedRows.length} 条`}</Typography.Text>}
        {page.batchActions?.map(action => <Button key={action.label} type={action.danger ? 'danger' : 'primary'}
          disabled={!selectedRows.length || (!writable && !(inferenceDemo && action.download)) || !allowed(action.when, selectedRows, records)} onClick={() => runBatch(action)}>{t(action.label)}</Button>)}
        {selectedRows.length > 0 && <Button theme="borderless" onClick={() => setSelected([])}>{t('清空选择')}</Button>}
      </Space>}
      {view === 'cards' ? displayed.length > 0 ? <div className="infra-card-grid">
        {displayed.map(row => CardView ? <CardView key={row.id} {...widgetProps} row={row} actions={renderActions(row)}/> :
          <Card key={row.id} title={<Button theme="borderless" onClick={() => openDetail(row)}>{labelOf(row)}</Button>}
            footer={renderActions(row)}>
            <AdminDescriptions data={(page.cardColumns ?? page.columns.filter(column => column.key !== 'name').slice(0, 4))
              .map(column => ({ key: column.label, value: display(column, row, records) }))}/>
          </Card>)}
      </div> : EmptyView ? <EmptyView {...widgetProps} hasFilters={hasFilters}/> : <Empty description={t('没有符合条件的记录')}/> :
      <div className="infra-table-scroll" role="region" aria-labelledby={headingId} tabIndex={0}
        onKeyDown={keepActionsVisible ? scrollTableWithArrowKeys : undefined}>
        <div style={keepActionsVisible ? undefined : { minWidth: tableWidth }}>
          <AdminTable aria-labelledby={headingId} columns={columns} dataSource={displayed}
            scroll={keepActionsVisible ? { x: `max(100%, ${tableWidth}px)` } : undefined}
            rowSelection={rowSelection}
            expandedRowRender={ExpandedRow ? row => <ExpandedRow {...widgetProps} row={row}/> : undefined}
            expandedRowKeys={ExpandedRow ? expanded : undefined}
            onExpandedRowsChange={ExpandedRow ? rows=>setExpanded((rows ?? []).map(row=>row.id)) : undefined}
            pagination={false} rowKey="id" empty={hasFilters ? '没有符合条件的记录' : '暂无数据'}/>
        </div>
      </div>}
      {sort && <div className="sr-only" role="status">
        {t(page.columns.find(column => column.key === sort.key).label)} {t(sort.direction === 1 ? '升序' : '降序')}
      </div>}
      {view === 'cards' && page.loadMore ? canLoadMore && (loadOnScroll ? <div className="infra-load-marker" ref={loadMarker} aria-hidden="true"/> :
        <Button className="infra-load-more" onClick={() => setCurrentPage(currentPage + 1)}>{t('加载更多')}</Button>) :
        <AdminPagination total={filtered.length} currentPage={pageNumber} pageSize={pageSize} showSizeChanger
        pageSizeOpts={[10, 20, 50, 100]} onPageChange={setCurrentPage}
        onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}/>}
    </Card>}
    {selectedDetail && !standalone && (page.detailModal ? <AdminModal visible title={detailContext.label ? t(detailContext.label) : t(page.detailModal)}
      width={page.detailWidth} footer={null} onCancel={closeDetail} closeOnEsc={!editor}>{renderDetail}</AdminModal> :
      <AdminSideSheet title={detailContext.label ? t(detailContext.label) : `${t(page.title)} · ${labelOf(selectedDetail)}`}
      className="infra-sheet" width={page.detailWidth ?? 'min(720px, 100vw)'} visible onCancel={closeDetail} closeOnEsc={!editor}>
      {renderDetail}
    </AdminSideSheet>)}
    {editor && source && !readOnlyDemo && (Editor ? <Editor {...widgetProps} editor={editor} page={editorPage} onSave={save} onClose={closeEditor} dirtyRef={dirtyRef}/> :
      <InfrastructureForm page={editorPage} row={editor.row} records={records} preset={editor.preset}
        Fields={Fields} FormNotice={FormNotice} t={t} onSave={save} onClose={closeEditor}
        previous={editor.previous} wasDirty={editor.changed} dirtyRef={dirtyRef} busy={busy}/>)}
    {fileDeployment && <Suspense fallback={null}>
      <ModelFileDeploymentDrawer fileId={fileDeployment.id} state={state} dispatch={dispatch} can={canDeployFile}
        infrastructure={records} dirtyRef={dirtyRef} onClose={closeFileDeployment} onSaved={id=>{
          dirtyRef.current=false;
          setFileDeployment(null);
          navigate('deployments?' + new URLSearchParams({expanded:id}));
        }}/>
    </Suspense>}
    {showColumns && <AdminModal title={t('列设置')} visible closeOnEsc onCancel={() => setShowColumns(false)}
      okText={t('保存')} onOk={() => {
        try {
          if (!inferenceDemo) localStorage.setItem(columnsKey, JSON.stringify(draftHidden));
          setHidden(draftHidden);
          setShowColumns(false);
        } catch { Toast.error(t('列设置保存失败')); }
      }}>
      <Space vertical align="start">
        {page.columns.filter(column => column.key !== 'name').map(column => <Checkbox key={column.key}
          checked={!draftHidden.includes(column.key)} onChange={event => setDraftHidden(previous =>
            event.target.checked ? previous.filter(key => key !== column.key) : [...previous, column.key])}>{t(column.label)}</Checkbox>)}
        <Button theme="borderless" onClick={() => setDraftHidden(page.defaultHiddenColumns ?? [])}>{t('恢复默认')}</Button>
      </Space>
    </AdminModal>}
    {confirmation && <AdminModal title={t(action?.label ?? '删除记录')} visible closeOnEsc={!busy}
      onCancel={() => { if (!busy) setConfirmation(null); }} confirmLoading={busy}
      okType={!action || action.danger ? 'danger' : 'primary'} okText={t(action?.label ?? '删除')} onOk={() => execute(confirmation)}>
      {t(confirmText)}
    </AdminModal>}
  </div>;
}
