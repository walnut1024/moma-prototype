import { useEffect, useState } from 'react';
import { Button, Input, TextArea } from '@douyinfe/semi-ui';
import AdminStatus from './AdminStatus';
import CandidateProbePanel from './CandidateProbePanel';
import { Cell, CopyId, GridTable, Modal, Notice, Row } from './ModelOperationsUI';
import { Choice, Field } from './ServiceUI';
import SupplierCreationDialog from './SupplierCreationDialog';
import { channelCandidateStatus, channelChangeImpact } from './channel-change-management';
import { CHANNEL_INTERFACES, suggestChannelRoot } from './channel-interface';
import { normalizeChannelRequestRules } from './channel-request-rules';
import { defaultChannelNetwork, normalizeChannelNetwork } from './channel-network-settings';
import { modelChannelName } from './model-channel-name';
import { providerApiKeysDraft } from './provider-management';
import { supplierChannelName } from './supplier-resources';

const interfaceLabel = value => CHANNEL_INTERFACES.find(row => row.id === value)?.label || value || '—';

function AffectedModels({ connection, impact, checks }) {
  const { models } = connection;
  const byId = new Map(models.map(model => [model.association.id, model]));
  return <GridTable headings={['模型', '上游模型调用标识', '关联服务', '验证状态']} empty={!impact.mappings.length} emptyMessage="暂无已接入模型">
    {impact.mappings.map(mapping => {
      const check = checks.find(record => record.associationId === mapping.id);
      const services = impact.services.filter(service => service.associationIds.includes(mapping.id));
      return <Row key={mapping.id}>
        <Cell>{byId.get(mapping.id)?.modelName || mapping.modelId}</Cell><Cell>{mapping.upstreamModelId}</Cell>
        <Cell>{services.map(service => <div key={service.id}><CopyId value={service.id} label="模型服务 ID"/></div>)}{!services.length && '—'}</Cell>
        <Cell><AdminStatus value={check?.passed ? '通过' : check?.evidence?.result || '待测试'}/>
          {check?.reason && <div>{check.reason}</div>}</Cell>
      </Row>;
    })}
  </GridTable>;
}

