import CandidateProbePanel from './CandidateProbePanel';
import { useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Choice, Field } from './ModelMetadataForm';
import { GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { KeyEditor } from './ProviderApiKeys';
import { providerApiKeyId, providerApiKeyName } from './provider-management';
import { providerKeyGroups } from './provider-key-groups';
import { supplierChannelCode, supplierChannelName } from './supplier-resources';
import { channelChangeImpact, keyGroupCandidateStatus } from './channel-change-management';
import './supplier-change-dialogs.css';

const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : '—';
const keyLabel = key => key ? `${providerApiKeyName(key)} · ${providerApiKeyId(key)}` : '—';

export default function KeyGroupCandidateDialog({ state, provider, group, ops, close, initialKeyId = '' }) {
  const currentGroup = providerKeyGroups(provider).find(row => row.id === group.id);
  const candidate = provider.keyGroupCandidates?.find(row => row.groupId === group.id);
  const revision = provider.keyGroupRevisions?.[group.id] || 0;
  const [keyId, setKeyId] = useState(candidate?.keyIds[0] || initialKeyId), [addingKey, setAddingKey] = useState(false), [confirming, setConfirming] = useState(false), [expanded, setExpanded] = useState(null), [testingEndpoint, setTestingEndpoint] = useState(null);
  const parentDirty = useRef(false), childDirty = useRef(false), addTrigger = useRef(null);
  const keys = (provider.apiKeys || []).filter(key => currentGroup?.keyIds.includes(key.id));
  const eligible = keys.filter(key => key.status !== 'disabled' && !key.revokedAt);
  const endpoints = state.endpoints.filter(row => row.providerId === provider.id && !row.deletedAt && (row.authMode === 'group' && row.keyGroupId === group.id || group.id === 'default' && row.authMode === 'inherit'));
  const impacts = endpoints.map(endpoint => ({ endpoint, ...channelChangeImpact(state, provider.id, endpoint.id) }));
  const services = [...new Map(impacts.flatMap(impact => impact.services).map(service => [service.id, service])).values()];
  const status = keyGroupCandidateStatus(state, provider.id, group.id);
  const checks = new Map(status.checks.map(check => [check.endpointId, check]));
  const testable = impacts.filter(impact => impact.mappings.length > 0), pending = testable.filter(impact => !checks.get(impact.endpoint.id)?.ready), testBatch = pending.slice(0, 50);
  const staleConfirmation = confirming && (confirming.candidateId !== candidate?.id || confirming.expectedGroupVersion !== revision);
  const argumentsFor = () => ({ providerId: provider.id, groupId: group.id, expectedGroupVersion: revision, candidateId: candidate?.id });
  const run = (operation, values = {}) => { setConfirming(false); return ops.run(operation, { ...argumentsFor(), ...values }); };
  const cancel = () => ops.proceed(close);
  const closeKey = () => { setAddingKey(false); ops.dirty(parentDirty.current); ops.setError(''); requestAnimationFrame(() => addTrigger.current?.focus()); };
  const keyOps = {
    ...ops,
    dirty: dirty => { childDirty.current = dirty; ops.dirty(parentDirty.current || dirty); },
    proceed: callback => childDirty.current ? ops.proceed(() => { ops.dirty(parentDirty.current); callback(); }) : callback(),
    run: (...args) => {
      const result = ops.run(...args);
      if (result) {
        const added = result.providers.find(row => row.id === provider.id)?.apiKeys?.find(key => !provider.apiKeys?.some(old => old.id === key.id));
        if (added) { setKeyId(added.id); parentDirty.current = true; }
        childDirty.current = false;
      }
      ops.dirty(parentDirty.current || !result && childDirty.current);
      return result;
    },
  };
  if (!currentGroup) return <Modal title="密钥组已变化" description={provider.name} onClose={close}><Notice error>当前密钥组已不存在，请关闭后重新选择。</Notice></Modal>;
  if (addingKey) return <KeyEditor provider={provider} group={currentGroup} ops={keyOps} close={closeKey}/>;
  const selectedImpact = impacts.find(impact => impact.endpoint.id === expanded);
  return <Modal wide title="密钥组候选配置" description={`${provider.name} · ${currentGroup.name}`} onClose={cancel} footer={<Button variant="outline" onClick={cancel}>关闭</Button>}>
    <div className="supplier-change-dialog">
      <dl className="supplier-test-facts"><div><dt>生效版本</dt><dd>{revision}</dd></div><div><dt>当前主要密钥</dt><dd>{keyLabel(keys.find(key => key.id === currentGroup.keyIds[0]))}</dd></div><div><dt>影响范围</dt><dd>{endpoints.length} 个渠道，{impacts.reduce((sum, impact) => sum + impact.mappings.length, 0)} 条模型关联，{services.length} 项关联服务</dd></div></dl>
      <div className="supplier-change-fields"><Field label="候选主要密钥"><Choice label="候选主要密钥" value={keyId || 'unselected'} options={[[ 'unselected', '请选择组内可用密钥' ], ...eligible.map(key => [key.id, keyLabel(key)])]} disabled={!ops.can} onChange={id => { setKeyId(id === 'unselected' ? '' : id); setConfirming(false); ops.dirty(true); ops.setError(''); }}/></Field><Button ref={addTrigger} variant="outline" disabled={!ops.can} onClick={() => { parentDirty.current = ops.hasUnsaved(); childDirty.current = false; setAddingKey(true); setConfirming(false); }}>添加密钥</Button></div>
      {candidate && <Notice>已有尚未应用的候选：{keyLabel(keys.find(key => key.id === candidate.keyIds[0]))}。保存新候选后需重新测试，生效配置保持当前版本。</Notice>}
      <div className="supplier-change-actions"><Button variant="outline" disabled={!ops.can || !keyId || keyId === currentGroup.keyIds[0]} onClick={() => { const result = run('keyGroupCandidateSave', { keyId }); if (result) parentDirty.current = false; }}>保存候选</Button>{candidate && <Button variant="link" disabled={!ops.can} onClick={() => { if (run('keyGroupCandidateDiscard')) { setKeyId(''); parentDirty.current = false; } }}>放弃候选</Button>}</div>
      <GridTable headings={['引用渠道', '模型关联', '关联服务', '候选检查', '操作']} empty={!impacts.length} emptyMessage="当前密钥组没有引用渠道。">
        {impacts.map(impact => <Row key={impact.endpoint.id}><Cell>{supplierChannelName(provider, impact.endpoint)}<small>{supplierChannelCode(impact.endpoint)}</small></Cell><Cell>{impact.mappings.length}</Cell><Cell>{impact.services.length}</Cell><Cell>{checks.get(impact.endpoint.id)?.ready ? '通过' : checks.get(impact.endpoint.id)?.credentialError || (candidate ? '待测试' : '未创建候选')}</Cell><Cell><div className="supplier-change-actions"><Button variant="link" onClick={() => setExpanded(expanded === impact.endpoint.id ? null : impact.endpoint.id)}>查看模型</Button><Button variant="link" disabled={!ops.can || !candidate || !impact.mappings.length} onClick={() => setTestingEndpoint(impact.endpoint.id)}>测试</Button></div></Cell></Row>)}
      </GridTable>
      {selectedImpact && <section className="supplier-change-section"><h3>{supplierChannelName(provider, selectedImpact.endpoint)} · 模型检查</h3><GridTable headings={['模型', '上游 ID', '检查结果']} empty={!selectedImpact.mappings.length} emptyMessage="此渠道尚无模型关联。">{selectedImpact.mappings.map(mapping => {
        const result = checks.get(selectedImpact.endpoint.id)?.checks.find(check => check.associationId === mapping.id);
        return <Row key={mapping.id}><Cell>{mapping.modelId}</Cell><Cell><code>{mapping.upstreamModelId}</code></Cell><Cell>{result?.passed ? '通过' : result?.reason || '待测试'}</Cell></Row>;
      })}</GridTable>{selectedImpact.services.length > 0 && <details><summary>服务路由引用</summary><ul>{selectedImpact.services.map(service => <li key={service.id}><code>{service.id}</code> · 路由版本 {service.version}</li>)}</ul></details>}</section>}
      {candidate && <section className="supplier-change-section"><h3>测试并应用</h3><p>测试覆盖候选密钥的引用模型，可能产生上游用量；费用未知时不会按免费处理。</p><div className="supplier-change-actions"><Button variant="outline" disabled={!ops.can || !testBatch.length} onClick={() => setTestingEndpoint(testBatch[0]?.endpoint.id)}>{testBatch.length ? '测试下一引用渠道' : '引用渠道已通过'}</Button><span>{checks.size ? `${[...checks.values()].filter(check => check.ready).length} / ${endpoints.length} 个渠道通过` : '待测试'}</span></div>{!status.ready && (status.reason || status.credentialError) && <Notice error>{status.reason || status.credentialError}</Notice>}{staleConfirmation && <Notice error>候选或生效版本已变化，请取消应用后重新核对。</Notice>}{confirming && <Notice>将原子切换 {endpoints.length} 个引用渠道的密钥版本。客户售价、允许供给范围与路由策略保持不变。</Notice>}<div className="supplier-change-actions">{confirming && <Button variant="outline" onClick={() => setConfirming(false)}>取消应用</Button>}<Button disabled={!ops.can || !status.ready || staleConfirmation} onClick={() => { if (!confirming) setConfirming({ candidateId: candidate.id, expectedGroupVersion: revision }); else if (run('keyGroupCandidateApply', { confirmed: true, candidateId: confirming.candidateId, expectedGroupVersion: confirming.expectedGroupVersion })) { setKeyId(''); parentDirty.current = false; } }}>{confirming ? '确认应用候选' : '应用候选配置'}</Button></div></section>}
      {candidate && testingEndpoint && <CandidateProbePanel key={candidate.id + testingEndpoint} state={state} context={{ ...argumentsFor(), endpointId: testingEndpoint }} ops={ops}/>}
      <section className="supplier-change-section"><h3>版本记录</h3><GridTable headings={['版本', '主要密钥 ID', '应用时间', '操作']} empty={!provider.keyGroupVersions?.some(version => version.groupId === group.id)} emptyMessage="尚无密钥组版本记录。">{(provider.keyGroupVersions || []).filter(version => version.groupId === group.id).slice().reverse().map(version => <Row key={version.version}><Cell>{version.version}{version.version === revision && <small>当前生效</small>}</Cell><Cell><code>{version.keyIds[0]}</code></Cell><Cell>{time(version.appliedAt)}</Cell><Cell><Button variant="link" disabled={!ops.can || version.version === revision} onClick={() => { const result = run('keyGroupCandidateRollback', { targetVersion: version.version }); if (result) { setKeyId(result.providers.find(row => row.id === provider.id).keyGroupCandidates.find(row => row.groupId === group.id).keyIds[0]); parentDirty.current = false; } }}>准备回滚</Button></Cell></Row>)}</GridTable></section>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </div>
  </Modal>;
}
