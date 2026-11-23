import { Descriptions } from '@douyinfe/semi-ui';
import { useChannelText } from './channel-language';

export default function AdminDescriptions({ data, ...props }) {
  const t = useChannelText();
  return <Descriptions {...props} data={data.map(item => ({ ...item, key: t(item.key) }))}/>;
}
