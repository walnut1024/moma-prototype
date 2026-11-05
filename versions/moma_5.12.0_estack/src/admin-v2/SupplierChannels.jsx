import ChannelHealthDialog from './ChannelHealthDialog';
import { channelModelHealth } from './channel-health';
import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { GridTable, Row, Cell, Modal, SearchBox, Pagination, Status } from './ModelOperationsUI';
import { supplierChannelResources, supplierChannelAssociations, supplierChannelCode, supplierChannelName } from './supplier-resources';
import { connectionKeys } from './connection-state';
import { channelStatus } from './channel-selection';
import { SupplierChannelDialog } from './SupplierResourceDialogs';
import SupplierChannelConfiguration from './SupplierChannelConfiguration';
import ChannelKeyPoolEditor from './ChannelKeyPoolEditor';
import ProviderCatalogue from './ProviderCatalogue';

export default function SupplierChannels({ state, provider, ops, onAdd }) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(1), [dialog, setDialog] = useState(null);
  const trigger = useRef(null);
  const resources = supplierChannelResources(state, provider), rows = resources.filter(row => `${row.name} ${row.id} ${row.baseUrl}`.toLowerCase().includes(query.trim().toLowerCase()));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 10)));
  const endpoint = resources.find(row => row.id === dialog?.id);
  const open = (event, row, kind) => { trigger.current = event.currentTarget; ops.setError(''); setDialog({ id: row.id, kind }); };
  const close = () => { setDialog(null); ops.setError(''); requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus()); };
  return <>
    <div className="supplier-toolbar supplier-resource-toolbar"><SearchBox value={query} placeholder="搜索渠道名称 / ID / 地址" onChange={value => { setQuery(value); setPage(1); }}/><Button size="sm" disabled={!ops.can} onClick={onAdd}><Plus/>添加渠道</Button></div>
    <GridTable className="supplier-channel-directory" headings={['渠道名称 / ID', '接口 / 地址', '关联模型', '健康状态', 'API 密钥', '操作']} empty={!rows.length} emptyMessage="暂无匹配渠道。">{rows.slice((currentPage - 1) * 10, currentPage * 10).map(row => {
      const models = supplierChannelAssociations(state, provider, row.id), available = models.filter(model => channelStatus(provider, model) === '可用').length;
      const health = models.map(model => channelModelHealth(provider, model)), healthy = health.filter(item => item.good).length;
      const keys = connectionKeys(row, provider, true), activeKeys = connectionKeys(row, provider);
      return <Row key={row.id}><Cell><strong>{supplierChannelName(provider, row)}</strong><code>{supplierChannelCode(row)}</code></Cell><Cell><span>{row.protocol}</span><small title={row.baseUrl}>{row.baseUrl}</small></Cell><Cell>{models.length} 个<small>{available} 已可用</small></Cell><Cell><Button variant="link" onClick={event => open(event, row, 'health')}><Status good={models.length > 0 && healthy === models.length}>{models.length ? healthy === models.length ? '正常' : healthy ? health.some(item => ['异常', '部分异常'].includes(item.label)) ? '部分异常' : '待补充检测' : health.find(item => item.label === '异常')?.label || health[0].label : '未关联模型'}</Status></Button><small>{health.some(item => item.rows.some(row => row.record?.simulated)) ? '模拟检测 · ' : ''}{healthy}/{models.length} 正常</small></Cell><Cell>{row.authMode === 'none' ? '无需认证' : row.authMode === 'pool' ? `${activeKeys.length} / ${keys.length} 条可用` : `${activeKeys.length} 条当前使用`}<small>{row.authMode === 'pool' ? '渠道密钥池' : row.authMode === 'group' || row.authMode === 'inherit' ? '当前共享配置' : '当前绑定'}</small></Cell><Cell><div className="supplier-row-actions"><Button variant="link" onClick={event => open(event, row, 'health')}>健康 / 检测</Button><Button variant="link" onClick={event => open(event, row, 'models')}>模型</Button><Button variant="link" onClick={event => open(event, row, 'pool')}>密钥池</Button><Button variant="link" onClick={event => open(event, row, 'configuration')}>配置</Button></div></Cell></Row>;
    })}</GridTable><Pagination count={rows.length} page={currentPage} setPage={setPage}/>
    {endpoint && dialog.kind === 'health' && <ChannelHealthDialog state={state} provider={provider} endpoint={endpoint} ops={ops} close={close}/>}
    {endpoint && dialog.kind === 'models' && <Modal drawer wide title="渠道模型" description={`${provider.name} · ${endpoint.name}`} onClose={() => ops.proceed(close)} footer={<Button variant="outline" onClick={() => ops.proceed(close)}>关闭</Button>}><div className="supplier-key-actions"><Button size="sm" disabled={!ops.can} onClick={() => ops.proceed(() => setDialog({ ...dialog, kind: 'add-models' }))}><Plus/>接入渠道模型</Button></div><ProviderCatalogue state={state} provider={provider} endpointId={endpoint.id} ops={ops}/></Modal>}
    {endpoint && dialog.kind === 'add-models' && <SupplierChannelConfiguration state={state} provider={provider} endpoint={endpoint} ops={ops} close={close}/>}
    {endpoint && dialog.kind === 'pool' && <ChannelKeyPoolEditor state={state} provider={provider} endpoint={endpoint} ops={ops} close={close}/>}
    {endpoint && dialog.kind === 'configuration' && <SupplierChannelDialog state={state} provider={provider} endpoint={endpoint} ops={ops} close={close}/>}
  </>;
}
