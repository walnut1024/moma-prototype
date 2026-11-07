import AdminCollapsePanel from './AdminCollapsePanel';
import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Card, Collapse, Descriptions, Form, Input, Modal, Space, Steps, Table, Tabs, Tag, Timeline, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { FilterToolbar, FilterReset, PAGE_SIZES, normalizePageSize } from '../components/FilterControls';
import AdminPageHeading from './AdminPageHeading';
import { Choice, CopyId, serviceOperationsUi } from './ServiceUI';
import { canMutate } from './store';
import { DEPLOYABLE_TYPES, runnableArtifact, deploymentGpu, deploymentConfig, deploymentPreflight, deploymentTransaction } from './deployments';
import './deployment-management.css';

const { Paragraph, Text, Title } = Typography;
const inProgress = item => ['部署中', '扩缩容中', '更新中'].includes(item.status);
const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const blank = {
  name: '', deploymentId: '', modelId: '', runtimeId: '', weightId: '', weightPath: '', clusterId: '',
  namespace: 'inference', replicas: '1', gpuPerReplica: '1', tensorParallel: '1', pipelineParallel: '1',
  maxModelLen: '', gpuMemoryUtilization: '0.9', startupTimeout: '600',
};
const confirmTitles = { scale: '扩缩容', stop: '停止部署', start: '重新启动', check: '检查部署', rollback: '回滚配置' };
const confirmActions = { scale: '调整', stop: '停止', start: '启动', check: '检查', rollback: '回滚' };
const editorSteps = ['模型与运行环境', '资源与服务配置', '检查并部署'];
const confirmDetails = {
  stop: '停止后端点不可用，并释放该部署占用的 GPU。已保存的配置将保留。',
  start: '重新检查配置和可用资源，提交启动任务。原端点待服务就绪后恢复。',
  check: '根据当前集群、制品与配置检查部署任务，并更新就绪状态。失败时释放预留的 GPU。',
  rollback: '恢复上一版配置并重建服务，当前端点会暂时不可用。',
};
const primaryOperation = item => item.status === '运行中' ? 'scale' : inProgress(item) ? 'check' : 'start';

function Status({ value }) {
  const color = { 运行中: 'green', 失败: 'red', 停止: 'grey' }[value] || 'orange';
  return <Tag color={color}>{value}</Tag>;
}

function Facts({ values }) {
  return <Descriptions align="left" data={values.map(([key, value]) => ({ key, value: value ?? '—' }))}/>;
}

function ErrorNote({ message }) {
  return message && <Banner type="danger" closeIcon={null} description={message}/>;
}

