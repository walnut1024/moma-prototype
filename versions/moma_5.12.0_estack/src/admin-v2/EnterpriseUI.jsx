import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { Descriptions, Modal, Typography } from '@douyinfe/semi-ui';
import './semi-enterprise.css';

export function EnterpriseStatus({ value, enterprise = false }) {
  const label = value === '正常' ? '已启用' : value === '停用' ? enterprise ? '已冻结' : '已停用' : value;
  return <AdminStatus value={label}/>;
}

export function EnterpriseFacts({ rows }) {
  return <Descriptions align="left" data={rows.map(([key, value]) => ({ key, value: value ?? '—' }))}/>;
}

export function EnterpriseTable({ columns, rows, empty, pagination = false, minWidth = 680 }) {
  return <Table size="small" rowKey="id" columns={columns.map((column, index) =>
    ({ ...(typeof column === 'string' ? { title: column } : column), key: index, render: (_, row) => row.cells[index] }))}
    dataSource={rows} scroll={{ x: `max(100%, ${minWidth}px)` }} pagination={pagination} empty={empty}/>;
}

export function EnterpriseDialog({ title, description, close, children, wide = false, closeOnEsc = true }) {
  return <Modal visible title={title} width={`min(${wide ? 840 : 620}px, calc(100vw - 32px))`}
    onCancel={close} maskClosable={false} footer={null} closeOnEsc={closeOnEsc}>
    <div className="admin-analytics-fields admin-enterprise-dialog">
      {description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}
      {children}
    </div>
  </Modal>;
}
