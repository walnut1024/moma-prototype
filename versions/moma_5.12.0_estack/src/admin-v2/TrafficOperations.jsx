import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Card, ConfigProvider, Input, InputNumber, Modal, Space, Table, Tabs, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import zhCN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN.js';
import { Choice } from './ServiceUI.jsx';
import { accountTraffic, effectiveTraffic, trafficAccounts, trafficModels, trafficSettings } from './traffic-limits.js';
import './traffic-operations.css';

const { Title, Text } = Typography;
const blank = { rpm: '', tpm: '' };
const format = new Intl.NumberFormat('zh-CN');
const number = value => Number.isSafeInteger(value) ? format.format(value) : '—';
const match = (query, ...fields) => fields.some(value => String(value ?? '').toLowerCase().includes(query.trim().toLowerCase()));

function TrafficSelect({ onChange, ...props }) {
  // Semi's controlled onChange waits for the popup animation to finish.
  return <Choice {...props} onSelect={value => onChange(value)}/>;
}

function RateInput({ metric, value, onChange }) {
  return <InputNumber aria-label={metric.toUpperCase()} value={value ?? ''} step={1} hideButtons
    className="traffic-rate-input" onChange={value => onChange(value === '' ? '' : Number(value))}/>;
}

function rateColumns(read, edit) {
  return ['rpm', 'tpm'].map(metric => ({
    title: metric.toUpperCase(), align: 'right', width: 112,
    render: (_, row) => {
      const change = edit(row, metric);
      const value = read(row)?.[metric];
      return change ? <RateInput metric={metric} value={value} onChange={change}/> : number(value);
    },
  }));
}