function DeploymentEditor({ state, existing, can, run, go, dirty }) {
  const [values, setValues] = useState(() => existing ? {
    ...blank, ...deploymentConfig(existing), name: existing.name, deploymentId: existing.deploymentId,
    runtimeId: existing.runtimeId || '', weightId: existing.weightId || '', weightPath: existing.weightPath || '',
    namespace: existing.namespace || 'inference', tensorParallel: existing.tensorParallel || existing.gpuPerReplica,
    pipelineParallel: existing.pipelineParallel || 1, maxModelLen: existing.maxModelLen || '',
    gpuMemoryUtilization: existing.gpuMemoryUtilization ?? 0.9, startupTimeout: existing.startupTimeout || 600,
  } : blank);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [weightMode, setWeightMode] = useState(existing?.weightId ? 'artifact' : 'path');
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 600px)').matches);
  useEffect(() => {
    const media = matchMedia('(max-width: 600px)');
    const change = () => setNarrow(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [step]);
  const change = patch => {
    setValues(previous => ({ ...previous, ...patch }));
    setError('');
    dirty.current = true;
  };
  const models = state.models.filter(item => DEPLOYABLE_TYPES.includes(item.type));
  const model = models.find(item => item.id === values.modelId);
  const cluster = state.clusters.find(item => item.id === values.clusterId);
  const runtimes = state.artifacts.filter(item => runnableArtifact(item, '运行时镜像'));
  const weights = state.artifacts.filter(item => runnableArtifact(item, '模型制品'));
  const required = Number(values.replicas) * Number(values.gpuPerReplica);
  const available = cluster ? cluster.totalGpu - cluster.allocatedGpu + (existing ? deploymentGpu(existing) : 0) : null;
  let preflightError;
  try { deploymentPreflight(state, values, existing); }
  catch (issue) { preflightError = issue.message; }
  const submit = event => {
    event.preventDefault();
    if (step === 0) {
      if (!values.name.trim() || !values.deploymentId.trim() || !values.modelId || !values.runtimeId || !(values.weightId || values.weightPath.trim())) {
        setError('请先填写服务信息，选择模型与运行时，并指定模型权重');
        return;
      }
    } else if (preflightError) {
      setError(preflightError);
      return;
    }
    if (step < 2) {
      setStep(step + 1);
      setError('');
      return;
    }
    const result = run(existing ? 'update' : 'create', values, existing?.id);
    if (result) go({ view: null, deployment: existing?.id || result.audits[0].objectId, tab: 'overview' }, true);
    else setError('提交未完成，请根据操作反馈处理。当前输入已保留。');
  };

  const textField = (field, label, props = {}) => <Form.Slot label={label}>
    <Input aria-label={label} value={values[field]} onChange={value => change({ [field]: value })} disabled={!can} {...props}/>
  </Form.Slot>;
  const numberField = (field, label, props) => textField(field, label, { type: 'number', ...props });
  const selectField = (field, label, options, props = {}) => <Form.Slot label={label}>
    <Choice label={label} value={values[field] || undefined} placeholder={`请选择${label}`} disabled={!can} motion={false}
      options={options} onChange={value => change({ [field]: value })} {...props}/>
  </Form.Slot>;
  const artifactOptions = items => items.map(item => [item.id, `${item.name} · ${item.version}`]);
  return <>
    <AdminPageHeading title={existing ? '更新部署配置' : '部署模型'}
      description={existing ? '更新会重建服务并暂时停用端点，配置检查通过后重新启用。' : '选择模型和运行环境，检查资源后启动内部推理服务。'}/>
    <Card>
      <div aria-hidden="true" inert>
        <Steps type="basic" size="small" current={step} direction={narrow ? 'vertical' : 'horizontal'}>
          {editorSteps.map(label => <Steps.Step key={label} title={label}/>)}
        </Steps>
      </div>
      <div className="sr-only" role="status">部署步骤 {step + 1} / {editorSteps.length}，{editorSteps[step]}</div>
    </Card>
    <form noValidate onSubmit={submit} className="admin-deployment-editor">
      <Card>
        <div className="admin-analytics-fields">
          {step === 0 && <>
            <Title heading={5} component="h2">服务信息</Title>
            <div className="admin-deployment-fields">
              {textField('name', '服务名称', { maxLength: 80, required: true, disabled: !can || Boolean(existing), placeholder: '如 Qwen 知识问答服务' })}
              {textField('deploymentId', '部署编码', { required: true, disabled: !can || Boolean(existing), placeholder: 'qwen-service-prod' })}
            </div>
            <Paragraph type="secondary">部署编码使用小写字母、数字和连字符，创建后固定。</Paragraph>
            <Title heading={5} component="h2">模型与权重</Title>
            {selectField('modelId', '模型', models.map(item => [item.id, `${item.name} · ${item.modelId}`]),
              { disabled: !can || Boolean(existing), onChange: modelId => change({ modelId, weightId: '' }) })}
            {model && <Paragraph type="secondary">{model.profile?.author || model.maker} · 上下文 {model.capabilities?.context
              ? `${Math.round(model.capabilities.context / 1024)}K Token` : '未登记'} · 运行时兼容性需由启动检查确认</Paragraph>}
            <div className="admin-deployment-fields">
              <Form.Slot label="权重来源">
                <Choice label="权重来源" value={weightMode} disabled={!can} motion={false}
                  options={[[ 'path', '集群内已挂载路径' ], [ 'artifact', '已登记模型制品' ]]}
                  onChange={mode => { setWeightMode(mode); change({ weightId: '', weightPath: '' }); }}/>
              </Form.Slot>
              {weightMode === 'artifact' ? selectField('weightId', '模型制品', artifactOptions(weights))
                : textField('weightPath', '权重路径', { required: true, placeholder: '/models/qwen' })}
            </div>
            {weightMode === 'path' && <Paragraph type="secondary">所有副本需能读取该挂载路径。</Paragraph>}
            <Title heading={5} component="h2">运行环境</Title>
            {selectField('runtimeId', '运行时镜像', artifactOptions(runtimes))}
            <Paragraph type="secondary">仅显示已校验的运行时镜像。</Paragraph>
          </>}
          {step === 1 && <>
            <Title heading={5} component="h2">部署位置</Title>
            <div className="admin-deployment-fields">
              {selectField('clusterId', '目标集群', state.clusters.filter(item => item.status === '运行中').map(item => [item.id, `${item.name} · ${item.gpuType}`]),
                { disabled: !can || Boolean(existing) })}
              {textField('namespace', '命名空间', { required: true })}
            </div>
            <Title heading={5} component="h2">GPU 与副本</Title>
            <div className="admin-deployment-fields">
              {numberField('replicas', '副本数', { min: 1, max: 100 })}
              {numberField('gpuPerReplica', '每副本 GPU', { min: 1, max: 64, onChange: gpuPerReplica =>
                change({ gpuPerReplica, tensorParallel: gpuPerReplica, pipelineParallel: '1' }) })}
              {numberField('tensorParallel', '张量并行 TP', { min: 1 })}
              {numberField('pipelineParallel', '流水线并行 PP', { min: 1 })}
            </div>
            <Paragraph type="secondary">总 GPU = 副本数 × 每副本 GPU。TP × PP 须等于每副本 GPU，跨节点拓扑及通信以集群调度检查为准。</Paragraph>
            <Collapse>
              <AdminCollapsePanel itemKey="advanced" header="高级运行参数">
                <div className="admin-deployment-fields">
                  {numberField('maxModelLen', '上下文上限（Token）', { placeholder: '沿用模型配置' })}
                  {numberField('gpuMemoryUtilization', '显存利用比例', { min: .01, max: 1, step: .01 })}
                  {numberField('startupTimeout', '启动超时（秒）', { min: 1, max: 7200 })}
                </div>
              </AdminCollapsePanel>
            </Collapse>
            <Title heading={5} component="h2">服务访问</Title>
            <Text>OpenAI 兼容协议 · 平台内部端点</Text>
            <Paragraph type="secondary">服务就绪后生成端点。对外接入、售价与上架在模型运营中维护。</Paragraph>
          </>}
          {step === 2 && <>
            <Title heading={5} component="h2">核对部署配置</Title>
            <Facts values={[
              ['服务', values.name], ['部署编码', values.deploymentId], ['模型', model?.name],
              ['运行时镜像', runtimes.find(item => item.id === values.runtimeId)?.name],
              ['权重来源', values.weightId ? weights.find(item => item.id === values.weightId)?.name : values.weightPath],
              ['集群 / 命名空间', `${cluster?.name} / ${values.namespace}`], ['副本 / 每副本 GPU', `${values.replicas} / ${values.gpuPerReplica}`],
              ['并行配置', `TP ${values.tensorParallel} × PP ${values.pipelineParallel}`],
              ['上下文上限', values.maxModelLen ? `${values.maxModelLen} Token` : '沿用模型配置'], ['访问协议', 'OpenAI · 内部端点'],
            ]}/>
            <Banner type={preflightError ? 'danger' : 'success'} closeIcon={null} title="配置预检"
              description={preflightError || `必填配置、制品状态和 GPU 数量检查通过，提交后将预留 ${required} 张 GPU。`}/>
            <Paragraph type="secondary">权重可读性、运行时兼容性、显存是否足够及健康探针需在启动阶段确认。</Paragraph>
            {existing && <Banner type="warning" closeIcon={null} description="重建更新会暂时停用当前端点，请在允许中断的时间执行。"/>}
          </>}
          <ErrorNote message={error}/>
        </div>
        <div className="admin-form-actions">
          <Button onClick={() => go({ view: null, deployment: existing?.id || null })}>取消</Button>
          {step > 0 && <Button onClick={() => { setStep(step - 1); setError(''); }}>上一步</Button>}
          <Button htmlType="submit" theme="solid" disabled={!can || (step === 2 && Boolean(preflightError))}>
            {step < 2 ? '下一步' : existing ? '确认重建更新' : '开始部署'}
          </Button>
        </div>
      </Card>
      <Card title={<Title heading={5} component="h2">资源预览</Title>}>
        <div className="admin-analytics-fields">
          <Facts values={[
            ['模型', model?.name || '待选择'], ['目标集群', cluster?.name || '待选择'], ['GPU 型号', cluster?.gpuType],
            ['当前可用 GPU', available == null ? '—' : `${available} 张`],
            ['本次目标 GPU', Number.isFinite(required) ? `${required} 张` : '—'],
            ['部署后余量', available == null ? '—' : `${available - required} 张`],
          ]}/>
          <Paragraph type="secondary">提交时重新核对集群容量。</Paragraph>
          {available != null && required > available && <ErrorNote message="GPU 容量不足，请减少副本或更换集群"/>}
        </div>
      </Card>
    </form>
  </>;
}

const detailTabs = [['overview', '运行概览'], ['config', '部署配置'], ['events', '事件与日志']];

function DeploymentDetail({ item, state, can, go, ask, tab }) {
  const model = state.models.find(row => row.id === item.modelId);
  const cluster = state.clusters.find(row => row.id === item.clusterId);
  const endpoint = state.endpoints.find(row => row.id === item.endpointId);
  const artifactName = id => state.artifacts.find(row => row.id === id)?.name;
  const operation = primaryOperation(item);
  const steps = [
    ['配置提交', time(item.createdAt), Boolean(item.createdAt)],
    ['资源预留', deploymentGpu(item) ? `${deploymentGpu(item)} 张 GPU` : '未占用', deploymentGpu(item) > 0],
    ['启动与就绪', item.status === '运行中' ? item.readyReplicas === item.replicas ? '就绪检查通过' : '就绪数据未接入'
      : item.failureReason || (item.status === '停止' ? '服务已停止' : '等待检查'), item.status === '运行中' && item.readyReplicas === item.replicas],
    ['服务端点', endpoint?.status === '运行中' ? '已启用' : '未启用', endpoint?.status === '运行中'],
  ];
  return <>
    <AdminPageHeading title={item.name} description={`${item.deploymentId} · ${model?.name || '模型记录缺失'}`}>
      <Space wrap>
        <Button theme="solid" disabled={!can} onClick={() => ask(item, operation)}>{confirmTitles[operation]}</Button>
        {!inProgress(item) && <Button disabled={!can} onClick={() => go({ view: 'edit', deployment: item.id })}>更新配置</Button>}
        {item.previousConfig && item.status === '运行中' && <Button disabled={!can} onClick={() => ask(item, 'rollback')}>回滚</Button>}
        {item.status !== '停止' && <Button type="danger" disabled={!can} onClick={() => ask(item, 'stop')}>停止</Button>}
      </Space>
    </AdminPageHeading>
    <Card>
      <Space wrap>
        <Status value={item.status}/>
        <Text type="secondary">集群：{cluster?.name || '—'}</Text>
        <Text type="secondary">配置版本：{item.configRevision ? `v${item.configRevision}` : '未登记'}</Text>
        <Text type="secondary">更新：{time(item.updatedAt)}</Text>
      </Space>
      <Tabs className="admin-deployment-detail-tabs" activeKey={tab} onChange={tab => go({ tab })}>
        {detailTabs.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={label}/>)}
      </Tabs>
      <div className="admin-analytics-fields">
        {tab === 'config' ? <>
          <Title heading={5} component="h2">模型与运行环境</Title>
          <Facts values={[
            ['模型', model?.name], ['模型编码', model?.modelId], ['模型权重', item.weightId ? artifactName(item.weightId) : item.weightPath],
            ['运行时镜像', artifactName(item.runtimeId)], ['原登记制品', artifactName(item.artifactId)], ['命名空间', item.namespace],
            ['集群', cluster?.name], ['GPU 型号', cluster?.gpuType], ['目标副本数', item.replicas], ['每副本 GPU', item.gpuPerReplica],
            ['张量并行 / 流水线并行', item.tensorParallel ? `${item.tensorParallel} / ${item.pipelineParallel}` : '—'],
            ['上下文上限', item.maxModelLen ? `${item.maxModelLen} Token` : item.configRevision ? '沿用模型配置' : '未登记'],
            ['显存利用比例', item.gpuMemoryUtilization], ['启动超时', item.startupTimeout ? `${item.startupTimeout} 秒` : '—'],
          ]}/>
          <Paragraph type="secondary">更换模型或集群需新建部署。</Paragraph>
        </> : tab === 'events' ? <>
          <Title heading={5} component="h2">部署事件</Title>
          {item.events?.length ? <Timeline>
            {[...item.events].reverse().map((event, index) => <Timeline.Item key={index} type={event.level === '异常' ? 'error' : 'success'} time={time(event.at)}>
              {event.message}
            </Timeline.Item>)}
          </Timeline> : <Paragraph type="secondary">尚无部署过程事件。</Paragraph>}
          <Title heading={5} component="h2">操作记录</Title>
          <Table size="small" rowKey="id" pagination={false} scroll={{ x: 'max(100%, 520px)' }}
            dataSource={state.audits.filter(row => [item.id, item.deploymentId].includes(row.objectId))}
            columns={[
              { title: '时间', dataIndex: 'createdAt', render: time },
              { title: '操作人', dataIndex: 'actor' },
              { title: '操作', dataIndex: 'action' },
              { title: '结果', dataIndex: 'result' },
            ]}/>
          <Title heading={5} component="h2">容器日志</Title>
          <Paragraph type="secondary">尚未接入集群容器日志。</Paragraph>
        </> : <>
          <div className="admin-analysis-plot-grid">
            <section className="admin-analytics-fields">
              <Title heading={5} component="h2">副本与资源</Title>
              <Facts values={[
                ['就绪 / 目标副本', `${item.readyReplicas ?? '—'} / ${item.replicas}`], ['已分配 GPU', `${deploymentGpu(item)} 张`],
                ['每副本 GPU', `${item.gpuPerReplica} 张`], ['集群可用 GPU', cluster ? `${cluster.totalGpu - cluster.allocatedGpu} 张` : '—'],
              ]}/>
              <Paragraph type="secondary">副本节点、GPU 显存、CPU 和内存用量尚未接入。</Paragraph>
            </section>
            <section className="admin-analytics-fields">
              <Title heading={5} component="h2">服务端点</Title>
              <Facts values={[
                ['协议', endpoint?.protocol || 'OpenAI'], ['端点状态', endpoint?.status || '尚未生成'],
                ['端点编码', endpoint?.endpointId], ['Model ID', model?.modelId],
              ]}/>
              {endpoint?.baseUrl ? <div className="admin-deployment-endpoint"><CopyId value={endpoint.baseUrl} label="服务地址"/></div>
                : <Paragraph type="secondary">服务就绪后生成内部 OpenAI 兼容地址。</Paragraph>}
              <Paragraph type="secondary">对外供给、售价和上架在服务管理中配置。</Paragraph>
            </section>
          </div>
          <ErrorNote message={item.failureReason}/>
          <Title heading={5} component="h2">部署进度</Title>
          <Timeline>
            {steps.map(([name, value, done]) => <Timeline.Item key={name} type={done ? 'success' : 'default'}>
              <Text strong>{name}</Text>
              <Paragraph type="secondary">{value}</Paragraph>
            </Timeline.Item>)}
          </Timeline>
          <Paragraph type="secondary">{inProgress(item) ? '部署任务正在等待检查。请确认资源、权重和运行环境。'
            : item.status === '失败' ? '请先处理失败原因，再重新启动。'
              : item.status === '停止' ? 'GPU 资源已释放，重新启动时将再次检查可用容量。' : '生产性能可在生产观测中查看。'}</Paragraph>
        </>}
      </div>
    </Card>
  </>;
}

