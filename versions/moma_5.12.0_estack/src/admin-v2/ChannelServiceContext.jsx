import { Button } from '../components/ui/button';
import { Notice } from './ModelOperationsUI';
import { channelServiceContext, channelServiceReturn } from './channel-service-context';

export default function ChannelServiceContext({ state, ops }) {
  const context = channelServiceContext(state, ops.params);
  if (!context) return null;
  if (context.error) return <Notice error>{context.error}</Notice>;
  return <Notice>来自 {context.provider.name} · {context.endpoint.name} 的 {context.rows.length} 条模型关联已保留。{context.missing > 0 && <span>其中 {context.missing} 条引用已变化。</span>}<Button variant="link" onClick={() => ops.proceed(() => { location.hash = channelServiceReturn(context); })}>返回接入测试</Button><details><summary>所选模型与服务</summary>{context.rows.map(row => <div key={row.id} className="supplier-row-actions"><span>{row.master?.name || '模型引用已变化'} · {row.association?.upstreamModelId || row.id}</span>{row.service ? <Button variant="link" onClick={() => ops.go({ model: row.service.id, sourceLibrary:null, view: null, q: null, type: null, mode: null, status: null, panel: row.service.serviceMode === 'provider' ? null : 'associate' })}>配置服务</Button> : row.master && <Button variant="link" disabled={!ops.can} onClick={()=>ops.go({view:'add',model:null,sourceLibrary:row.master.id,panel:null,q:null,type:null,mode:null,status:null},{base:'listing'})}>新增模型服务</Button>}</div>)}</details></Notice>;
}
