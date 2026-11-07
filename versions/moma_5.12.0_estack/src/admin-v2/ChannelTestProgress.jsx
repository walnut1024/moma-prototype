import { Space, Spin, Typography } from '@douyinfe/semi-ui';
import { channelBatchProgress } from './channel-test-jobs';

export default function ChannelTestProgress({ batch, running, children }) {
  const counts = channelBatchProgress(batch);
  const summary = batch
    ? `通过 ${counts.passed}／失败 ${counts.failed}／排队 ${counts.queued}／测试中 ${counts.running}／未知 ${counts.unknown}／取消 ${counts.cancelled}`
    : running ? '正在处理检测请求…' : children;

  return <Space wrap>
    {running && <div aria-hidden="true"><Spin size="small"/></div>}
    <Typography.Text type="secondary" role="status">{summary}</Typography.Text>
  </Space>;
}
