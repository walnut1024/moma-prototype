import { useState } from 'react';
import { Button, Checkbox, Input, Space, Table, Typography } from '@douyinfe/semi-ui';
import { Modal, Notice } from './ModelOperationsUI';
import { Choice, Field } from './ServiceUI';
import { activeRouteVersion, routingServices, routingChannels, serviceRoute } from './service-routing';

export default function ChannelDirectoryTagEdit({ tag, members, state, ops, close }) {
  const [scope] = useState(() => members.map(row => row.id).sort());
  const stale = JSON.stringify(scope) !== JSON.stringify(members.map(row => row.id).sort());
  const providers = [...new Map(members.map(row => [row.provider.id, row.provider])).values()];
  const [providerId, setProviderId] = useState(providers[0]?.id || '');
  const [mode, setMode] = useState('append'), [modelId, setModelId] = useState(''), [upstreamModelId, setUpstream] = useState('');
  const [serviceId, setServiceId] = useState(''), [groupId, setGroupId] = useState('');
  const [selected, setSelected] = useState([]), [confirmed, setConfirmed] = useState(null);
  const [busy, setBusy] = useState(false), [results, setResults] = useState(null);
  const provider = providers.find(row => row.id === providerId);
  const services = routingServices(state).filter(row => serviceRoute(state, row.id));
  const service = services.find(row => row.id === serviceId), route = service && serviceRoute(state, serviceId);
  const config = route?.draft || activeRouteVersion(route)?.config;
  const candidates = service && config ? new Set(routingChannels(state, service).filter(row => config.channels.some(channel => channel.supplyId === row.id)).map(row => row.endpointId)) : new Set();
  const eligible = members.filter(row => mode === 'route' ? candidates.has(row.id) : row.provider.id === providerId);
  const chosen = eligible.filter(row => selected.includes(row.id));
  const targets = chosen.map(row => ({ endpointId: row.id, expectedUpdatedAt: row.endpoint.updatedAt }));
  const routeSignature = mode === 'route' && route ? JSON.stringify([route.activeVersion, route.draftUpdatedAt, route.draft || null]) : '';
  const confirmationScope = JSON.stringify([targets, routeSignature]);
  const scopeConfirmed = confirmed === confirmationScope;
  const reset = callback => value => { callback(value); setSelected([]); setConfirmed(null); };
  const save = async () => {
    if (busy || !ops.can || !scopeConfirmed) return;
    setBusy(true);
    try {
      const next = await ops.run('channelDirectoryTagEdit', { tag, memberIds: scope, confirmed: scopeConfirmed, mode, providerId, modelId, upstreamModelId,
        ...(mode === 'route' ? { serviceId, groupId, routeSignature } : {}),
        targets });
      if (next) setResults(next.audits[0].directoryOperationResults || []);
    } finally { setBusy(false); }
  };
  const skipped = results?.filter(row => row.status !== '已完成') || [];
  return <Modal wide drawer title="按标签批量编辑" description={tag + ' · ' + members.length + ' 条连接'} onClose={() => !busy && close()}
    footer={<Space wrap><Button disabled={busy} onClick={close}>关闭</Button>
      {results ? <Button disabled={!skipped.length || stale || !ops.can} onClick={() => {
        setSelected(skipped.map(row => row.endpointId)); setConfirmed(null); setResults(null);
      }}>重新核对跳过项</Button> : <Button theme="solid" disabled={busy || stale || !ops.can || !scopeConfirmed || !chosen.length || chosen.length > 20 ||
        (mode === 'route' ? !groupId || !route : !modelId || !upstreamModelId.trim())} onClick={save}>
        {mode === 'route' ? '保存服务路由草稿' : '确认应用所选'}</Button>}
    </Space>}>
    {stale && <Notice error>标签成员已变化，请关闭后重新打开。</Notice>}
    {results ? <>{mode === 'route' ? <Notice>已保存服务路由草稿，可在模型服务中试调用并发布。</Notice> :
      <Table size="small" rowKey="endpointId" dataSource={results} pagination={false} columns={[
        { title: '连接', render: (_, row) => members.find(item => item.id === row.endpointId)?.name || row.endpointId },
        { title: '结果', dataIndex: 'status' }, { title: '原因', render: (_, row) => row.reason || '—' },
      ]}/>}</> : <>
      <Field label="批量操作"><Choice label="按标签操作" value={mode} onChange={reset(setMode)} disabled={busy}
        options={[[ 'append', '追加模型渠道' ], [ 'replace', '替换已有上游模型标识' ], [ 'route', '设置服务路由分组草稿' ]]}/></Field>
      {mode === 'route' ? <>
        <Field label="模型服务"><Choice label="模型服务" value={serviceId || 'unselected'} options={[[ 'unselected', '选择模型服务' ], ...services.map(row => [row.id, row.callId])]}
          onChange={reset(value => { setServiceId(value); setGroupId(''); })} disabled={busy}/></Field>
        <Field label="目标分组"><Choice label="目标分组" value={groupId || 'unselected'} options={[[ 'unselected', '选择目标分组' ], ...(config?.groups || []).map(row => [row.id, row.name])]}
          onChange={value => { setGroupId(value === 'unselected' ? '' : value); setConfirmed(null); }} disabled={busy}/></Field>
      </> : <>
        <Field label="服务商"><Choice label="服务商" value={providerId} options={providers.map(row => [row.id, row.name])} disabled={busy}
          onChange={reset(value => { setProviderId(value); setModelId(''); setUpstream(''); })}/></Field>
        <Field label="已登记模型"><Choice label="已登记模型" value={modelId || 'unselected'}
          options={[[ 'unselected', '选择模型' ], ...(provider?.catalogModels || []).filter(row => row.libraryId).map(row => [row.modelId, row.name || row.modelId])]}
          disabled={busy} onChange={value => { setModelId(value === 'unselected' ? '' : value); setUpstream(value === 'unselected' ? '' : value); setConfirmed(null); }}/></Field>
        <Field label="上游模型调用标识"><Input aria-label="上游模型调用标识" value={upstreamModelId} maxLength={200} disabled={busy}
          onChange={value => { setUpstream(value); setConfirmed(null); }}/></Field>
      </>}
      <Table size="small" rowKey="id" dataSource={eligible} pagination={{ pageSize: 10, hideOnSinglePage: true }} columns={[
        { title: '选择', render: (_, row) => <Checkbox aria-label={'选择 ' + row.name} checked={selected.includes(row.id)} disabled={!ops.can || busy || stale}
          onChange={event => { setSelected(previous => event.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id)); setConfirmed(null); }}/> },
        { title: '连接', dataIndex: 'name' }, { title: '服务商', render: (_, row) => row.provider.name },
        { title: '已有模型', render: (_, row) => row.models.map(model => model.modelName).join('、') || '—' },
      ]}/>
      <Typography.Paragraph>已选 {chosen.length} 条连接。</Typography.Paragraph>
      <Checkbox checked={scopeConfirmed} disabled={!ops.can || busy || stale || !chosen.length} onChange={event => setConfirmed(event.target.checked ? confirmationScope : null)}>
        {mode === 'route' ? '已核对服务、候选分组和连接范围' : '已核对所选连接的采购范围及模型匹配'}
      </Checkbox>
    </>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
