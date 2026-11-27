import { Fragment, Suspense, lazy, useEffect, useId, useRef, useState } from 'react';
import { Banner, Button, Card, Checkbox, Empty, Input, InputNumber, Select, Space, Switch, Tabs, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { IconArrowDown, IconArrowUp, IconPlus, IconRefresh, IconSearch } from '@douyinfe/semi-icons';
import AdminDescriptions from './AdminDescriptions';
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
import { changeInfrastructure, INFRASTRUCTURE_STORAGE, infrastructurePages, readInfrastructure } from './infrastructure-state';
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
const ModelFileDeploymentDrawer = lazy(() => import('./DeploymentManagement').then(module => ({ default:module.ModelFileDeploymentDrawer })));

function readSource() {
  try { return readInfrastructure(); }
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

function InfrastructureForm({ page, row, records, preset, t, onSave, onClose, dirtyRef, busy, Fields }) {
  const id = useId();
  const [draft, setDraft] = useState(() => initialDraft(page, row, records, preset));
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const [changed, setChanged] = useState(false);
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
  return <>
    <AdminSideSheet title={t(page.editorTitle ?? (row ? `编辑${page.title}` : page.createLabel ?? `添加${page.title}`))} visible
      className="infra-sheet" width="min(620px, 100vw)" onCancel={close} closeOnEsc={!discard && !busy}
      footer={<>
        <Button disabled={busy} onClick={close}>{t('取消')}</Button>
        <Button type="primary" theme="solid" htmlType="submit" form={id} loading={busy}>{t('保存')}</Button>
      </>}>
      <form className="infra-form" id={id} onSubmit={submit}>
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
        {[...groups].map(([group, fields]) => <section className="infra-fields" key={group} aria-label={group ? t(group) : undefined}>
          {group && <Typography.Title heading={5} component="h3">{t(group)}</Typography.Title>}
          {fields.map(field => <InfrastructureField key={field.key} field={field} row={row}
            value={draft[field.key]} draft={draft} records={records} t={t} Fields={Fields}
            onChange={value => {
              setDraft(current => ({ ...current, [field.key]: value, ...page.onFieldChange?.(current, field.key, value, records, row) }));
              setChanged(true);
              dirtyRef.current = true;
              setError('');
            }}/>)}
        </section>)}
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

export default function InfrastructurePage({ pageId, state, params, navigate, dirtyRef, dispatch, conflict }) {
  const t = useChannelText();
  const headingId = useId();
  const page = infrastructurePages[pageId];
  const columnsKey = INFRASTRUCTURE_STORAGE + ':columns:' + pageId;
  const { Header, Detail, Extra, ExpandedRow, Fields, Cells, Card: CardView, Empty: EmptyView, Editor } = views[pageId] ?? {};
  const [source, setSource] = useState(readSource);
  const [storageError, setStorageError] = useState('');
  const [keyword, setKeyword] = useState(params.get('q') ?? '');
  const [filters, setFilters] = useState(() => Object.fromEntries(
    (page.filters ?? []).flatMap(({ key, multiple }) => params.has(key) ? [[key, multiple ? params.getAll(key) : params.get(key)]] : []),
  ));
  const [tab, setTab] = useState(0);
  const [sort, setSort] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(page.initialPageSize ?? 10);
  const [editor, setEditor] = useState(() => params.get('view') === 'create' && page.fields?.length ? { preset: params } : null);
  const [fileDeployment, setFileDeployment] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(() => page.views?.includes(params.get('layout')) ? params.get('layout') : page.views?.[0] ?? 'table');
  const [selected, setSelected] = useState([]);
  const [hidden, setHidden] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(columnsKey) ?? '[]');
      return Array.isArray(stored) ? stored : [];
    } catch { return []; }
  });
  const [showColumns, setShowColumns] = useState(false);
  const [draftHidden, setDraftHidden] = useState([]);
  const [expanded, setExpanded] = useState([]);
  const pending = useRef(false);

  const refresh = () => {
    try {
      setSource(readInfrastructure());
      setStorageError('');
    } catch {
      setStorageError('无法读取运维演示数据。请刷新后重试。');
    }
  };
  useEffect(() => {
    refresh();
    const sync = event => {
      if (event.key == null || event.key === INFRASTRUCTURE_STORAGE) refresh();
    };
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('storage', sync); dirtyRef.current = false; };
  }, [dirtyRef]);

  const shared = {
    clusters: state.clusters, deployments: state.deployments.filter(row => !row.retiredAt),
    deployableModels: deployableModels(state),
    actorRole: state.currentRole,
    actorName: state.admins.find(account => account.id === state.adminSession?.accountId)?.name,
  };
  const records = { ...shared, ...(source ?? emptyRecords) };
  const rows = (records[pageId] ?? []).filter(row => !page.showRow || page.showRow(row));
  const tabs = page.tabs ?? [];
  const activeTab = tabs[tab];
  const query = keyword.trim().toLocaleLowerCase();
  const filtered = rows.filter(row => {
    if (activeTab?.key && !filterMatch(activeTab.value, row[activeTab.key])) return false;
    if (!(page.filters ?? []).every(({ key, match }) => blank(filters[key]) ||
        (match ? match(filters[key], row, records) : filterMatch(filters[key], row[key])))) return false;
    const searchKeys = page.searchKeys ?? ['name', 'displayName'];
    return !query || [row.id, ...searchKeys.map(key => row[key])].some(value => String(value ?? '').toLocaleLowerCase().includes(query));
  });
  if (sort) {
    const field = page.columns.find(column => column.key === sort.key);
    const sortValue = row => field.key === 'name' ? display(field, row, records) : row[field.key];
    filtered.sort((left, right) => sort.direction * collator.compare(String(sortValue(left) ?? ''), String(sortValue(right) ?? '')));
  }
  const pageNumber = Math.max(1, Math.min(currentPage, Math.ceil(filtered.length / pageSize)));
  const displayed = view === 'cards' && page.loadMore ? filtered.slice(0, pageSize * currentPage) : filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
  const standalone = params.get('view') === 'detail' && params.has('record');
  const detailContext = standalone ? { id: params.get('record'), panel: params.get('panel') } : detail;
  const selectedDetail = rows.find(row => row.id === detailContext?.id);
  const selectedRows = rows.filter(row => selected.includes(row.id));
  const writable = Boolean(source && !storageError);
  const canDeployFile = writable && !conflict && !state.storageError && canMutate(state.currentRole,{type:'deploymentOperation'});

  const listQuery = () => {
    const query = new URLSearchParams();
    if (keyword) query.set('q', keyword);
    if (page.views?.length > 1) query.set('layout', view);
    Object.entries(filters).forEach(([key, value]) => {
      if (!blank(value)) (Array.isArray(value) ? value : [value]).forEach(item => query.append(key, item));
    });
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
  const openEditor = (options = {}) => setEditor(options);
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
      const next = await changeInfrastructure(pageId, (latest, local) => change(latest, { ...shared, ...local }));
      setSource(next);
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
      return previous ? latest.map(row => row.id === previous.id ? next : row) : [next, ...latest];
    }, '已保存');
    closeEditor();
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
    if (action.deployModelFile) {
      if (canDeployFile) setFileDeployment({ id:row.id, opener, left:window.scrollX, top:window.scrollY });
      return;
    }
    if (action.target) {
      const { page: target, field, mode } = action.target;
      const query = new URLSearchParams();
      if (mode === 'create') query.set('view', 'create');
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
      if (batch) setSelected([]);
    } catch (issue) { Toast.error(issue.message); }
  };

  const hasNameColumn = page.columns.some(column => column.key === 'name');
  const renderActions = row => {
    const items = [];
    if (!hasNameColumn) items.push({ key: 'details', name: t('详情'), onClick: () => openDetail(row) });
    if (page.fields?.length && page.editable && allowed(page.editable, row, records)) {
      items.push({ key: 'edit', name: t('编辑'), disabled: !writable, onClick: () => openEditor({ row }) });
    }
    for (const action of page.actions ?? []) {
      if (!allowed(action.when, row, records)) continue;
      items.push({ key: action.label, name: t(action.label), type: action.danger ? 'danger' : undefined,
        disabled: action.deployModelFile && !canDeployFile || !writable && Boolean(action.apply || action.editor) ||
          Boolean(typeof action.disabled === 'function' ? action.disabled(row, records) : action.disabled),
        onClick: opener => runAction(action, row, opener) });
    }
    if (page.deletable && allowed(page.deletable, row, records)) {
      items.push({ key: 'delete', name: t('删除'), type: 'danger', disabled: !writable, onClick: () => {
        const reason = page.canDelete?.(row, records);
        if (reason) Toast.warning(t(reason));
        else setConfirmation({ row });
      } });
    }
    if (!items.length) return null;
    return page.actionMenu ? <AdminActionMenu label={`${labelOf(row)} ${t('操作')}`} items={items.map(item=>({node:'item',...item}))}/> : <Space wrap spacing={4}>
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
    columns.push({ key: 'actions', title: '操作', width: page.actionWidth ?? 178, render: (_, row) => renderActions(row) });
  }
  const selectable = page.rowSelection || page.batchActions?.length > 0;
  const rowSelection = selectable ? { selectedRowKeys: selected, onChange: setSelected,
    getCheckboxProps: row => ({ disabled: !allowed(page.rowSelection, row, records) }) } : undefined;
  const tableWidth = page.tableWidth ?? columns.reduce((width, column) => width + (column.width ?? 106), selectable ? 42 : 0);
  const info = detailContext?.fields ?? page.detail ?? page.columns;
  const widgetProps = { pageId, page, records, rows, filtered, selectedRows, params, navigate, listQuery, commit, refresh, openDetail, openEditor, closeEditor, t, busy };
  const renderDetail = selectedDetail && (Detail && !detailContext?.fields ?
    <Detail {...widgetProps} detail={detailContext} row={selectedDetail} panel={detailContext.panel} close={closeDetail} standalone={standalone}/> :
    <AdminDescriptions align="left" data={info.map(column => ({
      key: t(column.label), value: column.status ? <AdminStatus value={display(column, selectedDetail, records)}/> :
        <Typography.Text className="infra-detail-value" copyable={column.copyable}>{display(column, selectedDetail, records)}</Typography.Text>,
    }))}/>);
  const runBatch = action => {
    if (!selectedRows.length || action.when && !action.when(selectedRows, records)) return;
    if (action.download) {
      try { saveFile(action.download(selectedRows, records)); }
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

  return <div className="admin-page-stack infra-page">
    <AdminPageHeading title={<span id={headingId}>{standalone && selectedDetail ? labelOf(selectedDetail) : t(page.title)}</span>}
      description={!standalone && page.description ? t(page.description) : undefined}>
      {standalone ? <Button onClick={closeDetail}>{t('返回列表')}</Button> : <Space wrap>
        {Header && <Header {...widgetProps}/>}
        {page.quickLinks?.map(link => <Button key={link.page} onClick={() => navigate(link.page)}>{t(link.label)}</Button>)}
        {page.createLabel && !page.hideCreate && <Button type="primary" theme="solid" icon={<IconPlus/>} disabled={!writable}
          onClick={() => openEditor()}>{t(page.createLabel)}</Button>}
      </Space>}
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
        <Button theme="borderless" type="tertiary" disabled={!keyword && !Object.values(filters).some(value => !blank(value))}
          onClick={() => { setKeyword(''); setFilters({}); setCurrentPage(1); }}>{t('重置')}</Button>
        <Button icon={<IconRefresh/>} theme="borderless" type="tertiary" aria-label={t('刷新')}
          onClick={refresh}/>
        {page.views?.length > 1 && <Space>
          {page.views.map(item => <Button key={item} aria-pressed={item === view} type={item === view ? 'primary' : 'tertiary'}
            theme={item === view ? 'light' : 'borderless'} onClick={() => { setView(item); setCurrentPage(1); }}>
            {t(item === 'cards' ? '卡片视图' : '列表视图')}
          </Button>)}
        </Space>}
        {page.columnSettings && view === 'table' && <Button theme="borderless" onClick={() => { setDraftHidden(hidden); setShowColumns(true); }}>
          {t('列设置')}
        </Button>}
        {ExpandedRow && view === 'table' && displayed.length > 0 && <Button theme="borderless"
          onClick={() => setExpanded(expanded.length ? [] : displayed.map(row => row.id))}>
          {t(expanded.length ? '全部收起' : '全部展开')}
        </Button>}
      </div>
      {Extra && <Extra {...widgetProps}/>}
      {selectedRows.length > 0 && <Space wrap className="infra-batch-actions">
        <Typography.Text>{`已选 ${selectedRows.length} 条`}</Typography.Text>
        {page.batchActions?.map(action => <Button key={action.label} type={action.danger ? 'danger' : 'primary'}
          disabled={!writable || !allowed(action.when, selectedRows, records)} onClick={() => runBatch(action)}>{t(action.label)}</Button>)}
        <Button theme="borderless" onClick={() => setSelected([])}>{t('清空选择')}</Button>
      </Space>}
      {view === 'cards' ? displayed.length > 0 ? <div className="infra-card-grid">
        {displayed.map(row => CardView ? <CardView key={row.id} {...widgetProps} row={row} actions={renderActions(row)}/> :
          <Card key={row.id} title={<Button theme="borderless" onClick={() => openDetail(row)}>{labelOf(row)}</Button>}
            footer={renderActions(row)}>
            <AdminDescriptions data={(page.cardColumns ?? page.columns.filter(column => column.key !== 'name').slice(0, 4))
              .map(column => ({ key: column.label, value: display(column, row, records) }))}/>
          </Card>)}
      </div> : EmptyView ? <EmptyView {...widgetProps} hasFilters={Boolean(query || Object.values(filters).some(value => !blank(value)))}/> : <Empty description={t('没有符合条件的记录')}/> :
      <div className="infra-table-scroll" role="region" aria-labelledby={headingId} tabIndex={0}>
        <div style={{ minWidth: tableWidth }}>
          <AdminTable aria-labelledby={headingId} columns={columns} dataSource={displayed}
            rowSelection={rowSelection}
            expandedRowRender={ExpandedRow ? row => <ExpandedRow {...widgetProps} row={row}/> : undefined}
            expandedRowKeys={ExpandedRow ? expanded : undefined}
            onExpandedRowsChange={ExpandedRow ? rows=>setExpanded((rows ?? []).map(row=>row.id)) : undefined}
            pagination={false} rowKey="id" empty={query || Object.values(filters).some(value => !blank(value)) ? '没有符合条件的记录' : '暂无数据'}/>
        </div>
      </div>}
      {sort && <div className="sr-only" role="status">
        {t(page.columns.find(column => column.key === sort.key).label)} {t(sort.direction === 1 ? '升序' : '降序')}
      </div>}
      {view === 'cards' && page.loadMore ? displayed.length < filtered.length &&
        <Button className="infra-load-more" onClick={() => setCurrentPage(currentPage + 1)}>{t('加载更多')}</Button> :
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
    {editor && source && (Editor ? <Editor {...widgetProps} editor={editor} page={editorPage} onSave={save} onClose={closeEditor} dirtyRef={dirtyRef}/> :
      <InfrastructureForm page={editorPage} row={editor.row} records={records} preset={editor.preset}
      Fields={Fields} t={t} onSave={save} onClose={closeEditor} dirtyRef={dirtyRef} busy={busy}/>)}
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
          localStorage.setItem(columnsKey, JSON.stringify(draftHidden));
          setHidden(draftHidden);
          setShowColumns(false);
        } catch { Toast.error(t('列设置保存失败')); }
      }}>
      <Space vertical align="start">
        {page.columns.filter(column => column.key !== 'name').map(column => <Checkbox key={column.key}
          checked={!draftHidden.includes(column.key)} onChange={event => setDraftHidden(previous =>
            event.target.checked ? previous.filter(key => key !== column.key) : [...previous, column.key])}>{t(column.label)}</Checkbox>)}
        <Button theme="borderless" onClick={() => setDraftHidden([])}>{t('恢复默认')}</Button>
      </Space>
    </AdminModal>}
    {confirmation && <AdminModal title={t(action?.label ?? '删除记录')} visible closeOnEsc={!busy}
      onCancel={() => { if (!busy) setConfirmation(null); }} confirmLoading={busy}
      okType={!action || action.danger ? 'danger' : 'primary'} okText={t(action?.label ?? '删除')} onOk={() => execute(confirmation)}>
      {t(confirmText)}
    </AdminModal>}
  </div>;
}
