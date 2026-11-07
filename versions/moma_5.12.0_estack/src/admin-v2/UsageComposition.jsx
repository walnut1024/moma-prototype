import Table from './AdminTable';
import { useState } from 'react';
import { Button, Card, Modal, Space, Typography } from '@douyinfe/semi-ui';
import { DonutChart, TimeSeriesChart } from '../components/AnalyticsCharts';
import { chartColor } from '../components/chart-style.mjs';
import { AnalysisHelp } from './AnalysisMetric';
import { Choice } from './ServiceUI';
import UsageFilterBar from './UsageFilterBar';
import { formatUsageNumber, usageFacts, usageFilterOptions, usageModelTypes } from './usage-analysis';
import { tokenMetrics, usageDimensions } from './usage-trends';
import { usageShare, usageDistributions } from './usage-distributions';

const { Text, Title, Paragraph } = Typography;
const percent = (value, total) => total > 0 ? `${(value / total * 100).toFixed(2)}%` : '—';
const amount = value => formatUsageNumber(value).replace('w', '万');
const subjects = { category: '模型类型', providerId: '服务商', modelId: '模型', tenantId: '客户' };

export function UsageShare({ state, range, clock, filters, onChange, volume = false, settings, onSettings }) {
  const [showAll, setShowAll] = useState(false);
  const title = volume ? '模型调用量占比' : '模型调用次数占比';
  const facts = usageFacts(state, range, filters, clock)?.current || [];
  const share = usageShare(facts, settings.dimension, volume ? settings.metric : 'calls');
  const unit = volume ? 'Token' : '次';
  const subject = subjects[settings.dimension];
  const options = usageFilterOptions(state);
  const collection = { category: usageModelTypes, providerId: options.providers, modelId: options.models, tenantId: state.tenants }[settings.dimension];
  const name = id => id === '__other__' ? `其他${subject}` : id === '__unknown__' ? `未归属${subject}` : collection.find(item => item.id === id)?.name || id;
  const code = id => id.startsWith('__') || settings.dimension === 'category' ? '' : collection.find(item => item.id === id)?.code || (settings.dimension === 'modelId' ? state.models.find(item => item.id === id)?.modelId : id) || id;
  const slices = (settings.dimension === 'category' ? share.ranked.filter(row => row.value > 0) : share.slices).map(row => ({ ...row, label: name(row.id), color: row.id === '__unknown__' ? '#8a97ac' : row.id === '__other__' ? '#b8c3d5' : chartColor({ label: row.id, color: settings.dimension === 'category' ? collection.find(item => item.id === row.id)?.color : undefined }) }));
  const metricLabel = volume ? tokenMetrics.find(([id]) => id === settings.metric)[1] : '调用次数';
  const valueText = value => volume ? `${amount(value)} Token` : `${amount(value)} 次`;
  const usageNote = volume ? `${metricLabel}占比，仅统计 Token 计量请求；张、秒、字符等不计入。${share.pendingCalls > 0 ? ` ${amount(share.pendingCalls)} 次请求的计量待确认，未计入占比。` : ''}` : '调用次数占比以当前筛选范围内的请求数为分母，同一请求仅计一次。';
  const columns = showCode => [
    { title: subject, dataIndex: 'id', render: (id, row) => {
      const identifier = code(id);
      return <div className="ua-native-share-name" title={identifier ? `${name(id)} / ${identifier}` : name(id)}>
        {row.color && <span className="ua-native-swatch" style={{ background: row.color }} aria-hidden="true"/>}
        <Text>{name(id)}</Text>
        {showCode && identifier && <Text type="tertiary" size="small">{identifier}</Text>}
      </div>;
    } },
    { title: volume ? 'Token 用量' : '调用次数', dataIndex: 'value', align: 'right', render: amount },
    { title: '占比', key: 'percent', align: 'right', render: (_, row) => percent(row.value, share.total) },
  ];
  const description = `${range.start}—${range.end} · ${usageDimensions.find(([id]) => id === settings.dimension)[1]} · ${metricLabel}合计 ${valueText(share.total)}`;
  return <Card title={<Space wrap><Title heading={5} component="h2">{title}</Title><AnalysisHelp label={`${title}统计`}>{usageNote}</AnalysisHelp></Space>}
    headerExtraContent={<Space wrap>
      {volume && <Choice label={`${title}Token口径`} size="small" value={settings.metric}
        options={tokenMetrics} onSelect={metric => onSettings({ ...settings, metric })}/>}
      <Choice label={`${title}统计维度`} size="small" value={settings.dimension}
        options={usageDimensions} onSelect={dimension => onSettings({ ...settings, dimension })}/>
    </Space>}>
    <UsageFilterBar state={state} filters={filters} onChange={onChange} title={title}/>
    {!share.total ? <Paragraph type="secondary" className="ua-native-chart-empty">
      {!facts.length ? '所选条件下暂无调用记录' : volume
        ? share.pendingCalls ? '所选条件下暂无已确认 Token 用量' : '所选条件下暂无 Token 用量'
        : '所选条件下暂无调用次数'}
    </Paragraph> : <div className="ua-native-share-layout">
      <div>
        <DonutChart rows={slices} unit={unit} label={title} height={230} centerValue={amount(share.total)} centerLabel={metricLabel} showData={false}/>
        <Paragraph size="small" type="secondary">{share.count} 个{subject}{share.unknownValue > 0 ? ` · ${percent(share.unknownValue, share.total)} 未归属` : ''}</Paragraph>
      </div>
      <div className="admin-analytics-fields">
        <Table rowKey="id" size="small" dataSource={slices} columns={columns(false)} pagination={false} scroll={{ x: 'max(100%, 300px)' }}/>
        <div className="ua-native-fact-row">
          <Text type="tertiary" size="small">{settings.dimension === 'category' ? '展示全部模型类型；未归属单列。' : '前 5 项单列，其余合并；未归属单列。'}</Text>
          <Button size="small" theme="borderless" onClick={() => setShowAll(true)}>查看全部（{share.ranked.length}）</Button>
        </div>
      </div>
    </div>}
    {showAll && <Modal visible title={`${title}明细`} width="min(720px, calc(100vw - 32px))" footer={null} closeOnEsc onCancel={() => setShowAll(false)}>
      <div className="admin-analytics-fields">
        <Paragraph type="secondary">{description}</Paragraph>
        <Table rowKey="id" size="small" dataSource={share.ranked} columns={columns(true)} pagination={false} scroll={{ x: 'max(100%, 360px)', y: 360 }}/>
      </div>
    </Modal>}
  </Card>;
}

