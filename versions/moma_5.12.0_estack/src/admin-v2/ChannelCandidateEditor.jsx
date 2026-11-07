import ChannelKeyPoolEditor from './ChannelKeyPoolEditor';
import CandidateProbePanel from './CandidateProbePanel';
import ChannelCredentialRotation from './ChannelCredentialRotation';
import ChannelAdvancedFields from './ChannelAdvancedFields';
import { useState } from 'react';
import { Button, Input, Typography } from '@douyinfe/semi-ui';
import { Choice, Field } from './ModelMetadataForm';
import { Disclosure, Modal, Notice, GridTable, Row, Cell } from './ModelOperationsUI';
import { SupplierKeyGroupField } from './SupplierKeyGroupField';
import { CHANNEL_INTERFACES, suggestChannelRoot } from './channel-interface';
import { channelChangeImpact, channelCandidateStatus } from './channel-change-management';
import { connectionCredentialsReady } from './connection-state';
import { resolveChannelAssociationModel } from './channel-association-model';

export default function ChannelCandidateEditor(props) {
  return props.mode === 'credentials' ? props.endpoint.authMode === 'pool' ? <ChannelKeyPoolEditor {...props}/> : <ChannelCredentialRotation {...props}/> : <ChannelConfigurationCandidateEditor {...props}/>;
}

