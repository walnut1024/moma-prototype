import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Collapse, Descriptions, Space, Tabs, Toast, Typography } from '@douyinfe/semi-ui';
import { IconCopy } from '@douyinfe/semi-icons';
import AdminCollapsePanel from './AdminCollapsePanel';
import { AdminSideSheet } from './AdminOverlay';
import AdminStatus from './AdminStatus';
import { httpLabel, observationNumber as fmt, observationTime, outcomes } from './call-observations.mjs';
import { buildRequestTrace, readRequestBody, requestLogSections } from './call-log-detail.mjs';

const { Text, Title } = Typography;
const headerFields = new Set(['requestId', 'outcome', 'status', 'duration']);
const traceNotices = { 'not-retained': '本次请求未留存链路明细', expired: '本次请求的链路明细已过期' };
const bodyNotices = {
  'not-retained': '本次请求未留存正文', expired: '本次请求的完整日志已过期',
  denied: '当前账号无权查看完整日志', unavailable: '完整日志不可用',
};
const segmentNotices = { 'not-retained': '此段正文未留存', expired: '此段正文已过期' };
const outcomeColor = { success: 'green', failed: 'red' };
const ms = value => value == null ? '未采集' : fmt(value) + ' ms';
const valueOrUnknown = value => value ?? '未采集';

async function copyText(value, success) {
  try {
    await navigator.clipboard.writeText(value);
    Toast.success(success);
  } catch {
    Toast.error('复制失败，请选中文本后复制');
  }
}

function RequestFacts({ row, trace, resultLabel }) {
  const attempts = trace.attemptCount != null ? fmt(trace.attemptCount) + ' 次'
    : trace.recordedCount ? '已记录 ' + fmt(trace.recordedCount) + ' 次' : '未采集';
  const facts = [
    ['最终结果', <Space wrap>
      <AdminStatus value={resultLabel ?? outcomes[row.outcome]} color={outcomeColor[row.outcome]}/>
      <Text type="secondary">{row.status > 0 ? 'HTTP ' + row.status : httpLabel(row.status)}</Text>
    </Space>],
    ['总耗时', ms(row.duration)], ['首 Token 时延', ms(row.ttft)], ['上游尝试', attempts],
  ];
  return <dl className="admin-request-log-facts" aria-label="请求摘要">
    {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

function RequestMetadata({ row }) {
  const extra = [
    ['登记的模型标识', row.registeredModelId],
    ['错误类型', row.code], ['错误来源', row.errorSource], ['失败原因', row.errorReason],
    ...(row.taskStatus == null ? [] : [['任务终态', row.taskStatus]]),
  ];
  return <div className="admin-request-log-pane admin-analytics-fields">
    {requestLogSections.map(([title, fields]) => <section key={title}>
      <Title heading={6} component="h3">{title}</Title>
      <Descriptions data={fields.filter(([, field]) => !headerFields.has(field)).map(([key, field, format]) => {
        const value = row[field];
        return { key, value: valueOrUnknown(format ? format(value) : typeof value === 'number' ? fmt(value) : value) };
      })}/>
    </section>)}
    <section>
      <Title heading={6} component="h3">补充信息</Title>
      <Descriptions data={extra.map(([key, value]) => ({ key, value: valueOrUnknown(value) }))}/>
    </section>
  </div>;
}

function LogNotice({ title, onSummary }) {
  return <Banner type="info" closeIcon={null} title={title} description={
    <Button size="small" theme="borderless" onClick={onSummary}>查看摘要日志</Button>
  }/>;
}

function TraceNodeDetails({ node, complete }) {
  const { attempt, offset, duration } = node;
  const timing = node.timingConflict ? '计时记录不一致' : offset == null ? '开始时点未采集'
    : '+' + fmt(offset) + (duration == null ? '' : ' 至 +' + fmt(offset + duration)) + ' ms';
  const fields = [
    ['时间', timing],
    ...(duration == null ? [] : [['耗时', ms(duration)]]),
    ...(node.fields ?? []),
  ];
  if (attempt) {
    fields.push(
      ...(attempt.outcome === 'success' ? [['成功原因', attempt.successReason]]
        : attempt.outcome === 'failed' ? [['失败原因', attempt.errorReason ?? attempt.code]] : []),
      ...[['选中原因', attempt.selectionReason], ['后续动作', node.next]].filter(([, value]) => value != null),
      ['上游 HTTP 状态', httpLabel(attempt.status)], ['上游 Request ID', attempt.upstreamRequestId],
      ['尝试开始时间', observationTime(attempt.at)], ['服务商', attempt.providerName], ['渠道', attempt.channelName],
      ['端点', attempt.endpointName], ['上游模型调用标识', attempt.upstreamModelId],
      ...[['错误来源', attempt.errorSource], ['错误类型', attempt.code], ['回退原因', attempt.recordedFallbackReason],
        ['最后一次尝试', complete == null ? null : complete ? '是' : '否']].filter(([, value]) => value != null),
    );
  }
  return <section className="admin-request-trace-selection" aria-label="所选阶段详情" aria-live="polite">
    <Space wrap><Title heading={6} component="h4">{node.label}</Title>
      {node.status && <AdminStatus value={node.status} color={node.tone}/>}
    </Space>
    <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{valueOrUnknown(value)}</dd></div>)}</dl>
  </section>;
}

