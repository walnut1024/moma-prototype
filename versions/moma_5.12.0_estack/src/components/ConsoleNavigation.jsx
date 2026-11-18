import { useId } from 'react';
import { Button, Select } from '@douyinfe/semi-ui';
import { consoleNavigation } from '../console-navigation.mjs';

export default function ConsoleNavigation({ personal, internal, canManage, spaceName, projectId, projects, enabled,
  onProjectChange, active, navigate, icons }) {
  const groups = consoleNavigation({personal,internal,canManage});
  const id = useId();
  const projectOptions = projects.map(row=>({value:row.id,label:row.name}));
  const entries = groups.flatMap(group=>group.items || [group.label]);
  const item = label => {
    const Icon = icons[label];
    return <Button key={label} theme="borderless" type="tertiary"
      className={'console-nav-link' + (active === label ? ' active' : '')}
      aria-current={active === label ? 'page' : undefined} icon={Icon && <Icon size={20} strokeWidth={1.8} aria-hidden="true"/>}
      onClick={()=>navigate(label)}>{label}</Button>;
  };
  return <aside className="tenant-nav" role="navigation" aria-label="用户面导航">
    <div className="console-nav-context">
      <span className="console-space-name" aria-label="当前空间" title={spaceName}>{spaceName}</span>

    </div>
    <div className="console-nav-groups">
      {groups.map(group=>{
        if (!group.items) return item(group.label);
        return <div className="console-nav-group" key={group.id} data-scope={group.scope || 'space'} role="group" aria-labelledby={group.label ? id+'-'+group.id : undefined}>
          {group.id==='experience' && <><div className="console-nav-section-title">模型使用</div>      {!personal && <div className="tenant-project-switch console-project-context">
        <span id={id+'-project'}>当前项目</span>
        <Select className="project-picker" aria-labelledby={id+'-project'} value={projectId || undefined}
          placeholder="选择项目" disabled={!enabled || !projects.length} onChange={onProjectChange} optionList={projectOptions}/>
      </div>}</>}
          {group.label && <div id={id+'-'+group.id} className="console-nav-section-title" role="heading" aria-level={2}>{group.label}</div>}
          <div>{group.items.map(label=>item(label))}</div>
        </div>;
      })}
    </div>
    <div className="tenant-nav-mobile">
      {!personal && <><span id={id+'-mobile-project'} className="sr-only">当前项目</span>
        <Select aria-labelledby={id+'-mobile-project'} value={projectId || undefined} placeholder="选择项目"
          disabled={!enabled || !projects.length} onChange={onProjectChange} optionList={projectOptions}/></>}
      <span id={id+'-page'} className="sr-only">切换页面</span>
      <Select aria-labelledby={id+'-page'} value={entries.includes(active) ? active : undefined} placeholder="切换页面"
        onChange={navigate} optionList={groups.flatMap(group=>(group.items || [group.label]).map(label=>({value:label,label:group.items && group.label ? group.label+' / '+label : label})))}/>
    </div>
  </aside>;
}
