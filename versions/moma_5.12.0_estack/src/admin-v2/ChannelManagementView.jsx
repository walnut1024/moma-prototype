import { useChannelText } from './channel-language';
import { useLayoutEffect, useRef, useState } from 'react';
import { List, KeyRound, Info, Plus, Search, Coins } from 'lucide-react';
import {
  XaButton as Button, XaCard as Card, XaCopyId as CopyId, XaEmpty as Empty, XaHelp as Help, XaInput,
  XaPagination as AdminPagination, XaSpace as Space, XaTabs as Tabs, XaTag as Tag, XaTypography as Typography,
} from './xa24/HaloComponents.jsx';
import AdminStatus from './AdminStatus';
import AdminTable from './xa24/HaloTable.jsx';
import { ChannelCapacityCell } from './ChannelCapacity';
import ChannelCostCell from './ChannelCostCell';
import BatchProcurementEditor from './BatchProcurementEditor';
import ReferenceProviderApiKeys from './ReferenceProviderApiKeys';
import { workbenchProtocolLabel } from './workbench-protocol';
import { channelRequestUrls, channelListPaths, channelListType, channelSourceTypeLabel } from './channel-connection-directory';
import { demoConnectionDeploymentId } from './inference-demo-data.js';
import { channelKeyMode, channelKeyStrategyLabel } from './ChannelCredentials';
import { connectionKeys } from './connection-state';
import { CHANNEL_PROCUREMENT_BATCH_LIMIT } from './channel-change-management';
import { modelTypeLabel } from '../model-types.mjs';
import { operationsReturn } from './model-pricing-workspace';

function SearchBox({ placeholder, ...props }) {
  return <XaInput {...props} className="xa24-channel-search" aria-label={placeholder} placeholder={placeholder}
    prefix={<Search size={16} aria-hidden="true"/>}/>;
}

function DetailTabLabel({ icon: Icon, children }) {
  return <span className="xa24-tab-label"><Icon size={16} aria-hidden="true" className="xa24-outline-icon"/>{children}</span>;
}

function scrollOwner(element) {
  const content = element?.closest('.xa24-main');
  return content && content.scrollHeight > content.clientHeight ? content : window;
}

function ChannelModels({ channel, ops, open }) {
  const t = useChannelText();
  const query = ops.params.get('modelQ') || '';
  const keyword = query.trim().toLowerCase();
  const models = channel.models.filter(model => [model.association.upstreamModelId, model.modelName]
    .some(value => value?.toLowerCase().includes(keyword)));
  const canAdd = ops.can && !channel.endpoint.candidateConfiguration && !channel.endpoint.adapterDraft;
  const showDiscovery = (channel.endpoint.channelSourceType ?? channel.provider.sourceType) !== 'selfHosted';
  return <>
    <div className="channel-management-toolbar xa24-toolbar">
      <SearchBox placeholder={t('搜索上游模型 ID、模型展示名称')} value={query}
        onChange={value => ops.go({ modelQ: value || null }, { replace: true })}/>
      <Space wrap spacing={8}>
        <Button disabled={!ops.can} onClick={event => open(event, 'test', channel.id)}>{t('批量测试')}</Button>
        {showDiscovery && <Button disabled={!canAdd} onClick={event => open(event, 'discovery', channel.id)}>{t('获取模型列表')}</Button>}
        <Button theme="solid" disabled={!canAdd} onClick={event => open(event, 'quickAdd', channel.id)}>{t('手动添加')}</Button>
      </Space>
    </div>
    {showDiscovery && <Typography.Paragraph type="tertiary">自动获取模型列表需要连接提供 OpenAI 兼容的模型列表接口（GET /models）。</Typography.Paragraph>}
    <AdminTable aria-label={t('上游模型列表')} rowKey="key" pagination={false} dataSource={models}
      empty={keyword ? '没有匹配的模型' : '该连接尚未接入模型'}
      scroll={{ x: 'max(100%, 932px)' }} columns={[
        { title: t('上游模型 ID'), width: 240, render: (_, { association }) =>
          <Typography.Text ellipsis={{ showTooltip: true }}>{association.upstreamModelId}</Typography.Text> },
        { title: t('模型展示名称'), dataIndex: 'modelName', width: 160 },
        { title: t('模型类型'), width: 112, render: (_, { master }) => {
          const label = modelTypeLabel(master?.type);
          return label ? <Tag color="blue" size="small">{label}</Tag> : '—';
        } },
        { title: t('容量'), width: 170, render: (_, model) =>
          <ChannelCapacityCell provider={channel.provider} channel={model.association} modelName={model.modelName}/> },
        { title: t('操作'), width: 250, render: (_, model) => <Space spacing={2}>
          {[['model', '编辑'], ['test', '测试'], ['capacity', '容量设置'], ['remove', '删除']].map(([action, label]) =>
            <Button key={action} size="small" theme="borderless" type={action === 'remove' ? 'danger' : 'primary'}
              aria-label={label + '模型 ' + model.modelName} disabled={!ops.can}
              onClick={event => open(event, action, channel.id, model.key)}>{t(label)}</Button>)}
        </Space> },
      ]}/>
  </>;
}

