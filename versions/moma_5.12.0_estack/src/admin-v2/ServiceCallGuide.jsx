import { activeModelSalePrice, activeProviderPrice } from './service-workspace';
import { priceItems } from './model-management';
import { itemMoney } from './SupplyPriceEditor';
import ModelFieldLabel from './ModelFieldLabel';
import ServicePlatformTrial from './ServicePlatformTrial';
import {useRef,useState} from 'react';
import {Copy} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '../components/ui/button';
import {Choice,Field} from './ModelMetadataForm';
import {CopyId,Notice} from './ModelOperationsUI';
import {routingServices} from './service-routing';
import {serviceConfiguration,serviceConfigurationTarget} from './service-workspace';
import {serviceGuideRequest,serviceGuideCode} from './service-guide';

export default function ServiceCallGuide({state,model,ops}) {
  const services=routingServices(state).filter(item=>item.modelId===model.id), [providerId,setProviderId]=useState(services.find(item=>item.providerId===ops.params.get('routeProvider'))?.id || services[0]?.id || '');
  const [editing,setEditing]=useState(null),[codes,setCodes]=useState({}),[base,setBase]=useState('');
  const editor=useRef(null);
  const service=services.find(item=>item.id===providerId) || services[0], configuration=serviceConfiguration(state,model);
  if (!model.serviceMode || !service?.callId || configuration.setupIssues.length) return <div className="sm-empty sm-first-config"><h2>{!model.serviceMode?'调用指南尚未生成':'调用指南待完善'}</h2><p>完成服务模式、渠道、路由和开放范围配置后，生成对应模型服务的调用示例。</p><ServicePlatformTrial state={state} model={model} ops={ops} providerId={service?.providerId}/><Button variant="outline" onClick={()=>ops.go(serviceConfigurationTarget(model,configuration.setupIssues[0] || {tab:'serviceMode'}))}>前往完善配置</Button></div>;
  const request=serviceGuideRequest(editing?{...model,apiGuides:{...model.apiGuides,[service.providerId || 'standard']:{codes}}}:model,service.callId,service.providerId);
  return <div className="sm-model-form sm-guide"><div className="sm-section-bar"><ServicePlatformTrial state={state} model={model} ops={ops} providerId={service.providerId}/></div>
    {model.serviceMode==='provider' && <div className="sm-section-bar"> <Field label="供应商"><Choice label="调用指南供应商" value={service.id} options={services.map(item=>[item.id,item.name])} disabled={Boolean(editing)} onChange={id=>{setProviderId(id);ops.go({panel:'guide',routeProvider:services.find(item=>item.id===id)?.providerId || null},{preserveScroll:true});}}/></Field></div>}
    {!model.callsEnabled && <Notice>当前技术服务未启用，完成管理端验证后可启用。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <dl className="sm-guide-info"><div><dt><ModelFieldLabel name="对外调用标识"/></dt><dd><CopyId value={service.callId} label="对外调用标识"/></dd></div><div><dt>接口路径</dt><dd><code>POST /v1{request.path}</code></dd></div><div><dt>鉴权</dt><dd>Bearer Token · 使用已授权当前模型的 API 密钥</dd></div></dl>
    <section className="sm-guide-commercial"><h3>生效售价</h3><ul>{priceItems(service.providerId?activeProviderPrice(state,model.id,service.providerId):activeModelSalePrice(state,model.id),model).map((row,i)=><li key={i}>{row.name}{row.condition?'（'+row.condition+'）':''}：{itemMoney(row)} / {row.unit}</li>)}</ul><p>开放范围：{model.openScope==='all'?'全部有效客户':state.tenants.filter(row=>model.tenantIds?.includes(row.id)).map(row=>row.name).join('、') || '尚未配置'}</p></section>
    <p className="mo-muted">将 MOMA_BASE_URL 替换为平台提供的 API 地址（包含 /v1），MOMA_API_KEY 替换为已授权密钥。</p>
    {['cURL','Python','Java','Go'].map(language=>{const code=serviceGuideCode(request,language);return <section className="sm-guide-language" key={language} aria-label={`${language} 调用示例`}>
    <div className="sm-guide-toolbar"><h3>{language}</h3><div className="sm-guide-actions">{editing!==language && <Button disabled={!ops.can || Boolean(editing)} onClick={()=>{setCodes(Object.fromEntries(['cURL','Python','Java','Go'].map(lang=>[lang,serviceGuideCode(request,lang)])));setBase(JSON.stringify([model.updatedAt,model.apiGuides || {}]));setEditing(language);ops.setError('');}}>编辑 {language}</Button>}<Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(code);toast.success('调用示例已复制');}catch{toast.error('复制失败，请选择代码复制');}}}><Copy/>复制代码</Button></div></div>
    {editing===language && <p className="mo-muted">Tab 插入缩进；选中 JSON 请求体后可格式化。请使用密钥占位符。</p>}<div className={editing===language?"sm-guide-editor-grid":""}><div className="sm-guide-preview">{editing===language && <h4>预览</h4>}<pre className="sm-guide-code"><code>{code.split(/("(?:[^"\\]|\\.)*"|'[^']*'|\b(?:import|from|var|func|return|package|if|defer)\b)/g).map((part,index)=><span key={index} style={{color:/^["']/.test(part)?'#16714b':/^(import|from|var|func|return|package|if|defer)$/.test(part)?'#8544aa':undefined}}>{part}</span>)}</code></pre></div>
    {editing===language && <div className="sm-guide-input"><h4>输入代码</h4><textarea ref={editor} aria-label={`${language} API 示例代码`} className="sm-guide-code" maxLength={50000} value={code} spellCheck={false} onChange={event=>{setCodes({...codes,[language]:event.target.value});ops.dirty(true);}} onKeyDown={event=>{if(event.key==='Tab'){event.preventDefault();const input=event.currentTarget,start=input.selectionStart,end=input.selectionEnd;setCodes({...codes,[language]:code.slice(0,start)+'  '+code.slice(end)});ops.dirty(true);requestAnimationFrame(()=>input.setSelectionRange(start+2,start+2));}}} onSelect={event=>{event.currentTarget.dataset.start=event.currentTarget.selectionStart;event.currentTarget.dataset.end=event.currentTarget.selectionEnd;}}/><Button variant="outline" onClick={()=>{const input=editor.current,start=Number(input.dataset.start || 0),end=Number(input.dataset.end || code.length);try{const formatted=JSON.stringify(JSON.parse(code.slice(start,end)),null,2);setCodes({...codes,[language]:code.slice(0,start)+formatted+code.slice(end)});ops.dirty(true);}catch{toast.error('请选中有效的 JSON 请求体后格式化');}}}>格式化所选 JSON</Button></div>}
    </div>
    {editing===language && <div className="mo-footer"><Button variant="outline" onClick={()=>ops.proceed(()=>{setEditing(null);ops.dirty(false);ops.setError('');})}>取消</Button><Button disabled={!ops.can || !Object.values(codes).some(value=>value.trim())} onClick={async ()=>{if(await ops.run('guidePublish',{providerId:service.providerId || '',codes,expectedBase:base},model.id)){setEditing(null);ops.dirty(false);toast.success('调用指南已生效');}}}>保存并生效</Button></div>}
    </section>;})}
  </div>;
}
