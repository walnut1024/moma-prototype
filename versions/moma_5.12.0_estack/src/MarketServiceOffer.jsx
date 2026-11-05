import { useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from './components/ui/button';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { serviceGuideCode } from './admin-v2/service-guide.js';

export default function MarketServiceOffer({ service }) {
  const [language, setLanguage] = useState('cURL'), [feedback, setFeedback] = useState('');
  const code = serviceGuideCode(service.guideRequest, language);
  return <>
    <section className="market-code-example"><p>POST /v1{service.guideRequest.path}</p><p>将 MOMA_BASE_URL 替换为平台 API 地址（包含 /v1），MOMA_API_KEY 替换为已授权当前服务的 API Key。</p>
      <div className="market-guide-toolbar"><Tabs value={language} onValueChange={value => { setLanguage(value); setFeedback(''); }}><TabsList aria-label="调用示例语言">{['cURL', 'Python', 'Java', 'Go'].map(item => <TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}</TabsList></Tabs><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(code); setFeedback('调用示例已复制'); } catch { setFeedback('复制失败，请选择代码复制'); } }}><Copy/>复制代码</Button></div>
      <pre className="market-guide-code"><code>{code}</code></pre><span role="status">{feedback}</span>
    </section>
  </>;
}
