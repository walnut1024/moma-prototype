import { RemovalButton } from './ProviderRemovalDialog';
import ChannelKeyPoolEditor from './ChannelKeyPoolEditor';
import CandidateProbePanel from './CandidateProbePanel';
import ChannelCredentialRotation from './ChannelCredentialRotation';
import ChannelAdvancedFields from './ChannelAdvancedFields';
import { useEffect, useState } from 'react';
import { Button, Input, Typography } from '@douyinfe/semi-ui';
import { Choice, Field } from './ServiceUI';
import { Disclosure, Modal, Notice, GridTable, Row, Cell } from './ModelOperationsUI';
import { SupplierKeyGroupField } from './SupplierKeyGroupField';
import { CHANNEL_INTERFACES, suggestChannelRoot } from './channel-interface';
import { channelChangeImpact, channelCandidateStatus } from './channel-change-management';
import { connectionCredentialsReady } from './connection-state';
import { resolveChannelAssociationModel } from './channel-association-model';

export default function ChannelCandidateEditor(props) {
  return props.mode === 'credentials' ? props.endpoint.authMode === 'pool' ? <ChannelKeyPoolEditor {...props}/> : <ChannelCredentialRotation {...props}/> : <ChannelConfigurationCandidateEditor {...props}/>;
}

