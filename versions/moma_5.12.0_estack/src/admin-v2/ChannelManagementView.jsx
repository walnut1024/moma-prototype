import { useLayoutEffect, useRef } from 'react';
import { IconPlus } from '@douyinfe/semi-icons';
import { Button, Card, Empty, Space, Tabs, Tag, Typography } from '@douyinfe/semi-ui';
import AdminPageHeading from './AdminPageHeading';
import AdminStatus from './AdminStatus';
import AdminTable, { AdminPagination } from './AdminTable';
import { CopyId, SearchBox } from './ModelOperationsUI';
import { ChannelKeySummary, channelKeyMode, channelKeyStrategyLabel } from './ChannelCredentials';
import { useChannelText } from './channel-language';
import { channelApiFormatLabel, channelListPaths, channelListType, channelSourceTypeLabel } from './channel-connection-directory';
import { MODEL_TYPES } from './model-management';
import { pages } from './navigation.mjs';

import { operationsReturn } from './model-pricing-workspace';

function ChannelModels({ channel, ops, open }) {
  const query = ops.params.get('modelQ') || '';
  const keyword = query.trim().toLowerCase();
  const models = channel.models.filter(model => [model.association.upstreamModelId, model.modelName]
    .some(value => value?.toLowerCase().includes(keyword)));
  const canAdd = ops.can && !channel.endpoint.candidateConfiguration && !channel.endpoint.adapterDraft;
  return <>
    <div className="channel-management-toolbar">
      <SearchBox placeholder="搜索模型标识、展示名称" value={query}
        onChange={value => ops.go({ modelQ: value || null }, { replace: true })}/>
      <Space wrap spacing={8}>
        <Button disabled={!ops.can || !channel.models.length} onClick={event => open(event, 'test', channel.id)}>批量测试</Button>
        <Button disabled={!canAdd} onClick={event => open(event, 'discovery', channel.id)}>获取模型列表</Button>
        <Button theme="solid" disabled={!canAdd} onClick={event => open(event, 'add', channel.id)}>自定义添加模型</Button>
      </Space>
    </div>
    <AdminTable aria-label="渠道模型列表" rowKey="key" pagination={false} dataSource={models}
      empty={keyword ? '没有匹配的模型' : '该渠道尚未接入模型'}
      scroll={{ x: 'max(100%, 690px)' }} columns={[
        { title: '模型标识', width: 240, render: (_, { association }) =>
          <Typography.Text ellipsis={{ showTooltip: true }}>{association.upstreamModelId}</Typography.Text> },
        { title: '展示名称', dataIndex: 'modelName', width: 160 },
        { title: '模型类型', width: 112, render: (_, { master }) => MODEL_TYPES[master?.type]
          ? <Tag color="blue" size="small">{MODEL_TYPES[master.type]}</Tag> : '—' },
        { title: '操作', width: 178, render: (_, model) => <Space spacing={2}>
          {[['model', '编辑'], ['test', '测试'], ['remove', '删除']].map(([action, label]) =>
            <Button key={action} size="small" theme="borderless" type={action === 'remove' ? 'danger' : 'primary'}
              aria-label={label + '模型 ' + model.modelName} disabled={!ops.can}
              onClick={event => open(event, action, channel.id, model.key)}>{label}</Button>)}
        </Space> },
      ]}/>
  </>;
}

