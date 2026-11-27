import { useMemo, useState } from 'react';
import { Button, Card, Empty, Select, Space, Tabs, Tag, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconChevronLeft, IconChevronRight } from '@douyinfe/semi-icons';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import AdminDescriptions from './AdminDescriptions';
import { AdminSideSheet } from './AdminOverlay';
import AdminTable from './AdminTable';
import { BENCHMARK_SLO, BENCHMARK_STOP_REASONS, benchmarkComparablePoints, benchmarkComparisonPoint, benchmarkStageInspection } from './benchmark-alignment';
import { useChannelText } from './channel-language';
import './benchmark-alignment.css';

const { Text, Title } = Typography;
const blank = '—';
const metric = (value, unit = '') => Number.isFinite(value) ? `${Number(value.toFixed(6))}${unit ? ` ${unit}` : ''}` : blank;
const seriesFields = [
  ['totalThroughput', '总吞吐量', 'Token/s'], ['throughput', '输出吞吐量', 'Token/s'], ['requestRate', '成功请求速率', 'req/s'],
  ['ttft', 'P95 TTFT', 'ms'], ['tpot', 'P95 TPOT', 'ms/Token'],
  ['totalLatency', 'P95 端到端时延', 'ms'], ['resultRate', '成功率', '%'],
];
const requestFields = [['completed', '成功请求数'], ['failureCount', '出错请求数'], ['incompleteCount', '未完成请求数']];
const summaryFields = [['requests', '请求总数'], ...requestFields, ['duration', '测量时长', 's'], ...seriesFields];
const roles = { prefill: '预填充', decode: '解码', router: '路由' };
const memberStatuses = { running: '运行中', starting: '启动中', pending: '未就绪', error: '失败' };
const pointName = (point, t) => `${t('测量点')} #${point.sequence}`;
const pointLoad = (point, row, t) => metric(point.load, row.loadType === '并发数' ? t('并发') : 'req/s');
const searchPhases = { expand: '逐步加压', refine: '区间细搜' };

function AdaptiveSummary({ row, points }) {
  const t = useChannelText();
  const search = row.benchmarkAdaptiveSearch;
  const reason = search && BENCHMARK_STOP_REASONS[search.stopReason] || row.benchmarkStopReason;
  if (!reason) return null;
  const load = value => pointLoad({ load:value }, row, t);
  const gain = search?.throughputGain;
  const bracket = search?.sloBracket;
  return <Space wrap>
    <Text>{t('搜索停止于')} <strong>{t(reason)}</strong></Text>
    {search?.bracketReason && search.bracketReason !== search.stopReason && BENCHMARK_STOP_REASONS[search.bracketReason] &&
      <Text type="tertiary">{t('确定搜索区间')} · {t(BENCHMARK_STOP_REASONS[search.bracketReason])}</Text>}
    {bracket && bracket.passing != null && bracket.failing != null && <Text type="tertiary">
      {t('SLO 达标负载')} {load(bracket.passing)} · {t('未达标负载')} {load(bracket.failing)}
    </Text>}
    {gain && <Tooltip trigger={['hover','focus']} content={<Space vertical align="start">
      <Text>{t('细搜累计吞吐增益')} {metric(gain.gain,'%')} · {t('阈值')} {metric(gain.threshold,'%')}</Text>
      <Text>{t('峰值前后有效测点')} {load(gain.lower)} – {load(gain.upper)}</Text>
      <Text>{t('细搜窗口')} {gain.pointIds.map(id => points.find(point => point.id === id)).filter(Boolean).map(point =>
        `#${point.sequence} ${pointLoad(point,row,t)} · ${metric(point.totalThroughput,'Token/s')}`).join(' / ')}</Text>
    </Space>}><Button size="small" theme="borderless">{t('查看收敛依据')}</Button></Tooltip>}
  </Space>;
}

function ResultTable({ label, ...props }) {
  return <div className="benchmark-result-table" tabIndex={0} role="region" aria-label={label}>
    <AdminTable {...props}/>
  </div>;
}

function PointTags({ point, inspection }) {
  const t = useChannelText();
  return <Space wrap>
    {inspection.recommended?.id === point.id && <Tag color="green">{t('推荐负载')}</Tag>}
    {inspection.peak?.id === point.id && <Tag color="blue">{t('总吞吐峰值')}</Tag>}
    {point.saturated && <Tag color="orange">{t('过饱和')}</Tag>}
    {inspection.targets.length > 0 && (point.meetsSlo == null ? <Tag>{t('SLO 样本不足')}</Tag> :
      <Tag color={point.meetsSlo ? 'green' : 'red'}>{t(point.meetsSlo ? '满足 SLO' : '超过 SLO')}</Tag>)}
  </Space>;
}