const ticks = [0, 25, 50, 75, 100];

function RequestTrace({ trace, state, finalChannel, selected, onSelect, onSummary }) {
  const root = useRef(null);
  useEffect(() => {
    root.current?.querySelector('button[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);
  if (!trace.nodes.length) return <LogNotice title={traceNotices[state] ?? '链路明细不可用'} onSummary={onSummary}/>;
  const node = trace.nodes.find(item => item.id === selected);
  const complete = trace.attemptCount === trace.recordedCount;
  const lastAttempt = trace.nodes.reduce((last, item) =>
    item.attempt && (!last || item.attempt.index > last.attempt.index) ? item : last, null);
  const caption = trace.attemptCount === 0 ? '未发起上游尝试' : [finalChannel && '最终渠道 · ' + finalChannel,
    trace.incomplete && '仅展示已记录的节点'].filter(Boolean).join(' · ');
  return <section ref={root} aria-label="请求链路" className={trace.hasChart ? 'admin-request-trace has-chart' : 'admin-request-trace'}>
    <div className="admin-request-trace-heading">
      <Title heading={6} component="h3">{trace.hasChart ? '耗时拆解' : '已记录的链路'}</Title>
      {caption && <Text type="secondary" size="small">{caption}</Text>}
    </div>
    <div className="admin-request-trace-grid admin-request-trace-axis" aria-hidden="true">
      <span>阶段</span>
      {trace.hasChart && <span className="admin-request-trace-track">
        {ticks.map(tick => <span key={tick} style={{ left: tick + '%' }}>{fmt(trace.total * tick / 100)}</span>)}
      </span>}
      <span>耗时 / 时点</span>
    </div>
    {trace.nodes.map(item => {
      const { offset, duration, tone, point } = item;
      const timed = trace.hasChart && offset != null && (point || duration != null);
      const measure = item.timingConflict ? '计时异常' : point && offset != null ? '+' + ms(offset) : ms(duration);
      return <Button key={item.id} theme="borderless" type="tertiary" size="small"
        aria-pressed={selected === item.id} className="admin-request-trace-node" onClick={() => onSelect(item.id)}>
        <span className="admin-request-trace-grid">
          <span className="admin-request-trace-label">{item.label}
            {item.status && <AdminStatus value={item.status} color={tone}/>}
          </span>
          {trace.hasChart && <span className="admin-request-trace-track" aria-hidden="true">
            {timed && <i className={point ? 'admin-request-trace-point' : 'admin-request-trace-bar'}
              data-tone={tone} style={{ left: offset / trace.total * 100 + '%', width: point ? undefined : duration / trace.total * 100 + '%' }}/>}
          </span>}
          <span className="admin-request-trace-measure">{measure}</span>
        </span>
      </Button>;
    })}
    {node && <TraceNodeDetails node={node} complete={complete ? lastAttempt === node : null}/>}
  </section>;
}

function RequestBody({ body, attemptIndex, onSummary }) {
  if (body.state !== 'available') {
    return <LogNotice title={bodyNotices[body.state] ?? bodyNotices.unavailable} onSummary={onSummary}/>;
  }
  const matching = body.segments.filter(segment => attemptIndex != null && segment.attemptIndex === attemptIndex);
  const open = matching.length ? matching : body.segments.slice(0, 1);
  return <section className="admin-request-log-pane" aria-label="已留存的请求与响应">
    <Title heading={6} component="h3">已留存的请求与响应</Title>
    <Collapse defaultActiveKey={open.map(segment => segment.id)} keepDOM={false}>
      {body.segments.map(segment => <AdminCollapsePanel key={segment.id} itemKey={segment.id} header={segment.label}>
        {segment.text != null ? <>
          <pre className="admin-request-log-payload" tabIndex={0}>{segment.text}</pre>
          <Button size="small" theme="borderless" onClick={() => copyText(segment.text, '报文已复制')}>复制此段</Button>
        </> : <Text type="secondary">{segmentNotices[segment.state] ?? '此段正文不可用'}</Text>}
      </AdminCollapsePanel>)}
    </Collapse>
  </section>;
}

export default function RequestLogDetail({ row, attemptId, evidence, canViewFullLog, close }) {
  const trace = buildRequestTrace(row, evidence);
  const [tab, setTab] = useState('trace');
  const [selected, setSelected] = useState(() => attemptId
    ?? trace.nodes.find(node => node.tone === 'red')?.id
    ?? trace.nodes.find(node => node.attempt)?.id
    ?? trace.nodes[0]?.id);
  const tabsRoot = useRef(null);
  const showSummary = () => {
    setTab('summary');
    requestAnimationFrame(() => tabsRoot.current?.querySelector('[role="tab"][aria-selected="true"]')?.focus());
  };
  const title = <div className="admin-request-log-title">
    <Title heading={5} component="h2">请求详情</Title>
    {(row.tenantName || row.projectName) && <Text type="secondary">{[row.tenantName, row.projectName].filter(Boolean).join(' · ')}</Text>}
    <Space wrap>
      <Text code>{row.requestId ?? 'Request ID 未采集'}</Text>
      {row.requestId && <Button size="small" theme="borderless" icon={<IconCopy aria-hidden="true"/>}
        onClick={() => copyText(row.requestId, 'Request ID 已复制')}>复制 Request ID</Button>}
    </Space>
  </div>;
  const attemptIndex = row.attempts.find(attempt => attempt.id === selected)?.index;
  return <AdminSideSheet visible closeOnEsc width="min(920px, 100vw)" className="admin-request-log-sheet"
    label="请求详情" title={title} onCancel={close}>
    <div ref={tabsRoot}>
      <Tabs activeKey={tab === 'raw' && !canViewFullLog ? 'trace' : tab} onChange={setTab} keepDOM={false} tabPaneMotion={false}
        aria-label="请求详情视图" renderTabBar={(props, TabBar) => <div className="admin-request-log-context">
          <TabBar {...props}/>
          <RequestFacts row={row} trace={trace} resultLabel={evidence?.resultLabel}/>
        </div>}>
        <Tabs.TabPane itemKey="summary" tab="摘要日志"><RequestMetadata row={row}/></Tabs.TabPane>
        <Tabs.TabPane itemKey="trace" tab="请求链路">
          <RequestTrace trace={trace} state={evidence?.traceState} finalChannel={row.channelName} selected={selected} onSelect={setSelected} onSummary={showSummary}/>
        </Tabs.TabPane>
        {canViewFullLog && <Tabs.TabPane itemKey="raw" tab="完整日志">
          {tab === 'raw' && <RequestBody body={readRequestBody(evidence)} attemptIndex={attemptIndex} onSummary={showSummary}/>}
        </Tabs.TabPane>}
      </Tabs>
    </div>
  </AdminSideSheet>;
}
