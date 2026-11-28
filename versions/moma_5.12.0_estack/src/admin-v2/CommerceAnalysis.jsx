import { useChannelText } from './channel-language';
import { useState } from 'react';
import { XaCard as Card, XaChoice as Choice, XaSpace as Space } from './xa24/HaloComponents.jsx';
import AdminPageHeading from './AdminPageHeading';
import Table from './xa24/HaloTable.jsx';
import { TimeSeriesChart } from '../components/AnalyticsCharts';

function sum(values) {
  const amounts = values.filter(Number.isFinite);
  return amounts.length ? amounts.reduce((total, value) => total + value, 0) : null;
}
const money = value => value?.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) ?? '—';
const allPeriods = '__all__';

export default function CommerceAnalysis({ state }) {
  const translateLabel = useChannelText();
  const [period, setPeriod] = useState('');
  const periods = [...new Set(state.bills.map(row => row.period).filter(Boolean))].sort();
  const facts = state.bills.filter(row => !period || row.period === period);
  const byCustomer = Map.groupBy(facts, row => row.tenantId);
  const byMonth = Map.groupBy(facts, row => row.period);
  const rows = [...byCustomer].map(([id, bills]) => ({
    id, name: state.tenants.find(tenant => tenant.id === id)?.name || '未记录',
    billed: sum(bills.map(bill => bill.amount)),
    paid: sum(bills.map(bill => bill.paid)),
  })).sort((a, b) => (b.billed ?? -Infinity) - (a.billed ?? -Infinity));
  const activePeriods = periods.filter(month => !period || month === period);
  return <div className="admin-page-stack xa24-page">
    <AdminPageHeading title={translateLabel("经营分析")} className="xa24-entry-header"/>
    <Card className="xa24-page-card">
      <Space wrap>
        <Choice label="账期" value={period || allPeriods}
          options={[[allPeriods, '全部账期'], ...periods.map(value => [value, value])]}
          onChange={value => setPeriod(value === allPeriods ? '' : value)}/>
      </Space>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 16, marginBlock: '16px 0' }}>
        {[
          ['账单应收', money(sum(rows.map(row => row.billed)))],
          ['账单实收', money(sum(rows.map(row => row.paid)))],
          ['账单租户数', byCustomer.size],
        ].map(([label, value]) => <div className="xa24-metric-card" key={label}>
          <dt>{translateLabel(label)}</dt><dd className="xa24-metric-value" style={{ marginInlineStart: 0 }}>{value}</dd>
        </div>)}
      </dl>
    </Card>
    {activePeriods.length > 0 && <Card title="月度账单" className="xa24-page-card"><TimeSeriesChart labels={activePeriods}
      series={[{ label: '应收金额', values: activePeriods.map(month => sum(byMonth.get(month).map(bill => bill.amount))) }]}
      label="月度账单" unit="元" type="bar"/></Card>}
    <Card title="租户账单排行" className="xa24-page-card">
      <Table size="small" rowKey="id" dataSource={rows} pagination={false} empty="暂无账单"
        columns={[{ title: '租户', dataIndex: 'name' }, { title: '应收金额', dataIndex: 'billed', render: money }, { title: '实收金额', dataIndex: 'paid', render: money }]}/>
    </Card>
  </div>;
}
