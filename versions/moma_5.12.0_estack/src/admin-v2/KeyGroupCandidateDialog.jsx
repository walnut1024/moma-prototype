import CandidateProbePanel from './CandidateProbePanel';
import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@douyinfe/semi-ui';
import { Choice, Field } from './ServiceUI';
import { Disclosure, GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { providerApiKeysDraft, providerApiKeyId, providerApiKeyName } from './provider-management';
import { providerKeyGroups } from './provider-key-groups';
import { supplierChannelCode, supplierChannelName } from './supplier-resources';
import { channelChangeImpact, keyGroupCandidateStatus, keyGroupRotationSignature } from './channel-change-management';
import { resolveChannelAssociationModel } from './channel-association-model';
import './supplier-change-dialogs.css';

const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : '—';
const keyLabel = key => key ? `${providerApiKeyName(key)} · ${providerApiKeyId(key)}` : '—';

export default function KeyGroupCandidateDialog({ state, provider, group, ops, close, initialKeyId = '', excludedSpecificCount = 0 }) {
  const currentGroup = providerKeyGroups(provider).find(row => row.id === group.id), candidate = provider.keyGroupCandidates?.find(row => row.groupId === group.id), revision = provider.keyGroupRevisions?.[group.id] || 0;
  const [keyId, setKeyId] = useState(initialKeyId || candidate?.keyIds[0] || 'new'), [rawKey, setRawKey] = useState(''), [edited, setEdited] = useState(Boolean(initialKeyId)), [expanded, setExpanded] = useState(null), [testRun, setTestRun] = useState(null), [testingEndpoint, setTestingEndpoint] = useState(''), [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false), [applied, setApplied] = useState(null);
  const mounted = useRef(true), latest = useRef(null); latest.current = { state, provider, ops, testRun };
  const keys = (provider.apiKeys || []).filter(key => currentGroup?.keyIds.includes(key.id)), eligible = keys.filter(key => key.status !== 'disabled' && !key.revokedAt);
  const endpoints = state.endpoints.filter(row => row.providerId === provider.id && !row.deletedAt && (row.authMode === 'group' && row.keyGroupId === group.id || group.id === 'default' && row.authMode === 'inherit'));
  const impacts = endpoints.map(endpoint => ({ endpoint, ...channelChangeImpact(state, provider.id, endpoint.id) })), services = [...new Map(impacts.flatMap(impact => impact.services).map(service => [service.id, service])).values()];
  const status = keyGroupCandidateStatus(state, provider.id, group.id), checks = new Map(status.checks.map(check => [check.endpointId, check]));
  const testable = impacts.filter(impact => impact.mappings.length > 0), currentEndpointId = testRun?.endpointIds[testRun.index] || testingEndpoint || testable[0]?.endpoint.id;
  const currentImpact = impacts.find(impact => impact.endpoint.id === currentEndpointId), locked = busy || preparing || Boolean(testRun);
  const args = () => ({ providerId: provider.id, groupId: group.id, expectedGroupVersion: revision, candidateId: candidate?.id });
  const context = { ...args(), endpointId: currentEndpointId };
  const records = currentImpact?.mappings.map(mapping => { const master = resolveChannelAssociationModel(state, provider, mapping); return { associationId: mapping.id, modelId: master.id, upstreamModelId: mapping.upstreamModelId, type: master.type }; }) || [];
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!ops.can) { setRawKey(''); setTestRun(null); } }, [ops.can]);
  const prepare = async () => {
    if (!edited && candidate) return state;
    const expectedScope = keyGroupRotationSignature(state, provider.id, group.id);
    setPreparing(true);
    try {
      const newApiKey = keyId === 'new' ? (await providerApiKeysDraft([rawKey])).apiKeys[0] : null, current = latest.current;
      if (!mounted.current || !current.ops.can) return null;
      if (expectedScope !== keyGroupRotationSignature(current.state, provider.id, group.id)) throw new Error('密钥组或引用范围已变化，请重新核对');
      const next = await current.ops.run(newApiKey ? 'keyGroupCandidatePrepare' : 'keyGroupCandidateSave', { ...args(), ...(newApiKey ? { newApiKey, expectedScope } : { keyId }) });
      if (next) { setRawKey(''); setEdited(false); }
      return next;
    } finally { if (mounted.current) setPreparing(false); }
  };
  const startTesting = async (onlyEndpointId = '') => {
    try {
      const next = await prepare(); if (!next) return;
      const savedProvider = next.providers.find(row => row.id === provider.id), savedCandidate = savedProvider.keyGroupCandidates.find(row => row.groupId === group.id);
      const endpointIds = onlyEndpointId ? [onlyEndpointId] : testable.map(row => row.endpoint.id);
      if (!endpointIds.length) return;
      setTestingEndpoint(endpointIds[0]);
      setTestRun({ candidateId: savedCandidate.id, endpointIds, index: 0, startToken: crypto.randomUUID() });
    } catch (error) { if (mounted.current) ops.setError(error.message); }
  };
  const completed = ({ context: finished, batch }) => {
    const current = latest.current.testRun;
    if (!current || finished.candidateId !== current.candidateId || finished.endpointId !== current.endpointIds[current.index]) return;
    if (batch.items.some(item => item.status !== 'passed') || current.index + 1 >= current.endpointIds.length) { setTestRun(null); setBusy(false); return; }
    setTestingEndpoint(current.endpointIds[current.index + 1]);
    setTestRun({ ...current, index: current.index + 1, startToken: crypto.randomUUID() });
  };
  if (!currentGroup) return <Modal title="密钥组已变化" description={provider.name} onClose={close}><Notice error>当前密钥组已不存在，请关闭后重新选择。</Notice></Modal>;
  const priorityChange = candidate?.priorityChange === true;
  const selectedImpact = impacts.find(impact => impact.endpoint.id === expanded);
  return <Modal wide title={priorityChange?"调整密钥优先级":"轮换共享组密钥"} description={`${provider.name} · ${currentGroup.name}`} onClose={() => ops.proceed(close)} footer={<><Button theme="light" onClick={() => ops.proceed(close)}>关闭</Button>{candidate && <Button disabled={!ops.can || !status.ready || edited || locked} onClick={async () => { const next = await ops.run('keyGroupCandidateApply', { ...args(), confirmed: true }); if (next) { if(priorityChange){ops.dirty(false);close();return;} setApplied({ version: next.providers.find(row => row.id === provider.id).keyGroupRevisions[group.id], count: endpoints.length }); setKeyId('new'); setEdited(false); ops.dirty(false); } }}>{priorityChange?'应用优先级':'应用新密钥'}</Button>}</>}>
    <div className="supplier-change-dialog">
      {applied && <Notice>新密钥已应用至 {applied.count} 个共享组渠道，生效版本 {applied.version}。</Notice>}
      <dl className="supplier-test-facts"><div><dt>生效版本</dt><dd>{revision}</dd></div><div><dt>当前主要密钥</dt><dd>{keyLabel(keys.find(key => key.id === currentGroup.keyIds[0]))}</dd></div><div><dt>影响范围</dt><dd>{endpoints.length} 个渠道 · {impacts.reduce((sum, impact) => sum + impact.mappings.length, 0)} 条模型关联 · {services.length} 项服务</dd></div></dl>
      {excludedSpecificCount > 0 && <Notice>另有 {excludedSpecificCount} 个渠道使用专属绑定。本次只轮换共享组，专属绑定继续使用原密钥。</Notice>}
      {!priorityChange && <><Field label="新主要密钥"><Choice label="新主要密钥来源" value={keyId} options={[[ 'new', '输入新密钥' ], ...eligible.map(key => [key.id, keyLabel(key)])]} disabled={!ops.can || locked} onChange={id => { setKeyId(id); setRawKey(''); setApplied(null); setEdited(true); ops.dirty(true); ops.setError(''); }}/></Field>
      {keyId === 'new' && <Field label="新 API 密钥"><Input aria-label="新的共享组 API 密钥" mode="password" autoComplete="new-password" maxLength={512} placeholder={candidate ? '已保存候选；重新输入可替换候选' : '请输入新的 API 密钥'} value={rawKey} disabled={!ops.can || locked} onChange={value => { setRawKey(value); setApplied(null); setEdited(true); ops.dirty(true); ops.setError(''); }}/></Field>}
      </>}
      {priorityChange && <GridTable headings={['密钥名称 / ID','当前优先级','调整后优先级']} empty={false}>{candidate.keyIds.map((id,index)=>{const key=keys.find(row=>row.id===id);return <Row key={id}><Cell>{keyLabel(key)}</Cell><Cell>{currentGroup.keyIds.indexOf(id)+1}</Cell><Cell>{index+1}</Cell></Row>;})}</GridTable>}
      <GridTable headings={['引用渠道', '模型关联', '关联服务', '候选检查', '操作']} empty={!impacts.length} emptyMessage="当前密钥组没有引用渠道。">{impacts.map(impact => <Row key={impact.endpoint.id}><Cell>{supplierChannelName(provider, impact.endpoint)}<small>{supplierChannelCode(impact.endpoint)}</small></Cell><Cell>{impact.mappings.length}</Cell><Cell>{impact.services.length}</Cell><Cell>{checks.get(impact.endpoint.id)?.ready ? '通过' : checks.get(impact.endpoint.id)?.credentialError || (candidate ? '待测试' : '未创建候选')}</Cell><Cell><div className="supplier-change-actions"><Button type="tertiary" theme="borderless" onClick={() => setExpanded(expanded === impact.endpoint.id ? null : impact.endpoint.id)}>查看模型</Button>{candidate && <Button type="tertiary" theme="borderless" disabled={!ops.can || locked || !impact.mappings.length} onClick={() => { setTestingEndpoint(impact.endpoint.id); setTestRun(null); }}>查看测试</Button>}</div></Cell></Row>)}</GridTable>
      {selectedImpact && <GridTable headings={['模型', '上游 ID']} empty={!selectedImpact.mappings.length}>{selectedImpact.mappings.map(mapping => <Row key={mapping.id}><Cell>{mapping.modelId}</Cell><Cell><code>{mapping.upstreamModelId}</code></Cell></Row>)}</GridTable>}
      {currentImpact ? <><p>点击测试将依次检查上述 {testable.length} 个渠道，费用未知。全部通过后才可明确应用，测试不会切换当前密钥。</p><Button theme="light" disabled={!ops.can || locked} onClick={() => startTesting()}>{priorityChange?'测试调整后的密钥（产生用量）':'测试新密钥（产生用量）'}</Button>{candidate && <CandidateProbePanel key={currentEndpointId} state={state} context={context} initialRecords={records} ops={ops} startToken={testRun?.startToken} onComplete={completed} onBusyChange={setBusy} pendingEdits={edited} testLabel="重测当前渠道（产生用量）"/>}{testRun && <Button type="tertiary" theme="borderless" onClick={() => setTestRun(null)}>停止后续渠道测试</Button>}</> : <Button theme="light" disabled={!ops.can || locked} onClick={async () => { try { await prepare(); } catch (error) { ops.setError(error.message); } }}>准备新密钥</Button>}
      {candidate && <Button type="tertiary" theme="borderless" disabled={!ops.can || locked} onClick={async () => { if (await ops.run('keyGroupCandidateDiscard', args())) { setRawKey(''); setEdited(false); if(priorityChange)close(); } }}>{priorityChange?'放弃本次调整':'放弃候选密钥'}</Button>}
      {!status.ready && candidate && (status.reason || status.checks.find(row => !row.ready)?.credentialError) && <Notice error>{status.reason || status.checks.find(row => !row.ready)?.credentialError}</Notice>}
      <Disclosure title="版本记录与回退"><GridTable headings={['版本', '主要密钥 ID', '应用时间', '操作']} empty={!provider.keyGroupVersions?.some(version => version.groupId === group.id)} emptyMessage="尚无密钥组版本记录。">{(provider.keyGroupVersions || []).filter(version => version.groupId === group.id).slice().reverse().map(version => <Row key={version.version}><Cell>{version.version}{version.version === revision && <small>当前生效</small>}</Cell><Cell><code>{version.keyIds[0]}</code></Cell><Cell>{time(version.appliedAt)}</Cell><Cell><Button type="tertiary" theme="borderless" disabled={!ops.can || locked || version.version === revision} onClick={async () => { const next = await ops.run('keyGroupCandidateRollback', { ...args(), targetVersion: version.version }); if (next) { setKeyId(next.providers.find(row => row.id === provider.id).keyGroupCandidates.find(row => row.groupId === group.id).keyIds[0]); setRawKey(''); setEdited(false); } }}>准备回退</Button></Cell></Row>)}</GridTable></Disclosure>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </div>
  </Modal>;
}
