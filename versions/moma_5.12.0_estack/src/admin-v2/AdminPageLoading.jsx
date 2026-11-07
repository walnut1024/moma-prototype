import { Space, Spin, Typography } from '@douyinfe/semi-ui';

export default function AdminPageLoading({ label }) {
  return <div role="status">
    <Space>
      <div aria-hidden="true"><Spin size="small"/></div>
      <Typography.Text type="secondary">正在加载{label}…</Typography.Text>
    </Space>
  </div>;
}
