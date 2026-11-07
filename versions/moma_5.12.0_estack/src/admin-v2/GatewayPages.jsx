import Table from './AdminTable';
import AdminPageHeading from './AdminPageHeading';
import { useEffect, useId, useRef, useState } from 'react';
import { Banner, Button, Card, Checkbox, Form, Modal, Space, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus } from '@douyinfe/semi-icons';
import { simulateRequest } from './domain';
import { Choice, serviceOperationsUi } from './ServiceUI';
import './gateway-settings.css';

const collection = { routes: 'routes', limits: 'limits', fallback: 'fallbacks', cache: 'caches', releases: 'releases' };
export const gatewaySettingsPages = Object.keys(collection);
const meta = {
  routes: ['路由策略', '配置模型到端点的加权或优先级选路。'],
  limits: ['限流与并发', '按租户、项目、API 密钥、模型或端点设置有效上限。'],
  fallback: ['熔断与回退', '配置超时、错误率阈值和无环回退链。'],
  cache: ['缓存策略', '按权限上下文控制缓存、TTL 和命中统计。'],
  releases: ['配置版本与发布', '校验配置差异，发布或生成可追溯的回滚版本。'],
};
const limitScopes = [
  { value: 'tenant', label: '租户' }, { value: 'project', label: '项目' }, { value: 'key', label: 'API 密钥' }, { value: 'model', label: '模型' },
];
const cacheScopes = ['tenant+model', 'project+model', 'key+model'].map(value => ({ value, label: value }));
const uid = prefix => `${prefix}-${Date.now()}`;

function Status({ value }) {
  const tone = ['通过', '已启用', '当前生效'].includes(value) ? 'green' : 'grey';
  return <Tag color={tone}>{value === '草稿' ? '未发布' : value}</Tag>;
}