const listTabs = [['all', '全部部署'], ['运行中', '运行中'], ['progress', '部署进行中'], ['失败', '失败'], ['停止', '已停止']];
const matchesStatus = (item, status) => status === 'all' || (status === 'progress' ? inProgress(item) : item.status === status);

function DeploymentList({ state, params, can, go, ask }) {
  const query = params.get('q') || '';
  const filter = params.get('status') || 'all';
  const cluster = params.get('cluster') || 'all';
  const size = normalizePageSize(params.get('size'));
  const modelName = id => state.models.find(row => row.id === id)?.name;
  const scope = state.deployments.filter(item =>
    `${item.name} ${item.deploymentId} ${modelName(item.modelId) || ''}`.toLowerCase().includes(query.toLowerCase())
    && (cluster === 'all' || item.clusterId === cluster));
  const rows = scope.filter(item => matchesStatus(item, filter));
  const page = Math.max(1, Math.min(Math.floor(Number(params.get('page'))) || 1, Math.ceil(rows.length / size) || 1));
  const change = patch => go({ ...patch, page: null }, false, true);
  const details = (item, tab = 'overview') => go({ deployment: item.id, tab });
  const columns = [
    { title: '部署服务', width: 205, dataIndex: 'name', render: (name, item) => <div className="admin-table-record">
      <Button size="small" theme="borderless" onClick={() => details(item)}>{name}</Button>
      <Text code type="secondary">{item.deploymentId}</Text>
    </div> },
    { title: '模型 / 运行环境', width: 190, render: (_, item) => {
      const runtime = state.artifacts.find(row => row.id === item.runtimeId);
      return <div className="admin-table-record">
        <Text>{modelName(item.modelId) || '模型缺失'}</Text>
        <Text type="secondary" size="small">{runtime ? `${runtime.name} · ${runtime.version}` : '运行环境未登记'}</Text>
      </div>;
    } },
    { title: '集群', width: 135, render: (_, item) => <div className="admin-table-record">
      <Text>{state.clusters.find(row => row.id === item.clusterId)?.name || '—'}</Text>
      <Text type="secondary" size="small">{item.namespace || '命名空间未登记'}</Text>
    </div> },
    { title: 'GPU / 副本', width: 135, align: 'right', render: (_, item) => <div className="admin-table-record">
      <Text>{deploymentGpu(item)} 张 GPU</Text>
      <Text type="secondary" size="small">{item.replicas} 副本 × {item.gpuPerReplica} 张</Text>
    </div> },
    { title: '就绪状态', width: 135, render: (_, item) => <div className="admin-table-record">
      <Status value={item.status}/>
      <Text type="secondary" size="small">{item.readyReplicas == null ? '就绪副本未接入' : `${item.readyReplicas} / ${item.replicas} 副本就绪`}</Text>
    </div> },
    { title: '服务端点', width: 150, render: (_, item) => {
      const endpoint = state.endpoints.find(row => row.id === item.endpointId);
      return <div className="admin-table-record">
        <Text>{endpoint?.endpointId || '—'}</Text>
        <Text type="secondary" size="small">{endpoint ? `${endpoint.protocol} · ${endpoint.status}` : '就绪后生成'}</Text>
      </div>;
    } },
    { title: '操作', width: 143, render: (_, item) => <Space spacing={4}>
      <Button size="small" theme="borderless" onClick={() => details(item, item.status === '失败' ? 'events' : 'overview')}>详情</Button>
      <Button size="small" theme="borderless" disabled={!can} onClick={() => ask(item, primaryOperation(item))}>
        {primaryOperation(item) === 'start' ? '启动' : confirmTitles[primaryOperation(item)]}
      </Button>
    </Space> },
  ];

  return <>
    <AdminPageHeading title="模型部署" description="部署和管理自有推理服务，查看资源、就绪状态与部署事件。">
      <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!can} onClick={() => go({ view: 'create' })}>部署模型</Button>
    </AdminPageHeading>
    <Card>
      <Tabs activeKey={filter} onChange={status => change({ status: status === 'all' ? null : status })}>
        {listTabs.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id}
          tab={`${label}（${scope.filter(item => matchesStatus(item, id)).length}）`}/>)}
      </Tabs>
      <FilterToolbar className="admin-list-toolbar">
        <Input className="admin-list-search" prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索部署"
          placeholder="搜索服务名称、部署编码或模型" value={query} onChange={q => change({ q })}/>
        <Choice label="筛选集群" value={cluster} options={[[ 'all', '全部集群' ], ...state.clusters.map(item => [item.id, item.name])]}
          onChange={cluster => change({ cluster })}/>
        <FilterReset onClick={() => change({ q: null, status: null, cluster: null })}/>
      </FilterToolbar>
      <Table size="small" rowKey="id" columns={columns} dataSource={rows.slice((page - 1) * size, page * size)} scroll={{ x: 'max(100%, 1100px)' }}
        pagination={{ currentPage: page, pageSize: size, total: rows.length, pageSizeOpts: PAGE_SIZES, showSizeChanger: true, showTotal: true,
          onPageChange: page => go({ page }, false, true), onPageSizeChange: size => change({ size }) }}
        empty={query || filter !== 'all' || cluster !== 'all' ? '没有符合条件的部署，请调整或重置筛选。' : '暂无模型部署。'}/>
    </Card>
  </>;
}

