import { useId, useState } from 'react';
import { Button, Card, Select, Table, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconChevronDown, IconChevronRight, IconDownload, IconSort } from '@douyinfe/semi-icons';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, FilterToolbar, FilterReset } from '../components/FilterControls';
import { SelectedConditions } from '../components/SavedFilterViews';
import { customerModelDetails } from './analytics';
import { formatUsageNumber } from './usage-analysis';

const columns = [['model','模型'],['customer','客户名称'],['customerId','客户 ID'],['total','计量用量'],['calls','请求记录数'],['success','HTTP 请求成功率'],['peakTpm','区间峰值 TPM'],['avgTpm','区间平均 TPM'],['activeDays','有调用天数']];
const detailColumns = [['dailyUsage','日均用量'],['endUsage','结束日用量'],['avgRpm','区间平均 RPM'],['maxRpm','区间峰值 RPM'],['ttft','平均 TTFT (ms)'],['maxTtft','最大 TTFT (ms)'],['ttftSamples','TTFT 样本数'],['maxInput','最大输入 Token'],['avgInput','平均输入 Token'],['maxOutput','最大输出 Token'],['avgOutput','平均输出 Token'],['customerType','客户类型'],['pending','待确认请求数']];
const display = value => value == null ? '—' : typeof value === 'number' ? value > 0 && value < 0.01 ? '<0.01' : formatUsageNumber(value) : value;
const statusLabels = ['成功','400','5xx','0','其他'];

function StatusBar({ row }) {
  const label = row.statuses.map((count, index) => `${statusLabels[index]}：${count} 次`).join('，') + `，请求记录数 ${row.calls}`;
  return <div className="admin-analysis-status">
    <Tooltip trigger="hover" content={<div className="admin-analysis-status-key">
      {row.statuses.map((count, index) => <div key={statusLabels[index]}>
        <span><i className={`an-status-${index}`}/>{statusLabels[index]}</span><b>{display(count)}</b><span>{(count / row.calls * 100).toFixed(1)}%</span>
      </div>)}
      <Typography.Text strong>请求记录数 {display(row.calls)}</Typography.Text>
    </div>}>
      <Button theme="borderless" type="tertiary" size="small" aria-label={label}>
        <span className="admin-analysis-status-bar" aria-hidden="true">
          {row.statuses.map((count, index) => <span key={statusLabels[index]} className={`an-status-${index}`} style={{ width: count / row.calls * 100 + '%' }}/>)}
        </span>
      </Button>
    </Tooltip>
    <Typography.Text>{row.success.toFixed(2)}%</Typography.Text>
  </div>;
}

function DetailPick({ label, value, onChange, options }) {
  const id = useId();
  return <div className="admin-analysis-field">
    <Typography.Text id={id} type="secondary">{label}</Typography.Text>
    <Select aria-labelledby={id} filter value={value} optionList={options} onSelect={onChange} placeholder={options[0]?.label}/>
  </div>;
}