function ChannelModelCosts({ state, channel, ops, open }) {
  const t = useChannelText();
  const [checkedKeys, setCheckedKeys] = useState([]);
  const [batch, setBatch] = useState(null);
  const trigger = useRef(null);
  const associatedModelId = ops.params.get('modelCost');
  const models = associatedModelId ? channel.models.filter(model => model.association.id === associatedModelId) : channel.models;
  const selected = models.filter(model => checkedKeys.includes(model.key));
  const tooMany = selected.length > CHANNEL_PROCUREMENT_BATCH_LIMIT;
  const close = saved => {
    setBatch(null);
    if (saved) setCheckedKeys([]);
    ops.dirty(false);
    ops.setError('');
    requestAnimationFrame(() => trigger.current?.focus());
  };
  return <>
    <div className="channel-management-toolbar xa24-toolbar">
      <Typography.Text type="tertiary" aria-live="polite">{tooMany
        ? `每批最多设置 ${CHANNEL_PROCUREMENT_BATCH_LIMIT} 款模型` : `已选 ${selected.length} 款模型`}</Typography.Text>
      {associatedModelId && <Button theme="borderless" onClick={() => ops.go({ modelCost: null }, { replace: true })}>{t('显示全部模型')}</Button>}
      <Button ref={trigger} theme="light" disabled={!ops.can || !selected.length || tooMany}
        onClick={() => ops.proceed(() => { ops.setError(''); setBatch(selected); })}>{t('批量设置成本')}</Button>
    </div>
    <AdminTable aria-label={t('模型成本')} rowKey="key" pagination={false} dataSource={models}
      rowSelection={{ selectedRowKeys: selected.map(model => model.key), onChange: setCheckedKeys, getCheckboxProps: () => ({ disabled: !ops.can }) }}
      empty={t(associatedModelId ? '未找到指定上游模型' : '该连接尚未接入模型')} scroll={{ x: 'max(100%, 704px)' }} columns={[
      { title: t('模型展示名称 / 上游模型 ID'), width: 220, render: (_, model) => <div className="channel-identity">
        <Typography.Text strong ellipsis={{ showTooltip: true }}>{model.modelName}</Typography.Text>
        <CopyId copyAtStart ellipsis label="上游模型 ID" value={model.association.upstreamModelId}/>
      </div> },
      { title: t('服务商成本价'), width: 320, render: (_, model) => <ChannelCostCell cost={model}/> },
      { title: t('操作'), width: 120, render: (_, model) =>
        <Button size="small" theme="borderless" type="primary" aria-label={'成本设置模型 ' + model.modelName}
          disabled={!ops.can} onClick={event => open(event, 'cost', channel.id, model.key)}>{t('成本设置')}</Button> },
    ]}/>
    {batch && <BatchProcurementEditor state={state} channel={channel} models={batch} ops={ops} close={close}/>}
  </>;
}

// 旧版审计动作保留原值，以便读取已经保存的创建记录。
const legacyConnectionCreatedAction = '创建渠道连接';

