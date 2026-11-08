import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { useEffect, useRef, useState } from 'react';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { Banner, Button, Card, Checkbox, Descriptions, Input, RadioGroup, Select, Tabs, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/FilterControls';
import AdminPageHeading from './AdminPageHeading';
import PackageModelFactors from './PackageModelFactors';
import { Choice } from './ServiceUI';
import { EMPTY_PACKAGE, MAX_PACKAGE_DISPLAY_ORDER, MAX_PACKAGE_TYPE_LENGTH, MAX_PACKAGE_USAGE_LENGTH, PACKAGE_PERIODS, PACKAGE_STATUS, PACKAGE_USER_TYPES, canDeletePackage, canManagePackages, packageConfig, packageFactorRange, packageModelsWithRules, packageTypeOptions } from './token-packages';
import './package-production.css';

const route = '#/admin-2/package-production';
const forms = { subscription: '按周期订阅', pack: '一次性资源包' };
const kinds = Object.entries(forms);
const statuses = Object.entries(PACKAGE_STATUS);
const periods = [['month', '按月'], ['quarter', '按季度'], ['year', '按年']];
const userTypes = Object.entries(PACKAGE_USER_TYPES);
const stateActions = {
  draft: ['发布', 'publishPackage'], ready: ['上架', 'list'], listed: ['下架', 'unlist'], unlisted: ['重新上架', 'list'],
};
const discardMessage = '套餐配置尚未保存，是否放弃修改？';
const amount = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const displayNumber = value => value?.trim() && Number.isFinite(Number(value)) ? amount.format(value) : null;
const requiredMark = <Typography.Text type="danger" aria-hidden="true"> *</Typography.Text>;

function summarize(plan) {
  const subscription = plan.kind === 'subscription';
  const unit = subscription ? PACKAGE_PERIODS[plan.period] : '份';
  const quota = displayNumber(plan.quota);
  const price = displayNumber(plan.price);
  return {
    quota: quota ? `${quota} 万 Token／${unit}` : '—',
    price: price ? `¥${price}／${unit}` : '—',
    term: subscription ? (plan.cycles ? `${plan.cycles} ${{ month: '个月', quarter: '个季度', year: '年' }[plan.period]}` : '—') : (plan.validDays ? `生效后 ${plan.validDays} 天` : '—'),
    limit: plan.purchaseLimit ? `${plan.purchaseLimit} 份` : '不限购',
  };
}

function PackageTypeDialog({ target, save, close, canWrite, focusAfterDelete }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deleting = Boolean(target.id);
  const submit = async event => {
    event.preventDefault();
    if (!canWrite || busy || (!deleting && !name.trim())) return;
    setBusy(true);
    setError('');
    try {
      await save(deleting ? target.id : name);
      finish(deleting);
    }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const finish = deleted => {
    close();
    requestAnimationFrame(() => {
      if (!deleted && target.trigger.isConnected) target.trigger.focus();
      else focusAfterDelete();
    });
  };
  const cancel = () => { if (!busy) finish(false); };
  return <Modal visible title={deleting ? '删除套餐类型' : '添加套餐类型'} width="min(520px, calc(100vw - 32px))"
    closable={!busy} maskClosable={!busy} closeOnEsc={!busy} onCancel={cancel}
    footer={<>
      <Button type="tertiary" onClick={cancel} disabled={busy} autoFocus={deleting}>取消</Button>
      <Button htmlType="submit" form="package-type-editor" theme="solid" type={deleting ? 'danger' : 'primary'} loading={busy}
        disabled={!canWrite || busy || (!deleting && !name.trim())}>{deleting ? '确认删除' : '确认添加'}</Button>
    </>}>
    <form id="package-type-editor" onSubmit={submit} className="package-rule-editor">
      <Typography.Paragraph type="secondary">{deleting
        ? `删除「${target.name}」后，套餐将无法再选择此类型。只有未被套餐使用的类型可以删除。`
        : '保存后，所有套餐都可以选择此类型。'}</Typography.Paragraph>
      {!deleting && <label className="package-field"><Typography.Text>类型名称</Typography.Text>
        <Input value={name} onChange={value => { setName(value); setError(''); }} required maxLength={MAX_PACKAGE_TYPE_LENGTH} disabled={busy} autoFocus/>
      </label>}
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
    </form>
  </Modal>;
}

function PackageModelSelection({ models, selected, change, locked, readOnly }) {
  const chosen = models.filter(model => selected.includes(model.id));
  const hasEligibleModels = models.some(model => model.enabled && model.rules.length);
  const optionList = models.map(model => ({
    value: model.id, label: model.name, code: model.code,
  }));

  return <fieldset>
    <legend id="package-supported-models">支持模型{!readOnly && requiredMark}</legend>
    <div className="grid min-w-0 gap-2">
      {!readOnly && <>
        <Select key={optionList.length > 0 ? 'available' : 'empty'} className="package-model-select"
          multiple value={selected} optionList={optionList} onChange={change}
          disabled={locked || !optionList.length} aria-labelledby="package-supported-models"
          placeholder={hasEligibleModels ? '选择支持模型（可多选）' : '暂无可选模型'} maxTagCount={4} showClear
          filter={(input, option) => `${option.label} ${option.code}`.toLowerCase().includes(input.trim().toLowerCase())}
          emptyContent="未找到匹配的模型"/>
        {!hasEligibleModels && <Typography.Text link={{ href: `${route}?tab=factors` }}>前往模型抵扣系数设置可选模型</Typography.Text>}
      </>}
      {readOnly && !chosen.length && <Typography.Text type="tertiary">未配置支持模型</Typography.Text>}
      {chosen.length > 0 && <div className="package-model-options">
        {chosen.map(model => (
          <Card key={model.id}>
            <div className="admin-table-record"><Typography.Text strong>{model.name}</Typography.Text><Typography.Text type="tertiary" size="small">{model.code}</Typography.Text></div>
            {model.rules.length
              ? <ul aria-label={`${model.name}抵扣规则`} className="package-rule-summary">
                {model.rules.map((rule, index) => <li key={index}><Typography.Text type="secondary">
                  {rule.billingItem} · {packageFactorRange(rule)} · {rule.factor} 倍
                </Typography.Text></li>)}
              </ul>
              : <Typography.Paragraph type="tertiary">{model.legacyFactor
                ? `原模型系数 ${model.legacyFactor} 倍 · 待配置计费项` : '暂无可用抵扣规则'}</Typography.Paragraph>}
          </Card>
        ))}
      </div>}
    </div>
  </fieldset>;
}

function PackageEditor({ record, mode, canWrite, canManageTypes, packageTypes, customTypes, models, addType, deleteType, setDirty, save, close }) {
  const [baseRecord] = useState(record);
  const [values, setValues] = useState(() => ({
    ...EMPTY_PACKAGE, ...record,
    userTypes: record ? record.userTypes ?? [] : EMPTY_PACKAGE.userTypes,
    period: record?.period || EMPTY_PACKAGE.period,
    cycles: record?.kind === 'subscription' ? record.cycles : EMPTY_PACKAGE.cycles,
    rollover: record?.rollover || EMPTY_PACKAGE.rollover,
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [typeDialog, setTypeDialog] = useState(null);
  const heading = useRef(null);
  const alternate = useRef({ quota: '', price: '' });
  const subscription = values.kind === 'subscription';
  const limited = values.limited;
  const selectedUserTypes = values.userTypes ?? [];
  const selectedModelIds = values.modelIds ?? [];
  const availableModelIds = new Set(models.filter(model => model.enabled && model.rules.length).map(model => model.id));
  const knownModelIds = new Set(models.map(model => model.id));
  const modelOptions = [...models.filter(model => availableModelIds.has(model.id) || selectedModelIds.includes(model.id)),
    ...selectedModelIds.filter(id => !knownModelIds.has(id)).map(id => ({ id, name: '不可用模型', code: id, rules: [] }))];
  const selectedCustomType = customTypes.find(type => type.id === values.packageType);
  const readOnly = mode === 'detail' || record?.status === 'listed';
  const mark = readOnly ? null : requiredMark;
  const locked = readOnly || busy;
  const summary = summarize(values);
  useEffect(() => { heading.current?.focus(); }, []);
  const change = (field, value) => {
    setValues(current => ({ ...current, [field]: value }));
    setDirty();
    setError('');
  };
  const changeKind = kind => {
    if (baseRecord) return;
    const next = { ...values, ...alternate.current, kind };
    alternate.current = { quota: values.quota, price: values.price };
    setValues(next);
    setDirty();
    setError('');
  };
  const submit = async event => {
    event.preventDefault();
    if (!canWrite || locked) return;
    setBusy(true);
    setError('');
    try {
      const config = packageConfig(values, false, packageTypes, availableModelIds);
      await save(config, baseRecord);
    } catch (cause) {
      setError(cause.message);
    } finally { setBusy(false); }
  };
  const input = (key, label, props = {}) => <label className="package-field">
    <Typography.Text>{label}{props.required && mark}</Typography.Text><Input value={values[key] ?? ''} onChange={value => change(key, value)} disabled={locked} {...props}/>
  </label>;
  return <>
    <AdminPageHeading title={<span tabIndex={-1} ref={heading}>{readOnly ? '套餐详情' : record ? '编辑套餐' : '新增套餐'}</span>}/>
    <Card><form onSubmit={submit} noValidate>
      <div className="package-layout">
        <div className="package-sections">
          <fieldset><legend>套餐形式{!record && mark}</legend>
            {record ? <Tag>{forms[record.kind]}</Tag> : <RadioGroup aria-label="套餐形式" type="card" value={values.kind} disabled={locked}
              options={kinds.map(([value, label]) => ({ value, label }))} onChange={event => changeKind(event.target.value)}/>}
          </fieldset>
          <fieldset><legend>基础信息</legend>
            <div className="package-fields">
              {input('name', '套餐名称', { maxLength: 40, required: true })}
              <div className="package-field"><span>套餐类型</span><div className="flex items-center gap-2">
                <Choice label="套餐类型" value={values.packageType || 'none'} options={ [['none', '未设置'], ...packageTypes] } onChange={value => change('packageType', value === 'none' ? '' : value)} disabled={locked}/>
                {canManageTypes && !readOnly && <Button type="tertiary" disabled={busy} onClick={event => setTypeDialog({ trigger: event.currentTarget })}>添加类型</Button>}
              </div></div>
              {canManageTypes && !readOnly && selectedCustomType && <div className="package-span flex justify-end">
                <Button type="tertiary" disabled={busy} onClick={event => setTypeDialog({ ...selectedCustomType, trigger: event.currentTarget })}>删除类型</Button>
              </div>}
            </div>
            {record && <Typography.Paragraph type="tertiary" size="small">套餐编号 {record.id}</Typography.Paragraph>}
          </fieldset>
          <PackageModelSelection models={modelOptions} selected={selectedModelIds} change={ids => change('modelIds', ids)} locked={locked} readOnly={readOnly}/>
          <fieldset><legend>额度与售价</legend>
            <div className="package-fields">
              {input('quota', subscription ? '每周期额度（万 Token）' : '每份总额度（万 Token）', { inputMode: 'numeric', required: true })}
              {input('price', subscription ? '每周期售价（元）' : '每份售价（元）', { inputMode: 'decimal', required: true })}
              {subscription ? <>
                <div className="package-field"><span>订阅周期{mark}</span><Choice label="订阅周期" value={values.period} options={periods} onChange={value => change('period', value)} disabled={locked}/></div>
                {input('cycles', '总订阅周期数', { inputMode: 'numeric', required: true })}
                <Typography.Text className="package-span" size="small" type="tertiary">按原生效日推算周期，目标月没有对应日期时取当月最后一天。按月订阅如 1 月 31 日生效，接下来两个周期分别在 2 月末、3 月 31 日切换。</Typography.Text>
                <div className="package-field"><span>周期剩余额度{mark}</span><Choice label="周期剩余额度" value={values.rollover} options={[['none', '不结转'], ['next', '结转至下一周期']]} onChange={value => change('rollover', value)} disabled={locked}/></div>
              </> : input('validDays', '生效后有效天数', { inputMode: 'numeric', required: true })}
            </div>
          </fieldset>
          <fieldset><legend>使用信息</legend>
            <div className="package-fields">
              {[['usageInstructions', '使用说明'], ['usageScope', '使用范围']].map(([key, label]) => <label key={key} className="package-field">
                <span>{label}</span><TextArea value={values[key] ?? ''} maxLength={MAX_PACKAGE_USAGE_LENGTH} rows={3} disabled={locked} onChange={value => change(key, value)}/>
              </label>)}
            </div>
          </fieldset>
          <fieldset><legend>购买与展示</legend>
            <div className="package-fields">
              <fieldset className="package-span">
                <legend>支持订购的用户类型{mark}{!readOnly && <span className="sr-only">，发布时至少选择一项</span>}</legend>
                <div className="package-audience">
                  {userTypes.map(([type, label]) => <Checkbox key={type} checked={selectedUserTypes.includes(type)} disabled={locked}
                    onChange={event => change('userTypes', event.target.checked ? [...selectedUserTypes, type] : selectedUserTypes.filter(value => value !== type))}>
                    {label}
                  </Checkbox>)}
                </div>
              </fieldset>
              <div className="package-field"><span>每人限购{mark}</span><Choice label="每人限购" value={limited ? 'limited' : 'unlimited'} options={ [['unlimited', '不限购'], ['limited', '限制累计购买份数']] } onChange={value => change('limited', value === 'limited')} disabled={locked}/></div>
              {limited && input('purchaseLimit', '最多购买（份）', { inputMode: 'numeric', required: true })}
              {input('displayName', '购买页展示名称', { maxLength: 40, placeholder: '默认使用套餐名称' })}
              <div className="package-field">
                {input('displayOrder', '展示顺序', { inputMode: 'numeric', 'aria-describedby': 'package-display-order-hint' })}
                <Typography.Text id="package-display-order-hint" type="tertiary" size="small">0–{MAX_PACKAGE_DISPLAY_ORDER} 的整数，数字越小越靠前。留空排在最后。</Typography.Text>
              </div>
              <label className="package-field package-span"><span>套餐简介</span><TextArea value={values.description} maxLength={300} rows={2} disabled={locked} onChange={value => change('description', value)}/></label>
            </div>
          </fieldset>
        </div>
        <aside aria-label="购买页预览">
          <Card title="购买页预览">
            <div className="package-preview-content">
              <div><Tag>{forms[values.kind]}</Tag></div>
              <Typography.Title heading={5} component="h3">{values.displayName.trim() || values.name.trim() || '套餐名称'}</Typography.Title>
              {values.description.trim() && <Typography.Paragraph type="secondary" ellipsis={{ rows: 2, showTooltip: true }}>{values.description.trim()}</Typography.Paragraph>}
              <Typography.Title heading={4} component="p">{summary.price}</Typography.Title>
              <Descriptions data={[
                { key: 'Token 额度', value: summary.quota },
                { key: '有效期限', value: summary.term },
                { key: '每人限购', value: limited ? (values.purchaseLimit ? summary.limit : '—') : '不限购' },
              ]}/>
            </div>
          </Card>
        </aside>
      </div>
      {error && <Banner className="package-editor-error" type="danger" closeIcon={null} description={error}/>}
      {!readOnly && <footer className="admin-form-actions">
        <Typography.Text type="tertiary" size="small">星号表示发布必填</Typography.Text>
        <Button type="tertiary" disabled={busy} onClick={close}>取消</Button>
        <Button htmlType="submit" theme="solid" disabled={!canWrite || busy}>保存</Button>
      </footer>}
    </form></Card>
    {typeDialog && <PackageTypeDialog target={typeDialog} canWrite={canManageTypes} focusAfterDelete={() => heading.current?.focus()} close={() => setTypeDialog(null)} save={typeDialog.id ? async id => {
      await deleteType(id);
      change('packageType', '');
    } : addType}/>}
  </>;
}

export default function PackageProduction({ state, transact, conflict, params, dirty }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [confirmation, setConfirmation] = useState(null);
  const [discardTarget, setDiscardTarget] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const trigger = useRef(null);
  const listTitle = useRef(null);
  const view = params.get('view');
  const id = params.get('package');
  const tab = params.get('tab') === 'factors' ? 'factors' : 'packages';
  const editor = ['new', 'edit', 'detail'].includes(view);
  const record = state.tokenPackages.find(row => row.id === id);
  const canWrite = !conflict && canManagePackages(state.currentRole);
  const packageTypes = packageTypeOptions(state);
  const packageTypeLabels = new Map(packageTypes);

  useEffect(() => {
    if (!editor && trigger.current) {
      const source = document.getElementById(trigger.current);
      trigger.current = null;
      (source && !source.disabled ? source : listTitle.current)?.focus();
    }
  }, [editor]);

  const go = (next, source = null) => {
    if (dirty.current) {
      setDiscardTarget({ next, source });
      return;
    }
    if (source) trigger.current = source.id;
    dirty.current = false;
    location.hash = next;
    window.scrollTo(0, 0);
  };
  const open = (mode, item, source) => {
    const next = new URLSearchParams({ view: mode });
    if (item) next.set('package', item.id);
    go(`${route}?${next}`, source);
  };
  const run = async (operation, item, values) => {
    const next = await transact({ type: 'tokenPackage', operation, id: item?.id, revision: item?.revision, values });
    Toast.success({ save: '套餐草稿已保存', publishPackage: '套餐已发布，待上架', list: '套餐已上架', unlist: '套餐已下架', deletePackage: '套餐草稿已删除', addType: '套餐类型已添加', deleteType: '套餐类型已删除' }[operation]);
    return next;
  };
  const save = async (values, item) => {
    const hash = location.hash;
    await run('save', item, values);
    if (location.hash !== hash) return;
    dirty.current = false;
    go(route);
  };

  if (editor) {
    if (!record && view !== 'new') return <div className="admin-page-stack"><AdminPageHeading title="套餐不存在"/><Banner type="warning" closeIcon={null} description="请通过面包屑返回套餐列表。"/></div>;
    return <div className="admin-page-stack"><PackageEditor key={`${view}:${id || ''}`} record={view === 'new' ? null : record} mode={view} canWrite={canWrite}
      canManageTypes={canWrite && canManagePackages(state.currentRole, 'addType')} packageTypes={packageTypes} customTypes={state.tokenPackageTypes}
      models={packageModelsWithRules(state)}
      addType={name => run('addType', null, { name })}
      deleteType={typeId => run('deleteType', null, { typeId })}
      setDirty={() => { dirty.current = true; }} save={save} close={() => go(route)}/>
      {discardTarget && <Modal visible title="有未保存的配置" okText="放弃本次修改" cancelText="继续编辑"
        okButtonProps={{ type: 'danger', 'aria-label': '放弃本次修改' }} cancelButtonProps={{ 'aria-label': '继续编辑' }}
        onCancel={() => setDiscardTarget(null)} onOk={() => {
          dirty.current = false;
          go(discardTarget.next, discardTarget.source);
          setDiscardTarget(null);
        }}>{discardMessage}</Modal>}
    </div>;
  }

  const keyword = query.trim().toLowerCase();
  const rows = state.tokenPackages.filter(item => (!keyword || `${item.name} ${item.id}`.toLowerCase().includes(keyword))
    && (kind === 'all' || kind === item.kind) && (status === 'all' || status === item.status))
    .sort((left, right) => Number(left.displayOrder || Number.MAX_SAFE_INTEGER) - Number(right.displayOrder || Number.MAX_SAFE_INTEGER));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const filter = setter => value => { setter(value); setPage(1); };
  const closeConfirmation = () => {
    const source = confirmation.source;
    setConfirmation(null);
    setError('');
    requestAnimationFrame(() => (source.isConnected ? source : listTitle.current)?.focus());
  };
  const publish = async item => {
    setBusy(true);
    try {
      await run('publishPackage', item, item);
      requestAnimationFrame(() => document.getElementById(`package-open-${item.id}`)?.focus());
    } catch (cause) {
      Toast.error(cause.message);
    } finally {
      setBusy(false);
    }
  };
  const columns = [
    { title: '套餐名称', width: 200, render: (_, item) => <div className="admin-table-record">
      <Typography.Text strong>{item.name || '未命名套餐'}</Typography.Text>
      <Typography.Text type="tertiary" size="small">{item.id}</Typography.Text>
    </div> },
    { title: '套餐形式', width: 120, dataIndex: 'kind', render: value => forms[value] },
    { title: '套餐类型', width: 116, dataIndex: 'packageType', render: value => packageTypeLabels.get(value) || '—' },
    { title: 'Token 额度', width: 148, align: 'right', render: (_, item) => summarize(item).quota },
    { title: '售价', width: 110, align: 'right', render: (_, item) => summarize(item).price },
    { title: '订阅期／有效期', width: 130, render: (_, item) => summarize(item).term },
    { title: '每人限购', width: 110, align: 'right', render: (_, item) => summarize(item).limit },
    { title: '状态', width: 100, dataIndex: 'status', render: value => <AdminStatus value={PACKAGE_STATUS[value]}/> },
    { title: '操作', width: 190, render: (_, item) => {
      const [label, operation] = stateActions[item.status];
      const readonly = item.status === 'listed' || !canWrite;
      const name = item.name || '未命名套餐';
      return <div className="package-actions">
        <Button id={`package-open-${item.id}`} size="small" theme="borderless" disabled={busy}
          aria-label={`${readonly ? '查看' : '编辑'} ${name}`}
          onClick={event => open(readonly ? 'detail' : 'edit', item, event.currentTarget)}>{readonly ? '查看' : '编辑'}</Button>
        <Button id={`package-action-${item.id}`} size="small" theme="borderless" disabled={!canWrite || busy}
          aria-label={`${label} ${name}`} onClick={event => {
            if (operation === 'publishPackage') void publish(item);
            else setConfirmation({ item, label, operation, source: event.currentTarget });
          }}>{label}</Button>
        {canWrite && canDeletePackage(item) && <Button type="danger" size="small" theme="borderless" disabled={busy} aria-label={`删除 ${name}`}
          onClick={event => setConfirmation({ item, label: '删除', operation: 'deletePackage', source: event.currentTarget })}>删除</Button>}
      </div>;
    } },
  ];
  return <div className="admin-page-stack">
    <AdminPageHeading title={<span tabIndex={-1} ref={listTitle}>套餐制作</span>}>
      {tab === 'packages' && <Button id="package-new" theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!canWrite}
        onClick={event => open('new', null, event.currentTarget)}>新增套餐</Button>}
    </AdminPageHeading>
    <Tabs type="line" activeKey={tab} keepDOM={false} aria-label="套餐制作"
      onChange={key => { location.hash = key === 'factors' ? `${route}?tab=factors` : route; }}>
      <Tabs.TabPane itemKey="packages" tab="套餐列表">
        <Card>
          <div className="admin-list-toolbar">
            <Input className="admin-list-search" prefix={<IconSearch aria-hidden="true"/>} aria-label="搜索套餐" placeholder="搜索套餐名称或编号" value={query} onChange={filter(setQuery)}/>
            <Choice label="套餐形式" value={kind} options={ [['all', '全部形式'], ...kinds] } onChange={filter(setKind)}/>
            <Choice label="套餐状态" value={status} options={ [['all', '全部状态'], ...statuses] } onChange={filter(setStatus)}/>
          </div>
          <section aria-label="套餐列表">
            <Table size="small" rowKey="id" columns={columns} dataSource={rows.slice((currentPage - 1) * size, currentPage * size)}
              scroll={{ x: 'max(100%, 1224px)' }}
              empty={keyword || kind !== 'all' || status !== 'all' ? '暂无符合筛选条件的套餐' : '暂无套餐，点击「新增套餐」开始制作。'}
              pagination={{ currentPage, pageSize: size, total: rows.length, pageSizeOpts: PAGE_SIZES, showSizeChanger: true, showTotal: true,
                preventPageChangeOnPageSizeChange: true, onPageChange: setPage, onPageSizeChange: filter(setSize) }}/>
          </section>
        </Card>
      </Tabs.TabPane>
      <Tabs.TabPane itemKey="factors" tab="模型抵扣系数">
        <PackageModelFactors state={state} transact={transact} conflict={conflict} dirty={dirty}/>
      </Tabs.TabPane>
    </Tabs>
    {confirmation && <Modal visible title={`${confirmation.label}套餐`} width="min(520px, calc(100vw - 32px))" okText={`确认${confirmation.label}`} cancelText="取消"
      closable={!busy} maskClosable={!busy} closeOnEsc={!busy} cancelButtonProps={{ 'aria-label': '取消', disabled: busy, autoFocus: true }}
      okButtonProps={{ 'aria-label': `确认${confirmation.label}`, disabled: !canWrite, type: confirmation.operation === 'deletePackage' ? 'danger' : 'primary' }}
      confirmLoading={busy} onCancel={closeConfirmation} onOk={async () => {
        if (!canWrite || busy) return;
        setBusy(true);
        setError('');
        try { await run(confirmation.operation, confirmation.item); closeConfirmation(); }
        catch (cause) { setError(cause.message); }
        finally { setBusy(false); }
      }}>
      <Typography.Paragraph>{confirmation.operation === 'deletePackage'
        ? `确认删除「${confirmation.item.name || '未命名套餐'}」？删除后将从套餐列表移除。`
        : confirmation.operation === 'unlist'
          ? `「${confirmation.item.name}」下架后停止接受新订购。已购权益可继续使用，额度用尽或到期后结束。`
          : `确认${confirmation.label}「${confirmation.item.name}」？上架后开放新订购。`}</Typography.Paragraph>
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
    </Modal>}
  </div>;
}
