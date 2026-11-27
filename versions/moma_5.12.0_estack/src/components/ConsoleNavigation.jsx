import { useId, useState } from 'react';
import { Button, Select, Tooltip } from '@douyinfe/semi-ui';
import { ArrowLeftRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { consoleNavigation } from '../console-navigation.mjs';

export default function ConsoleNavigation({ personal, internal, canManage, canManageOrganization, projectId, projects, enabled, groups: suppliedGroups,
  onProjectChange, active, navigate, icons, showProjectPicker = !personal,
  heading = '控制台', headingAction, collapseLabels = ['收起侧栏','展开侧栏'] }) {
  const groups = suppliedGroups || consoleNavigation({personal,internal,canManage,canManageOrganization});
  const id = useId();
  const [collapsed, setCollapsed] = useState(false);
  const toggleLabel = collapseLabels[Number(collapsed)];
  const projectOptions = projects.map(row=>({value:row.id,label:row.name}));
  const currentProject = projects.find(row => row.id === projectId);
  const entries = groups.flatMap(group=>group.items || [group.label]);
  const item = label => {
    const Icon = icons[label];
    return <Tooltip key={label} condition={collapsed} content={label} position="right" clickToHide closeOnEsc>
      <Button theme="borderless" type="tertiary" className={'console-nav-link' + (active === label ? ' active' : '')}
        aria-label={label} aria-current={active === label ? 'page' : undefined}
        icon={Icon && <Icon size={17} strokeWidth={1.8} aria-hidden="true"/>} onClick={()=>navigate(label)}>
        {!collapsed && label}
      </Button>
    </Tooltip>;
  };
  return <aside className="tenant-nav" data-collapsed={collapsed} role="none">
    <nav className="console-nav-scroll" aria-label="用户面导航">
      {!collapsed && <div className="console-nav-heading">{heading}{headingAction}</div>}
      <div id={id+'-desktop'} className="console-nav-groups">
        {groups.map(group=>{
          if (!group.items) return item(group.label);
          return <div className="console-nav-group" key={group.id} data-scope={group.scope}
            role={group.label ? 'group' : undefined} aria-labelledby={group.label ? id+'-'+group.id : undefined}>
            {group.label && <div id={id+'-'+group.id} className="console-nav-section-title">{group.label}</div>}
            {group.items.map(item)}
            {group.id==='public' && showProjectPicker && <div className="console-project-context">
              <span id={id+'-project'} className={collapsed ? 'sr-only' : undefined}>当前项目</span>
              <Select className="project-picker" aria-labelledby={id+'-project'}
                aria-describedby={collapsed && currentProject ? id+'-project-name' : undefined}
                value={projectId || undefined} placeholder="选择项目" disabled={!enabled || !projects.length}
                onChange={onProjectChange} optionList={projectOptions} dropdownMatchSelectWidth={!collapsed}
                dropdownStyle={collapsed ? {minWidth:192} : undefined}
                prefix={collapsed ? <span title={currentProject ? `当前项目：${currentProject.name}` : '选择项目'}><ArrowLeftRight size={16} aria-hidden="true"/></span> : undefined}/>
              {collapsed && currentProject && <span id={id+'-project-name'} className="sr-only">{currentProject.name}</span>}
            </div>}
          </div>;
        })}
      </div>
      <div className="tenant-nav-mobile">
        <span id={id+'-page'} className="sr-only">切换页面</span>
        <Select aria-labelledby={id+'-page'} value={entries.includes(active) ? active : undefined} placeholder="切换页面"
          onChange={navigate} optionList={groups.flatMap(group=>(group.items || [group.label]).map(label=>({value:label,label:group.items && group.label ? group.label+' / '+label : label})))}/>
        {showProjectPicker && <><span id={id+'-mobile-project'} className="sr-only">当前项目</span>
          <Select aria-labelledby={id+'-mobile-project'} value={projectId || undefined} placeholder="选择项目"
            disabled={!enabled || !projects.length} onChange={onProjectChange} optionList={projectOptions}/></>}
      </div>
    </nav>
    <div className="console-nav-footer">
      <Tooltip content={toggleLabel} position={collapsed ? 'right' : 'top'} clickToHide closeOnEsc>
        <Button className="console-nav-toggle" type="tertiary" theme="borderless" aria-label={toggleLabel}
          aria-expanded={!collapsed} aria-controls={id+'-desktop'} onClick={()=>setCollapsed(value=>!value)}
          icon={collapsed ? <PanelLeftOpen size={17} aria-hidden="true"/> : <PanelLeftClose size={17} aria-hidden="true"/>}/>
      </Tooltip>
    </div>
  </aside>;
}
