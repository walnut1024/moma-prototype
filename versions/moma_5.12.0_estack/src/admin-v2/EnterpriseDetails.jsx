import { useChannelText } from './channel-language';
import { Button, Card, Tabs, Typography } from './xa24/HaloUI.jsx';
import { EnterpriseFacts, EnterpriseStatus, EnterpriseTable } from './EnterpriseUI';
import { enterpriseAdmins, enterpriseDisplayValue, enterpriseMetadataFields } from './enterprise';
import { TenantServiceSettings } from './TenantServiceSettings';
import TenantResources from './TenantResources';

const enterpriseTabs = { info:'基本资料', admins:'租户管理员', organization:'组织及成员', models:'模型授权' };
const { Title } = Typography;
const time = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—';

function MetadataFacts({ title,tenant,fields }) {
  const rows = fields.filter(field=>tenant[field.key]).map(field=>[field.label,enterpriseDisplayValue(field.key,tenant[field.key])]);
  return rows.length>0 && <>
    <Title heading={5} component="h2">{title}</Title>
    <EnterpriseFacts rows={rows}/>
  </>;
}

function TenantAdministrators({ state, tenant, canWrite, setEditor, askToggle }) {
  const translateLabel = useChannelText();
  return <>
    <div className="admin-page-heading">
      <Title heading={5} component="h2">{translateLabel("租户管理员")}</Title>
      <Button theme="solid" disabled={!canWrite} onClick={()=>setEditor({kind:'add-admin',tenant})}>指定管理员</Button>
    </div>
    <EnterpriseTable columns={['姓名','登录账号','手机号','邮箱','管理员状态','操作']} empty="暂无租户管理员"
      rows={enterpriseAdmins(state,tenant).map(member=>{
        const user = state.users.find(item=>item.id===member.userId);
        const enabled = member.status==='正常';
        const status = !user ? '登录身份缺失' : user.status!=='正常' ? '登录账号已停用' : <EnterpriseStatus value={member.status}/>;
        return {id:member.id,cells:[
          enterpriseDisplayValue('adminName',user?.name || member.name) || '未填写', user?.login || '未填写',
          enterpriseDisplayValue('phone',user?.phone) || '未填写', enterpriseDisplayValue('email',user?.email) || '未填写', status,
          <Button size="small" theme="borderless" disabled={!canWrite || !user || !enabled && user.status!=='正常'} onClick={()=>askToggle(tenant,member)}>
            {enabled ? '停用管理员' : '启用管理员'}
          </Button>,
        ]};
      })}/>
  </>;
}

export default function EnterpriseDetails({ state, tenant, params, navigate, canWrite, transact, setEditor, askToggle, editing, editForm }) {
  const translateLabel = useChannelText();
  const canManageResources = state.currentRole==='平台管理员' && ['正常','需关注'].includes(tenant.status);
  const tabs = Object.entries(enterpriseTabs).filter(([id])=>id!=='organization' || canManageResources);
  const tab = tabs.some(([id])=>id===params.get('tab')) ? params.get('tab') : 'info';
  const content = (
    <div className="admin-analytics-fields">
      {tab==='info' && (editing ? editForm : <>
        <div className="admin-page-heading">
          <Title heading={5} component="h2">租户信息</Title>
          <Button disabled={!canWrite} onClick={()=>setEditor({kind:'edit',tenant})}>{translateLabel("编辑信息")}</Button>
        </div>
        <EnterpriseFacts rows={[
          ['租户名称', tenant.name], ['租户 ID', tenant.id], ['租户类型', tenant.type],
          ['创建时间', time(tenant.createdAt)], ['最近更新', time(tenant.updatedAt)], ['备注', tenant.notes || '—'],
        ]}/>
        <MetadataFacts title="企业信息" tenant={tenant} fields={enterpriseMetadataFields.slice(0,2)}/>
        <MetadataFacts title="地域与行业" tenant={tenant} fields={enterpriseMetadataFields.slice(2,7)}/>
        <MetadataFacts title="业务联系" tenant={tenant} fields={enterpriseMetadataFields.slice(7)}/>
      </>)}
      {tab==='admins' && <TenantAdministrators state={state} tenant={tenant} canWrite={canWrite && tenant.status!=='停用'} setEditor={setEditor} askToggle={askToggle}/>}
      {tab==='organization' && <TenantResources tenantId={tenant.id} embedded
        tab={params.get('organizationView')} onTabChange={organizationView=>navigate({organizationView},true)}/>}
      {tab==='models' && <TenantServiceSettings state={state} tenant={tenant} section="models" canWrite={canWrite} transact={transact}/>}
    </div>
  );
  return <Card>
    <Tabs activeKey={tab} onChange={value=>navigate({tab:value,organizationView:''})}>
      {tabs.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={translateLabel(label)} disabled={editing}>
        {id===tab && content}
      </Tabs.TabPane>)}
    </Tabs>
  </Card>;
}
