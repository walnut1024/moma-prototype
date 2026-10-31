import CandidateProbePanel from './CandidateProbePanel';
import ChannelAdvancedFields from './ChannelAdvancedFields';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Choice, Field } from './ModelMetadataForm';
import { Modal, Notice, GridTable, Row, Cell } from './ModelOperationsUI';
import { SupplierKeyGroupField } from './SupplierKeyGroupField';
import { CHANNEL_INTERFACES, suggestChannelRoot } from './channel-interface';
import { channelChangeImpact, channelCandidateStatus } from './channel-change-management';
import { connectionCredentialsReady } from './connection-state';

export default function ChannelCandidateEditor({ state, provider, endpoint, ops, close, mode = 'all' }) {
  const candidate = endpoint.candidateConfiguration;
  const [value, setValue] = useState(() => ({ interfaceType: endpoint.interfaceType || '', protocol: endpoint.protocol, baseUrl: endpoint.baseUrl, authMode: endpoint.authMode || 'inherit', keyGroupId: endpoint.keyGroupId || 'default', apiKeyId: endpoint.apiKeyId || '', timeoutSeconds: endpoint.timeoutSeconds || 60, capacity: endpoint.capacity ?? '', taskUrls: endpoint.taskUrls || {}, adapterOptions: endpoint.adapterOptions || {}, ...candidate?.config }));
  const [confirm, setConfirm] = useState(false), [rollback, setRollback] = useState('unselected'), [edited, setEdited] = useState(false), [deleting, setDeleting] = useState(false);
  let suggestedRoot = ''; try { suggestedRoot = value.interfaceType && value.interfaceType !== 'custom' ? suggestChannelRoot({ ...value, allowHttp: provider.sourceType === 'selfHosted' }) : ''; } catch { /* Incomplete edits are validated on save. */ }
  const impact = channelChangeImpact(state, provider.id, endpoint.id), status = candidate && channelCandidateStatus(state, provider.id, endpoint.id, {});
  const staleConfirmation = confirm && (confirm.candidateId !== candidate?.id || confirm.revision !== (endpoint.configurationRevision || 0) || confirm.impact !== impact.revision);
  const context = { providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0, candidateId: candidate?.id };
  const set = patch => { setValue(current => ({ ...current, ...patch })); setConfirm(false); setEdited(true); ops.dirty(true); ops.setError(''); };
  const run = (operation, extra = {}) => ops.run(operation, { ...context, ...extra });
  const save = () => {
    const config = mode === 'credentials' ? { authMode: value.authMode, keyGroupId: value.keyGroupId, apiKeyId: value.apiKeyId } : { interfaceType: value.interfaceType, protocol: value.protocol, baseUrl: value.baseUrl, timeoutSeconds: value.timeoutSeconds, capacity: value.capacity, taskUrls: value.taskUrls, adapterOptions: value.adapterOptions, ...(value.authMode !== (endpoint.authMode || 'inherit') || value.keyGroupId !== (endpoint.keyGroupId || 'default') || value.apiKeyId !== (endpoint.apiKeyId || '') ? { authMode: value.authMode, keyGroupId: value.keyGroupId, apiKeyId: value.apiKeyId } : {}) };
    if (!value.interfaceType) delete config.interfaceType;
    if (run('channelCandidateSave', { config })) setEdited(false);
  };
  const applyAction = candidate && (<Button disabled={!ops.can || !status.ready || edited || Boolean(staleConfirmation)} onClick={() => { if (!confirm) setConfirm({ candidateId: candidate.id, revision: endpoint.configurationRevision || 0, impact: impact.revision }); else if (run('channelCandidateApply', { confirmed: true, candidateId: confirm.candidateId, expectedRevision: confirm.revision })) { setConfirm(false); ops.dirty(false); } }}>{confirm ? '确认应用配置' : '应用候选配置'}</Button>);
  return <Modal drawer wide title={mode === 'credentials' ? '修改渠道密钥' : '修改渠道配置'} description={`${provider.name} · ${endpoint.name}`} onClose={() => ops.proceed(close)} footer={<><Button variant="outline" onClick={() => ops.proceed(close)}>关闭</Button>{applyAction}</>}><div className="supplier-resource-form">
    <dl className="supplier-test-facts"><div><dt>当前生效地址</dt><dd>{endpoint.baseUrl}</dd></div><div><dt>配置版本</dt><dd>{endpoint.configurationRevision || 0}</dd></div></dl>
    <Notice>影响 {impact.mappings.length} 个模型、{impact.services.length} 项服务。候选验证完成前继续使用当前配置。</Notice>
    {mode !== 'credentials' && <><Field label="接口类型"><Choice label="候选接口类型" value={value.interfaceType || 'unselected'} options={[[ 'unselected', '请选择接口类型' ], ...CHANNEL_INTERFACES.map(row => [row.id, row.label])]} disabled={!ops.can} onChange={input => set({ interfaceType: input, protocol: CHANNEL_INTERFACES.find(row => row.id === input)?.protocol || value.protocol, taskUrls: {}, adapterOptions: {} })}/></Field><Field label={value.interfaceType && value.interfaceType !== 'custom' ? '候选服务根地址 *' : '候选 API 地址 *'}><Input aria-label="候选 API 地址" value={value.baseUrl} disabled={!ops.can} onChange={event => set({ baseUrl: event.target.value })}/></Field></>}
    {suggestedRoot && <Notice>识别到完整任务地址。<Button variant="link" disabled={!ops.can} onClick={() => set({ baseUrl: suggestedRoot })}>使用根地址 {suggestedRoot}</Button></Notice>}
    <SupplierKeyGroupField state={state} provider={provider} ops={ops} value={value.authMode === 'group' ? value.keyGroupId : 'current'} current={value.authMode !== 'group' ? { name: endpoint.authMode === 'none' ? '无需认证' : '渠道当前密钥配置', ready: connectionCredentialsReady(endpoint, provider) } : null} disabled={!ops.can} onChange={keyGroupId => set({ authMode: 'group', keyGroupId })}/>
    {mode !== 'credentials' && <ChannelAdvancedFields value={value} onChange={set} disabled={!ops.can}/>}
    <div className="supplier-key-actions"><Button variant="outline" disabled={!ops.can} onClick={save}>保存候选配置</Button></div>
    {edited && <Notice>有未保存的修改，请先保存候选配置。</Notice>}{candidate && <section className="supplier-candidate-status"><h3>候选验证</h3><p className="supplier-request-preview">{candidate.config.baseUrl}</p>{status.credentialError && <Notice error>{status.credentialError}</Notice>}<GridTable headings={['模型', '验证结果', '检查时间']} empty={!status.checks.length}>{status.checks.map(check => <Row key={check.associationId}><Cell>{check.modelId}</Cell><Cell>{check.passed ? '通过' : check.reason || '待测试'}</Cell><Cell>{check.evidence?.testedAt ? new Date(check.evidence.testedAt).toLocaleString('zh-CN') : '—'}</Cell></Row>)}</GridTable><div className="supplier-key-actions"><Button variant="outline" disabled={!ops.can} onClick={() => run('channelCandidateDiscard')}>放弃候选</Button></div>{staleConfirmation && <Notice error>候选或引用范围已变化，请重新核对后应用。</Notice>}{confirm && <Notice>将为上述模型和服务切换连接配置，售价与允许路由范围保留。</Notice>}{!edited && <CandidateProbePanel key={candidate.id} state={state} context={context} ops={ops}/>}</section>}
    {endpoint.configurationVersions?.length > 0 && <details><summary>历史配置与回滚</summary><Choice label="回滚配置版本" value={rollback} options={[[ 'unselected', '请选择历史版本' ], ...endpoint.configurationVersions.map(row => [String(row.version), `版本 ${row.version} · ${row.appliedAt}`])]} onChange={setRollback}/><Button variant="outline" disabled={!ops.can || rollback === 'unselected'} onClick={() => { const result = run('channelCandidateRollback', { targetVersion: Number(rollback) }); if (result) setValue(current => ({ ...current, ...result.endpoints.find(row => row.id === endpoint.id).candidateConfiguration.config })); }}>创建回滚候选</Button></details>}
    {ops.error && <Notice error>{ops.error}</Notice>}<div className="supplier-key-actions"><Button variant="destructive" disabled={!ops.can} onClick={() => setDeleting(true)}>删除渠道</Button></div>{deleting && <div><Notice error>删除前须先解除全部模型、服务和草稿引用；历史记录保留。</Notice><div className="supplier-key-actions"><Button variant="outline" onClick={() => setDeleting(false)}>取消删除</Button><Button variant="destructive" disabled={!ops.can} onClick={() => { if (ops.run('provider', { operation: 'supplierChannelDelete', objectId: provider.id, values: { endpointId: endpoint.id, confirmed: true } })) close(); }}>确认删除渠道</Button></div></div>}
  </div></Modal>;
}
