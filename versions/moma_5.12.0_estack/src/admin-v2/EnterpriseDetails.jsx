import { internalSpace } from '../operating-space.mjs';
import { Button, Card, Space, Tabs, Typography } from '@douyinfe/semi-ui';
import { EnterpriseFacts, EnterpriseTable } from './EnterpriseUI';
import EnterpriseMembers from './EnterpriseMembers';
import CustomerProjectDetails, { CustomerProjectKeys } from './CustomerProjectDetails';
import { enterpriseAdmins, enterpriseDisplayValue, enterpriseMetadataFields } from './enterprise';
import { accountDataSourceLabel } from './account-data-source';

export const enterpriseTabs = { info: '基本信息', members: '组织及成员', projects: '项目管理', keys:'API 密钥', billing:'订购与账单' };
const { Text, Title } = Typography;
const time = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—';

function MetadataFacts({ tenant, fields }) {
  return <EnterpriseFacts rows={fields.map(field => [
    field.label, enterpriseDisplayValue(field.key, tenant[field.key]) || (field.key === 'countryRegion' ? '中国' : '未填写'),
  ])}/>;
}

export default function EnterpriseDetails({ state, tenant, params, navigate, canWrite, setEditor, setResult, askToggle, askKey, editing, editForm }) {
  const internal=internalSpace(state.spacePolicy,tenant);
  const tabs=Object.entries(enterpriseTabs).filter(([id])=>!internal || id!=='billing');
  const tab=tabs.some(([id])=>id===params.get('tab')) ? params.get('tab') : 'info';
  const projects = state.projects.filter(item => item.tenantId === tenant.id);
  const projectId = params.get('project') || '';
  const admins = enterpriseAdmins(state, tenant);
  const organizations = state.organizations.filter(item => item.tenantId === tenant.id);
  return <Card>
    <Tabs activeKey={tab} onChange={value => navigate({ tab: value, project: '' }, true)}>
      {tabs.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={label} disabled={editing}/>)}
    </Tabs>
    <div className="admin-analytics-fields">
      {tab==='billing' && <><Text link={{href:'#/admin-2/bills?tenant='+encodeURIComponent(tenant.id)}}>查看客户账单</Text>
        <EnterpriseTable columns={['订购服务','模型调用名','订单状态']} empty="当前客户暂无订购记录"
          rows={state.orders.filter(row=>row.tenantId===tenant.id).map(row=>({id:row.id,cells:[
            row.serviceName || row.product?.name || row.orderNo || row.id,
            row.modelIds?.map(id=>state.models.find(model=>model.id===id)?.modelId || id).join('、') || '未记录',
            row.status,
          ]}))}/></>}
      {tab === 'info' && (editing ? editForm : <>
        <Space wrap>
          <Text link={{href:'#/admin-2/customer-usage-detail?period=today&customer='+encodeURIComponent(tenant.id)}}>
            {internal?'查看成本归集':'查看企业用量'}</Text>
        </Space>
        <div className="admin-page-heading">
          <Title heading={5} component="h2">客户信息</Title>
          <Button disabled={!canWrite} onClick={() => setEditor({ kind: 'edit', tenant })}>编辑信息</Button>
        </div>
        <EnterpriseFacts rows={[
          ['客户名称', tenant.name], ['客户 ID', tenant.id], ['客户类型', tenant.type], ['数据来源', accountDataSourceLabel(tenant)],
          ['创建时间', time(tenant.createdAt)], ['最近更新', time(tenant.updatedAt)],
          ['企业根组织', organizations.find(org => org.parentId === null)?.name || '待配置'], ['备注', tenant.notes || '—'],
        ]}/>
        <Title heading={5} component="h2">企业管理员</Title>
        {admins.length ? admins.map(member => {
          const user = state.users.find(item => item.id === member.userId);
          return <EnterpriseFacts key={member.id} rows={[
            ['姓名', enterpriseDisplayValue('adminName', user?.name || member.name) || '未填写'],
            ['登录账号', user?.login || '未填写'], ['手机号', enterpriseDisplayValue('phone', user?.phone) || '未填写'],
            ['邮箱', enterpriseDisplayValue('email', user?.email) || '未填写'],
            ...((member.status !== '正常' || user?.status !== '正常') ? [['管理员状态',
              !user ? '登录身份缺失' : member.status !== '正常' ? '成员已停用' : '登录身份已停用']] : []),
          ]}/>;
        }) : <Text type="secondary">待配置</Text>}
        <Title heading={5} component="h2">企业信息</Title>
        <MetadataFacts tenant={tenant} fields={enterpriseMetadataFields.slice(0, 2)}/>
        <Title heading={5} component="h2">地域与行业</Title>
        <MetadataFacts tenant={tenant} fields={enterpriseMetadataFields.slice(2, 7)}/>
        <Title heading={5} component="h2">业务联系</Title>
        <MetadataFacts tenant={tenant} fields={enterpriseMetadataFields.slice(7)}/>
      </>)}
      {tab === 'members' && <EnterpriseMembers state={state} tenant={tenant} projects={projects} canWrite={canWrite}
        setEditor={setEditor} setResult={setResult} askToggle={askToggle} openProject={project => navigate({ tab:'projects', project })}/>}
      {tab === 'projects' && <CustomerProjectDetails state={state} tenant={tenant} projectId={projectId}
        navigate={navigate} askKey={askKey} canWrite={canWrite}/>}
      {tab === 'keys' && <CustomerProjectKeys state={state} tenant={tenant} projectId={projectId}
        onProjectChange={project => navigate({ project })} askKey={askKey} canWrite={canWrite}/>}
    </div>
  </Card>;
}