function ChannelConfigurationCandidateEditor({ state, provider, endpoint, ops, close, addressOnly = false, inline = false, onBusyChange, saveOnApply = false, channelDetails, baseProviderUpdatedAt }) {
  const candidate = endpoint.candidateConfiguration;
  const otherCandidate = addressOnly && candidate && !candidate.addressOnly;
  const [value, setValue] = useState(() => ({ interfaceType: endpoint.interfaceType || '', protocol: endpoint.protocol, baseUrl: endpoint.baseUrl, authMode: endpoint.authMode || 'inherit', keyGroupId: endpoint.keyGroupId || 'default', apiKeyId: endpoint.apiKeyId || '', timeoutSeconds: endpoint.timeoutSeconds || 60, capacity: endpoint.capacity ?? '', taskUrls: endpoint.taskUrls || {}, adapterOptions: endpoint.adapterOptions || {}, ...candidate?.config }));
  const [rollback, setRollback] = useState('unselected'), [edited, setEdited] = useState(false), [testing, setTesting] = useState(false);
  const [expectedCandidateId, setExpectedCandidateId] = useState(candidate?.id);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { onBusyChange?.(testing || submitting); }, [testing, submitting, onBusyChange]);
  let suggestedRoot = ''; try { suggestedRoot = value.interfaceType && value.interfaceType !== 'custom' ? suggestChannelRoot({ ...value, allowHttp: provider.sourceType === 'selfHosted' }) : ''; } catch { /* Incomplete edits are validated on save. */ }
  const impact = channelChangeImpact(state, provider.id, endpoint.id), status = candidate && channelCandidateStatus(state, provider.id, endpoint.id, {});
  const context = { providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0, candidateId: candidate?.id };
  const configurationChanged = saveOnApply && (provider.updatedAt !== baseProviderUpdatedAt || candidate?.id !== expectedCandidateId);
  const blocked = !ops.can || configurationChanged || Boolean(otherCandidate);
  const disabled = blocked || testing || submitting;
  const set = patch => { setValue(current => ({ ...current, ...patch })); setEdited(true); ops.dirty(true); ops.setError(''); };
  const testOps = { ...ops, can: !blocked, run: channelDetails ? async (...args) => {
    const next = await ops.run(...args);
    if (next) ops.dirty(true);
    return next;
  } : ops.run };
  const run = async (operation, extra = {}) => {
    setSubmitting(true);
    try {
      const next = await testOps.run(operation, { ...context, ...extra });
      if (next && saveOnApply) setExpectedCandidateId(next.endpoints.find(row => row.id === endpoint.id)?.candidateConfiguration?.id);
      return next;
    } finally { setSubmitting(false); }
  };
  const save = async () => {
    if (configurationChanged) throw Error('渠道或服务商配置已变化，请重新打开并核对');
    if (!edited && candidate) return { state, context };
    const config = { interfaceType: value.interfaceType, protocol: value.protocol, baseUrl: value.baseUrl, timeoutSeconds: value.timeoutSeconds, capacity: value.capacity, taskUrls: value.taskUrls, adapterOptions: value.adapterOptions, ...(value.authMode !== (endpoint.authMode || 'inherit') || value.keyGroupId !== (endpoint.keyGroupId || 'default') || value.apiKeyId !== (endpoint.apiKeyId || '') ? { authMode: value.authMode, keyGroupId: value.keyGroupId, apiKeyId: value.apiKeyId } : {}) };
    if (!value.interfaceType) delete config.interfaceType;
    const next = await run('channelCandidateSave', addressOnly ? { config: { baseUrl: value.baseUrl }, addressOnly: true } : { config });
    if (!next) return null;
    setEdited(false);
    return { state: next, context: { ...context, candidateId: next.endpoints.find(row => row.id === endpoint.id).candidateConfiguration.id } };
  };
  const records = impact.mappings.map(mapping => { let master; try { master = resolveChannelAssociationModel(state, provider, mapping); } catch { /* Invalid identity is reported when preparing the candidate. */ } return { associationId: mapping.id, modelId: master?.id, upstreamModelId: mapping.upstreamModelId, type: master?.type }; });
  const applyCandidate = async () => {
    if (!saveOnApply) {
      if (await run('channelCandidateApply', { confirmed: true })) {
        ops.dirty(false);
        if (addressOnly) close();
      }
      return;
    }
    const next = await ops.run('supplierChannelEdit', { ...context,
      ...channelDetails, confirmed: true, expectedUpdatedAt: endpoint.updatedAt, expectedProviderUpdatedAt: baseProviderUpdatedAt,
    });
    if (next) close();
  };
  const applyAction = candidate && (<Button theme="solid" disabled={disabled || !status.ready || edited}
    onClick={applyCandidate}>{saveOnApply ? '保存' : '应用配置'}</Button>);
  const actions = <><Button theme="light" disabled={testing || submitting} onClick={() => ops.proceed(close)}>{inline ? '取消' : '关闭'}</Button>{!otherCandidate && applyAction}</>;
  const content = otherCandidate ? <Notice>渠道已有待验证配置，请在服务商详情中处理后再编辑 Base URL。</Notice> : <div className="supplier-resource-form">
    {!inline && <dl className="supplier-test-facts"><div><dt>当前生效地址</dt><dd>{endpoint.baseUrl}</dd></div><div><dt>配置版本</dt><dd>{endpoint.configurationRevision || 0}</dd></div></dl>}
    <Notice>影响 {impact.mappings.length} 个模型、{impact.services.length} 项服务。候选验证完成前继续使用当前配置。</Notice>
    {configurationChanged && <Notice error>渠道或服务商配置已变化，请关闭后重新打开并核对。</Notice>}
    {!addressOnly && <Field label="接口类型"><Choice label="候选接口类型" value={value.interfaceType || 'unselected'} options={[[ 'unselected', '请选择接口类型' ], ...CHANNEL_INTERFACES.map(row => [row.id, row.label])]} disabled={disabled} onChange={input => set({ interfaceType: input, protocol: CHANNEL_INTERFACES.find(row => row.id === input)?.protocol || value.protocol, taskUrls: {}, adapterOptions: {} })}/></Field>}
    <Field label={inline ? '新地址' : addressOnly ? '服务商地址 Base URL' : value.interfaceType && value.interfaceType !== 'custom' ? '候选服务根地址 *' : '候选 API 地址 *'}><Input autoFocus={addressOnly} aria-label={addressOnly ? '服务商地址 Base URL' : '候选 API 地址'} value={value.baseUrl} disabled={disabled} onChange={value => set({ baseUrl: value })}/></Field>
    {suggestedRoot && <Notice>识别到完整任务地址。<Button type="tertiary" theme="borderless" disabled={disabled} onClick={() => set({ baseUrl: suggestedRoot })}>使用根地址 {suggestedRoot}</Button></Notice>}
    {!addressOnly && <><SupplierKeyGroupField state={state} provider={provider} ops={testOps} value={value.authMode === 'group' ? value.keyGroupId : 'current'} current={value.authMode !== 'group' ? { name: endpoint.authMode === 'none' ? '无需认证' : '渠道当前密钥配置', ready: connectionCredentialsReady(endpoint, provider) } : null} disabled={disabled} channelId={endpoint.id} onChange={keyGroupId => set({ authMode: 'group', keyGroupId })}/>
      <ChannelAdvancedFields value={value} onChange={set} disabled={disabled}/></>}
    <CandidateProbePanel state={state} context={context} ops={testOps} beforeTest={save} initialRecords={records} onBusyChange={setTesting}
      pendingEdits={edited} testLabel={saveOnApply ? '测试连接（产生用量）' : '测试新配置（产生用量）'}/>
    {candidate && <section className="supplier-candidate-status"><Typography.Title heading={5} component="h3">候选验证</Typography.Title><p className="supplier-request-preview">{candidate.config.baseUrl}</p>{status.credentialError && <Notice error>{status.credentialError}</Notice>}<GridTable headings={['模型', '验证结果', '检查时间']} empty={!status.checks.length}>{status.checks.map(check => <Row key={check.associationId}><Cell>{check.modelId}</Cell><Cell>{check.passed ? '通过' : check.reason || '待测试'}</Cell><Cell>{check.evidence?.testedAt ? new Date(check.evidence.testedAt).toLocaleString('zh-CN') : '—'}</Cell></Row>)}</GridTable><div className="admin-form-actions"><Button theme="light" disabled={disabled} onClick={async () => await run('channelCandidateDiscard')}>放弃候选</Button></div></section>}
    {!addressOnly && endpoint.configurationVersions?.length > 0 && <Disclosure title="历史配置与回滚"><Choice label="回滚配置版本" value={rollback} options={[[ 'unselected', '请选择历史版本' ], ...endpoint.configurationVersions.map(row => [String(row.version), `版本 ${row.version} · ${row.appliedAt}`])]} onChange={setRollback}/><Button theme="light" disabled={disabled || rollback === 'unselected'} onClick={async () => { const result = await run('channelCandidateRollback', { targetVersion: Number(rollback) }); if (result) setValue(current => ({ ...current, ...result.endpoints.find(row => row.id === endpoint.id).candidateConfiguration.config })); }}>创建回滚候选</Button></Disclosure>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    {!addressOnly && <RemovalButton state={state} ops={ops} disabled={disabled} target={{ providerId: provider.id, endpointId: endpoint.id }} label="移除渠道" onRemoved={close}/>}
  </div>;
  return inline ? <section className="supplier-address-editor" aria-label={`编辑地址 · ${endpoint.name}`}>
    {content}<div className="admin-form-actions">{actions}</div>
  </section> : <Modal drawer wide title={addressOnly ? '编辑 Base URL' : saveOnApply ? '测试连接' : '修改渠道配置'} description={`${provider.name} · ${endpoint.name}`} onClose={() => ops.proceed(close)} footer={actions}>{content}</Modal>;
}
