import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-bash';
import { FieldLabel as ModelFieldLabel } from './ServiceUI';
import {useRef,useState} from 'react';
import {Copy} from 'lucide-react';
import { CodeHighlight, Button, Toast, TextArea, Typography, Descriptions } from '@douyinfe/semi-ui';
import {Choice, Field} from './ServiceUI';
import {CopyId,Notice} from './ServiceUI';
import {routingServices} from './service-routing';
import {serviceConfiguration,serviceConfigurationTarget} from './service-workspace';
import {serviceGuideRequest,serviceGuideCode} from './service-guide';

export default function ServiceCallGuide({state,model,ops}) {
  const services=routingServices(state).filter(item=>item.modelId===model.id), [providerId,setProviderId]=useState(services.find(item=>item.providerId===ops.params.get('routeProvider'))?.id || services[0]?.id || '');
  const [editing,setEditing]=useState(null),[codes,setCodes]=useState({}),[base,setBase]=useState('');
  const editor=useRef(null);
  const service=services.find(item=>item.id===providerId) || services[0], configuration=serviceConfiguration(state,model);
  if (!model.serviceMode || !service?.callId || configuration.setupIssues.length) return <div className="ss-empty ss-first-config"><Typography.Title heading={5}>{!model.serviceMode?'调用指南尚未生成':'调用指南待完善'}</Typography.Title><Typography.Paragraph>完成服务模式、渠道、路由和开放范围配置后，生成对应模型服务的调用示例。</Typography.Paragraph><Button theme="light" onClick={()=>(()=>{const {page,...target}=serviceConfigurationTarget(model,configuration.setupIssues[0] || {tab:'serviceMode'});ops.go({...target,returnTo:location.hash},{base:page,reset:true});})()}>前往完善配置</Button></div>;
  const request=serviceGuideRequest(editing?{...model,apiGuides:{...model.apiGuides,[service.providerId || 'standard']:{codes}}}:model,service.callId,service.providerId);
  return <div className="ss-model-form ss-guide">
    {model.serviceMode==='provider' && <div className="ss-section-bar"> <Field label="服务商"><Choice label="调用指南服务商" value={service.id} options={services.map(item=>[item.id,item.name])} disabled={Boolean(editing)} onChange={id=>{setProviderId(id);ops.go({panel:'guide',routeProvider:services.find(item=>item.id===id)?.providerId || null},{preserveScroll:true});}}/></Field></div>}
    {!model.callsEnabled && <Notice>当前技术服务未启用，完成管理端验证后可启用。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <Descriptions data={[{key:<><ModelFieldLabel name="对外调用标识"/></>,value:<><CopyId value={service.callId} label="对外调用标识"/></>},{key:<>接口路径</>,value:<><code>POST /v1{request.path}</code></>},{key:<>鉴权</>,value:<>Bearer Token · 使用已授权当前模型的 API 密钥</>}]}/>
    <section className="ss-guide-commercial"><Typography.Paragraph>开放范围：{model.openScope==='all'?'全部有效客户':state.tenants.filter(row=>model.tenantIds?.includes(row.id)).map(row=>row.name).join('、') || '尚未配置'}</Typography.Paragraph><Button theme="borderless" onClick={()=>ops.go({service:service.id,returnTo:location.hash},{base:'model-prices',reset:true})}>查看服务售价</Button></section>
    <Typography.Paragraph className="ss-muted">将 MOMA_BASE_URL 替换为平台提供的 API 地址（包含 /v1），MOMA_API_KEY 替换为已授权密钥。</Typography.Paragraph>
    {['cURL','Python','Java','Go'].map(language=>{const code=serviceGuideCode(request,language);return <section className="ss-guide-language" key={language} aria-label={`${language} 调用示例`}>
    <div className="ss-guide-toolbar"><Typography.Title heading={6}>{language}</Typography.Title><div className="ss-guide-actions">{editing!==language && <Button disabled={!ops.can || Boolean(editing)} onClick={()=>{setCodes(Object.fromEntries(['cURL','Python','Java','Go'].map(lang=>[lang,serviceGuideCode(request,lang)])));setBase(JSON.stringify([model.updatedAt,model.apiGuides || {}]));setEditing(language);ops.setError('');}}>编辑 {language}</Button>}<Button theme="light" onClick={async()=>{try{await navigator.clipboard.writeText(code);Toast.success('调用示例已复制');}catch{Toast.error('复制失败，请选择代码复制');}}}><Copy/>复制代码</Button></div></div>
    {editing===language && <Typography.Paragraph className="ss-muted">Tab 插入缩进；选中 JSON 请求体后可格式化。请使用密钥占位符。</Typography.Paragraph>}<div className={editing===language?"ss-guide-editor-grid":""}><div className="ss-guide-preview">{editing===language && <Typography.Title heading={6}>预览</Typography.Title>}<CodeHighlight className="ss-guide-code" language={{cURL:"bash",Python:"python",Java:"java",Go:"go"}[language]} code={code}/></div>
    {editing===language && <div className="ss-guide-input"><Typography.Title heading={6}>输入代码</Typography.Title><TextArea rows={14} ref={editor} aria-label={`${language} API 示例代码`} className="ss-guide-code" maxLength={50000} value={code} spellCheck={false} onChange={(_value,event) =>{setCodes({...codes,[language]:event.target.value});ops.dirty(true);}} onKeyDown={event=>{if(event.key==='Tab'){event.preventDefault();const input=event.currentTarget,start=input.selectionStart,end=input.selectionEnd;setCodes({...codes,[language]:code.slice(0,start)+'  '+code.slice(end)});ops.dirty(true);requestAnimationFrame(()=>input.setSelectionRange(start+2,start+2));}}} onSelect={event=>{event.currentTarget.dataset.start=event.currentTarget.selectionStart;event.currentTarget.dataset.end=event.currentTarget.selectionEnd;}}/><Button theme="light" onClick={()=>{const input=editor.current,start=Number(input.dataset.start || 0),end=Number(input.dataset.end || code.length);try{const formatted=JSON.stringify(JSON.parse(code.slice(start,end)),null,2);setCodes({...codes,[language]:code.slice(0,start)+formatted+code.slice(end)});ops.dirty(true);}catch{Toast.error('请选中有效的 JSON 请求体后格式化');}}}>格式化所选 JSON</Button></div>}
    </div>
    {editing===language && <div className="ss-footer"><Button theme="light" onClick={()=>ops.proceed(()=>{setEditing(null);ops.dirty(false);ops.setError('');})}>取消</Button><Button disabled={!ops.can || !Object.values(codes).some(value=>value.trim())} onClick={async ()=>{if(await ops.run('guidePublish',{providerId:service.providerId || '',codes,expectedBase:base},model.id)){setEditing(null);ops.dirty(false);Toast.success('调用指南已生效');}}}>保存并生效</Button></div>}
    </section>;})}
  </div>;
}
