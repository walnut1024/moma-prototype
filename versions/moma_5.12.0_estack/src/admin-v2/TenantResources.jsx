import { Banner, Typography } from '@douyinfe/semi-ui';
import { useState } from 'react';
import { useTenantData } from '../useTenantData';
import OrganizationWorkspace from '../components/OrganizationWorkspace';
import ProjectWorkspace from '../components/ProjectWorkspace';
import AdminPageHeading from './AdminPageHeading';

export default function TenantResources({ tenantId, tenantName, page, tab, onTabChange, embedded, requestedProject, returnHref }) {
  const available = Boolean(tenantId) && (page!=='projects' || Boolean(requestedProject));
  const tenant = useTenantData({enabled:available,adminTenantId:tenantId});
  const [projectTab,setProjectTab]=useState('members');
  const [action,setAction]=useState();
  if (!available) return <Banner type="warning" title="请从租户详情选择管理对象" closeIcon={null}/>;
  if (embedded) return <OrganizationWorkspace tenant={tenant} tab={tab} onTabChange={onTabChange} admin/>;
  return <div className="admin-page-stack">
    <AdminPageHeading title={page === 'organization-members' ? '组织及成员' : '项目配置'} description={tenantName}>
      {returnHref && <Typography.Text link={{href:returnHref}}>返回租户详情</Typography.Text>}
    </AdminPageHeading>
    {page === 'organization-members' ? <OrganizationWorkspace tenant={tenant} tab={tab} onTabChange={onTabChange} admin/>
      : <ProjectWorkspace tenant={tenant} projectId={requestedProject} currentProjectId={requestedProject}
          listMode="projects" initialTab={tenant.identity?.spaceId==='personal' && projectTab==='members' ? 'settings' : projectTab} view="detail" initialAction={action}
          onOpen={(_,intent)=>setAction(intent)}
          onList={()=>setAction(undefined)} onActionClose={()=>setAction(undefined)}
          onNavigate={(_,kind,params)=>{if(kind==='tab')setProjectTab(params.view);}} />}
  </div>;
}
