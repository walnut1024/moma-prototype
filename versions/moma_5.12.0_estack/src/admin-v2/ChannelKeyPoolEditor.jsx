import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { connectionKeys } from './connection-state';
import { channelCandidateStatus, channelChangeImpact } from './channel-change-management';
import CandidateProbePanel from './CandidateProbePanel';

export default function ChannelKeyPoolEditor({ state, provider, endpoint, ops, close }) {
  const candidate = endpoint.candidateConfiguration;
  const [rows, setRows] = useState(() => structuredClone(candidate?.config.authMode === 'pool' ? candidate.config.keyPool : endpoint.authMode === 'pool' ? endpoint.keyPool : connectionKeys(endpoint, provider).slice(0, 1).map(key => ({ keyId: key.id, priority: 1, enabled: true }))));
  const [edited, setEdited] = useState(false), [testing, setTesting] = useState(false);
  const context = { providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0, candidateId: candidate?.id };
  const status = candidate && channelCandidateStatus(state, provider.id, endpoint.id);
  const impact = channelChangeImpact(state, provider.id, endpoint.id);
  const set = next => { setRows(next); setEdited(true); ops.dirty(true); ops.setError(''); };
  const save = async () => {
    if (!edited && candidate?.config.authMode === 'pool') return { state, context };
    const previous = candidate ? Object.fromEntries(Object.entries(candidate.config).filter(([key]) => ['protocol', 'baseUrl', 'interfaceType', 'taskUrls', 'adapterOptions', 'capacity', 'timeoutSeconds', 'adapterVersion'].includes(key))) : {};
    const next = await ops.run('channelCandidateSave', { ...context, config: { ...previous, authMode: 'pool', keyPool: rows } });
    if (!next) return null;
    setEdited(false);
    return { state: next, context: { ...context, candidateId: next.endpoints.find(row => row.id === endpoint.id).candidateConfiguration.id } };
  };
  return <Modal drawer wide title="渠道密钥池" description={`${provider.name} · ${endpoint.name}`} onClose={() => ops.proceed(close)} footer={<><Button variant="outline" onClick={() => ops.proceed(close)}>关闭</Button><Button disabled={!ops.can || !status?.ready || edited || testing || candidate?.config.authMode !== 'pool'} onClick={async () => { if (await ops.run('channelCandidateApply', { ...context, confirmed: true })) close(); }}>应用密钥池</Button></>}>
    <div className="supplier-resource-form"><p className="supplier-price-hint">数字越小越优先，同优先级按列表顺序。修改后须验证所有启用密钥，当前配置在应用前保持生效。</p>
    <Notice>影响 {impact.mappings.length} 个模型、{impact.services.length} 项服务。{candidate && candidate.config.authMode !== 'pool' ? '已有候选配置将保留，密钥池配置一并验证。' : ''}</Notice>
    {!impact.mappings.length && <Notice>请先在渠道的“模型”中接入模型，再验证并应用密钥池。</Notice>}
    <GridTable className="supplier-pool-table" headings={['选用', 'API 密钥', '优先级', '池内状态', '操作']} empty={!provider.apiKeys?.length} emptyMessage="请先在服务商密钥页添加密钥。">{(provider.apiKeys || []).map(key => {
      const row = rows.find(row => row.keyId === key.id), disabled = !ops.can || testing || Boolean(key.revokedAt);
      const change = patch => set(rows.map(item => item.keyId === key.id ? { ...item, ...patch } : item));
      return <Row key={key.id}><Cell><input type="checkbox" aria-label={`选用密钥 ${key.id}`} checked={Boolean(row)} disabled={disabled} onChange={event => set(event.target.checked ? [...rows, { keyId: key.id, priority: rows.length + 1, enabled: key.status !== 'disabled' }] : rows.filter(item => item.keyId !== key.id))}/></Cell><Cell><strong>{key.name || key.id}</strong><code>{key.maskedKey}</code><small>{key.revokedAt ? '已撤销' : key.status === 'disabled' ? 'API 密钥已停用' : key.id}</small></Cell><Cell>{row ? <Input type="number" min={1} max={100} aria-label={`密钥 ${key.id} 优先级`} value={row.priority} disabled={disabled} onChange={event => change({ priority: Number(event.target.value) })}/> : '—'}</Cell><Cell>{row ? <label><input type="checkbox" aria-label={`密钥 ${key.id} 池内启用`} checked={row.enabled} disabled={disabled || key.status === 'disabled'} onChange={event => change({ enabled: event.target.checked })}/>启用</label> : '未选用'}</Cell><Cell>{row && <Button variant="link" disabled={!ops.can || testing} onClick={() => set(rows.filter(item => item.keyId !== key.id))}>移出密钥池</Button>}</Cell></Row>;
    })}</GridTable>
    <div className="supplier-key-actions"><Button variant="outline" disabled={!ops.can || testing} onClick={save}>保存密钥池候选</Button></div>
    {candidate?.config.authMode === 'pool' && <><CandidateProbePanel key={candidate.id} state={state} context={context} ops={ops} beforeTest={save} pendingEdits={edited} onBusyChange={setTesting}/><GridTable headings={['模型', '密钥验证结果']} empty={!status.checks.length}>{status.checks.map(check => <Row key={check.associationId}><Cell>{check.modelId}</Cell><Cell>{check.passed ? '全部启用密钥通过' : check.reason}</Cell></Row>)}</GridTable>{status.credentialError && <Notice error>{status.credentialError}</Notice>}<Button variant="outline" disabled={!ops.can || testing} onClick={() => ops.proceed(async () => { if (await ops.run('channelCandidateDiscard', context)) close(); })}>放弃候选配置</Button></>}
    {ops.error && <Notice error>{ops.error}</Notice>}</div>
  </Modal>;
}
