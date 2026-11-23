import { useState } from 'react';
import { Banner, Button, Space, Steps, Typography } from '@douyinfe/semi-ui';
import { AdminModal } from './AdminOverlay';
import Table from './AdminTable';
import { providerRemovalPlan } from './provider-removal';
import { exportProviderJson } from './provider-intake';
import { downloadJsonFile } from './provider-files';
import './provider-intake.css';

export function RemovalButton({ state, ops, target, label = '删除', onRemoved, disabled, ariaLabel }) {
  const [open, setOpen] = useState(false);
  return <><Button theme="borderless" size="small" type="danger" aria-label={ariaLabel}
    disabled={!ops.can || disabled} onClick={() => ops.proceed(() => { ops.setError(''); setOpen(true); })}>{label}</Button>
    {open && <ProviderRemovalDialog state={state} ops={ops} target={target} close={() => setOpen(false)}
      removed={() => { setOpen(false); onRemoved?.(); }}/>}</>;
}

export default function ProviderRemovalDialog({ state, ops, target, close, removed, title }) {
  const [step, setStep] = useState(0), [accepted, setAccepted] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  let plan, missing;
  try { plan = providerRemovalPlan(state, target); } catch (error) { missing = error.message; }
  const stale = step === 1 && accepted !== plan?.signature;
  const blocked = !ops.can || busy || Boolean(ops.conflict) || !plan;
  const channelScope = Boolean(target.catalogueId || target.endpointId || target.associationIds);
  const retained = plan ? (plan.provider.catalogConnections || []).filter(row => !row.deletedAt && plan.endpoints.some(endpoint => endpoint.id === row.endpointId) && !plan.ids.has(row.id)) : [];
  const run = async operation => {
    if (blocked) return;
    setBusy(true); setError(''); ops.setError('');
    try {
      const next = await ops.run(operation, { target, expectedSignature: operation === 'providerRemovalCommit' ? accepted : plan.signature, confirmed: true });
      if (next && operation === 'providerRemovalCommit') removed();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  const cancel = () => { if (!busy) { ops.setError(''); close(); } };
  return <AdminModal visible title={(title || (target.catalogueId ? '删除供应模型' : target.associationIds ? '批量删除上游模型' : channelScope ? '删除上游模型' : '删除服务商')) + (plan ? ' · ' + plan.name : '')}
    width="min(1120px, calc(100vw - 32px))" className="provider-removal-modal" onCancel={cancel} closeOnEsc
    footer={<Space><Button disabled={busy} onClick={cancel}>取消</Button>{step === 1
      ? <><Button disabled={busy} onClick={() => { setStep(0); setError(''); ops.setError(''); }}>返回检查</Button>
        <Button theme="solid" type="danger" loading={busy} disabled={blocked || stale || !plan?.ready} onClick={() => run('providerRemovalCommit')}>确认删除</Button></>
      : <Button theme="solid" disabled={blocked || !plan?.ready} onClick={() => { setAccepted(plan.signature); setStep(1); }}>下一步：风险确认</Button>}</Space>}>
    <Steps type="basic" current={step}><Steps.Step title="关联检查与处理"/><Steps.Step title="风险确认"/></Steps>
    {missing ? <Banner type="danger" description={missing}/> : step === 0 ? <>
      {target.associationIds && <><Typography.Paragraph>已选 {plan.associations.length} 条上游模型记录，涉及 {plan.endpoints.length} 个连接；共用连接的其他 {retained.length} 条上游模型记录保留。连接下的所有上游模型移除后才会归档连接。</Typography.Paragraph>
        <Table size="small" rowKey="id" dataSource={plan.associations} pagination={false} columns={[
          { title: '模型展示名称', render: (_, row) => row.sourceName || row.name },
          { title: '上游模型 ID', dataIndex: 'upstreamModelId' },
        ]}/></>}
      <div className="provider-removal-summary"><Typography.Text strong>检查到 {plan.rows.length} 项关联服务</Typography.Text>
        <span>需停服 {plan.rows.filter(row => row.needsStop && row.callsEnabled).length} 项</span>
        <span>需停售 {plan.rows.filter(row => row.needsStop && row.listed).length} 项</span>
        <span>需调整路由 {plan.routes.filter(row => row.active).length} 项</span></div>
      <Table size="small" rowKey="id" className="provider-removal-table" dataSource={plan.rows} scroll={{ x: 900 }}
        pagination={{ pageSize: 10, hideOnSinglePage: true }} empty="没有关联的模型服务或广场连接，可以进入风险确认。" columns={[
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
      <Banner type="warning" description="删除后，该供给将不能再被调用或订购。重新录入后仍需验证、启用供给并重新开售。"/>
      <dl className="provider-removal-facts"><div><dt>服务商</dt><dd>{plan.provider.name}</dd></div>
        <div><dt>删除范围</dt><dd>{target.catalogueId ? '当前服务商的该上游模型登记及关联上游模型' : channelScope ? '所选上游模型' : '服务商及其全部供给配置'}</dd></div>
        <div><dt>上游模型 / 连接</dt><dd>{plan.associations.length} 条上游模型记录 · {plan.endpoints.length} 个连接</dd></div></dl>
      <Typography.Paragraph>移除模型最后一条接入记录时，同步归档该服务商的上游模型登记。模型资料、模型服务配置、其他服务商、历史价格、订单及审计记录均保留。失去供给的服务保持停服或停售，并显示“连接未接入”。</Typography.Paragraph>
      <Button theme="borderless" disabled={busy} onClick={() => downloadJsonFile(exportProviderJson(state, plan.provider), plan.provider.code + '-provider.json')}>导出当前 JSON</Button>
      {stale && <Banner type="danger" description="关联数据已有变化，请返回第一步重新检查。"/>}
    </>}
    {(error || ops.error) && <Banner type="danger" description={error || ops.error}/>}
  </AdminModal>;
}
