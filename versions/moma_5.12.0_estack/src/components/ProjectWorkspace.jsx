import { useEffect, useState } from 'react';
import { ChevronRight, Folder, FolderKanban, Search } from 'lucide-react';
import { Button, Input, Select, Tabs } from '@douyinfe/semi-ui';
import AdminStatus from '../admin-v2/AdminStatus';
import FrontPageHeader from './FrontPageHeader';
import { projectModelEnabled, projectRoleLabel } from '../project-access.mjs';
import { departmentPath } from '../organization-data.mjs';
import ProjectOverview, { ProjectBudgetNotice } from './ProjectOverview';
import { ProjectCreateDialog, ProjectLifecycleDialog, ProjectMembers, ProjectModels, ProjectSettings, ProjectTokenBudget, projectLifecycle, projectTime } from './ProjectConfiguration';
import './project-workspace.css';

export default function ProjectWorkspace({ tenant, projectId, currentProjectId, onSelect, onOpen, onList, onListModeChange, onExperience,
  onNavigate, view, initialTab, listMode, initialAction, onActionClose, renderRoutes }) {
  const { identity, projects, organization, canCreateProject } = tenant;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const personal = identity?.spaceId === 'personal';
  const mine = listMode === 'my-projects';
  const allowCreate = canCreateProject && !mine;
  const spaceName = personal ? '个人空间' : identity?.tenantName;
  const rows = mine ? tenant.accountProjects : projects;
  const localRows = rows.filter(row => !row.tenantId || row.tenantId === identity?.tenantId);
  const shownId = projectId || (personal ? currentProjectId
    : (localRows.find(row => row.id === currentProjectId) || localRows.find(row => row.status === '正常') || localRows[0])?.id);
  const projectRef = localRows.find(row => row.id === shownId);
  const project = projects.find(row => row.id === shownId && (personal || projectRef));
  const defaultProjectId = !personal && !projectId && project?.status === '正常' && project.id !== currentProjectId ? project.id : undefined;
  useEffect(() => { if (defaultProjectId) onSelect(defaultProjectId); }, [defaultProjectId, onSelect]);
  const department = row => row.organizationId
    ? departmentPath(organization.departments, row.organizationId === organization.rootId ? 'root' : row.organizationId)
    : '未分配';
  const search = query.trim().toLowerCase();
  const visible = rows.filter(row => (!status || row.status === status) &&
    [row.name, row.id, row.tenantName].some(value => value?.toLowerCase().includes(search)));
  const groups = Map.groupBy(visible, row => mine ? (row.tenantId || identity?.tenantId) : (row.organizationId || ''));
  const actions = !project ? [] : mine ? (projectRef?.canExit ? ['exit'] : [])
    : canCreateProject && project.status !== '已删除' ? (project.status === '停用' ? ['start', 'delete'] : ['delete']) : [];

  if (!identity) return <div className="project-workspace">
    <FrontPageHeader title="项目管理" icon={FolderKanban} />
    <div className="project-panel project-empty">
      {tenant.error ? <><p role="alert">{tenant.error}</p><Button onClick={tenant.reload}>重试</Button></>
        : <p role="status">正在加载项目…</p>}
    </div>
  </div>;

  const canConfigure = project?.canManage && project.status !== '已删除';
  const available = personal ? ['settings','models','routes'] : canConfigure ? ['members','budget','models'] : ['members'];
  const tab = available.includes(initialTab) ? initialTab : available[0];
  const openTab = value => onNavigate(project,'tab',{ view:value });
  const experience = project && tenant.projectServices.find(row => row.callable && projectModelEnabled(project,row.modelKey));
  const online = personal && !tenant.systemAdministrator && project?.status === '正常' && <Button theme="solid" onClick={() => experience ? onExperience(project,experience) : openTab('models')}>在线体验</Button>;
  const overview = personal && project && <ProjectOverview tenant={tenant} project={project} department=""
    openTab={openTab} onNavigate={(page,params) => onNavigate(project,page,params)} />;
  const detail = project ? <>
    {personal ? <FrontPageHeader title={view === 'overview' ? '概览' : '使用设置'}
      description={[spaceName, project.description].filter(Boolean).join(' · ')} icon={FolderKanban} actions={online} />
      : <div className="project-detail-header">
        <div className="project-detail-heading">
          <h2 id="project-detail-name"><Folder aria-hidden="true" />{project.name}</h2>
          <AdminStatus value={project.status} />
          {project.description && <p>{project.description}</p>}
          <dl className="project-header-facts">
            <div><dt>项目 ID</dt><dd>{project.id}</dd></div>
            <div><dt>创建时间</dt><dd>{projectTime(project.createdAt)}</dd></div>
            {mine && <div><dt>我的角色</dt><dd>{projectRoleLabel(projectRef.role)}</dd></div>}
          </dl>
        </div>
        <div className="project-detail-actions">
          {canConfigure && <ProjectSettings key={project.id} tenant={tenant} project={project} mode="details" />}
          {actions.map(intent => <Button key={intent} theme="outline" type={intent==='delete' ? 'danger' : 'primary'}
            onClick={()=>onOpen(projectRef,intent)}>{projectLifecycle[intent].label}</Button>)}
        </div>
      </div>}
    {initialAction && <ProjectLifecycleDialog tenant={tenant} project={project} intent={initialAction} onClose={onActionClose} onDone={onList} />}
    {personal ? view === 'overview' ? overview : <>
      <ProjectBudgetNotice project={project} spend={tenant.projectBudgets?.[project.id]} />
      <Tabs key={project.id} className="project-tabs" aria-label="使用设置" activeKey={tab} onChange={openTab} keepDOM={false} tabPaneMotion={false}>
        <Tabs.TabPane itemKey="settings" tab="预算与日志"><ProjectSettings tenant={tenant} project={project} /></Tabs.TabPane>
        <Tabs.TabPane itemKey="models" tab="模型限流"><ProjectModels tenant={tenant} project={project} onExperience={onExperience ? service => onExperience(project, service) : undefined} /></Tabs.TabPane>
        {renderRoutes && <Tabs.TabPane itemKey="routes" tab="项目分流">{renderRoutes(project)}</Tabs.TabPane>}
      </Tabs>
    </> : <Tabs key={project.id} className="project-tabs" aria-label="项目详情" activeKey={tab} onChange={openTab} keepDOM={false} tabPaneMotion={false}>
      <Tabs.TabPane itemKey="members" tab="项目成员"><ProjectMembers tenant={tenant} project={project} /></Tabs.TabPane>
      {canConfigure && <Tabs.TabPane itemKey="budget" tab="项目预算"><ProjectTokenBudget tenant={tenant} project={project} /></Tabs.TabPane>}
      {canConfigure && <Tabs.TabPane itemKey="models" tab="模型限流">
        <ProjectModels tenant={tenant} project={project} onExperience={onExperience ? service => onExperience(project,service) : undefined} />
      </Tabs.TabPane>}
    </Tabs>}
  </> : <p className="project-empty" role="status">{projectId ? '当前项目不可用，请重新选择。' : rows.length ? '请选择项目' : '暂无可访问的项目'}</p>;

  if (personal || tenant.systemAdministrator) return <div className="project-workspace">{detail}</div>;

  const createButton = allowCreate && <Button theme="solid" onClick={()=>setCreating(true)}>新建项目</Button>;
  return <div className="project-workspace project-split-workspace">
    <FrontPageHeader title="项目管理" icon={FolderKanban} actions={createButton}/>
    <Tabs className="project-scope-tabs" aria-label="项目范围" activeKey={listMode} onChange={onListModeChange}
      tabList={[{itemKey:'my-projects',tab:'我的项目'}, ...(canCreateProject ? [{itemKey:'projects',tab:'全部项目'}] : [])]}/>
    <div className="project-split">
      <aside className="project-directory" aria-label="项目树">
        <div className="project-directory-filters">
          <Input prefix={<Search size={15} />} aria-label="搜索项目" placeholder="搜索项目" showClear value={query} onChange={setQuery} />
          <Select aria-label="项目状态" value={status} onChange={setStatus}
            optionList={[{ value:'', label:'全部状态' }, ...['正常','停用',...(!mine ? ['已删除'] : [])].map(value => ({ value, label:value }))]} />
        </div>
        <div className="project-tree">
          {[...groups].map(([groupId, group]) => {
            const label = mine ? group[0].tenantName || spaceName : department(group[0]).replace(spaceName + ' / ', '');
            return <details key={groupId + ':' + Boolean(search)} className="project-tree-group" open>
              <summary><ChevronRight size={15} aria-hidden="true" /><span>{label}</span><small>{group.length}</small></summary>
              <ul>{group.map(row => <li key={row.id}>
                <Button className="project-tree-item" theme="borderless" type="tertiary" icon={<Folder size={15} aria-hidden="true" />}
                  title={row.name} aria-current={row.id === project?.id ? 'true' : undefined} onClick={() => onOpen(row)}>
                  <span>{row.name}</span>{row.status !== '正常' && <small>{row.status}</small>}
                </Button>
              </li>)}</ul>
            </details>;
          })}
          {!visible.length && <p className="project-empty" role="status">{rows.length ? '没有匹配的项目' : '暂无可访问的项目'}</p>}
        </div>
      </aside>
      <section className="project-split-detail" aria-labelledby={project ? 'project-detail-name' : undefined} aria-label={project ? undefined : '项目详情'}>{detail}</section>
    </div>
    {creating && <ProjectCreateDialog tenant={tenant} onClose={()=>setCreating(false)}
      onCreated={project=>{setCreating(false);onOpen(project);}}/>}
  </div>;
}