export function ChannelDetails({ channel, creation, ops, open, modelList }) {
  const t = useChannelText();
  const { id, name, endpoint, credentials, interfaceLabel, status } = channel;
  const tab = ops.params.get('tab') === 'models' ? 'models' : 'overview';
  const fields = [
    [t('渠道名称 / ID'), <div className="channel-identity"><span>{name}</span><CopyId value={id} label={t('渠道 ID')}/></div>],
    [t('服务商'), channel.provider.name],
    [t('渠道类型'), t(channelSourceTypeLabel(endpoint.channelSourceType ?? channel.provider.sourceType))],
    [t('接口格式'), channelApiFormatLabel(channelListType(channel))], [t('接口端点'), channelListPaths(channel).join('、')],
    [t('服务地址'), endpoint.baseUrl],
    [t('密钥配置'), t(channelKeyMode(endpoint))],
    [t('API 密钥'), <ChannelKeySummary endpoint={endpoint} provider={channel.provider}/>],
    ...(endpoint.authMode === 'pool' ? [[t('密钥选择策略'), t(channelKeyStrategyLabel(endpoint.keyStrategy))]] : []),
    [t('简介'), endpoint.directoryNote],
    [t('状态'), <AdminStatus value={status} label={t(status)}/>],
    ...(creation ? [[t('创建人 / 创建时间'), <CreationInfo creation={creation}/>]] : []),
  ];
  const connectionFields = [
    ['服务商', channel.provider.name], ['连接 ID', id], ['协议', interfaceLabel],
    ['上游 API 地址', endpoint.baseUrl],
    ['API 密钥', credentials.join('、') || (endpoint.authMode === 'none' ? '无需认证' : '')],
    ['启停状态', <AdminStatus value={status}/>], ['连接检测', <AdminStatus value={channel.testStatus}/>],
    ...(endpoint.directoryNote ? [['内部备注', endpoint.directoryNote]] : []),
  ];
  return <>
    <AdminPageHeading title={name}>
      {tab === 'overview' && <Button disabled={!ops.can} onClick={event => open(event, 'edit', id)}>{modelList ? '编辑连接' : '编辑信息'}</Button>}
    </AdminPageHeading>
    <Card className="channel-management-card">
      <Tabs type="line" activeKey={tab} lazyRender keepDOM={false} tabPaneMotion={false} aria-label="渠道详情"
        onChange={value => ops.go({ tab: value === 'overview' ? null : value }, { replace: true })}>
        <Tabs.TabPane tab="基本信息" itemKey="overview">
          <dl className="channel-management-facts">
            {(modelList ? connectionFields : fields).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}
          </dl>
        </Tabs.TabPane>
        <Tabs.TabPane tab="模型列表" itemKey="models">
          {modelList || <ChannelModels channel={channel} ops={ops} open={open}/>}
        </Tabs.TabPane>
      </Tabs>
    </Card>
  </>;
}

