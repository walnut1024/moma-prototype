import { useState } from 'react';
import { Button, Card, Dropdown, Input, Select, Table, Tabs } from '@douyinfe/semi-ui';
import { AdminModal } from '../admin-v2/AdminOverlay';
import AdminStatus from '../admin-v2/AdminStatus';
import { FolderKanban } from 'lucide-react';
import FrontPageHeader from './FrontPageHeader';
import { projectModelEnabled } from '../project-access.mjs';
import { departmentPath } from '../organization-data.mjs';
import ProjectRoutes from './ProjectRoutes';
import ProjectOverview from './ProjectOverview';
import { ProjectFields, ProjectLifecycleDialog, ProjectMembers, ProjectModels, ProjectSettings, projectLifecycle, projectTime } from './ProjectConfiguration';
import './project-workspace.css';

export default function ProjectWorkspace({ tenant, projectId, onOpen, onList, onExperience, onLogin, onNavigate, renderKeys,
  view = 'detail', initialTab, initialAction, onActionClose, listMode, myProjects, listLabel }) {
  const { identity, projects, organization, canCreateProject } = tenant;
  const [section, setSection] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const personal = identity?.spaceId === 'personal';
  const mine = listMode === 'mine';
  const listTitle = mine ? '我的项目' : '项目管理';
  const rows = mine ? myProjects || [] : projects;
  const spaceName = personal ? '个人空间' : identity?.tenantName;
  const project = projects.find(row => row.id === projectId) || (personal && !projectId ? projects[0] : undefined);
  const visible = rows.filter(row => (!status || row.status === status) &&
    [row.name, row.id, row.tenantName].some(value => value?.toLowerCase().includes(query.trim().toLowerCase())));
  const department = row => row.organizationId
    ? departmentPath(organization.departments, row.organizationId === organization.rootId ? 'root' : row.organizationId) : '未分配';

  async function create(event) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const created = await tenant.createProject({ name:draft.name, description:draft.description, departmentId:draft.departmentId },
        {expectedRevision: draft.revision, identityKey: draft.identityKey});
      setDraft(null);
      onOpen(created);
    } catch (issue) { setError(issue.message); }
    finally { setCreating(false); }
  }

  if (!identity) return <div className="project-workspace">
    <FrontPageHeader title={listTitle} description="登录后查看可访问的项目" icon={FolderKanban} />
    <div className="project-panel project-empty"><p>{tenant.error || '请先登录'}</p><Button onClick={onLogin}>登录</Button></div>
  </div>;

  if (project) {
    const allowedTabs = view === 'settings' ? ['models', 'settings', 'routes'] : ['overview','members','models','keys','settings','routes'];
    const tab = section?.id === project.id ? section.tab : allowedTabs.includes(initialTab) ? initialTab : view === 'settings' ? 'settings' : 'overview';
    const openTab = value => setSection({ id:project.id, tab:value });
    const experience = tenant.projectServices.find(row => row.callable && projectModelEnabled(project,row.modelKey));
    return <div className="project-workspace">
      {!personal && view === 'detail' && <nav aria-label="项目面包屑"><Button theme="borderless" onClick={onList}>{listLabel}</Button><span aria-hidden="true"> / </span><span>{project.name}</span></nav>}
      <FrontPageHeader title={personal ? view === 'settings' ? '使用设置' : '概览' : project.name} description={[spaceName, project.description].filter(Boolean).join(' · ')} icon={FolderKanban}
        actions={view !== 'settings' && project.status === '正常' && <Button theme="solid" onClick={() => {
          if (experience) onExperience(project, experience);
          else if (view === 'overview') onOpen(project, 'models');
          else openTab('models');
        }}>在线体验</Button>} />
      {initialAction && <ProjectLifecycleDialog tenant={tenant} project={project} intent={initialAction} onClose={onActionClose} onDone={onList} />}
      {view === 'overview' ? <ProjectOverview tenant={tenant} project={project} department={personal ? '' : department(project)}
        openTab={value => onOpen(project, value)} onNavigate={(page, params) => onNavigate(project, page, params)} /> : <Tabs key={project.id} keepDOM={false} className="project-tabs" aria-label="项目详情" activeKey={tab} onChange={openTab}>
        {view === 'detail' && <Tabs.TabPane itemKey="overview" tab="概览"><ProjectOverview tenant={tenant} project={project}
          department={personal ? '' : department(project)} openTab={openTab} onNavigate={(page, params) => onNavigate(project, page, params)} /></Tabs.TabPane>}
        {!personal && <Tabs.TabPane itemKey="members" tab="项目成员"><ProjectMembers tenant={tenant} project={project} /></Tabs.TabPane>}
        {personal && <Tabs.TabPane itemKey="settings" tab="预算与日志"><ProjectSettings tenant={tenant} project={project} /></Tabs.TabPane>}
        <Tabs.TabPane itemKey="models" tab={personal ? '模型限流' : '模型服务'}><ProjectModels tenant={tenant} project={project}
          onExperience={service => onExperience(project, service)} /></Tabs.TabPane>
        {view === 'detail' && <Tabs.TabPane itemKey="keys" tab="API Key">{renderKeys(project, () => openTab('models'), () => {
          openTab('settings');
          requestAnimationFrame(() => document.getElementById('project-audit')?.scrollIntoView({ block:'start' }));
        })}</Tabs.TabPane>}
        <Tabs.TabPane itemKey="routes" tab="项目分流"><ProjectRoutes tenant={tenant} projectId={project.id} /></Tabs.TabPane>
        {!personal && <Tabs.TabPane itemKey="settings" tab="项目设置"><ProjectSettings tenant={tenant} project={project} /></Tabs.TabPane>}
      </Tabs>}
    </div>;
  }

  const columns = [
    { title:'项目名称', render:(_, row) => <div className="project-record"><Button theme="borderless" size="small"
      onClick={() => onOpen(row)}>{row.name}</Button><small>{row.id}</small></div> },
    ...(mine ? [{ title:'所属企业', dataIndex:'tenantName' }, { title:'我的角色', dataIndex:'role' }]
      : [{ title:'主责部门', render:(_, row) => department(row) }]),
    { title:'状态', dataIndex:'status', render:value => <AdminStatus value={value} /> },
    { title:'创建时间', dataIndex:'createdAt', render:projectTime },
    { title:'操作', render:(_, row) => {
      const actions = mine ? row.canExit ? ['exit'] : [] : tenant.canManage && row.status !== '已删除'
        ? [row.status === '正常' ? 'stop' : 'start', 'delete'] : [];
      return actions.length > 0 && <Dropdown trigger="click" position="bottomRight" clickToHide
        menu={actions.map(intent => ({ node:'item', name:projectLifecycle[intent].label,
          onClick:() => onOpen(row, 'settings', mine ? 'my-projects' : 'projects', intent) }))}>
        <Button theme="borderless" size="small" aria-label={row.name + '的更多操作'}>更多操作</Button>
      </Dropdown>;
    } },
  ];
  const empty = rows.length ? '没有匹配的项目' : tenant.error || (canCreateProject ? '暂无项目，可以新建项目' : '暂无可访问的项目，请联系企业管理员');
  return <div className="project-workspace">
    <FrontPageHeader title={listTitle} description={mine ? undefined : spaceName} icon={FolderKanban} actions={canCreateProject &&
      <Button theme="solid" onClick={() => {
        setError('');
        setDraft({name:'', description:'', departmentId:'', revision:tenant.revision, identityKey:identity.key});
      }}>新建项目</Button>} />
    {projectId && <p role="status">该项目在当前空间不可访问。</p>}
    <Card aria-label="项目列表">
      <div className="project-filters">
        <Input className="project-search" aria-label="搜索项目" placeholder={mine ? '搜索项目名称、ID 或所属企业' : '搜索项目名称或 ID'} value={query} onChange={setQuery} />
        <Select aria-label="项目状态" value={status} onChange={setStatus}
          optionList={[{value:'',label:'全部状态'}, ...Array.from(new Set(rows.map(row => row.status)), value => ({value,label:value}))]} />
      </div>
      <Table aria-label="项目列表" rowKey={row => [row.spaceId, row.id].join('/')} columns={columns} dataSource={visible}
        size="small" scroll={{x:`max(100%, ${mine ? 750 : 650}px)`}} pagination={false} empty={empty}/>
    </Card>
    {draft && <AdminModal visible title="新建项目" closeOnEsc={!creating} closable={!creating}
      onCancel={() => { if (!creating) setDraft(null); }} okText="创建" confirmLoading={creating}
      cancelButtonProps={{ disabled:creating }} okButtonProps={{ form:'new-tenant-project', htmlType:'submit' }}>
      <p>所属空间 · {spaceName}</p>
      <form id="new-tenant-project" className="project-form" onSubmit={create}>
        <ProjectFields tenant={tenant} value={draft} setValue={setDraft} />
        {error && <p role="alert">{error}</p>}
      </form>
    </AdminModal>}
  </div>;
}
