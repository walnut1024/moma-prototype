import { useId, useMemo, useRef, useState } from 'react';
import { AutoComplete, Button, Checkbox, Input, Select, Space, Tabs, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import AdminTable from './AdminTable';
import { Modal, Notice, SearchBox } from './ModelOperationsUI';
import { channelModelCandidates, filterModelSources, matchesChannelModel, sourceBaseUrl, sourceFormat, sourceFormatLabel, validUpstreamId } from './channel-model-candidates';
import { connectionFingerprint } from './connection-state';
import { SUPPLIER_MODEL_BATCH_LIMIT as batchLimit } from './supplier-resources';
import { useChannelText } from './channel-language';

const options = values => [...new Set(values.filter(Boolean))];
const statuses = {
  added: '已添加', incompatible: '接口不兼容', missing: '待补全',
  invalid: 'ID 格式无效', duplicate: 'ID 重复', ready: '可添加',
};

export default function ChannelModelBatchAdd({ state, channel, ops, close, manual }) {
  const t = useChannelText();
  const { endpoint, provider } = channel;
  const targetFormat = sourceFormat(endpoint), targetBaseUrl = sourceBaseUrl(endpoint.baseUrl);
  const filterId = useId();
  const [initialConnection] = useState(() => connectionFingerprint(endpoint));
  const [tab, setTab] = useState('provider');
  const [format, setFormat] = useState(targetFormat);
  const [baseUrl, setBaseUrl] = useState(targetBaseUrl);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [onlySelected, setOnlySelected] = useState(false);
  const [selection, setSelection] = useState(new Map());
  const [confirmed, setConfirmed] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const candidates = useMemo(() => channelModelCandidates(state, channel), [state, channel]);
  const sources = candidates.flatMap(row => row.sources);
  const stale = initialConnection !== connectionFingerprint(endpoint) || Boolean(endpoint.candidateConfiguration || endpoint.adapterDraft);
  const locked = saving || stale || !ops.can;

  const upstreamIds = new Map();
  for (const value of selection.values()) {
    const id = value.trim();
    if (id) upstreamIds.set(id, (upstreamIds.get(id) || 0) + 1);
  }
  const rows = candidates.map(row => {
    const selected = selection.has(row.id);
    const value = row.currentUpstreamId ?? selection.get(row.id) ?? row.defaultSource?.upstreamModelId ?? '';
    const upstreamModelId = value.trim();
    let status = 'ready';
    if (row.added) status = 'added';
    else if (row.issue) status = 'incompatible';
    else if (!upstreamModelId) status = 'missing';
    else if (!validUpstreamId(upstreamModelId)) status = 'invalid';
    else if (row.existingIds.has(upstreamModelId) || (upstreamIds.get(upstreamModelId) || 0) > Number(selected)) status = 'duplicate';
    const displayName = tab === 'provider' && row.providerModelName || row.model.name;
    return { ...row, displayName, value, upstreamModelId, selected, status };
  });
  const ready = rows.filter(row => row.selected && row.status === 'ready');
  const pending = selection.size - ready.length;
  const visible = rows.filter(row => (tab === 'library' || row.supplied)
    && (onlySelected ? row.selected : matchesChannelModel(row, { format, baseUrl, query, targetFormat, targetBaseUrl })));
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
    for (const row of picked) {
      if (!include) next.delete(row.id);
      else if (!next.has(row.id) && next.size < batchLimit) next.set(row.id, row.value);
    }
    updateSelection(next);
  };
  const editId = (row, value) => {
    if (locked || atLimit && !row.selected) return;
    updateSelection(new Map(selection).set(row.id, value));
  };
  const changeFilter = (setter, value) => {
    setter(value);
    setPage(1);
  };
  const submit = async () => {
    if (saveLock.current || locked || !confirmed || !ready.length) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const result = await ops.run('channelQuickCreate', {
        providerId: provider.id,
        values: { endpointId: endpoint.id, models: ready.map(({ id, upstreamModelId }) => ({ libraryId: id, upstreamModelId })) },
      }, undefined, false, { silent: true });
      if (!result) return;
      const remaining = new Map(selection);
      ready.forEach(row => remaining.delete(row.id));
      const total = savedCount + ready.length;
      if (!remaining.size) {
        Toast.success(t('已添加 {0} 款，待验证').replace('{0}', total));
        close();
      } else {
        updateSelection(remaining);
        setSavedCount(total);
        if (rows.some(row => remaining.has(row.id) && !row.supplied)) setTab('library');
        changeFilter(setOnlySelected, true);
      }
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
    render: (_, row) => <Checkbox aria-label={t('选择模型') + ' ' + row.displayName}
      disabled={locked || !row.selected && (row.status === 'added' || row.status === 'incompatible' || atLimit)}
      checked={row.selected} onChange={event => toggleRows([row], event.target.checked)}/> },
    { title: t('模型名称 / 编码'), width: 190, render: (_, { model, displayName }) => <div className="channel-identity">
      <Typography.Text strong ellipsis={{ showTooltip: true }}>{displayName}</Typography.Text>
      <Typography.Text type="tertiary" size="small" ellipsis={{ showTooltip: true }}>{model.modelId}</Typography.Text>
    </div> },
    { title: t('上游模型调用标识'), width: 250, render: (_, row) => {
      const candidates = options(row.sources.map(source => source.upstreamModelId)).filter(validUpstreamId);
      if (row.status === 'added' || row.status === 'incompatible') return row.value || '—';
      const props = { 'aria-label': t('上游模型调用标识') + ' · ' + row.displayName, size: 'small',
        placeholder: t(candidates.length ? '选择或填写标识' : '填写上游模型调用标识'),
        disabled: locked || atLimit && !row.selected, value: row.value, onChange: value => editId(row, value) };
      return candidates.length ? <AutoComplete {...props} data={candidates} style={{ width: '100%' }}/>
        : <Input {...props} maxLength={200}/>;
    } },
    { title: t('来源'), width: 235, render: (_, row) => {
      const sources = onlySelected ? row.sources : filterModelSources(row.sources, format, baseUrl);
      const source = sources.find(source => source.upstreamModelId === row.upstreamModelId) || sources[0];
      if (!source) return t('基础资料');
      return <div className="channel-identity">
        <Typography.Text ellipsis={{ showTooltip: true }}>{t(source.name)}</Typography.Text>
        <Typography.Text type="tertiary" size="small" ellipsis={{ showTooltip: true }}>
          {[sourceFormatLabel(source.format), source.baseUrl].filter(Boolean).join(' · ') || '—'}
        </Typography.Text>
      </div>;
    } },
    { title: t('状态'), width: 116, render: (_, row) => <Typography.Text title={row.issue || undefined}
      type={row.status === 'invalid' || row.status === 'duplicate' ? 'danger' : 'tertiary'}>
      {t(statuses[row.status])}
    </Typography.Text> },
  ];

  const cancel = () => { if (!saveLock.current) ops.proceed(close); };
  const channelDetails = [
    [t('目标连接'), channel.name],
    [t('已绑定服务商'), provider.name],
    [t('接口格式'), sourceFormatLabel(targetFormat)],
    ['Base URL', endpoint.baseUrl],
  ];
  const providerTab = tab === 'provider';
  const maintenanceHref = providerTab
    ? '#/admin-2/provider-materials?' + new URLSearchParams({ provider: provider.id })
    : '#/admin-2/model-templates';
  return <Modal drawer wide title={t('添加上游模型')} description="" onClose={cancel} className="channel-model-batch-add"
    footer={<div className="channel-model-batch-footer">
      <Space wrap>
        <Typography.Text aria-live="polite">{t('已选 {0} 款').replace('{0}', selection.size)}
          {pending > 0 && ' · ' + t('{0} 款待补全').replace('{0}', pending)}</Typography.Text>
        <Checkbox disabled={locked || !ready.length} checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}>{t('已核对本批采购范围')}</Checkbox>
      </Space>
      <Space>
        <Button disabled={saving} onClick={cancel}>{t('取消')}</Button>
        <Button theme="solid" loading={saving} disabled={locked || !confirmed || !ready.length}
          onClick={submit}>{ready.length ? t('添加 {0} 款').replace('{0}', ready.length) : t('添加')}</Button>
      </Space>
    </div>}>
    <dl className="channel-model-batch-context">
      {channelDetails.map(([label, value]) => <div key={label}>
        <dt><Typography.Text type="secondary" size="small">{label}</Typography.Text></dt>
        <dd><Typography.Text strong>{value || '—'}</Typography.Text></dd>
      </div>)}
    </dl>
    <Tabs activeKey={tab} onChange={key => { setOnlySelected(false); changeFilter(setTab, key); }}>
      <Tabs.TabPane itemKey="provider" tab={t('当前服务商模型')}/>
      <Tabs.TabPane itemKey="library" tab={t('全部模型')}/>
    </Tabs>
    <Space wrap>
      <Typography.Text type="secondary">{t(providerTab ? '模型来自「基础资料 → 服务商 → 模型列表」' : '模型资料来自「基础资料 → 模型」')}</Typography.Text>
      <Typography.Text link={{ href: maintenanceHref, target: '_blank', rel: 'noopener noreferrer' }}>
        {t('维护模型')}
      </Typography.Text>
    </Space>
    <div className="channel-model-batch-filters">
      <SearchBox value={query} onChange={value => changeFilter(setQuery, value)} placeholder={t('搜索名称、编码、类型或上游标识')}/>
      <Select insetLabel={t('接口格式')} insetLabelId={filterId + '-format'} aria-labelledby={filterId + '-format'}
        value={format} disabled={saving || onlySelected}
        onChange={value => changeFilter(setFormat, value)} optionList={[
          { value: '', label: t('全部接口格式') },
          ...options([targetFormat, ...sources.map(row => row.format)]).map(value => ({ value, label: sourceFormatLabel(value) })),
        ]}/>
      <Select insetLabel="Base URL" insetLabelId={filterId + '-url'} aria-labelledby={filterId + '-url'}
        value={baseUrl} disabled={saving || onlySelected} filter
        onChange={value => changeFilter(setBaseUrl, value)} optionList={[
          { value: '', label: t('全部 Base URL') },
          ...options([targetBaseUrl, ...sources.map(row => row.baseUrl)]).map(value => ({ value, label: value })),
        ]}/>
    </div>
    <Space wrap className="channel-model-batch-actions">
      <Checkbox checked={onlySelected} disabled={saving || !selection.size}
        onChange={event => changeFilter(setOnlySelected, event.target.checked)}>{t('仅看已选')}</Checkbox>
      <Button theme="borderless" disabled={locked} onClick={manual}>{t('手动录入／粘贴')}</Button>
    </Space>
    {stale && <Notice error>{t('连接配置已变化，请关闭后重新选择模型。')}</Notice>}
    {atLimit && <Typography.Text type="tertiary">{t('每批最多添加 {0} 款').replace('{0}', batchLimit)}</Typography.Text>}
    {savedCount > 0 && <Notice>{t('已添加 {0} 款，待验证').replace('{0}', savedCount)}</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <AdminTable rowKey="id" aria-label={t('待添加上游模型')} columns={columns} dataSource={visible}
      empty={t('没有匹配的模型')} scroll={{ x: 840 }}
      pagination={{ currentPage: page, pageSize: 10, onPageChange: setPage, hideOnSinglePage: true }}/>
  </Modal>;
}
