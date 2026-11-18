import { useState } from 'react';
import { FolderKanban } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import FrontPageHeader from './FrontPageHeader';
import { projectModelEnabled } from '../project-access.mjs';
import { departmentPath } from '../organization-data.mjs';
import ProjectRoutes from './ProjectRoutes';
import ProjectOverview from './ProjectOverview';
import { ProjectFields, ProjectMembers, ProjectModels, ProjectSettings, projectTime } from './ProjectConfiguration';
import './project-workspace.css';

export default function ProjectWorkspace({ tenant, projectId, onOpen, onList, onExperience, onLogin, onNavigate, renderKeys, view = 'detail', initialTab }) {
  const { identity, projects, organization, canCreateProject } = tenant;
  const [section, setSection] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const personal = identity?.spaceId === 'personal';
  const spaceName = personal ? '个人空间' : identity?.tenantName;
  const project = projects.find(row => row.id === projectId) || (personal && !projectId ? projects[0] : undefined);
  const visible = projects.filter(row => (!status || row.status === status) &&
    [row.name, row.id].some(value => value.toLowerCase().includes(query.trim().toLowerCase())));
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
    <FrontPageHeader title="项目管理" description="登录后查看所属空间的项目" icon={FolderKanban} />
    <div className="project-panel project-empty"><p>{tenant.error || '请先登录'}</p><Button onClick={onLogin}>登录</Button></div>
  </div>;

  if (project) {
    const tab = section?.id === project.id ? section.tab : initialTab || (view === 'settings' ? 'settings' : 'overview');
    const openTab = value => setSection({ id:project.id, tab:value });
    const experience = tenant.projectServices.find(row => row.callable && projectModelEnabled(project,row.modelKey));
    return <div className="project-workspace">
      {!personal && view === 'detail' && <nav aria-label="项目面包屑"><Button variant="link" onClick={onList}>项目列表</Button><span aria-hidden="true"> / </span><span>{project.name}</span></nav>}
      <FrontPageHeader title={view === 'settings' ? personal ? '使用设置' : '项目设置' : personal ? '概览' : '项目概览'} description={[spaceName, project.description].filter(Boolean).join(' · ')} icon={FolderKanban}
        actions={view !== 'settings' && project.status === '正常' && <Button onClick={() => experience ? onExperience(project,experience) : openTab('models')}>在线体验</Button>} />
      {view === 'overview' ? <ProjectOverview tenant={tenant} project={project} department={personal ? '' : department(project)}
        openTab={value => onOpen(project, value)} onNavigate={(page, params) => onNavigate(project, page, params)} /> : <Tabs key={project.id} value={tab} onValueChange={openTab}>
        <TabsList variant="line" className="project-tabs" aria-label="项目详情">
          {view === 'detail' && <TabsTrigger value="overview">概览</TabsTrigger>}
          {!personal && <TabsTrigger value="members">成员</TabsTrigger>}
          <TabsTrigger value="models">{personal ? '模型限流' : '模型权限'}</TabsTrigger>
          {view === 'detail' && <TabsTrigger value="keys">API Key</TabsTrigger>}
          <TabsTrigger value="settings">{personal ? '预算与日志' : '基本信息与预算'}</TabsTrigger>
          <TabsTrigger value="routes">项目分流</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><ProjectOverview tenant={tenant} project={project} department={personal ? '' : department(project)}
          openTab={openTab} onNavigate={(page, params) => onNavigate(project, page, params)} /></TabsContent>
        {!personal && <TabsContent value="members"><ProjectMembers tenant={tenant} project={project} /></TabsContent>}
        <TabsContent value="models"><ProjectModels tenant={tenant} project={project} onExperience={service => onExperience(project, service)} /></TabsContent>
        <TabsContent value="keys">{renderKeys(project, () => openTab('models'), () => {
          openTab('settings');
          requestAnimationFrame(() => document.getElementById('project-audit')?.scrollIntoView({ block:'start' }));
        })}</TabsContent>
        <TabsContent value="routes"><ProjectRoutes tenant={tenant} projectId={project.id} /></TabsContent>
        <TabsContent value="settings"><ProjectSettings tenant={tenant} project={project} onList={onList} /></TabsContent>
      </Tabs>}
    </div>;
  }

  return <div className="project-workspace">
    <FrontPageHeader title="项目管理" description={spaceName} icon={FolderKanban} actions={canCreateProject &&
      <Button onClick={() => {
        setError('');
        setDraft({name:'', description:'', departmentId:'', revision:tenant.revision, identityKey:identity.key});
      }}>新建项目</Button>} />
    {projectId && <p role="status">该项目在当前空间不可访问。</p>}
    <section className="project-panel" aria-label="项目列表">
      <div className="project-filters">
        <Input aria-label="搜索项目" placeholder="搜索项目名称或 ID" value={query} onChange={event => setQuery(event.target.value)} />
        <select aria-label="项目状态" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">全部状态</option>
          {[...new Set(projects.map(row => row.status))].map(value => <option key={value}>{value}</option>)}
        </select>
      </div>
      {visible.length ? <div className="project-table-scroll" tabIndex={0} aria-label="项目列表">
        <table><thead><tr><th scope="col">项目名称</th>{!personal && <th scope="col">主责部门</th>}<th scope="col">状态</th><th scope="col">创建时间</th></tr></thead>
          <tbody>{visible.map(row => <tr key={row.id}>
            <td><Button variant="link" onClick={() => onOpen(row)}>{row.name}</Button><small>{row.id}</small></td>
            {!personal && <td>{department(row)}</td>}<td>{row.status}</td><td>{projectTime(row.createdAt)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="project-empty">{projects.length ? '没有匹配的项目' : canCreateProject ? '暂无项目，可以新建项目' : '暂无可访问的项目，请联系企业管理员'}</p>}
    </section>
    <Dialog open={Boolean(draft)} onOpenChange={open => { if (!open && !creating) setDraft(null); }}>
      {draft && <DialogContent>
        <DialogHeader><DialogTitle>新建项目</DialogTitle><DialogDescription>所属空间 · {spaceName}</DialogDescription></DialogHeader>
        <form className="project-form" onSubmit={create}>
          <ProjectFields tenant={tenant} value={draft} setValue={setDraft} />
          {error && <p role="alert">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={creating} onClick={() => setDraft(null)}>取消</Button><Button type="submit" disabled={creating}>创建</Button></DialogFooter>
        </form>
      </DialogContent>}
    </Dialog>
  </div>;
}
