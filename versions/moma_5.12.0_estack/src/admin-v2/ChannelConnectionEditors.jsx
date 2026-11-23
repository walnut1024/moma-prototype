import { useChannelText } from './channel-language';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, Input, TextArea } from '@douyinfe/semi-ui';
import AdminStatus from './AdminStatus';
import CandidateProbePanel from './CandidateProbePanel';
import { ChannelKeySummary } from './ChannelCredentials';
import ChannelKeyPoolEditor from './ChannelKeyPoolEditor';
import ChannelProtocolFields from './ChannelProtocolFields';
import { Cell, CopyId, GridTable, Modal, Notice, Row } from './ModelOperationsUI';
import { Choice, Field } from './ServiceUI';
import SupplierCreationDialog from './SupplierCreationDialog';
import { channelCandidateStatus, channelChangeImpact } from './channel-change-management';
import { workbenchProtocolLabel } from './workbench-protocol';

import { CHANNEL_LIST_TYPES, CHANNEL_SOURCE_TYPES, channelListPaths, channelListType,
  channelProtocolPaths, channelProtocolUsesFullAddress, channelSourceTypeLabel, prepareListedChannelInterface } from './channel-connection-directory';
import { CHANNEL_INTERFACES, suggestChannelRoot } from './channel-interface';
import { normalizeChannelRequestRules } from './channel-request-rules';
import { defaultChannelNetwork, normalizeChannelNetwork } from './channel-network-settings';
import { modelChannelName } from './model-channel-name';
import { connectionKeys } from './connection-state';
import { supplierChannelName } from './supplier-resources';

function candidateChangesCredentials(connection) {
  const { endpoint, provider } = connection;
  if (!endpoint.candidateConfiguration) return false;
  const signature = value => JSON.stringify([
    value.authMode || null, value.keyGroupId || null, value.apiKeyId || null,
    connectionKeys(value, provider, true).map(key => [key.id, key.fingerprint]),
    value.authMode === 'pool' ? [
      value.keyPool?.map(row => [row.keyId, row.priority, row.enabled]),
      value.keyStrategy || 'priority', Boolean(value.poolPaused),
    ] : null,
  ]);
  return signature(endpoint) !== signature({ ...endpoint, ...endpoint.candidateConfiguration.config });
}

