import { useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { Button, Table } from '@douyinfe/semi-ui';
import { DEFAULT_PAGE_SIZE, FilterPagination } from './FilterControls';
import FrontPageHeader from './FrontPageHeader';
import { projectTime } from './ProjectConfiguration';

const money=(micros,currency='CNY')=>Number.isSafeInteger(micros)
  ? (currency==='CNY'?'¥ ':currency+' ')+(micros/1_000_000).toLocaleString('zh-CN',{maximumFractionDigits:6}) : '未记录';

export default function WorkspaceBilling({ tenant, project, requestedProject, onOrder }) {
  const [page,setPage]=useState(1), [size,setSize]=useState(DEFAULT_PAGE_SIZE);
  const invalid=requestedProject && project?.id!==requestedProject;
  const records=(tenant.report?.records || []).filter(row=>row.billPeriod && (!project || row.projectId===project.id))
    .toSorted((left,right)=>Date.parse(right.createdAt)-Date.parse(left.createdAt));
  const bills=(tenant.report?.bills || []).toSorted((left,right)=>right.period.localeCompare(left.period));
  const projectName=id=>tenant.projects.find(row=>row.id===id)?.name || id || '未归属项目';
  const current=Math.max(1,Math.min(page,Math.ceil(records.length/size)));
  const allowed=tenant.canManage && !invalid;
  const billColumns=[
    {title:'账期',dataIndex:'period'},
    {title:'账单号',dataIndex:'billNo'},
    {title:'客户应收',align:'right',render:(_,bill)=>money(bill.amountMicros ?? (Number.isFinite(bill.amount) ? Math.round(bill.amount*1_000_000) : null))},
    ...(project ? [{title:'当前项目金额',align:'right',render:(_,bill)=>money(bill.projectBreakdown?.find(row=>row.projectId===project.id)?.amountMicros)}] : []),
    {title:'状态',dataIndex:'status'},
  ];
  const usageColumns=[
    {title:'账期',dataIndex:'billPeriod',width:100},
    {title:'项目',render:(_,row)=>projectName(row.projectId)},
    {title:'请求 ID',render:(_,row)=><code>{row.requestId || row.id}</code>},
    {title:'模型调用名',render:(_,row)=>row.publicModelId || row.modelId},
    {title:'调用时间',width:165,render:(_,row)=>projectTime(row.createdAt)},
    {title:'金额',align:'right',render:(_,row)=>money(row.charge?.micros,row.charge?.currency)},
  ];
  return <div className="project-workspace">
    <FrontPageHeader title="订购与账单" icon={ReceiptText}
      description={tenant.identity && [tenant.identity.tenantName,project?.name].filter(Boolean).join(' · ')}
      actions={allowed && <Button type="tertiary" onClick={onOrder}>查看模型订购</Button>}/>
    {!tenant.identity ? <p className="project-empty" role="status">{tenant.error || '正在加载账单…'}</p>
      : !allowed ? <p className="project-empty" role="status">{invalid ? '当前空间无权访问此项目' : '仅空间管理员可查看客户账单'}</p>
      : <>
        <section className="project-panel" aria-label="客户账单">
          <h2>客户账单</h2>
          <Table columns={billColumns} dataSource={bills} rowKey="id" pagination={false} size="small"
            scroll={{x:520}} empty="当前空间暂无月度账单。" />
        </section>
        <section className="project-panel" aria-label="用量账单">
          <h2>用量账单</h2>
          <Table columns={usageColumns} dataSource={records.slice((current-1)*size,current*size)}
            rowKey={row=>row.requestId || row.id} pagination={false} size="small" scroll={{x:760}}
            empty="当前范围暂无已计入账期的用量。" />
          {records.length > 0 && <FilterPagination total={records.length} page={current} size={size} onPageChange={setPage}
            onSizeChange={value=>{setSize(value);setPage(1);}}/>}
        </section>
      </>}
  </div>;
}