export function ChannelDetails({ state, channel, creation, ops, open, modelList, keyPool, modelCosts = false }) {
  const t = useChannelText();
  const { id, name, endpoint, credentials, interfaceLabel, status } = channel;
  const requestedTab = ops.params.get('tab');
  const tabs = ['models', ...(modelCosts ? ['model-costs'] : []), ...(keyPool ? ['api-keys'] : [])];
  const tab = tabs.includes(requestedTab) ? requestedTab : 'overview';
  const returnTo = tab === 'model-costs' && operationsReturn(ops.params.get('returnTo'));
  const selectTab = value => ops.go({ tab: value === 'overview' ? null : value,
    ...(value !== 'api-keys' && { keyGroup: null }) }, { replace: true });
  const keyCount = connectionKeys(endpoint, channel.provider, true).length + t(' 把');
  const fields = [
    [t('连接名称 / ID'), <div className="channel-identity"><span>{name}</span><CopyId value={id} label={t('连接 ID')}/></div>],
    [t('服务商'), channel.provider.name],
    [t('连接类型'), t(channelSourceTypeLabel(endpoint.channelSourceType ?? channel.provider.sourceType))],
    [t('接口格式'), workbenchProtocolLabel(channelListType(channel))], [t('接口端点'), channelListPaths(channel).join('、')],
    [t('服务地址'), endpoint.baseUrl],
    [t('完整请求地址'), channelRequestUrls(channel).join('、')],
    [t('密钥配置'), t(channelKeyMode(endpoint))],
    [t('上游 API 密钥'), keyPool ? <Button size="small" theme="borderless" type="primary"
      aria-label={keyCount + ' · ' + t('上游 API 密钥池')} onClick={() => selectTab('api-keys')}>{keyCount}</Button> : keyCount],
    ...(endpoint.authMode === 'pool' ? [[t('密钥选择策略'), t(channelKeyStrategyLabel(endpoint.keyStrategy))]] : []),
    [t('简介'), endpoint.directoryNote],
    [t('状态'), <AdminStatus value={status} label={t(status)}/>],
    ...(creation ? [[t('创建人 / 创建时间'), <CreationInfo creation={creation}/>]] : []),
  ];
  const connectionFields = [
    ['服务商', channel.provider.name], ['连接 ID', id], ['接口格式', workbenchProtocolLabel(interfaceLabel)],
    ['服务地址', endpoint.baseUrl],
    ['上游 API 密钥', credentials.join('、') || (endpoint.authMode === 'none' ? '无需认证' : '')],
    ['连接状态', <AdminStatus value={status}/>], ['连接检测', <AdminStatus value={channel.testStatus}/>],
    ...(endpoint.directoryNote ? [['内部备注', endpoint.directoryNote]] : []),
  ];
  return <Card className="channel-management-card channel-management-detail-card xa24-page-card">
    <Tabs type="line" activeKey={tab} lazyRender keepDOM={false} tabPaneMotion={false} aria-label={t('连接详情')}
      onChange={selectTab}>
      <Tabs.TabPane tab={<DetailTabLabel icon={Info}>{t('基本信息')}</DetailTabLabel>} itemKey="overview">
        <div className="channel-management-detail-actions">
          <Button theme="solid" disabled={!ops.can}
            onClick={event => open(event, 'edit', id)}>{t('编辑信息')}</Button>
        </div>
        <dl className="channel-management-facts">
          {(modelList ? connectionFields : fields).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}
        </dl>
      </Tabs.TabPane>
      <Tabs.TabPane tab={<DetailTabLabel icon={List}>{t('模型列表')}</DetailTabLabel>} itemKey="models">
        {modelList || <ChannelModels channel={channel} ops={ops} open={open}/>}
      </Tabs.TabPane>
      {modelCosts && <Tabs.TabPane tab={<DetailTabLabel icon={Coins}>{t('模型成本')}</DetailTabLabel>} itemKey="model-costs">
        {returnTo && <div className="channel-management-detail-actions"><Button theme="borderless"
          onClick={() => ops.proceed(() => { location.hash = returnTo; })}>{t('返回来源页面')}</Button></div>}
        {tab === 'model-costs' && <ChannelModelCosts key={id} state={state} channel={channel} ops={ops} open={open}/>}
      </Tabs.TabPane>}
      {keyPool && <Tabs.TabPane tab={<DetailTabLabel icon={KeyRound}>{t('上游 API 密钥池')}</DetailTabLabel>} itemKey="api-keys">
        {tab === 'api-keys' && keyPool}
      </Tabs.TabPane>}
    </Tabs>
  </Card>;
}

