import { useId, useMemo, useState } from 'react';
import { Button, Card, DatePicker, Input, RadioGroup, Tag, Typography } from '@douyinfe/semi-ui';
import { IconActivity, IconPieChart2Stroked, IconSearch } from '@douyinfe/semi-icons';
import { format } from 'date-fns';
import { Chart } from '../components/AnalyticsCharts';
import { AdminModal } from './AdminOverlay';
import AdminStatus from './AdminStatus';
import Table, { AdminPagination } from './AdminTable';
import { dayOf } from './analytics';
import { useChannelText } from './channel-language';
import { packageClaimDemo } from './package-claim-demo.js';
import { packageReport } from './package-order-report.js';
import { usageWindow } from './usage-analysis';
import './package-data.css';

const periods = [['today', '今日'], ['yesterday', '昨日'], ['7d', '近7天'], ['30d', '近30天'], ['custom', '自定义']];
const people = [['individual', '个人'], ['enterprise', '企业']];
const claimGroups = ['个人版-Free', '团队版-Free'];
const seriesColors = ['#2768df', '#00a871', '#8c6ce0', '#ea9b3d'];
const dateTime = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium' });
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const yuan = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });
const numberText = value => Number.isFinite(value) ? number.format(value) : '—';
const moneyText = value => Number.isFinite(value) ? yuan.format(value) : '—';
const dateText = value => Number.isFinite(Date.parse(value)) ? dateTime.format(new Date(value)) : '—';
const tokenParts = value => !Number.isFinite(value) ? ['—', ''] :
  value >= 1e8 ? [numberText(value / 1e8), '亿 Tokens'] : value >= 1e4 ? [numberText(value / 1e4), '万 Tokens'] : [numberText(value), 'Tokens'];
const tokenText = value => tokenParts(value).join(' ').trim();
const emptyRecords = [];
const dayMs = 86400000;

function reportPeriod(params, now) {
  const today = dayOf(now);
  const requested = params.get('period') || (params.has('start') && params.has('end') ? 'custom' : 'today');
  const custom = { start: params.get('start'), end: params.get('end') };
  if (requested === 'custom' && custom.start && custom.end && custom.end <= today && usageWindow(custom, now)) {
    return { period: requested, range: custom };
  }
  const end = requested === 'yesterday' ? dayOf(now - dayMs) : today;
  const days = requested === '7d' ? 7 : requested === '30d' ? 30 : 1;
  return { period: periods.some(([id]) => id === requested && id !== 'custom') ? requested : 'today',
    range: { start: days === 1 ? end : dayOf(now - (days - 1) * dayMs), end } };
}

function ReportCharts({ trend, distribution, demo }) {
  const t = useChannelText();
  const trendTitle = t(demo ? '每日领取趋势' : '每日订购趋势');
  const distributionTitle = t(demo ? '套餐领取分布' : '套餐订购分布');
  const series = people.map(([type, title], index) => ({ type: 'bar', name: t(demo ? claimGroups[index] : title),
    data: trend.map(row => row[type]), barMaxWidth: 22 }));
  const tierColor = (label, index) => seriesColors[claimGroups.includes(label) ? claimGroups.indexOf(label) : (demo ? index + 2 : index) % seriesColors.length];
  const tiers = distribution.map(({ label, value }, index) => ({ name: t(label), value, itemStyle: { color: tierColor(label, index) } }));
  const legend = { bottom: 2, icon: 'roundRect', textStyle: { color: '#4e5969', fontSize: 12 } };
  const bars = {
    animation: false, color: seriesColors, grid: { top: 36, left: 38, right: 18, bottom: 48 },
    legend, tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
    xAxis: { type: 'category', data: trend.map(row => row.label), axisLabel: { hideOverlap: true, color: '#687283' } },
    yAxis: { type: 'value', name: t(demo ? '领取数' : '订购份数'), minInterval: 1, splitNumber: 5,
      axisLabel: { color: '#687283' }, splitLine: { lineStyle: { color: '#dce4f1' } } },
    series,
  };
  const donut = {
    animation: false, legend, tooltip: { trigger: 'item', renderMode: 'richText', formatter: '{b}\n{c} ({d}%)', confine: true },
    series: [{ type: 'pie', radius: ['36%', '64%'], center: ['50%', '46%'], data: tiers,
      label: { color: '#4e5969', formatter: '{b}\n{d}%' }, stillShowZeroSum: false }],
  };
  return <div className="package-report-charts">
    <section className="package-report-chart">
      <h2 className="package-report-chart-heading"><IconActivity aria-hidden="true"/>{trendTitle}</h2>
      <p>{t('按时段汇总 · 个人 vs 企业')}</p>
      <Chart option={bars} height={270} label={trendTitle}/>
    </section>
    <section className="package-report-chart">
      <h2 className="package-report-chart-heading"><IconPieChart2Stroked aria-hidden="true"/>{distributionTitle}</h2>
      <p>{t(demo ? '按套餐档位统计领取次数占比' : '按套餐统计订购次数占比')}</p>
      {tiers.length ? <Chart option={donut} height={270}
        label={distributionTitle + ' — ' + tiers.map(tier => `${tier.name} ${tier.value}`).join('、')}/> :
        <div className="package-report-distribution-empty">{t('暂无数据')}</div>}
    </section>
  </div>;
}

