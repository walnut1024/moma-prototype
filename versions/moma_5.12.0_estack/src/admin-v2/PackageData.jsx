import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, DatePicker, RadioGroup, Select, Typography } from '@douyinfe/semi-ui';
import AdminPageHeading from './AdminPageHeading';
import { format } from 'date-fns';
import { PACKAGE_KINDS, PACKAGE_STATUS, PACKAGE_USER_TYPES } from './token-packages';
import { filterPackageDemo, packageDemoSummary, packageDemoWindow } from './package-data-demo';
import { operationsPeriodFromQuery, usagePreset, usagePresets, usageWindow } from './usage-analysis';
import './package-production.css';

const route = '#/admin-2/package-data';
const kinds = [{ value: 'all', label: '全部套餐' }, ...Object.entries(PACKAGE_KINDS).map(([value, label]) => ({ value, label }))];
const presets = usagePresets.map(([value, label]) => ({ value, label }));
const pageSize = 20;
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 2 });
const rangeText = ({ start, end }) => start === end ? start : `${start} 至 ${end}`;
const packageName = item => item.name || '未命名套餐';

function pageHref(params, updates) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(updates)) {
    if (value == null) next.delete(key);
    else next.set(key, value);
  }
  return next.size ? `${route}?${next}` : route;
}

const entitlementColumns = [
  { title: '订购时间', width: 170, dataIndex: 'orderedAt' },
  { title: '套餐 ID', width: 156, dataIndex: 'packageId', render: (id, row) => <>
    <div>{id}</div><Typography.Text type="tertiary" size="small">权益 {row.id}</Typography.Text>
  </> },
  { title: '用户 ID', width: 112, dataIndex: 'userId' },
  { title: '账号名', width: 114, dataIndex: 'accountName' },
  { title: '账号类型', width: 120, dataIndex: 'accountType', render: value => PACKAGE_USER_TYPES[value],
    filters: Object.entries(PACKAGE_USER_TYPES).map(([value, text]) => ({ value, text })),
    filterMultiple: false, onFilter: (value, row) => row.accountType === value },
  { title: '套餐档位', width: 105, dataIndex: 'tier' },
  { title: '套餐额度', width: 118, align: 'right', dataIndex: 'quota', render: value => number.format(value) },
  { title: '有效期至', width: 112, dataIndex: 'expires' },
  { title: '状态', width: 92, dataIndex: 'status', render: value => <AdminStatus value={value}/> },
  { title: '已消耗 Tokens', width: 136, align: 'right', dataIndex:'deducted',render:value=>value==null?'—':number.format(value) },
  { title: '剩余额度（Tokens）', width: 166, align: 'right', dataIndex:'remaining',render:value=>value==null?'—':number.format(value) },
  { title: '累计成本（元）', width: 132, align: 'right', dataIndex: 'cost',
    render: value => value === null ? '待核算' : currency.format(value / 100) },
];