function CreationInfo({ creation }) {
  return <div className="channel-management-creation">
    <span>{creation.actor || '—'}</span>
    {creation.time && <Typography.Text size="small" type="tertiary">
      <time dateTime={creation.time}>{new Date(creation.time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</time>
    </Typography.Text>}
  </div>;
}

export default function ChannelManagementView({ state, connections, ops, open, focusTarget, workspaceTabs }) {
  const t = useChannelText();
  const { params, go } = ops;
  const connectionId = params.get('connection');
  const listPosition = useRef(null);
  const openedChannel = useRef('');
  useLayoutEffect(() => {
    if (!connectionId && !openedChannel.current) return;
    if (connectionId) focusTarget.current?.focus({ preventScroll: true });
    else {
      const frame = requestAnimationFrame(() => {
        const { id, tab, top, left } = listPosition.current || {};
        scrollOwner(focusTarget.current).scrollTo(0, top || 0);
        const tableBody = focusTarget.current?.querySelector('.xa24-table-scroll');
        if (tableBody) tableBody.scrollLeft = left || 0;
        const attribute = tab === 'models' ? 'data-channel-models-id' : 'data-channel-id';
        const link = id && focusTarget.current?.querySelector(`[${attribute}="${CSS.escape(id)}"]`);
        (link || focusTarget.current?.querySelector('input'))?.focus({ preventScroll: true });
      });
      openedChannel.current = '';
      return () => cancelAnimationFrame(frame);
    }
    openedChannel.current = connectionId || '';
  }, [connectionId, focusTarget]);

  const creationAudits = new Map();
  for (const audit of state.audits) {
    if (['创建连接', legacyConnectionCreatedAction].includes(audit.action) && audit.result === '成功') creationAudits.set(audit.objectId, audit);
  }
  const creationFor = row => {
    const audit = creationAudits.get(row.id);
    return { actor: audit?.actorName || (audit?.actorId && state.admins.find(account => account.id === audit.actorId)?.name) || audit?.actor,
      time: Number.isFinite(Date.parse(row.endpoint.createdAt)) ? row.endpoint.createdAt : null };
  };
  if (connectionId) {
    const channel = connections.find(row => row.id === connectionId);
    return <div className="admin-page-stack xa24-page xa24-channel-page" ref={focusTarget} tabIndex={-1} aria-label={channel?.name || '连接详情'}>
      {channel ? <ChannelDetails state={state} channel={channel} creation={creationFor(channel)} ops={ops} open={open} modelCosts
        keyPool={<ReferenceProviderApiKeys key={channel.id} state={state} connection={channel}
          ops={ops}/>}/>
        : <Card><Empty description={t('该连接不存在或已删除')}><Button
          onClick={() => go({ connection: null, tab: null, modelQ: null, modelCost: null, keyGroup: null })}>{t('返回连接列表')}</Button></Empty></Card>}
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
  const demoIndex = matches.findIndex(row => row.endpoint.inferenceSource?.deploymentId === demoConnectionDeploymentId);
  if (demoIndex > 0) {
    const [demoConnection] = matches.splice(demoIndex, 1);
    matches.unshift(demoConnection);
  }
  const page = Math.min(Math.max(1, Number.parseInt(params.get('page'), 10) || 1), Math.ceil(matches.length / pageSize) || 1);
  const rows = matches.slice((page - 1) * pageSize, page * pageSize);
  const view = (id, tab = null) => {
    const content = scrollOwner(focusTarget.current);
    listPosition.current = { id, tab, top: content === window ? window.scrollY : content.scrollTop,
      left: focusTarget.current?.querySelector('.xa24-table-scroll')?.scrollLeft };
    go({ connection: id, tab, modelQ: null, modelCost: null, keyGroup: null });
  };
  return <div className="admin-page-stack xa24-page xa24-channel-page" ref={focusTarget}>
    <section className="xa24-entry-header" aria-labelledby="xa24-connection-list-title">
      <div>
        <Space spacing={6}>
          <h1 id="xa24-connection-list-title">{t('模型接入')}</h1>
          <Help label={t('连接定义')}>{t('模型连接是平台访问上游模型服务的一套配置，由')}<strong>{t('服务商、服务地址、接口格式、接口端点和上游 API 密钥')}</strong>{t('共同决定。一个连接只对应一种接口格式和一个接口端点，可接入多个上游模型；任一配置不同时，需创建独立的连接。')}</Help>
        </Space>
        <p>{t('管理上游连接、模型列表和连接健康', 'Manage upstream connections, model lists and connection health')}</p>
      </div>
    </section>
    <Card padding={16} className="channel-management-card channel-management-list-card xa24-page-card">
      {workspaceTabs}
      <div className="channel-management-toolbar xa24-toolbar">
        <Button theme="solid" icon={<Plus size={16} aria-hidden="true"/>} disabled={!ops.can}
          onClick={event => open(event, 'create')}>{t('新建连接')}</Button>
        <div className="channel-management-toolbar-filters">
          <SearchBox placeholder={t('按连接名称搜索')} value={query}
            onChange={value => go({ q: value || null, page: null }, { replace: true })}/>
          {filtered && <Button theme="borderless" onClick={() => go({ channelProvider: null, channelModel: null, page: null })}>{t('清除来源筛选')}</Button>}
          {returnTo && <Button theme="borderless" onClick={() => ops.proceed(() => { location.hash = returnTo; })}>{t('返回来源页面')}</Button>}
        </div>
      </div>
      <AdminTable aria-label={t('连接列表')} rowKey="id" pagination={false} dataSource={rows}
        empty={t(query.trim() || filtered ? '没有匹配的连接' : '暂无连接')}
        scroll={{ x: 'max(100%, 1120px)' }} columns={[
          { title: t('连接名称 / ID'), width: 196, render: (_, row) => <div className="channel-identity">
            <Button size="small" theme="borderless" className="channel-name-link" data-channel-id={row.id}
              onClick={() => view(row.id)}>
              <span className="channel-identity">
                <Typography.Text strong ellipsis={{ showTooltip: true }}>{row.name}</Typography.Text>
                <Typography.Text size="small" ellipsis={{ showTooltip: true }}>{row.id}</Typography.Text>
              </span>
            </Button>
          </div> },
          { title: t('连接类型'), width: 148, render: (_, { provider, endpoint }) => t(channelSourceTypeLabel(endpoint.channelSourceType ?? provider.sourceType)) },
          { title: [t('接口格式'), t('接口端点'), t('服务地址')].join(' / '), width: 270, render: (_, row) =>
            <span className="channel-management-endpoint">
              <Typography.Text>{workbenchProtocolLabel(channelListType(row))}</Typography.Text>
              <Typography.Text code>{channelListPaths(row).join('、') || '—'}</Typography.Text>
              <CopyId copyAtStart value={row.endpoint.baseUrl} label={t('服务地址')}/>
            </span> },
          { title: t('服务商'), width: 126, render: (_, { provider }) =>
            <Typography.Text ellipsis={{ showTooltip: true }}>{provider.name}</Typography.Text> },
          { title: t('状态'), width: 128, render: (_, row) => <AdminStatus value={row.status}/> },
          { title: t('已接入模型'), width: 88, render: (_, row) =>
            <Button size="small" theme="borderless" data-channel-models-id={row.id}
              aria-label={row.name + '的' + row.modelCount + '款模型'} onClick={() => view(row.id, 'models')}>{row.modelCount}{t(' 款')}</Button> },
          { title: t('操作'), width: 164, fixed: 'right', render: (_, row) => {
            const hasModels = row.modelCount > 0;
            const testButton = <Button size="small" theme="borderless" disabled={!ops.can || !hasModels}
              style={hasModels ? undefined : { pointerEvents: 'none' }} aria-label={t('测试连接') + ' ' + row.name}
              onClick={event => open(event, 'testConnection', row.id)}>{t('测试连接')}</Button>;
            return <Space spacing={2}>
              {hasModels ? testButton : <span tabIndex={0} className="xa24-help-anchor"
                aria-label={t('当前模型连接下暂未配置上游模型')}>
                {testButton}<span role="tooltip" className="xa24-help-bubble">{t('当前模型连接下暂未配置上游模型')}</span>
              </span>}
              <Button size="small" theme="borderless" type="danger" disabled={!ops.can} aria-label={t('删除连接') + ' ' + row.name}
                onClick={event => open(event, 'remove', row.id)}>{t('删除')}</Button>
            </Space>;
          } },
        ]}/>
      <AdminPagination total={matches.length} currentPage={page} pageSize={pageSize} pageSizeOpts={allowedSizes}
        onPageChange={page => go({ page }, { replace: true })}
        onPageSizeChange={size => go({ size, page: null }, { replace: true })}/>
    </Card>
  </div>;
}