function ConnectionChanges({ connection, next, name, note, sourceType, showCredentials }) {
  const t = useChannelText();
  const { endpoint, provider } = connection;
  const after = { ...endpoint, ...next };
  const paths = value => channelListPaths({ ...connection, endpoint: value }).join('、');
  const format = value => workbenchProtocolLabel(channelListType({ ...connection, endpoint: value }));
  const fields = [
    ['连接名称', connection.name, name],
    ['连接类型', t(channelSourceTypeLabel(endpoint.channelSourceType ?? provider.sourceType)), t(channelSourceTypeLabel(sourceType))],
    ['接口格式', format(endpoint), format(after)],
    ['接口端点', paths(endpoint), paths(after)],
    ['服务地址', endpoint.baseUrl, after.baseUrl],
    ['简介', endpoint.directoryNote || '', note],
  ].filter(([, before, after]) => before !== after);
  const keyIds = value => new Set(connectionKeys(value, provider, true).map(key => key.id));
  const adapterRemoved = endpoint.customAdapter && !after.customAdapter;
  return <GridTable headings={[t('字段'), t('改前'), t('改后')]}
    empty={!fields.length && !showCredentials && !adapterRemoved} emptyMessage={t('暂无可显示的字段变更')}>
    {fields.map(([label, before, after]) => <Row key={label}><Cell>{t(label)}</Cell><Cell>{before || '—'}</Cell><Cell>{after || '—'}</Cell></Row>)}
    {showCredentials && <Row><Cell>{t('API 密钥')}</Cell>
      <Cell><ChannelKeySummary endpoint={endpoint} provider={provider}
        difference={{ label: '移除', color: 'grey', otherIds: keyIds(after) }}/></Cell>
      <Cell><ChannelKeySummary endpoint={after} provider={provider}
        difference={{ label: '新增', color: 'green', otherIds: keyIds(endpoint) }}/></Cell>
    </Row>}
    {adapterRemoved && <Row><Cell>{t('自定义接口')}</Cell><Cell>{t('使用自定义适配器')}</Cell><Cell>{t('移除自定义适配器')}</Cell></Row>}
  </GridTable>;
}

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
  const t = useChannelText();
  const { provider, endpoint, name } = connection;
  const formId = useId();
  const stageContent = useRef(null);
  const candidate = endpoint.candidateConfiguration;
  const initialType = endpoint.interfaceType || CHANNEL_INTERFACES.find(row => row.protocol === endpoint.protocol)?.id || '';
  const initialSelection = CHANNEL_LIST_TYPES.find(row => row.label === channelListType(connection))?.id || initialType;
  const credentialCandidate = candidateChangesCredentials(connection);
  const sourceType = endpoint.channelSourceType ?? provider.sourceType;
  const [initialSourceType] = useState(sourceType);
  const [draft, setDraft] = useState(() => ({
    name, type: initialSelection, url: endpoint.baseUrl || '', endpointPath: endpoint.endpointPath ?? null,
    sourceType,
  }));
  const [base] = useState(() => ({ expectedUpdatedAt: endpoint.updatedAt, expectedProviderUpdatedAt: provider.updatedAt }));
  const [note, setNote] = useState(() => endpoint.directoryNote || '');
  const [initialNote] = useState(note);
  const [initialName] = useState(name);
  const [stage, setStage] = useState('edit');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  useEffect(() => { stageContent.current?.focus(); }, [stage]);
  const impact = channelChangeImpact(state, provider.id, endpoint.id);
  const [reviewRevision, setReviewRevision] = useState(impact.revision);
  const [reviewDraft, setReviewDraft] = useState(null);
  const context = { providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0, candidateId: candidate?.id };
  const status = candidate && channelCandidateStatus(state, provider.id, endpoint.id, { allAssociations: true });
  const nameChanged = draft.name.trim() !== initialName;
  const kindChanged = draft.type !== initialSelection;
  const listedType = CHANNEL_LIST_TYPES.find(row => row.id === draft.type);
  const draftType = !kindChanged ? initialType : listedType?.task ? 'custom' : draft.type;
  const pathChanged = draft.endpointPath !== (endpoint.endpointPath ?? null);
  const replacingProtocol = Boolean((kindChanged || pathChanged) && listedType);
  const addressChanged = draft.url.trim() !== (endpoint.baseUrl || '');
  const allowHttp = provider.sourceType === 'selfHosted';
  const endpointPath = draft.endpointPath ?? channelProtocolPaths({
    interfaceType: draft.type, baseUrl: draft.url, allowHttp,
  }, kindChanged ? undefined : connection)[0];
  const sourceTypeChanged = draft.sourceType !== initialSourceType;
  const staleType = sourceTypeChanged && sourceType !== initialSourceType;
  const noteChanged = note.trim() !== initialNote;
  const staleNote = noteChanged && (endpoint.directoryNote || '') !== initialNote;
  const keepAdapter = draftType === 'custom' && !replacingProtocol;
  const customChanged = !keepAdapter && Boolean(endpoint.customAdapter);
  const connectionChanged = kindChanged || pathChanged || addressChanged || customChanged;
  const setInterface = replacingProtocol || kindChanged || !endpoint.interfaceType && connectionChanged;
  const incomplete = !draft.name.trim() ||
    connectionChanged && (!draft.url.trim() || !draft.type || draft.type === 'unselected' || listedType && !endpointPath?.trim());
  const unlinked = !impact.mappings.length && !state.modelSupplies.some(row => row.endpointId === endpoint.id && row.status !== '已移除');
  const staleName = nameChanged && name !== initialName;
  const blocked = !ops.can || busy || testing && !status?.ready;
  const locked = blocked || Boolean(candidate);
  const infoChanged = nameChanged || noteChanged || sourceTypeChanged;
  const stale = staleName || staleNote || staleType;
  const hasEdits = infoChanged || connectionChanged;
  const update = patch => { setDraft(value => ({ ...value, ...patch })); ops.dirty(true); ops.setError(''); };
  const cancel = () => { if (!busy && !testing) ops.proceed(close); };
  const submitReview = () => {
    try {
      const legacyRoot = listedType?.task && !channelProtocolUsesFullAddress(draft.type, connection);
      const next = { baseUrl: draft.url.trim(), ...(customChanged ? { customAdapter: null } : {}) };
      if (listedType && (replacingProtocol || addressChanged && !legacyRoot)) {
        if (kindChanged) next.taskUrls = {};
        Object.assign(next, prepareListedChannelInterface({ interfaceType: draft.type, baseUrl: draft.url,
          endpointPath: replacingProtocol ? endpointPath : endpoint.endpointPath, allowHttp }));
      }
      if (kindChanged && endpoint.networkSettings) {
        normalizeChannelNetwork({ ...defaultChannelNetwork, ...endpoint.networkSettings }, {
          interfaceType: draftType, internal: allowHttp,
        });
        const timeout = endpoint.timeoutSeconds || 60;
        if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 600) throw Error('超时须为 1–600 秒');
      }
      if (kindChanged && endpoint.requestRules) normalizeChannelRequestRules(endpoint.requestRules, draftType);
      if (!ops.isCurrent()) throw Error('权限或数据已有变化，请重新核对');
      setReviewDraft(next);
      setReviewRevision(impact.revision);
      ops.setError('');
      setStage('review');
    } catch (error) {
      ops.setError(error.message);
    }
  };
  const rename = nameChanged ? { name: draft.name.trim(), connectionNameOnly: true } : {};
  const directoryInfo = { ...rename, ...(noteChanged ? { note } : {}), ...(sourceTypeChanged ? { channelSourceType: draft.sourceType } : {}) };
  let root;
  try { if (draftType !== 'custom') root = suggestChannelRoot({ interfaceType: draftType, baseUrl: draft.url, allowHttp }); } catch { /* The transaction validates incomplete addresses. */ }
  const prepare = async () => {
    if (blocked || stale || connectionChanged && reviewRevision !== impact.revision) return;
    setBusy(true);
    try {
      if (!ops.isCurrent()) throw Error('权限或数据已有变化，请重新核对');
      const kind = CHANNEL_INTERFACES.find(option => option.id === draftType) || (draftType === 'custom' ? { id: 'custom', protocol: '其他' } : null);
      const next = await ops.run('supplierChannelEdit', { ...base, ...(connectionChanged ? rename : directoryInfo), providerId: provider.id, endpointId: endpoint.id,
        baseUrl: draft.url, ...(connectionChanged ? { prepareConnection: true } : {}),
        ...(connectionChanged ? { allAssociations: true } : {}),
        ...(!setInterface && !customChanged && connectionChanged ? { addressOnly: true } : {}),
        ...(replacingProtocol ? { modelProtocol: draft.type, endpointPath } : setInterface && kind ? { protocol: kind.protocol, interfaceType: kind.id } : {}),
        ...(customChanged ? { customAdapter: null } : {}),
        ...(customChanged ? { expectedImpactRevision: reviewRevision } : {}),
      });
      if (next) {
        if (!connectionChanged) { close(); return; }
        ops.dirty(infoChanged);
        setStage('test');
      }
    } catch (error) { ops.setError(error.message); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const data = { ...context, confirmed: true, allAssociations: true, ...(unlinked ? { unlinked: true } : {}) };
      const next = infoChanged ? await ops.run('supplierChannelEdit', {
        ...data, ...directoryInfo, expectedUpdatedAt: endpoint.updatedAt, expectedProviderUpdatedAt: provider.updatedAt,
      }) : await ops.run('channelCandidateApply', data);
      if (next) close();
    } finally { setBusy(false); }
  };
  const edit = stage === 'edit', review = stage === 'review';
  const pending = status?.checks.filter(check => !check.passed).map(check => check.associationId) || [];
  const cannotApply = !candidate || stale || Boolean(status?.reason) || (unlinked ? Boolean(status?.credentialError) : !status?.ready);
  const disabled = locked || incomplete || stale || !hasEdits;
  const proposed = review ? reviewDraft : candidate?.config;
  const typeLabel = t('连接类型');
  const title = t(edit ? '编辑信息' : review ? '核对连接变更' : '验证连接变更');
  const actions = edit ? <>
    <Button type="tertiary" onClick={cancel} disabled={busy || testing}>{t('取消')}</Button>
    <Button form={formId} htmlType="submit" theme="solid" loading={busy} disabled={disabled}>{t(connectionChanged ? '核对变更' : '保存')}</Button>
  </> : <>
    <Button onClick={() => setStage('edit')} disabled={busy || testing}>{t('返回编辑')}</Button>
    {review ? <Button theme="solid" loading={busy} disabled={blocked || stale || reviewRevision !== impact.revision} onClick={prepare}>
      {t(unlinked ? '准备候选配置' : '进入候选测试')}
    </Button> : <Button theme="solid" loading={busy} disabled={blocked || cannotApply} onClick={apply}>
      {t(unlinked ? '保存未启用连接' : '应用配置')}
    </Button>}
  </>;
  if (stage === 'pool' && candidate) return <ChannelKeyPoolEditor
    state={state} provider={provider} endpoint={endpoint} ops={ops} close={close} directory/>;
  return <Modal drawer wide title={title} description="" onClose={cancel} footer={actions}>
    <div ref={stageContent} tabIndex={-1}>
      {edit ? <form id={formId} className="supplier-configuration-form" noValidate onSubmit={event => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) {
          if (connectionChanged) void submitReview();
          else void prepare();
        }
      }}>
        <div className="supplier-configuration-body">
          <Field label={t('连接名称')} required help={t('填写便于识别的名称，同一服务商下不可重复。')}>
            <Input aria-label={t('连接名称')} maxLength={60} value={draft.name} onChange={value => update({ name: value })} disabled={locked}/>
          </Field>
          <Field label={t('服务商')}>{provider.name}</Field>
          <Field label={typeLabel} required help={t('选择第三方模型服务或自有模型推理服务。')}>
            <Choice label={typeLabel} value={draft.sourceType} disabled={locked}
              options={CHANNEL_SOURCE_TYPES.map(type => [type, t(channelSourceTypeLabel(type))])}
              onChange={sourceType => update({ sourceType })}/>
          </Field>
          <ChannelProtocolFields protocol={draft.type} baseUrl={draft.url} allowHttp={allowHttp} disabled={locked} root={root}
            showHelp allowCustom={initialSelection === 'custom'} current={kindChanged ? undefined : connection}
            endpointPath={draft.endpointPath} onEndpointPathChange={endpointPath => update({ endpointPath })}
            onProtocolChange={type => update({ type, endpointPath: type === initialSelection ? endpoint.endpointPath ?? null : null })}
            onBaseUrlChange={url => update({ url })}/>
          <Field label={t('简介')}><TextArea aria-label={t('简介')} value={note} maxLength={300} disabled={locked}
            onChange={value => { setNote(value); ops.dirty(true); ops.setError(''); }}/></Field>
          {candidate && <Notice>{t('此连接有待验证的配置。')}
            <Button theme="borderless" onClick={() => setStage(credentialCandidate && candidate.config.authMode === 'pool' ? 'pool' : 'test')}>
              {t('核对待验证配置')}
            </Button>
          </Notice>}
        </div>
      </form> : <>
        {proposed && <ConnectionChanges connection={connection} next={proposed} name={draft.name.trim()} note={note.trim()}
          sourceType={draft.sourceType} showCredentials={!review && credentialCandidate}/>}
        {review ? <>
          <Notice>当前配置继续生效。核对 {impact.mappings.length} 条上游模型及 {impact.services.length} 个关联服务。</Notice>
          <AffectedModels connection={connection} impact={impact} checks={[]}/>
          {reviewRevision !== impact.revision && <Notice error>{t('连接或引用已变化，请返回重新核对。')}</Notice>}
        </> : candidate ? <>
          <Notice>{unlinked ? '此连接尚无模型，将保存为停用状态。添加模型后再测试。' :
            status?.ready ? '受影响的上游模型均已通过测试，可以应用新配置。' : '当前配置继续生效。受影响的上游模型通过测试后才能应用。'}</Notice>
          {JSON.stringify(candidate.config.requestRules || null) !== JSON.stringify(endpoint.requestRules || null) &&
            <Notice>候选配置包含请求与响应规则变更。</Notice>}
          <AffectedModels connection={connection} impact={impact} checks={status?.checks || []}/>
          {status?.reason && <Notice error>{status.reason}</Notice>}
          {status?.credentialError && <Notice error>{status.credentialError}</Notice>}
          {!unlinked && !status?.ready && <CandidateProbePanel key={candidate.id} state={state} context={context} ops={ops}
            associationIds={pending.length ? pending.slice(0, 50) : undefined} onBusyChange={setTesting}
            testLabel={candidate.tests.length ? '重试未通过项（产生用量）' : '测试新配置（产生用量）'}/>}
          <Button disabled={blocked} onClick={async () => { if (await ops.run('channelCandidateDiscard', context)) close(); }}>{t('放弃候选配置')}</Button>
        </> : <Notice>{t('候选配置已变化，请退出后重新编辑。')}</Notice>}
      </>}
      {(ops.error || stale) && <Notice error>{ops.error || t('连接资料已变化，请重新打开后编辑。')}</Notice>}
    </div>
  </Modal>;
}

