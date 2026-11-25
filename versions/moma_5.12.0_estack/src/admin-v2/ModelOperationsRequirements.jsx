import { useEffect, useState } from 'react';
import { Banner, Button, Space, Spin } from '@douyinfe/semi-ui';
import { cloudAdminRequest } from './admin-client.mjs';
import './model-operations-requirements.css';

export default function ModelOperationsRequirements({ english }) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = await cloudAdminRequest('/docs/model-operations', { signal: controller.signal });
        if (typeof data.html !== 'string' || !data.html.trim()) throw new Error('Missing document');
        if (!controller.signal.aborted) setResult({ html: data.html });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ forbidden: error.status === 403 });
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  if (!result) return <div role="status"><Space>
    <span aria-hidden="true"><Spin size="small"/></span>
    {english ? 'Loading requirements…' : '正在加载需求文档…'}
  </Space></div>;

  if (!result.html) return <Banner type={result.forbidden ? 'warning' : 'danger'} closeIcon={null}
    description={<Space wrap>
      {result.forbidden
        ? (english ? 'You don’t have access to the requirements.' : '当前账号无权查看需求文档。')
        : (english ? 'Could not load the requirements.' : '需求文档加载失败。')}
      {!result.forbidden && <Button size="small" onClick={() => {
        setResult(null);
        setAttempt(value => value + 1);
      }}>{english ? 'Retry' : '重试'}</Button>}
    </Space>}/>;

  return <iframe className="model-operations-requirements" title={english ? 'Model operations requirements' : '模型运营需求文档'}
    srcDoc={result.html} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer"/>;
}
