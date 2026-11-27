import { useChannelText } from './channel-language';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CopyId, Modal } from './ServiceUI';
import SalesAudience, { salesAudienceLabel } from './SalesAudience';
import ServiceListingDialog from './ServiceListingDialog';
import { offerKey, offerStage, providerOffer, salesPaused } from '../service-access.mjs';
import { serviceStatus } from './model-services-new';
import AdminStatus from './AdminStatus';
import Table, { AdminPagination } from './AdminTable';
import ModelModuleHeading from './ModelModuleHeading';
import Descriptions from './AdminDescriptions';
import { Button, Card, Space, Spin, Tabs, Toast, Typography } from '@douyinfe/semi-ui';
import { Notice, serviceOperationsUi } from './ServiceUI';
import { useOperations } from './ModelOperationsUI';
import { CommercialDialog } from './ServiceWorkspaceDialogs';
import PricingFilters from './PricingFilters';
import { priceRecords, filterPricingRecords, pricingTableRows, operationsReturn } from './model-pricing-workspace';
import { offerSalesScope } from './service-sales';
import { displayTime, moneyDisplay, priceItems } from './model-management';
import { ModelServiceSaleDetail, ModelServiceSaleStatusDialog, modelServiceSaleAudience } from './ModelServiceSaleDialogs';
import { activeModelServiceSalePrice, modelServiceSaleActive, modelServiceSaleStage } from './model-service-sale.mjs';
import { cloudAdminRequest } from './admin-client.mjs';
import { resourceId } from '../resource-id.mjs';
import './model-pricing-workspace.css';

const salePath = '/model-service-sales';
const salesPageSize = 20;

