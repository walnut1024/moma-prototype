import { useState } from 'react';
import { FolderKanban } from 'lucide-react';
import { Button, Input, Modal, Select, Table, Tabs, Tag } from '@douyinfe/semi-ui';
import FrontPageHeader from './FrontPageHeader';
import { projectModelEnabled } from '../project-access.mjs';
import { departmentPath } from '../organization-data.mjs';
import ProjectOverview from './ProjectOverview';
import { ProjectFields, ProjectMembers, ProjectModels, ProjectSettings, projectTime } from './ProjectConfiguration';
import './project-workspace.css';

export default function ProjectWorkspace({ tenant, projectId, onOpen, onList, onExperience, onNavigate, view = 'overview', initialTab, renderRoutes }) {
  const { identity, projects, organization, canCreateProject } = tenant;
  const [section, setSection] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const personal = identity?.spaceId === 'personal';
  const spaceName = personal ? '个人空间' : identity?.tenantName;
  const project = projects.find(row => row.id === projectId);
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
    <FrontPageHeader title="项目管理" icon={FolderKanban} />
    <div className="project-panel project-empty">
      {tenant.error ? <><p role="alert">{tenant.error}</p><Button onClick={tenant.reload}>重试</Button></>
        : <p role="status">正在加载项目…</p>}
    </div>
  </div>;

  if (project) {
    const tab = section?.id === project.id && section.view === view && section.initialTab === initialTab ? section.tab : initialTab || 'models';
    const openTab = value => {
      if (value === 'keys') onNavigate(project,'keys');
      else if (view === 'overview') onNavigate(project,'settings',{view:value});
      else setSection({id:project.id,view,initialTab,tab:value});
    };
    const experience = tenant.projectServices.find(row => row.callable && projectModelEnabled(project,row.modelKey));
    return <div className="project-workspace">
      {!personal && <nav aria-label="项目面包屑"><Button theme="borderless" onClick={onList}>项目列表</Button><span aria-hidden="true"> / </span><span>{project.name}</span></nav>}
      <FrontPageHeader title={view === 'overview' ? personal ? '概览' : '项目概览' : personal ? '使用设置' : '项目设置'} description={[spaceName, project.description].filter(Boolean).join(' · ')} icon={FolderKanban}
        actions={project.status === '正常' && <Button theme="solid" onClick={() => experience ? onExperience(project,experience) : openTab('models')}>在线体验</Button>} />
      {view === 'overview' ? <ProjectOverview tenant={tenant} project={project} department={personal ? '' : department(project)}
        openTab={openTab} onNavigate={(page,params) => onNavigate(project,page,params)} /> : <Tabs key={project.id} className="project-tabs" aria-label="项目详情" activeKey={tab} onChange={openTab} keepDOM={false} tabPaneMotion={false}>
        {!personal && <Tabs.TabPane itemKey="members" tab="成员"><ProjectMembers tenant={tenant} project={project} /></Tabs.TabPane>}
        <Tabs.TabPane itemKey="models" tab={personal ? "模型限流" : "模型权限"}><ProjectModels tenant={tenant} project={project} onExperience={service => onExperience(project, service)} /></Tabs.TabPane>
        <Tabs.TabPane itemKey="settings" tab="预算与日志"><ProjectSettings tenant={tenant} project={project} onList={onList} /></Tabs.TabPane>
        <Tabs.TabPane itemKey="routes" tab="项目分流">{renderRoutes?.(project)}</Tabs.TabPane>
      </Tabs>}
    </div>;
  }

  const columns = [
    { title:'项目名称', render:(_, row) => <><Button theme="borderless" onClick={() => onOpen(row)}>{row.name}</Button><small>{row.id}</small></> },
    ...(!personal ? [{ title:'主责部门', render:(_, row) => department(row) }] : []),
    { title:'状态', dataIndex:'status', render:value => <Tag color={value === '正常' ? 'green' : 'grey'}>{value}</Tag> },
    { title:'创建时间', dataIndex:'createdAt', render:projectTime },
  ];
  return <div className="project-workspace">
    <FrontPageHeader title="项目管理" description={spaceName} icon={FolderKanban} actions={canCreateProject &&
      <Button theme="solid" onClick={() => {
        setError('');
        setDraft({name:'', description:'', departmentId:'', revision:tenant.revision, identityKey:identity.key});
      }}>新建项目</Button>} />
    {projectId && <p role="status">该项目在当前空间不可访问。</p>}
    <section className="project-panel" aria-label="项目列表">
      <div className="project-filters">
        <Input className="project-search" aria-label="搜索项目" placeholder="搜索项目名称或 ID" value={query} onChange={setQuery} />
        <Select aria-label="项目状态" value={status} onChange={setStatus}
          optionList={[{ value:'', label:'全部状态' }, ...[...new Set(projects.map(row => row.status))].map(value => ({ value, label:value }))]} />
      </div>
      <Table rowKey="id" columns={columns} dataSource={visible} pagination={false} size="small" scroll={{x:500}}
        empty={projects.length ? '没有匹配的项目' : canCreateProject ? '暂无项目，可以新建项目' : '暂无可访问的项目，请联系企业管理员'} />
    </section>
    <Modal visible={Boolean(draft)} title="新建项目" footer={null} maskClosable={false} closeOnEsc={!creating}
      closable={!creating} onCancel={() => setDraft(null)} className="project-modal">
      {draft && <>
        <p className="project-muted">所属空间 · {spaceName}</p>
        <form className="project-form" onSubmit={create} onInvalid={event => { event.preventDefault(); setError('请填写项目名称'); event.target.focus(); }}>
          <ProjectFields tenant={tenant} value={draft} setValue={setDraft} />
          {error && <p role="alert">{error}</p>}
          <div className="project-dialog-actions"><Button disabled={creating} onClick={() => setDraft(null)}>取消</Button><Button htmlType="submit" theme="solid" loading={creating}>创建</Button></div>
        </form>
      </>}
    </Modal>
  </div>;
}
