import { useEffect, useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Radio, RadioGroup, Space, TabPane, Tabs, TextArea, Typography } from '@douyinfe/semi-ui';
import AdminStatus from './AdminStatus';
import CandidateProbePanel from './CandidateProbePanel';
import ChannelRequestRulesEditor, { ChannelAliasRules } from './ChannelRequestRulesEditor';
import ChannelCustomAdapterEditor from './ChannelCustomAdapterEditor';
import { Cell, CopyId, GridTable, Modal, Notice, Row } from './ModelOperationsUI';
import { Choice, Field } from './ServiceUI';
import SupplierCreationDialog from './SupplierCreationDialog';
import { SupplierKeyGroupField } from './SupplierKeyGroupField';
import { channelCandidateStatus, channelChangeImpact } from './channel-change-management';
import { CHANNEL_INTERFACES, suggestChannelRoot } from './channel-interface';
import { emptyChannelRules, normalizeChannelRequestRules } from './channel-request-rules';
import { defaultChannelNetwork, normalizeChannelNetwork } from './channel-network-settings';
import { emptyCustomAdapter, normalizeCustomAdapter } from './channel-custom-adapter';
import { channelStatus } from './channel-selection';
import { channelInterfaceIssue } from './provider-channels';
import { connectionCredentialsReady } from './connection-state';
import { modelChannelName } from './model-channel-name';
import { providerApiKeysDraft } from './provider-management';
import { supplierChannelName } from './supplier-resources';

const shownTime = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';
const interfaceLabel = value => CHANNEL_INTERFACES.find(row => row.id === value)?.label || value || '—';

function AffectedModels({ connection, impact, checks }) {
  const { models, provider } = connection;
  const byId = new Map(models.map(model => [model.association.id, model]));
  return <GridTable headings={checks ? ['模型', '上游模型调用标识', '关联服务', '验证状态'] :
    ['模型', '上游模型调用标识', '模型状态']} empty={!impact.mappings.length} emptyMessage="暂无已接入模型">
    {impact.mappings.map(mapping => {
      const check = checks?.find(record => record.associationId === mapping.id);
      const services = impact.services.filter(service => service.associationIds.includes(mapping.id));
      return <Row key={mapping.id}>
        <Cell>{byId.get(mapping.id)?.modelName || mapping.modelId}</Cell><Cell>{mapping.upstreamModelId}</Cell>
        {checks && <Cell>{services.map(service => <div key={service.id}><CopyId value={service.id} label="模型服务 ID"/></div>)}{!services.length && '—'}</Cell>}
        <Cell><AdminStatus value={checks ? check?.passed ? '通过' : check?.evidence?.result || '待测试' : channelStatus(provider, mapping)}/>
          {check?.reason && <div>{check.reason}</div>}</Cell>
      </Row>;
    })}
  </GridTable>;
}

