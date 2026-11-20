import { Banner, Spin, Tabs } from '@douyinfe/semi-ui';
import OrganizationMembers from '../OrganizationMembers';
import OperationRecords from '../OperationRecords';

export default function OrganizationWorkspace({ tenant, tab, onTabChange }) {
  if (tenant.error) return <Banner type="danger" description={tenant.error} closeIcon={null}/>;
  if (!tenant.identity) return <Spin spinning aria-label="正在加载组织及成员"/>;
  if (!tenant.canManageOrganization) return <Banner type="warning" title="无访问权限" closeIcon={null}/>;
  return <>
    <Tabs activeKey={tab === 'audit' ? 'audit' : 'members'} onChange={onTabChange} aria-label="组织及成员">
      <Tabs.TabPane itemKey="members" tab="组织架构与成员"/>
      <Tabs.TabPane itemKey="audit" tab="操作记录"/>
    </Tabs>
    {tab === 'audit' ? <OperationRecords tenant={tenant}/> : <OrganizationMembers key={tenant.identity.key} tenant={tenant}/>}
  </>;
}