export default function TrafficOperations({ state, transact, conflict, dirtyRef }) {
  const settings = trafficSettings(state);
  const accounts = trafficAccounts(state);
  const models = trafficModels(state);
  const [tab, setTab] = useState('users');
  const [accountQuery, setAccountQuery] = useState('');
  const [modelQuery, setModelQuery] = useState('');
  const [type, setType] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const root = useRef(null);
  const opener = useRef(null);
  const isDirty = Boolean(draft && JSON.stringify(draft.data) !== draft.initial);
  dirtyRef.current = isDirty;

  useEffect(() => {
    if (!draft) return;
    root.current?.querySelector('.traffic-editing input, .traffic-editing [role="combobox"]')?.focus();
  }, [draft?.operation, draft?.id]);

  function begin(event, operation, id, data) {
    opener.current = event.currentTarget;
    setDraft({ operation, id, data, revision: state.revision, initial: JSON.stringify(data) });
    setError('');
  }

  function update(change) {
    setDraft(current => ({ ...current, data: change(current.data) }));
    setError('');
  }

  function finish(restoreFocus = true) {
    dirtyRef.current = false;
    setDraft(null);
    setError('');
    const trigger = opener.current;
    if (restoreFocus) requestAnimationFrame(() => {
      if (trigger?.isConnected) { trigger.focus(); return; }
      const replacement = Array.from(root.current?.querySelectorAll('button[aria-label]') || [])
        .find(button => button.getAttribute('aria-label') === trigger?.getAttribute('aria-label'));
      (replacement || root.current?.querySelector('.traffic-filters input'))?.focus();
    });
  }

  function clearSelection() {
    setSelectedIds([]);
    setError('');
  }

  function discard(run = finish) {
    if (!isDirty) { run(); return; }
    Modal.confirm({ title: '放弃未保存的修改？', okText: '放弃修改', cancelText: '继续编辑',
      okButtonProps: { 'aria-label': '放弃修改' }, cancelButtonProps: { 'aria-label': '继续编辑' }, onOk: run });
  }

  function persist(operation, id, data, expectedRevision, after) {
    try {
      transact({ operation, id, data, expectedRevision });
      after?.();
      Toast.success({ id: 'traffic-limits-saved', content: '限流配置已保存' });
    } catch (issue) {
      setError(issue.message);
    }
  }

  function save() {
    const { operation, id, data, revision } = draft;
    if (operation === 'batchAccounts') {
      persist(operation, id, data, revision, () => {
        if (!id) clearSelection();
        finish();
      });
    } else {
      persist(operation, id, data, revision, finish);
    }
  }

  const editing = (operation, id) => draft?.operation === operation && draft.id === id;
  const editorActions = <Space spacing={4}>
    <Button size="small" theme="solid" onClick={save} disabled={conflict}>保存</Button>
    <Button size="small" theme="borderless" onClick={() => discard()}>取消</Button>
  </Space>;
  const editButton = (text, action, label) => <Button size="small" theme="borderless" onClick={action} disabled={Boolean(draft)} aria-label={label}>{text}</Button>;
  const errorBanner = error && <Banner type="danger" description={error} closeIcon={null}/>;
  const rowError = error && <div className="traffic-row-error" role="alert"><Text type="danger">{error}</Text></div>;

  const defaultsEditing = editing('defaults', '');
  const defaults = defaultsEditing ? draft.data.global : settings.global;
  const defaultsPanel = <section className={`traffic-filters${defaultsEditing ? ' traffic-editing' : ''}`} aria-label="全局默认">
    <Text strong>全局默认</Text>
    {['rpm', 'tpm'].map(metric => <Space key={metric} spacing={4}>
      <Text type="secondary">{metric.toUpperCase()}</Text>
      {defaultsEditing
        ? <RateInput metric={metric} value={defaults?.[metric]} onChange={value => update(data => ({ ...data, global: { ...data.global, [metric]: value } }))}/>
        : <Text>{number(defaults?.[metric])}</Text>}
    </Space>)}
    {defaultsEditing ? editorActions
      : editButton('编辑', event => begin(event, 'defaults', '', { global: settings.global || blank }), '编辑全局默认')}
    {defaultsEditing && rowError}
  </section>;

  const accountRule = row => effectiveTraffic(settings, accountTraffic(row)).hit;
  const accountRows = accounts.filter(row => match(accountQuery, row.name, row.id)
    && (type === 'all' || row.kind === type));
  const accountColumns = [
    { title: '账号名称', dataIndex: 'name' },
    { title: '账号 ID', dataIndex: 'id' },
    { title: '账号类型', dataIndex: 'kind' },
    ...rateColumns(row => accountRule(row)?.limit, () => null),
    { title: '规则来源', render: (_, row) => accountRule(row)?.name || '未配置' },
    { title: '操作', render: (_, row) => editButton('编辑', event => begin(event, 'batchAccounts', row.id, {
      accountIds: [row.id], limit: accountRule(row)?.limit ?? blank,
    }), `编辑 ${row.name}`) },
  ];

  const accountEditing = draft?.operation === 'batchAccounts';
  const editedAccount = accountEditing && draft.id ? accounts.find(row => row.id === draft.id) : null;
  const batchDisabled = Boolean(draft || conflict || !selectedIds.length);
  const rowSelection = {
    selectedRowKeys: selectedIds,
    getCheckboxProps: row => ({ disabled: Boolean(draft), 'aria-label': `选择账号 ${row.name}` }),
    onChange: keys => { if (!draft) { setSelectedIds(keys || []); setError(''); } },
  };

  function restoreDefaults() {
    const { revision } = state;
    const content = settings.global
      ? `所选 ${selectedIds.length} 个账号将使用全局默认值（${number(settings.global.rpm)} RPM / ${number(settings.global.tpm)} TPM）。`
      : `全局默认值尚未配置。恢复后，所选 ${selectedIds.length} 个账号的通用额度将显示为未配置。`;
    Modal.confirm({ title: '恢复默认额度？', content, okText: '恢复默认',
      okButtonProps: { 'aria-label': '恢复默认' },
      onOk: () => persist('batchAccounts', '', { accountIds: selectedIds, limit: null }, revision, clearSelection) });
  }

  const modelRows = models.filter(row => match(modelQuery, row.name, row.modelId)).map(row => ({
    ...row, limit: settings.models.find(rule => rule.modelId === row.id),
  }));
  const modelColumns = [
    { title: '模型名称', dataIndex: 'name' }, { title: '模型标识', dataIndex: 'modelId' },
    ...rateColumns(row => editing('model', row.id) ? draft.data : row.limit, (row, metric) => editing('model', row.id)
      ? value => update(data => ({ ...data, [metric]: value })) : null),
    { title: '配置状态', render: (_, row) => <Tag color={row.limit ? 'green' : 'grey'}>{row.limit ? '已配置' : '未配置'}</Tag> },
    { title: '操作', render: (_, row) => editing('model', row.id) ? <>{editorActions}{rowError}</>
      : editButton('编辑', event => begin(event, 'model', row.id, row.limit || blank), `编辑 ${row.name}`) },
  ];
  const pagination = { pageSize: 10, hideOnSinglePage: true, showTotal: true, disabled: Boolean(draft) };

  return <ConfigProvider locale={zhCN}><section ref={root} className="traffic-page">
    <Title heading={3}>限流配置</Title>
    {conflict && <Banner type="warning" description="数据已变化。请载入新版本后重新开始编辑。"/>}
    <Tabs type="line" activeKey={tab} onChange={value => {
      if (value !== tab) discard(() => { finish(false); clearSelection(); setTab(value); });
    }} aria-label="限流配置">
      <Tabs.TabPane tab="用户限流" itemKey="users">
        {tab === 'users' && <div className="traffic-tab">
          <Card className="traffic-list">
            {defaultsPanel}
            <div className="traffic-filters">
              <Input showClear value={accountQuery} aria-label="搜索账号" placeholder="搜索账号名称或 ID" onChange={value => { setAccountQuery(value); clearSelection(); }} disabled={Boolean(draft)}/>
              <TrafficSelect label="筛选账号类型" options={[[ 'all', '全部账号类型' ], ['个人', '个人'], ['政企', '政企']]} value={type} onChange={value => { setType(value); clearSelection(); }} disabled={Boolean(draft)}/>
            </div>
            <div className="traffic-filters">
              <Text aria-live="polite">已选 {selectedIds.length} 个账号</Text>
              <Space wrap>
                <Button disabled={batchDisabled} onClick={event => begin(event, 'batchAccounts', '', { accountIds: selectedIds, limit: blank })}>批量修改额度</Button>
                <Button disabled={batchDisabled} onClick={restoreDefaults}>恢复默认</Button>
              </Space>
            </div>
            {error && !draft && <div role="alert">{errorBanner}</div>}
            <Table key={`${accountQuery}:${type}`} rowKey="id" size="small" empty="暂无账号"
              scroll={{ x: 'max(100%, 840px)' }} dataSource={accountRows} columns={accountColumns} pagination={pagination} rowSelection={rowSelection}/>
          </Card>
        </div>}
      </Tabs.TabPane>
      <Tabs.TabPane tab="模型限流" itemKey="models">
        {tab === 'models' && <div className="traffic-tab"><Card className="traffic-list">
          <div className="traffic-filters">
            <Input showClear value={modelQuery} aria-label="搜索模型" placeholder="搜索模型名称或标识" onChange={setModelQuery} disabled={Boolean(draft)}/>
          </div>
          <Table key={modelQuery} rowKey="id" size="small" scroll={{ x: 'max(100%, 720px)' }} empty="暂无模型" dataSource={modelRows} columns={modelColumns} pagination={pagination}
            rowClassName={row => editing('model', row.id) ? 'traffic-editing' : ''}/>
        </Card></div>}
      </Tabs.TabPane>
    </Tabs>
    {accountEditing && <Modal visible title={draft.id ? `编辑账号限流 · ${editedAccount?.name ?? draft.id}` : '批量修改额度'} okText="保存" cancelText="取消" maskClosable={false}
      width="min(480px, calc(100vw - 32px))"
      onOk={save} onCancel={() => finish()} okButtonProps={{ disabled: conflict || Boolean(draft.id && !isDirty), 'aria-label': '保存' }}
      cancelButtonProps={{ 'aria-label': '取消' }}>
      <Space vertical align="start">
        {!draft.id && <Text>已选 {draft.data.accountIds.length} 个账号</Text>}
        <Space wrap>{['rpm', 'tpm'].map(metric => <Space key={metric}>
          <Text>{metric.toUpperCase()}</Text>
          <RateInput metric={metric} value={draft.data.limit[metric]}
            onChange={value => update(data => ({ ...data, limit: { ...data.limit, [metric]: value } }))}/>
        </Space>)}</Space>
        {error && <div role="alert">{errorBanner}</div>}
      </Space>
    </Modal>}
  </section></ConfigProvider>;
}