export function ChannelConnectionEditor({ state, connection, ops, close }) {
  const { provider, endpoint, name } = connection;
  const candidate = endpoint.candidateConfiguration;
  const initialType = endpoint.interfaceType || CHANNEL_INTERFACES.find(row => row.protocol === endpoint.protocol)?.id || '';
  const initialAuth = ['specific', 'none', 'pending', 'pool'].includes(endpoint.authMode) ? endpoint.authMode : 'group';
  const [draft, setDraft] = useState(() => ({
    name, type: initialType, url: endpoint.baseUrl || '', auth: initialAuth,
    key: '',
  }));
  const [base] = useState(() => ({ expectedUpdatedAt: endpoint.updatedAt, expectedProviderUpdatedAt: provider.updatedAt }));
  const [note, setNote] = useState(() => endpoint.directoryNote || '');
  const [initialNote] = useState(note);
  const [initialName] = useState(name);
  const [stage, setStage] = useState('edit');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  useEffect(() => { if (!ops.can) setDraft(value => ({ ...value, key: '' })); }, [ops.can]);
  const impact = channelChangeImpact(state, provider.id, endpoint.id);
  const [reviewRevision, setReviewRevision] = useState(impact.revision);
  const context = { providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0, candidateId: candidate?.id };
  const status = candidate && channelCandidateStatus(state, provider.id, endpoint.id, { allAssociations: true });
  const nameChanged = draft.name.trim() !== initialName;
  const kindChanged = draft.type !== initialType;
  const keyEntered = draft.auth === 'specific' && Boolean(draft.key.trim());
  const noteChanged = note.trim() !== initialNote;
  const staleNote = noteChanged && (endpoint.directoryNote || '') !== initialNote;
  const customChanged = draft.type !== 'custom' && Boolean(endpoint.customAdapter);
  const connectionChanged = kindChanged || draft.url.trim() !== (endpoint.baseUrl || '') || draft.auth !== initialAuth || keyEntered || customChanged;
  const setInterface = kindChanged || !endpoint.interfaceType && connectionChanged;
  const incomplete = !draft.name.trim() || (connectionChanged && (!draft.url.trim() || !draft.type || draft.type === 'unselected' ||
    draft.auth === 'specific' && initialAuth !== 'specific' && !keyEntered ||
    draft.auth === 'pending'));
  const unlinked = !impact.mappings.length && !state.modelSupplies.some(row => row.endpointId === endpoint.id && row.status !== '已移除');
  const staleName = nameChanged && name !== initialName;
  const blocked = !ops.can || busy || testing && !status?.ready;
  const locked = blocked || Boolean(candidate);
  const hasEdits = nameChanged || connectionChanged || noteChanged;
  const update = patch => { setDraft(value => ({ ...value, ...patch })); ops.dirty(true); ops.setError(''); };
  const cancel = () => { if (!busy && !testing) ops.proceed(close); };
  const submitReview = () => {
    try {
      if (kindChanged && endpoint.networkSettings) {
        normalizeChannelNetwork({ ...defaultChannelNetwork, ...endpoint.networkSettings }, {
          interfaceType: draft.type, internal: provider.sourceType === 'selfHosted',
        });
        const timeout = endpoint.timeoutSeconds || 60;
        if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 600) throw Error('超时须为 1–600 秒');
      }
      if (kindChanged && endpoint.requestRules) normalizeChannelRequestRules(endpoint.requestRules, draft.type);
      setReviewRevision(impact.revision);
      ops.setError('');
      setStage('review');
    } catch (error) {
      ops.setError(error.message);
    }
  };
  const rename = nameChanged ? { name: draft.name.trim(), connectionNameOnly: true } : {};
  let root;
  try { if (draft.type !== 'custom') root = suggestChannelRoot({ interfaceType: draft.type, baseUrl: draft.url, allowHttp: provider.sourceType === 'selfHosted' }); } catch { /* The transaction validates incomplete addresses. */ }
  const prepare = async () => {
    if (blocked || staleName || staleNote || reviewRevision !== impact.revision) return;
    setBusy(true);
    try {
      const newApiKey = keyEntered ? (await providerApiKeysDraft([draft.key])).apiKeys[0] : undefined;
      if (!ops.isCurrent()) throw Error('权限或数据已有变化，请重新核对');
      const kind = CHANNEL_INTERFACES.find(option => option.id === draft.type) || (draft.type === 'custom' ? { id: 'custom', protocol: '其他' } : null);
      const next = await ops.run('supplierChannelEdit', { ...base, ...rename, providerId: provider.id, endpointId: endpoint.id,
        baseUrl: draft.url, ...(connectionChanged ? { prepareConnection: true } : {}),
        ...(noteChanged && !connectionChanged ? { note } : {}),
        ...(connectionChanged ? { allAssociations: true } : {}),
        ...(!setInterface && !newApiKey && !customChanged && connectionChanged ? { addressOnly: true } : {}),
        ...(setInterface && kind ? { protocol: kind.protocol, interfaceType: kind.id } : {}),
        ...(customChanged ? { customAdapter: null } : {}),
        ...(customChanged ? { expectedImpactRevision: reviewRevision } : {}),
        ...(newApiKey ? { newApiKey, channelOwned: true } : {}),
      });
      if (next) {
        if (!connectionChanged) { close(); return; }
        setDraft(value => ({ ...value, key: '' }));
        ops.dirty(nameChanged || noteChanged);
        setStage('test');
      }
    } catch (error) { ops.setError(error.message); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const data = { ...context, confirmed: true, allAssociations: true, ...(unlinked ? { unlinked: true } : {}) };
      const next = nameChanged || noteChanged ? await ops.run('supplierChannelEdit', {
        ...data, ...rename, expectedUpdatedAt: endpoint.updatedAt, expectedProviderUpdatedAt: provider.updatedAt,
        ...(noteChanged ? { note } : {}),
      }) : await ops.run('channelCandidateApply', data);
      if (next) close();
    } finally { setBusy(false); }
  };
  const description = provider.name + ' / ' + name;
  if (stage === 'edit') return <SupplierCreationDialog title="编辑信息" cancel={cancel}
    submit={connectionChanged ? submitReview : prepare} action={connectionChanged ? '核对变更' : '保存'}
    disabled={locked || incomplete || staleNote || !hasEdits}>
    <Field label="渠道类型 *"><Choice label="渠道类型" value={draft.type || 'unselected'} options={[
      ['unselected', '请选择渠道类型'], ...CHANNEL_INTERFACES.map(option => [option.id, option.label]),
      ...(initialType === 'custom' ? [['custom', '自定义 API']] : []),
    ]} onChange={type => update({ type })} disabled={locked}/></Field>
    <Field label="渠道名称 *"><Input aria-label="渠道名称" maxLength={60} value={draft.name}
      onChange={value => update({ name: value })} disabled={locked}/></Field>
    <Field label="API 地址 *"><Input aria-label="API 地址" maxLength={2048} value={draft.url}
      onChange={url => update({ url })} disabled={locked}/></Field>
    {root && <Button theme="borderless" disabled={locked} onClick={() => update({ url: root })}>使用根地址 {root}</Button>}
    <Field label="API Key"><Input aria-label="API Key" mode="password" autoComplete="new-password" maxLength={512}
      value={draft.key} disabled={locked} onChange={key => update({ key, auth: key.trim() ? 'specific' : initialAuth })}
      placeholder="留空保留当前凭证"/></Field>
    <Field label="简介"><TextArea aria-label="简介" value={note} maxLength={300} disabled={locked}
      onChange={value => { setNote(value); ops.dirty(true); ops.setError(''); }}/></Field>
    {candidate && <Notice>此渠道有待验证的配置。<Button theme="borderless" onClick={() => setStage('test')}>核对待验证配置</Button></Notice>}
    {staleNote && <Notice error>渠道简介已变化，请重新打开后编辑。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
  if (stage === 'review') return <Modal drawer wide title="核对连接变更" description={description} onClose={() => !busy && setStage('edit')} footer={<>
    <Button onClick={() => setStage('edit')} disabled={blocked}>返回编辑</Button>
    <Button theme="solid" loading={busy} disabled={blocked || staleName || staleNote || reviewRevision !== impact.revision} onClick={prepare}>
      {!connectionChanged ? '保存连接名称' : unlinked ? '准备空连接配置' : '进入候选测试'}
    </Button>
  </>}>
    {connectionChanged && <Notice>当前配置继续生效。核对 {impact.mappings.length} 条模型渠道及 {impact.services.length} 个关联服务。</Notice>}
    <dl className="channel-operation-facts">
      <div><dt>当前生效地址</dt><dd>{endpoint.baseUrl || '—'}</dd></div>
      <div><dt>新地址</dt><dd>{draft.url}</dd></div>
      {kindChanged && <div><dt>上游协议</dt><dd>{interfaceLabel(initialType)} → {interfaceLabel(draft.type)}</dd></div>}
      {nameChanged && <div><dt>连接名称</dt><dd>{name} → {draft.name.trim()}</dd></div>}
      {keyEntered && <div><dt>API 密钥</dt><dd>换用渠道专属密钥</dd></div>}
      {customChanged && <div><dt>自定义接口</dt><dd>移除旧适配器</dd></div>}
    </dl>
    {connectionChanged && <AffectedModels connection={connection} impact={impact} checks={[]}/>}
    {(ops.error || reviewRevision !== impact.revision || staleName || staleNote) && <Notice error>{ops.error || '连接或引用已变化，请返回重新核对。'}</Notice>}
  </Modal>;
  const pending = status?.checks.filter(check => !check.passed).map(check => check.associationId) || [];
  const cannotApply = !candidate || staleName || staleNote || Boolean(status?.reason) || (unlinked ? Boolean(status?.credentialError) : !status?.ready);
  return <Modal drawer wide title="验证连接变更" description={description} onClose={() => !busy && !testing && setStage('edit')} footer={<>
    <Button disabled={busy || testing} onClick={() => setStage('edit')}>返回连接配置</Button>
    <Button theme="solid" loading={busy} disabled={blocked || cannotApply} onClick={apply}>{unlinked ? '保存未启用连接' : '应用配置'}</Button>
  </>}>
    {!candidate ? <Notice>候选配置已变化，请退出后重新编辑。</Notice> : <>
      <Notice>{unlinked ? '此连接尚无模型，将保存为未启用状态。添加模型后再测试。' :
        status?.ready ? '受影响的模型渠道均已通过测试，可以应用新配置。' : '当前配置继续生效。受影响的模型渠道通过测试后才能应用。'}</Notice>
      <dl className="channel-operation-facts"><div><dt>当前生效地址</dt><dd>{endpoint.baseUrl}</dd></div>
        <div><dt>候选地址</dt><dd>{candidate.config.baseUrl}</dd></div></dl>
      {JSON.stringify(candidate.config.requestRules || null) !== JSON.stringify(endpoint.requestRules || null) &&
        <Notice>候选配置包含请求与响应规则变更，可在编辑页预览。</Notice>}
      <AffectedModels connection={connection} impact={impact} checks={status?.checks || []}/>
      {status?.reason && <Notice error>{status.reason}</Notice>}
      {status?.credentialError && <Notice error>{status.credentialError}</Notice>}
      {!unlinked && !status?.ready && <CandidateProbePanel key={candidate.id} state={state} context={context} ops={ops}
        associationIds={pending.length ? pending.slice(0, 50) : undefined} onBusyChange={setTesting}
        testLabel={candidate.tests.length ? '重试未通过项（产生用量）' : '测试新配置（产生用量）'}/>}
      <Button disabled={blocked} onClick={async () => { if (await ops.run('channelCandidateDiscard', context)) close(); }}>放弃候选配置</Button>
    </>}
    {(ops.error || staleName || staleNote) && <Notice error>{ops.error || (staleNote ? '渠道简介已变化，请重新打开后编辑。' : '连接名称已变化，请重新核对后保存。')}</Notice>}
  </Modal>;
}