export default function UserCallDetails({ state, rows, start, end, draft, onDraftChange, query, onQueryChange, conditionGroups }) {
  const [sort,setSort]=useState({key:'total',direction:-1}), [page,setPage]=useState(0), [size,setSize]=useState(DEFAULT_PAGE_SIZE), [expanded,setExpanded]=useState(null);
  const details=customerModelDetails(state,rows,start,end);
  const modelOptions=[{value:'',label:'全部模型'},...[...new Set(state.models.map(model=>model.name))].sort((a,b)=>a.localeCompare(b,'zh-CN')).map(value=>({value,label:value}))];
  const customerOptions=[{value:'',label:'全部客户'},...[...new Map(state.tenants.map(row=>[row.id,{value:row.id,label:`${row.name} · ${row.id}`}])).values()].sort((a,b)=>a.label.localeCompare(b.label,'zh-CN'))];
  const data=details.filter(r=>(!query.model||r.model===query.model)&&(!query.customer||r.customerId===query.customer)).sort((a,b)=>{
    if(a[sort.key]==null)return b[sort.key]==null?0:1;
    if(b[sort.key]==null)return -1;
    return sort.direction*(typeof a[sort.key]==='number'?a[sort.key]-b[sort.key]:String(a[sort.key]).localeCompare(String(b[sort.key]),'zh-CN'));
  });
  const current = Math.min(page, Math.max(0, Math.ceil(data.length / size) - 1));
  function exportCsv() {
    try {
    const escape=value=>'"'+String(value??'—').replaceAll('"','""')+'"';
    const exportColumns=[...columns,['unit','计量单位'],...detailColumns];
    const csv=[exportColumns.map(([,label])=>label),...data.map(r=>exportColumns.map(([key])=>key==='success'&&r.success!=null?`${r.success.toFixed(2)}%`:r[key]))].map(row=>row.map(escape).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`客户模型调用明细_${start}_${end}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000); Toast.success("已开始下载调用明细");
    } catch { Toast.error("导出失败，请重试"); }
  }
  const detail = row => <dl className="admin-analysis-detail-fields">
    {detailColumns.filter(([key]) => !['maxInput', 'avgInput', 'maxOutput', 'avgOutput'].includes(key) || row.unit === 'Token')
      .filter(([key]) => !['ttft', 'maxTtft', 'ttftSamples'].includes(key) || row.ttftSamples > 0)
      .map(([key, label]) => <div key={key}>
        <dt><Typography.Text type="tertiary">{label}</Typography.Text></dt>
        <dd><Typography.Text strong>{display(row[key])}{['dailyUsage', 'endUsage'].includes(key) && row[key] != null ? ` ${row.unit}` : ''}</Typography.Text></dd>
      </div>)}
  </dl>;
  const renderValue = (key, row) => {
    if (key === 'success') return row.success == null || !row.calls ? '—' : <StatusBar row={row}/>;
    if (key === 'customer') return <Typography.Text link={{ href: `#/admin-2/customer-usage-detail?customer=${encodeURIComponent(row.customerId)}&start=${start}&end=${end}`,
      onClick: () => window.scrollTo(0, 0) }}>{row.customer}</Typography.Text>;
    if (key === 'total') return <>
      <Typography.Text>{row.total == null ? '—' : `${display(row.total)} ${row.unit}`}</Typography.Text>
      {row.pending > 0 && <Typography.Paragraph type="tertiary" size="small">{row.pending} 条待确认</Typography.Paragraph>}
    </>;
    return display(row[key]);
  };
  const tableColumns = columns.map(([key, label]) => ({
    key,
    title: <Button size="small" theme="borderless" type="tertiary" icon={<IconSort aria-hidden="true"/>} iconPosition="right"
      onClick={() => { setSort({ key, direction: sort.key === key ? -sort.direction : -1 }); setPage(0); }}>{label}</Button>,
    onHeaderCell: () => ({ 'aria-sort': sort.key === key ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none' }),
    align: ['model', 'customer', 'customerId'].includes(key) ? 'left' : 'right',
    render: (_, row) => renderValue(key, row),
  }));
  return <Card title={<Typography.Title heading={5} component="h2">调用明细</Typography.Title>}>
    <div className="admin-analysis-details admin-analytics-fields">
      <form onSubmit={event => { event.preventDefault(); onQueryChange(draft); setPage(0); }}>
        <FilterToolbar>
          <DetailPick label="调用明细模型" value={draft.model} onChange={model => onDraftChange({ ...draft, model })} options={modelOptions}/>
          <DetailPick label="调用明细客户名称或 ID" value={draft.customer} onChange={customer => onDraftChange({ ...draft, customer })} options={customerOptions}/>
          <Button theme="solid" htmlType="submit">查询</Button>
          <FilterReset onClick={() => { onDraftChange({ model: '', customer: '' }); onQueryChange({ model: '', customer: '' }); setPage(0); }}/>
          <Button icon={<IconDownload aria-hidden="true"/>} disabled={!data.length} onClick={exportCsv}>导出表格</Button>
        </FilterToolbar>
      </form>
      {conditionGroups && <SelectedConditions groups={conditionGroups} label="已选条件（仅调用明细）"/>}
      <Typography.Paragraph type="tertiary">计量用量仅汇总已确认请求，并按模型单位分别统计；TPM 仅适用于 Token 模型。区间平均 TPM／RPM 包含无调用分钟。</Typography.Paragraph>
      <Table rowKey="id" size="small" scroll={{ x: 'max(100%, 1120px)' }} dataSource={data.slice(current * size, (current + 1) * size)}
        hideExpandedColumn expandIcon={false}
        expandedRowKeys={expanded ? [expanded] : []} expandedRowRender={detail}
        pagination={{ currentPage: current + 1, total: data.length, pageSize: size, pageSizeOpts: PAGE_SIZES, showTotal: true, showSizeChanger: true,
          onPageChange: page => setPage(page - 1), onPageSizeChange: value => { setSize(value); setPage(0); } }}
        empty="暂无匹配记录，请调整模型、客户或上方日期筛选。" columns={[
          ...tableColumns,
          { title: '详情', key: 'details', render: (_, row) => <Button theme="borderless" size="small" type="tertiary"
            icon={expanded === row.id ? <IconChevronDown aria-hidden="true"/> : <IconChevronRight aria-hidden="true"/>}
            aria-label={`${row.customer} ${row.model} 调用详情`} aria-expanded={expanded === row.id}
            onClick={() => setExpanded(expanded === row.id ? null : row.id)}/> },
        ]}/>
    </div>
  </Card>;
}