export function ChannelModelEditor({ model, connection, ops, close }) {
  const { endpoint, provider } = connection;
  const { association, modelName } = model;
  const savedName = provider.catalogConnections?.find(row => row.id === association.id)?.name;
  const currentName = association.sourceName || savedName || modelChannelName(provider, association);
  const [value, setValue] = useState(() => ({ name: currentName, upstream: association.upstreamModelId, displayName: modelName }));
  const [base] = useState(() => ({ expectedUpdatedAt: endpoint.updatedAt, expectedProviderUpdatedAt: provider.updatedAt }));
  const [busy, setBusy] = useState(false);
  const upstreamChanged = value.upstream.trim() !== association.upstreamModelId;
  const displayNameChanged = value.displayName.trim() !== modelName;
  const disabled = busy || !ops.can;
  const update = patch => { setValue(current => ({ ...current, ...patch })); ops.dirty(true); ops.setError(''); };
  const save = async () => {
    setBusy(true);
    try {
      if (await ops.run('supplierChannelEdit', {
        ...base, providerId: provider.id, endpointId: endpoint.id, associationId: association.id,
        modelId: association.modelId, name: supplierChannelName(provider, endpoint), sourceName: value.name.trim(),
        upstreamModelId: value.upstream.trim(), baseUrl: endpoint.baseUrl,
        ...(displayNameChanged ? { modelDisplayName: value.displayName.trim() } : {}),
      })) close();
    } finally { setBusy(false); }
  };
  return <SupplierCreationDialog title="编辑模型" cancel={() => !busy && ops.proceed(close)}
    submit={save} action="保存" disabled={disabled || !value.upstream.trim() || !value.displayName.trim() || (!upstreamChanged && !displayNameChanged)}>
    <Field label="模型标识 *"><Input aria-label="模型标识" value={value.upstream} maxLength={200} disabled={disabled}
      onChange={upstream => update({ upstream })}/></Field>
    <Field label="展示名称 *"><Input aria-label="展示名称" value={value.displayName} maxLength={120} disabled={disabled}
      onChange={displayName => update({ displayName })}/></Field>
    {upstreamChanged && <Notice>修改模型标识后，需重新测试该模型。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}
