import { useState } from 'react';
import { Input, Typography } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import TableFieldHelp from '../components/TableFieldHelp';
import Table from './AdminTable';
import { TARIFF_KINDS, tariffDictionaryEntries } from './tariff-dictionary';
import { tariffMeteringDetails } from './tariff-metering';

export default function MaterialDictionary({ state, kind }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const label = TARIFF_KINDS[kind];
  const rows = tariffDictionaryEntries(state).filter(row => row.kind === kind &&
    [row.name, row.englishName, row.code].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const pageSize = 20;
  const currentPage = Math.min(page, Math.ceil(rows.length / pageSize) || 1);
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(row => ({
    ...row, ...tariffMeteringDetails(row),
  }));
  const columns = [
    { title: kind === 'scenario' ? '计费项名称' : kind === 'unit' ? '单位名称' : '货币名称', dataIndex: 'name', width: 220 },
    { title: '英文名称', dataIndex: 'englishName', width: 240, render: value => value || '—' },
    ...(kind === 'currency' ? [{ title: '货币代码', dataIndex: 'code', width: 130 }] : []),
    ...(kind === 'scenario' ? [
      { title: '取数指标', dataIndex: 'usageMetric', width: 180, render: value => value || '—' },
      { title: '计量口径', dataIndex: 'meteringRule', render: value => value || '—' },
      { title: '计费说明', dataIndex: 'description', width: 210, render: value => value || '—' },
    ] : []),
    ...(kind === 'unit' ? [
      { title: '基础单位', dataIndex: 'baseUnit', width: 140, render: value => value || '—' },
      { title: <TableFieldHelp name="换算倍率" description="一个计费单位包含的基础单位数量。"/>, dataIndex: 'multiplier',
        align: 'right', width: 130, render: value => value?.toLocaleString('zh-CN') ?? '—' },
    ] : []),
    { title: '来源', width: 100, render: () => <Typography.Text type="tertiary">内置</Typography.Text> },
  ];
  const tableMinWidth = kind === 'scenario' ? 1160 : kind === 'unit' ? 830 : 680;
  return <>
    <div className="materials-toolbar">
      <div className="materials-filters">
        <Input prefix={<IconSearch aria-hidden/>} showClear aria-label={'搜索' + label}
          placeholder={kind === 'currency' ? '搜索名称、英文名或货币代码' : '搜索名称或英文名'}
          value={query} onChange={value => { setQuery(value); setPage(1); }}/>
      </div>
    </div>
    <Table rowKey="id" columns={columns} dataSource={visibleRows}
      scroll={{ x: `max(100%, ${tableMinWidth}px)` }}
      pagination={{ currentPage, pageSize, total: rows.length, onPageChange: setPage }}
      empty={'没有符合条件的' + label}/>
  </>;
}
