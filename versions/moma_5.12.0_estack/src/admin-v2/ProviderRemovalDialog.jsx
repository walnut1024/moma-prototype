import { useChannelText } from './channel-language';
import { useEffect, useState } from 'react';
import { Banner, Button, Space, Typography } from './xa24/HaloUI.jsx';
import { Steps } from './xa24/HaloUI.jsx';
import { AdminModal } from './AdminOverlay';
import Table from './AdminTable';
import { providerRemovalPlan } from './provider-removal';
import { cloudAdminRequest } from './admin-client.mjs';
import './provider-removal.css';

export default function ProviderRemovalDialog({ state, ops, target, close, removed, title, modelName }) {
  const translateLabel = useChannelText();
  const [step, setStep] = useState(0), [accepted, setAccepted] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [serviceLinks, setServiceLinks] = useState(null);
  const [serviceError, setServiceError] = useState('');
  const cloud = state.cloudOperations === true;
  useEffect(() => {
    if (!cloud) return;
    const request = new AbortController();
    cloudAdminRequest('/model-services-new', { signal: request.signal }).then(({ rows }) => {
      if (request.signal.aborted) return;
      setServiceLinks(rows.map(row => ({ name: row.name, callId: row.callId,
        channelIds: row.channels.filter(channel => !channel.simulated).map(channel => channel.channelId) })));
    }).catch(issue => { if (!request.signal.aborted) setServiceError(issue.message); });
    return () => request.abort();
  }, [cloud]);
  const loading = cloud && serviceLinks === null && !serviceError;
  let plan, missing;
  if (!loading && !serviceError) {
    try { plan = providerRemovalPlan(cloud ? { ...state, newModelServiceLinks: serviceLinks } : state, target); }
    catch (issue) { missing = issue.message; }
  }
  const stale = step === 1 && accepted !== plan?.signature;
  const blocked = !ops.can || busy || Boolean(ops.conflict) || !plan;
  const canConfirm = step === 1 && !blocked && !stale && plan?.ready;
  const selectedModel = target.associationId ? plan?.associations[0] : null;
  const modelScope = Boolean(target.associationId || target.associationIds);
  const retained = plan ? (plan.provider.catalogConnections || []).filter(row => !row.deletedAt && plan.endpoints.some(endpoint => endpoint.id === row.endpointId) && !plan.ids.has(row.id)) : [];
  const run = async operation => {
    const committing = operation === 'providerRemovalCommit';
    if (blocked || (committing && !canConfirm)) return;
    setBusy(true); setError(''); ops.setError('');
    try {
      const next = await ops.run(operation, { target, expectedSignature: committing ? accepted : plan.signature, confirmed: true });
      if (next && committing) removed();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  const cancel = () => { if (!busy) { ops.setError(''); close(); } };
  return <AdminModal visible title={(title || (target.associationIds ? '批量删除上游模型' : modelScope ? '删除上游模型' : target.endpointId ? '删除连接' : '删除服务商')) + (plan ? ' · ' + (modelName || plan.name) : '')}
    width="min(1120px, calc(100vw - 32px))" className="provider-removal-modal" onCancel={cancel} closeOnEsc
    footer={<Space><Button disabled={busy} onClick={cancel}>{translateLabel("取消")}</Button>{step === 1
      ? <><Button disabled={busy} onClick={() => { setStep(0); setError(''); ops.setError(''); }}>返回检查</Button>
        <Button theme="solid" type="danger" loading={busy} disabled={!canConfirm} onClick={() => run('providerRemovalCommit')}>确认删除</Button></>
      : <Button theme="solid" disabled={blocked || !plan?.ready} onClick={() => { setAccepted(plan.signature); setStep(1); }}>下一步：风险确认</Button>}</Space>}>
    <Steps type="basic" current={step}><Steps.Step title="关联检查与处理"/><Steps.Step title="风险确认"/></Steps>
    {selectedModel && <dl className="provider-removal-facts">
      <div><dt>{translateLabel('上游模型 ID')}</dt><dd>{selectedModel.upstreamModelId}</dd></div>
      <div><dt>所属连接</dt><dd>{plan.endpoints[0].name || plan.endpoints[0].id}</dd></div>
    </dl>}
    {loading ? <Typography.Paragraph>正在检查关联模型服务…</Typography.Paragraph>
      : serviceError ? <Banner type="danger" description={'无法检查关联模型服务，请重新打开后再试。' + serviceError}/>
      : missing ? <Banner type="danger" description={missing}/> : step === 0 ? <>
      {target.associationIds && <><Typography.Paragraph>已选 {plan.associations.length} 条上游模型记录，涉及 {plan.endpoints.length} 个连接。连接及其他 {retained.length} 条上游模型记录保留。</Typography.Paragraph>
        <Table size="small" rowKey="id" dataSource={plan.associations} pagination={false} columns={[
          { title: '模型展示名称', render: (_, row) => row.sourceName || row.name },
          { title: '上游模型 ID', dataIndex: 'upstreamModelId' },
        ]}/></>}
      <div className="provider-removal-summary"><Typography.Text strong>检查到 {plan.rows.length + plan.independentServices.length} 项关联服务</Typography.Text>
        <span>需停服 {plan.rows.filter(row => row.needsStop && row.callsEnabled).length} 项</span>
        <span>需停售 {plan.rows.filter(row => row.needsStop && row.listed).length} 项</span>
        <span>需调整路由 {plan.routes.filter(row => row.active).length} 项</span></div>
      <Table size="small" rowKey="id" className="provider-removal-table" dataSource={plan.rows} scroll={{ x: 900 }}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        empty={plan.independentServices.length ? '请按下方提示处理关联服务。' : '没有关联的模型服务或广场连接。'} columns={[
          { title: '模型服务', dataIndex: 'name', width: 155 }, { title: '模型 ID', dataIndex: 'callId', width: 160 },
          { title: '受影响连接', dataIndex: 'channelName', width: 160 },
          { title: '调用状态', width: 135, render: (_, row) => !row.callsEnabled ? '已停服' : row.keepServing ? row.routeActive ? '待退出当前路由' : '其他上游模型继续服务' : '服务中' },
          { title: '处理影响', width: 130, render: (_, row) => row.keepServing ? '服务继续运行' : row.needsStop ? '将停服并停售' : '无需预先停服' },
        ]}/>
      {plan.blockers.map(message => <Banner type="danger" description={message} key={message}/>)}
      {plan.routes.some(row => row.remainingError) && <Banner type="warning" description="部分剩余路由无法通过校验，对应服务将停服并停售；其他服务不受影响。"/>}
      {plan.needsProcessing && <div className="provider-removal-process"><Button theme="solid" type="danger" loading={busy}
        disabled={blocked || plan.blockers.length > 0} onClick={() => run('providerRemovalPrepare')}>停止受影响的模型服务并停售</Button>
        <Typography.Paragraph type="tertiary">处理立即生效。取消删除后，已停服的模型服务和已停售的模型售卖不会自动恢复。</Typography.Paragraph></div>}
      {plan.ready && <Banner type="success" description="关联检查通过：没有待停服、待停售的模型服务或活动依赖。"/>}
    </> : <>
      <Banner type="warning" description={selectedModel ? '确认删除后，该上游模型将无法通过当前连接调用。'
        : '删除后，这些上游模型将不能再被调用或订购。如需再次接入，请在模型接入中配置并测试对应的连接和上游模型。启用后可按需开售。'}/>
      <dl className="provider-removal-facts"><div><dt>{translateLabel("服务商")}</dt><dd>{plan.provider.name}</dd></div>
        {!selectedModel && <><div><dt>删除范围</dt><dd>{modelScope ? '所选上游模型' : target.endpointId ? '当前连接及其上游模型' : '服务商及其全部供给配置'}</dd></div>
          <div><dt>上游模型 / 连接</dt><dd>{plan.associations.length} 条上游模型记录 · {plan.endpoints.length} 个连接</dd></div></>}</dl>
      <Typography.Paragraph>模型资料、模型服务配置、其他服务商、历史价格、订单及审计记录均保留。{target.endpointId || modelScope ? '基础资料中的供应模型均保留。' : ''}{modelScope ? '所属连接保留。' : ''}</Typography.Paragraph>
      {stale && <Banner type="danger" description="关联数据已有变化，请返回第一步重新检查。"/>}
    </>}
    {(error || ops.error) && <Banner type="danger" description={error || ops.error}/>}
  </AdminModal>;
}