function PhaseTable({ row, inspection, points, onChoose, resources = false }) {
  const t = useChannelText();
  const pointColumn = { title: '测量点', key: 'point', width: 135, fixed: 'left', render: (_, point) =>
    <Button size="small" theme="borderless" disabled={resources && !point.range}
      onClick={() => onChoose(point.id, resources ? 'resources' : 'statistics')}>
      {pointName(point, t)}
    </Button> };
  const loadColumn = { title: '负载', key: 'load', width: 115, render: (_, point) => pointLoad(point, row, t) };
  const resourceColumns = [
    { title: '测量窗口', key: 'range', width: 150, render: (_, point) =>
      point.range ? `+${point.range.from} s → +${point.range.to} s` : blank },
    ...['GPU 峰值', 'KV 缓存峰值', '等待请求峰值', 'CPU 峰值'].map(title => ({ title, key: title, minWidth: 125, render: () => blank })),
    { title: '采样状态', key: 'sampling', width: 120, render: () => <Tag>{t('未采集')}</Tag> },
  ];
  const resultColumns = [
    { title: '执行结果', key: 'outcome', width: 205, render: (_, point) => <PointTags point={point} inspection={inspection}/> },
    ...(row.benchmarkAdaptiveSearch ? [{ title: '搜索阶段', dataIndex: 'searchPhase', width: 110,
      render: value => searchPhases[value] ? t(searchPhases[value]) : blank }] : []),
    ...[...requestFields, ...seriesFields.filter(([key]) => key !== 'requestRate')].map(([key,title,unit]) => ({
      title, dataIndex: key, width: 130, render: value => metric(value, unit),
    })),
  ];
  return <ResultTable label={t(resources ? '阶段资源观测' : '阶段结果')} rowKey="id" dataSource={points}
    scroll={{ x: resources ? 1050 : row.benchmarkAdaptiveSearch ? 1620 : 1510 }} pagination={points.length > 10 ? { pageSize: 10 } : false}
    columns={[pointColumn, loadColumn, ...(resources ? resourceColumns : resultColumns)]}/>;
}

function PointStatistics({ row, point, inspection }) {
  const t = useChannelText();
  const latencyColumns = [
    { title: '指标', dataIndex: 'name' }, ...[['avg', '平均值'], ['p95', 'P95'], ['p99', 'P99']].map(([dataIndex,title]) => ({
      title, dataIndex, render: value => metric(value, 'ms'),
    })),
  ];
  const latencyRows = [['Ttft','TTFT'], ['Tpot','TPOT'], ['Latency','端到端时延']].map(([key,label]) => ({
    name: t(label), avg: point.observed[`avg${key}`], p95: point.observed[`p95${key}`], p99: point.observed[`p99${key}`],
  }));
  return <div className="benchmark-results-stack">
    <Space wrap><Text strong>{pointLoad(point, row, t)}</Text><PointTags point={point} inspection={inspection}/></Space>
    <AdminDescriptions align="left" data={[
      { key: t('测量窗口'), value: point.range ? `+${point.range.from} s → +${point.range.to} s` : blank },
      ...summaryFields.map(([key,label,unit]) => ({ key: t(label), value: metric(point[key], unit) })),
    ]}/>
    {point.lowSample && <Text type="secondary">{t('样本不足 1,000 个，P99 时延仅供参考。')}</Text>}
    <Title heading={5}>{t('时延统计')}</Title>
    <ResultTable label={t('时延统计')} rowKey="name" dataSource={latencyRows} columns={latencyColumns} pagination={false}/>
    {!!point.limits.length && <><Title heading={5}>{t('延迟 SLO')}</Title>
      <ResultTable label={t('延迟 SLO')} rowKey="key" dataSource={point.limits} pagination={false} columns={[
        { title: '指标', dataIndex: 'label', render: value => t(value) },
        ...[['threshold','SLO 阈值'], ['value','测量值']].map(([dataIndex,title]) => ({ title, dataIndex, render: value => metric(value, 'ms') })),
        { title: '结果', dataIndex: 'pass', render: value => <Tag color={value == null ? 'grey' : value ? 'green' : 'red'}>
          {t(value == null ? '未采集' : value ? '满足 SLO' : '超过 SLO')}
        </Tag> },
      ]}/>
    </>}
  </div>;
}

