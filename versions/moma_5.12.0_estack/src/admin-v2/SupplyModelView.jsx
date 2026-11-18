import { channelIdentity, modelDisplayName } from '../model-identities.mjs';
import { useRef } from 'react';
import { AdminPagination } from './AdminTable';
import { Button, Card, Empty, Table, Typography } from '@douyinfe/semi-ui';
import { CopyId, SearchBox, Notice } from './ModelOperationsUI';
import { catalogueType } from './SupplierModelMultiSelect';
import SupplierModelCatalogue from './SupplierModelCatalogue';
import ProcurementVersionEditor from './ProcurementVersionEditor';
import ChannelCapacityEditor, { ChannelCapacityCell } from './ChannelCapacity';
import ChannelCostCell from './ChannelCostCell';
import { costRecords, supplyCostTableRows } from './model-pricing-workspace';
import { modelChannelName } from './model-channel-name.js';
import ModelResourceTransfer from './ModelResourceTransfer';

const modelType = model => catalogueType(model.master?.type || model.groups[0]?.entry?.type) || '—';

export function SupplyModelDirectory({ state, models, ops, onDetails }) {
  const { params, go } = ops;
  const trigger = useRef(null);
  const query = params.get('modelListQ') || '';
  const search = query.trim().toLowerCase();
  const matches = models.filter(row => [modelDisplayName(state,row.master?.id) || row.name, row.code, row.master?.id, ...row.groups.flatMap(group=>group.channels.map(channel=>channelIdentity(state,channel.id))),
    ...row.groups.flatMap(group => [group.owner.name, ...group.channels.map(channel => modelChannelName(group.owner, channel))])]
    .join(' ').toLowerCase().includes(search));
  const pageSize = 20;
  const page = Math.min(Math.max(1, Number.parseInt(params.get('modelListPage'), 10) || 1), Math.ceil(matches.length / pageSize) || 1);
  const update = patch => go(patch, { replace: true, preserveScroll: true });
  const costs = costRecords(state, models.flatMap(model => model.groups));
  const editing = costs.find(row => row.provider.id === params.get('costProvider') && row.association.id === params.get('costAssociation'));
  const editingCapacity = costs.find(row => row.provider.id === params.get('capacityProvider') && row.association.id === params.get('capacityAssociation'));
  const close = () => {
    go({ costProvider: null, costAssociation: null }, { saved: true, preserveScroll: true });
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  };
  const closeCapacity = () => {
    go({ capacityProvider: null, capacityAssociation: null }, { saved: true, preserveScroll: true });
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  };
  const merged = (span, render, className) => (_, row) => ({ children: row[span] ? render(row) : null, props: { rowSpan: row[span], className } });
  return <>
    <div className="supplier-directory-search">
      <SearchBox placeholder="搜索模型、服务商或渠道" value={query}
        onChange={modelListQ => update({ modelListQ: modelListQ || null, modelListPage: null })}/>
    </div>
    <Table aria-label="模型总表" className="supplier-directory-table supplier-model-cost-table" rowKey="tableKey"
      dataSource={supplyCostTableRows(matches.slice((page - 1) * pageSize, page * pageSize), costs)} scroll={{ x: 'max(100%, 1160px)' }}
      empty={search ? '没有匹配的模型' : '暂无模型'}
      pagination={false}
      columns={[
        { title: '模型', width: 270, render: merged('modelSpan', row => <div className="supplier-cost-model">
          <Button className="supplier-owner-link" theme="borderless" size="small" onClick={() => onDetails(row.model.id)}>{modelDisplayName(state,row.model.master?.id) || row.model.name}</Button>
          <span className="supplier-identity-code"><CopyId copyAtStart ellipsis value={row.model.code} label="模型编码"/></span>
        </div>, 'supplier-cost-model-cell') },
        { title: '服务商及渠道', width: 280, render: (_, row) => <Typography.Text>{row.group.owner.name}（{row.channel ? modelChannelName(row.group.owner, row.channel) : '待配置渠道'}）</Typography.Text> },
        { title: '容量', width: 160, render: (_, row) => row.channel ? <ChannelCapacityCell provider={row.group.owner}
          channel={row.channel} modelName={row.model.name}/> : '—' },
        { title: '成本', width: 400, render: (_, row) => row.channel ? <ChannelCostCell cost={row.cost}/> : '—' },
        { title: '模型 ID', width: 260, render: merged('modelSpan', row => <CopyId value={row.model.master?.id || '未关联'} label="模型 ID"/>) },
        { title: '渠道 ID', width: 280, render: (_, row) => row.channel ? <CopyId value={channelIdentity(state,row.channel.id)} label="渠道 ID"/> : '待配置' },
        { title: '操作', width: 180, render: (_, row) => row.cost ? <><Button theme="borderless" size="small" disabled={!ops.can || !row.channel?.endpointId} aria-label={'容量设置 ' + row.model.name + ' · ' + row.group.owner.name + ' · ' + modelChannelName(row.group.owner,row.channel)} onClick={event=>{trigger.current=event.currentTarget;go({capacityProvider:row.group.owner.id,capacityAssociation:row.channel.id,costProvider:null,costAssociation:null},{preserveScroll:true})}}>容量设置</Button><Button theme="borderless" size="small" disabled={!ops.can}
            aria-label={'成本设置 ' + row.model.name + ' · ' + row.group.owner.name + ' · ' + modelChannelName(row.group.owner, row.channel)}
            onClick={event => { trigger.current = event.currentTarget; go({ costProvider: row.cost.provider.id, costAssociation: row.cost.association.id, capacityProvider: null, capacityAssociation: null }, { preserveScroll: true }); }}>成本设置</Button></> : '—' },
      ]}/>
    <AdminPagination pageSize={pageSize} currentPage={page} total={matches.length} hideOnSinglePage onPageChange={modelListPage => update({ modelListPage })}/>
    {editing && <ProcurementVersionEditor key={editing.key} state={state} provider={editing.provider} association={editing.association} modelName={editing.modelName} ops={ops} close={close}/>}
    {editingCapacity && <ChannelCapacityEditor key={editingCapacity.key} provider={editingCapacity.provider} association={editingCapacity.association} modelName={editingCapacity.modelName} ops={ops} close={closeCapacity}/>}
    {params.has('capacityAssociation') && !editingCapacity && <Notice error>该渠道已变化，请重新选择。<Button onClick={closeCapacity}>关闭</Button></Notice>}
    {params.has('costAssociation') && !editing && <Notice error>该渠道已变化，请重新选择。<Button onClick={close}>关闭</Button></Notice>}
  </>;
}

