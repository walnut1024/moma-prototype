import { useChannelText } from './channel-language';
import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Space, Typography } from '@douyinfe/semi-ui';
import { CopyId, GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { resolveChannelAssociationModel } from './channel-association-model';
import { connectionKeys } from './connection-state';
import { CHANNEL_EVIDENCE_MAX_AGE_MS, channelCandidateStatus, channelChangeImpact } from './channel-change-management';
import CandidateProbePanel from './CandidateProbePanel';
import ChannelDirectoryBalance from './ChannelDirectoryBalance';
import { Choice, Field } from './ServiceUI';
import { providerApiKeysDraft } from './provider-management';
import { cloudAdminRequest } from './admin-client.mjs';

const keyInput = () => ({ id: crypto.randomUUID(), value: '' });
const keyChangeNames = { append: '追加密钥', replace: '替换整池', rotate: '替换此密钥' };

function CredentialVerification({ endpoint, credential, reload, close }) {
  const translateLabel = useChannelText();
  const [value, setValue] = useState(''), [proof, setProof] = useState(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!proof) return;
    const timer = setTimeout(() => setProof(null), Math.max(0, Date.parse(proof.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [proof]);
  const verify = async () => {
    if (busy || value.length < 8) return;
    setBusy(true); setError('');
    const accessCode = value;
    setValue('');
    try {
      setProof(await cloudAdminRequest('/channels/' + encodeURIComponent(endpoint.id) + '/verify-credential', {
        method: 'POST', body: { keyId: credential.id, accessCode },
      }));
    } catch (error) { setError(error.message); }
    finally { setBusy(false); await reload?.(); }
  };
  return <Modal title="验证身份后查看凭证" description={endpoint.name} onClose={() => !busy && close()}
    footer={<><Button disabled={busy} onClick={close}>{translateLabel("关闭")}</Button>
      {!proof && <Button theme="solid" loading={busy} disabled={value.length < 8 || busy} onClick={verify}>验证后查看</Button>}</>}>
    {proof ? <>
      <Notice>验证通过，30 秒后结束查看。本地原型显示凭证摘要。</Notice>
      <CopyId value={proof.maskedKey} label="已验证的凭证摘要"/>
    </> : <Field label="验证当前账号"><Input mode="password" autoComplete="current-password" aria-label="当前账号访问码"
      maxLength={128} value={value} disabled={busy} onChange={setValue}/></Field>}
    {error && <Notice error>{error}</Notice>}
  </Modal>;
}

export default function ChannelKeyPoolEditor({ state, provider, endpoint, ops, close, directory = false, closeLabel = '关闭', replaceKeyId }) {
  const translateLabel = useChannelText();
  const candidate = endpoint.candidateConfiguration;
  const active = new Set(connectionKeys(endpoint, provider).map(key => key.id));
  const [rows, setRows] = useState(() => structuredClone(candidate?.config.authMode === 'pool' ? candidate.config.keyPool : endpoint.authMode === 'pool' ? endpoint.keyPool : connectionKeys(endpoint, provider, true).filter(key => !key.revokedAt).map((key, index) => ({ keyId: key.id, priority: index + 1, enabled: active.has(key.id) }))));
  const [strategy, setStrategy] = useState(candidate?.config.keyStrategy || endpoint.keyStrategy || 'priority');
  const keys = [...new Map([
    ...(directory ? [...(endpoint.apiKeys || []), ...(candidate?.config.apiKeys || [])].filter(key => key.scope === 'channel') : []),
    ...(provider.apiKeys || []),
  ].map(key => [key.id, key])).values()];
  const [edited, setEdited] = useState(false), [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyChange, setKeyChange] = useState(() => !candidate && replaceKeyId && rows.some(row => row.keyId === replaceKeyId)
    ? { mode: 'rotate', keyId: replaceKeyId, inputs: [keyInput()] } : null);
  const [stateFilter, setStateFilter] = useState('all'), [probeKey, setProbeKey] = useState('');
  const [verifying, setVerifying] = useState(null), [audit, setAudit] = useState(false);
  const [balanceKey, setBalanceKey] = useState(null);
  const [pauseAsk, setPauseAsk] = useState(false);
  const [selection, setSelection] = useState([]), [probeQueue, setProbeQueue] = useState([]), [probeRun, setProbeRun] = useState('');
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { if (!ops.can) setKeyChange(null); }, [ops.can]);
  const context = { providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0, candidateId: candidate?.id };
  const status = candidate && channelCandidateStatus(state, provider.id, endpoint.id);
  const impact = channelChangeImpact(state, provider.id, endpoint.id);
  const [expectedImpactRevision] = useState(impact.revision);
  const projected = { ...endpoint, ...candidate?.config };
  const available = projected.authMode === 'pool' ? connectionKeys(projected, provider) : [];
  const lookup = new Map(rows.map(row => [row.keyId, row]));
  const disabledForWrite = !ops.can || testing || saving || directory && Boolean(candidate?.pendingTests?.length || probeQueue.length);
  const unlinked = directory && !impact.mappings.length && !state.modelSupplies.some(row => row.endpointId === endpoint.id && row.status !== '已移除');
  const stopped = endpoint.directoryKeyStops || {};
  const filters = { all: '全部状态', enabled: '池内已启用', disabled: '池内已停用', automatic: '自动停用', unused: '未选用' };
  const visibleKeys = keys.filter(key => stateFilter === 'all' ||
    (lookup.has(key.id) ? stopped[key.id] && !lookup.get(key.id).enabled ? 'automatic' : lookup.get(key.id).enabled && !endpoint.poolPaused ? 'enabled' : 'disabled' : 'unused') === stateFilter);
  const beginKeyChange = (mode, keyId) => {
    ops.setError('');
    ops.dirty(true);
    setKeyChange({ mode, keyId, inputs: [keyInput()] });
  };
  const set = next => { setRows(next); setEdited(true); ops.dirty(true); ops.setError(''); };
  const save = async () => {
    if (!edited && !keyChange && candidate?.config.authMode === 'pool') return { state, context };
    if (directory) {
      if (disabledForWrite || lock.current) return null;
      lock.current = true;
      setSaving(true);
      try {
        const apiKeys = keyChange ? (await providerApiKeysDraft(keyChange.inputs.map(row => row.value))).apiKeys : [];
        if (!mounted.current || !ops.isCurrent()) return null;
        const next = await ops.run('channelCandidatePoolSave', { ...context, expectedImpactRevision,
          mode: keyChange?.mode || 'edit', replaceKeyId: keyChange?.keyId, keyPool: rows, keyStrategy: strategy, newKeys: apiKeys });
        if (!next) return null;
        const saved = next.endpoints.find(row => row.id === endpoint.id).candidateConfiguration;
        setRows(saved.config.keyPool);
        setKeyChange(null);
        setProbeKey('');
        setEdited(false);
        return { state: next, context: { ...context, candidateId: saved.id } };
      } catch (error) {
        ops.setError(error.message);
        return null;
      } finally { lock.current = false; if (mounted.current) setSaving(false); }
    }
    const previous = candidate ? Object.fromEntries(Object.entries(candidate.config).filter(([key]) => ['protocol', 'baseUrl', 'interfaceType', 'taskUrls', 'adapterOptions', 'capacity', 'timeoutSeconds', 'adapterVersion'].includes(key))) : {};
    const next = await ops.run('channelCandidateSave', { ...context,
      config: { ...previous, authMode: 'pool', keyPool: rows } });
    if (!next) return null;
    setEdited(false);
    return { state: next, context: { ...context, candidateId: next.endpoints.find(row => row.id === endpoint.id).candidateConfiguration.id } };
  };
  const prepared = candidate?.config.authMode === 'pool';
  const pendingEdits = edited || Boolean(keyChange);
  const basicModels = directory && impact.mappings.some(row => {
    try { return ['text', 'multimodal', 'embedding', 'rerank'].includes(resolveChannelAssociationModel(state, provider, row).type); }
    catch { return false; }
  });
  const selectedKeys = available.filter(row => selection.includes(row.id));
  const advanceProbe = () => {
    const [, next, ...rest] = probeQueue;
    setProbeQueue(next ? [next, ...rest] : []);
    if (next) setProbeKey(next);
  };
  const pause = async () => {
    if (!ops.can || saving) return;
    setSaving(true);
    try {
      if (await ops.run('channelCandidatePoolPause', { ...context, expectedImpactRevision, confirmed: true })) setPauseAsk(false);
    } finally { setSaving(false); }
  };
  const canApply = prepared && !disabledForWrite && !pendingEdits && (status?.ready || unlinked && !status?.reason && !status?.credentialError);
  const apply = async () => {
    if (!canApply || lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      if (await ops.run('channelCandidateApply', { ...context, confirmed: true, ...(unlinked ? { unlinked: true } : {}) })) close();
    } finally { lock.current = false; if (mounted.current) setSaving(false); }
  };
  return <><Modal drawer wide title={replaceKeyId ? '替换 API 密钥' : directory ? '连接密钥池' : '连接密钥池'} description={`${provider.name} · ${endpoint.name}`}
    onClose={() => !saving && ops.proceed(close)} footer={<>
      <Button theme="light" disabled={saving} onClick={() => ops.proceed(close)}>{closeLabel}</Button>
      <Button theme="light" disabled={disabledForWrite} onClick={save}>保存密钥池候选</Button>
      <Button theme="solid" disabled={!canApply} onClick={apply}>{unlinked ? '保存未启用的密钥池' : '应用密钥池'}</Button>
    </>}>
    <div className="supplier-resource-form">
    {directory && <Field label="选择策略"><Choice label="选择策略" value={strategy}
      options={[['priority', '按优先级'], ['random', '随机'], ['roundRobin', '轮询']]} disabled={disabledForWrite}
      onChange={value => { setStrategy(value); set(rows); }}/></Field>}
    {directory && <Space wrap>
      <Button disabled={disabledForWrite || Boolean(keyChange)} onClick={() => beginKeyChange('append')}>追加密钥</Button>
      <Button disabled={disabledForWrite || Boolean(keyChange)} onClick={() => beginKeyChange('replace')}>替换整池</Button>
      <Button disabled={disabledForWrite || !rows.some(row => (!row.enabled || endpoint.poolPaused) && keys.some(key => key.id === row.keyId && key.status !== 'disabled' && !key.revokedAt))}
        onClick={() => set(rows.map(row => keys.some(key => key.id === row.keyId && key.status !== 'disabled' && !key.revokedAt) ? { ...row, enabled: true } : row))}>启用全部可用密钥</Button>
      <Button type="danger" disabled={disabledForWrite || endpoint.authMode !== 'pool' || Boolean(endpoint.poolPaused || candidate || pendingEdits)}
        onClick={() => setPauseAsk(true)}>全部停用</Button>
      <Button disabled={disabledForWrite || !rows.some(row => stopped[row.keyId] && !row.enabled) || !rows.some(row => row.enabled)}
        onClick={() => set(rows.filter(row => !stopped[row.keyId] || row.enabled))}>清理自动停用密钥</Button>
      {prepared && basicModels && <Button disabled={!ops.can || pendingEdits || saving || testing || !selectedKeys.length || probeQueue.length > 0}
        onClick={() => { const ids = selectedKeys.map(row => row.id); setProbeQueue(ids); setProbeKey(ids[0]); setProbeRun(crypto.randomUUID()); }}>测试选中（基础检测）</Button>}
      {probeQueue.length > 0 && <Button onClick={() => setProbeQueue([])}>停止后续逐钥测试</Button>}
      <Choice label="密钥状态" value={stateFilter} options={Object.entries(filters)} onChange={setStateFilter}/>
      <Button theme="borderless" onClick={() => window.open('#/admin-2/providers-reference?' + new URLSearchParams({
        connection: endpoint.id, tab: 'api-keys',
      }), '_blank', 'noopener')}>打开上游 API 密钥池</Button>
      {state.currentRole === '平台管理员' && <Button theme="borderless" onClick={() => setAudit(true)}>查看凭证审计</Button>}
    </Space>}
    {directory && endpoint.poolPaused && <Notice>当前连接的密钥已全部停用。应用已通过验证的密钥池候选后，可另行启用连接。</Notice>}
    {keyChange && <section className="supplier-change-section">
      <Typography.Title heading={6}>{keyChangeNames[keyChange.mode]}</Typography.Title>
      {keyChange.mode === 'replace' && <Notice>候选池仅使用本次输入的密钥，共 {rows.length} 条原绑定会在应用时移出当前连接。</Notice>}
      {keyChange.mode === 'rotate' && <Notice>候选池将替换 {keys.find(key => key.id === keyChange.keyId)?.maskedKey || '此密钥'}，保留其他绑定和该条优先级。</Notice>}
      {keyChange.inputs.map((row, index) => <Field key={row.id} label={'新 API 密钥 ' + (index + 1)}>
        <Space><Input mode="password" autoComplete="new-password" maxLength={512} aria-label={'新 API 密钥 ' + (index + 1)}
          value={row.value} disabled={disabledForWrite} onChange={value => {
            ops.dirty(true);
            setKeyChange(current => ({ ...current, inputs: current.inputs.map(item => item.id === row.id ? { ...item, value } : item) }));
          }}/>
          {keyChange.inputs.length > 1 && <Button theme="borderless" disabled={disabledForWrite} onClick={() =>
            setKeyChange(current => ({ ...current, inputs: current.inputs.filter(item => item.id !== row.id) }))}>移除此行</Button>}
        </Space>
      </Field>)}
      <Space>{keyChange.mode !== 'rotate' && <Button disabled={disabledForWrite || keyChange.inputs.length >= 20} onClick={() =>
        setKeyChange(current => ({ ...current, inputs: [...current.inputs, keyInput()] }))}>再添加一把</Button>}
        <Button theme="borderless" disabled={disabledForWrite} onClick={() => {
          setKeyChange(null);
          if (!edited) ops.dirty(false);
          ops.setError('');
        }}>取消输入</Button></Space>
    </section>}
    <p className="supplier-price-hint">数字越小越优先，同优先级按列表顺序。修改后须验证所有启用密钥，当前配置在应用前保持生效。</p>
    <Notice>影响 {impact.mappings.length} 个模型、{impact.services.length} 项服务。{candidate && candidate.config.authMode !== 'pool' ? '已有候选配置将保留，密钥池配置一并验证。' : ''}</Notice>
    {!impact.mappings.length && <Notice>{unlinked ? '未接入模型的连接可以保存密钥池草稿。接入模型后再完成检测与启用。' : '请先在连接的“模型”中接入模型，再验证并应用密钥池。'}</Notice>}
    <GridTable className="supplier-pool-table" headings={['选用', 'API 密钥', '优先级', '池内状态', ...(directory ? ['逐钥验证'] : []), '操作']}
      empty={!visibleKeys.length} emptyMessage={directory ? '没有符合条件的密钥' : '请先在上游 API 密钥页添加密钥。'}>{visibleKeys.map(key => {
      const row = lookup.get(key.id), disabled = disabledForWrite || Boolean(key.revokedAt);
      const change = patch => set(rows.map(item => item.keyId === key.id ? { ...item, ...patch } : item));
      const index = available.findIndex(item => item.id === key.id);
      const receipts = !pendingEdits && index >= 0 ? (status?.checks || []).map(check => check.evidenceByKey?.[index]).filter(Boolean) : [];
      const passed = receipts.filter(item => item.result === '通过' && Date.now() - Date.parse(item.testedAt) <= CHANNEL_EVIDENCE_MAX_AGE_MS).length;
      const failed = receipts.find(item => item.result !== '通过');
      const tokens = receipts.map(item => item.usage?.total_tokens).filter(Number.isFinite);
      return <Row key={key.id}>
        <Cell><Checkbox aria-label={`选用密钥 ${key.id}`} checked={Boolean(row)} disabled={disabled}
          onChange={event => set(event.target.checked ? [...rows, { keyId: key.id, priority: rows.length + 1, enabled: key.status !== 'disabled' }] : rows.filter(item => item.keyId !== key.id))}/></Cell>
        <Cell><strong>{key.name || (directory ? key.scope === 'channel' ? '连接专属' : '上游 API 密钥' : key.id)}</strong><code>{key.maskedKey}</code>
          <small>{key.revokedAt ? '已撤销' : key.status === 'disabled' ? 'API 密钥已停用' : directory ? active.has(key.id) ? '当前生效' : '可选或候选' : key.id}</small></Cell>
        <Cell>{row ? <InputNumber min={1} max={100} aria-label={`密钥 ${key.id} 优先级`} value={row.priority} disabled={disabled}
          onChange={value => change({ priority: Number(value) })}/> : '—'}</Cell>
        <Cell>{row ? <Checkbox aria-label={`密钥 ${key.id} 池内启用`} checked={row.enabled && (!endpoint.poolPaused || pendingEdits || prepared)} disabled={disabled || key.status === 'disabled'}
          onChange={event => change({ enabled: event.target.checked })}>{translateLabel("启用")}</Checkbox> : '未选用'}
          {directory && stopped[key.id] && <small>{stopped[key.id].reason} · {new Date(stopped[key.id].stoppedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</small>}</Cell>
        {directory && <Cell>{receipts.length ? <><div>{passed} / {status.checks.length} 通过</div>{failed && <small>{failed.message || '未通过'}</small>}
          {tokens.length > 0 && <small>检测用量 {tokens.reduce((sum, value) => sum + value, 0)} Token</small>}</> :
          prepared && index >= 0 ? '待检测' : '—'}
          {endpoint.directoryKeyBalances?.[key.id]?.lastSuccess && <small>模拟余额 {endpoint.directoryKeyBalances[key.id].lastSuccess.amount} {endpoint.directoryKeyBalances[key.id].lastSuccess.unit}</small>}
        </Cell>}
        <Cell>{row && <Space wrap spacing={4}>
          {directory && prepared && basicModels && index >= 0 && <Checkbox aria-label={'加入逐钥测试 ' + (key.maskedKey || key.id)}
            checked={selection.includes(key.id)} disabled={!ops.can || pendingEdits || testing || saving || probeQueue.length > 0}
            onChange={event => setSelection(current => event.target.checked ? [...current, key.id] : current.filter(id => id !== key.id))}/>}
          {directory && prepared && index >= 0 && <Button theme="borderless" size="small" disabled={!ops.can || pendingEdits || saving || testing}
            onClick={() => setProbeKey(key.id)}>选择测试</Button>}
          {directory && <Button theme="borderless" size="small" disabled={disabled || Boolean(keyChange)}
            onClick={() => beginKeyChange('rotate', key.id)}>替换</Button>}
          {directory && active.has(key.id) && <Button theme="borderless" size="small"
            disabled={state.currentRole !== '平台管理员' || disabled || pendingEdits}
            title={state.currentRole === '平台管理员' ? undefined : '仅平台管理员可验证后查看'}
            onClick={() => setVerifying(key)}>验证后查看凭证</Button>}
          {directory && active.has(key.id) && endpoint.customAdapter?.balance && <Button theme="borderless" size="small" disabled={disabledForWrite || pendingEdits}
            onClick={() => setBalanceKey(key)}>查询此密钥余额</Button>}
          <Button type="tertiary" theme="borderless" size="small" disabled={disabledForWrite}
            onClick={() => set(rows.filter(item => item.keyId !== key.id))}>移出密钥池</Button>
        </Space>}</Cell>
      </Row>;
    })}</GridTable>
    {prepared && <>
      {directory && pendingEdits && <Notice>保存当前修改后，再测试候选密钥。</Notice>}
      {(!directory || !unlinked) && <CandidateProbePanel key={candidate.id + ':' + probeKey + ':' + probeRun} state={state} context={{ ...context, keyId: probeKey || undefined }}
        ops={directory ? { ...ops, can: ops.can && !pendingEdits && !saving } : ops} beforeTest={directory ? undefined : save}
        pendingEdits={pendingEdits} onBusyChange={setTesting} startToken={probeQueue.length ? probeRun : undefined}
        onComplete={probeQueue.length ? advanceProbe : undefined}/>}
      <GridTable headings={['模型', '密钥验证结果']} empty={!status.checks.length}>{status.checks.map(check =>
        <Row key={check.associationId}><Cell>{check.modelId}</Cell><Cell>{check.passed ? '全部启用密钥通过' : check.reason}</Cell></Row>)}</GridTable>
      {(status.credentialError || status.reason) && <Notice error>{status.credentialError || status.reason}</Notice>}
      <Button theme="light" disabled={disabledForWrite} onClick={() => ops.proceed(async () => {
        if (await ops.run('channelCandidateDiscard', context)) close();
      })}>{translateLabel("放弃候选配置")}</Button>
    </>}
    {ops.error && <Notice error>{ops.error}</Notice>}</div>
  </Modal>
  {balanceKey && <ChannelDirectoryBalance state={state} connections={[{ id: endpoint.id, provider, endpoint, name: endpoint.name }]}
    ops={ops} close={() => setBalanceKey(null)} credential={balanceKey}/>}
  {pauseAsk && <Modal title="停用全部密钥" description={endpoint.name} onClose={() => !saving && setPauseAsk(false)}
    footer={<><Button disabled={saving} onClick={() => setPauseAsk(false)}>{translateLabel("取消")}</Button><Button theme="solid" type="danger" disabled={!ops.can || saving} onClick={pause}>确认停用</Button></>}>
    <Notice>此连接的 {impact.mappings.length} 个模型将不可用，涉及 {impact.services.length} 项服务。服务商的共享密钥及其他连接不受影响。</Notice>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>}
  {verifying && state.currentRole === '平台管理员' && <CredentialVerification endpoint={endpoint} credential={verifying}
    reload={ops.reload} close={() => setVerifying(null)}/>}
  {audit && directory && state.currentRole === '平台管理员' && <Modal wide title="凭证查看审计" description={endpoint.name}
    onClose={() => setAudit(false)} footer={<Button onClick={() => setAudit(false)}>{translateLabel("关闭")}</Button>}>
    <GridTable headings={['凭证 ID', '结果', '操作人', '时间（北京时间）']}
      empty={!state.audits.some(row => row.endpointId === endpoint.id && row.action === '凭证查看身份验证')} emptyMessage="暂无查看记录">
      {state.audits.filter(row => row.endpointId === endpoint.id && row.action === '凭证查看身份验证').slice(0, 30).map(row => <Row key={row.id}>
        <Cell>{row.objectId}</Cell><Cell>{row.result}</Cell><Cell>{row.actorId || row.actor}</Cell>
        <Cell>{new Date(row.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</Cell>
      </Row>)}
    </GridTable>
  </Modal>}</>;
}