function ChannelConfigurationCandidateEditor({ state, provider, endpoint, ops, close }) {
  const candidate = endpoint.candidateConfiguration;
  const [value, setValue] = useState(() => ({ interfaceType: endpoint.interfaceType || '', protocol: endpoint.protocol, baseUrl: endpoint.baseUrl, authMode: endpoint.authMode || 'inherit', keyGroupId: endpoint.keyGroupId || 'default', apiKeyId: endpoint.apiKeyId || '', timeoutSeconds: endpoint.timeoutSeconds || 60, capacity: endpoint.capacity ?? '', taskUrls: endpoint.taskUrls || {}, adapterOptions: endpoint.adapterOptions || {}, ...candidate?.config }));
  const [rollback, setRollback] = useState('unselected'), [edited, setEdited] = useState(false), [deleting, setDeleting] = useState(false), [testing, setTesting] = useState(false);
  let suggestedRoot = ''; try { suggestedRoot = value.interfaceType && value.interfaceType !== 'custom' ? suggestChannelRoot({ ...value, allowHttp: provider.sourceType === 'selfHosted' }) : ''; } catch { /* Incomplete edits are validated on save. */ }
  const impact = channelChangeImpact(state, provider.id, endpoint.id), status = candidate && channelCandidateStatus(state, provider.id, endpoint.id, {});
  const context = { providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0, candidateId: candidate?.id };
  const set = patch => { setValue(current => ({ ...current, ...patch })); setEdited(true); ops.dirty(true); ops.setError(''); };
  const run = async (operation, extra = {}) => await ops.run(operation, { ...context, ...extra });
  const save = async () => {
    if (!edited && candidate) return { state, context };
    const config = { interfaceType: value.interfaceType, protocol: value.protocol, baseUrl: value.baseUrl, timeoutSeconds: value.timeoutSeconds, capacity: value.capacity, taskUrls: value.taskUrls, adapterOptions: value.adapterOptions, ...(value.authMode !== (endpoint.authMode || 'inherit') || value.keyGroupId !== (endpoint.keyGroupId || 'default') || value.apiKeyId !== (endpoint.apiKeyId || '') ? { authMode: value.authMode, keyGroupId: value.keyGroupId, apiKeyId: value.apiKeyId } : {}) };
    if (!value.interfaceType) delete config.interfaceType;
    const next = await run('channelCandidateSave', { config });
    if (!next) return null;
    setEdited(false);
    return { state: next, context: { ...context, candidateId: next.endpoints.find(row => row.id === endpoint.id).candidateConfiguration.id } };
  };
  const records = impact.mappings.map(mapping => { let master; try { master = resolveChannelAssociationModel(state, provider, mapping); } catch { /* Invalid identity is reported when preparing the candidate. */ } return { associationId: mapping.id, modelId: master?.id, upstreamModelId: mapping.upstreamModelId, type: master?.type }; });
  const applyAction = candidate && (<Button disabled={!ops.can || !status.ready || edited || testing} onClick={async () => { if (await run('channelCandidateApply', { confirmed: true })) ops.dirty(false); }}>应用配置</Button>);
  return <Modal drawer wide title="修改渠道配置" description={`${provider.name} · ${endpoint.name}`} onClose={() => ops.proceed(close)} footer={<><Button theme="light" onClick={() => ops.proceed(close)}>关闭</Button>{applyAction}</>}><div className="supplier-resource-form">
    <dl className="supplier-test-facts"><div><dt>当前生效地址</dt><dd>{endpoint.baseUrl}</dd></div><div><dt>配置版本</dt><dd>{endpoint.configurationRevision || 0}</dd></div></dl>
    <Notice>影响 {impact.mappings.length} 个模型、{impact.services.length} 项服务。候选验证完成前继续使用当前配置。</Notice>
    <Field label="接口类型"><Choice label="候选接口类型" value={value.interfaceType || 'unselected'} options={[[ 'unselected', '请选择接口类型' ], ...CHANNEL_INTERFACES.map(row => [row.id, row.label])]} disabled={!ops.can || testing} onChange={input => set({ interfaceType: input, protocol: CHANNEL_INTERFACES.find(row => row.id === input)?.protocol || value.protocol, taskUrls: {}, adapterOptions: {} })}/></Field><Field label={value.interfaceType && value.interfaceType !== 'custom' ? '候选服务根地址 *' : '候选 API 地址 *'}><Input aria-label="候选 API 地址" value={value.baseUrl} disabled={!ops.can || testing} onChange={value => set({ baseUrl: value })}/></Field>
    {suggestedRoot && <Notice>识别到完整任务地址。<Button type="tertiary" theme="borderless" disabled={!ops.can} onClick={() => set({ baseUrl: suggestedRoot })}>使用根地址 {suggestedRoot}</Button></Notice>}
    <SupplierKeyGroupField state={state} provider={provider} ops={ops} value={value.authMode === 'group' ? value.keyGroupId : 'current'} current={value.authMode !== 'group' ? { name: endpoint.authMode === 'none' ? '无需认证' : '渠道当前密钥配置', ready: connectionCredentialsReady(endpoint, provider) } : null} disabled={!ops.can || testing} onChange={keyGroupId => set({ authMode: 'group', keyGroupId })}/>
    <ChannelAdvancedFields value={value} onChange={set} disabled={!ops.can || testing}/>
    <CandidateProbePanel state={state} context={context} ops={ops} beforeTest={save} initialRecords={records} onBusyChange={setTesting} pendingEdits={edited} testLabel="测试新配置（产生用量）"/>
    {candidate && <section className="supplier-candidate-status"><Typography.Title heading={5} component="h3">候选验证</Typography.Title><p className="supplier-request-preview">{candidate.config.baseUrl}</p>{status.credentialError && <Notice error>{status.credentialError}</Notice>}<GridTable headings={['模型', '验证结果', '检查时间']} empty={!status.checks.length}>{status.checks.map(check => <Row key={check.associationId}><Cell>{check.modelId}</Cell><Cell>{check.passed ? '通过' : check.reason || '待测试'}</Cell><Cell>{check.evidence?.testedAt ? new Date(check.evidence.testedAt).toLocaleString('zh-CN') : '—'}</Cell></Row>)}</GridTable><div className="supplier-key-actions"><Button theme="light" disabled={!ops.can || testing} onClick={async () => await run('channelCandidateDiscard')}>放弃候选</Button></div></section>}
    {endpoint.configurationVersions?.length > 0 && <Disclosure title="历史配置与回滚"><Choice label="回滚配置版本" value={rollback} options={[[ 'unselected', '请选择历史版本' ], ...endpoint.configurationVersions.map(row => [String(row.version), `版本 ${row.version} · ${row.appliedAt}`])]} onChange={setRollback}/><Button theme="light" disabled={!ops.can || rollback === 'unselected'} onClick={async () => { const result = await run('channelCandidateRollback', { targetVersion: Number(rollback) }); if (result) setValue(current => ({ ...current, ...result.endpoints.find(row => row.id === endpoint.id).candidateConfiguration.config })); }}>创建回滚候选</Button></Disclosure>}
    {ops.error && <Notice error>{ops.error}</Notice>}<div className="supplier-key-actions"><Button type="danger" disabled={!ops.can} onClick={() => setDeleting(true)}>删除渠道</Button></div>{deleting && <div><Notice error>删除前须先解除全部模型及服务引用；历史记录保留。</Notice><div className="supplier-key-actions"><Button theme="light" onClick={() => setDeleting(false)}>取消删除</Button><Button type="danger" disabled={!ops.can} onClick={async () => { if (await ops.run('provider', { operation: 'supplierChannelDelete', objectId: provider.id, values: { endpointId: endpoint.id, confirmed: true } })) close(); }}>确认删除渠道</Button></div></div>}
  </div></Modal>;
}