export function ChannelModelEditor({ model, connection, ops, close }) {
  const { endpoint, provider } = connection;
  const { association, modelName } = model;
  const savedName = provider.catalogConnections?.find(row => row.id === association.id)?.name;
  const currentName = association.sourceName || savedName || modelChannelName(provider, association);
  const [value, setValue] = useState(() => ({ name: currentName, upstream: association.upstreamModelId }));
  const [base] = useState(() => ({ expectedUpdatedAt: endpoint.updatedAt, expectedProviderUpdatedAt: provider.updatedAt }));
  const [busy, setBusy] = useState(false);
  const upstreamChanged = value.upstream.trim() !== association.upstreamModelId;
  const disabled = busy || !ops.can;
  const update = patch => { setValue(current => ({ ...current, ...patch })); ops.dirty(true); ops.setError(''); };
  const save = async () => {
    setBusy(true);
    try {
      if (await ops.run('supplierChannelEdit', {
        ...base, providerId: provider.id, endpointId: endpoint.id, associationId: association.id,
        modelId: association.modelId, name: supplierChannelName(provider, endpoint), sourceName: value.name.trim(),
        upstreamModelId: value.upstream.trim(), baseUrl: endpoint.baseUrl,
      })) close();
    } finally { setBusy(false); }
  };
  return <SupplierCreationDialog title="编辑模型" cancel={() => !busy && ops.proceed(close)}
    submit={save} action="保存" disabled={disabled || !value.upstream.trim() || !upstreamChanged}>
    <Field label="模型标识 *"><Input aria-label="模型标识" value={value.upstream} maxLength={200} disabled={disabled}
      onChange={upstream => update({ upstream })}/></Field>
    <Field label="展示名称">{modelName}</Field>
    {upstreamChanged && <Notice>修改模型标识后，需重新测试该模型。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}
