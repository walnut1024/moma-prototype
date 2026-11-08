import { useEffect, useRef, useState } from 'react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog';
import { cloudMarketPresentation } from './service-directory.mjs';

const changed='moma5120-market-change';

async function marketRequest(path, body, signal) {
  const response=await fetch('/api/5120/market/'+path,{credentials:'same-origin',signal,
    ...(body?{method:'POST',headers:{'Content-Type':'application/json','X-MoMA-Request':'1'},body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if (!response.ok) throw Error(data.error?.message || '模型广场暂不可用');
  return data;
}

export function useCloudMarket(enabled=true) {
  const [view,setView]=useState({tenant:null,services:[],orders:[],loading:true,error:''});
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    if (!enabled) return;
    const controller=new AbortController();
    marketRequest('catalogue',null,controller.signal).then(data=>{
      if (!controller.signal.aborted) setView({...data,services:data.services.map(cloudMarketPresentation),loading:false,error:''});
    }).catch(error=>{
      if (!controller.signal.aborted) setView({tenant:null,services:[],orders:[],loading:false,error:error.message});
    });
    return ()=>controller.abort();
  },[enabled,revision]);
  useEffect(()=>{
    if (!enabled) return;
    const refresh=()=>setRevision(current=>current+1);
    window.addEventListener(changed,refresh);
    window.addEventListener('focus',refresh);
    return ()=>{window.removeEventListener(changed,refresh);window.removeEventListener('focus',refresh);};
  },[enabled]);
  const write=async(path,body)=>{
    const result=await marketRequest(path,body);
    if (path==='login' || path==='logout') setView({tenant:result.tenant || null,services:[],orders:[],loading:true,error:''});
    window.dispatchEvent(new Event(changed));
    return result;
  };
  return {...view,refresh:()=>setRevision(current=>current+1),login:(tenantId,accessCode)=>write('login',{tenantId,accessCode}),
    logout:()=>write('logout',{}),order:offerIds=>write('orders',{offerIds})};
}

export function MarketSessionControl({ market }) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function login(event) {
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    setBusy(true);setError('');
    try {await market.login(fields.get('tenantId').trim(),fields.get('accessCode'));setOpen(false);}
    catch (issue) {setError(issue.message);}
    finally {setBusy(false);}
  }
  return <div className="market-session">
    {market.tenant ? <>
      <span>{market.tenant.name}</span><Button variant="outline" disabled={busy} onClick={async()=>{
        setBusy(true);setError('');
        try {await market.logout();} catch (issue) {setError(issue.message);} finally {setBusy(false);}
      }}>退出广场</Button>{error && <span role="alert">{error}</span>}
    </> : <Button variant="outline" onClick={()=>{setError('');setOpen(true);}}>登录模型广场</Button>}
    <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}>
      <DialogContent>
        <DialogHeader><DialogTitle>登录模型广场</DialogTitle><DialogDescription>使用已开通的客户编号和密码。</DialogDescription></DialogHeader>
        <form onSubmit={login} className="market-action-form">
          <label>客户编号<Input name="tenantId" autoComplete="username" required maxLength={200}/></label>
          <label>密码<Input name="accessCode" type="password" autoComplete="current-password" required maxLength={128}/></label>
          {error && <p role="alert">{error}</p>}
          <DialogFooter><Button type="submit" disabled={busy}>{busy?'登录中…':'登录'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}

export function MarketAction({ action, market, close }) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);
  const [message,setMessage]=useState(''),[accepted,setAccepted]=useState(false);
  const pending=useRef(null);
  const { service, kind }=action, ordering=kind==='order';
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);setError('');setResult(null);
    try {
      if (ordering) {await market.order([service.id]);close();return;}
      if (pending.current?.text!==message) pending.current={text:message,id:crypto.randomUUID()};
      const reply=await marketRequest('completions',{requestId:pending.current.id,model:service.callId,messages:[{role:'user',content:message}]});
      pending.current=null;
      setResult(reply);
    } catch (issue) {setError(issue.message);}
    finally {setBusy(false);}
  }
  return <Dialog open onOpenChange={value=>{if(!value && !busy)close();}}>
    <DialogContent>
      <DialogHeader><DialogTitle>{ordering?'确认订购':'在线调用'}</DialogTitle><DialogDescription>{service.name} · {service.provider} · {service.callId}</DialogDescription></DialogHeader>
      <form className="market-action-form" onSubmit={submit}>
        {ordering ? <label className="market-agreement"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/>确认按此渠道公布的单价按量计费</label> :
          <label>消息<textarea className="market-call-input" required maxLength={2000} rows={4} value={message} disabled={busy} onChange={event=>setMessage(event.target.value)}/></label>}
        {error && <p role="alert">{error}</p>}
        {result && <div role="status"><p>{result.choices[0].message.content}</p><small>模拟调用 · 请求 ID {result.id}</small></div>}
        <DialogFooter><Button type="submit" disabled={busy || (ordering?!accepted:!message.trim())}>{busy?'提交中…':ordering?'确认订购':'发送'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
