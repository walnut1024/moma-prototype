import { useLayoutEffect, useMemo, useState } from 'react';
import { Button, Space, Toast, Typography } from '@douyinfe/semi-ui';
import AdminPageHeading from './AdminPageHeading';
import { exportModelResources } from './model-resource-transfer.js';
import './model-resource-transfer.css';
import { resourcePageTarget, resourceTargetLabel } from './model-resource-scope.js';
import { Notice } from './ServiceUI';
import ModelResourceTransfer from './ModelResourceTransfer';
import JsonDocument from './JsonDocument';

export default function ModelResourceJsonPage({ state, ops, scope }) {
  const result = useMemo(() => {
    try {
      const target = resourcePageTarget(state, scope, ops.params);
      const document = exportModelResources(state, scope, target);
      return { target, rows: document.rows, text: JSON.stringify(document, null, 2), title: resourceTargetLabel(state, scope, target) + ' · JSON' };
    } catch (error) { return { error: error.message, title: 'JSON' }; }
  }, [state, scope, ops.params]);
  const text = result.text;
  const [returnScroll] = useState(() => Number.isFinite(history.state?.modelResourceJsonScroll) ? history.state.modelResourceJsonScroll : 0);
  const params = new URLSearchParams(ops.params);
  params.delete('resourceJson');
  params.delete('resourceTarget');
  const returnHash = location.hash.split('?')[0] + (params.size ? '?' + params : '');
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    return () => { requestAnimationFrame(() => { if (location.hash === returnHash) window.scrollTo(0, returnScroll); }); };
  }, [returnHash, returnScroll]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); Toast.success('完整 JSON 已复制'); }
    catch { Toast.error('复制失败，请选择文本复制'); }
  };
  return <section className="admin-page-stack model-resource-page">
    <AdminPageHeading title={result.title}><Space wrap>
      <Button onClick={() => ops.go({ resourceJson: null, resourceTarget: null }, { preserveScroll: true })}>返回来源页面</Button>
      <Button onClick={copy} disabled={!text}>复制完整 JSON</Button>
      {!result.error && scope !== 'services' && <ModelResourceTransfer state={state} ops={ops} scope={scope} target={result.target} hideView/>}
    </Space></AdminPageHeading>
    {!result.error && scope === 'channels' && <Typography.Paragraph type="tertiary">
      {[['provider', '服务商'], ['provider_model', '模型登记'], ['connection', '连接'], ['channel', '模型渠道']].map(([type, label]) => `${label} ${result.rows.filter(row => row.type === type).length}`).join(' · ')}
    </Typography.Paragraph>}
    {result.error ? <Notice error>{result.error}</Notice> : <JsonDocument key={`${scope}:${JSON.stringify(result.target)}:${state.revision}`} text={text}/>}
    {ops.leaveDialog}
  </section>;
}
