import AdminStatus from './AdminStatus';
import { useState } from 'react';
import { Button, Descriptions, Tabs, Typography } from '@douyinfe/semi-ui';
import { Disclosure, GridTable, Row, Cell, Modal } from './ModelOperationsUI';
import { channelAddresses, channelFingerprint, channelLinkedModels, channelRouteRefs } from './provider-channels';
import { supplierChannelCode, supplierChannelName } from './supplier-resources';
import { channelStatus, redactDiagnostic } from './channel-selection';
import './supplier-channel-details.css';

const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : '—';
const source = record => record.source === 'mock' || record.evidenceSource === 'mock' || record.simulated || record.source === 'prototype' ? '模拟检测' : ({ upstream: '接入检查', platform: '平台试调用' })[record.source] || record.source || '未记录';
const safe = value => value == null || value === '' ? '未记录' : String(redactDiagnostic(value));
const stages = { queued: '等待执行', connect: '建立连接', request: '请求上游', parse: '响应解析', poll: '等待异步任务', artifact: '结果文件检查', complete: '执行完成' };
const suggestions = {
  upstream_unauthorized: '核对当前主要密钥和凭证有效状态。',
  upstream_forbidden: '核对此账号是否获准使用该上游模型。',
  upstream_rate_limited: '按建议等待时间重试，并核对共享账号请求上限。',
  account_rate_limit: '等待共享账号请求窗口恢复，或调整账号请求上限。',
  request_timeout: '先查询原任务状态，再决定是否重新测试。',
  cancelled_after_dispatch: '已提交任务的结果未知，请保留原任务记录并查询状态。',
  invalid_response: '核对接口类型、任务地址和当前模型任务。',
  insufficient_balance: '核对上游账号余额或配额，补充后明确重新测试。',
  async_task_failed: '结合上游任务 ID 检查最终失败原因。',
  upstream_unavailable: '稍后明确重试当前模型，其他模型的结果保留。',
  credential_unavailable: '选择未停用、未撤销的凭证，再重新测试。',
};