function PointComparison({ row, point, points, basis, setBasis, customId, setCustomId }) {
  const t = useChannelText();
  const baseline = benchmarkComparisonPoint(points, point, basis, customId);
  const candidates = benchmarkComparablePoints(points, point);
  const values = [...summaryFields, ...BENCHMARK_SLO.filter(([key]) => !key.startsWith('p95')).map(([key,label]) => [key,label,'ms'])]
    .map(([key,label,unit]) => {
      const current = point[key] ?? point.observed[key];
      const previous = baseline?.[key] ?? baseline?.observed[key];
      const delta = Number.isFinite(current) && Number.isFinite(previous) ? Number((current - previous).toFixed(2)) : null;
      return { key, label, unit, current, previous, delta };
    });
  const pointOption = item => ({ value: item.id, label: `${pointName(item, t)} · ${pointLoad(item, row, t)}` });
  return <div className="benchmark-results-stack">
    <Space wrap>
      <Select aria-label={t('对比基准')} value={basis} onChange={setBasis} optionList={[
        { value: 'adjacent', label: t('相邻较低负载') }, { value: 'previous', label: t('上一个测量点') }, { value: 'custom', label: t('自选基准') },
      ]}/>
      {basis === 'custom' && <Select aria-label={t('选择基准点')} placeholder={t('选择基准点')} showClear
        value={baseline?.id} optionList={candidates.map(pointOption)} onChange={setCustomId}/>}
    </Space>
    {baseline ? <>
      <Text>{pointOption(point).label} / {pointOption(baseline).label}</Text>
      <ResultTable label={t('阶段对比')} rowKey="key" dataSource={values} pagination={false} columns={[
        { title: '指标', dataIndex: 'label', render: value => t(value) },
        { title: '基准点', dataIndex: 'previous', render: (value, item) => metric(value, item.unit) },
        { title: '当前点', dataIndex: 'current', render: (value, item) => metric(value, item.unit) },
        { title: '变化量', dataIndex: 'delta', render: (value, item) =>
          Number.isFinite(value) ? `${value > 0 ? '+' : ''}${metric(value, item.unit === '%' ? t('百分点') : item.unit)}` : blank },
      ]}/>
    </> : <Empty description={t(basis === 'custom' ? '请选择一个对比基准点' : '当前没有可用的对比基准点')}/>}
  </div>;
}

