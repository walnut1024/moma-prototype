import { useRef } from 'react';
import { Button, Dropdown, Empty, Space, Table, Typography } from '@douyinfe/semi-ui';
import { IconChevronDown, IconChevronRight, IconMore } from '@douyinfe/semi-icons';
import AdminStatus from './AdminStatus';
import { activeRouteVersion } from './service-routing';

export default function ChannelDirectoryTags({ connections, state, can, onAction, onView, expanded, setExpanded }) {
  const actionTrigger = useRef(null);
  const groups = new Map();
  const membersById = new Map(state.modelSupplies.filter(row => row.status !== '已移除').map(row => [row.id, row.endpointId]));
  const groupNames = new Map();
  for (const route of state.serviceRoutes || []) {
    const config = activeRouteVersion(route)?.config;
    for (const member of config?.channels || []) {
      if (!member.enabled) continue;
      const endpointId = membersById.get(member.supplyId) || member.supplyId;
      const name = config.groups?.find(item => item.id === member.groupId)?.name || member.groupId;
      if (name) groupNames.set(endpointId, new Set([...(groupNames.get(endpointId) || []), name]));
    }
  }
  for (const connection of connections) {
    const tags = connection.endpoint.directoryTags || [];
    for (const tag of tags.length ? tags : ['']) {
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push(connection);
    }
  }
  const rows = [...groups].map(([tag, members]) => ({ id: tag ? 'tag:' + tag : 'untagged', tag, members }))
    .sort((left, right) => (!left.tag ? 1 : !right.tag ? -1 : left.tag.localeCompare(right.tag, 'zh-CN')));
  return <Table aria-label="运维标签" rowKey="id" size="small" dataSource={rows} pagination={false} scroll={{ x: 920 }}
    hideExpandedColumn expandIcon={false} expandedRowKeys={expanded}
    expandedRowRender={row => <Table rowKey="id" size="small" dataSource={row.members} pagination={false} columns={[
      { title: '连接', render: (_, item) => <Typography.Text strong>{item.name}</Typography.Text> },
      { title: '服务商', render: (_, item) => item.provider.name },
      { title: '状态', render: (_, item) => <AdminStatus value={item.status}/> },
      { title: '路由分组', render: (_, item) => [...(groupNames.get(item.id) || [])].join('、') || '—' },
      { title: '操作', render: (_, item) => <Button size="small" theme="borderless"
        data-channel-detail-link={row.id + ':' + item.id} onClick={event => onView(item.id, null, event)}>查看连接</Button> },
    ]}/>}
    empty={<Empty description="暂无连接可分组"/>} columns={[
      { title: '运维标签', width: 170, render: (_, row) => <Space spacing={6}>
        <Button size="small" theme="borderless" type="tertiary" icon={expanded.includes(row.id) ? <IconChevronDown/> : <IconChevronRight/>}
          aria-expanded={expanded.includes(row.id)} aria-label={(expanded.includes(row.id) ? '收起 ' : '展开 ') + (row.tag || '未标记')}
          onClick={() => setExpanded(keys => keys.includes(row.id) ? keys.filter(key => key !== row.id) : [...keys, row.id])}/>
        <Typography.Text strong>{row.tag || '未标记'}</Typography.Text>
      </Space> },
      { title: '连接数', width: 100, render: (_, row) => row.members.length },
      { title: '停用 / 总数', width: 112, render: (_, row) => row.members.filter(item => ['已停用', '自动停用'].includes(item.status)).length + ' / ' + row.members.length },
      { title: '路由分组', width: 160, render: (_, row) => [...new Set(row.members.flatMap(item => [...(groupNames.get(item.id) || [])]))].join('、') || '—' },
      { title: '操作', render: (_, row) => <Space wrap spacing={6}>
        {row.tag ? <>
          <Button size="small" theme="borderless" disabled={!can || row.members.length > 100}
            onClick={event => onAction(event.currentTarget, 'tagEdit', row.tag, row.members)}>批量编辑</Button>
          <Dropdown clickToHide trigger="click" position="bottomRight" render={<Dropdown.Menu>
            {[['renameTag', '重命名标签'], ['enable', '启用组内连接'], ['disable', '停用组内连接'], ['dissolveTag', '解散标签']].map(([action, label]) =>
              <Dropdown.Item key={action} type={action === 'dissolveTag' ? 'danger' : undefined} disabled={!can || row.members.length > 100}
                onClick={() => onAction(actionTrigger.current, action, row.tag, row.members)}>{label}</Dropdown.Item>)}
          </Dropdown.Menu>}>
            <Button size="small" theme="borderless" icon={<IconMore/>} aria-label={'标签更多操作 ' + row.tag}
              onClick={event => { actionTrigger.current = event.currentTarget; }}/>
          </Dropdown>
        </>
          : <Button size="small" theme="borderless" disabled={!can || row.members.length > 100}
            onClick={event => onAction(event.currentTarget, 'tag', undefined, row.members)}>设置标签</Button>}
      </Space> },
    ]}/>
}