function ReportDetails({ rows, prices, demo, narrowToPackage, showAllPackages }) {
  const t = useChannelText();
  const headingId = useId();
  const [search, setSearch] = useState('');
  const [types, setTypes] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [dialog, setDialog] = useState(null);
  const query = search.trim().toLowerCase();
  const filtered = rows.filter(row => (!types.length || types.includes(row.accountType)) &&
    [row.userId, row.accountName, row.packageId].some(value => String(value ?? '').toLowerCase().includes(query)));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const detailTitle = t(demo ? '领取明细' : '订购明细');
  const columns = [
    { title: demo ? '领取时间' : '订购时间', dataIndex: 'createdAt', width: 158, render: dateText },
    { title: '套餐 ID', dataIndex: 'packageId', width: 154 },
    { title: '实例 ID', dataIndex: 'id', width: 140, ellipsis: { showTitle: true } },
    { title: '用户 ID', dataIndex: 'userId', width: 128 },
    { title: demo ? '用户名' : '租户名称', dataIndex: 'accountName', width: 140 },
    { title: '用户类型', dataIndex: 'accountType', width: 116,
      render: value => people.some(([id]) => id === value) ? t(people.find(([id]) => id === value)[1]) : '—',
      filters: people.map(([value, text]) => ({ value, text: t(text) })), filteredValue: types },
    { title: '套餐档位', dataIndex: 'tier', width: 125, render: value => t(value) },
    { title: '套餐额度', dataIndex: 'entitlement', width: 110, align: 'right', render: tokenText },
    { title: '有效期至', dataIndex: 'expiresAt', width: 158, render: dateText },
    { title: '状态', dataIndex: 'status', width: 96, render: value => value && value !== '—' ? <AdminStatus value={value}/> : '—' },
    { title: demo ? '已消耗 Tokens' : '已抵扣 Tokens', dataIndex: 'used', width: 158, align: 'right',
      render: (value, row) => <span className="package-report-usage">{tokenText(value)}
        <Button size="small" theme="borderless" onClick={() => setDialog(row)}>{t('详情')}</Button>
      </span> },
    { title: '剩余额度（Tokens）', dataIndex: 'remaining', width: 146, align: 'right', render: tokenText },
    { title: '累计成本（元）', dataIndex: 'cost', width: 124, align: 'right',
      render: value => Number.isFinite(value) ? moneyText(value) : t('待核算') },
  ];
  const priceRows = prices.flatMap(row => [
    { ...row, id: `${row.provider}/${row.model}/input`, scenario: '输入 · 百万 Token', rate: row.inputRate },
    { ...row, id: `${row.provider}/${row.model}/output`, scenario: '输出 · 百万 Token', rate: row.outputRate },
  ]);
  const priceColumns = [
    { title: '模型名称', dataIndex: 'model', render: (model, row) => `${row.provider}/${model}` },
    { title: '资费场景', dataIndex: 'scenario', render: value => t(value) },
    { title: '成本价（元/百万 Tokens）', dataIndex: 'rate', align: 'right', render: moneyText },
  ];
  const usage = dialog && dialog !== 'prices' ? dialog.usage : null;
  const usageRows = (usage ?? []).map(item => ({ ...item, id: `${item.provider}/${item.model}`,
    total: item.inputTokens + item.outputTokens }));
  const usageColumns = [
    { title: '服务商 / 模型', dataIndex: 'model', render: (model, row) => `${row.provider}/${model}` },
    { title: '消耗 Tokens', dataIndex: 'total', align: 'right', render: numberText },
  ];
  const close = () => setDialog(null);

  return <>
    <div className="package-report-detail-heading">
      <h2 id={headingId}>{detailTitle}</h2>
      <div className="package-report-detail-controls">
        {narrowToPackage && <Button theme="borderless" onClick={showAllPackages}>{t('查看全部套餐')}</Button>}
        <Button theme="light" type="tertiary" onClick={() => setDialog('prices')}>{t('成本单价')}</Button>
        <Input value={search} onChange={value => { setSearch(value); setPage(1); }} showClear prefix={<IconSearch aria-hidden="true"/>}
          aria-label={t('搜索用户 ID / 用户名 / 套餐 ID')} placeholder={t('搜索用户 ID / 用户名 / 套餐 ID')}/>
      </div>
    </div>
    <section className="package-report-table" aria-labelledby={headingId} tabIndex={0}>
      <Table rowKey="id" columns={columns} dataSource={filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
        scroll={{ x: 'max(100%, 1765px)', y: 530, scrollToFirstRowOnChange: true }}
        onChange={({ extra, filters }) => {
          if (extra?.changeType !== 'filter') return;
          setTypes(filters.find(filter => filter.dataIndex === 'accountType')?.filteredValue ?? []);
          setPage(1);
        }}
        pagination={false}
        empty={demo ? '暂无领取记录' : '暂无订购记录'}/>
    </section>
    <AdminPagination currentPage={currentPage} pageSize={pageSize} pageSizeOpts={[10, 20, 50, 100]}
      total={filtered.length} showSizeChanger onPageChange={setPage}
      onPageSizeChange={value => { setPageSize(value); setPage(1); }}/>
    <Typography.Paragraph type="tertiary" size="small" className="package-report-footnote">
      {t('累计成本 = Σ（模型实际消耗 Tokens × 模型成本单价），按基础 Tokens 口径。')}
    </Typography.Paragraph>
    {dialog && <AdminModal visible title={t(dialog === 'prices' ? '成本单价' : '消耗详情')}
      width="min(720px, calc(100vw - 32px))" onCancel={close} closeOnEsc
      footer={<Button onClick={close}>{t('关闭')}</Button>}>
      {dialog === 'prices' ? <Table rowKey="id" columns={priceColumns} dataSource={priceRows} pagination={false}
        scroll={{ x: 472, y: 420 }} empty="当前数据源未提供模型成本单价。"/> :
        <>
          <Typography.Paragraph type="tertiary">{[dialog.packageId, dialog.userId, t(dialog.tier)].filter(Boolean).join(' · ')}</Typography.Paragraph>
          <Table rowKey="id" columns={usageColumns} dataSource={usageRows} pagination={false} scroll={{ x: 350, y: 340 }}
            empty={usage ? '暂无用量记录' : '当前数据源未提供实例消耗明细。'}/>
          <Typography.Paragraph strong>{t('合计')} {usage ? numberText(usageRows.reduce((sum, row) => sum + row.total, 0)) : '—'}</Typography.Paragraph>
        </>}
    </AdminModal>}
  </>;
}

export default function PackageData({ state, params, refreshRead }) {
  const t = useChannelText();
  const dateLabel = useId();
  const actual = state.packageOrders ?? emptyRecords;
  const [demo, setDemo] = useState(() => actual.length === 0 && !params.has('package'));
  const [now, setNow] = useState(Date.now);
  const [custom, setCustom] = useState(false);
  const [dateError, setDateError] = useState('');
  const [busy, setBusy] = useState(false);
  const sample = useMemo(() => packageClaimDemo(now), [now]);
  const { period, range } = reportPeriod(params, now);
  const selectingCustom = custom || period === 'custom';
  const packageId = params.get('package');
  const source = demo ? sample.orders : actual;
  const orders = packageId ? source.filter(row => row.packageId === packageId) : source;
  const { rows, trend, distribution, totals } = packageReport(orders, state.tokenPackages ?? emptyRecords, range, now);
  const [quotaValue, quotaUnit] = tokenParts(totals.tokens);
  const title = demo ? '套餐申领统计' : '套餐数据';
  const updateQuery = patch => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null) next.delete(key);
      else next.set(key, value);
    }
    location.replace('#/admin-2/package-data' + (next.size ? '?' + next : ''));
  };

  const changePeriod = option => {
    setDateError('');
    setCustom(option === 'custom');
    if (option !== 'custom') updateQuery({ period: option, start: null, end: null });
  };
  const changeDates = dates => {
    if (!Array.isArray(dates) || dates.length !== 2 || !dates.every(Boolean)) return;
    const [start, end] = dates.map(date => format(date, 'yyyy-MM-dd'));
    if (end > dayOf(now) || !usageWindow({ start, end }, now)) {
      setDateError('请选择不晚于今天且不超过 365 天的日期范围。');
      return;
    }
    setDateError('');
    updateQuery({ period: 'custom', start, end });
  };
  const query = async () => {
    setDateError('');
    if (demo) {
      setNow(Date.now());
      return;
    }
    setBusy(true);
    try {
      await refreshRead();
      setNow(Date.now());
    } catch {
      setDateError('套餐数据加载失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  return <div className="package-report">
    <div className="package-report-hero">
      <div>
        <h1>{t(title)}</h1>
        <p>{t(demo ? '查看套餐申领记录及汇总数据。' : '查看套餐订购权益及汇总数据。')}</p>
      </div>
      <div className="package-report-hero-end">
        {demo && <Tag color="blue" size="small">{t('模拟数据')}</Tag>}
        <Button size="small" type="tertiary" theme="borderless" onClick={() => setDemo(value => !value)}>
          {t(demo ? '退出模拟' : '模拟数据')}
        </Button>
        <img width="80" height="80" src={import.meta.env.BASE_URL + 'assets/package-claim-statistics.png'} alt=""/>
      </div>
    </div>
    <Card className="package-report-body">
      <div className="package-report-toolbar">
        <span id={dateLabel}>{t('时间范围')}</span>
        <RadioGroup className="package-report-periods" type="button" aria-labelledby={dateLabel}
          value={selectingCustom ? 'custom' : period} options={periods.map(([value, label]) => ({ value, label: t(label) }))}
          onChange={event => changePeriod(event.target.value)}/>
        {selectingCustom ? <DatePicker className="package-report-dates" type="dateRange" aria-label={t('选择日期范围')}
          placeholder={[t('开始日期'), t('结束日期')]} value={period === 'custom' ? [range.start, range.end] : []}
          format="yyyy-MM-dd" showClear={false} disabledDate={date => Boolean(date && format(date, 'yyyy-MM-dd') > dayOf(now))}
          onChange={(_, dates) => changeDates(dates)}/> :
          <Typography.Text className="package-report-dates" type="tertiary">{range.start} 00:00 — {range.end} 23:59</Typography.Text>}
        <Button className="package-report-query" theme="solid" onClick={query} loading={busy}
          disabled={selectingCustom && period !== 'custom'}>{t('查询')}</Button>
      </div>
      {dateError && <Typography.Paragraph role="alert" type="danger">{t(dateError)}</Typography.Paragraph>}
      <div className="package-report-metrics">
        <div className="package-report-metric">
          <span>{t(demo ? '累计领取' : '累计订购')}</span>
          <div className="package-report-metric-values">
            <div><strong>{numberText(demo ? totals.individualAccounts : totals.individual)}</strong>
              <small>{t(demo ? '人 · 个人版-Free' : '份 · 个人')}</small></div>
            <div><strong>{numberText(demo ? totals.enterpriseAccounts : totals.enterprise)}</strong>
              <small>{t(demo ? '家 · 团队版-Free' : '份 · 企业')}</small></div>
          </div>
        </div>
        <div className="package-report-metric">
          <span>{t('累计发放额度')}</span>
          <div className="package-report-metric-values"><div><strong>{quotaValue}</strong><small>{t(quotaUnit)}</small></div></div>
        </div>
        <div className="package-report-metric">
          <span>{t('累计成本')}</span>
          <div className="package-report-metric-values"><div><strong>{moneyText(totals.cost)}</strong></div></div>
        </div>
      </div>
      <ReportCharts trend={trend} distribution={distribution} demo={demo}/>
      <ReportDetails key={`${demo}/${range.start}/${range.end}/${packageId}`} rows={rows} prices={demo ? sample.prices : emptyRecords}
        demo={demo} narrowToPackage={packageId} showAllPackages={() => updateQuery({ package: null })}/>
    </Card>
  </div>;
}
