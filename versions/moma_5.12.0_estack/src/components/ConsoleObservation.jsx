import { Tabs } from '@douyinfe/semi-ui';
import UsageStatistics from './UsageStatistics';
import CallLogs from '../CallLogs';

export default function ConsoleObservation({ project, projectScope, view = 'usage', onView, internal }) {
  if (!project) return <div className="project-workspace"><p role="status">请先选择可访问的项目。</p></div>;
  const scope = { ...projectScope, id:project.id };
  return <div className="console-observation">
    <Tabs activeKey={view} onChange={onView} tabList={[
      { itemKey:'usage', tab:'用量统计' }, { itemKey:'performance', tab:'运行表现' }, { itemKey:'logs', tab:'调用日志' },
    ]} />
    {view === 'logs' ? <CallLogs projectId={project.id} requestId={projectScope.requestId} />
      : <UsageStatistics projectScope={scope} observation={view === 'performance'} internal={internal} />}
  </div>;
}
