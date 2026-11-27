import { useEffect, useState } from 'react';
import { Button, ConfigProvider, Modal, Select } from '@douyinfe/semi-ui';
import zhCN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN.js';
import enUS from '@douyinfe/semi-ui/lib/es/locale/source/en_US.js';
import { ArrowDownToLine, Calculator, Languages } from 'lucide-react';
import ConsoleNavigation from './components/ConsoleNavigation';
import { RoleDemoHome, RoleDemoProjects } from './components/RoleDemoOverview';
import { RoleDemoPage } from './components/RoleDemoPages';
import { RoleDemoTools } from './components/RoleDemoTools';
import { DEMO_ACTORS, roleDemoWorkspace } from './role-demo-data.mjs';
import { roleDemoLabels, roleDemoNavigation, roleDemoPage } from './role-demo-navigation.mjs';

const customerTypes = [{value:'personal',label:'个人客户'},{value:'enterprise',label:'企业客户'}];
const enterpriseRoles = Object.entries(DEMO_ACTORS).filter(([id])=>id!=='personal')
  .map(([value,{name,note}])=>({value,label:name+' · '+note}));
const tools = new Set(['smart-route','model-ranking','token-calculator','tool-connection']);
const experience = new Set(['text','image','video','voice']);

function readSelection() {
  const params = new URLSearchParams(location.search);
  return {
    actor:params.get('role'), projectId:params.get('demoProject'), page:params.get('view'),
    tab:params.get('detailTab') || '', requestId:params.get('requestId') || '',
  };
}

function relativePage(workspace, page, selection) {
  const query = new URLSearchParams({demo:'roles',role:workspace.actorId,view:page});
  if (workspace.project && !workspace.personal) query.set('demoProject',workspace.project.id);
  if (['projects','model-order'].includes(page) && selection.tab) query.set('detailTab',selection.tab);
  if (page==='call-logs' && selection.requestId) query.set('requestId',selection.requestId);
  return '?' + query;
}

