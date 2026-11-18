import { Banner, Card, Descriptions } from '@douyinfe/semi-ui';
import AdminPageHeading from './AdminPageHeading';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { LICENSE_NAMES } from '../deployment-license.mjs';
import { displayTime } from './model-management';

const labels = { active: '有效', expired: '已到期', invalid: '配置无效', unavailable: '读取失败' };

export default function LicensePage({ license }) {
  const status = license.managed ? labels[license.status] : '默认配置';
  const rows = [
    { id: 'common', name: '模型广场、模型服务、组织与项目', state: '可用' },
    { id: 'commerce', name: '模型销售、客户管理、订购与账单、套餐管理及经营分析', state: !license.commercial ? '不包含' : license.commerceWritable ? '可用' : '仅可查看' },
  ];
  return <div className="admin-page-stack">
    <AdminPageHeading title="License 管理"/>
    <Card>
      <Descriptions data={[
        { key: '授权规格', value: LICENSE_NAMES[license.commercial ? 'commercial' : 'internal'] },
        { key: '授权状态', value: <AdminStatus value={status}/> },
        { key: '有效期至', value: license.expiresAt ? displayTime(license.expiresAt) : '—' },
      ]}/>
    </Card>
    {license.status === 'expired' && <Banner type="warning" closeIcon={null} title="授权已到期"
      description="商业运营保留历史记录查阅，新增订购与经营配置变更暂不可用。"/>}
    <Card title="功能范围">
      <Table size="small" rowKey="id" dataSource={rows} pagination={false} columns={[
        { title: '功能', dataIndex: 'name' }, { title: '授权状态', dataIndex: 'state' },
      ]}/>
    </Card>
  </div>;
}