export function ChannelConnectionEditor({ state, connection, ops, close, initialTab = 'connection', routing, modelActions, manageKeys, reference = false }) {
  const { provider, endpoint, name } = connection;
  const candidate = endpoint.candidateConfiguration;
  const initialType = endpoint.interfaceType || CHANNEL_INTERFACES.find(row => row.protocol === endpoint.protocol)?.id || '';
  const initialAuth = ['specific', 'none', 'pending', 'pool'].includes(endpoint.authMode) ? endpoint.authMode : 'group';
  const [draft, setDraft] = useState(() => ({
    name, type: initialType, url: endpoint.baseUrl || '', auth: initialAuth,
    group: endpoint.authMode === 'group' ? endpoint.keyGroupId : 'current', key: '',
  }));
  const [base, setBase] = useState(() => ({ expectedUpdatedAt: endpoint.updatedAt, expectedProviderUpdatedAt: provider.updatedAt }));
  const [rulesText, setRulesText] = useState(() => JSON.stringify(endpoint.requestRules || emptyChannelRules, null, 2));
  const initialAdapter = JSON.stringify(endpoint.customAdapter || emptyCustomAdapter, null, 2);
  const [customText, setCustomText] = useState(initialAdapter);
  const [reviewedAdapter, setReviewedAdapter] = useState(null);
  const [rulesChanged, setRulesChanged] = useState(false);
  const [reviewedRules, setReviewedRules] = useState(null);
  const [selectedModels, setSelectedModels] = useState([]);
  const defaultTestModels = connection.models.filter(row => ['text', 'multimodal', 'embedding', 'rerank'].includes(row.master?.type) &&
    !channelInterfaceIssue(provider, row.association));
  const currentDefault = defaultTestModels.some(row => row.association.id === endpoint.directoryDefaultTestAssociationId)
    ? endpoint.directoryDefaultTestAssociationId : '';
  const [defaultTestModel, setDefaultTestModel] = useState(currentDefault);
  const [tab, setTab] = useState(initialTab);
  const [network, setNetwork] = useState(() => ({ ...defaultChannelNetwork, ...endpoint.networkSettings }));
  const [timeout, setTimeoutValue] = useState(() => endpoint.timeoutSeconds || 60);
  const [note, setNote] = useState(() => endpoint.directoryNote || '');
  const [initialNote] = useState(note);
  const [policy, setPolicy] = useState(() => ({ enabled: endpoint.directoryAutoStop?.enabled || false, threshold: endpoint.directoryAutoStop?.threshold || 3 }));
  const [initialName] = useState(name);
  const [stage, setStage] = useState('edit');
  const [rollback, setRollback] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  useEffect(() => { if (!ops.can) setDraft(value => ({ ...value, key: '' })); }, [ops.can]);
  const impact = channelChangeImpact(state, provider.id, endpoint.id);
  const [reviewRevision, setReviewRevision] = useState(impact.revision);
  const context = { providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0, candidateId: candidate?.id };
  const status = candidate && channelCandidateStatus(state, provider.id, endpoint.id, { allAssociations: true });
  const nameChanged = draft.name.trim() !== initialName;
  const kindChanged = draft.type !== initialType;
  const groupChanged = draft.auth === 'group' && draft.group !== 'current' && (endpoint.authMode !== 'group' || draft.group !== endpoint.keyGroupId);
  const noAuthChanged = draft.auth === 'none' && initialAuth !== 'none';
  const keyEntered = draft.auth === 'specific' && Boolean(draft.key.trim());
  const changedNetwork = JSON.stringify(network) !== JSON.stringify({ ...defaultChannelNetwork, ...endpoint.networkSettings });
  const changedTimeout = timeout !== (endpoint.timeoutSeconds || 60);
  const noteChanged = note.trim() !== (reference ? initialNote : endpoint.directoryNote || '');
  const staleNote = reference && noteChanged && (endpoint.directoryNote || '') !== initialNote;
  const policyChanged = policy.enabled !== Boolean(endpoint.directoryAutoStop?.enabled) || policy.threshold !== (endpoint.directoryAutoStop?.threshold || 3);
  const defaultTestChanged = defaultTestModel !== currentDefault;
  const customChanged = draft.type === 'custom' ? customText !== initialAdapter : Boolean(endpoint.customAdapter);
  const connectionChanged = kindChanged || draft.url.trim() !== (endpoint.baseUrl || '') || draft.auth !== initialAuth || groupChanged || keyEntered || rulesChanged || changedNetwork || changedTimeout || customChanged;
  const setInterface = kindChanged || !endpoint.interfaceType && connectionChanged;
  const incomplete = !draft.name.trim() || (connectionChanged && (!draft.url.trim() || !draft.type || draft.type === 'unselected' ||
    draft.auth === 'specific' && initialAuth !== 'specific' && !keyEntered ||
    draft.auth === 'pending' || draft.auth === 'group' && initialAuth !== 'group' && draft.group === 'current'));
  const unlinked = !impact.mappings.length && !state.modelSupplies.some(row => row.endpointId === endpoint.id && row.status !== '已移除');
  const staleName = nameChanged && name !== initialName;
  const blocked = !ops.can || busy || testing && !status?.ready;
  const locked = blocked || Boolean(candidate);
  const hasEdits = nameChanged || connectionChanged || noteChanged || policyChanged || defaultTestChanged;
  const update = patch => { setDraft(value => ({ ...value, ...patch })); ops.dirty(true); ops.setError(''); };
  const updateRules = value => { setRulesText(value); setRulesChanged(true); ops.dirty(true); ops.setError(''); };
  const cancel = () => { if (!busy && !testing) ops.proceed(close); };
  const submitReview = () => {
    if (customChanged) {
      try { setReviewedAdapter(draft.type === 'custom' ? normalizeCustomAdapter(JSON.parse(customText)) : null); }
      catch (error) { setTab('connection'); ops.setError(error.message); return; }
    }
    if (changedNetwork || changedTimeout || kindChanged && endpoint.networkSettings) {
      try {
        normalizeChannelNetwork(network, { interfaceType: draft.type, internal: provider.sourceType === 'selfHosted' });
        if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 600) throw Error('超时须为 1–600 秒');
      } catch (error) { setTab('network'); ops.setError(error.message); return; }
    }
    try {
      if (rulesChanged || kindChanged && endpoint.requestRules) setReviewedRules(normalizeChannelRequestRules(JSON.parse(rulesText), draft.type));
      setReviewRevision(impact.revision);
      ops.setError('');
      setStage('review');
    } catch (error) {
      setTab('rules');
      ops.setError(error.message);
    }
  };
  const saveMetadata = async (operation, fields, otherEdits) => {
    if (blocked) return;
    setBusy(true);
    try {
      const next = await ops.run(operation, { providerId: provider.id, endpointId: endpoint.id, ...fields, expectedUpdatedAt: base.expectedUpdatedAt });
      if (next) {
        const saved = next.endpoints.find(row => row.id === endpoint.id);
        setBase({ expectedUpdatedAt: saved.updatedAt, expectedProviderUpdatedAt: next.providers.find(row => row.id === provider.id).updatedAt });
        ops.dirty(nameChanged || connectionChanged || otherEdits);
      }
    } finally { setBusy(false); }
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
        ...(reference && noteChanged && !connectionChanged ? { note } : {}),
        ...(connectionChanged ? { allAssociations: true } : {}),
        ...(!setInterface && !groupChanged && !noAuthChanged && !newApiKey && !rulesChanged && !changedNetwork && !changedTimeout && !customChanged && connectionChanged ? { addressOnly: true } : {}),
        ...(setInterface && kind ? { protocol: kind.protocol, interfaceType: kind.id } : {}),
        ...(rulesChanged ? { requestRules: reviewedRules } : {}),
        ...(changedNetwork ? { networkSettings: network } : {}),
        ...(changedTimeout ? { timeoutSeconds: timeout } : {}),
        ...(customChanged ? { customAdapter: reviewedAdapter } : {}),
        ...(rulesChanged || changedNetwork || changedTimeout || customChanged ? { expectedImpactRevision: reviewRevision } : {}),
        ...(groupChanged ? { keyGroupId: draft.group } : {}), ...(noAuthChanged ? { authMode: 'none' } : {}), ...(newApiKey ? { newApiKey, channelOwned: true } : {}),
      });
      if (next) {
        if (!connectionChanged) { close(); return; }
        setDraft(value => ({ ...value, key: '' }));
        ops.dirty(nameChanged || reference && noteChanged);
        setStage('test');
      }
    } catch (error) { ops.setError(error.message); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const data = { ...context, confirmed: true, allAssociations: true, ...(unlinked ? { unlinked: true } : {}) };
      const saveNote = reference && noteChanged;
      const next = nameChanged || saveNote ? await ops.run('supplierChannelEdit', {
        ...data, ...rename, expectedUpdatedAt: endpoint.updatedAt, expectedProviderUpdatedAt: provider.updatedAt,
        ...(saveNote ? { note } : {}),
      }) : await ops.run('channelCandidateApply', data);
      if (next) close();
    } finally { setBusy(false); }
  };
  const createRollback = async () => {
    setBusy(true);
    try {
      if (await ops.run('channelCandidateRollback', { ...context, targetVersion: Number(rollback), allAssociations: true })) setStage('test');
    } finally { setBusy(false); }
  };
  const description = provider.name + ' / ' + name;
  const currentVersion = endpoint.configurationRevision || 0;
  const versions = endpoint.configurationVersions?.length ? [...endpoint.configurationVersions].reverse()
    : [{ version: currentVersion, config: endpoint, appliedAt: endpoint.updatedAt }];
  if (reference && stage === 'edit') return <SupplierCreationDialog title="编辑信息" cancel={cancel}
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
  if (stage === 'edit') return <SupplierCreationDialog drawer wide className="channel-connection-editor"
    title={ops.can ? '编辑连接' : '查看连接'} description={description} cancel={cancel} cancelLabel="关闭" submit={submitReview}
    action="核对变更" disabled={blocked || incomplete || noteChanged || policyChanged || defaultTestChanged || !nameChanged && !connectionChanged || Boolean(candidate)}>
    {candidate && <div className="channel-candidate-banner">
      <AdminStatus value="待验证"/>
      <Typography.Text>有一份连接变更待验证，当前配置继续生效。</Typography.Text>
      <Button theme="light" size="small" onClick={() => setStage('test')}>处理待验证配置</Button>
    </div>}
    <Tabs activeKey={tab} onChange={setTab} keepDOM aria-label="连接配置">
      <TabPane tab="连接与模型" itemKey="connection">
    <Typography.Title heading={5} component="h3">连接信息</Typography.Title>
    <div className="channel-operation-fields">
      <Field label="连接名称 *"><Input aria-label="连接名称" maxLength={60} value={draft.name} onChange={value => update({ name: value })} disabled={locked}/></Field>
      <Field label="连接 ID"><CopyId value={endpoint.id} label="连接 ID"/></Field>
      <Field label="上游协议 *"><Choice label="上游协议" value={draft.type || 'unselected'} options={[
        ['unselected', '请选择上游协议'], ...CHANNEL_INTERFACES.map(option => [option.id, option.label]),
        ['custom', '高级自定义 API'],
      ]} onChange={type => update({ type })} disabled={locked}/></Field>
      <div className="channel-editor-address">
        <Field label="上游 API 地址 *"><Input aria-label="上游 API 地址" maxLength={2048} value={draft.url} onChange={url => update({ url })} disabled={locked}/></Field>
      </div>
    </div>
    {draft.type === 'custom' && <ChannelCustomAdapterEditor text={customText} baseUrl={draft.url}
      credentials={(provider.apiKeys || []).filter(key => !key.revokedAt && key.status !== 'disabled')}
      model={connection.models[0]?.association.upstreamModelId} disabled={locked}
      onChange={value => { setCustomText(value); ops.dirty(true); ops.setError(''); }}/>}
    {root && <Button theme="borderless" disabled={locked} onClick={() => update({ url: root })}>使用根地址 {root}</Button>}
    {(defaultTestModels.length > 1 || currentDefault) && <div className="channel-test-default">
      <Field label="默认测试模型"><Choice label="默认测试模型" value={defaultTestModel || 'all'} disabled={locked}
        options={[[ 'all', '全部基础模型' ], ...defaultTestModels.map(row => [row.association.id, row.modelName])]}
        onChange={value => {
          const next = value === 'all' ? '' : value;
          setDefaultTestModel(next);
          ops.dirty(nameChanged || connectionChanged || noteChanged || policyChanged || next !== currentDefault);
          ops.setError('');
        }}/></Field>
      {defaultTestChanged && <Button theme="light" disabled={locked}
        onClick={() => saveMetadata('channelDirectoryDefaultTest', { associationId: defaultTestModel || null }, noteChanged || policyChanged)}>
        保存默认测试模型
      </Button>}
    </div>}
    <div className="channel-editor-section-heading">
      <Typography.Title heading={5} component="h3">已接入模型</Typography.Title>
      <Space wrap>
        {selectedModels.length > 0 && <Button theme="borderless" onClick={async () => {
        try {
          const values = connection.models.filter(row => selectedModels.includes(row.key)).map(row => row.association.upstreamModelId);
          await navigator.clipboard.writeText(values.join('\n'));
        } catch { ops.setError('未能复制模型标识，请重试'); }
        }}>复制所选模型标识</Button>}
        <Button theme="light" disabled={locked || Boolean(endpoint.adapterDraft)} onClick={modelActions.add}>接入模型</Button>
      </Space>
    </div>
    <GridTable className="channel-editor-model-table" headings={['选择', '模型', '上游模型调用标识', '模型状态', '操作']}
      empty={!connection.models.length} emptyMessage="暂无已接入模型">
      {connection.models.map(row => <Row key={row.key}>
        <Cell><Checkbox aria-label={'选择模型 ' + row.modelName} checked={selectedModels.includes(row.key)}
          onChange={event => setSelectedModels(current => event.target.checked ? [...current, row.key] : current.filter(key => key !== row.key))}/></Cell>
        <Cell>{row.modelName}</Cell><Cell><CopyId value={row.association.upstreamModelId} label="上游模型调用标识"/></Cell>
        <Cell><AdminStatus value={channelStatus(provider, row.association)}/></Cell>
        <Cell><Button theme="borderless" size="small" disabled={locked} aria-label={'配置模型 ' + row.modelName}
          onClick={event => modelActions.edit(event, row.key)}>配置模型</Button></Cell>
      </Row>)}
    </GridTable>
      </TabPane>
      <TabPane tab="密钥管理" itemKey="credentials">
        <Typography.Title heading={5} component="h3">API 密钥来源</Typography.Title>
        <RadioGroup aria-label="API 密钥来源" direction="horizontal" value={draft.auth} disabled={locked}
          onChange={event => update({ auth: event.target.value, key: '' })}>
          <Radio value="group">服务商 API 密钥组</Radio><Radio value="specific">渠道专属密钥</Radio>
          {initialAuth === 'pool' && <Radio value="pool">当前连接密钥池</Radio>}
          {provider.sourceType === 'selfHosted' && <Radio value="none">无需认证</Radio>}
        </RadioGroup>
        {draft.auth === 'group' ? <SupplierKeyGroupField state={state} provider={provider} ops={ops} value={draft.group}
          current={endpoint.authMode !== 'group' ? { name: '请选择服务商 API 密钥组', ready: false } : null}
          channelId={endpoint.id} disabled={locked} onChange={group => update({ group })}/> : draft.auth === 'specific' &&
          <Field label="渠道专属密钥"><Input aria-label="渠道专属密钥" mode="password" autoComplete="new-password" maxLength={512}
            value={draft.key} disabled={locked} onChange={key => update({ key })} placeholder={initialAuth === 'specific' ? '留空保留已配置密钥' : '请输入 API 密钥'}/></Field>}
        <div className="channel-editor-section-heading">
          <Space><Typography.Text>当前凭证</Typography.Text><AdminStatus value={connectionCredentialsReady(endpoint, provider) ? '已配置' : '待配置'}/></Space>
          <Button theme="light" onClick={manageKeys}>管理密钥</Button>
        </div>
      </TabPane>
      {routing && <TabPane tab="路由与映射" itemKey="routing">{routing}
        <ChannelAliasRules text={rulesText} interfaceType={draft.type} disabled={locked} onChange={updateRules}/></TabPane>}
      <TabPane tab="请求与响应" itemKey="rules">
        <ChannelRequestRulesEditor text={rulesText} model={connection.models[0]?.association.upstreamModelId} interfaceType={draft.type} disabled={locked}
          onChange={updateRules}/>
      </TabPane>
      <TabPane tab="运行设置" itemKey="network">
        <Typography.Title heading={5}>网络与运行参数</Typography.Title>
        <div className="channel-operation-fields">
          <Field label="请求超时（秒）"><InputNumber aria-label="请求超时" min={1} max={600} value={timeout} disabled={locked}
            onChange={value => { setTimeoutValue(Number(value)); ops.dirty(true); }}/></Field>
          <Field label="代理配置引用"><Input aria-label="代理配置引用" value={network.proxyRef} placeholder="例如 proxy-east"
            disabled={locked} onChange={proxyRef => { setNetwork(value => ({ ...value, proxyRef })); ops.dirty(true); }}/></Field>
          <Field label="HTTP 协议"><Choice label="HTTP 协议" value={network.httpVersion} disabled={locked}
            options={[[ 'auto', '自动协商' ], [ 'http1', 'HTTP/1.1' ], [ 'http2', 'HTTP/2' ]]}
            onChange={httpVersion => { setNetwork(value => ({ ...value, httpVersion })); ops.dirty(true); }}/></Field>
          {network.httpVersion === 'http2' && <Field label="HTTP/2 分片"><InputNumber aria-label="HTTP/2 分片" min={1} max={8} value={network.http2Streams} disabled={locked}
            onChange={value => { setNetwork(current => ({ ...current, http2Streams: Number(value) })); ops.dirty(true); }}/></Field>}
          {provider.sourceType === 'selfHosted' && <Field label="证书信任策略"><Choice label="证书信任策略" value={network.certificate} disabled={locked}
            options={[[ 'default', '默认验证' ], [ 'internal', '内部可信 CA' ]]}
            onChange={certificate => { setNetwork(value => ({ ...value, certificate })); ops.dirty(true); }}/></Field>}
          {network.certificate === 'internal' && <Field label="内部可信 CA 引用"><Input aria-label="内部可信 CA 引用" value={network.caRef} disabled={locked}
            onChange={caRef => { setNetwork(value => ({ ...value, caRef })); ops.dirty(true); }}/></Field>}
          {draft.type === 'custom' && <Field label="异步任务轮询"><Choice label="异步任务轮询" value={network.polling} disabled={locked}
            options={[[ 'default', '默认间隔' ], [ 'slow', '延长间隔' ], [ 'external', '跳过适配器等待' ]]}
            onChange={polling => { setNetwork(value => ({ ...value, polling })); ops.dirty(true); }}/></Field>}
          {(provider.sourceType === 'selfHosted' || draft.type === 'custom') && <Field label="专项适配器"><Choice label="专项适配器" value={network.runtimeKind || ''} disabled={locked}
            options={[[ '', '无专项适配器' ], ...(provider.sourceType === 'selfHosted' ? [['ollama', 'Ollama'], ['vllm', 'vLLM'], ['sglang', 'SGLang']] : []),
              ...(draft.type === 'custom' ? [['plugin', '任务插件']] : [])]}
            onChange={runtimeKind => { setNetwork(value => ({ ...value, runtimeKind })); ops.dirty(true); }}/></Field>}
          <Field label="运维标签">{endpoint.directoryTags?.join('、') || '未设置'}</Field>
        </div>
        <Field label="内部备注"><TextArea aria-label="内部备注" value={note} maxLength={300} disabled={locked}
          onChange={value => { setNote(value); ops.dirty(true); }}/></Field>
        <Button theme="light" disabled={locked || !noteChanged}
          onClick={() => saveMetadata('channelDirectoryNote', { note }, policyChanged || defaultTestChanged)}>保存内部备注</Button>
        <section className="supplier-change-section">
          <Typography.Title heading={5}>自动停用</Typography.Title>
          <Checkbox checked={policy.enabled} disabled={locked} onChange={event => {
            setPolicy(value => ({ ...value, enabled: event.target.checked })); ops.dirty(true);
          }}>所有模型均鉴权失败时自动停用{endpoint.authMode === 'pool' ? '受测密钥' : '连接'}</Checkbox>
          <Field label="连续失败次数"><InputNumber aria-label="连续失败次数" value={policy.threshold} min={1} max={10}
            disabled={locked || !policy.enabled} onChange={threshold => { setPolicy(value => ({ ...value, threshold: Number(threshold) })); ops.dirty(true); }}/></Field>
          <Button theme="light" disabled={locked || !policyChanged || !Number.isInteger(policy.threshold) || policy.threshold < 1 || policy.threshold > 10}
            onClick={() => saveMetadata('channelDirectoryAutoStop', policy, noteChanged || defaultTestChanged)}>保存自动停用策略</Button>
        </section>
      </TabPane>
      <TabPane tab="配置历史" itemKey="history">
        <GridTable headings={['版本', '生效时间（北京时间）', '上游 API 地址', '状态']}>{versions.map(version =>
          <Row key={version.version}><Cell>v{version.version}</Cell><Cell>{shownTime(version.appliedAt)}</Cell><Cell>{version.config.baseUrl}</Cell>
            <Cell><AdminStatus value={version.version === currentVersion ? '生效中' : '历史'}/></Cell></Row>)}</GridTable>
        {!candidate && versions.some(version => version.version !== currentVersion) && <>
          <Field label="回滚配置版本"><Choice label="回滚配置版本" value={rollback} onChange={setRollback} disabled={blocked || hasEdits}
            options={[[ '', '请选择历史版本' ], ...versions.filter(version => version.version !== currentVersion).map(version =>
              [String(version.version), `v${version.version} · ${shownTime(version.appliedAt)}`])]}/></Field>
          <Button theme="light" loading={busy} disabled={blocked || hasEdits || rollback === ''} onClick={createRollback}>生成回滚候选</Button>
          <Notice>{hasEdits ? '请先处理本次修改。' : '回滚须经候选验证，验证通过后再应用为新版本。'}</Notice>
        </>}
      </TabPane>
    </Tabs>
    {(noteChanged || policyChanged) && tab !== 'network' && <Notice>运行设置中有未保存的备注或自动停用策略。</Notice>}
    {defaultTestChanged && tab !== 'connection' && <Notice>「连接与模型」中有未保存的默认测试模型。</Notice>}
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
      {(groupChanged || keyEntered || noAuthChanged) && <div><dt>API 密钥</dt><dd>{noAuthChanged ? '无需认证' : keyEntered ? '换用渠道专属密钥' : '更换 API 密钥组'}</dd></div>}
      {rulesChanged && <div><dt>请求与响应</dt><dd>{reviewedRules?.parameters.operations.length || 0} 条参数操作 · {Object.keys(reviewedRules?.headers || {}).length} 项请求头 · {Object.keys(reviewedRules?.statusCodes || {}).length} 项状态码映射</dd></div>}
      {changedTimeout && <div><dt>请求超时</dt><dd>{endpoint.timeoutSeconds || 60} 秒 → {timeout} 秒</dd></div>}
      {changedNetwork && <div><dt>网络参数</dt><dd>{network.httpVersion} · {network.proxyRef || '无代理'} · {network.caRef || '默认证书策略'}</dd></div>}
      {customChanged && <div><dt>自定义接口</dt><dd>{reviewedAdapter?.routes.length || 0} 条转发规则 · {reviewedAdapter?.models ? '已配置模型列表' : '无模型列表'} · {reviewedAdapter?.balance ? '已配置余额查询' : '无余额查询'}</dd></div>}
    </dl>
    {rulesChanged && reviewedRules?.processing?.passBody && <Notice>请求体将原样透传。请核对客户端发送的模型标识可由上游直接识别。</Notice>}
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

