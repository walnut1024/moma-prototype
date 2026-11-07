import AdminStatus from './AdminStatus';
import { useMemo, useState } from 'react';
import { Banner, Button, Card, Form, Input, Modal, Progress, Space, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import { FilterToolbar, FilterReset } from '../components/FilterControls';
import AdminPageHeading from './AdminPageHeading';
import AnalysisMetric from './AnalysisMetric';
import { MultiPick } from './AnalyticsFilters';
import { Choice } from './ServiceUI';
import { deploymentSeries, deploymentSummary } from './observability';
import './semi-inference.css';

export { default as ModelDeployments } from './DeploymentManagement';

const { Text, Title, Paragraph } = Typography;
const gpuTypes = ['H20', 'L40S', 'A800'].map(value => ({ value, label: value }));
const monitorMetrics = [
  ['GPU 利用率', 'GPU 利用率'], ['请求吞吐', '请求吞吐'], ['P95 延迟', 'P95 延迟'],
];

export function ClusterManagement({ state, dispatch }) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const rows = state.clusters.filter(item => `${item.name} ${item.clusterId} ${item.zone}`.toLowerCase().includes(query.toLowerCase()));
  const save = values => {
    const totalGpu = Number(values.totalGpu), nodes = Number(values.nodes);
    if (!values.clusterId || !values.name || !Number.isInteger(totalGpu) || totalGpu < 1) {
      setError('请填写唯一 Cluster ID、集群名称和正整数 GPU 数量');
      return;
    }
    if (!Number.isInteger(nodes) || nodes < 1) {
      setError('节点数量必须为正整数');
      return;
    }
    if (state.clusters.some(item => item.clusterId === values.clusterId)) {
      setError('Cluster ID 已存在');
      return;
    }
    if (dispatch({ type: 'add', collection: 'clusters', record: {
      id: `cluster-${Date.now()}`, ...values, totalGpu, allocatedGpu: 0, nodes, status: '运行中',
    } })) setCreating(false);
  };
  return <div className="admin-page-stack">
    <AdminPageHeading title="集群纳管" description="统一纳管自有推理集群，查看节点、GPU 容量和部署占用。">
      <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} onClick={() => { setError(''); setCreating(true); }}>纳管集群</Button>
    </AdminPageHeading>
    <div className="admin-analysis-metrics admin-analysis-metrics-three">
      <AnalysisMetric title="GPU 总量" value={state.clusters.reduce((sum, item) => sum + item.totalGpu, 0)}/>
      <AnalysisMetric title="已分配 GPU" value={state.clusters.reduce((sum, item) => sum + item.allocatedGpu, 0)}/>
      <AnalysisMetric title="运行集群" value={state.clusters.filter(item => item.status === '运行中').length}/>
    </div>
    <Card>
      <div className="admin-list-toolbar" role="group" aria-label="集群筛选">
        <Input className="admin-list-search" prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索集群" value={query}
          onChange={setQuery} placeholder="搜索 Cluster ID、名称或可用区"/>
        <FilterReset onClick={() => setQuery('')}/>
        <Text type="secondary">共 {rows.length} 个集群</Text>
      </div>
      <div className="admin-cluster-grid">
        {rows.map(item => {
          const usage = item.totalGpu > 0 ? Math.round(item.allocatedGpu / item.totalGpu * 100) : null;
          const maintenance = item.status === '维护中';
          const facts = [['可用区', item.zone], ['GPU 型号', item.gpuType], ['节点', item.nodes], ['GPU 容量', `${item.allocatedGpu} / ${item.totalGpu}`]];
          return <Card key={item.id} title={<div><Title heading={5} component="h2">{item.name}</Title><Text size="small" type="tertiary">{item.clusterId}</Text></div>}
            headerExtraContent={<AdminStatus value={item.status}/>}>
            <div className="admin-analytics-fields">
              <dl className="admin-analysis-detail-fields">{facts.map(([label, value]) => <div key={label}>
                <dt><Text type="tertiary">{label}</Text></dt><dd><Text>{value ?? '—'}</Text></dd>
              </div>)}</dl>
              <div>
                <Space><Text type="secondary">资源占用</Text><Text strong>{usage == null ? '—' : `${usage}%`}</Text></Space>
                {usage != null && <Progress percent={Math.max(0, Math.min(100, usage))} aria-label="资源占用"/>}
              </div>
              <div className="admin-analysis-filter-row">
                <Button theme="borderless" size="small" onClick={() => dispatch({
                  type: 'update', collection: 'clusters', id: item.id, changes: { status: maintenance ? '运行中' : '维护中' },
                })}>{maintenance ? '恢复服务' : '进入维护'}</Button>
                <Text type="secondary" size="small">{state.deployments.filter(deploy => deploy.clusterId === item.id).length} 个部署</Text>
              </div>
            </div>
          </Card>;
        })}
      </div>
      {!rows.length && <Paragraph type="secondary">{query ? '没有符合筛选条件的集群' : '暂无纳管集群'}</Paragraph>}
    </Card>
    {creating && <Modal visible title="纳管推理集群" width="min(480px, calc(100vw - 32px))" closeOnEsc maskClosable={false}
      footer={null} onCancel={() => setCreating(false)}>
      <Form initValues={{ zone: '南京', gpuType: 'H20', totalGpu: 8, nodes: 1 }} onSubmit={save} onValueChange={() => setError('')}>
        <Form.Input field="clusterId" label="Cluster ID" placeholder="例如 inference-nj-b"/>
        <Form.Input field="name" label="集群名称" placeholder="请输入集群名称"/>
        <Form.Input field="zone" label="可用区"/>
        <Form.Select motion={false} field="gpuType" label="GPU 型号" optionList={gpuTypes}/>
        <Form.InputNumber field="totalGpu" label="GPU 总量"/>
        <Form.InputNumber field="nodes" label="节点数量"/>
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
        <div className="admin-form-actions">
          <Button onClick={() => setCreating(false)}>取消</Button>
          <Button htmlType="submit" theme="solid">确认纳管</Button>
        </div>
      </Form>
    </Modal>}
  </div>;
}

