import { useMemo } from 'react';
import { Card, Typography } from '@douyinfe/semi-ui';
import Table from './AdminTable';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import { userBusinessData } from '../business-facts.mjs';
import { userMetrics, userTokenGroups } from './user-analysis';
import { usagePreset } from './usage-analysis';
import { analysisFilters, operationFacts } from './operations-analysis';

const { Title, Text, Paragraph } = Typography;
const count = value => value == null ? '未采集' : value.toLocaleString('zh-CN');

export function TodayOperations({ state, now, total }) {
  const today = usagePreset('today', now);
  const users = useMemo(() => userMetrics(userBusinessData(state), today, now), [state, today.start, now]);
  return <Card title={<Title heading={5} component="h2">今日运营数据</Title>}>
    <Text type="tertiary" size="small">{today.start} · 北京时间 · 截至 {new Date(now).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</Text>
    <div className="admin-analysis-metrics admin-analysis-metrics-four">{[
      ['新增用户', users?.current.added ?? null], ['登录用户', users?.current.login ?? null],
      ['调用活跃用户', users?.current.active ?? null], ['Token 消耗', total],
    ].map(([title, value]) => <div key={title} className="admin-analysis-metric">
      <Text type="secondary">{title}</Text><Title heading={4} component="span">{count(value)}</Title>
    </div>)}</div>
  </Card>;
}

export function UserActivityAnalysis({ state, range, clock, metrics }) {
  const rows = useMemo(() => operationFacts(state, range, analysisFilters(), clock), [state, range, clock]);
  const groups = userTokenGroups(rows);
  const ranked = groups.filter(row => row.id !== '__unknown__').sort((a, b) => (b.tokens ?? -1) - (a.tokens ?? -1) || a.id.localeCompare(b.id));
  const trend = (metrics?.trend || []).map(bucket => {
    const facts = rows.filter(row => row.at >= bucket.start && row.at < bucket.end && row.unit === 'Token');
    return facts.some(row => !row.value.complete) ? null : facts.reduce((sum, row) => sum + row.value.total, 0);
  });
  const unknown = groups.find(row => row.id === '__unknown__');
  return <>
    <div className="admin-analysis-plot-grid">
      <Card title={<Title heading={5} component="h2">用户行为趋势</Title>}>
        <TimeSeriesChart labels={metrics?.labels || []} unit="人" label="用户行为趋势" height={240}
          series={[[ '新增注册', 'added' ], [ '登录用户', 'login' ], [ '调用活跃用户', 'active' ]]
            .map(([label, key]) => ({ label, values: (metrics?.trend || []).map(row => row[key]) }))}/>
      </Card>
      <Card title={<Title heading={5} component="h2">用户 Token 用量趋势</Title>}>
        <TimeSeriesChart labels={metrics?.labels || []} unit="Token" label="用户 Token 用量趋势" height={240}
          series={[{ label: '已计量 Token', values: trend }]}/>
      </Card>
    </div>
    <Card title={<Title heading={5} component="h2">用户 Token 用量排行</Title>}>
      <Table key={range.start + range.end} rowKey="id" size="small" dataSource={ranked} pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 'max(100%, 620px)' }} empty="所选范围暂无可归属用户的调用记录" columns={[
          { title: '排名', key: 'rank', render: (_, __, index) => index + 1 },
          { title: '用户', dataIndex: 'id', render: id => <><Text>{state.users.find(row => row.id === id)?.name || id}</Text><Paragraph type="tertiary" size="small">{id}</Paragraph></> },
          { title: '已计量 Token', dataIndex: 'tokens', align: 'right', render: count },
          { title: '调用次数', dataIndex: 'calls', align: 'right', render: count },
          { title: '计量待确认', dataIndex: 'pendingTokens', align: 'right', render: count },
        ]}/>
      {unknown && <Paragraph type="tertiary" size="small">{count(unknown.calls)} 次调用未采集用户，不参与用户排行。</Paragraph>}
    </Card>
  </>;
}