export function ChannelModelEditor({ model, connection, ops, close, cancelLabel, reference = false }) {
  const { endpoint, provider, name: connectionName } = connection;
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
  if (reference) return <SupplierCreationDialog title="编辑模型" cancel={() => !busy && ops.proceed(close)}
    submit={save} action="保存" disabled={disabled || !value.upstream.trim() || !upstreamChanged}>
    <Field label="模型标识 *"><Input aria-label="模型标识" value={value.upstream} maxLength={200} disabled={disabled}
      onChange={upstream => update({ upstream })}/></Field>
    <Field label="展示名称">{modelName}</Field>
    {upstreamChanged && <Notice>修改模型标识后，需重新测试该模型。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
  return <SupplierCreationDialog drawer wide className="channel-connection-editor" title="配置模型渠道"
    description={[provider.name, connectionName, modelName].join(' / ')} cancel={() => !busy && ops.proceed(close)}
    submit={save} action={busy ? '保存中…' : '保存'} cancelLabel={cancelLabel}
    disabled={disabled || !value.name.trim() || !value.upstream.trim() || !upstreamChanged && value.name.trim() === currentName}>
    <div className="channel-operation-fields">
      <Field label="模型渠道名称 *"><Input aria-label="模型渠道名称" value={value.name} maxLength={60} disabled={disabled} onChange={name => update({ name })}/></Field>
      <Field label="上游模型调用标识 *"><Input aria-label="上游模型调用标识" value={value.upstream} maxLength={200} disabled={disabled} onChange={upstream => update({ upstream })}/></Field>
    </div>
    {upstreamChanged && <Notice>修改上游模型调用标识后，请重新测试该模型。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}
