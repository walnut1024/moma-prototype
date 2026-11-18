import { channelIdentity, modelDisplayName } from '../model-identities.mjs';
import ProviderRemovalDialog, { RemovalButton } from './ProviderRemovalDialog';
import AdminStatus from './AdminStatus';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconChevronDown, IconChevronRight, IconMore, IconPlus } from '@douyinfe/semi-icons';
import { Button, Dropdown, Space, Table, Typography } from '@douyinfe/semi-ui';
import ModelFieldLabel from './ModelFieldLabel';
import { GridTable, Row, Cell, Modal, Notice, SearchBox, CopyId } from './ModelOperationsUI';
import { supplierChannelInterface, supplierModelChannelRows } from './supplier-model-channel-table';
import { costRecords } from './model-pricing-workspace';
import ChannelCostCell from './ChannelCostCell';
import ChannelCapacityEditor, { ChannelCapacityCell } from './ChannelCapacity';
import ProcurementVersionEditor from './ProcurementVersionEditor';
import { channelStatus } from './channel-selection';
import { supplierChannelResources } from './supplier-resources';
import { modelChannelName as channelName } from './model-channel-name.js';
import { SupplierChannelDialog } from './SupplierResourceDialogs';
import { providerCode } from './provider-management';
import SupplierChannelBulkActions from './SupplierChannelBulkActions';
import SupplierChannelLifecycleDialog from './SupplierChannelLifecycleDialog';

const channelHeadings = ['渠道名称', '渠道状态', <ModelFieldLabel key="upstream" name="上游模型调用标识"/>, '上游 API 地址', '容量', '成本', '操作'];
const referenceFor = group => ({
  url: group.entry?.upstreamReference?.url,
  upstreamModelId: group.entry?.upstreamReference?.upstreamModelId,
});