function Editor({ pageId, state, dispatch, close }) {
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const formId = useId();
  const dismiss = () => dirty ? setDiscarding(true) : close();
  const formBody = useRef(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => formBody.current?.querySelector('input')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const options = (items, name) => items.map(item => ({ value: item.id, label: item[name] }));
  const endpointOptions = options(state.endpoints, 'endpointId');
  const modelOptions = options(state.models, 'modelId');
  const routeOptions = options(state.routes, 'routeId');
  const initialValues = {
    routes: { modelId: modelOptions[0]?.value, endpointA: endpointOptions[0]?.value, endpointB: endpointOptions[0]?.value, weightA: 70, weightB: 30 },
    limits: { scopeType: limitScopes[0].value, rpm: 100, tpm: 100000, concurrency: 10 },
    fallback: { routeId: routeOptions[0]?.value, primary: endpointOptions[0]?.value, secondary: endpointOptions[0]?.value, timeoutMs: 3000, errorRate: 5 },
    cache: { scope: cacheScopes[0].value, ttl: 600 },
  };
  const save = values => {
    const id = uid(pageId), name = values.name ?? '';
    let record;
    if (pageId === 'routes') {
      const { routeId, modelId, endpointA, endpointB } = values;
      const weightA = Number(values.weightA), weightB = Number(values.weightB);
      const targets = [{ endpointId: endpointA, weight: weightA }, { endpointId: endpointB, weight: weightB }];
      if (!routeId || weightA + weightB !== 100 || targets.some(target => !Number.isInteger(target.weight) || target.weight < 0 || target.weight > 100)) {
        return setError('Route ID 必填，两个端点权重之和必须为 100%');
      }
      if (endpointA === endpointB) return setError('两个路由端点不能重复');
      if (targets.some(target => !state.endpoints.find(endpoint => endpoint.id === target.endpointId)?.modelIds.includes(modelId))) {
        return setError('路由端点必须映射所选 Model ID');
      }
      record = { id, routeId, name, modelId, targets, mode: '加权', status: '已启用', releaseId: null };
    }
    if (pageId === 'limits') {
      const [rpm, tpm, concurrency] = [values.rpm, values.tpm, values.concurrency].map(Number);
      if ([rpm, tpm, concurrency].some(value => !Number.isInteger(value) || value < 1)) return setError('RPM、TPM 和并发必须为正整数');
      record = { id, name, scopeType: values.scopeType, scopeId: values.scopeId ?? '', rpm, tpm, concurrency, status: '已启用' };
    }
    if (pageId === 'fallback') {
      const { routeId, primary, secondary } = values;
      const timeoutMs = Number(values.timeoutMs), errorRate = Number(values.errorRate);
      if (primary === secondary) return setError('回退端点不能与主端点相同');
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || !Number.isInteger(errorRate) || errorRate < 1 || errorRate > 100) return setError('超时和错误率阈值超出有效范围');
      record = { id, name, routeId, timeoutMs, errorRate, chain: [primary, secondary], status: '已启用' };
    }
    if (pageId === 'cache') {
      const ttl = Number(values.ttl);
      if (!Number.isInteger(ttl) || ttl < 1) return setError('TTL 必须为正整数');
      record = { id, name, scope: values.scope, ttl, exclusions: values.exclusions ?? '', hitRate: 0, savedTokens: 0, status: '已启用' };
    }
    if (dispatch({ type: 'add', collection: collection[pageId], record })) close();
  };
  const initial = initialValues[pageId];
  return <>
    <Modal visible width="min(560px, calc(100vw - 32px))" title={`新建${meta[pageId][0]}`}
      closeOnEsc={!discarding} maskClosable={false} onCancel={dismiss}
      footer={<div className="gateway-editor-actions">
        <Button theme="light" onClick={dismiss}>取消</Button>
        <Button theme="solid" htmlType="submit" form={formId}>保存并生效</Button>
      </div>}>
      <div ref={formBody}>
        <Form id={formId} initValues={initial} onSubmit={save} onValueChange={values => {
          setError('');
          const fields = new Set([...Object.keys(initial), ...Object.keys(values)]);
          setDirty([...fields].some(field => (values[field] ?? '') !== (initial[field] ?? '')));
        }}>
          {pageId === 'routes' && <>
            <Form.Input field="routeId" label="Route ID"/>
            <Form.Input field="name" label="名称"/>
            <Form.Select motion={false} field="modelId" label="Model ID" optionList={modelOptions}/>
            <Form.Select motion={false} field="endpointA" label="主端点" optionList={endpointOptions}/>
            <Form.InputNumber field="weightA" label="主端点权重"/>
            <Form.Select motion={false} field="endpointB" label="次端点" optionList={endpointOptions}/>
            <Form.InputNumber field="weightB" label="次端点权重"/>
          </>}
          {pageId === 'limits' && <>
            <Form.Input field="name" label="规则名称"/>
            <Form.Select motion={false} field="scopeType" label="作用层级" optionList={limitScopes}/>
            <Form.Input field="scopeId" label="作用对象 ID"/>
            <Form.InputNumber field="rpm" label="RPM"/>
            <Form.InputNumber field="tpm" label="TPM"/>
            <Form.InputNumber field="concurrency" label="并发"/>
          </>}
          {pageId === 'fallback' && <>
            <Form.Input field="name" label="规则名称"/>
            <Form.Select motion={false} field="routeId" label="路由" optionList={routeOptions}/>
            <Form.InputNumber field="timeoutMs" label="超时 ms"/>
            <Form.InputNumber field="errorRate" label="错误率阈值 %"/>
            <Form.Select motion={false} field="primary" label="主端点" optionList={endpointOptions}/>
            <Form.Select motion={false} field="secondary" label="回退端点" optionList={endpointOptions}/>
          </>}
          {pageId === 'cache' && <>
            <Form.Input field="name" label="策略名称"/>
            <Form.Select motion={false} field="scope" label="隔离范围" optionList={cacheScopes}/>
            <Form.InputNumber field="ttl" label="TTL 秒"/>
            <Form.Input field="exclusions" label="排除规则" placeholder="例如敏感策略命中"/>
          </>}
          {error && <Banner type="danger" closeIcon={null} description={error}/>}
        </Form>
      </div>
    </Modal>
    {discarding && serviceOperationsUi.renderLeaveDialog({
      cancel: () => setDiscarding(false),
      discard: close,
    })}
  </>;
}

