import { Banner, Typography } from '@douyinfe/semi-ui';
import { useState } from 'react';
import { useChannelText } from './channel-language';
import { createInferenceDemoState } from './inference-demo-data.js';

export default function InferenceDemo({ role, children }) {
  const t = useChannelText();
  const [fixtures] = useState(() => createInferenceDemoState());
  const state = { ...fixtures, currentRole: role, inferenceDemo: true };

  return <>
    <Banner type="info" closeIcon={null} title={t('模型推理演示数据')}
      description={<Typography.Text link={{ href: location.pathname + '#/admin-2/deployments' }}>
        {t('返回实际部署')}
      </Typography.Text>}/>
    {children(state, true, { refresh: async () => state })}
  </>;
}
