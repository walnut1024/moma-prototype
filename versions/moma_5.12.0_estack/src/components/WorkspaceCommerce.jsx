import { useState } from 'react';
import { Banner, Button, Modal, Select, Table, Tabs } from '@douyinfe/semi-ui';
import { ShoppingCart, Store } from 'lucide-react';
import FrontPageHeader from './FrontPageHeader';
import { chargeTotals, formatRequestCharge } from '../project-call.mjs';
import { projectModelEnabled } from '../project-access.mjs';
import { customerPriceRows } from '../service-directory.mjs';
import { orderTenantServices } from '../tenant-data.mjs';

const dateTime = new Intl.DateTimeFormat('zh-CN', { timeZone:'Asia/Shanghai', dateStyle:'short', timeStyle:'short' });
const time = value => Number.isFinite(Date.parse(value)) ? dateTime.format(new Date(value)) : '—';

export default function WorkspaceCommerce({ tenant, services, internal, view, onLogin, onOrder, onBilling, onProjects,
  project, onExperience, onConfigure, onPlanOrder }) {
  const [confirmation, setConfirmation] = useState(null);
  const [entry, setEntry] = useState(null);
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState('services');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const personal = tenant.identity?.spaceId === 'personal';
  const billing = view === 'billing';
  const title = billing ? '订购与账单' : view === 'order' ? '开通模型服务' : '模型广场';
  const rows = services.filter(service => {
    const visible = service.marketVisible || service.marketProjectIds?.includes(project?.id);
    return internal ? service.serviceAvailable && (!service.marketCardManaged || visible)
      : visible && (service.orderable || service.ordered);
  });
  const billRows = (tenant.report?.records || []).filter(row => row.settlement !== 'internal' &&
    row.httpStatus >= 200 && row.httpStatus < 300 && row.billingType !== 'Token Plan');
  const projects = tenant.projects.filter(row => row.status === '正常');
  const selectedProject = projects.find(row => row.id === projectId);
  const liveEntry = services.find(row => row.id === entry?.id);
  const enabled = selectedProject && liveEntry?.callable && projectModelEnabled(selectedProject, liveEntry.modelKey);
  const start = service => {
    setProjectId(project?.id || (projects.length === 1 ? projects[0].id : ''));
    setError('');
    if (project && service.callable && projectModelEnabled(project, service.modelKey)) onExperience(project, service);
    else setEntry(service);
  };
  const order = () => {
    try {
      orderTenantServices([confirmation.service.id], confirmation);
      setConfirmation(null);
      setFeedback(personal ? '服务已开通，可直接体验。' : '服务已开通，可在项目中分配模型权限。');
    } catch (issue) { setError(issue.message); }
  };
  return <div className="project-workspace">
    <FrontPageHeader title={title} description={tenant.identity?.tenantName} icon={billing ? ShoppingCart : Store}
      actions={tenant.identity && !internal && tenant.canManage &&
        <Button theme="solid" onClick={billing ? onOrder : onBilling}>{billing ? '开通模型服务' : '订购与账单'}</Button>} />
    {tenant.error && <Banner type="danger" description={tenant.error} closeIcon={null} />}
    {!tenant.identity ? <Button onClick={onLogin}>登录</Button> : billing ? tenant.canManage ? <>
      <Tabs activeKey={tab} onChange={setTab} tabList={[
        {itemKey:'services',tab:'已开通服务'}, {itemKey:'plans',tab:'Token Plan'}, {itemKey:'bills',tab:'账单'},
      ]} />
      <section className="project-panel">
        {tab === 'services' && <Table rowKey="id" size="small" pagination={false} scroll={{x:560}}
          dataSource={tenant.orders.filter(row => !row.subscriptionId && row.billingType !== 'Token Plan')} empty="暂无订购记录"
          columns={[
            {title:'订单号', render:(_, order) => order.orderNo || order.id},
            {title:'模型服务', render:(_, order) => order.productName || order.serviceId || '未记录'},
            {title:'开通时间', dataIndex:'activatedAt',render:time},
            {title:'状态', dataIndex:'status'},
          ]}/>}
        {tab === 'plans' && <>
          <Button theme="solid" onClick={onPlanOrder}>订购 Token Plan</Button>
          <Table rowKey="id" size="small" pagination={false} scroll={{x:640}}
            dataSource={tenant.plans.filter(row => !row.product.name.includes('Coding'))} empty="暂无套餐订阅"
            columns={[
              {title:'订阅 ID', dataIndex:'id'},
              {title:'套餐', render:(_, plan) => plan.product.name},
              {title:'生效时间', dataIndex:'activatedAt', render:time},
              {title:'到期时间', render:(_, plan) => time(plan.expiresAt || plan.endAt)},
              {title:'状态', dataIndex:'status'},
            ]}/>
        </>}
        {tab === 'bills' && <>
          <div className="project-panel-heading"><h2>按量用量账单</h2><strong>已核算 {chargeTotals(billRows.map(row => row.charge)) || '—'}</strong></div>
          <Table rowKey="id" size="small" pagination={false} scroll={{x:640}} dataSource={billRows} empty="暂无按量调用费用"
            columns={[
              {title:'调用时间', dataIndex:'createdAt', render:time},
              ...(!personal ? [{title:'项目', dataIndex:'projectId', render:id => tenant.projects.find(project => project.id === id)?.name || '未归属'}] : []),
              {title:'模型服务', render:(_, row) => row.publicModelId || row.modelId},
              {title:'费用', dataIndex:'charge', align:'right', render:charge => charge ? formatRequestCharge(charge) : '待核算'},
              {title:'请求 ID', dataIndex:'requestId'},
            ]}/>
        </>}
      </section>
    </> : <p>请由企业管理员查看订购与账单。</p> : <section className="project-panel">
      {feedback && <p role="status">{feedback}</p>}
      <Table aria-label="模型服务" rowKey="id" size="small" pagination={false} scroll={{x:680}} dataSource={rows} empty="暂无可用模型服务"
        columns={[
          {title:'模型服务', render:(_, service) => <div className="project-record">{service.name}<small>{service.provider}</small></div>},
          {title:'模型调用名',dataIndex:'callId'},
          ...(!internal ? [{title:'按量价格',render:(_, service) => <div className="project-record">
            {customerPriceRows(service.salePrices).map(row => <small key={row.name}>{row.name} {row.amount} {row.currency}/{row.unit}</small>)}
          </div>}] : []),
          {title:'操作',render:(_, service) => <>
            <Button size="small" theme="borderless" onClick={() => start(service)}>体验</Button>
            {!internal && (service.ordered ? <span>已开通</span> : tenant.canManage
              ? <Button size="small" theme="borderless" onClick={() => { setError(''); setConfirmation({service,identityKey:tenant.identity.key,expectedRevision:tenant.revision}); }}>开通按量服务</Button>
              : <span>由企业管理员开通</span>)}
          </>},
        ]}/>
    </section>}
    <Modal visible={Boolean(entry)} title={'体验 ' + (entry?.name || '')} onCancel={() => setEntry(null)} footer={null}>
      {entry && <div className="project-form">
        {!personal && <label>使用项目<Select aria-label="体验使用项目" placeholder="选择项目" value={projectId || undefined}
          optionList={projects.map(row => ({value:row.id,label:row.name}))} onChange={setProjectId} /></label>}
        {liveEntry && !liveEntry.serviceAvailable && <p role="status">{liveEntry.reason}</p>}
        {liveEntry && !liveEntry.ordered && !internal && tenant.canManage &&
          <Button onClick={() => { setError(''); setConfirmation({service:liveEntry,identityKey:tenant.identity.key,expectedRevision:tenant.revision}); }}>开通按量服务</Button>}
        {!projects.length && <Button onClick={() => {setEntry(null);onProjects();}}>前往项目管理</Button>}
        {selectedProject && liveEntry?.serviceAvailable && !projectModelEnabled(selectedProject,liveEntry.modelKey) &&
          <p role="status">{selectedProject.canEdit ? '请先在该项目的模型权限中开通此模型。' : '请联系项目管理员开通此模型，或选择其他项目。'}</p>}
        {selectedProject?.canEdit && liveEntry?.serviceAvailable && !projectModelEnabled(selectedProject,liveEntry.modelKey) &&
          <Button onClick={() => {setEntry(null);onConfigure(selectedProject);}}>前往模型权限</Button>}
        <Button theme="solid" disabled={!enabled} onClick={() => {setEntry(null);onExperience(selectedProject,liveEntry);}}>开始体验</Button>
      </div>}
    </Modal>
    <Modal visible={Boolean(confirmation)} title="开通按量服务" onCancel={() => setConfirmation(null)} onOk={order} okText="确认开通">
      <p>{tenant.identity?.tenantName} · {confirmation?.service.name} · 按公布单价按量计费</p>
      {error && <Banner type="danger" description={error} closeIcon={null} />}
    </Modal>
  </div>;
}
