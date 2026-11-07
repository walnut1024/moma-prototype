import Table from './AdminTable';
import { useState } from 'react';
import { Button, Card, Space, Tabs, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus } from '@douyinfe/semi-icons';
import AdminPageHeading from './AdminPageHeading';
import { deploymentUsesArtifact } from './deployments';

const categories = ['模型制品', '基础镜像', '运行时镜像'];

export default function ArtifactManagement({ state, dispatch }) {
  const [category, setCategory] = useState(categories[0]);
  const rows = state.artifacts.filter(row => row.type === category).map(row => ({
    ...row, refs: state.deployments.filter(deployment => deploymentUsesArtifact(deployment, row.id)).length,
  }));
  const add = () => {
    const now = Date.now();
    dispatch({ type: 'add', collection: 'artifacts', record: {
      id: `artifact-${now}`, name: `${category} ${state.artifacts.length + 1}`, type: category,
      version: 'v1.0', digest: `sha256:${now.toString(16)}`, size: '1.2 GB', validation: '待验证', status: '不可运行',
    } });
  };
  const update = (row, changes) => dispatch({ type: 'update', collection: 'artifacts', id: row.id, changes });
  const remove = row => {
    if (row.refs) return Toast.error(`该制品被 ${row.refs} 个部署引用，不能删除`);
    update(row, { status: '已删除' });
  };

  return <div className="admin-page-stack">
    <AdminPageHeading title="制品镜像" description="管理部署所需的模型制品与运行镜像，查看验证状态及部署引用。">
      <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} onClick={add}>登记制品</Button>
    </AdminPageHeading>
    <Card>
      <Tabs activeKey={category} onChange={setCategory}>
        {categories.map(value => <Tabs.TabPane key={value} itemKey={value} tab={value}/>)}
      </Tabs>
      <Table size="small" rowKey="id" dataSource={rows} pagination={false} scroll={{ x: 'max(100%, 850px)' }}
        empty={`暂无${category}`} footer={() => <Typography.Text type="secondary">共 {rows.length} 个{category}</Typography.Text>} columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '版本', dataIndex: 'version' },
          { title: '摘要', dataIndex: 'digest', render: value => <Typography.Text code>{value}</Typography.Text> },
          { title: '大小', dataIndex: 'size', align: 'right' },
          { title: '引用部署', dataIndex: 'refs', align: 'right' },
          { title: '验证', dataIndex: 'validation', render: value => <Tag color={value === '通过' ? 'green' : 'orange'}>{value}</Tag> },
          { title: '状态', dataIndex: 'status', render: value => <Tag color={value === '可运行' ? 'green' : 'grey'}>{value}</Tag> },
          { title: '操作', render: (_, row) => <Space spacing={4}>
            {row.validation !== '通过' && <Button size="small" theme="borderless"
              onClick={() => update(row, { validation: '通过', status: '可运行' })}>校验</Button>}
            <Button size="small" type="danger" theme="borderless" onClick={() => remove(row)}>删除</Button>
          </Space> },
        ]}/>
    </Card>
  </div>;
}
