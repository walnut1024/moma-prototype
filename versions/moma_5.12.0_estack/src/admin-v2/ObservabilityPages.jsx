import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { useState } from 'react';
import { Button, Card, Descriptions, Space, Timeline, Typography } from '@douyinfe/semi-ui';
import OperationInputDialog from '../components/OperationInputDialog';
import AdminPageHeading from './AdminPageHeading';
import AnalysisMetric from './AnalysisMetric';
import { Choice } from './ServiceUI';
import { beijingTime as stamp, groupRequests, percentile } from './observability';
import CallLogsPage from './CallLogsPage';
import ServiceMonitoringPage from './ServiceMonitoringPage';
import './semi-observability.css';

const { Text, Title } = Typography;

const actionTime = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

export function Alerts({ state, dispatch, navigate }) {
  const update = (item, status) => dispatch({ type: 'update', collection: 'alerts', id: item.id,
    changes: { status, timeline: [...item.timeline, `${actionTime()} ${status}`] } });
  const incident = item => {
    if (state.incidents.some(row => row.alertIds.includes(item.id))) return navigate('incidents');
    const now = Date.now();
    const changes = [
      { type: 'update', collection: 'alerts', id: item.id, changes: { status: '已转事件' } },
      { type: 'add', collection: 'incidents', record: { id: `incident-${now}`, incidentId: `INC-${now}`, title: item.title,
        alertIds: [item.id], impact: '待评估', assignee: item.assignee, resolution: '', status: '处理中', timeline: ['由告警转入事件'] } },
    ];
    if (dispatch({ type: 'batch', objectId: item.id, changes })) navigate('incidents');
  };
  return <div className="admin-page-stack">
    <AdminPageHeading title="告警管理" description="确认、指派、恢复告警，并把需要协同的问题转入事件处理。"/>
    <div className="admin-observe-metrics">
      <AnalysisMetric title="活跃告警" value={state.alerts.filter(row => !['已恢复', '已转事件'].includes(row.status)).length}/>
      <AnalysisMetric title="高等级" value={state.alerts.filter(row => row.severity === '高').length}/>
      <AnalysisMetric title="告警规则" value={6}><Text type="secondary">4 条已启用</Text></AnalysisMetric>
    </div>
    <Card>
      <Table size="small" rowKey="id" pagination={false} dataSource={state.alerts} scroll={{ x: 'max(100%, 880px)' }} columns={[
        { title: '告警', dataIndex: 'title' },
        { title: '级别', dataIndex: 'severity', render: value => <AdminStatus value={value}/> },
        { title: '对象', dataIndex: 'objectId' },
        { title: '负责人', dataIndex: 'assignee', render: (value, row) =>
          <Choice size="small" label={`告警 ${row.id} 的处理人`} value={value}
            options={['运维人员', '平台管理员', '安全管理员'].map(name => [name, name])}
            onChange={assignee => dispatch({ type: 'update', collection: 'alerts', id: row.id, changes: { assignee } })}/> },
        { title: '状态', dataIndex: 'status', render: value => <AdminStatus value={value}/> },
        { title: '触发时间', dataIndex: 'startedAt', render: stamp },
        { title: '操作', render: (_, row) => <Space spacing={4}>
          {row.status === '待确认' && <Button theme="borderless" size="small" onClick={() => update(row, '处理中')}>确认</Button>}
          <Button theme="borderless" size="small" onClick={() => incident(row)}>转事件</Button>
          {row.status !== '已恢复' && <Button theme="borderless" size="small" onClick={() => update(row, '已恢复')}>恢复</Button>}
        </Space> },
      ]}/>
    </Card>
  </div>;
}

export function Incidents({ state, dispatch }) {
  const [closing, setClosing] = useState(null);
  const act = (item, status, resolution = item.resolution) => dispatch({ type: 'update', collection: 'incidents', id: item.id,
    changes: { status, resolution, timeline: [...(item.timeline ?? []), `${actionTime()} ${status}`] } });
  const closeIncident = resolution => {
    const item = state.incidents.find(row => row.id === closing.id);
    if (!item || item.status !== '已恢复') throw new Error('事件状态已变化，请重新打开操作');
    return act(item, '已关闭', resolution);
  };
  return <div className="admin-page-stack">
    <AdminPageHeading title="事件处理" description="协同处理服务故障；恢复服务与复盘关闭是两个独立阶段。"/>
    <div className="admin-analysis-plot-grid">
      {state.incidents.map(row => <Card key={row.id} title={<Title heading={5} component="h2">{row.title}</Title>}
        headerExtraContent={<AdminStatus value={row.status}/>}>
        <div className="admin-analytics-fields">
          <Text code>{row.incidentId}</Text>
          <Descriptions data={[
            { key: '影响', value: row.impact },
            { key: '负责人', value: row.assignee },
            { key: '关联告警', value: row.alertIds.length },
            ...(row.resolution ? [{ key: '复盘结论', value: row.resolution }] : []),
          ]}/>
          <Timeline>
            {row.timeline.map((line, index) => <Timeline.Item key={index}>{line}</Timeline.Item>)}
          </Timeline>
        </div>
        {row.status === '处理中' && <div className="admin-form-actions"><Button onClick={() => act(row, '已恢复')}>标记恢复</Button></div>}
        {row.status === '已恢复' && <div className="admin-form-actions"><Button theme="solid" onClick={() => setClosing(row)}>填写结论并关闭</Button></div>}
      </Card>)}
    </div>
    {closing && <OperationInputDialog title="关闭事件" description={closing.title} label="复盘结论"
      onSubmit={closeIncident} onClose={() => setClosing(null)}/>}
  </div>;
}

export function Sla({ state }) {
  const rows = groupRequests(state.requests, 'modelId').map(group => {
    const count = group.requests.length;
    const available = group.requests.filter(row => row.httpStatus < 400).length / count * 100;
    const durations = group.requests.map(row => row.durationMs);
    return {
      id: group.key, model: state.models.find(model => model.id === group.key)?.modelId, count, available,
      p50: percentile(durations, .5), p95: percentile(durations, .95),
      incidents: state.incidents.filter(row => row.title.includes(state.models.find(model => model.id === group.key)?.name.split('-')[0])).length,
    };
  });
  return <div className="admin-page-stack">
    <AdminPageHeading title="服务质量报告" description="基于请求样本计算可用率和延迟分位数，并关联故障事件。"/>
    <Card>
      <Table size="small" rowKey="id" pagination={false} dataSource={rows} scroll={{ x: 'max(100%, 840px)' }} columns={[
        { title: 'Model ID', dataIndex: 'model' },
        { title: '样本数', dataIndex: 'count', align: 'right' },
        { title: '可用率', dataIndex: 'available', align: 'right', render: value => `${value.toFixed(2)}%` },
        { title: 'P50 延迟', dataIndex: 'p50', align: 'right', render: value => `${value} ms` },
        { title: 'P95 延迟', dataIndex: 'p95', align: 'right', render: value => `${value} ms` },
        { title: '故障事件', dataIndex: 'incidents', align: 'right' },
        { title: 'SLA 目标', align: 'right', render: () => '≥ 99.00%' },
        { title: '结果', render: (_, row) => <AdminStatus value={row.available >= 99 ? '达标' : '未达标'}/> },
      ]}/>
    </Card>
  </div>;
}

const pages = { monitoring: ServiceMonitoringPage, logs: CallLogsPage, alerts: Alerts, incidents: Incidents, sla: Sla };
export default function ObservabilityPage({ pageId, params, ...props }) {
  const Page = pages[pageId];
  return <Page key={params.toString()} params={params} {...props}/>;
}
