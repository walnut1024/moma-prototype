import { useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Space, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import AdminTable from './AdminTable';
import { Modal, Notice, SearchBox } from './ModelOperationsUI';
import { channelModelCandidates, matchesChannelModel } from './channel-model-candidates';
import { channelListType } from './channel-connection-directory';
import { connectionFingerprint } from './connection-state';
import { SUPPLIER_MODEL_BATCH_LIMIT as batchLimit } from './supplier-resources';
import { useChannelText } from './channel-language';

const statuses = {
  added: '已添加', duplicate: 'ID 重复', ready: '可添加',
};

export default function ChannelModelBatchAdd({ state, channel, ops, close }) {
  const t = useChannelText();
  const { endpoint, provider } = channel;
  const [initialConnection] = useState(() => connectionFingerprint(endpoint));
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [onlySelected, setOnlySelected] = useState(false);
  const [selection, setSelection] = useState(new Map());
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const candidates = useMemo(() => channelModelCandidates(state, channel), [state, channel]);
  const stale = initialConnection !== connectionFingerprint(endpoint) || Boolean(endpoint.candidateConfiguration || endpoint.adapterDraft);
  const locked = saving || stale || !ops.can;

  const upstreamIds = new Set(selection.values());
  const rows = candidates.map(row => {
    const selected = selection.has(row.id);
    const duplicate = row.duplicate || upstreamIds.has(row.upstreamModelId) && selection.get(row.id) !== row.upstreamModelId;
    return { ...row, selected, status: row.added ? 'added' : duplicate ? 'duplicate' : 'ready' };
  });
  const ready = rows.filter(row => row.status === 'ready' && selection.get(row.id) === row.upstreamModelId);
  const selectionStale = selection.size !== ready.length;
  const visible = rows.filter(row => onlySelected ? row.selected : matchesChannelModel(row, query));
  const selectable = visible.filter(row => row.status === 'ready');
  const checked = selectable.length > 0 && selectable.every(row => row.selected);
  const atLimit = selection.size >= batchLimit;
  const updateSelection = next => {
    setSelection(next);
    setConfirmed(false);
    ops.dirty(next.size > 0);
    ops.setError('');
    if (!next.size) setOnlySelected(false);
  };
  const toggleRows = (picked, include) => {
    const next = new Map(selection);
    const ids = new Set(next.values());
    for (const row of picked) {
      if (!include) next.delete(row.id);
      else if (!next.has(row.id) && !ids.has(row.upstreamModelId) && next.size < batchLimit) {
        next.set(row.id, row.upstreamModelId);
        ids.add(row.upstreamModelId);
      }
    }
    updateSelection(next);
  };
  const changeFilter = (setter, value) => {
    setter(value);
    setPage(1);
  };
  const submit = async () => {
    if (saveLock.current || locked || selectionStale || !confirmed || !ready.length) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const result = await ops.run('channelQuickCreate', {
        providerId: provider.id,
        values: { endpointId: endpoint.id, models: ready.map(({ id, upstreamModelId }) => ({ libraryId: id, upstreamModelId })) },
      }, undefined, false, { silent: true });
      if (!result) return;
      Toast.success(t('已添加 {0} 款，待验证').replace('{0}', ready.length));
      close();
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const columns = [
    { title: <Tooltip content={t('全选可添加')}><Checkbox aria-label={t('全选可添加')} checked={checked}
      indeterminate={!checked && selectable.some(row => row.selected)}
      disabled={locked || !selectable.length || atLimit && !checked}
      onChange={event => toggleRows(selectable, event.target.checked)}/></Tooltip>, width: 48,
    render: (_, row) => <Checkbox aria-label={t('选择模型') + ' ' + row.displayName + ' (' + row.model.modelId + ')'}
      disabled={locked || !row.selected && (row.status !== 'ready' || atLimit)}
      checked={row.selected} onChange={event => toggleRows([row], event.target.checked)}/> },
    { title: t('模型展示名称 / 模型编码'), width: 190, render: (_, { model, displayName }) => <div className="channel-identity">
      <Typography.Text strong ellipsis={{ showTooltip: true }}>{displayName}</Typography.Text>
      <Typography.Text type="tertiary" size="small" ellipsis={{ showTooltip: true }}>{model.modelId}</Typography.Text>
    </div> },
    { title: t('上游模型 ID'), width: 230, render: (_, row) =>
      <Typography.Text ellipsis={{ showTooltip: true }}>{row.upstreamModelId}</Typography.Text> },
    { title: t('状态'), width: 116, render: (_, row) => <Typography.Text
      type={row.status === 'duplicate' ? 'danger' : 'tertiary'}>
      {t(statuses[row.status])}
    </Typography.Text> },
  ];

  const cancel = () => { if (!saveLock.current) ops.proceed(close); };
  const channelDetails = [
    [t('目标连接'), channel.name],
    [t('已绑定服务商'), provider.name],
    [t('接口格式'), channelListType(channel)],
    ['Base URL', endpoint.baseUrl],
  ];
  const maintenanceHref = '#/admin-2/provider-materials?' + new URLSearchParams({ provider: provider.id });
  return <Modal drawer wide title={t('添加上游模型')} description="" onClose={cancel} className="channel-model-batch-add"
    footer={<div className="channel-model-batch-footer">
      <Space wrap>
        <Typography.Text aria-live="polite">{t('已选 {0} 款').replace('{0}', selection.size)}</Typography.Text>
        <Checkbox disabled={locked || selectionStale || !ready.length} checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}>{t('已核对本批采购范围')}</Checkbox>
      </Space>
      <Space>
        <Button disabled={saving} onClick={cancel}>{t('取消')}</Button>
        <Button theme="solid" loading={saving} disabled={locked || selectionStale || !confirmed || !ready.length}
          onClick={submit}>{ready.length ? t('添加 {0} 款').replace('{0}', ready.length) : t('添加')}</Button>
      </Space>
    </div>}>
    <dl className="channel-model-batch-context">
      {channelDetails.map(([label, value]) => <div key={label}>
        <dt><Typography.Text type="secondary" size="small">{label}</Typography.Text></dt>
        <dd><Typography.Text strong>{value || '—'}</Typography.Text></dd>
      </div>)}
    </dl>
    <Space wrap>
      <Typography.Text type="secondary">{t('模型来自「基础资料 → 服务商 → 供应模型」')}</Typography.Text>
      <Typography.Text link={{ href: maintenanceHref, target: '_blank', rel: 'noopener noreferrer' }}>
        {t('维护模型')}
      </Typography.Text>
    </Space>
    <SearchBox value={query} onChange={value => changeFilter(setQuery, value)} placeholder={t('搜索名称、编码、类型或上游模型 ID')}/>
    <Checkbox className="channel-model-batch-actions" checked={onlySelected} disabled={saving || !selection.size}
      onChange={event => changeFilter(setOnlySelected, event.target.checked)}>{t('仅看已选')}</Checkbox>
    {stale && <Notice error>{t('连接配置已变化，请关闭后重新选择模型。')}</Notice>}
    {ops.conflict && !stale && <Notice error>{t('资料已变化，请载入最新数据。')} <Button theme="borderless" onClick={ops.reload}>{t('载入最新数据')}</Button></Notice>}
    {selectionStale && !stale && !ops.conflict && <Notice error>{t('已选供应模型已变化，请关闭后重新选择。')}</Notice>}
    {atLimit && <Typography.Text type="tertiary">{t('每批最多添加 {0} 款').replace('{0}', batchLimit)}</Typography.Text>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <AdminTable rowKey="id" aria-label={t('待添加上游模型')} columns={columns} dataSource={visible}
      empty={t('没有匹配的供应模型')} scroll={{ x: 590 }}
      pagination={{ currentPage: page, pageSize: 10, onPageChange: setPage, hideOnSinglePage: true }}/>
  </Modal>;
}