export default function ModelPrices(props) {
  const translateLabel = useChannelText();
  const { state, readOnly } = props;
  const pageOps = useOperations({ ...props, ...serviceOperationsUi }, 'model-prices');
  const ops = { ...pageOps, can: pageOps.can && !readOnly };
  const { params, go } = ops;
  const [salesDialog, setSalesDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saleWorkspace, setSaleWorkspace] = useState({ rows: [], loading: true, error: '' });
  const activeRead = useRef(null), activeWrite = useRef(false), pendingWrite = useRef(null);
  const refreshSales = useCallback(async () => {
    activeRead.current?.abort();
    const request = new AbortController();
    activeRead.current = request;
    setSaleWorkspace(current => ({ ...current, loading: true, error: '' }));
    try {
      const result = await cloudAdminRequest(salePath, { signal: request.signal });
      if (!request.signal.aborted) setSaleWorkspace({ ...result, loading: false, error: '' });
    } catch (error) {
      if (!request.signal.aborted) setSaleWorkspace(current => ({ ...current, loading: false, error: error.message }));
    }
  }, []);
  useEffect(() => {
    refreshSales();
    return () => activeRead.current?.abort();
  }, [refreshSales, state.revision]);

  const changeSale = async command => {
    if (!ops.can || activeWrite.current) return null;
    activeWrite.current = true;
    setBusy(true);
    const signature = JSON.stringify(command);
    const operationId = pendingWrite.current?.signature === signature ? pendingWrite.current.operationId : resourceId('operation');
    pendingWrite.current = { signature, operationId };
    try {
      const result = await cloudAdminRequest(salePath, { method: 'POST', body: { ...command, operationId }, operationId });
      pendingWrite.current = null;
      ops.setError('');
      Toast.success(translateLabel(({ price: '模型刊例价已发布', start: '已开售', pause: '已停售', scope: '销售对象已保存' })[command.action]));
      await refreshSales();
      return result;
    } catch (error) {
      if (error.status >= 400 && error.status < 500) pendingWrite.current = null;
      if (error.status === 409 || error.status === 404) await refreshSales();
      ops.setError(error.message);
      return null;
    } finally {
      setBusy(false);
      activeWrite.current = false;
    }
  };
  const legacySales = new Map(priceRecords(state).map(row => [row.model_service_id, row]));
  const services = saleWorkspace.rows.map(row => {
    const identity = {
      id: row.id, modelKey: row.id, modelName: row.service.name, name: row.service.name,
      callId: row.service.callId, model_service_id: row.id, service: row.service,
    };
    if (row.legacyOfferId) {
      const legacy = legacySales.get(row.legacyOfferId);
      return legacy
        ? { ...legacy, ...identity, legacyServiceId: legacy.id }
        : { ...identity, unavailable: true, status: '待核对' };
    }
    return { ...row, ...identity, independent: true, status: modelServiceSaleStage[row.stage], price: activeModelServiceSalePrice(row) };
  });
  const selectedId = params.get('service');
  const service = services.find(row => row.id === selectedId)
    || services.find(row => row.legacyServiceId === selectedId);
  const query = (params.get('q') || '').trim().toLowerCase();
  const rows = filterPricingRecords(services, params, false).filter(row =>
    (!params.has('model') || row.modelId === params.get('model'))
    && [row.modelName, row.name, row.callId, row.canonical_slug, row.model_service_id].join(' ').toLowerCase().includes(query));
  const page = Math.min(Math.max(1, Number.parseInt(params.get('page'), 10) || 1), Math.ceil(rows.length / salesPageSize) || 1);
  const pageRows = rows.slice((page - 1) * salesPageSize, page * salesPageSize);
  const tab=['pricing','history','scope'].includes(params.get('tab'))?params.get('tab'):'pricing',back=operationsReturn(params.get('returnTo'));
  const model=service?.model,key=offerKey(service);
  const versions=model && !service.independent?state.modelSalePrices.filter(row=>row.modelId===model.id && (service.providerId?row.scope==='provider' && offerKey(row)===key:row.scope==='model')).slice().sort((a,b)=>b.version-a.version):[];
  const saleStage = row => offerStage(row.model, providerOffer(row.model, offerKey(row)));
  const onSale = row => ['gray', 'formal'].includes(saleStage(row)) && !salesPaused(row.model, offerKey(row));
  const configure = (row, tab = 'pricing') => go({
    service: row.id, tab, edit: tab === 'pricing' && ops.can && !row.price ? '1' : null,
  }, { preserveScroll: true });
  const detailHref = row => {
    const next = new URLSearchParams(params);
    next.set('service', row.id);
    next.set('tab', 'pricing');
    next.delete('edit');
    return '#/admin-2/model-prices?' + next;
  };
  const showSales = (row, stage) => ops.proceed(() => {
    ops.setError('');
    setSalesDialog({ row, stage, revision: row.independent ? row.revision : row.model.updatedAt });
  });
  const closeSales = () => ops.proceed(() => { setSalesDialog(null); ops.setError(''); });
  const saleRow = salesDialog && services.find(row => row.id === salesDialog.row.id && !row.unavailable);
  const saleActions = row => {
    const active = row.independent ? modelServiceSaleActive(row) : onSale(row);
    return <Space spacing={4} wrap>
      {(!active || row.independent && row.stage === 'gray') && <Button size="small" theme="borderless" disabled={!ops.can || busy}
        onClick={() => showSales(row, 'formal')}>{translateLabel('开售')}</Button>}
      {active && <Button size="small" theme="borderless" disabled={!ops.can || busy}
        onClick={() => showSales(row, 'pause')}>{translateLabel('停售')}</Button>}
      {(!row.independent || row.stage !== 'gray') && <Button size="small" theme="borderless" disabled={!ops.can || busy}
        onClick={() => showSales(row, 'gray')}>{translateLabel('灰度开售')}</Button>}
    </Space>;
  };
  const merged=render=>(_,row)=>({children:render(row),props:{rowSpan:row.recordSpan}});
  return <div className="admin-page-stack semi-services">
    <ModelModuleHeading module="prices" title={service?.name || translateLabel('模型售卖')}><div className="sp-actions">{params.has('service') && !back && <Button
        onClick={() => go({ service: null, tab: null, edit: null }, { preserveScroll: true })}>{translateLabel('返回模型售卖')}</Button>
      }{back && <Button onClick={()=>ops.proceed(()=>{location.hash=back;})}>{translateLabel("返回来源页面")}</Button>}<Button onClick={()=>go({returnTo:location.hash,tab:'scenario'},{base:'tariff-dictionary',reset:true})}>{translateLabel("计量配置")}</Button></div></ModelModuleHeading>
    {saleWorkspace.error && <Notice error>{saleWorkspace.error}<Button theme="borderless" onClick={refreshSales}>载入最新售卖</Button></Notice>}
    {params.has('service') ? service ? service.unavailable ? <Notice error>暂无法读取该模型服务的原售卖配置。</Notice> : service.independent ? <Card>
      <ModelServiceSaleDetail state={state} row={service} ops={ops} actions={saleActions(service)} change={changeSale} busy={busy} tab={tab}/>
    </Card> : <Card>
      <div className="ss-body">
      <div className="ss-section-bar"><Typography.Title heading={5}>{translateLabel("模型售卖")}</Typography.Title>{saleActions(service)}</div>
      <Descriptions data={[{key:'模型服务 ID',value:<CopyId value={service.model_service_id} label="模型服务 ID"/>},{key:'模型编码',value:service.canonical_slug},{key:'模型 ID',value:service.callId || '待配置'},{key:'服务状态',value:<AdminStatus value={serviceStatus(service.service)}/>},{key:'售卖状态',value:<Space><AdminStatus value={service.status}/>{!service.price && <AdminStatus value="不可售"/>}</Space>},{key:'模型刊例价版本',value:service.price?`v${service.price.version}`:'待配置'}]}/>
      <Tabs activeKey={tab} keepDOM={false} onChange={tab=>go({tab,edit:null},{preserveScroll:true})}>
        <Tabs.TabPane itemKey="pricing" tab={translateLabel("模型刊例价配置")}><div className="ss-tab-content ss-body"><CommercialDialog key={service.id+params.get('edit')} state={state} model={model} providerId={key} ops={ops} readOnly={readOnly || params.get('edit')!=='1'} onEdit={()=>go({edit:'1'},{preserveScroll:true})} close={()=>ops.proceed(()=>go({edit:null},{saved:true,preserveScroll:true}))}/></div></Tabs.TabPane>
        <Tabs.TabPane itemKey="scope" tab={translateLabel("销售对象")}>
          <SalesAudience key={service.id + ':' + model.updatedAt} state={state} service={service} ops={ops}/>
        </Tabs.TabPane>
        <Tabs.TabPane itemKey="history" tab={translateLabel("变更记录")}><div className="ss-tab-content ss-body"><Typography.Title heading={5}>{translateLabel("模型刊例价版本")}</Typography.Title><Table size="small" rowKey="id" dataSource={versions} pagination={false} scroll={{x:760,y:420}} empty="尚无模型刊例价版本。" columns={[{title:'模型刊例价版本 ID',dataIndex:'id',width:280,render:value=><CopyId value={value} label="模型刊例价版本 ID"/>},{title:'版本',dataIndex:'version',width:80},{title:'生效时间',dataIndex:'effectiveAt',width:180,render:displayTime},{title:'计费项与模型刊例价',render:(_,version)=>priceItems(version,model).map((item,index)=><Typography.Paragraph key={index}>{item.name}：{moneyDisplay(item.amount)} {item.currency} / {item.unit}</Typography.Paragraph>)}]}/></div></Tabs.TabPane>
      </Tabs>
      </div>
    </Card> : saleWorkspace.loading ? <Spin /> : <Notice error>指定售卖不存在或已归档，请返回模型售卖列表。</Notice> : <Card>
      <PricingFilters records={services} ops={ops} kind="price"/>
      <Table size="small" rowKey="tableKey" pagination={false} scroll={{x:1600,y:'calc(100vh - 330px)'}} dataSource={pricingTableRows(pageRows,row=>priceItems(row.price,row.model))} empty={saleWorkspace.loading ? '正在加载模型售卖' : '没有符合条件的记录'} columns={[
        {title:'模型服务名称',width:160,render:merged(row=><Typography.Text link={{ href: detailHref(row) }}>{row.modelName}</Typography.Text>)},
        {title:'模型服务 ID',width:190,render:merged(row=><CopyId value={row.model_service_id} label="模型服务 ID" ellipsis={{showTooltip:true}}/>)},
        {title:'模型 ID',width:160,render:merged(row=>row.callId ? <CopyId value={row.callId} label="模型 ID" ellipsis={{showTooltip:true}}/> : '待配置')},
        {title:'计费项',width:130,render:(_,row)=><div>{translateLabel(row.item?.name) || '—'}{row.item?.condition && <Typography.Paragraph type="tertiary">{row.item.condition}</Typography.Paragraph>}</div>},
        {title:'模型刊例价',width:110,align:'right',render:(_,row)=>row.item?.amount == null
          ? translateLabel(!row.price && !row.unavailable ? '待配置' : '—') : moneyDisplay(row.item.amount)},
        {title:'计费单位',width:140,render:(_,row)=>translateLabel(row.item?.unit) || '—'},
        {title:'货币',width:90,render:(_,row)=>row.item?.currency || '—'},
        {title:'模型刊例价版本',width:100,render:merged(row=>row.unavailable ? '—' : row.price ? `v${row.price.version}` : '待配置')},
        {title:'售卖状态',width:120,render:merged(row=><Space><AdminStatus value={row.status}/>{!row.price && !row.unavailable && <AdminStatus value="不可售"/>}</Space>)},
        {title:'销售对象',width:140,render:merged(row=>row.unavailable ? '—' : <Button theme="borderless" size="small" onClick={() => configure(row, 'scope')}>{translateLabel(row.independent ? modelServiceSaleAudience(state, row) : salesAudienceLabel(state, offerSalesScope(row.model, offerKey(row))))}</Button>)},
        {title:'操作',width:230,fixed:'right',render:merged(row=>row.unavailable ? '—' : <Space wrap spacing={4}>
          <Button theme="borderless" size="small" onClick={() => configure(row)}>{translateLabel(readOnly ? '查看配置' : row.price ? '维护模型刊例价' : '配置模型刊例价')}</Button>
          {saleActions(row)}
        </Space>)},
      ]}/>
      <AdminPagination total={rows.length} pageSize={salesPageSize} currentPage={page} hideOnSinglePage
        onPageChange={next => go({ page: next }, { replace: true, preserveScroll: true })}/>
    </Card>}
    {salesDialog && saleRow?.independent && !readOnly && <ModelServiceSaleStatusDialog
      key={saleRow.id + ':' + salesDialog.stage} state={state} row={saleRow} ops={ops} stage={salesDialog.stage}
      revision={salesDialog.revision} change={changeSale} busy={busy} close={closeSales} configure={configure}/>}
    {salesDialog && saleRow && !saleRow.independent && salesDialog.stage !== 'pause' && !readOnly && <ServiceListingDialog state={state} model={saleRow.model}
      initialOfferKey={offerKey(saleRow)} targetService={saleRow.service} ops={ops} stage={salesDialog.stage} close={closeSales}/>}
    {salesDialog?.stage === 'pause' && saleRow && !saleRow.independent && !readOnly && <Modal title={translateLabel("停售")} description={`${saleRow.modelName}（${saleRow.callId}）`}
      centered onClose={() => !busy && closeSales()} footer={<>
        <Button disabled={busy} onClick={closeSales}>{translateLabel("取消")}</Button>
        <Button theme="solid" type="danger" loading={busy} disabled={!ops.can || saleRow.model.updatedAt !== salesDialog.revision}
          onClick={async () => {
            setBusy(true);
            try {
              if (await ops.run('pauseSales', { offerKey: offerKey(saleRow), expectedUpdatedAt: salesDialog.revision, confirmed:true }, saleRow.model.id)) closeSales();
            } finally { setBusy(false); }
          }}>确认停售</Button>
      </>}>
      <p>停售后暂停新订购，已有订单与调用权限继续有效。</p>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
    {ops.error && !salesDialog && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}
  </div>;
}