function Releases({ state, dispatch }) {
  const current = state.releases.find(item => item.status === '当前生效');
  const save = (record, diff) => {
    const version = `r-${String(state.releases.length + 1).padStart(3, '0')}`;
    const next = { ...record, id: uid('release'), version, previousReleaseId: current?.id ?? null,
      diff, publishedAt: new Date().toISOString(), status: '当前生效' };
    dispatch({ type: 'batch', objectId: version, changes: [
      ...state.releases.filter(item => item.status === '当前生效').map(item => ({ type: 'update', collection: 'releases', id: item.id, changes: { status: '历史版本' } })),
      { type: 'add', collection: 'releases', record: next },
    ] });
  };
  const publish = () => {
    if (!state.routes.every(route => route.targets.reduce((total, item) => total + item.weight, 0) === 100)) {
      Toast.error('配置校验失败，请检查路由权重后重试');
      return;
    }
    save({ configSnapshot: `${state.routes.length} routes · ${state.limits.length} limits · ${state.fallbacks.length} fallbacks`, validation: '通过' }, '发布当前配置快照');
  };
  const columns = [
    { title: '版本', dataIndex: 'version' },
    { title: '配置快照', dataIndex: 'configSnapshot' },
    { title: '差异', dataIndex: 'diff' },
    { title: '校验', dataIndex: 'validation', render: value => <Status value={value}/> },
    { title: '状态', dataIndex: 'status', render: value => <Status value={value}/> },
    { title: '发布时间', dataIndex: 'publishedAt', render: value => value?.slice(0, 16).replace('T', ' ') || '—' },
    { title: '操作', render: (_, item) => item.status !== '当前生效' &&
      <Button size="small" theme="borderless" onClick={() => save(item, `回滚至 ${item.version}`)}>回滚到此版本</Button> },
  ];
  return <>
    <Card><div className="gateway-settings-heading">
      <Space><Typography.Text strong>当前配置</Typography.Text><Typography.Text type="secondary">{state.routes.length} 条路由</Typography.Text></Space>
      <Button theme="solid" onClick={publish}>保存版本快照</Button>
    </div></Card>
    <Card><Table size="small" rowKey="id" dataSource={state.releases} columns={columns} pagination={false} scroll={{ x: 'max(100%, 780px)' }}/></Card>
  </>;
}

function Simulator({ state, dispatch }) {
  const [keyId, setKeyId] = useState('key-002');
  const [modelId, setModelId] = useState('model-1');
  const [timeout, setTimeoutFlag] = useState(false);
  const [result, setResult] = useState('');
  const run = () => {
    const requestId = `req_gateway_${Date.now()}`;
    const { request, changes } = simulateRequest(state, { requestId, keyId, modelId, forceTimeout: timeout, purpose: 'gateway-test' });
    if (!dispatch({ type: 'batch', objectId: requestId, changes, feedback: false })) return;
    Toast[request.httpStatus >= 400 ? 'error' : 'success'](`网关请求测试：HTTP ${request.httpStatus}`);
    const outcome = request.cacheHit ? '缓存命中' : request.attempts.length > 1 ? '回退成功' : request.attempts.at(-1)?.error || '路由成功';
    setResult(`${request.httpStatus} · ${outcome} · ${request.releaseId || '无发布版本'}`);
  };
  return <Card>
    <div className="gateway-settings-heading">
      <div>
        <Typography.Title heading={5}>网关请求测试</Typography.Title>
        <Typography.Paragraph type="secondary" role="status">{result || '验证鉴权、限流、选路、回退、缓存与发布版本'}</Typography.Paragraph>
      </div>
      <Space wrap>
        <Choice label="API 密钥 ID" value={keyId} options={state.apiKeys.map(item => [item.id, item.keyId])} onSelect={setKeyId}/>
        <Choice label="Model ID" value={modelId} options={state.models.map(item => [item.id, item.modelId])} onSelect={setModelId}/>
        <Checkbox checked={timeout} onChange={event => setTimeoutFlag(event.target.checked)}>主端点超时场景</Checkbox>
        <Button theme="solid" onClick={run}>发送请求</Button>
      </Space>
    </div>
  </Card>;
}