export default function PackageData({ state, params }) {
  const [page, setPage] = useState(1);
  const [dateError, setDateError] = useState('');
  const [sample] = useState(() => packageDemoWindow(usagePreset('today').end));
  const heading = useRef(null);
  const previousPackage = useRef(null);
  const overviewScroll = useRef(0);
  const demo = params.get('demo') === '1';
  const packageId = params.get('package');
  const kind = Object.hasOwn(PACKAGE_KINDS, params.get('kind')) ? params.get('kind') : 'all';
  const { period, range } = operationsPeriodFromQuery(params);
  const today = usagePreset('today').end;
  const covered=!demo || range.start>=sample.start && range.end<=sample.end;
  const unavailable='无演示数据';
  const localDay=timestamp=>new Date(Date.parse(timestamp)+8*3600000).toISOString().slice(0,10);
  const orderFacts=(state.packageOrders || []).map(row=>({...row,day:localDay(row.createdAt),expires:localDay(row.expiresAt)}));
  const packageFacts=id=>orderFacts.filter(row=>row.packageId===id && row.day<=range.end);
  const report=item=>{
    if(demo)return covered?packageDemoSummary([filterPackageDemo(item,range)]):null;
    const rows=packageFacts(item.id);
    return {quantity:rows.filter(row=>row.day>=range.start).length,expiredThroughEnd:rows.filter(row=>row.expires<=range.end).length,
      averageConsumptionRate:rows.length && range.end===today?rows.reduce((sum,row)=>sum+row.used/row.entitlement,0)/rows.length:null};
  };
  const records = demo ? sample.records : state.tokenPackages;
  const selected = packageId ? records.find(item => item.id === packageId) : null;
  const rights=selected && covered ? demo?filterPackageDemo(selected,range).entitlements:
    packageFacts(selected.id).filter(row=>row.expires>=range.start).map(row=>{
      const deducted=range.end===today?row.used:null,expired=row.expires<=range.end;
      return { id:row.id,orderedAt:row.day,packageId:row.packageId,userId:row.userId,accountName:row.accountName,
        accountType:row.accountType,tier:PACKAGE_KINDS[selected.kind],quota:row.entitlement,expires:row.expires,
        status:expired?'已到期':row.status,deducted,remaining:deducted==null?null:expired?0:row.entitlement-deducted,cost:null };
    }) : null;

  useLayoutEffect(() => {
    if (packageId) {
      overviewScroll.current = window.scrollY;
      heading.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } else if (previousPackage.current) {
      const source = document.getElementById(`package-data-link-${previousPackage.current}`);
      (source ?? heading.current)?.focus({ preventScroll: true });
      window.scrollTo(0, overviewScroll.current);
    }
    previousPackage.current = packageId;
  }, [packageId]);

  const changeOverview = updates => {
    setPage(1);
    setDateError('');
    location.replace(pageHref(params, updates));
  };
  const overviewHref = pageHref(params, { package: null });
  const changeRange = (start, end) => {
    if (!start || !end) return;
    if (end > today || !usageWindow({ start, end })) {
      setDateError('请选择不晚于今天且不超过 365 天的日期范围。');
      return;
    }
    changeOverview({ period: 'custom', start, end });
  };

  const rows = packageId ? [] : records
    .filter(item => kind === 'all' || item.kind === kind)
    .map(item => ({ ...item, stats:report(item) }));
  const overviewColumns = [
    { title: '套餐名称', width: 240, render: (_, item) =>
      <Typography.Text link={{ href: pageHref(params, { package: item.id }), id: `package-data-link-${item.id}` }}>
        {packageName(item)}
      </Typography.Text>
    },
    { title: '资费ID', width: 160, dataIndex: 'id' },
    { title: '新增销售数', width: 120, align: 'right', render: (_, { stats }) => stats ? number.format(stats.quantity) : unavailable },
    { title: '累计到期数', width: 120, align: 'right', render: (_, { stats }) => stats ? number.format(stats.expiredThroughEnd) : unavailable },
    { title: '额度消耗率（平均值）', width: 180, align: 'right',
      render: (_, { stats }) => !stats ? unavailable : stats.averageConsumptionRate === null ? '—' : percent.format(stats.averageConsumptionRate) },
  ];

  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  return <div className="admin-page-stack">
      <AdminPageHeading title={<span ref={heading} tabIndex={-1}>{selected ? packageName(selected) : packageId ? '套餐详情' : '套餐数据'}</span>}>
        {packageId
          ? <Typography.Text link={{ href: overviewHref }}>返回概览</Typography.Text>
          : <Button onClick={() => changeOverview({ demo: demo ? null : '1' })}>{demo ? '返回套餐记录' : '查看演示数据'}</Button>}
      </AdminPageHeading>
      {packageId ? <>
        {selected ? <>
          <Typography.Text type="tertiary">{selected.id} · {PACKAGE_KINDS[selected.kind]} · {PACKAGE_STATUS[selected.status]} · {rangeText(range)}（北京时间）</Typography.Text>
          {demo && <Typography.Text type="tertiary" role="status">当前为演示数据。</Typography.Text>}
          <Card><section aria-label="已购权益明细">
            <Table size="small" key={selected.id} rowKey="id" dataSource={rights ?? []} columns={entitlementColumns} scroll={{ x: 'max(100%, 1533px)' }}
              pagination={{ pageSize, hideOnSinglePage: true }}
              empty={rights ? '暂无符合条件的权益记录' : unavailable}/>
          </section></Card>
        </> : <Typography.Text role="status">套餐不存在或当前数据来源无此套餐。</Typography.Text>}
      </> : <Card>
        <div className="admin-list-toolbar package-data-filters" role="group" aria-label="套餐数据筛选">
          <RadioGroup type="button" aria-label="统计时间范围" value={period} options={presets}
            onChange={event => changeOverview({ period: event.target.value, start: null, end: null })}/>
          <span id="package-data-date-label" className="sr-only">自定义日期范围</span>
          <DatePicker className="package-data-dates" aria-labelledby="package-data-date-label" type="dateRange"
            value={[range.start, range.end]} format="yyyy-MM-dd" showClear={false}
            disabledDate={date => Boolean(date && format(date, 'yyyy-MM-dd') > today)}
            onChange={(_, dates) => { if (Array.isArray(dates)) changeRange(...dates); }}/>
          <Typography.Text type="tertiary">北京时间</Typography.Text>
          <span id="package-data-kind-label" className="sr-only">套餐类型</span>
          <Select aria-labelledby="package-data-kind-label" value={kind} optionList={kinds}
            onChange={value => changeOverview({ kind: value === 'all' ? null : value })}/>
        </div>
        {dateError && <Typography.Text type="danger" role="alert">{dateError}</Typography.Text>}
        {demo && <Typography.Text type="tertiary" role="status">
          {covered ? '当前为演示数据。' : `所选时间超出演示范围（${rangeText(sample)}）。`}
        </Typography.Text>}
        <section aria-label="套餐汇总">
          <Table size="small" rowKey="id" dataSource={rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)} columns={overviewColumns} scroll={{ x: 'max(100%, 820px)' }}
            pagination={{ pageSize, currentPage, total: rows.length, onPageChange: setPage, hideOnSinglePage: true }}
            empty="暂无套餐记录"/>
        </section>
      </Card>}
    </div>;
}
