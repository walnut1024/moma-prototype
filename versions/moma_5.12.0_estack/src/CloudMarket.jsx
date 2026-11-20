import { resourceId } from './resource-id.mjs';
import { API_PREFIX } from '../api-path.js';
import { useEffect, useId, useRef, useState } from 'react';
import { Banner, Button, Checkbox, Modal, TextArea } from '@douyinfe/semi-ui';
import { projectModelEnabled } from './project-access.mjs';
import { cloudMarketPresentation } from './service-directory.mjs';

export const MARKET_EVENT='moma5120-market-change';

export function marketRequest(path, body, signal) {
  return request('/market/'+path, body, signal);
}

async function request(path, body, signal) {
  const response=await fetch(API_PREFIX+path,{credentials:'same-origin',signal,
    ...(body?{method:'POST',headers:{'Content-Type':'application/json','X-MoMA-Request':'1'},body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if (!response.ok) {
    if (response.status===401 && data.error?.code==='TENANT_SESSION_REQUIRED') {
      window.dispatchEvent(new CustomEvent(MARKET_EVENT,{detail:'logout'}));
    }
    throw Object.assign(new Error(data.error?.message || '模型广场暂不可用'), { status: response.status, code: data.error?.code });
  }
  return data;
}

export function useCloudMarket(enabled=true) {
  const [view,setView]=useState({tenant:null,services:[],orders:[],loading:true,error:''});
  const [revision,setRevision]=useState(0);
  const [project,selectProject]=useState('');
  useEffect(()=>{
    if (!enabled) return;
    const controller=new AbortController();
    marketRequest('catalogue'+(project ? '?project='+encodeURIComponent(project) : ''),null,controller.signal).then(data=>{
      if (!controller.signal.aborted) setView({...data,project,services:data.services.map(cloudMarketPresentation),loading:false,error:''});
    }).catch(error=>{
      if (!controller.signal.aborted && error.code==='PROJECT_FORBIDDEN' && project) {
        selectProject('');
        return;
      }
      if (!controller.signal.aborted) setView({tenant:null,services:[],orders:[],loading:false,error:error.message});
    });
    return ()=>controller.abort();
  },[enabled,revision,project]);
  useEffect(()=>{
    if (!enabled) return;
    const refresh=event=>{
      if(['login','logout','switch'].includes(event.detail)) {
        selectProject('');
        setView({tenant:null,services:[],orders:[],loading:true,error:''});
      }
      setRevision(current=>current+1);
    };
    window.addEventListener(MARKET_EVENT,refresh);
    window.addEventListener('focus',refresh);
    return ()=>{window.removeEventListener(MARKET_EVENT,refresh);window.removeEventListener('focus',refresh);};
  },[enabled]);
  const write=async(path,body)=>{
    const result=await marketRequest(path,body);
    const event=['signup','invitations/accept'].includes(path)?'login':['password','password-reset'].includes(path)?'logout':path;
    if (['login','logout','switch'].includes(event)) setView({tenant:result.tenant || null,services:[],orders:[],loading:true,error:''});
    window.dispatchEvent(new CustomEvent(MARKET_EVENT,{detail:event}));
    return result;
  };
  const login = async (identifier, accessCode, tenantId) => {
    const result = await request('/auth/sign-in', {identifier, accessCode, tenantId});
    if (result.tenant) window.dispatchEvent(new CustomEvent(MARKET_EVENT, {detail:'login'}));
    return result;
  };
  const pendingProject=(view.project || '')!==project;
  return {...view,...(pendingProject && {services:[],loading:true}),selectProject,refresh:()=>setRevision(current=>current+1),login,
    acceptInvitation:data=>write('invitations/accept',data),
    updatePassword:(data,recovery)=>write(recovery?'password-reset':'password',data),
    switchSpace:tenantId=>write('switch',{tenantId}),
    logout:async()=>{const result=await request('/auth/logout',{});window.dispatchEvent(new CustomEvent(MARKET_EVENT,{detail:'logout'}));return result;},order:offers=>write('orders',{tenantId:view.tenant?.id,offerIds:offers.map(row=>row.id),
      salePriceIds:Object.fromEntries(offers.map(row=>[row.id,row.salePriceId]))})};
}

export function MarketAction({ action, market, project, close }) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);
  const [message,setMessage]=useState(''),[accepted,setAccepted]=useState(false);
  const formId=useId();
  const pending=useRef(null);
  const { service, kind }=action, ordering=kind==='order';
  async function submit(event) {
    event.preventDefault();
    if (busy || (ordering ? !accepted : !message.trim())) return;
    setBusy(true);setError('');setResult(null);
    try {
      if (ordering) {await market.order([service]);close();return;}
      if (pending.current?.text!==message) pending.current={text:message,id:resourceId('request')};
      if (!project || !projectModelEnabled(project,service.serviceModelId)) throw Error('请在当前项目开通此模型');
      const reply=await marketRequest('completions',{requestId:pending.current.id,model:service.callId,tenantId:market.tenant?.id,projectId:project.id,messages:[{role:'user',content:message}]});
      pending.current=null;
      setResult(reply);
      window.dispatchEvent(new Event(MARKET_EVENT));
    } catch (issue) {setError(issue.message);}
    finally {setBusy(false);}
  }
  return <Modal visible title={ordering?'确认订购':'在线调用'} onCancel={()=>{if(!busy)close();}}
    closable={!busy} maskClosable={!busy} closeOnEsc={!busy}
    footer={<Button theme="solid" htmlType="submit" form={formId} loading={busy}
      disabled={ordering?!accepted:!message.trim()}>{busy?'提交中…':ordering?'确认订购':'发送'}</Button>}>
      <form id={formId} className="market-action-form" onSubmit={submit}>
        <p>{service.name} · {service.provider} · <code>{service.callId}</code></p>
        {ordering ? <Checkbox checked={accepted} disabled={busy} onChange={event=>setAccepted(event.target.checked)}>确认按此渠道公布的单价按量计费</Checkbox> :
          <label className="market-call-field" htmlFor={formId+'-message'}>消息
            <TextArea id={formId+'-message'} maxLength={2000} rows={4} value={message} disabled={busy} onChange={setMessage}/>
          </label>}
        {error && <Banner type="danger" description={error} />}
        {result && <div role="status"><p>{result.choices[0].message.content}</p><small>模拟调用 · 请求 ID {result.id}</small></div>}
      </form>
  </Modal>;
}
