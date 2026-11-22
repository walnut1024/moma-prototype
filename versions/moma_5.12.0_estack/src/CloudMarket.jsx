import { resourceId } from './resource-id.mjs';
import { useEffect, useId, useRef, useState } from 'react';
import { Banner, Button, Checkbox, Select, TextArea } from '@douyinfe/semi-ui';
import { AdminModal } from './admin-v2/AdminOverlay';
import { cloudMarketPresentation } from './service-directory.mjs';

const changed='moma5120-market-change';
const emptyCatalogue = { cards: [], services: [], orders: [] };

async function marketRequest(path, body, signal) {
  const response=await fetch('/api/5120/market/'+path,{credentials:'same-origin',signal,
    ...(body?{method:'POST',headers:{'Content-Type':'application/json','X-MoMA-Request':'1'},body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>{ throw Error('模型广场暂不可用，请稍后重试。'); });
  if (!response.ok) throw Error(data.error?.message || '模型广场暂不可用');
  return data;
}

export function refreshCloudMarket() {
  window.dispatchEvent(new Event(changed));
}

export function useCloudMarket(enabled=true) {
  const [view,setView]=useState({tenant:null,...emptyCatalogue,loading:true,error:''});
  const [revision,setRevision]=useState(0);
  const [project,setProject]=useState('');
  useEffect(()=>{
    if (!enabled) return;
    const controller=new AbortController();
    const query = project ? '?' + new URLSearchParams({ project }) : '';
    marketRequest('catalogue' + query,null,controller.signal).then(data=>{
      if (!controller.signal.aborted) setView({...data,cards:data.cards.map(cloudMarketPresentation),services:data.services.map(cloudMarketPresentation),loading:false,error:''});
    }).catch(error=>{
      if (!controller.signal.aborted) setView(previous => ({ ...previous, ...emptyCatalogue, loading:false, error:error.message }));
    });
    return ()=>controller.abort();
  },[enabled,revision,project]);
  useEffect(()=>{
    if (!enabled) return;
    const refresh=()=>setRevision(current=>current+1);
    window.addEventListener(changed,refresh);
    window.addEventListener('focus',refresh);
    return ()=>{window.removeEventListener(changed,refresh);window.removeEventListener('focus',refresh);};
  },[enabled]);
  const write=async(path,body)=>{
    const result=await marketRequest(path,body);
    if (path==='logout') { setProject(''); setView({tenant:null,...emptyCatalogue,loading:true,error:''}); }
    refreshCloudMarket();
    return result;
  };
  const selectProject = next => {
    if (next === project) return;
    setView(previous => ({ ...previous, cards: [], services: [], loading:true, error:'' }));
    setProject(next);
  };
  return {...view,project,selectProject,refresh:()=>setRevision(current=>current+1),
    logout:()=>write('logout',{}),order:offerIds=>write('orders',{offerIds})};
}

export function MarketSessionControl({ market, onLogin }) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <div className="market-session">
    {market.tenant ? <>
      <span>{market.tenant.name}</span>
      {market.projects?.length > 0 && <Select aria-label="当前项目" value={market.project} onChange={market.selectProject}
        optionList={[{value:'',label:'未选择项目'}, ...market.projects.map(row => ({value:row.id,label:row.name}))]} />}
      <Button theme="outline" disabled={busy} onClick={async()=>{
        setBusy(true);setError('');
        try {await market.logout();} catch (issue) {setError(issue.message);} finally {setBusy(false);}
      }}>退出广场</Button>{error && <span role="alert">{error}</span>}
    </> : <Button theme="outline" onClick={onLogin}>登录模型广场</Button>}
  </div>;
}

export function MarketAction({ action, market, close }) {
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
      if (ordering) {await market.order([service.id]);close();return;}
      if (pending.current?.text!==message) pending.current={text:message,id:resourceId('request')};
      const reply=await marketRequest('completions',{requestId:pending.current.id,model:service.callId,messages:[{role:'user',content:message}]});
      pending.current=null;
      setResult(reply);
    } catch (issue) {setError(issue.message);}
    finally {setBusy(false);}
  }
  return <AdminModal visible title={ordering?'确认订购':'在线调用'} onCancel={()=>{if(!busy)close();}}
    closable={!busy} maskClosable={!busy} closeOnEsc={!busy}
    footer={<><Button disabled={busy} onClick={close}>取消</Button><Button theme="solid" htmlType="submit" form={formId} loading={busy}
      disabled={ordering?!accepted:!message.trim()}>{busy?'提交中…':ordering?'确认订购':'发送'}</Button></>}>
      <form id={formId} className="market-action-form" onSubmit={submit}>
        <p>{service.name} · {service.offerName} · <code>{service.callId}</code></p>
        {ordering ? <Checkbox checked={accepted} disabled={busy} onChange={event=>setAccepted(event.target.checked)}>确认按此渠道公布的单价按量计费</Checkbox> :
          <label className="market-call-field" htmlFor={formId+'-message'}>消息
            <TextArea id={formId+'-message'} maxLength={2000} rows={4} value={message} disabled={busy} onChange={setMessage}/>
          </label>}
        {error && <Banner type="danger" description={error} />}
        {result && <div role="status"><p>{result.choices[0].message.content}</p><small>模拟调用 · 请求 ID {result.id}</small></div>}
      </form>
  </AdminModal>;
}
