import { useChannelText } from './channel-language';
import { useRef, useState } from 'react';
import { Button, Space, Table, Typography } from '@douyinfe/semi-ui';
import { Modal, Notice } from './ModelOperationsUI';
import { connectionFingerprint } from './connection-state';
import { onboardingApi, prepareServerChannel } from './onboarding-client';
import OnboardingScenarioControl from './OnboardingScenarioControl';

const time = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';

export default function ChannelDirectoryBalance({ state, connections, ops, close, credential, scope }) {
  const translateLabel = useChannelText();
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(null);
  const lock = useRef(false);
  const usageByConnection = new Map();
  const lastDay = Date.now() - 86400000;
  for (const usage of state.cloudMockState?.usage || []) {
    if (usage.identityType !== 'client' || !(Date.parse(usage.startedAt) >= lastDay)) continue;
    for (const attempt of usage.attempts || []) {
      if (!attempt.dispatched || !attempt.endpointId) continue;
      const aggregate = usageByConnection.get(attempt.endpointId) || { attempts: 0, tokens: null };
      aggregate.attempts++;
      const tokens = attempt.usage?.total_tokens;
      if (Number.isSafeInteger(tokens) && tokens >= 0) aggregate.tokens = (aggregate.tokens ?? 0) + tokens;
      usageByConnection.set(attempt.endpointId, aggregate);
    }
  }
  const query = async scope => {
    if (!ops.can || lock.current) return;
    lock.current = true; setBusy(true); ops.setError('');
    try {
      const rows = [];
      for (const [index, row] of scope.entries()) {
        setProgress({ current: index + 1, total: scope.length, name: row.name });
        const data = { endpointId: row.id, providerId: row.provider.id, signature: connectionFingerprint(row.endpoint), result: null,
          ...(credential ? { keyId: credential.id } : {}) };
        if (row.endpoint.customAdapter?.balance && row.provider.status === '已启用' && !row.endpoint.frozen) {
          try {
            const channel = await prepareServerChannel(row.provider, row.endpoint, credential?.id);
            const receipt = await onboardingApi('/balance', { method: 'POST', body: { channelId: channel.id } });
            if (receipt.source === 'mock' && (!channel.signature || receipt.signature === channel.signature)) data.result = receipt;
          } catch { /* Keep the prior successful value and record the failed attempt. */ }
        }
        rows.push(data);
      }
      await ops.reload?.();
      await ops.run('channelDirectoryBalance', { rows });
    } catch (error) { ops.setError(error.message); }
    finally { lock.current = false; setBusy(false); setProgress(null); }
  };
  const balanceRecord = row => credential ? row.endpoint.directoryKeyBalances?.[credential.id] : row.endpoint.directoryBalance;
  const scopeLabel = scope === 'all' ? '全部连接' : scope === 'selected' ? '所选连接' : '';
  return <Modal drawer wide title={credential ? '查询密钥余额' : scopeLabel ? '查询余额 · ' + scopeLabel : '查询余额'}
    description={credential ? connections[0].name + ' · ' + credential.maskedKey : scopeLabel ? connections.length + ' 条连接' : connections[0]?.name} onClose={() => !busy && close()}
    footer={<Space><Button disabled={busy} onClick={close}>{translateLabel("关闭")}</Button>
      <Button theme="solid" disabled={!ops.can || !connections.length || connections.length > 100 || busy} onClick={() => query(connections)}>
        {scopeLabel ? `查询${scopeLabel}余额` : '刷新余额'}
      </Button></Space>}>
    <Notice>余额与额度来自模拟回执。查询失败保留最近成功值及其时间。</Notice>
    <OnboardingScenarioControl disabled={busy}/>
    {connections.length > 100 && <Notice error>每次最多查询 100 条连接，请缩小范围。</Notice>}
    {progress && <Typography.Text aria-live="polite">正在处理 {progress.current} / {progress.total} · {progress.name}</Typography.Text>}
    <Table size="small" rowKey="id" dataSource={connections} pagination={{ pageSize: 10, hideOnSinglePage: true }} columns={[
      { title: '连接', dataIndex: 'name' },
      { title: '查询状态', render: (_, row) => {
        const record = balanceRecord(row);
        if (record && record.signature !== connectionFingerprint(row.endpoint)) return '配置变更 · 待查询';
        return record?.status || (row.endpoint.customAdapter?.balance ? '待查询' : '上游未提供');
      } },
      { title: '最近成功余额', render: (_, row) => {
        const last = balanceRecord(row)?.lastSuccess;
        return last ? last.amount + ' ' + last.unit : '—';
      } },
      { title: '上游已用额度', render: (_, row) => {
        const last = balanceRecord(row)?.lastSuccess;
        return last?.used == null ? '—' : last.used + ' ' + last.unit;
      } },
      { title: '近 24 小时模拟采购用量', render: (_, row) => {
        const usage = usageByConnection.get(row.id);
        return usage ? usage.attempts + ' 次上游请求 · ' + (usage.tokens == null ? 'Token 未报告' : usage.tokens.toLocaleString('zh-CN') + ' Token') : '暂无可归属记录';
      } },
      { title: '最近尝试（北京时间）', render: (_, row) => time(balanceRecord(row)?.checkedAt) },
      { title: '上次成功（北京时间）', render: (_, row) => time(balanceRecord(row)?.lastSuccess?.checkedAt) },
      { title: '操作', render: (_, row) => <Button disabled={busy || !ops.can || !row.endpoint.customAdapter?.balance} theme="borderless" size="small"
        onClick={() => query([row])}>查询此连接</Button> },
    ]}/>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