export default function SupplierModelCatalogue({ state, provider, groups, ops, onImport, onAddChannel, onShowSupplier, createdEndpointId, onLocated }) {
  const [query, setQuery] = useState('');
  const [batchMode, setBatchMode] = useState(false), [selectedChannels, setSelectedChannels] = useState([]), [bulkAction, setBulkAction] = useState(null);
  const [manualConfiguration, setConfiguration] = useState(null);
  const requestedChannel = ops.params.get('upstreamChannel');
  const requestedChannelGroup = requestedChannel && groups.find(group=>group.channels.some(channel=>channel.id===requestedChannel));
  const requestedAssociation = requestedChannelGroup?.channels.find(channel=>channel.id===requestedChannel);
  const configuration = manualConfiguration || (requestedChannel ? {
    providerId:provider?.id,groupId:requestedChannelGroup?.id,associationId:requestedChannel,endpointId:requestedAssociation?.endpointId,
  } : null);
  const [pricing, setPricing] = useState(null);
  const [expanded, setExpanded] = useState([]), [removingChannel, setRemovingChannel] = useState(null);
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const media = matchMedia('(max-width: 760px)');
    const update = event => setNarrow(event.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const trigger = useRef(null), tableScroll = useRef(null);
  const modelView = !provider, search = query.trim().toLowerCase();
  const costs = new Map(costRecords(state, groups).map(record => [record.key, record]));
  const pricingRecord = pricing && costs.get(pricing.key);
  const material = !modelView && ops.params.get('material');
  const focused = material && groups.find(group => group.id === material);
  const rowKey = group => modelView ? group.owner.id : group.id;
  const scopedGroups = groups.filter(group => (modelView || group.modelId) && (!material || group === focused));
  const filtered = scopedGroups.filter(group => [modelView ? group.owner.name : modelDisplayName(state, group.master?.id) || group.name, modelView ? providerCode(group.owner) : '', group.master?.modelId, group.modelId, referenceFor(group).upstreamModelId,
      ...group.channels.flatMap(channel => [channelName(group.owner, channel), channel.upstreamModelId, channel.endpointId, channelIdentity(state,channel.id)])]
      .join(' ').toLowerCase().includes(search));
  const channelRows = modelView ? [] : supplierModelChannelRows(state, scopedGroups, search);
  const createdGroup = createdEndpointId && groups.find(group => group.channels.some(channel => channel.endpointId === createdEndpointId));
  const requestedGroup = modelView ? groups.find(group => group.owner.id === ops.params.get('provider')) : createdGroup || requestedChannelGroup || focused;
  const requestedKey = requestedGroup ? rowKey(requestedGroup) : '';
  const [dismissed, setDismissed] = useState('');
  const automatic = requestedKey && (createdGroup || dismissed !== requestedKey) ? requestedKey : '';
  const expandedKeys = automatic ? [...new Set([...expanded, automatic])] : expanded;
  useLayoutEffect(() => {
    tableScroll.current?.scrollTo(0, 0);
    if (requestedKey) tableScroll.current?.querySelector('[data-supply-focus]')?.scrollIntoView({ block: 'nearest' });
  }, [material, requestedKey]);
  useLayoutEffect(() => {
    if (!createdEndpointId) return;
    const button = tableScroll.current.querySelector('[data-created-channel]');
    if (!button) {
      setQuery('');
      return;
    }
    button.closest('tr')?.scrollIntoView({ block: 'nearest' });
    button.focus({ preventScroll: true });
    onLocated();
  }, [createdEndpointId, search, onLocated]);
  const changeQuery = value => {
    setQuery(value);
    setSelectedChannels([]);
    tableScroll.current.scrollTop = 0;
  };
  useEffect(() => { setSelectedChannels([]); setBatchMode(false); }, [material]);
  const configurationGroup = configuration && groups.find(group => group.id === configuration.groupId && group.owner.id === configuration.providerId);
  const association = configurationGroup?.channels.find(row => row.id === configuration.associationId && row.endpointId === configuration.endpointId && !row.unlinked);
  const owner = configurationGroup && state.providers.find(row => row.id === configurationGroup.owner.id);
  const endpoint = association && owner && supplierChannelResources(state, owner).find(row => row.id === association.endpointId);
  const configure = (event, group, channel) => {
    trigger.current = event.currentTarget;
    ops.setError('');
    setConfiguration({ providerId: group.owner.id, groupId: group.id, associationId: channel.id, endpointId: channel.endpointId });
  };
  const close = () => {
    setConfiguration(null);
    if (requestedChannel) ops.go({upstreamChannel:null},{saved:true,preserveScroll:true});
    setPricing(null);
    ops.setError('');
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : tableScroll.current)?.focus({ preventScroll: true }));
  };
  const blocked = !ops.can || Boolean(ops.conflict);
  const details = (group, label) => <Button theme="borderless" size="small" aria-label={'详情 ' + label}
    onClick={() => onShowSupplier(group)}>详情</Button>;
  const configButton = (group, channel) => channel?.endpointId && !channel.unlinked && <Button theme="borderless" size="small" disabled={blocked}
    data-created-channel={channel.endpointId === createdEndpointId ? '' : undefined}
    aria-label={'编辑 ' + group.name + ' · ' + channelName(group.owner, channel)}
    onClick={event => configure(event, group, channel)}>编辑</Button>;
  const toggle = group => {
    const key = rowKey(group);
    const open = expandedKeys.includes(key);
    if (requestedKey === key) setDismissed(open ? key : '');
    setExpanded(keys => open ? keys.filter(id => id !== key) : [...keys, key]);
  };
  const channelCells = (group, channel) => {
    const api = supplierChannelInterface(group.owner, channel);
    return <>
      <Cell><div>{channelName(group.owner, channel)}</div><div><Typography.Text size="small" type="tertiary">渠道 ID：</Typography.Text><CopyId copyAtStart value={channelIdentity(state,channel.id)} label="渠道 ID"/></div><div><Typography.Text size="small" type="tertiary">连接 ID：</Typography.Text><CopyId copyAtStart value={channel.endpointId} label="连接 ID"/></div></Cell>
      <Cell><AdminStatus value={channelStatus(group.owner, channel)}/></Cell>
      <Cell>{channel.upstreamModelId ? <CopyId copyAtStart value={channel.upstreamModelId} label="上游模型调用标识"/> : '—'}</Cell>
      <Cell>{api.url ? <CopyId copyAtStart value={api.url} label="上游 API 地址"/> : '—'}</Cell>
    </>;
  };
  const editPricing = (button, type, cost) => {
    trigger.current = button;
    ops.setError('');
    setPricing({ type, key: cost.key });
  };
  const modelExpansion = group => {
    const reference = referenceFor(group);
    const masterSource = !modelView && group.master && (group.master.profile?.author || group.master.maker);
    return <div className="supplier-model-expansion" role="region" aria-label={(modelView ? group.owner.name : group.name) + '的渠道和计费'}>
      {(reference.url || reference.upstreamModelId || masterSource) && <Space wrap className="supplier-model-reference">
        {reference.url && <><Typography.Text type="tertiary">官方参考地址</Typography.Text><CopyId copyAtStart value={reference.url} label="官方参考地址"/></>}
        {reference.upstreamModelId && <><Typography.Text type="tertiary">参考调用标识</Typography.Text><CopyId copyAtStart value={reference.upstreamModelId} label="参考调用标识"/></>}
        {masterSource && <Typography.Text type="tertiary">{masterSource}</Typography.Text>}
      </Space>}
      {group.channels.length ? <GridTable className="supplier-nested-channels" headings={channelHeadings}>
        {group.channels.map(channel => {
          const cost = costs.get(group.owner.id + ':' + channel.id);
          return <Row key={channel.id}>
            {channelCells(group, channel)}
            <Cell><ChannelCapacityCell provider={group.owner} channel={channel} modelName={group.name}/></Cell>
            <Cell><ChannelCostCell cost={cost}/></Cell>
            <Cell><Space spacing={4} wrap>{configButton(group, channel)}
              {cost && <Button theme="borderless" size="small" disabled={blocked} aria-label={'容量设置 ' + group.name + ' · ' + group.owner.name + ' · ' + channelName(group.owner, channel)} onClick={event => editPricing(event.currentTarget, 'capacity', cost)}>容量设置</Button>}
              {cost && <Button theme="borderless" size="small" disabled={blocked}
                aria-label={'成本设置 ' + group.name + ' · ' + group.owner.name + ' · ' + channelName(group.owner, channel)}
                onClick={event => editPricing(event.currentTarget, 'cost', cost)}>成本设置</Button>}
              <RemovalButton state={state} ops={ops} label="删除模型渠道" target={{ providerId: group.owner.id, endpointId: channel.endpointId, ...(channel.unlinked ? {} : { associationId: channel.id }) }} ariaLabel={'删除模型渠道 ' + channelName(group.owner, channel)}/>
            </Space></Cell>
          </Row>;
        })}
      </GridTable> : <Typography.Text type="tertiary">暂无已配置渠道</Typography.Text>}
    </div>;
  };
  const closeChannelRemoval = () => {
    setRemovingChannel(null);
    ops.setError('');
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : tableScroll.current)?.focus({ preventScroll: true }));
  };
  return <>
    <div className="supplier-toolbar supplier-resource-toolbar">
      <SearchBox value={query} placeholder={modelView ? '搜索服务商 / 渠道' : '搜索模型 / 渠道 / ID / 上游标识'} onChange={changeQuery}/>
      {material && <Button size="small" onClick={() => {
        changeQuery('');
        ops.go({ material: null }, { preserveScroll: true });
      }}>查看全部模型渠道</Button>}
      {!modelView && <>
        <Button size="small" theme="solid" disabled={blocked} icon={<IconPlus size="small" aria-hidden="true"/>} onClick={onImport}>批量新增</Button>
        <Button size="small" theme="light" disabled={blocked} icon={<IconPlus size="small" aria-hidden="true"/>}
          onClick={event => onAddChannel(event, focused?.master?.id)}>新增</Button>
        {!batchMode && <Button size="small" disabled={blocked || !channelRows.length} onClick={() => setBatchMode(true)}>批量操作</Button>}
      </>}
    </div>
    {!modelView && batchMode && <Space wrap className="supplier-bulk-toolbar" aria-label="渠道批量操作">
      <Typography.Text>已选 {selectedChannels.length} 条</Typography.Text>
      {[['name', '编辑渠道名称'], ['address', '编辑上游 API 地址'], ['test', '测试连接'], ['enable', '启用'], ['disable', '停用'], ['remove', '删除模型渠道']].map(([mode, label]) => <Button key={mode} size="small" type={mode === 'remove' ? 'danger' : 'primary'} disabled={blocked || !selectedChannels.length}
        onClick={event => { trigger.current = event.currentTarget; ops.setError(''); setBulkAction({ mode, ids: [...selectedChannels] }); }}>{label}</Button>)}
      <Button size="small" theme="borderless" onClick={() => { setBatchMode(false); setSelectedChannels([]); }}>退出批量操作</Button>
    </Space>}
    {!modelView && <Typography.Paragraph className="supplier-channel-count-summary" type="tertiary" size="small">
      模型渠道 · 共 {channelRows.length} 条渠道
    </Typography.Paragraph>}
    <div className="supplier-model-list-scroll" ref={tableScroll} tabIndex={0} role="region" aria-label={modelView ? '供应服务商表格' : '模型渠道表格'}>
      {modelView ? <Table key="suppliers" className="supplier-model-list" size="small" dataSource={filtered} rowKey={rowKey} pagination={false}
        expandedRowKeys={expandedKeys} expandedRowRender={modelExpansion} hideExpandedColumn expandIcon={false}
        empty="暂无匹配的服务商。" columns={[
          { title: '服务商', width: 260, render: (_, group) => {
            const open = expandedKeys.includes(rowKey(group));
            return <Space>
              <Button size="small" theme="borderless" type="tertiary" icon={open ? <IconChevronDown/> : <IconChevronRight/>}
                aria-expanded={open} aria-label={(open ? '收起 ' : '展开 ') + group.owner.name} onClick={() => toggle(group)}/>
              <div className="supplier-directory-identity">
                <Button className="supplier-owner-link" theme="borderless" size="small"
                  data-supply-focus={group === requestedGroup ? '' : undefined} onClick={() => onShowSupplier(group)}>{group.owner.name}</Button>
                <span className="supplier-identity-code"><CopyId copyAtStart ellipsis value={providerCode(group.owner)} label="服务商编码"/></span>
              </div>
            </Space>;
          } },
          { title: '渠道数', width: 72, align: 'right', render: (_, group) => group.channels.length ? <Button
            className="supplier-channel-count" theme="borderless" size="small" aria-expanded={expandedKeys.includes(rowKey(group))}
            aria-label={`${expandedKeys.includes(rowKey(group)) ? '收起' : '展开'} ${group.owner.name} 的 ${group.channels.length} 个渠道`}
            onClick={() => toggle(group)}>{group.channels.length}</Button> : 0 },
          { title: '接入状态', width: 110, render: (_, group) => <AdminStatus value={!group.channels.length ? '未配置渠道' : group.channels.some(channel => channelStatus(group.owner, channel) === '可用') ? '可用' : '待验证'}/> },
          { title: '操作', width: 72, render: (_, group) => details(group, group.owner.name) },
        ]}/> : <Table key="model-channels" className="supplier-model-list supplier-flat-channels" size="small" dataSource={channelRows} rowKey="id" pagination={false}
          scroll={{ x: batchMode ? 2298 : 2250 }} empty="暂无模型渠道，点击新增配置。"
          rowSelection={batchMode ? { selectedRowKeys: selectedChannels, fixed: narrow ? false : 'left', width: 48,
            getCheckboxProps: ({ group, channel }) => ({ disabled: blocked, 'aria-label': '选择渠道 ' + group.name + ' · ' + channelName(group.owner, channel) }),
            onChange: keys => setSelectedChannels(keys) } : undefined}
          onRow={({ group, channel }) => ({ 'data-channel-id': channelIdentity(state, channel.id),
            'data-supply-focus': group === requestedGroup && (!requestedChannel || channel.id === requestedChannel) ? '' : undefined })}
          columns={[
            { title: '模型', fixed: narrow ? false : 'left', width: 280, render: (_, { group }) => <div className="supplier-directory-identity">
              <Typography.Text title={modelDisplayName(state, group.master.id) || group.name}>{modelDisplayName(state, group.master.id) || group.name}</Typography.Text>
              <span className="supplier-identity-code"><CopyId copyAtStart ellipsis value={group.master.modelId} label="模型编码"/></span>
            </div> },
            { title: '渠道名称', width: 150, ellipsis: true, render: (_, { group, channel }) => channelName(group.owner, channel) },
            { title: '渠道 ID', width: 220, render: (_, { channel }) => <CopyId copyAtStart ellipsis value={channelIdentity(state, channel.id)} label="渠道 ID"/> },
            { title: '渠道状态', width: 100, render: (_, { group, channel }) => <AdminStatus value={channelStatus(group.owner, channel)}/> },
            { title: <ModelFieldLabel name="上游模型调用标识"/>, width: 210, render: (_, { channel }) => <CopyId copyAtStart ellipsis value={channel.upstreamModelId} label="上游模型调用标识"/> },
            { title: '上游接口', width: 420, render: (_, { group, channel }) => {
              const api = supplierChannelInterface(group.owner, channel);
              return <div className="supplier-flat-interface"><Typography.Text>{api.protocol}</Typography.Text><CopyId copyAtStart ellipsis value={api.url} label="上游 API 地址"/></div>;
            } },
            { title: '容量', width: 260, render: (_, { group, channel }) => <ChannelCapacityCell provider={group.owner} channel={channel} modelName={group.name}/> },
            { title: '成本', className: 'supplier-channel-cost-cell', width: 310, render: (_, { group, channel }) => <ChannelCostCell cost={costs.get(group.owner.id + ':' + channel.id)}/> },
            { title: '操作', fixed: narrow ? false : 'right', width: 300, render: (_, { group, channel }) => {
              const cost = costs.get(group.owner.id + ':' + channel.id), name = channelName(group.owner, channel);
              return <div className="supplier-row-actions">{configButton(group, channel)}
                {cost && <Button theme="borderless" size="small" disabled={blocked} aria-label={'容量设置 ' + group.name + ' · ' + name} onClick={event => editPricing(event.currentTarget, 'capacity', cost)}>容量设置</Button>}
                {cost && <Button theme="borderless" size="small" disabled={blocked} aria-label={'成本设置 ' + group.name + ' · ' + name} onClick={event => editPricing(event.currentTarget, 'cost', cost)}>成本设置</Button>}
                <Dropdown clickToHide trigger="click" position="bottomRight" render={<Dropdown.Menu>
                  <Dropdown.Item type="danger" disabled={blocked} onClick={() => ops.proceed(() => {
                    ops.setError(''); setRemovingChannel({ providerId: group.owner.id, endpointId: channel.endpointId, associationId: channel.id });
                  })}>删除模型渠道</Dropdown.Item>
                </Dropdown.Menu>}>
                  <Button theme="borderless" size="small" disabled={blocked} icon={<IconMore/>} aria-label={'更多操作 ' + group.name + ' · ' + name}
                    onClick={event => { trigger.current = event.currentTarget; }}/>
                </Dropdown>
              </div>;
            } },
          ]}/>}
    </div>
    {bulkAction && (() => {
      const closeBulk = () => {
      setBulkAction(null); ops.dirty(false); ops.setError('');
      requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus({ preventScroll: true }));
      };
      return bulkAction.mode === 'remove' ? <ProviderRemovalDialog state={state} ops={ops} target={{ providerId: provider.id, associationIds: bulkAction.ids }} close={closeBulk} removed={() => { setSelectedChannels([]); closeBulk(); }}/>
        : ['enable', 'disable'].includes(bulkAction.mode) ? <SupplierChannelLifecycleDialog state={state} provider={provider} associationIds={bulkAction.ids} action={bulkAction.mode} ops={ops} close={closeBulk}/>
          : <SupplierChannelBulkActions state={state} provider={provider} associationIds={bulkAction.ids} mode={bulkAction.mode} ops={ops} close={closeBulk}/>;
    })()}
    {removingChannel && <ProviderRemovalDialog state={state} ops={ops} target={removingChannel} close={closeChannelRemoval} removed={closeChannelRemoval}/>}
    {configuration && (endpoint
      ? <SupplierChannelDialog key={association.id} state={state} provider={owner} endpoint={endpoint} association={association} focusUpstream={Boolean(requestedChannel)} ops={ops} close={close}/>
      : <Modal title="模型渠道已变化" onClose={() => ops.proceed(close)}><Notice error>请关闭后重新选择模型渠道。</Notice></Modal>)}
    {pricingRecord && (pricing.type === 'cost'
      ? <ProcurementVersionEditor key={pricingRecord.key} state={state} provider={pricingRecord.provider} association={pricingRecord.association} modelName={pricingRecord.modelName} ops={ops} close={close}/>
      : <ChannelCapacityEditor key={pricingRecord.key} provider={pricingRecord.provider} association={pricingRecord.association} modelName={pricingRecord.modelName} ops={ops} close={close}/>)}
    {pricing && !pricingRecord && <Modal title="模型渠道已变化" onClose={() => ops.proceed(close)}><Notice error>请关闭后重新选择模型渠道。</Notice></Modal>}
  </>;
}