export function BenchmarkStageInspector({ row }) {
  const t = useChannelText();
  const inspection = useMemo(() => benchmarkStageInspection(row), [row]);
  const [drawer, setDrawer] = useState('');
  const [selected, setSelected] = useState(null);
  const [listTab, setListTab] = useState('results');
  const [detailTab, setDetailTab] = useState('statistics');
  const [measure, setMeasure] = useState(() => inspection.peak ? 'totalThroughput' : 'throughput');
  const [view, setView] = useState('execution');
  const [basis, setBasis] = useState('adjacent');
  const [customBaseline, setCustomBaseline] = useState(null);
  const points = view === 'load' ? [...inspection.points].sort((left,right) => left.load - right.load || left.sequence - right.sequence) : inspection.points;
  if (!points.length) return null;
  const activeIndex = points.findIndex(point => point.id === selected);
  const current = points[activeIndex];
  const [key, label, unit] = seriesFields.find(([id]) => id === measure);
  const navigate = (id, tab = detailTab) => {
    const target = points.find(point => point.id === id);
    if (!target) return;
    setSelected(id);
    setDetailTab(tab === 'resources' && !target.range || tab === 'compare' && !benchmarkComparablePoints(points, target).length ? 'statistics' : tab);
    setDrawer('point');
  };
  const openResults = () => { setListTab('results'); setDrawer('list'); };
  const pointOption = point => ({ value: point.id, label: `${pointName(point, t)} · ${pointLoad(point, row, t)}` });
  const peak = inspection.peak || inspection.outputPeak;
  const peakTitle = !peak || inspection.peak ? '总吞吐峰值' : '输出吞吐峰值';
  const sloFloor = inspection.recommended && row.benchmarkAdaptiveSearch?.sloBracket?.failing === null;
  return <Card title={t('阶段与监控')} headerExtraContent={<Button onClick={openResults}>{t('查看阶段结果')}</Button>} className="benchmark-results">
    <div className="benchmark-results-stack">
      <Space wrap><Tag>{t('模拟采样')}</Tag>
        {row.loadPattern === '自动调优' ? <AdaptiveSummary row={row} points={inspection.points}/> :
          row.benchmarkStopReason && <Text>{t('停止原因')} · {t(row.benchmarkStopReason)}</Text>}
      </Space>
      {row.targetMode === '路由' && <Text type="tertiary">
        {t('解读路由延迟时，请同时查看出错请求数和未完成请求数。网关丢弃的请求不计入延迟。')}
      </Text>}
      <div className="benchmark-point-highlights">
        {[['满足 SLO 的最高负载', inspection.recommended, point => `${sloFloor ? '≥ ' : ''}${pointLoad(point, row, t)}`],
          [peakTitle, peak, point => metric(inspection.peak ? point.totalThroughput : point.throughput, 'Token/s')]].map(([title, sample, value]) =>
          <Card key={title} title={t(title)} shadows="never">
            {sample ? <Space vertical align="start"><Text strong>{value(sample)}</Text>
              <Button theme="borderless" size="small" onClick={() => navigate(sample.id, 'statistics')}>{pointName(sample, t)}</Button>
            </Space> : <Text type="tertiary">{t(title === peakTitle ? '未采集' :
              inspection.targets.length ? '无满足 SLO 的测量点' : '未配置 SLO')}</Text>}
          </Card>)}
      </div>
      <Space wrap>
        <Select aria-label={t('阶段顺序')} value={view} optionList={[
          { value: 'execution', label: t('执行顺序') }, { value: 'load', label: t('按负载排序') },
        ]} onChange={setView}/>
        <Select aria-label={t('阶段指标')} value={measure} optionList={seriesFields.map(([value, label]) => ({ value, label: t(label) }))} onChange={setMeasure}/>
      </Space>
      <TimeSeriesChart labels={points.map(point => view === 'load' ? `${point.load} · #${point.sequence}` : pointName(point, t))}
        label={t(label)} unit={unit} height={220} type="bar" compact showData={false}
        series={[{ label: t(label), values: points.map(point => point[key] ?? null) }]}
        onChoose={index => navigate(points[index]?.id, 'statistics')}/>
      <PhaseTable row={row} inspection={inspection} points={points.slice(0, 10)} onChoose={navigate}/>
    </div>
    {drawer && <AdminSideSheet visible closeOnEsc width={drawer === 'list' ? 'min(1120px, 100vw)' : 'min(920px, 100vw)'}
      title={t(drawer === 'list' ? '阶段结果' : '阶段详情')} onCancel={() => setDrawer('')}>
      {drawer === 'list' ? <Tabs activeKey={listTab} onChange={setListTab}>
        <Tabs.TabPane itemKey="results" tab={t('阶段结果')}>
          <PhaseTable row={row} inspection={inspection} points={points} onChoose={navigate}/>
        </Tabs.TabPane>
        <Tabs.TabPane itemKey="resources" tab={t('资源观测')}>
          <PhaseTable row={row} inspection={inspection} points={points} onChoose={navigate} resources/>
        </Tabs.TabPane>
      </Tabs> : current && <div className="benchmark-results-stack">
        <Space wrap>
          <Button onClick={() => setDrawer('list')}>{t('返回阶段结果')}</Button>
          <Button icon={<IconChevronLeft aria-hidden="true"/>} disabled={activeIndex <= 0}
            onClick={() => navigate(points[activeIndex - 1].id)}>{t('上一个测量点')}</Button>
          <Select aria-label={t('测量点')} value={current.id} optionList={points.map(pointOption)} onChange={id => navigate(id)}/>
          <Button icon={<IconChevronRight aria-hidden="true"/>} disabled={activeIndex === points.length - 1}
            onClick={() => navigate(points[activeIndex + 1].id)}>{t('下一个测量点')}</Button>
        </Space>
        <Tabs activeKey={detailTab} onChange={setDetailTab}>
          <Tabs.TabPane itemKey="statistics" tab={t('统计')}><PointStatistics row={row} point={current} inspection={inspection}/></Tabs.TabPane>
          <Tabs.TabPane itemKey="resources" tab={t('资源观测')} disabled={!current.range}>
            {current.range && <AdminDescriptions align="left" data={[
              { key: t('测量窗口'), value: `+${current.range.from} s → +${current.range.to} s` },
              { key: t('采样状态'), value: t('未采集') },
            ]}/>}
            <Empty description={t('此测量点没有资源采样')}/>
          </Tabs.TabPane>
          <Tabs.TabPane itemKey="compare" tab={t('阶段对比')} disabled={!benchmarkComparablePoints(points, current).length}>
            <PointComparison row={row} point={current} points={inspection.points} basis={basis}
              setBasis={setBasis} customId={customBaseline} setCustomId={setCustomBaseline}/>
          </Tabs.TabPane>
        </Tabs>
      </div>}
    </AdminSideSheet>}
  </Card>;
}

