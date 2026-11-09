import Table from './AdminTable';
import AdminPageHeading from './AdminPageHeading';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Banner, Button, Card, Form, Input, Select, Space, Tabs, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus } from '@douyinfe/semi-icons';
import { AdminModal as Modal, AdminSideSheet } from './AdminOverlay';
import { cloudAdminRequest } from './CloudModelOperations';
import { Choice, FieldLabel } from './ServiceUI.jsx';
import { accountTraffic, effectiveTraffic, modelTraffic, trafficAccounts } from './traffic-limits.js';
import { parseTrafficRate, trafficRateText, trafficUnits, validTrafficLimit } from './traffic-rates.js';
import './traffic-operations.css';

const { Text } = Typography;
const limitsPath = '/traffic-limits';
const metrics = ['rpm', 'tpm'];
const rateWidths = { rpm: 156, tpm: 202 };
const ratePairWidth = 168;
const match = (query, ...fields) => fields.some(value => String(value ?? '').toLowerCase().includes(query.trim().toLowerCase()));
const loginRequired = issue => issue?.status === 401 || issue?.status === 403;
const rateLabel = metric => metric.toUpperCase() + '（' + trafficUnits[metric] + '）';
const userDefaultHelp = '账号未单独设置时使用的通用额度。对应模型的一客一策优先。';
const modelDefaultHelp = '模型未单独设置时使用的共享上限。调用同一模型的所有账号共用该额度。';
const finalLimitHelp = 'RPM 和 TPM 分别取账号侧额度与模型共享上限中较小的值。共享额度由调用同一模型的账号共用。';
const historyTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium' });

function inputRows(rows) {
  return rows.map(({ modelId, rpm, tpm }) => ({
    ...(modelId && { modelId }), rpm: trafficRateText(rpm, 'rpm'), tpm: trafficRateText(tpm, 'tpm'),
  }));
}

function readRow(row, name) {
  const rpm = parseTrafficRate(row.rpm, 'rpm'), tpm = parseTrafficRate(row.tpm, 'tpm');
  const prefix = name ? name + '：' : '';
  if (rpm === null) throw new Error(prefix + 'RPM 须为正整数。');
  if (tpm === null) throw new Error(prefix + 'TPM 须为正数，最多保留 6 位小数。');
  return { ...(row.modelId && { modelId: row.modelId }), rpm, tpm };
}

function RateInput({ metric, value, onChange, modelName, disabled }) {
  const id = useId();
  const label = rateLabel(metric);
  const input = <Input id={id} aria-label={modelName ? modelName + ' ' + label : label} aria-required="true"
    className="traffic-rate-input" inputMode={metric === 'tpm' ? 'decimal' : 'numeric'}
    value={value} onChange={onChange} disabled={disabled}/>;
  return modelName ? input : <Form.Slot label={{ text: label, name: id, required: true }}>{input}</Form.Slot>;
}

function RatePair({ limit, strong }) {
  if (!limit) return <Text type="tertiary">—</Text>;
  return <Text strong={strong}><span className="traffic-rate-pair">
    <span>{trafficRateText(limit.rpm, 'rpm', true)} <small title={trafficUnits.rpm}>RPM</small></span>{' '}
    <span>{trafficRateText(limit.tpm, 'tpm', true)} <small title={trafficUnits.tpm}>百万 TPM</small></span>
  </span></Text>;
}

function DefaultInline({ title, description, children }) {
  return <div className="traffic-default-inline" aria-label={title} role="group">
    <FieldLabel name={title} description={description}/>
    {children}
  </div>;
}

function AccountIdentity({ account }) {
  return <div className="traffic-policy-account"><Text strong>{account.name}</Text><Text type="secondary">{account.id}</Text></div>;
}

function HistoryValue({ value, scope }) {
  if (validTrafficLimit(value)) return <RatePair limit={value}/>;
  const inherited = { account: '继承全局默认', model: '继承模型默认' };
  const label = value === null ? inherited[scope] || '未配置' : '未记录';
  return <Text type="secondary">{label}</Text>;
}