export default function SupplyModelView({ state, selected, ops, onShowSupplier }) {
  const info = selected?.master;
  const documentation = info?.profile?.documentation;
  return <Card className="supplier-model-panel supplier-detail-card" bodyStyle={{ padding: 0 }}>
    <div className="supplier-model-heading"><div>
      <Typography.Title heading={4} component="h2">{modelDisplayName(state,selected?.master?.id) || selected?.name || '模型目录'}</Typography.Title>
      {selected?.code && <CopyId copyAtStart value={selected.code} label="模型编码"/>}
      {info && <span>{modelType(selected)}{info.profile?.releaseDate ? ` · ${info.profile.releaseDate}` : ''}{info.maker ? ` · ${info.maker}` : ''}</span>}
      {typeof documentation === 'string' && /^https?:\/\//i.test(documentation) && <Typography.Text link={{ href: documentation, target: '_blank', rel: 'noreferrer' }}>官方资料</Typography.Text>}
    </div>{selected && <ModelResourceTransfer state={state} ops={ops} scope="channels"/>}</div>
    {selected ? <>
      <SupplierModelCatalogue key={selected.id} state={state} groups={selected.groups} ops={ops} onShowSupplier={onShowSupplier}/>
    </> : <Empty description="当前模型已不在目录中，请返回模型总表。"/>}
  </Card>;
}
