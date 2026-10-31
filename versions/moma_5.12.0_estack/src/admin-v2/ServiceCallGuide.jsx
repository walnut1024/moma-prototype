import ServicePlatformTrial from './ServicePlatformTrial';
import {useState} from 'react';
import {Copy} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '../components/ui/button';
import {Tabs,TabsList,TabsTrigger} from '../components/ui/tabs';
import {Choice,Field} from './ModelMetadataForm';
import {CopyId,Notice} from './ModelOperationsUI';
import {routingServices} from './service-routing';
import {serviceConfiguration} from './service-workspace';
import {serviceGuideRequest,serviceGuideCode} from './service-guide';

export default function ServiceCallGuide({state,model,ops}) {
  const services=routingServices(state).filter(item=>item.modelId===model.id), [providerId,setProviderId]=useState(services[0]?.id || ''), [language,setLanguage]=useState('cURL');
  const service=services.find(item=>item.id===providerId) || services[0], configuration=serviceConfiguration(state,model);
  if (!model.serviceMode || !service?.callId || configuration.issues.length) return <div className="sm-empty sm-first-config"><h2>{!model.serviceMode?'调用指南尚未生成':'调用指南待完善'}</h2><p>完成服务模式、售价、渠道和路由配置后，生成对应模型服务的调用示例。</p><ServicePlatformTrial state={state} model={model} ops={ops} providerId={service?.providerId}/><Button variant="outline" onClick={()=>ops.go({panel:null,providerEdit:null})}>前往服务内容</Button></div>;
  const request=serviceGuideRequest(model,service.callId), code=serviceGuideCode(request,language);
  return <div className="sm-model-form sm-guide">
    <div className="sm-section-bar"><h2>API 调用</h2><ServicePlatformTrial state={state} model={model} ops={ops} providerId={service.providerId}/>{model.serviceMode==='provider' && <Field label="供应商"><Choice label="调用指南供应商" value={service.id} options={services.map(item=>[item.id,item.name])} onChange={setProviderId}/></Field>}</div>
    {model.listingStatus!=='已上架' && <Notice>当前服务已下架，完成配置并重新上架后可调用。</Notice>}
    <dl className="sm-guide-info"><div><dt>对外调用 ID</dt><dd><CopyId value={service.callId} label="对外调用 ID"/></dd></div><div><dt>接口路径</dt><dd><code>POST /v1{request.path}</code></dd></div><div><dt>鉴权</dt><dd>Bearer Token · 使用已授权当前模型的 API 密钥</dd></div></dl>
    <p className="mo-muted">将 MOMA_BASE_URL 替换为平台提供的 API 地址（包含 /v1），MOMA_API_KEY 替换为已授权密钥。</p>
    <div className="sm-guide-toolbar"><Tabs value={language} onValueChange={setLanguage}><TabsList variant="line">{['cURL','Python','Java','Go'].map(item=><TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}</TabsList></Tabs><Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(code);toast.success('调用示例已复制');}catch{toast.error('复制失败，请选择代码复制');}}}><Copy/>复制代码</Button></div>
    <pre className="sm-guide-code"><code>{code}</code></pre>
  </div>;
}