export function UsageDistribution({ state, range, clock }) {
  const facts = usageFacts(state, range, { types: null, tenant: null, model: null, providers: [], channels: null, user: null }, clock)?.current || [];
  const data = usageDistributions(facts);
  const excluded = [data.pendingTokenCalls ? `${amount(data.pendingTokenCalls)} 次计量待确认` : '', data.nonTokenCalls ? `${amount(data.nonTokenCalls)} 次非 Token 计量` : ''].filter(Boolean);
  const charts = [
    { title: '客户调用量分层', subtitle: '按周期内每客户的调用次数分层', rows: data.customers, unit: '个客户', total: `${amount(data.customerCount)} 个调用客户`, note: data.unknownCustomerCalls ? `${amount(data.unknownCustomerCalls)} 次调用未归属客户，未计入客户数量。` : '' },
    { title: 'Token 分段', subtitle: '按单次请求的总 Token（输入＋输出）分段', rows: data.tokens, unit: '次', total: `${amount(data.tokenCalls)} 次已确认调用`, note: excluded.length ? `${excluded.join('、')}，未计入分段。` : '' },
  ];
  return <Card title={<Title heading={5} component="h2">客户调用量分层与 Token 分段</Title>}>
    {!facts.length ? <Paragraph type="secondary" className="ua-native-chart-empty">所选条件下暂无调用记录</Paragraph> :
      <div className="admin-analysis-plot-grid">{charts.map(chart => <div key={chart.title}>
        <div className="ua-native-fact-row">
          <Title heading={6} component="h3">{chart.title}</Title>
          <Text type="secondary">{chart.total}</Text>
        </div>
        <Paragraph type="tertiary" size="small">{chart.subtitle}</Paragraph>
        <TimeSeriesChart compact showData={false} type="bar" height={250} label={chart.title}
          labels={chart.rows.map(row => row.label.replace('及以上', '+').replace('–', '–\n'))}
          series={[{ label: chart.unit === '次' ? '调用次数' : '客户数量', values: chart.rows.map(row => row.value), total: true, showValues: true }]} unit={chart.unit}/>
        <span className="sr-only">{chart.rows.map(row => `${row.label}：${row.value}${chart.unit}`).join('；')}</span>
        {chart.note && <Paragraph size="small" type="tertiary">{chart.note}</Paragraph>}
      </div>)}</div>}
  </Card>;
}
