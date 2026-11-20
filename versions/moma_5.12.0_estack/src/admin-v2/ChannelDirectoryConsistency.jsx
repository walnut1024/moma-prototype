import { useEffect, useRef, useState } from 'react';
import { Button, Empty, Space, Table, Typography } from '@douyinfe/semi-ui';
import { cloudAdminRequest } from './admin-client.mjs';
import { CopyId, Modal, Notice } from './ModelOperationsUI';
import { downloadJsonFile } from './provider-files';

const indexValues = value => value === null ? '无记录' : [
  value.upstream_model_id,
  value.enabled === undefined ? null : value.enabled ? '已启用' : '已停用',
  value.config_epoch === undefined ? null : '配置版本 ' + value.config_epoch,
  value.weight === undefined ? null : '权重 ' + value.weight,
  value.position === undefined ? null : '位置 ' + (value.position + 1),
].filter(Boolean).join(' · ') || '有记录';

export default function ChannelDirectoryConsistency({ state, ops, close }) {
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState([]);
  const [repaired, setRepaired] = useState([]);
  const [pending, setPending] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const read = useRef(null);
  const lock = useRef(false);
  const scanIndex = async () => {
    read.current?.abort();
    const request = new AbortController();
    read.current = request;
    setPending(true); setError(''); ops.setError('');
    try {
      const result = await cloudAdminRequest('/channels/consistency', { signal: request.signal });
      if (!request.signal.aborted) { setScan(result); setSelected([]); }
    } catch (error) { if (!request.signal.aborted) setError(error.message); }
    finally { if (!request.signal.aborted) setPending(false); }
  };
  useEffect(() => {
    void scanIndex();
    return () => read.current?.abort();
  }, []);
  const stale = scan && scan.revision !== state.revision;
  const repair = async () => {
    if (lock.current || pending || stale || !selected.length || selected.length > 100 || !ops.can) return;
    lock.current = true;
    setSaving(true);
    try {
      const result = await ops.run('channelDirectoryRepair', { confirmed: true, signature: scan.signature, issueIds: selected });
      if (!result) return;
      setRepaired(result.audits[0]?.indexRepairResults || []);
      await scanIndex();
    } finally { lock.current = false; setSaving(false); }
  };
  return <Modal drawer wide title="核对并修复一致性" onClose={() => !saving && close()} footer={<Space wrap>
    <Button disabled={saving} onClick={close}>关闭</Button>
    <Button disabled={pending || saving} onClick={scanIndex}>重新检查</Button>
    <Button disabled={pending || !scan} onClick={() =>
      downloadJsonFile({ issues: scan.issues, repaired, revision: scan.revision }, 'channel-index-review.json')}>导出结果</Button>
    <Button theme="solid" loading={saving} disabled={pending || saving || !ops.can || stale || !selected.length || selected.length > 100}
      onClick={repair}>修复选中问题</Button>
  </Space>}>
    <Typography.Paragraph>核对供应登记、已发布路由及其派生索引。修复从当前配置重建所选索引，保留模型渠道 ID、采购价和服务版本。</Typography.Paragraph>
    {repaired.length > 0 && <Notice>已修复 {repaired.length} 项，复查发现 {scan?.issues.length ?? '—'} 项待核对。</Notice>}
    {stale && <Notice error>工作区已变化，请重新检查索引。</Notice>}
    {(error || ops.error) && <Notice error>{error || ops.error}</Notice>}
    <Table size="small" rowKey="id" loading={pending} dataSource={scan?.issues || []} scroll={{ x: 950 }}
      pagination={{ pageSize: 10, hideOnSinglePage: true }} empty={<Empty description={scan ? '当前范围的派生索引一致' : '等待检查结果'}/>}
      rowSelection={{ selectedRowKeys: selected, onChange: setSelected, getCheckboxProps: row => ({ disabled: !row.repairable || !ops.can || stale || saving }) }}
      columns={[
        { title: '检查项', dataIndex: 'type', width: 120 },
        { title: '关联记录', width: 180, render: (_, row) => <CopyId copyAtStart ellipsis value={row.reference} label={row.type === '生效路由索引' ? '路由版本 ID' : '模型渠道 ID'}/> },
        { title: '源配置', width: 185, render: (_, row) => indexValues(row.source) },
        { title: '当前索引', width: 185, render: (_, row) => indexValues(row.indexed) },
        { title: '拟处理', render: (_, row) => row.reason + (row.repairable ? ' · 可修复' : ' · 需人工核对') },
      ]}/>
  </Modal>;
}
