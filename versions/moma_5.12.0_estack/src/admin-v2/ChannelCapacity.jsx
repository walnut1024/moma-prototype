import { useChannelText } from './channel-language';
import { useId, useState } from 'react';
import { Button, Checkbox, Input, Popover, Space, Table, Typography } from '@douyinfe/semi-ui';
import { IconChevronDown, IconDelete, IconPlus } from '@douyinfe/semi-icons';
import { AdminSideSheet } from './AdminOverlay';
import { Modal, Notice } from './ModelOperationsUI';
import { appendCapacityMetrics } from './channel-capacity-selection.js';
import { modelChannelName } from './model-channel-name.js';
import { CAPACITY_METRICS, capacityEntries, channelCapacityDraft, parseChannelCapacityDraft } from './channel-capacity';
import { trafficRateText } from './traffic-rates';
import './channel-capacity.css';

const number = value => value == null ? '未配置' : value.toLocaleString('zh-CN');

export function ChannelCapacityCell({ provider, channel, modelName }) {
  const entries = capacityEntries(channel.capacityLimits), remaining = entries.slice(2);
  const renderValue = metric => <>{metric.tokenRate ? trafficRateText(metric.value, 'tpm', true) : number(metric.value)} {metric.unit}</>;
  return <div className="channel-capacity-cell">
    {!entries.length && <Typography.Text type="tertiary">未配置</Typography.Text>}
    {entries.slice(0, 2).map(metric => <div key={metric.key}><span className="channel-capacity-label">{metric.label}</span><span>{renderValue(metric)}</span></div>)}
    {remaining.length > 0 && <Popover trigger="click" position="bottomLeft" showArrow className="channel-capacity-popover"
      content={<div className="channel-capacity-details"><Typography.Title heading={5} component="h3">更多容量指标</Typography.Title>
        <Typography.Paragraph type="tertiary">{modelName} · {provider.name}<br/>{modelChannelName(provider, channel)}</Typography.Paragraph>
        <dl>{remaining.map(metric => <div key={metric.key}><dt>{metric.label}</dt><dd>{renderValue(metric)}</dd></div>)}</dl>
      </div>}>
      <Button theme="borderless" size="small" icon={<IconChevronDown/>} iconPosition="right" data-capacity-channel={channel.id}
        aria-label={'更多容量指标 ' + modelName + ' · ' + provider.name + ' · ' + modelChannelName(provider, channel)}>更多 {remaining.length} 项</Button>
    </Popover>}
  </div>;
}

export default function ChannelCapacityEditor({ provider, association, modelName, ops, close }) {
  const translateLabel = useChannelText();
  const current = provider.catalogConnections?.find(row => row.id === association.id && !row.deletedAt) || association;
  const [limits, setLimits] = useState(() => ({ rpm: '', tpm: '', ...channelCapacityDraft(current.capacityLimits) }));
  const [expectedRevision] = useState(current.capacityRevision || 0);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false), [selected, setSelected] = useState([]);
  const formId = useId();
  const stale = expectedRevision !== (current.capacityRevision || 0);
  const blocked = !ops.can || stale || busy;
  const change = next => { setLimits(next); ops.dirty(true); ops.setError(''); };
  const cancel = () => { if (!busy) ops.proceed(close); };
  const save = async event => {
    event.preventDefault();
    if (blocked) return;
    try {
      const normalized = parseChannelCapacityDraft(limits);
      setBusy(true);
      const next = await ops.run('channelCapacitySave', { providerId: provider.id, endpointId: association.endpointId,
        associationId: association.id, expectedCapacityRevision: expectedRevision, limits: normalized });
      if (next) close();
    } catch (error) { ops.setError(error.message); }
    finally { setBusy(false); }
  };
  return <AdminSideSheet visible className="semi-services channel-capacity-sheet" title={modelChannelName(provider, association) + ' · 容量设置'}
    width="min(960px, 100vw)" onCancel={cancel} closeOnEsc footer={<>
      <Button type="tertiary" disabled={busy} onClick={cancel}>{translateLabel("取消")}</Button>
      <Button theme="solid" form={formId} htmlType="submit" disabled={blocked} loading={busy}>{translateLabel("保存")}</Button>
    </>}>
    <Typography.Paragraph type="tertiary">{provider.name} · {modelName || association.modelId}</Typography.Paragraph>
    {stale && <Notice error>该上游模型容量已有修订，当前输入保留，请关闭并重新打开。</Notice>}
    <form id={formId} className="channel-capacity-form" noValidate onSubmit={save}>
      <div className="channel-capacity-heading"><Typography.Title heading={5} component="h3">容量限额</Typography.Title></div>
      <Table aria-label="上游模型容量设置" rowKey="key" pagination={false} dataSource={CAPACITY_METRICS.filter(metric => Object.hasOwn(limits, metric.key))}
        columns={[
          { title: '指标', dataIndex: 'label', width: 200 },
          { title: '限额', render: (_, metric) => <Input aria-label={metric.label + ' 限额'} inputMode={metric.tokenRate ? 'decimal' : 'numeric'} placeholder="未配置" disabled={blocked}
            value={String(limits[metric.key] ?? '')} onChange={value => change({ ...limits, [metric.key]: value })}/> },
          { title: '单位', dataIndex: 'unit', width: 180 },
          { title: '', width: 50, render: (_, metric) => !['rpm', 'tpm'].includes(metric.key) && <Button theme="borderless" type="tertiary" icon={<IconDelete/>}
            aria-label={'移除 ' + metric.label} disabled={blocked} onClick={() => change(Object.fromEntries(Object.entries(limits).filter(([key]) => key !== metric.key)))}/> },
        ]}/>
      <div><Button size="small" icon={<IconPlus aria-hidden="true"/>} disabled={blocked || Object.keys(limits).length === CAPACITY_METRICS.length}
        onClick={() => { setSelected([]); setAdding(true); }}>添加容量指标</Button></div>
    </form>
    {ops.error && <Notice error>{ops.error}</Notice>}
    {adding && <Modal title="添加容量指标" onClose={() => setAdding(false)} footer={<>
      <Button theme="light" onClick={() => setAdding(false)}>{translateLabel("取消")}</Button>
      <Button theme="solid" disabled={blocked || !selected.length} onClick={() => {
        change(appendCapacityMetrics(limits, selected)); setAdding(false);
      }}>添加所选项</Button>
    </>}>
      <Typography.Paragraph type="secondary" aria-live="polite">已选 {selected.length} 项</Typography.Paragraph>
      <Space vertical align="start">{CAPACITY_METRICS.map(metric => {
        const added = Object.hasOwn(limits, metric.key);
        return <Checkbox key={metric.key} aria-label={metric.label} checked={added || selected.includes(metric.key)} disabled={blocked || added}
          onChange={event => setSelected(keys => event.target.checked ? [...keys, metric.key] : keys.filter(key => key !== metric.key))}>
          {metric.label} · {added ? '已添加' : metric.unit}
        </Checkbox>;
      })}</Space>
    </Modal>}
  </AdminSideSheet>;
}