export function BenchmarkExecutionEnvironment({ row, records }) {
  const t = useChannelText();
  const [expanded, setExpanded] = useState([]);
  const snapshot = row.environment || {};
  const members = snapshot.members || [];
  const workers = snapshot.workers || [];
  const expandable = workers.filter(worker => worker.devices.length).map(worker => worker.id);
  const formatTime = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const gpuColumns = [
    { title: 'GPU 名称', dataIndex: 'name' }, { title: '编号', dataIndex: 'index' }, { title: '厂商', dataIndex: 'vendor' },
    { title: '显存', dataIndex: 'vram', render: value => metric(value, 'GiB') }, { title: '计算核心数', dataIndex: 'coreCount', render: value => value ?? blank },
  ];
  const workerColumns = [
    { title: '节点名称', dataIndex: 'name', width: 145, fixed: 'left', render: (value, worker) =>
      <Space wrap>{value}{worker.main && <Tag color="blue">{t('主节点')}</Tag>}</Space> },
    { title: '承载实例', key: 'members', width: 175, render: (_, worker) =>
      <Space wrap>{members.filter(member => worker.memberIds.includes(member.id)).map(member =>
        <Tag key={member.id}>{member.role ? t(roles[member.role] || member.role) : member.name}</Tag>)}</Space> },
    { title: '操作系统', dataIndex: 'os', width: 140 },
    { title: '运行时版本', key: 'runtime', width: 145, render: (_, worker) => [...new Set(worker.devices.map(device => device.runtime).filter(Boolean))].join(' / ') || blank },
    { title: '驱动版本', key: 'driver', width: 120, render: (_, worker) => [...new Set(worker.devices.map(device => device.driver).filter(Boolean))].join(' / ') || blank },
    { title: 'CPU 核数', dataIndex: 'cpuCores', width: 100, render: value => value ?? blank },
    { title: '内存', dataIndex: 'memoryGiB', width: 100, render: value => metric(value, 'GiB') },
  ];
  return <div className="benchmark-results-stack">
    <AdminDescriptions align="left" data={[
      { key: t('集群'), value: snapshot.cluster || records.clusters?.find(cluster => cluster.id === row.clusterId)?.name || blank },
      { key: t('测试目标'), value: row.targetName || blank }, { key: t('推理后端'), value: [snapshot.backend, snapshot.backendVersion].filter(Boolean).join(' · ') || blank },
      { key: t('快照时间'), value: snapshot.capturedAt ? formatTime(snapshot.capturedAt) : t('未采集') },
      ...(!snapshot.capturedAt ? [{ key: t('节点'), value: snapshot.node || t('未采集') }, { key: t('GPU'), value: snapshot.gpu || t('未采集') }] : []),
    ]}/>
    {members.length > 0 && <Card title={t('部署成员')}>
      <ResultTable label={t('部署成员')} rowKey="id" dataSource={members} pagination={false} columns={[
        { title: '实例名称', dataIndex: 'name', render: (value, member) =>
          <Space wrap>{value}{member.id === snapshot.targetInstanceId && <Tag color="blue">{t('测试目标')}</Tag>}</Space> },
        { title: '角色', dataIndex: 'role', render: role => role ? t(roles[role] || role) : blank },
        { title: '节点', dataIndex: 'workerName', render: value => value || t('未采集') },
        { title: '状态', dataIndex: 'status', render: value => t(memberStatuses[value] || value) },
      ]}/>
    </Card>}
    <Card title={t('节点与 GPU')} headerExtraContent={expandable.length > 0 &&
      <Button onClick={() => setExpanded(expanded.length === expandable.length ? [] : expandable)}>
        {t(expanded.length === expandable.length ? '收起全部' : '展开全部')}
      </Button>}>
      <ResultTable label={t('节点与 GPU')} rowKey="id" dataSource={workers} columns={workerColumns} scroll={{ x: 980 }} pagination={false}
        empty={t('没有保存节点与 GPU 快照')} rowExpandable={worker => worker.devices.length > 0}
        expandedRowKeys={expanded} onExpandedRowsChange={setExpanded}
        expandedRowRender={worker => <ResultTable label={`${worker.name} ${t('GPU 设备')}`} rowKey="id"
          dataSource={worker.devices} columns={gpuColumns} pagination={false}/>}/>
    </Card>
  </div>;
}
