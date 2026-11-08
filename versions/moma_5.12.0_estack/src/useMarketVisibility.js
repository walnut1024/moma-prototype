import { API_PREFIX } from '../api-path.js';
import { useEffect, useState } from 'react';
import { marketDemoModelIds } from './mock/model-data.js';

const demoIds = new Set(marketDemoModelIds());

export function useMarketVisibility(enabled) {
  const [visibility, setVisibility] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let request;
    const refresh = async () => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch(API_PREFIX+'/model-market/visibility', { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw Error('展示状态读取失败');
        const result = await response.json();
        if (!result.visibility || typeof result.visibility !== 'object' || Array.isArray(result.visibility) ||
          Object.values(result.visibility).some(value => typeof value !== 'boolean')) throw Error('展示状态无效');
        if (controller.signal.aborted) return;
        setVisibility(result.visibility);
        setError('');
      } catch {
        if (controller.signal.aborted) return;
        setVisibility(null);
        setError('暂时无法读取模型广场展示设置，请刷新重试。');
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      request?.abort();
      window.removeEventListener('focus', refresh);
    };
  }, [enabled]);
  return { visibility, error, loading: enabled && visibility === null && !error };
}

export function marketDisplayServices(services, visibility) {
  return services.flatMap(row => {
    if (demoIds.has(row.modelKey) && visibility === null) return [];
    const visible = visibility?.[row.modelKey] ?? row.marketVisible;
    if (visible === false) return [];
    return [visible === row.marketVisible ? row : { ...row, marketVisible: visible }];
  });
}