function TrafficHistory({ accountId, accounts, models, session, login, requestLogin, close }) {
  const [history, setHistory] = useState({ items: [], loading: true });
  const request = useRef(null);

  const load = useCallback(async after => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setHistory(current => ({ ...(after ? current : { items: [] }), error: null, loading: true }));
    try {
      const query = new URLSearchParams({ limit: '40', ...(after && { after }) });
      const result = await cloudAdminRequest('/traffic-limits/history?' + query, { signal: controller.signal });
      if (result.accountId !== accountId) throw Object.assign(new Error('请使用当前后台账号登录'), { status: 401 });
      if (!controller.signal.aborted) setHistory(current => ({
        items: after ? [...current.items, ...result.items] : result.items, nextCursor: result.nextCursor, loading: false,
      }));
    } catch (error) {
      if (!controller.signal.aborted) setHistory(current => ({ ...current, error, loading: false }));
    }
  }, [accountId]);

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load, session]);

  const accountNames = new Map(accounts.map(row => [row.id, row.name]));
  const modelNames = new Map(models.map(row => [row.id, row.name]));
  const objectName = row => {
    if (row.scope === 'user-default') return '用户全局默认';
    if (row.scope === 'model-default') return '模型默认';
    if (row.scope === 'model') return modelNames.get(row.objectId) || row.objectId;
    const name = accountNames.get(row.objectId) || row.objectId;
    return row.modelId ? name + ' · ' + (modelNames.get(row.modelId) || row.modelId) : name;
  };
  const columns = [
    { title: '变更时间', width: 166, render: (_, row) => Number.isFinite(Date.parse(row.createdAt)) ? historyTime.format(new Date(row.createdAt)) : '—' },
    { title: '变更对象', render: (_, row) => <span className="traffic-history-object">{objectName(row)}</span> },
    { title: '操作', width: 156, dataIndex: 'action' },
    { title: '变更前', width: 172, render: (_, row) => <HistoryValue scope={row.scope} value={row.before}/> },
    { title: '变更后', width: 172, render: (_, row) => <HistoryValue scope={row.scope} value={row.after}/> },
    { title: '操作人', width: 144, render: (_, row) => <div className="traffic-rate-cell">
      <Text>{row.actorName || row.actorId || '—'}</Text>
      {row.actorName && row.actorId && row.actorName !== row.actorId && <Text size="small" type="tertiary">{row.actorId}</Text>}
    </div> },
  ];

  return <AdminSideSheet visible title="变更历史" width="min(1120px, 100vw)" closeOnEsc={!login} onCancel={close}
    footer={<Button onClick={close}>关闭</Button>}>
    <div className="traffic-policy-drawer">
      {history.loading && <Text role="status" type="secondary">正在读取限流变更…</Text>}
      {history.error && <Banner type="warning" closeIcon={null} description={loginRequired(history.error)
        ? <>登录后台后查看变更历史。 <Button size="small" onClick={requestLogin}>登录后台</Button></>
        : <>暂时无法读取限流变更。 <Button size="small" onClick={() => load(history.nextCursor)}>重新加载</Button></>}/>}
      <Table rowKey="id" scroll={{ x: 'max(100%, 960px)' }} empty={history.loading ? '正在读取变更记录…' : history.error ? '变更记录暂不可用' : '暂无限流变更记录'}
        columns={columns} dataSource={history.items} pagination={{ pageSize: 10, hideOnSinglePage: true, showTotal: true }}/>
      {history.nextCursor && !history.error && <div>
        <Button size="small" loading={history.loading} onClick={() => load(history.nextCursor)}>读取更早的变更</Button>
      </div>}
    </div>
  </AdminSideSheet>;
}

