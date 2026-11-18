import { useState } from 'react';
import { Banner, Button, Modal, Select, Tabs } from '@douyinfe/semi-ui';
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
        <Button onClick={billing ? onOrder : onBilling}>{billing ? '开通模型服务' : '订购与账单'}</Button>} />
    {tenant.error && <Banner type="danger" description={tenant.error} closeIcon={null} />}
    {!tenant.identity ? <Button onClick={onLogin}>登录</Button> : billing ? tenant.canManage ? <>
      <Tabs activeKey={tab} onChange={setTab} tabList={[
        {itemKey:'services',tab:'已开通服务'}, {itemKey:'plans',tab:'Token Plan'}, {itemKey:'bills',tab:'账单'},
      ]} />
      <section className="project-panel">
        {tab === 'services' && <div className="project-table-scroll"><table><thead><tr>
          <th>订单号</th><th>模型服务</th><th>开通时间</th><th>状态</th>
        </tr></thead><tbody>{tenant.orders.filter(row => !row.subscriptionId && row.billingType !== 'Token Plan').map(order => <tr key={order.id}>
          <td>{order.orderNo || order.id}</td><td>{order.productName || order.serviceId || '未记录'}</td>
          <td>{time(order.activatedAt)}</td><td>{order.status}</td>
        </tr>)}</tbody></table>{!tenant.orders.length && <p>暂无订购记录</p>}</div>}
        {tab === 'plans' && <div className="project-table-scroll"><Button onClick={onPlanOrder}>订购 Token Plan</Button><table><thead><tr>
          <th>订阅 ID</th><th>套餐</th><th>生效时间</th><th>到期时间</th><th>状态</th>
        </tr></thead><tbody>{tenant.plans.filter(row => !row.product.name.includes('Coding')).map(plan => <tr key={plan.id}>
          <td>{plan.id}</td><td>{plan.product.name}</td><td>{time(plan.activatedAt)}</td><td>{time(plan.expiresAt || plan.endAt)}</td><td>{plan.status}</td>
        </tr>)}</tbody></table>{!tenant.plans.length && <p>暂无套餐订阅</p>}</div>}
        {tab === 'bills' && <>
          <div className="project-panel-heading"><h2>按量用量账单</h2><strong>已核算 {chargeTotals(billRows.map(row => row.charge)) || '—'}</strong></div>
          <div className="project-table-scroll"><table><thead><tr>
            <th>调用时间</th>{!personal && <th>项目</th>}<th>模型服务</th><th>费用</th><th>请求 ID</th>
          </tr></thead><tbody>{billRows.map(row => <tr key={row.id}>
            <td>{time(row.createdAt)}</td>{!personal && <td>{tenant.projects.find(project => project.id === row.projectId)?.name || '未归属'}</td>}
            <td>{row.publicModelId || row.modelId}</td><td>{row.charge ? formatRequestCharge(row.charge) : '待核算'}</td><td>{row.requestId}</td>
          </tr>)}</tbody></table>{!billRows.length && <p>暂无按量调用费用</p>}</div>
        </>}
      </section>
    </> : <p>请由企业管理员查看订购与账单。</p> : <section className="project-panel">
      {feedback && <p role="status">{feedback}</p>}
      <div className="project-table-scroll"><table aria-label="模型服务">
        <thead><tr><th>模型服务</th><th>模型调用名</th>{!internal && <th>按量价格</th>}<th>操作</th></tr></thead>
        <tbody>{rows.map(service => <tr key={service.id}>
          <td>{service.name}<small>{service.provider}</small></td><td>{service.callId}</td>
          {!internal && <td>{customerPriceRows(service.salePrices).map(row => <small key={row.name}>{row.name} {row.amount} {row.currency}/{row.unit}</small>)}</td>}
          <td><Button theme="borderless" onClick={() => start(service)}>体验</Button>
            {!internal && (service.ordered ? <span>已开通</span> : tenant.canManage
              ? <Button theme="borderless" onClick={() => { setError(''); setConfirmation({service,identityKey:tenant.identity.key,expectedRevision:tenant.revision}); }}>开通按量服务</Button>
              : <span>由企业管理员开通</span>)}</td>
        </tr>)}</tbody>
      </table>{!rows.length && <p>暂无可用模型服务</p>}</div>
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
