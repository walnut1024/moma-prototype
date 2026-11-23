import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox } from '@douyinfe/semi-ui';
import { Disclosure, GridTable, Row, Cell, Notice, SearchBox } from './ModelOperationsUI';
import { libraryRecord } from './model-library';
import { channelDiscoveryPreview, channelDiscoveryRevision } from './channel-discovery-diff';
import { connectionFingerprint } from './connection-state';
import { prepareServerChannel, onboardingApi } from './onboarding-client';
import OnboardingScenarioControl from './OnboardingScenarioControl';

const attributeText = value => value == null ? '未配置' : typeof value === 'boolean' ? value ? '支持' : '不支持' : String(value);

export default function ChannelDiscovery({ state, provider, configuration, ops, onAppend, mode = 'add' }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [preview, setPreview] = useState(null), [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const controller = useRef(null);
  const signature = connectionFingerprint(configuration);
  const endpointId = state.endpoints.some(row => row.id === configuration.id) ? configuration.id : '';
  const currentContext = useRef(null); currentContext.current = { signature, mappingRevision: channelDiscoveryRevision(provider, endpointId), can: ops.can };
  useEffect(() => () => controller.current?.abort(), []);
  const discover = async () => {
    setError(''); setBusy(true); controller.current = new AbortController();
    try {
      const channel = await prepareServerChannel(provider, configuration);
      const result = await onboardingApi('/discover', { method: 'POST', body: { channelId: channel.id }, signal: controller.current.signal });
      const list = channelDiscoveryPreview(state, provider, endpointId, result);
      if (mode === 'attach') {
        const archived = new Set(state.modelData?.archivedCatalogueIds || []);
        list.rows = list.rows.map(row => !row.existingAssociationId && archived.has(libraryRecord(state, row.libraryId)?.id)
          ? { ...row, libraryId: '', status: '资料已归档，需重新关联' } : row);
      }
      setPreview({ ...list, signature, serverChannelId: channel.id, serverSignature: result.signature, discoveredAt: result.discoveredAt }); setSelected([]);
    } catch (issue) { setError(issue.name === 'AbortError' ? '已取消获取模型列表' : issue.message); }
    finally { setBusy(false); }
  };
  const matching = preview?.rows.filter(row => [row.upstreamModelId, libraryRecord(state, row.libraryId)?.name]
    .some(value => value?.toLowerCase().includes(query.trim().toLowerCase()))) || [];
  return <section className="supplier-discovery"><div className="supplier-row-actions"><Button theme="light" disabled={!ops.can || busy || !provider} onClick={discover}>{busy ? '获取中…' : mode === 'changes' ? '检查模型变更' : '获取上游模型'}</Button>{busy && <Button type="tertiary" theme="borderless" onClick={() => controller.current?.abort()}>取消获取</Button>}<OnboardingScenarioControl/></div>
    {error && <Notice error>{error}</Notice>}{preview && <><div className="supplier-onboarding-context"><span>{preview.rows.length ? `返回 ${preview.rows.length} 个模型` : '未返回模型，可核对权限或手动添加'}</span><span>{preview.complete ? '完整列表' : '仅获取部分列表'}</span><span>{preview.discoveredAt ? new Date(preview.discoveredAt).toLocaleString('zh-CN') : '发现时间未返回'}</span></div>{!preview.complete && <Notice>列表未完整获取，已返回模型可选择；不能据此判断已有模型被移除。{preview.partialReason && <small>原因：{preview.partialReason}</small>}</Notice>}{preview.missing.length > 0 && <Disclosure title={`疑似移除（${preview.missing.length}）`}><GridTable headings={['上游模型调用标识', '当前映射']}>{preview.missing.map(row => <Row key={row.id}><Cell><code>{row.upstreamModelId}</code></Cell><Cell>{row.modelId}</Cell></Row>)}</GridTable><p className="supplier-price-hint">这些模型未出现在本次完整列表中，请单独复测。当前映射和服务保持不变。</p></Disclosure>}{mode === 'attach' && <div className="channel-directory-toolbar">
      <SearchBox value={query} onChange={setQuery} placeholder="搜索模型或上游模型调用标识"/>
      <span>已选 {selected.length} 款</span>
    </div>}<GridTable headings={['选择', '上游模型调用标识', '模型资料匹配', '登记状态']}
      empty={!matching.length} emptyMessage="没有匹配的候选模型">{matching.map(row => <Row key={row.id}><Cell><Checkbox aria-label={`选择发现模型 ${row.upstreamModelId}`} disabled={Boolean(row.existingAssociationId) || !ops.can} checked={selected.includes(row.id)} onChange={event => setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))}/></Cell><Cell><code title={row.upstreamModelId}>{row.upstreamModelId}</code></Cell><Cell>{libraryRecord(state, row.libraryId)?.name || '待关联资料'}</Cell><Cell>{row.existingAssociationId ? row.status : `新增 · ${row.status}`}{row.existingAssociationId && !row.attributes.length && <small>上游未提供可比较属性</small>}</Cell></Row>)}</GridTable>{preview.rows.some(row => row.existingAssociationId && row.attributes.length) && <Disclosure title="属性对比（只读）"><GridTable headings={['上游模型调用标识', '属性', '当前资料', '上游返回值', '对比结果']}>{preview.rows.filter(row => row.existingAssociationId).flatMap(row => row.attributes.map(attribute => <Row key={`${row.id}:${attribute.field}`}><Cell><code>{row.upstreamModelId}</code></Cell><Cell>{attribute.label}</Cell><Cell>{attributeText(attribute.current)}</Cell><Cell>{attributeText(attribute.observed)}</Cell><Cell>{attribute.current == null ? '当前未配置' : attribute.different ? '存在差异' : '一致'}</Cell></Row>))}</GridTable><p className="supplier-price-hint">上游属性仅作核对，现有模型资料、能力及采购价格保持不变。</p></Disclosure>}<Button disabled={!ops.can || !selected.length} onClick={async () => { try { if (signature !== preview.signature) throw new Error('连接配置已变化，请重新获取模型列表'); if (channelDiscoveryRevision(provider, endpointId) !== preview.mappingRevision) throw new Error('连接映射已变化，请重新检查模型变更'); const current = await onboardingApi('/channels'); const channel = current.channels.find(row => row.id === preview.serverChannelId); if (!channel || channel.signature && channel.signature !== preview.serverSignature) throw new Error('上游连接已变化，请重新获取'); if (!currentContext.current.can || currentContext.current.signature !== preview.signature || currentContext.current.mappingRevision !== preview.mappingRevision) throw new Error('权限或连接配置已变化，请重新检查模型变更'); onAppend(preview.rows.filter(row => !row.existingAssociationId && selected.includes(row.id)).map(row => ({ ...row, selected: true, confirmed: false }))); setPreview(null); } catch (issue) { setError(issue.message); } }}>{mode === 'attach' ? '带入 ' + selected.length + ' 款模型' : mode === 'changes' ? '添加所选新模型' : '添加所选模型到配置'}</Button></>}
  </section>;
}
