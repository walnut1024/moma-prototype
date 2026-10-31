import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Choice, Field } from './ModelMetadataForm';
import { Modal, Notice, GridTable, Row, Cell } from './ModelOperationsUI';
import CandidateProbePanel from './CandidateProbePanel';
import { channelCandidateStatus, channelChangeImpact } from './channel-change-management';
import { connectionKeys } from './connection-state';
import { providerApiKeysDraft, providerApiKeyId } from './provider-management';
import { resolveChannelAssociationModel } from './channel-association-model';
import { supplierChannelName } from './supplier-resources';
import { credentialRotationChannels } from './credential-rotation-scope';

export default function ChannelCredentialRotation({ state, provider, endpoint: fixedEndpoint, endpointIds, record, ops, close }) {
  const [scopeIds] = useState(() => fixedEndpoint ? [fixedEndpoint.id] : endpointIds || state.endpoints.filter(row => row.providerId === provider.id && !row.deletedAt && row.authMode === 'specific' && row.apiKeyId === record?.apiKey.id).map(row => row.id));
  const available = state.endpoints.filter(row => scopeIds.includes(row.id) && row.providerId === provider.id && !row.deletedAt);
  const [selectedId, setSelectedId] = useState(fixedEndpoint?.id || (available.length === 1 ? available[0].id : 'unselected'));
  const endpoint = available.find(row => row.id === selectedId);
  if (endpoint) return <EndpointCredentialRotation key={endpoint.id} state={state} provider={provider} endpoint={endpoint} ops={ops} close={close}/>;
  return <Modal title="替换渠道专属密钥" description={provider.name} onClose={close}><Field label="替换范围"><Choice label="选择替换密钥的渠道" value={selectedId} options={[[ 'unselected', '请选择渠道' ], ...available.map(row => [row.id, supplierChannelName(provider, row)])]} disabled={!ops.can} onChange={setSelectedId}/></Field><p>每次只切换明确选中的渠道，其他引用继续使用原密钥。</p>{!available.length && <Notice error>渠道或密钥绑定已变化，请关闭后重新选择。</Notice>}</Modal>;
}
function EndpointCredentialRotation({ state, provider, endpoint, ops, close }) {
  const [rawKey, setRawKey] = useState(''), [edited, setEdited] = useState(false), [testing, setTesting] = useState(false), [preparing, setPreparing] = useState(false), [rollback, setRollback] = useState('unselected'), [applied, setApplied] = useState(null);
  const mounted = useRef(true), latest = useRef(null); latest.current = { state, provider, endpoint, ops };
  const candidate = endpoint.candidateConfiguration, key = connectionKeys(endpoint, provider, true)[0], impact = channelChangeImpact(state, provider.id, endpoint.id);
  const status = candidate && channelCandidateStatus(state, provider.id, endpoint.id);
  const otherReferences = key ? credentialRotationChannels(state, provider, key.id).filter(row => row.id !== endpoint.id) : [];
  const context = { providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0, candidateId: candidate?.id };
  const records = impact.mappings.map(mapping => { const master = resolveChannelAssociationModel(state, provider, mapping); return { associationId: mapping.id, modelId: master.id, upstreamModelId: mapping.upstreamModelId, type: master.type }; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!ops.can) setRawKey(''); }, [ops.can]);
  const beforeTest = async () => {
    if (!rawKey.trim()) { if (candidate && !edited) return { state, context }; throw new Error('请输入新的 API 密钥'); }
    setPreparing(true);
    try {
      const newApiKey = (await providerApiKeysDraft([rawKey])).apiKeys[0], current = latest.current;
      if (!mounted.current || !current.ops.can) return null;
      if (current.endpoint.id !== endpoint.id || channelChangeImpact(current.state, provider.id, endpoint.id).revision !== impact.revision) throw new Error('渠道或服务引用已变化，请重新核对替换范围');
      const next = current.ops.run('channelCandidateCredentialPrepare', { ...context, expectedImpactRevision: impact.revision, expectedKeyId: key?.id || '', expectedFingerprint: key?.fingerprint || '', newApiKey });
      if (!next) return null;
      const saved = next.endpoints.find(row => row.id === endpoint.id);
      setRawKey(''); setEdited(false);
      return { state: next, context: { ...context, candidateId: saved.candidateConfiguration.id } };
    } finally { if (mounted.current) setPreparing(false); }
  };
  return <Modal wide title="修改渠道密钥" description={`${provider.name} · ${supplierChannelName(provider, endpoint)}`} onClose={() => ops.proceed(close)} footer={<><Button variant="outline" onClick={() => ops.proceed(close)}>关闭</Button>{candidate && <Button disabled={!ops.can || !status.ready || edited || testing || preparing} onClick={() => { const next = ops.run('channelCandidateApply', { ...context, confirmed: true }); if (next) { const updated = next.endpoints.find(row => row.id === endpoint.id); setApplied({ keyId: updated.apiKeyId, version: updated.configurationRevision }); ops.dirty(false); } }}>应用新密钥</Button>}</>}>
    <div className="supplier-resource-form">
      {applied && <Notice>新密钥已应用至当前渠道，配置版本 {applied.version}，密钥 ID {applied.keyId}。</Notice>}
      <dl className="supplier-test-facts"><div><dt>当前密钥 ID</dt><dd>{key ? providerApiKeyId(key) : '未配置'}</dd></div><div><dt>替换范围</dt><dd>仅当前渠道 · {impact.mappings.length} 个模型 · {impact.services.length} 项服务</dd></div></dl>
      {otherReferences.length > 0 && <Notice>原密钥还被 {otherReferences.length} 个其他渠道引用。本次只修改当前渠道；其他渠道和共享组主要密钥保持原值。</Notice>}
      <Field label="新 API 密钥"><Input type="password" autoComplete="new-password" aria-label="替换渠道 API 密钥" placeholder={candidate ? '已保存候选；重新输入可替换候选' : '请输入新的 API 密钥'} maxLength={512} value={rawKey} disabled={!ops.can || testing || preparing} onChange={event => { setRawKey(event.target.value); setApplied(null); setEdited(true); ops.dirty(true); ops.setError(''); }}/></Field>
      <CandidateProbePanel state={state} context={context} ops={ops} beforeTest={beforeTest} initialRecords={records} onBusyChange={setTesting} pendingEdits={edited} testLabel="测试新密钥（产生用量）"/>
      {candidate && <><GridTable headings={['模型', '候选检查']} empty={!status.checks.length}>{status.checks.map(check => <Row key={check.associationId}><Cell>{check.modelId}</Cell><Cell>{check.passed ? '通过' : check.reason || status.credentialError || '待测试'}</Cell></Row>)}</GridTable>{status.credentialError && <Notice error>{status.credentialError}</Notice>}<Button variant="link" disabled={!ops.can || testing || preparing} onClick={() => { if (ops.run('channelCandidateDiscard', context)) { setRawKey(''); setEdited(false); } }}>放弃候选密钥</Button></>}
      {endpoint.configurationVersions?.length > 0 && <details><summary>历史配置与回退</summary><Choice label="回退密钥版本" value={rollback} options={[[ 'unselected', '请选择历史版本' ], ...endpoint.configurationVersions.map(row => [String(row.version), `版本 ${row.version} · ${row.appliedAt}`])]} disabled={!ops.can || testing || preparing} onChange={setRollback}/><Button variant="outline" disabled={!ops.can || rollback === 'unselected' || testing || preparing} onClick={() => { if (ops.run('channelCandidateRollback', { ...context, targetVersion: Number(rollback) })) { setRawKey(''); setApplied(null); setEdited(false); } }}>准备回退并重新测试</Button></details>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </div>
  </Modal>;
}
