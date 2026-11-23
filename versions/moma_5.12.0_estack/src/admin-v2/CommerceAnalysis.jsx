import { useState } from 'react';
import { Card, Descriptions, Space } from '@douyinfe/semi-ui';
import AdminPageHeading from './AdminPageHeading';
import Table from './AdminTable';
import { Choice } from './ServiceUI';
import { TimeSeriesChart } from '../components/AnalyticsCharts';

function sum(values) {
  const amounts = values.filter(Number.isFinite);
  return amounts.length ? amounts.reduce((total, value) => total + value, 0) : null;
}
const money = value => value?.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) ?? '—';

export default function CommerceAnalysis({ state }) {
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
  return <div className="admin-page-stack">
    <AdminPageHeading title="经营分析"/>
    <Card>
      <Space wrap><Choice label="账期" value={period} options={[['', '全部账期'], ...periods.map(value => [value, value])]} onChange={setPeriod}/></Space>
      <Descriptions data={[
        { key: '账单应收', value: money(sum(rows.map(row => row.billed))) },
        { key: '账单实收', value: money(sum(rows.map(row => row.paid))) },
        { key: '账单租户数', value: byCustomer.size },
      ]}/>
    </Card>
    {activePeriods.length > 0 && <Card title="月度账单"><TimeSeriesChart labels={activePeriods}
      series={[{ label: '应收金额', values: activePeriods.map(month => sum(byMonth.get(month).map(bill => bill.amount))) }]}
      label="月度账单" unit="元" type="bar"/></Card>}
    <Card title="租户账单排行">
      <Table size="small" rowKey="id" dataSource={rows} pagination={false} empty="暂无账单"
        columns={[{ title: '租户', dataIndex: 'name' }, { title: '应收金额', dataIndex: 'billed', render: money }, { title: '实收金额', dataIndex: 'paid', render: money }]}/>
    </Card>
  </div>;
}
