import TemporaryChannelProbe from './TemporaryChannelProbe';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Modal, Notice } from './ModelOperationsUI';
import { supplierChannelName, supplierChannelReadiness } from './supplier-resources';
import { connectionKeys, connectionCredentialsReady, connectionTestCurrent, connectionTestPassed } from './connection-state';
import { channelCheckCurrent, channelInterfaceIssue, channelFingerprint } from './provider-channels';
import { providerApiKeyRows, providerApiKeyId } from './provider-management';
import { SupplierKeyGroupField } from './SupplierKeyGroupField';
import { SupplierChannelDialog } from './SupplierResourceDialogs';

export default function SupplierChannelTest({ state, provider, association, ops, close }) {
  const endpoint = association.endpoint;
  const [groupId, setGroupId] = useState(endpoint.authMode === 'group' ? endpoint.keyGroupId : 'current');
  const [preview, setPreview] = useState(null), [editing, setEditing] = useState(null), [batchOpen, setBatchOpen] = useState(false), [temporaryOpen, setTemporaryOpen] = useState(false);
  const owner = { ...provider, apiKeys: providerApiKeyRows(state, provider).map(row => row.apiKey) };
  const temporary = groupId !== 'current' && (endpoint.authMode !== 'group' || groupId !== endpoint.keyGroupId);
  const selectedEndpoint = temporary ? { ...endpoint, authMode: 'group', keyGroupId: groupId, apiKeys: [], credentialRef: '' } : endpoint;
  const keys = connectionKeys(selectedEndpoint, owner), credentialsReady = connectionCredentialsReady(selectedEndpoint, owner);
  const issue = channelInterfaceIssue(provider, association);
  const fingerprint = JSON.stringify([channelFingerprint({ ...association, endpoint: selectedEndpoint }), keys.map(key => key.fingerprint)]);
  const savedResult = connectionTestCurrent(endpoint) && endpoint.connectionTest.result === '失败' ? endpoint.connectionTest : channelCheckCurrent(association) && connectionTestPassed(endpoint) ? association.health || endpoint.connectionTest : null;
  const result = temporary ? preview?.fingerprint === fingerprint ? preview : null : savedResult;
  const passed = !issue && credentialsReady && result?.result === '通过';
  const ready = passed && !temporary && supplierChannelReadiness(endpoint, owner).ready && association.enabled;
  const message = issue || (!credentialsReady ? '缺少可用 API 密钥，请补充密钥或选择其他密钥组。' : result?.result === '失败' ? result.message || '测试失败，请检查地址与密钥。' : passed ? temporary ? '测试通过，仅用于本次检查；渠道配置保持不变。' : ready ? '测试通过，当前模型渠道已启用。' : '测试通过，启用后可用于服务关联。' : '待测试：将检查当前地址、密钥和上游模型。');
  const test = () => {
    ops.setError('');
    if (temporary) setTemporaryOpen(true); else setBatchOpen(true);
  };
  if (batchOpen) return <SupplierChannelBatchTest state={state} provider={provider} endpointId={endpoint.id} associationIds={[association.id]} ops={ops} close={() => setBatchOpen(false)}/>;
  if (editing) return <SupplierChannelDialog state={state} provider={provider} endpoint={endpoint} ops={ops} mode={editing} close={() => { setEditing(null); ops.setError(''); }} done={() => { setEditing(null); setGroupId('current'); setPreview(null); }}/>;
  return <Modal title="测试连接" description={`${provider.name} · ${supplierChannelName(provider, endpoint)}`} onClose={close}><div className="supplier-connection-check">
    <dl className="supplier-test-facts"><div><dt>上游模型 ID</dt><dd>{association.upstreamModelId}</dd></div><div><dt>API 地址</dt><dd>{endpoint.baseUrl}<Button variant="link" disabled={!ops.can} onClick={() => setEditing('address')}>修改地址</Button></dd></div></dl>
    <SupplierKeyGroupField state={state} provider={provider} ops={ops} value={groupId} disabled={!ops.can} current={endpoint.authMode !== 'group' || groupId === 'current' ? { name: endpoint.authMode === 'none' ? '无需认证' : '渠道当前密钥配置', ready: connectionCredentialsReady(endpoint, owner) } : null} onChange={id => { setGroupId(id); setPreview(null); ops.setError(''); }}/>
    {temporary && <p className="supplier-price-hint">切换密钥组仅用于本次测试。<Button variant="link" disabled={!ops.can} onClick={() => setEditing('credentials')}>修改渠道密钥配置</Button></p>}
    <Notice error={Boolean(issue || !credentialsReady || result?.result === '失败' || ops.error)}>{ops.error || message}</Notice>
    {result && !issue && credentialsReady && <details className="supplier-test-details"><summary>检查详情</summary><dl><dt>密钥 ID</dt><dd>{keys.map(providerApiKeyId).join('、') || '无需认证'}</dd><dt>检查时间</dt><dd>{result.testedAt ? new Date(result.testedAt).toLocaleString('zh-CN') : '本次检查'}</dd></dl></details>}
    {temporary && temporaryOpen && <TemporaryChannelProbe key={fingerprint} state={state} provider={owner} association={association} selectedEndpoint={selectedEndpoint} fingerprint={fingerprint} ops={ops}/>}
    {passed && !temporary && provider.status !== '已启用' && <p className="supplier-price-hint">供应商已停用，需先启用供应商。</p>}
    <div className="supplier-key-actions"><Button variant="outline" onClick={close}>关闭</Button><Button variant={passed && !temporary && !ready ? 'outline' : 'default'} disabled={!ops.can || !credentialsReady || Boolean(issue)} onClick={test}>{result ? '重新测试' : '开始测试'}</Button>{passed && !temporary && !ready && <Button disabled={!ops.can || provider.status !== '已启用'} onClick={() => setBatchOpen(true)}>核对并启用</Button>}</div>
  </div></Modal>;
}