const listColumns = {
  routes: ['Route ID', '名称', 'Model ID', '方式', '端点 / 权重'],
  limits: ['规则名称', '层级 / 对象', 'RPM', 'TPM', '并发'],
  fallback: ['规则名称', '路由', '超时', '错误率', '回退链'],
  cache: ['策略名称', '隔离范围', 'TTL', '排除规则', '命中率', '节省 Token'],
};
function rowCells(pageId, item, state) {
  const endpoint = id => state.endpoints.find(row => row.id === id)?.endpointId;
  if (pageId === 'routes') return [item.routeId, item.name, state.models.find(row => row.id === item.modelId)?.modelId, item.mode,
    item.targets.map(target => `${endpoint(target.endpointId)}:${target.weight}%`).join(' → ')];
  if (pageId === 'limits') return [item.name, `${item.scopeType} / ${item.scopeId}`, item.rpm, item.tpm, item.concurrency];
  if (pageId === 'fallback') return [item.name, state.routes.find(row => row.id === item.routeId)?.routeId,
    `${item.timeoutMs} ms`, `${item.errorRate}%`, item.chain.map(endpoint).join(' → ')];
  return [item.name, item.scope, `${item.ttl}s`, item.exclusions, `${item.hitRate}%`, item.savedTokens.toLocaleString()];
}

export default function GatewayPage({ pageId, state, dispatch }) {
  const [creating, setCreating] = useState(false);
  const [title, description] = meta[pageId];
  const releases = pageId === 'releases';
  const rows = releases ? [] : state[collection[pageId]].map(item => ({ ...item, cells: rowCells(pageId, item, state) }));
  const columns = (listColumns[pageId] ?? []).map((title, index) => ({ title, key: title, render: (_, item) => item.cells[index] ?? '—' }));
  const update = (item, changes) => dispatch({ type: 'update', collection: collection[pageId], id: item.id, changes });
  return (
    <div className="gateway-settings admin-page-stack">
      <AdminPageHeading title={title} description={description}>
        {!releases && <Button icon={<IconPlus aria-hidden="true"/>} theme="solid" onClick={() => setCreating(true)}>新建</Button>}
      </AdminPageHeading>
      {releases ? <Releases state={state} dispatch={dispatch}/> : <>
        {['routes', 'fallback', 'cache'].includes(pageId) && <Simulator state={state} dispatch={dispatch}/>}
        <Card><Table size="small" rowKey="id" dataSource={rows} pagination={false} scroll={{ x: 'max(100%, 760px)' }} columns={[
          ...columns,
          { title: '状态', dataIndex: 'status', render: value => <Status value={value}/> },
          { title: '操作', key: 'actions', render: (_, item) => {
            const stopped = item.status.includes('停用');
            return <Space spacing={4}>
              <Button size="small" theme="borderless" onClick={() => update(item, { status: stopped ? '已启用' : '已停用' })}>{stopped ? '启用' : '停用'}</Button>
              {pageId === 'cache' && <Button size="small" theme="borderless"
                onClick={() => update(item, { invalidatedAt: new Date().toISOString(), hitRate: 0, savedTokens: 0 })}>清理缓存</Button>}
            </Space>;
          } },
        ]}/></Card>
        {creating && <Editor pageId={pageId} state={state} dispatch={dispatch} close={() => setCreating(false)}/>}
      </>}
    </div>
  );
}
