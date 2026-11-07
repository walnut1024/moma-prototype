import { useEffect, useRef, useState } from 'react';
import { Button } from '@douyinfe/semi-ui';
import { Field, Choice } from './ModelMetadataForm';
import { Modal, Notice, GridTable, Row, Cell, Status } from './ModelOperationsUI';
import { connectionKeys } from './connection-state';
import { supplierChannelResources, supplierChannelAssociations } from './supplier-resources';
import { healthFingerprint, keyHealth } from './channel-health';
import { MODEL_CONNECTIVITY_SCENARIOS } from './provider-management';

const time = value => value ? new Date(value).toLocaleString('zh-CN') : '—';
export default function ChannelHealthDialog({ state, provider, endpoint: initialEndpoint, apiKey, associationId, ops, close }) {
  const endpoints = supplierChannelResources(state, provider).filter(row => !apiKey || connectionKeys(row, provider, true).some(key => key.id === apiKey.id));
  const [endpointId, setEndpointId] = useState(initialEndpoint?.id || endpoints[0]?.id || '');
  const endpoint = endpoints.find(row => row.id === endpointId), associations = endpoint ? supplierChannelAssociations(state, provider, endpoint.id) : [];
  const [modelId, setModelId] = useState(associationId || '');
  const association = associations.find(row => row.id === modelId) || associations[0];
  const keys = endpoint ? connectionKeys(endpoint, provider, true).filter(key => !apiKey || key.id === apiKey.id) : [];
  const [scenario, setScenario] = useState('success'), [confirming, setConfirming] = useState(null), [running, setRunning] = useState(null), [message, setMessage] = useState('');
  const timer = useRef(null), latest = useRef(ops); latest.current = ops;
  useEffect(() => () => clearTimeout(timer.current), []);
  const cancel = () => { clearTimeout(timer.current); setRunning(null); setConfirming(null); setMessage('检测已取消，既有结果保留。'); };
  const exit = () => { clearTimeout(timer.current); close(); };
  const rows = association ? (endpoint.authMode === 'none' ? [null] : keys).map(key => ({ key, ...keyHealth(provider, association, key) })) : [];
  const start = () => {
    const request = confirming; setConfirming(null); setRunning(request.keyId || 'none'); setMessage('');
    timer.current = setTimeout(async () => {
      const next = await latest.current.run('channelHealthTest', request);
      if (next) setMessage('检测完成，结果已保存。');
      setRunning(null);
    }, 800);
  };
  return <Modal drawer wide title="渠道健康与密钥检测" description={provider.name} onClose={exit} footer={<Button theme="light" onClick={exit}>关闭</Button>}>
    <div className="supplier-resource-form">
      <div className="supplier-channel-fields"><Field label="渠道"><Choice label="检测渠道" disabled={Boolean(initialEndpoint) || Boolean(running)} value={endpointId || 'none'} options={endpoints.length ? endpoints.map(row => [row.id,row.name]) : [['none','暂无绑定渠道']]} onChange={id => { setEndpointId(id); setModelId(''); setConfirming(null); setMessage(''); }}/></Field><Field label="渠道模型"><Choice label="检测渠道模型" disabled={!association || Boolean(running)} value={association?.id || 'none'} options={associations.length ? associations.map(row => [row.id,row.upstreamModelId]) : [['none','请先关联模型']]} onChange={id => { setModelId(id); setConfirming(null); setMessage(''); }}/></Field></div>
      {endpoint && <dl className="supplier-test-facts"><div><dt>请求地址</dt><dd>{endpoint.baseUrl}</dd></div><div><dt>协议</dt><dd>{endpoint.protocol}</dd></div><div><dt>结果有效期</dt><dd>24 小时，配置变化须复测</dd></div></dl>}
      <GridTable headings={['API 密钥','检测状态','最近检测','响应耗时','操作']} empty={!rows.length} emptyMessage={!endpoints.length ? '此密钥尚未绑定渠道，请先配置渠道。' : '请先配置渠道模型和 API 密钥。'}>{rows.map(({key,label,record,good}) => <Row key={key?.id || 'none'}><Cell>{key?.name || key?.id || '无需认证'}{key && <small>{key.maskedKey}</small>}</Cell><Cell><Status good={good}>{running === (key?.id || 'none') ? '检测中' : label}</Status>{record?.simulated && <small>模拟检测</small>}</Cell><Cell>{time(record?.testedAt)}</Cell><Cell>{record?.durationMs == null ? '—' : `${record.durationMs} ms`}</Cell><Cell><Button type="tertiary" theme="borderless" disabled={!ops.can || Boolean(running) || Boolean(key?.revokedAt) || key?.status === 'disabled'} onClick={() => { ops.setError(''); setConfirming({ providerId: provider.id, endpointId: endpoint.id, associationId: association.id, keyId: key?.id || '', expectedFingerprint: healthFingerprint(provider,association,key), scenario, confirmed: true }); }}>检测</Button></Cell></Row>)}</GridTable>
      {rows.filter(row => row.record).map(({key,record}) => <details key={key?.id || 'none'}><summary>{key?.name || key?.id || '渠道'} · {record.result === '通过' ? '检测详情' : '失败详情'}</summary><p>结果来源：{record.source === 'mock' || record.simulated ? '模拟检测' : '未记录'}</p><p>{record.message}</p><p>HTTP {record.status ?? '无响应'}{record.hint && ` · ${record.hint}`}</p></details>)}
      {new URLSearchParams(location.hash.split('?')[1] || '').get('devtools') === '1' && <Choice label="检测模拟结果" value={scenario} options={Object.entries(MODEL_CONNECTIVITY_SCENARIOS)} onChange={setScenario} disabled={Boolean(running)}/>}
      {confirming && <Notice>本原型执行模拟检测，不发送真实上游请求。正式检测可能产生调用用量。<div className="supplier-key-actions"><Button theme="light" onClick={() => setConfirming(null)}>取消</Button><Button disabled={!ops.can} onClick={start}>确认检测</Button></div></Notice>}
      {running && <div role="status">正在检测…<Button type="tertiary" theme="borderless" onClick={cancel}>取消检测</Button></div>}
      {message && <p role="status">{message}</p>}{ops.error && <Notice error>{ops.error}</Notice>}
    </div>
  </Modal>;
}
