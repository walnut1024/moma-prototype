import { useState } from 'react';
import { Button, Space, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import Table from './AdminTable';
import { AdminSideSheet } from './AdminOverlay';
import { Notice } from './ServiceUI';
import { exportModelResources, importModelResources, resourceRows } from './model-resource-transfer.js';
import { operationsTransaction } from './model-operations.js';
import './model-resource-transfer.css';
import { RESOURCE_SCHEMA, resourcePageTarget, resourceTargetLabel, resourceKey } from './model-resource-scope.js';

export function openResourceJson(ops, target, onView) {
  ops.proceed(() => {
    onView?.();
    const scrollY = window.scrollY;
    ops.go({ resourceJson: '1', resourceTarget: JSON.stringify(target) }, { saved: true, preserveScroll: true });
    history.replaceState({ ...history.state, modelResourceJsonScroll: scrollY }, '');
  });
}

export default function ModelResourceTransfer({ state, ops, scope, target: selectedTarget, onView, hideView = false }) {
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [plan, setPlan] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const close = () => { if (!busy) ops.proceed(() => { setOpen(false); setText(''); setPlan(null); setError(''); ops.dirty(false); }); };
  let target, targetError;
  try { target = selectedTarget || resourcePageTarget(state, scope, ops.params); } catch (issue) { targetError = issue.message; }
  const openEditor = () => ops.proceed(() => {
    setOpen(true); setText('');
    setPlan(null); setError(''); ops.dirty(false); ops.setError('');
  });
  const edit = value => { setText(value); setPlan(null); setError(''); ops.dirty(Boolean(value.trim())); };
  const parse = () => {
    if (new Blob([text]).size > 10 * 1024 * 1024) throw Error('JSON 内容不能超过 10 MB');
    if (!text.trim()) throw Error('请填写 JSON 内容');
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  };
  const preview = () => {
    setPlan(null); setError('');
    try {
      const value = parse();
      if (value?.scope !== scope) throw Error('JSON 范围与当前模块不一致');
      const result = importModelResources(state, value, operationsTransaction, target);
      const affected = new Set(result.changes.filter(change => change.collection === 'endpoints' && ['baseUrl','protocol','interfaceType','taskUrls'].some(field => Object.hasOwn(change.changes || {}, field))).map(change => change.id));
      setPlan({ value, changes: result.changes.length, impacts: resourceRows(state, 'channels').filter(row => row.type === 'channel' && affected.has(row.connection_id)) });
      ops.dirty(result.changes.length > 0);
    } catch (issue) { setError(issue.message); }
  };
  const format = () => {
    try { setText(JSON.stringify(parse(), null, 2)); setError(''); }
    catch (issue) { setError(issue.message); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); Toast.success('完整 JSON 已复制'); }
    catch { Toast.error('复制失败，请选择文本复制'); }
  };
  return <>
    <Space>{!hideView && <Button disabled={Boolean(targetError)} onClick={() => openResourceJson(ops, target, onView)}>查看 JSON</Button>}
      {scope !== 'services' && !(scope === 'channels' && target?.level === 'provider') && <Button disabled={!ops.can || Boolean(targetError)} onClick={openEditor}>批量维护</Button>}</Space>
    {open && <AdminSideSheet visible title={resourceTargetLabel(state, scope, target) + ' · 批量维护'}
      width="min(1440px, 96vw)" className="semi-services model-resource-sheet" closeOnEsc onCancel={close} footer={<>
        <Button disabled={busy} onClick={close}>取消</Button>
        <Button theme="solid" loading={busy} disabled={!ops.can || busy || !plan?.changes || plan.value.revision !== state.revision || Boolean(ops.conflict)} onClick={async () => {
          setBusy(true);
          try { if (await ops.run('importModelResources', { file: plan.value, target })) { setOpen(false); setPlan(null); setText(''); ops.dirty(false); } }
          finally { setBusy(false); }
        }}>确认保存</Button>
      </>}>
      <div className="model-resource-content">
        <Typography.Paragraph>保留永久 ID 和只读关联，修改配置后校验并预览。每批最多 500 行；价格变更生成新版本。</Typography.Paragraph>
        <Space wrap>
          <Button onClick={copy} disabled={!text || busy}>复制完整 JSON</Button>
          <Button onClick={format} disabled={busy || !text.trim()}>格式化 JSON</Button>
          <Button theme="solid" onClick={preview} disabled={busy || !ops.can || !text.trim()}>校验并预览</Button>
          {scope === 'services' && <Button disabled={busy} onClick={() => ops.proceed(() => edit(JSON.stringify({ ...exportModelResources(state, scope, target), schema: RESOURCE_SCHEMA, operation: 'link',
            rows: [{ model_service_id: target.model_service_id || '', channel_id: '' }] }, null, 2)))}>填入渠道关联模板</Button>}
        </Space>
        <TextArea className="model-resource-json" aria-label="模型运营维护 JSON" value={text} disabled={busy}
          rows={18} spellCheck={false} placeholder="粘贴完整的模型运营维护 JSON" onChange={edit}/>
        {plan && <><Notice>{plan.value.rows.length} 行已校验，{plan.changes ? '存在待保存变更' : '与当前记录一致，无需保存'}。</Notice>
          <Table scroll={{ x: 900 }} rowKey={row => row.id ? resourceKey(row) : row.model_service_id + ':' + row.channel_id} pagination={{ pageSize: 10 }} dataSource={plan.value.rows} columns={[
            { title: '对象', render: (_,row) => ({provider:'服务商',provider_model:'模型登记（只读）',connection:'连接',channel:'渠道',model_service:'模型服务',market_model:'广场展示信息',market_service:'广场服务设置',sale_price:'服务售价'})[row.type] || '模型服务渠道关联', width: 150 },
            { title: '对象 ID／标识', render: (_,row) => row.id || row.model_service_id, width: 300 },
            { title: '模型编码', dataIndex: 'canonical_slug', width: 160 },
            { title: scope === 'channels' ? '上游模型调用标识' : '模型调用标识', dataIndex: scope === 'channels' ? 'upstream_model_id' : 'call_id', width: 190 },
          ]}/>{plan.impacts.length > 0 && <>
            <Notice>共享连接变更将影响以下 {plan.impacts.length} 条渠道，相关技术验证需重新完成。</Notice>
            <Table rowKey={resourceKey} pagination={{ pageSize: 10 }} dataSource={plan.impacts} scroll={{ x: 900 }} columns={[
              { title: '模型编码', dataIndex: 'canonical_slug', width: 180 }, { title: '渠道 ID', dataIndex: 'id', width: 300 },
              { title: '上游模型调用标识', dataIndex: 'upstream_model_id', width: 220 }, { title: 'Provider ID', dataIndex: 'provider_id', width: 280 },
            ]}/>
          </>}</>}
        {(error || ops.error) && <Notice error>{error || ops.error}</Notice>}
      </div>
    </AdminSideSheet>}
  </>;
}