export default function RoleDemo({icons}) {
  const [selection, setSelection] = useState(readSelection);
  const [english, setEnglish] = useState(false);
  const [guide, setGuide] = useState(false);
  const workspace = roleDemoWorkspace(selection.actor,selection.projectId);
  const {actorId, personal, project, projects} = workspace;
  const page = roleDemoPage(workspace,selection.page,selection.tab);
  const projectId = project.id;
  const language = Number(english);
  const translate = id => roleDemoLabels[id][language];
  const groups = roleDemoNavigation(workspace).map(({id,labels,items})=>({
    id,label:labels[language],items:items.map(translate),
  }));
  const translatedIcons = {
    ...Object.fromEntries(Object.entries(roleDemoLabels).map(([id,labels])=>[translate(id),icons[labels[0]]])),
    [translate('api-keys')]:icons['API 密钥'],
    [translate('model-ranking')]:icons['模型排行'],
    [translate('token-calculator')]:Calculator,
  };
  const pageForLabel = Object.fromEntries(Object.keys(roleDemoLabels).map(id=>[translate(id),id]));
  const currentUrl = relativePage(workspace,page,selection);
  useEffect(() => {
    if (currentUrl !== location.search) history.replaceState(history.state,'',currentUrl);
  }, [currentUrl]);
  useEffect(() => {
    const title = document.title;
    document.title = 'MoMA-XA · 雄安租户控制台';
    return () => { document.title = title; };
  }, []);
  useEffect(() => {
    const update = () => setSelection(readSelection());
    addEventListener('popstate',update);
    return () => removeEventListener('popstate',update);
  }, []);

  function update(next,replace = false) {
    const nextWorkspace = roleDemoWorkspace(next.actor,next.projectId);
    const nextPage = roleDemoPage(nextWorkspace,next.page,next.tab);
    const url = relativePage(nextWorkspace,nextPage,next);
    if (url!==location.search) history[replace ? 'replaceState' : 'pushState'](null,'',url);
    setSelection(next);
  }

  function selectRole(actor) {
    update({actor,projectId,page},true);
  }
  function selectProject(id) {
    update({...selection,actor:actorId,projectId:id},true);
  }
  function go(nextPage, detail = {}) {
    update({actor:actorId,projectId:detail.projectId || projectId,page:nextPage,tab:detail.tab,requestId:detail.requestId});
    window.scrollTo(0,0);
  }

  const languageButton = <Button className="role-demo-language" theme="borderless" type="tertiary"
    aria-label={english ? 'Switch to Chinese' : '切换为英文'}
    icon={<Languages size={16} aria-hidden="true"/>} onClick={()=>setEnglish(value=>!value)} />;
  return <ConfigProvider locale={english ? enUS : zhCN}>
    <div className="app-shell tenant-semi role-demo">
      <header className="tenant-banner role-demo-banner">
        <div className="brand-mark">
          <img src="/moma_5.12.0_estack/assets/xa-demo-logo.jpg" alt="" />
          <span>雄安国际TOKEN服务平台</span>
        </div>
        <div className="role-demo-mobile-language">{languageButton}</div>
        <div className="role-demo-controls">
          <div className="role-demo-control">
            <span id="role-demo-customer-label">客户类型</span>
            <Select size="small" aria-labelledby="role-demo-customer-label" optionList={customerTypes}
              value={personal ? 'personal' : 'enterprise'} onChange={value=>selectRole(value==='personal' ? value : 'tenantAdmin')} />
          </div>
          {!personal && <div className="role-demo-control">
            <span id="role-demo-identity-label">演示身份</span>
            <Select size="small" className="role-demo-identity-select" aria-labelledby="role-demo-identity-label" optionList={enterpriseRoles}
              dropdownMatchSelectWidth={false} dropdownStyle={{minWidth:'min(360px, 90vw)'}}
              value={actorId} onChange={selectRole} />
          </div>}
        </div>
      </header>
      <ConsoleNavigation personal={personal} groups={groups} projectId={projectId} projects={projects} enabled
        showProjectPicker={false} heading={english ? 'Console' : '控制台'} headingAction={languageButton}
        collapseLabels={english ? ['Collapse sidebar','Expand sidebar'] : ['收起导航','展开导航']}
        active={translate(page)} navigate={label=>go(pageForLabel[label])} icons={translatedIcons} />
      <main className="front-main">
        <div key={actorId+':'+projectId} className="role-demo-content">
          {experience.has(page) && !personal && projects.length>1 && <div className="role-demo-project-control">
            <span id="demo-experience-project-label">当前项目</span>
            <Select aria-labelledby="demo-experience-project-label" value={projectId} onChange={selectProject}
              optionList={projects.map(({id,name})=>({value:id,label:name}))}/>
          </div>}
          {page==='home' ? <RoleDemoHome workspace={workspace} onPage={go} onProjectChange={selectProject} english={english} />
            : page==='projects' ? <RoleDemoProjects workspace={workspace} onPage={go} onProjectChange={selectProject}
              key={selection.tab} initialProjectId={selection.tab ? projectId : undefined} initialTab={selection.tab} english={english} />
              : tools.has(page) ? <RoleDemoTools key={page} page={page} workspace={workspace} onPage={go} english={english} />
                : <RoleDemoPage key={page} page={page} workspace={workspace} onPage={go}
                  onProjectChange={selectProject} requestId={selection.requestId} tab={selection.tab} english={english} />}
        </div>
      </main>
      <Button className="role-demo-guide" theme="light" icon={<ArrowDownToLine size={14} aria-hidden="true"/>}
        onClick={()=>setGuide(true)}>{english ? 'User Guide' : '用户手册'}</Button>
      <Modal visible={guide} title={english ? 'User Guide' : '用户手册'} footer={null} onCancel={()=>setGuide(false)}>
        <ul className="role-demo-guide-list">
          <li>用顶栏切换个人客户、企业客户和演示身份。</li>
          <li>在首页或项目管理选择当前可访问的项目。</li>
          <li>用模型广场、API 密钥管理、用量统计和调用日志查看样例。</li>
          <li>模型体验提供文本生成、图片生成、视频生成和语音识别。</li>
        </ul>
        <a className="role-demo-exit" href="?page=home">返回用户控制台</a>
      </Modal>
    </div>
  </ConfigProvider>;
}