function TrafficVisualization({ account, models, settings, close }) {
  const [query, setQuery] = useState('');
  const policy = accountTraffic(settings, account.id);
  const general = effectiveTraffic(settings, policy).hit;
  const rows = models.filter(row => match(query, row.name, row.modelId)).map(row => ({
    ...row, ...effectiveTraffic(settings, policy, row.id),
  }));
  const columns = [
    { title: '模型', dataIndex: 'name' },
    { title: '账号侧额度', width: 186, render: (_, row) => <div className="traffic-rate-cell">
      <RatePair limit={row.hit?.limit}/>
      {row.hit && <Text size="small" type="secondary">{row.hit.name}</Text>}
    </div> },
    { title: '模型共享上限', width: 186, render: (_, row) => <div className="traffic-rate-cell">
      <RatePair limit={row.model.limit}/>
      <Text size="small" type="secondary">{row.model.custom ? '模型自定义' : '模型默认'}</Text>
    </div> },
    { title: <FieldLabel name="最终上限" description={finalLimitHelp}/>, width: 186, className: 'traffic-final-cell',
      render: (_, row) => <RatePair limit={row.finalLimit} strong/> },
  ];
  return <AdminSideSheet visible title="限流可视化" width="min(1000px, 100vw)" closeOnEsc onCancel={close}
    footer={<Button onClick={close}>关闭</Button>}>
    <div className="traffic-policy-drawer">
      <AccountIdentity account={account}/>
      <div className="traffic-resolution-summary" aria-label="通用额度" role="group">
        <div className="traffic-rate-cell"><Text type="secondary">全局默认</Text><RatePair limit={settings.global}/></div>
        <div className="traffic-rate-cell"><Text type="secondary">账号自定义</Text><RatePair limit={policy.limit}/></div>
        <div className="traffic-rate-cell"><Text type="secondary">通用生效额度</Text><RatePair limit={general?.limit} strong/></div>
      </div>
      <div className="admin-list-toolbar">
        <Input className="admin-list-search" showClear aria-label="搜索模型" placeholder="搜索模型名称或标识"
          value={query} onChange={setQuery}/>
      </div>
      <Table key={query} rowKey="id" scroll={{ x: 'max(100%, 760px)' }} empty="暂无匹配模型"
        columns={columns} dataSource={rows} pagination={{ pageSize: 10, hideOnSinglePage: true, showTotal: true }}/>
    </div>
  </AdminSideSheet>;
}

