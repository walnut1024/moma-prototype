import { Banner, Typography } from '@douyinfe/semi-ui';
import { useTenantData } from '../useTenantData';
import OrganizationWorkspace from '../components/OrganizationWorkspace';
import AdminPageHeading from './AdminPageHeading';

export default function TenantResources({ tenantId, tenantName, tab, onTabChange, embedded, returnHref }) {
  const tenant = useTenantData({enabled:Boolean(tenantId),adminTenantId:tenantId});
  if (!tenantId) return <Banner type="warning" title="请从租户详情选择管理对象" closeIcon={null}/>;
  if (embedded) return <OrganizationWorkspace tenant={tenant} tab={tab} onTabChange={onTabChange} admin/>;
  return <div className="admin-page-stack">
    <AdminPageHeading title="组织及成员" description={tenantName}>
      {returnHref && <Typography.Text link={{href:returnHref}}>返回租户详情</Typography.Text>}
    </AdminPageHeading>
    <OrganizationWorkspace tenant={tenant} tab={tab} onTabChange={onTabChange} admin/>
  </div>;
}