export default function SupplierChannelDetails({ state, provider, association, ops, close, onEdit }) {
  const [selectedTest, setSelectedTest] = useState(null);
  const endpoint = association.endpoint;
  const history = [...(association.testHistory || []), ...(endpoint.configurationTests || []).filter(row => row.associationId === association.id)]
    .filter((row, index, rows) => !row.id || rows.findIndex(item => item.id === row.id) === index)
    .sort((left, right) => (Date.parse(right.startedAt || right.testedAt || right.createdAt) || 0) - (Date.parse(left.startedAt || left.testedAt || left.createdAt) || 0));
  const services = channelLinkedModels(state, provider, association), routes = channelRouteRefs(state, provider, association);
  const addresses = channelAddresses(provider, association);
  const record = selectedTest && history.find(row => (row.id || row.testedAt) === selectedTest);
  return <Modal drawer wide title="模型渠道详情" description={`${provider.name} · ${supplierChannelName(provider, endpoint)}`} onClose={close}>
    <Tabs className="supplier-channel-details" type="line" defaultActiveKey="configuration" aria-label="模型渠道详情">
      <Tabs.TabPane tab="接入配置" itemKey="configuration">
        <Descriptions data={[
          { key: '渠道', value: <div className="admin-table-record">{supplierChannelName(provider, endpoint)}
            <Typography.Text type="tertiary" size="small">{supplierChannelCode(endpoint)}</Typography.Text></div> },
          { key: '上游模型标识', value: <code>{association.upstreamModelId}</code> },
          { key: '接入状态', value: <AdminStatus value={channelStatus(provider, association)}/> },
          { key: '配置版本', value: endpoint.configurationRevision || 0 },
          { key: '请求地址', value: addresses.map((address, index) => <div className="admin-table-record" key={index}>
            <Typography.Text type="tertiary">{address.protocol}</Typography.Text><code>{String(redactDiagnostic(address.baseUrl))}</code>
          </div>) },
          { key: '凭证', value: endpoint.authMode === 'none' ? '无需认证' : endpoint.authMode === 'group' ? `密钥组 ${endpoint.keyGroupId}` : '渠道当前凭证' },
          { key: '最近检查', value: time(association.health?.testedAt || endpoint.connectionTest?.testedAt) },
          { key: '采购价', value: association.pricing?.scenarios?.length ? `${association.pricing.scenarios.length} 个计费项` : '待配置' },
        ]}/>
        <div className="supplier-channel-detail-actions"><Button theme="light" disabled={!ops.can} onClick={event => onEdit('address', event.currentTarget)}>修改地址</Button><Button theme="light" disabled={!ops.can} onClick={event => onEdit('credentials', event.currentTarget)}>修改密钥</Button><Button theme="light" disabled={!ops.can} onClick={event => onEdit('price', event.currentTarget)}>维护模型成本</Button><Button disabled={!ops.can} onClick={event => onEdit('test', event.currentTarget)}>测试连接</Button></div>
      </Tabs.TabPane>
      <Tabs.TabPane tab="请求适配" itemKey="adapter">
        <Descriptions data={[
          { key: '上游协议', value: endpoint.interfaceType || endpoint.protocol || '待配置' },
          { key: '参数与响应适配', value: endpoint.adapterOptions && Object.keys(endpoint.adapterOptions).length
            ? <pre>{JSON.stringify(redactDiagnostic(endpoint.adapterOptions), null, 2)}</pre> : '使用当前协议默认适配' },
        ]}/>
        <div className="supplier-channel-detail-actions"><Button theme="light" disabled={!ops.can} onClick={event=>onEdit('address',event.currentTarget)}>维护接入与适配</Button></div>
      </Tabs.TabPane>
      <Tabs.TabPane tab="操作记录" itemKey="operations"><GridTable headings={['时间','操作','结果','操作人']} empty={!(state.audits || []).some(row=>[endpoint.id,association.id].includes(row.objectId) || row.endpointId===endpoint.id || row.relatedEndpointIds?.includes(endpoint.id))} emptyMessage="暂无明确归属当前渠道的操作记录。">{(state.audits || []).filter(row=>[endpoint.id,association.id].includes(row.objectId) || row.endpointId===endpoint.id || row.relatedEndpointIds?.includes(endpoint.id)).map(row=><Row key={row.id}><Cell>{time(row.createdAt)}</Cell><Cell>{row.action}</Cell><Cell>{row.result}</Cell><Cell>{row.actorName || row.actor}</Cell></Row>)}</GridTable></Tabs.TabPane>
      <Tabs.TabPane tab="测试记录" itemKey="tests">
        <GridTable headings={['时间 / 任务', '来源', '结果', '耗时', '操作']} empty={!history.length} emptyMessage="尚无测试记录。">
          {history.map((test, index) => <Row key={test.id || index}><Cell>{time(test.startedAt || test.testedAt || test.createdAt)}<small>{test.task || test.templateId || '基础调用'}</small></Cell><Cell>{source(test)}</Cell><Cell><AdminStatus value={test.result || test.status || '未记录'}/>{(test.current === false || test.fingerprint && test.fingerprint !== channelFingerprint(association)) && <small>旧配置记录</small>}</Cell><Cell>{test.durationMs == null ? '—' : `${test.durationMs} ms`}</Cell><Cell><Button type="tertiary" theme="borderless" onClick={() => setSelectedTest(test.id || test.testedAt)}>详情</Button></Cell></Row>)}
        </GridTable>
        {record && <section className="supplier-test-record" aria-label="测试诊断">
          <Typography.Title heading={5} component="h3">测试诊断</Typography.Title>
          <dl className="supplier-test-facts supplier-test-conclusion"><div><dt>结论</dt><dd>{safe(record.result || record.status)}<small>{safe(record.message || record.error?.message)}</small></dd></div><div><dt>请求阶段</dt><dd>{stages[record.phase || record.stage] || safe(record.phase || record.stage)}{(record.statusCode ?? (typeof record.status === 'number' ? record.status : null)) != null && <small>状态码 {record.statusCode ?? record.status}</small>}</dd></div><div><dt>建议</dt><dd>{safe(record.suggestion || record.hint || suggestions[record.code] || (record.result === '通过' ? '无需处理。' : '核对本次任务和配置后，明确重新测试。'))}{record.retryAfter != null && <small>建议等待 {record.retryAfter} 秒</small>}</dd></div><div><dt>用量 / 费用</dt><dd>{record.usage ? '已记录用量' : '用量未知'} / {record.cost == null ? '费用未知' : '已记录费用'}</dd></div></dl>
          <Disclosure title="技术详情"><dl className="supplier-test-facts supplier-test-technical">
            <div><dt>测试 ID</dt><dd><code>{safe(record.id)}</code></dd></div><div><dt>追踪 ID</dt><dd><code>{safe(record.traceId || record.requestId)}</code></dd></div>
            <div><dt>上游请求 ID</dt><dd><code>{safe(record.upstreamRequestId)}</code></dd></div><div><dt>上游任务 ID</dt><dd><code>{safe(record.taskId)}</code></dd></div>
            <div><dt>凭证 ID</dt><dd><code>{safe(record.credentialId || record.credentialIds?.join('、'))}</code></dd></div><div><dt>凭证版本</dt><dd>{safe(record.credentialVersion)}</dd></div>
            <div><dt>渠道配置版本</dt><dd>{safe(record.configurationRevision)}{record.configVersion != null && <small>接入配置 v{safe(record.configVersion)}</small>}</dd></div><div><dt>测试模板版本</dt><dd>{safe(record.templateVersion)}</dd></div>
            <div><dt>操作者</dt><dd>{safe(record.operator)}</dd></div><div><dt>任务 / 专项</dt><dd>{safe(record.task)}{record.check && <small>{safe(record.check)}</small>}</dd></div>
            <div><dt>开始时间</dt><dd>{time(record.startedAt)}</dd></div><div><dt>结束时间</dt><dd>{time(record.endedAt || record.testedAt)}</dd></div>
            <div><dt>服务商 / 渠道 / 映射</dt><dd><code>{safe(record.providerId)}</code><code>{safe(record.endpointId)}</code><code>{safe(record.associationId)}</code></dd></div><div><dt>来源 / 错误码</dt><dd>{source(record)}<small>{safe(record.code)}</small></dd></div>
          </dl><pre aria-label="用量与费用摘要">{JSON.stringify(redactDiagnostic({ source: record.source || null, simulated: record.simulated ?? null, usage: record.usage ?? null, cost: record.cost ?? null }), null, 2)}</pre></Disclosure>
        </section>}
      </Tabs.TabPane>
      <Tabs.TabPane tab="关联服务" itemKey="services">
        <GridTable headings={['模型服务', '服务模式', '状态', '操作']} empty={!services.length} emptyMessage="尚未关联模型服务。">
          {services.map(model => <Row key={model.id}><Cell>{model.name}<small>{model.modelId}</small></Cell><Cell>{model.serviceMode === 'standard' ? '统一模型服务模式' : model.serviceMode === 'provider' ? '渠道直选模式' : '待配置'}</Cell><Cell><AdminStatus value={model.listingStatus || model.status || '—'}/></Cell><Cell><Button type="tertiary" theme="borderless" onClick={() => { close(); ops.go({ model: model.id, panel: null }, { base: 'listing' }); }}>前往服务管理</Button></Cell></Row>)}
        </GridTable>
        {routes.length > 0 && <p className="supplier-price-hint">被 {routes.length} 项生效路由引用。</p>}
      </Tabs.TabPane>
    </Tabs>
  </Modal>;
}