export default function ModelDeployments({ state, dispatch, conflict }) {
  const [params, setParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [replicas, setReplicas] = useState('');
  const [leave, setLeave] = useState(null);
  const dirty = useRef(false);
  const accepted = useRef(location.hash);

  useEffect(() => {
    const sync = () => {
      const next = location.hash;
      if (dirty.current && next !== accepted.current) {
        history.replaceState(null, '', accepted.current);
        setLeave(() => () => { location.hash = next; });
        return;
      }
      accepted.current = next;
      setParams(new URLSearchParams(next.split('?')[1] || ''));
      setError('');
    };
    const unload = event => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    const click = event => {
      const target = event.target.closest('.v2-sidebar button, .v2-sidebar [role="tab"], [data-admin-breadcrumb], .admin-banner-return');
      if (!dirty.current || !target) return;
      event.preventDefault();
      event.stopPropagation();
      setLeave(() => () => target.click());
    };
    addEventListener('hashchange', sync, true);
    addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      removeEventListener('hashchange', sync, true);
      removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, []);

  const go = (patch, saved = false, preserveScroll = false) => {
    const navigate = () => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
      }
      dirty.current = false;
      setError('');
      accepted.current = `#/admin-2/deployments${next.size ? '?' + next : ''}`;
      location.hash = accepted.current;
      setParams(next);
      if (!preserveScroll) window.scrollTo(0, 0);
    };
    if (!saved && dirty.current) setLeave(() => navigate);
    else navigate();
  };

  const can = !conflict && !state.storageError && canMutate(state.currentRole, { type: 'deploymentOperation' });
  const run = (operation, data = {}, deploymentId) => {
    try {
      if (!can) throw new Error('当前角色或数据状态不允许修改部署');
      const action = { type: 'deploymentOperation', operation, data, deploymentId };
      deploymentTransaction(state, action);
      const next = dispatch({ ...action, feedback: '部署操作已保存' });
      if (!next) throw new Error('操作未保存，请检查数据冲突或存储状态。当前输入已保留。');
      setError('');
      return next;
    } catch (issue) {
      setError(issue.message);
      return null;
    }
  };
  const ask = (item, operation) => {
    setConfirm({ id: item.id, operation });
    setReplicas(String(item.replicas));
    setError('');
  };
  const closeConfirm = () => { setConfirm(null); setError(''); };

  const selected = state.deployments.find(item => item.id === params.get('deployment'));
  const view = params.get('view');
  const tab = params.get('tab') || 'overview';
  const current = confirm && state.deployments.find(item => item.id === confirm.id);
  const cluster = state.clusters.find(item => item.id === current?.clusterId);

  let content;
  if (view === 'create' || (view === 'edit' && selected)) {
    content = <DeploymentEditor key={view + (selected?.id || '')} state={state}
      existing={view === 'edit' ? selected : null} can={can} run={run} go={go} dirty={dirty}/>;
  } else if (params.has('deployment') && !selected) {
    content = <Banner type="warning" closeIcon={null} title="部署不存在" description={
      <Button theme="borderless" onClick={() => go({ deployment: null, view: null, tab: null })}>返回部署列表</Button>
    }/>;
  } else if (selected) {
    content = <DeploymentDetail item={selected} state={state} can={can} go={go} ask={ask} tab={tab}/>;
  } else {
    content = <DeploymentList state={state} params={params} can={can} go={go} ask={ask}/>;
  }

  return <div className="admin-page-stack admin-deployment-page">
    {content}
    {!confirm && <ErrorNote message={error}/>}
    {confirm && <Modal visible title={confirmTitles[confirm.operation]} width="min(520px, calc(100vw - 32px))"
      closeOnEsc maskClosable={false} onCancel={closeConfirm} footer={<Space>
        <Button onClick={closeConfirm}>取消</Button>
        <Button theme="solid" type={confirm.operation === 'stop' ? 'danger' : 'primary'} disabled={!can || !current}
          onClick={() => { if (run(confirm.operation, { replicas }, current?.id)) closeConfirm(); }}>
          确认{confirmActions[confirm.operation]}
        </Button>
      </Space>}>
      <div className="admin-analytics-fields">
        <Text strong>{current?.name || '部署状态已变化'}</Text>
        {confirm.operation === 'scale' ? <>
          <Form.Slot label="目标副本数">
            <Input aria-label="目标副本数" type="number" min={1} max={100} value={replicas}
              onChange={value => { setReplicas(value); setError(''); }}/>
          </Form.Slot>
          <Facts values={[
            ['当前目标', current?.replicas], ['目标 GPU', current ? `${Number(replicas) * current.gpuPerReplica} 张` : '—'],
            ['集群剩余 GPU', cluster ? `${cluster.totalGpu - cluster.allocatedGpu} 张` : '—'],
          ]}/>
          <Paragraph type="secondary">每副本 GPU 保持不变，容量不足时无法执行。</Paragraph>
        </> : <Paragraph>{confirmDetails[confirm.operation]}</Paragraph>}
        <ErrorNote message={error}/>
      </div>
    </Modal>}
    {leave && serviceOperationsUi.renderLeaveDialog({
      cancel: () => setLeave(null),
      discard: () => { dirty.current = false; setLeave(null); leave(); },
    })}
  </div>;
}