function ObservabilityChart({ deployments, metric }) {
  const hours = Array.from({ length: 13 }, (_, index) => `${String(index * 2).padStart(2, '0')}:00`);
  return <TimeSeriesChart labels={hours} series={deployments.map(item => ({ label: item.name, values: deploymentSeries(item, metric) }))}
    height={250} label={metric} unit={metric === 'GPU 利用率' ? '%' : metric === 'P95 延迟' ? 'ms' : ''}/>;
}

export function ModelObservability({ state }) {
  const running = state.deployments.filter(item => item.status !== '停止');
  const [selected, setSelected] = useState(() => running.map(item => item.id));
  const [metric, setMetric] = useState('GPU 利用率');
  const visible = useMemo(() => running.filter(item => selected.includes(item.id)), [running, selected]);
  const summary = deploymentSummary(visible);
  return <div className="admin-page-stack">
    <AdminPageHeading title="生产观测" description="按部署实例对比资源与推理性能，图表每个部署对应独立序列。"/>
    <Card>
      <FilterToolbar>
        <Choice label="监控指标" value={metric} options={monitorMetrics} onSelect={setMetric}/>
        <MultiPick label="部署实例" value={selected} onChange={value => setSelected(value ?? running.map(item => item.id))}
          items={running.map(item => ({ id: item.id, name: item.deploymentId, searchText: item.name }))}/>
        <FilterReset onClick={() => { setMetric('GPU 利用率'); setSelected(running.map(item => item.id)); }}/>
        <Text type="secondary">近 24 小时 · {visible.length} 个部署</Text>
      </FilterToolbar>
    </Card>
    <div className="admin-analysis-metrics admin-analysis-metrics-three">
      <AnalysisMetric title="平均 GPU 利用率" value={summary.gpu == null ? '—' : summary.gpu.toFixed(1) + '%'}/>
      <AnalysisMetric title="总吞吐" value={summary.throughput == null ? '—' : summary.throughput.toFixed(1)} unit={summary.throughput == null ? undefined : 'req/s'}/>
      <AnalysisMetric title="P95 延迟" value={summary.p95 == null ? '—' : summary.p95} unit={summary.p95 == null ? undefined : 'ms'}/>
    </div>
    <Card title={<Title heading={5} component="h2">{metric}趋势</Title>}
      headerExtraContent={<Text size="small" type="secondary">近 24 小时 · {visible.length} 个部署 · 监测记录</Text>}>
      {visible.length ? <ObservabilityChart deployments={visible} metric={metric}/> :
        <Paragraph className="admin-inference-empty" type="secondary">请选择至少一个部署</Paragraph>}
    </Card>
  </div>;
}
