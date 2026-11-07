import { useState } from 'react';
import { Avatar, Banner, Button, Card, Checkbox, Input, Space, Tree, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, FilterReset, FilterToolbar } from '../components/FilterControls';
import { departmentPath, descendantIds } from '../organization-data.mjs';
import { Choice } from './ServiceUI';
import { EnterpriseDialog, EnterpriseFacts, EnterpriseStatus, EnterpriseTable } from './EnterpriseUI';
import { effectiveEnterpriseAdmins, isEnterpriseAdmin } from './enterprise';
import { enterpriseMemberView } from './enterprise-members';

const { Paragraph, Text, Title } = Typography;

export default function EnterpriseMembers({ state, tenant, projects, canWrite, setEditor, setResult, askToggle }) {
  const [selection, setSelection] = useState('all');
  const [treeQuery, setTreeQuery] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [includeChildren, setIncludeChildren] = useState(true);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [inspectId, setInspectId] = useState(null);
  const { organizations, members, organization, scoped, filtered, organizationFor, userFor } =
    enterpriseMemberView(state, tenant, { selection, includeChildren, query, role, status });
  const admins = members.filter(member => isEnterpriseAdmin(member, tenant));
  const validAdmins = effectiveEnterpriseAdmins(state, tenant);
  const title = organization?.name || ({ all: '全部成员', admins: '企业管理员', unassigned: '未分配部门' })[selection] || '组织不存在';
  const organizationPath = organization && departmentPath(organizations, organization.id);
  const description = organization ? organizationPath !== title && organizationPath
    : selection === 'admins' ? '至少保留一位有效企业管理员。' : selection === 'unassigned' ? '查看尚未登记主部门的成员。' : '';
  const current = Math.max(1, Math.min(page, Math.ceil(filtered.length / size) || 1));
  const inspect = members.find(member => member.id === inspectId);
  const inspectUser = inspect && userFor(inspect);
  const select = value => { setSelection(value); setPage(1); };
  const reset = () => { setQuery(''); setRole('all'); setStatus('all'); setPage(1); };
  const projectScope = member => isEnterpriseAdmin(member, tenant) ? '企业全部项目'
    : projects.filter(project => member.projectIds?.includes(project.id)).map(project => project.name).join('、') || '未分配项目';
  const lastAdmin = member => validAdmins.some(admin => admin.id === member.id) && validAdmins.length <= 1;
  const canToggle = member => canWrite && tenant.status !== '停用' && !lastAdmin(member)
    && !(member.status === '停用' && userFor(member)?.status !== '正常');
  const pathFor = member => organizationFor(member) ? departmentPath(organizations, member.organizationId) : '未登记部门归属';

  const search = treeQuery.trim().toLowerCase();
  const orgIds = new Set(organizations.map(node => node.id));
  const treeNode = (node, visited = new Set()) => {
    if (visited.has(node.id)) return null;
    const branch = new Set([...visited, node.id]);
    const children = organizations.filter(org => org.parentId === node.id).map(org => treeNode(org, branch)).filter(Boolean);
    if (search && !children.length && !node.name.toLowerCase().includes(search)) return null;
    const ids = descendantIds(organizations, node.id);
    const count = members.filter(member => ids.has(member.organizationId)).length;
    return { key: node.id, value: node.id, label: node.name, count, path: departmentPath(organizations, node.id), children };
  };
  const treeData = organizations.filter(org => org.parentId === null || !orgIds.has(org.parentId)).map(org => treeNode(org)).filter(Boolean);
  const allKeys = organizations.map(org => org.id);

  return <div className="admin-enterprise-members">
    <Card>
      <nav aria-label="企业组织导航" className="admin-analytics-fields">
        <Title heading={6} component="h3">成员范围</Title>
        <div className="admin-enterprise-member-scope" role="group" aria-label="成员范围">
          {[
            ['all', '全部成员', members.length], ['admins', '企业管理员', admins.length],
            ['unassigned', '未分配部门', members.filter(member => !organizationFor(member)).length],
          ].map(([id, label, count]) => <Button key={id} block theme={selection === id ? 'light' : 'borderless'}
            type={selection === id ? 'primary' : 'tertiary'} aria-current={selection === id ? 'true' : undefined} onClick={() => select(id)}>
            {label}（{count}）
          </Button>)}
        </div>
        <Title heading={6} component="h3">组织架构</Title>
        <Input prefix={<IconSearch aria-hidden="true"/>} aria-label="搜索企业组织" placeholder="搜索组织名称"
          showClear value={treeQuery} onChange={setTreeQuery}/>
        {treeData.length ? <div className="admin-enterprise-tree" role="group" aria-label="企业组织树">
          <Tree treeData={treeData} value={organization?.id ?? ''} motion={false}
            expandedKeys={search || !expanded ? allKeys : expanded} onExpand={keys => { if (!search) setExpanded(keys); }}
            onSelect={select} renderLabel={(label, node) => <Button size="small" theme="borderless" type="tertiary"
              aria-label={`查看组织：${label}`} aria-pressed={selection === node.key} title={node.path}
              onClick={event => { event.stopPropagation(); select(node.key); }}>
              <span className="admin-enterprise-tree-label">
                <Text>{label}</Text><Text size="small" type="secondary" title="已登记到该组织及子部门的成员数">{node.count}</Text>
              </span>
            </Button>}/>
        </div> : <Text type="secondary">{organizations.length ? '没有匹配的组织' : '尚未配置组织'}</Text>}
      </nav>
    </Card>
    <section aria-label="企业成员列表">
      <Card title={<Title heading={5} component="h2">{title}</Title>}
        headerExtraContent={<Button theme="solid" disabled={!canWrite || tenant.status === '停用'} icon={<IconPlus aria-hidden="true"/>}
          onClick={() => setEditor({ kind: 'add-admin', tenant })}>添加管理员</Button>}>
        <div className="admin-analytics-fields">
          {description && <Paragraph type="secondary">{description}</Paragraph>}
          <Text type="secondary">已启用 {scoped.filter(member => member.status === '正常').length} 人 · 已停用 {scoped.filter(member => member.status === '停用').length} 人</Text>
          {!validAdmins.length && <Banner type="warning" closeIcon={null} description="当前没有有效企业管理员，请配置明确的企业管理员角色。"/>}
          <FilterToolbar>
            <Input className="admin-list-search" aria-label="搜索企业成员" prefix={<IconSearch aria-hidden="true"/>} showClear
              placeholder="姓名、登录账号或角色" value={query} onChange={value => { setQuery(value); setPage(1); }}/>
            <Choice label="企业成员状态" value={status} onChange={value => { setStatus(value); setPage(1); }}
              options={[[ 'all', '全部状态' ], [ '正常', '已启用' ], [ '停用', '已停用' ]]}/>
            <Choice label="企业角色筛选" value={role} onChange={value => { setRole(value); setPage(1); }}
              options={[[ 'all', '全部角色' ], ...[...new Set(members.map(member => member.role))].map(value => [value, value])]}/>
            {organization && <Checkbox checked={includeChildren}
              onChange={event => { setIncludeChildren(event.target.checked); setPage(1); }}>包含子部门</Checkbox>}
            <FilterReset onClick={reset}/>
          </FilterToolbar>
          <EnterpriseTable minWidth={selection === 'admins' ? 850 : 780} columns={selection === 'admins'
            ? ['成员 / 登录账号', '手机号码', '登录身份状态', '账号初始化', '成员状态', '操作']
            : ['成员', '登录账号', '主部门', '企业角色', '成员状态', '操作']}
            empty={members.length ? '当前范围内没有匹配成员' : '企业暂无成员'}
            rows={filtered.slice((current - 1) * size, current * size).map(member => {
              const user = userFor(member);
              const name = user?.name || member.name;
              const admin = isEnterpriseAdmin(member, tenant);
              return { id: member.id, cells: [
                <Space>
                  <Avatar size="extra-small" aria-hidden="true">{name.slice(-2)}</Avatar>
                  <div className="admin-table-record">
                    <Button size="small" theme="borderless" aria-label={`查看成员：${name}`} onClick={() => setInspectId(member.id)}>{name}</Button>
                    <Text size="small" type="secondary">{selection === 'admins' ? user?.login || member.userId : member.userId}</Text>
                  </div>
                </Space>,
                ...(selection === 'admins' ? [
                  user?.phone || '未填写', user ? <EnterpriseStatus value={user.status}/> : '身份不存在', user?.initialized ? '已完成' : '待初始化',
                ] : [user?.login || member.userId, <Text title={pathFor(member)}>{organizationFor(member)?.name || '未分配部门'}</Text>, member.role]),
                <EnterpriseStatus value={member.status}/>,
                <Space spacing={4}>
                  <Button size="small" theme="borderless" onClick={() => setInspectId(member.id)}>详情</Button>
                  {admin && <>
                    <Button size="small" theme="borderless" disabled={!canWrite || !user}
                      onClick={() => setResult({ tenant, user, handover: true })}>交接信息</Button>
                    <Button size="small" theme="borderless" disabled={!canToggle(member)}
                      title={lastAdmin(member) ? '至少保留一位有效企业管理员' : undefined}
                      onClick={() => askToggle(tenant, member)}>{member.status === '停用' ? '启用' : '停用'}</Button>
                  </>}
                </Space>,
              ] };
            })}
            pagination={{ currentPage: current, pageSize: size, total: filtered.length, pageSizeOpts: PAGE_SIZES, showTotal: true, showSizeChanger: true,
              onPageChange: setPage, onPageSizeChange: value => { setSize(value); setPage(1); } }}/>
        </div>
      </Card>
    </section>
    {inspect && <EnterpriseDialog title="成员详情" description={`${tenant.name} · ${inspectUser?.name || inspect.name}`} close={() => setInspectId(null)}>
      <EnterpriseFacts rows={[
        ['成员 ID', inspect.id], ['登录身份 ID', inspect.userId], ['登录账号', inspectUser?.login || inspect.userId],
        ['手机号码', inspectUser?.phone || '未填写'], ['主部门', pathFor(inspect)], ['企业角色', inspect.role],
        ['项目范围', projectScope(inspect)], ['登录身份状态', inspectUser ? <EnterpriseStatus value={inspectUser.status}/> : '身份不存在'],
        ['账号初始化', inspectUser?.initialized ? '已完成' : '待初始化'], ['本企业成员状态', <EnterpriseStatus value={inspect.status}/>],
      ]}/>
      <div className="admin-form-actions"><Button onClick={() => setInspectId(null)}>关闭</Button></div>
    </EnterpriseDialog>}
  </div>;
}