function TrafficLogin({ accountId, onLogin, close }) {
  const [accessCode, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const passwordId = useId();

  async function submit(event) {
    event?.preventDefault();
    if (pending || !accessCode) return;
    setPending(true);
    setError('');
    try {
      await cloudAdminRequest('/auth/login', { method: 'POST', body: { accountId, accessCode } });
      await onLogin();
    } catch (issue) {
      setError(issue.message);
    } finally {
      setPending(false);
    }
  }

  return <Modal visible title="后台登录" okText="登录" onOk={submit} okButtonProps={{ loading: pending, disabled: !accessCode }}
    cancelButtonProps={{ disabled: pending }} onCancel={() => { if (!pending) close(); }}>
    <form onSubmit={submit}>
      <Text>账号：{accountId}</Text>
      <Form.Slot label={{ text: '后台密码', name: passwordId, required: true }}>
        <Input id={passwordId} mode="password" value={accessCode} onChange={setCode} autoComplete="current-password" autoFocus/>
      </Form.Slot>
      {error && <Banner type="danger" description={error} closeIcon={null}/>}
      <button type="submit" hidden/>
    </form>
  </Modal>;
}

export default function TrafficOperations({ state, dirtyRef }) {
  const accountId = state.adminSession.accountId;
  const modelPickerId = useId();
  const [remote, setRemote] = useState(null);
  const [login, setLogin] = useState(false);
  const [saving, setSaving] = useState(false);
  const settings = remote?.value;
  const global = settings?.global;
  const modelDefault = settings?.modelDefault;
  const accounts = trafficAccounts(state);
  const models = settings?.catalogue || [];
  const modelById = new Map(models.map(model => [model.id, model]));
  const [tab, setTab] = useState('users');
  const [accountQuery, setAccountQuery] = useState('');
  const [modelQuery, setModelQuery] = useState('');
  const [type, setType] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [draft, setDraft] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [visualizationId, setVisualizationId] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState(null);
  const opener = useRef(null);
  const submission = useRef(null);
  const isDirty = Boolean(draft && JSON.stringify(draft.rows) !== JSON.stringify(inputRows(draft.before)));
  useLayoutEffect(() => {
    dirtyRef.current = isDirty || saving;
    return () => { dirtyRef.current = false; };
  }, [dirtyRef, isDirty, saving]);

  const loadLimits = useCallback(async signal => {
    try {
      const value = await cloudAdminRequest(limitsPath, { signal });
      if (value.accountId !== accountId) throw Object.assign(new Error('请使用当前后台账号登录'), { status: 401 });
      if (!signal?.aborted) setRemote({ value });
      return value;
    } catch (issue) {
      const failure = issue.status ? issue : new Error('暂时无法读取限流配置，请重试。');
      if (!signal?.aborted) setRemote({ error: failure });
      throw failure;
    }
  }, [accountId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadLimits(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [loadLimits]);

  function begin(event, operation, id, before) {
    if (!settings || saving) return;
    opener.current = event.currentTarget;
    setDraft({ operation, id, before, rows: inputRows(before), revision: settings.revision });
    setError(null);
  }

  function updateRows(rows) {
    setDraft(current => ({ ...current, rows }));
    if (error?.code !== 'REVISION_CONFLICT' && !loginRequired(error)) setError(null);
  }

  function finish(restoreFocus = true) {
    dirtyRef.current = false;
    setDraft(null);
    setError(null);
    const trigger = opener.current;
    if (restoreFocus) requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
  }

  function clearSelection() {
    setSelectedIds([]);
    setError(null);
  }

  function discard(run = finish) {
    if (saving) return;
    if (!isDirty) { run(); return; }
    setConfirmation({ title: '放弃未保存的修改？', okText: '放弃修改', cancelText: '继续编辑',
      okButtonProps: { type: 'danger' }, onOk: run });
  }

  function saved() {
    Toast.success({ id: 'traffic-limits-saved', content: '限流配置已保存' });
  }

  async function commit(action, complete) {
    if (submission.current?.pending) return;
    const command = { ...action, accountId };
    const signature = JSON.stringify(command);
    const operationId = submission.current?.signature === signature ? submission.current.operationId : crypto.randomUUID();
    submission.current = { signature, operationId, pending: true };
    setSaving(true);
    try {
      try {
        await cloudAdminRequest(limitsPath, { method: 'POST', body: { ...command, operationId }, operationId });
      } catch (issue) {
        if (issue.status && issue.status < 500) {
          submission.current = null;
          throw issue;
        }
        try { await cloudAdminRequest('/operations/' + operationId); }
        catch { throw new Error('提交结果待确认，请重试或重新载入核对。操作 ID：' + operationId); }
      }
      submission.current = null;
      await loadLimits().catch(() => {});
      setError(null);
      complete();
      saved();
    } catch (issue) {
      setError(issue);
    } finally {
      if (submission.current) submission.current.pending = false;
      setSaving(false);
    }
  }

  function save() {
    const { operation, id, revision } = draft;
    try {
      const rows = draft.rows.map(row => readRow(row, modelById.get(row.modelId)?.name || row.modelId));
      const data = operation === 'exceptions' ? { exceptions: rows } : operation === 'batchAccounts'
        ? { accountIds: id ? [id] : selectedIds, limit: rows[0] } : rows[0];
      void commit({ operation, id, data, expectedRevision: revision }, () => {
        if (operation === 'batchAccounts' && !id) clearSelection();
        finish();
      });
    } catch (issue) {
      setError(issue);
    }
  }

  function refresh() {
    setRemote(null);
    void loadLimits().catch(() => {});
  }

  function restoreDefaults(event, { account, model } = {}) {
    const { revision } = settings;
    const limit = model ? modelDefault : global;
    const name = model?.name || account?.name || '所选 ' + selectedIds.length + ' 个账号';
    const action = model ? { operation: 'model', id: model.id, data: null }
      : { operation: 'batchAccounts', id: account?.id || '', data: { accountIds: account ? [account.id] : selectedIds, limit: null } };
    const content = <>
      <Text>{name}的{model ? '模型共享上限' : '通用额度'}将继承{model ? '模型默认' : '全局默认'}。</Text>
      <div className="traffic-restore-rates">{metrics.map(metric => <Text key={metric}>
        {trafficRateText(limit[metric], metric, true)} {trafficUnits[metric]}
      </Text>)}</div>
      {!model && <Text type="secondary">已配置的一客一策继续按模型生效。</Text>}
    </>;
    setConfirmation({ title: '恢复默认额度？', content, okText: '恢复默认', trigger: event.currentTarget,
      onOk: () => commit({ ...action, expectedRevision: revision }, () => { if (!account && !model) clearSelection(); }) });
  }

  async function closeConfirmation(apply) {
    const { trigger, onOk } = confirmation;
    setConfirmation(null);
    if (apply) await onOk();
    if (trigger) requestAnimationFrame(() => {
      const target = trigger.disabled ? trigger.closest('tr')?.querySelector('button:not(:disabled)') : trigger;
      if (target?.isConnected) target.focus();
    });
  }

  const revisionConflict = error?.code === 'REVISION_CONFLICT';
  const actionsDisabled = Boolean(draft || saving || !settings || revisionConflict || loginRequired(error));
  const editButton = (label, action) => <Button size="small" theme="borderless" onClick={action} disabled={actionsDisabled} aria-label={label}>编辑</Button>;
  const errorBanner = error && <Banner type="danger" description={<>{error.message}
    {revisionConflict && <Button size="small" disabled={saving} onClick={() => discard(() => { finish(); clearSelection(); refresh(); })}>载入最新配置</Button>}
    {loginRequired(error) && <Button size="small" onClick={() => setLogin(true)}>重新登录</Button>}
  </>} closeIcon={null}/>;
  const loadStatus = <>
    <Text type="secondary" role="status">{remote?.error
      ? loginRequired(remote.error) ? '登录后台后查看额度' : remote.error.message : '正在读取额度…'}</Text>
    {remote?.error && (loginRequired(remote.error)
      ? <Button size="small" onClick={() => setLogin(true)}>登录后台</Button>
      : <Button size="small" onClick={refresh}>重新加载</Button>)}
  </>;
  const accountRule = row => effectiveTraffic(settings, accountTraffic(settings, row.id)).hit;
  const accountRows = accounts.filter(row => match(accountQuery, row.name, row.id) && (type === 'all' || row.kind === type));
  const accountColumns = [
    { title: '账号名称', dataIndex: 'name' },
    { title: '账号 ID', dataIndex: 'id' },
    { title: '账号类型', dataIndex: 'kind', width: 82 },
    { title: '默认值', width: ratePairWidth, render: () => <RatePair limit={global}/> },
    { title: '生效值', width: ratePairWidth, render: (_, row) => <RatePair limit={accountRule(row)?.limit} strong/> },
    { title: '规则来源', width: 98, render: (_, row) => accountRule(row)?.name || '—' },
    { title: '一客一策', width: 144, render: (_, row) => {
      const { exceptions } = accountTraffic(settings, row.id);
      const count = exceptions.length;
      const label = count ? `管理策略（${count} 条）` : '添加策略';
      return settings ? <Button size="small" theme={count ? 'borderless' : 'light'}
        icon={count ? undefined : <IconPlus/>} disabled={actionsDisabled}
        aria-label={count ? `${row.name}的${label}` : `为${row.name}${label}`}
        onClick={event => begin(event, 'exceptions', row.id, exceptions)}>{label}</Button> : '—';
    } },
    { title: '操作', width: 236, className: 'traffic-row-actions', render: (_, row) => <Space spacing={4}>
      {editButton('编辑 ' + row.name, event => begin(event, 'batchAccounts', row.id, [accountRule(row)?.limit || {}]))}
      <Button size="small" theme="borderless" aria-label={row.name + '限流可视化'} onClick={() => setVisualizationId(row.id)} disabled={actionsDisabled}>限流可视化</Button>
      <Button size="small" theme="borderless" aria-label={'恢复 ' + row.name + ' 的默认额度'}
        disabled={actionsDisabled || !accountTraffic(settings, row.id).limit} onClick={event => restoreDefaults(event, { account: row })}>恢复默认</Button>
    </Space> },
  ];
  const rowSelection = {
    width: 40,
    selectedRowKeys: selectedIds,
    getCheckboxProps: row => ({ disabled: actionsDisabled, 'aria-label': '选择账号 ' + row.name }),
    onChange: keys => { if (!actionsDisabled) { setSelectedIds(keys || []); setError(null); } },
  };
  const batchDisabled = actionsDisabled || !selectedIds.length;
  const modelRows = models.filter(row => match(modelQuery, row.name, row.modelId)).map(row => ({
    ...row, ...modelTraffic(settings, row.id),
  }));
  const modelColumns = [
    { title: '模型名称', dataIndex: 'name' }, { title: '模型标识', dataIndex: 'modelId' },
    { title: '默认值', width: ratePairWidth, render: () => <RatePair limit={modelDefault}/> },
    { title: '生效值', width: ratePairWidth, render: (_, row) => <RatePair limit={row.limit} strong/> },
    { title: '规则来源', width: 98, render: (_, row) => row.custom ? '模型自定义' : '模型默认' },
    { title: '操作', width: 144, className: 'traffic-row-actions', render: (_, row) => <Space spacing={4}>
      {editButton('编辑 ' + row.name, event => begin(event, 'model', row.id, [row.limit]))}
      <Button size="small" theme="borderless" aria-label={'恢复 ' + row.name + ' 的默认额度'}
        disabled={actionsDisabled || !row.custom} onClick={event => restoreDefaults(event, { model: row })}>恢复默认</Button>
    </Space> },
  ];
  const pagination = { pageSize: 10, hideOnSinglePage: true, showTotal: true, disabled: Boolean(draft) };

  const account = draft?.id && accounts.find(row => row.id === draft.id);
  const visualizationAccount = visualizationId && accounts.find(row => row.id === visualizationId);
  const drawer = draft?.operation === 'exceptions';
  const choices = drawer ? models.filter(row => !draft.rows.some(rule => rule.modelId === row.id)) : [];
  const openModelPicker = drawer && !draft.before.length && Boolean(account) && choices.length > 0;
  function updateRate(index, metric, value) {
    updateRows(draft.rows.map((row, i) => i === index ? { ...row, [metric]: value } : row));
  }
  const policyColumns = [
    { title: '模型', render: (_, row) => modelById.get(row.modelId)?.name || row.modelId },
    ...metrics.map(metric => ({
      title: rateLabel(metric), align: 'right', width: rateWidths[metric],
      render: (_, row, index) => <RateInput metric={metric} value={row[metric]} modelName={modelById.get(row.modelId)?.name || row.modelId}
        disabled={saving || !modelById.has(row.modelId)} onChange={value => updateRate(index, metric, value)}/>,
    })),
    { title: '操作', width: 76, render: (_, row) => <Button size="small" theme="borderless" type="danger"
      aria-label={'移除 ' + (modelById.get(row.modelId)?.name || row.modelId)} disabled={saving}
      onClick={() => updateRows(draft.rows.filter(rule => rule.modelId !== row.modelId))}>移除</Button> },
  ];
  const defaultsEditing = draft?.operation === 'defaults';
  const batchEditing = draft?.operation === 'batchAccounts' && !draft.id;
  const saveBlocked = !isDirty || saving || revisionConflict || loginRequired(error);
  const dialogTitle = defaultsEditing ? '编辑全局默认' : draft?.operation === 'modelDefaults' ? '编辑模型默认'
    : batchEditing ? '批量修改额度' : draft?.operation === 'model'
    ? '编辑模型限流 · ' + modelById.get(draft.id)?.name : '编辑账号限流 · ' + account?.name;

  return <section className="traffic-page admin-page-stack">
    <AdminPageHeading title="限流配置">
      <Button disabled={Boolean(draft || saving)} onClick={() => setHistoryOpen(true)}>变更历史</Button>
    </AdminPageHeading>
    <Tabs type="line" activeKey={tab} onChange={value => {
      if (value !== tab) discard(() => { finish(false); clearSelection(); setTab(value); });
    }} aria-label="限流配置">
      <Tabs.TabPane tab="用户限流" itemKey="users">
        {tab === 'users' && <div className="traffic-tab">
          <Card className="traffic-list">
            <div className="admin-list-toolbar">
              <Input className="admin-list-search" showClear value={accountQuery} aria-label="搜索账号" placeholder="搜索账号名称或 ID"
                onChange={value => { setAccountQuery(value); clearSelection(); }} disabled={Boolean(draft)}/>
              <Choice label="筛选账号类型" options={[[ 'all', '全部账号类型' ], ['个人', '个人'], ['政企', '政企']]} value={type}
                onSelect={value => { setType(value); clearSelection(); }} disabled={Boolean(draft)}/>
              <DefaultInline title="全局默认" description={userDefaultHelp}>
                {global ? <>
                  <RatePair limit={global} strong/>
                  {editButton('编辑全局默认', event => begin(event, 'defaults', '', [global]))}
                </> : loadStatus}
              </DefaultInline>
            </div>
            <div className="admin-list-toolbar">
              <Text aria-live="polite">已选 {selectedIds.length} 个账号</Text>
              <Space wrap>
                <Button disabled={batchDisabled} onClick={event => begin(event, 'batchAccounts', '', [{}])}>批量修改额度</Button>
                <Button disabled={batchDisabled} onClick={event => restoreDefaults(event)}>恢复默认</Button>
              </Space>
            </div>
            {!draft && errorBanner}
            <Table key={accountQuery + ':' + type} rowKey="id" empty="暂无账号"
              scroll={{ x: 'max(100%, 1200px)' }} dataSource={accountRows} columns={accountColumns} pagination={pagination} rowSelection={rowSelection}/>
          </Card>
        </div>}
      </Tabs.TabPane>
      <Tabs.TabPane tab="模型限流" itemKey="models">
        {tab === 'models' && <div className="traffic-tab"><Card className="traffic-list">
          <div className="admin-list-toolbar">
            <Input className="admin-list-search" showClear value={modelQuery} aria-label="搜索模型" placeholder="搜索模型名称或标识"
              onChange={setModelQuery} disabled={Boolean(draft)}/>
            <DefaultInline title="模型默认" description={modelDefaultHelp}>
              {modelDefault ? <>
                <RatePair limit={modelDefault} strong/>
                {editButton('编辑模型默认', event => begin(event, 'modelDefaults', '', [modelDefault]))}
              </> : loadStatus}
            </DefaultInline>
          </div>
          {!draft && errorBanner}
          <Table key={modelQuery} rowKey="id" scroll={{ x: 'max(100%, 880px)' }}
            empty={settings ? '暂无模型' : remote?.error ? '模型限流暂不可用' : '正在读取模型限流…'}
            dataSource={modelRows} columns={modelColumns} pagination={pagination}/>
        </Card></div>}
      </Tabs.TabPane>
    </Tabs>
    {draft && !drawer && <Modal visible title={dialogTitle} okText="保存" onOk={save} onCancel={() => discard()}
      closeOnEsc={!confirmation && !login} cancelButtonProps={{ disabled: saving }}
      okButtonProps={{ loading: saving, disabled: saveBlocked }}>
      <form className="traffic-rate-dialog" onSubmit={event => { event.preventDefault(); if (!saveBlocked) void save(); }}>
        {defaultsEditing && <Text type="secondary">{userDefaultHelp}</Text>}
        {draft.operation === 'modelDefaults' && <Text type="secondary">{modelDefaultHelp}</Text>}
        {batchEditing && <Text>已选 {selectedIds.length} 个账号</Text>}
        <div className="traffic-rate-fields">
          {metrics.map(metric => <RateInput key={metric} metric={metric} value={draft.rows[0][metric]}
            disabled={saving} onChange={value => updateRate(0, metric, value)}/>)}
        </div>
        {errorBanner}
        <button type="submit" hidden disabled={saveBlocked}/>
      </form>
    </Modal>}
    {drawer && <AdminSideSheet visible title="一客一策" width="min(1000px, 100vw)" closeOnEsc={!confirmation} onCancel={() => discard()}
      footer={<>
        <Button onClick={() => discard()} disabled={saving}>{isDirty ? '取消' : '关闭'}</Button>
        <Button theme="solid" onClick={save} loading={saving} disabled={saveBlocked}>保存</Button>
      </>}>
      <div className="traffic-policy-drawer">
        <AccountIdentity account={account || { id: draft.id }}/>
        <div id={modelPickerId} className="traffic-policy-model-picker">
          <Text strong id={modelPickerId + '-label'}>添加模型策略</Text>
          {!draft.rows.length && choices.length > 0 &&
            <Text type="secondary">选择模型后，填写 RPM 和 TPM，再保存。</Text>}
          <Select aria-labelledby={modelPickerId + '-label'} placeholder={choices.length ? '搜索模型名称或 ID' : '没有可添加的模型'}
            filter motion={false} value="" defaultOpen={openModelPicker} autoFocus={openModelPicker}
            position="bottomLeft" getPopupContainer={() => document.getElementById(modelPickerId)}
            disabled={saving || !account || !choices.length}
            optionList={choices.map(row => ({ value: row.id, label: row.name + ' · ' + row.modelId }))}
            onSelect={modelId => updateRows([...draft.rows, ...inputRows([{ ...accountRule(account)?.limit, modelId }])])}/>
        </div>
        {errorBanner}
        {draft.rows.length > 0 && <Table rowKey="modelId" scroll={{ x: 'max(100%, 620px)' }}
          pagination={false} dataSource={draft.rows} columns={policyColumns}/>}
      </div>
    </AdminSideSheet>}
    {visualizationAccount && <TrafficVisualization account={visualizationAccount} models={models} settings={settings} close={() => setVisualizationId(null)}/>}
    {historyOpen && <TrafficHistory accountId={accountId} accounts={accounts} models={models} session={settings} login={login}
      requestLogin={() => setLogin(true)} close={() => setHistoryOpen(false)}/>}
    {confirmation && <Modal visible title={confirmation.title} okText={confirmation.okText}
      cancelText={confirmation.cancelText} okButtonProps={confirmation.okButtonProps} closeOnEsc
      onCancel={() => closeConfirmation(false)} onOk={() => closeConfirmation(true)}>
      {confirmation.content}
    </Modal>}
    {login && <TrafficLogin accountId={accountId} close={() => setLogin(false)} onLogin={async () => {
      const value = await loadLimits();
      setLogin(false);
      setError(draft && draft.revision !== value.revision
        ? Object.assign(new Error('限流配置已更新，当前输入已保留。'), { code: 'REVISION_CONFLICT' }) : null);
    }}/>}
  </section>;
}