function CreationInfo({ creation }) {
  return <div className="channel-management-creation">
    <span>{creation.actor || '—'}</span>
    {creation.time && <Typography.Text size="small" type="tertiary">
      <time dateTime={creation.time}>{new Date(creation.time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</time>
    </Typography.Text>}
  </div>;
}

export default function ChannelManagementView({ state, connections, ops, open, focusTarget }) {
  const { params, go } = ops;
  const connectionId = params.get('connection');
  const listScroll = useRef(0);
  const openedChannel = useRef('');
  useLayoutEffect(() => {
    if (!connectionId && !openedChannel.current) return;
    if (!connectionId) window.scrollTo(0, listScroll.current);
    const target = connectionId ? focusTarget.current : focusTarget.current?.querySelector('input');
    target?.focus({ preventScroll: true });
    openedChannel.current = connectionId || '';
  }, [connectionId, focusTarget]);

  const creationAudits = new Map();
  for (const audit of state.audits) {
    if (audit.action === '创建渠道连接' && audit.result === '成功') creationAudits.set(audit.objectId, audit);
  }
  const creationFor = row => {
    const audit = creationAudits.get(row.id);
    return { actor: audit?.actorName || (audit?.actorId && state.admins.find(account => account.id === audit.actorId)?.name) || audit?.actor,
      time: Number.isFinite(Date.parse(row.endpoint.createdAt)) ? row.endpoint.createdAt : null };
  };
  if (connectionId) {
    const channel = connections.find(row => row.id === connectionId);
    return <div className="admin-page-stack" ref={focusTarget} tabIndex={-1} aria-label={channel?.name || '渠道详情'}>
      {channel ? <ChannelDetails channel={channel} creation={creationFor(channel)} ops={ops} open={open}/>
        : <Card><Empty description="该渠道不存在或已删除"><Button
          onClick={() => go({ connection: null, tab: null, modelQ: null })}>返回渠道列表</Button></Empty></Card>}
    </div>;
  }

  const query = params.get('q') || '';
  const providerId = params.get('channelProvider');
  const modelKey = params.get('channelModel');
  const filtered = providerId || modelKey;
  const returnTo = operationsReturn(params.get('returnTo'));
  const allowedSizes = [10, 20, 50, 100];
  const requestedSize = Number(params.get('size'));
  const pageSize = allowedSizes.includes(requestedSize) ? requestedSize : 10;
  const keyword = query.trim().toLowerCase();
  const matches = connections.filter(row => row.name.toLowerCase().includes(keyword) &&
    (!providerId || row.provider.id === providerId) &&
    (!modelKey || row.models.some(model => model.modelKey === modelKey)));
  const page = Math.min(Math.max(1, Number.parseInt(params.get('page'), 10) || 1), Math.ceil(matches.length / pageSize) || 1);
  const rows = matches.slice((page - 1) * pageSize, page * pageSize);
  const view = id => {
    listScroll.current = window.scrollY;
    go({ connection: id, tab: null, modelQ: null });
  };
  return <div className="admin-page-stack" ref={focusTarget}>
    <AdminPageHeading title={pages['providers-reference'].label}/>
    <Card className="channel-management-card">
      <div className="channel-management-toolbar">
        <SearchBox placeholder="按渠道名称搜索" value={query}
          onChange={value => go({ q: value || null, page: null }, { replace: true })}/>
        {filtered && <Button theme="borderless" onClick={() => go({ channelProvider: null, channelModel: null, page: null })}>清除来源筛选</Button>}
        {returnTo && <Button theme="borderless" onClick={() => ops.proceed(() => { location.hash = returnTo; })}>返回来源页面</Button>}
        <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!ops.can}
          onClick={event => open(event, 'create')}>添加新的渠道</Button>
      </div>
      <AdminTable aria-label="渠道列表" rowKey="id" pagination={false} dataSource={rows}
        empty={query.trim() || filtered ? '没有匹配的渠道' : '暂无渠道'}
        scroll={{ x: 'max(100%, 840px)' }} columns={[
          { title: '渠道名称', dataIndex: 'name', width: 173 },
          { title: '渠道类型', dataIndex: 'interfaceLabel', width: 145, render: value => value || '—' },
          { title: '状态', width: 100, render: (_, row) => <AdminStatus value={row.status}/> },
          { title: '简介', width: 120, render: (_, row) => row.endpoint.directoryNote
            ? <Typography.Text ellipsis={{ showTooltip: true }}>{row.endpoint.directoryNote}</Typography.Text> : '—' },
          { title: '创建人 / 时间', width: 142, render: (_, row) => <CreationInfo creation={creationFor(row)}/> },
          { title: '操作', width: 160, render: (_, row) => {
            const enabled = ['运行中', '需关注'].includes(row.endpoint.status);
            const label = enabled ? '停用' : '启用';
            return <Space spacing={2}>
              <Button size="small" theme="borderless" aria-label={'查看渠道 ' + row.name} onClick={() => view(row.id)}>查看</Button>
              <Button size="small" theme="borderless" disabled={!ops.can} aria-label={label + '渠道 ' + row.name}
                onClick={event => open(event, enabled ? 'disable' : 'enable', row.id)}>{label}</Button>
              <Button size="small" theme="borderless" type="danger" disabled={!ops.can} aria-label={'删除渠道 ' + row.name}
                onClick={event => open(event, 'remove', row.id)}>删除</Button>
            </Space>;
          } },
        ]}/>
      <AdminPagination total={matches.length} currentPage={page} pageSize={pageSize} pageSizeOpts={allowedSizes} showSizeChanger
        onPageChange={page => go({ page }, { replace: true })}
        onPageSizeChange={size => go({ size, page: null }, { replace: true })}/>
    </Card>
  </div>;
}
