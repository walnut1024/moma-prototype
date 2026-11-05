import {useEffect,useRef,useState} from 'react';
import {Button} from '../components/ui/button';
import {Input} from '../components/ui/input';
import {configureOnboardingTransport} from './onboarding-client.js';
import {useCloudMockSnapshot,clearCloudMockSnapshot} from './mock-onboarding-service.js';
import {AdminUIContext} from '../components/admin-ui-context';
import {completeServiceShowcase} from './service-showcase-client.js';
import './cloud-model-login.css';
import {domainModelWorkspace} from '../mock/model-fields.js';

let currentCloudState,acceptCloudState;
export const loadAdminState=()=>currentCloudState || {models:[]};
async function saveCloudState(previous,action){const operationId=crypto.randomUUID();const result=await api('/model-operations/commands',{method:'POST',operationId,body:{operationId,expectedRevision:previous.revision,action}});const next=applyResult(previous,result);acceptCloudState?.(next);return next;}
export async function prepareModelServiceShowcase(){if(!currentCloudState)throw Error('请先进入模型运营并登录');if(currentCloudState.models.some(m=>m.serviceShowcase))return false;await saveCloudState(currentCloudState,{type:'modelOperations',operation:'prepareServiceShowcase',data:{confirmed:true}});return true;}
export async function completeModelServiceShowcase(onProgress){if(!currentCloudState)throw Error('请先进入模型运营并登录');return completeServiceShowcase(currentCloudState,saveCloudState,{onProgress});}

async function api(path,{method='GET',body,operationId,signal}={}){
  const response=await fetch('/api/5120'+path,{method,credentials:'same-origin',signal,headers:{...(method==='GET'?{}:{'content-type':'application/json','x-moma-request':'1'}),...(operationId?{'Idempotency-Key':operationId}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();
  if(!response.ok || data.error)throw Object.assign(new Error(data.error?.message || '请求失败'),{code:data.error?.code,status:response.status});
  return path==='/model-operations'?domainModelWorkspace(data):data;
}
function applyResult(state,result){
  if(result.revision<state.revision)return state;
  const next={...state,revision:result.revision,updatedAt:result.updatedAt || state.updatedAt,modelData:result.modelData || state.modelData,cloudMockState:result.mockState || state.cloudMockState};
  for(const [key,patch]of Object.entries(result.patches || {})){
    const rows=new Map((state[key] || []).map(r=>[r.id,r]));for(const id of patch.remove)rows.delete(id);for(const row of patch.upsert)rows.set(row.id,row);
    next[key]=[...patch.upsert,...[...rows.values()].filter(row=>!patch.upsert.some(r=>r.id===row.id))];
  }
  return next;
}

export default function CloudModelOperations({children}){
  const [state,setState]=useState(null),[error,setError]=useState(''),[conflict,setConflict]=useState(false),[login,setLogin]=useState(null),[code,setCode]=useState(''),[busy,setBusy]=useState(false);
  const current=useRef(null),queue=useRef(Promise.resolve()),alive=useRef(true);
  const accept=next=>{if(!alive.current)return;current.current=next;currentCloudState=next;useCloudMockSnapshot(next,next.cloudMockState);setState(next);};
  const load=async()=>{try{const next=await api('/model-operations');accept(next);setConflict(false);setError('');setLogin(null);}catch(issue){if(issue.status===401 || issue.status===403)setLogin({accountId:'admin-001'});setError(issue.message);}};
  useEffect(()=>{
    alive.current=true;
    acceptCloudState=accept;
    configureOnboardingTransport(async(path,options={})=>{
      const method=options.method || 'GET',operationId=method==='GET'?undefined:options.body?.operationId || crypto.randomUUID();
      const response=await api('/simulation'+path,{method,body:method==='GET'?undefined:{...options.body,operationId},operationId,signal:options.signal});
      if(current.current){current.current.cloudMockState=response.mockState;useCloudMockSnapshot(current.current,response.mockState);}
      return response.result;
    });
    void load();
    const focus=async()=>{if(!current.current)return;try{const next=await api('/model-operations');if(next.revision!==current.current.revision)setConflict(true);}catch(issue){setError(issue.message);}};
    addEventListener('focus',focus);
    return()=>{alive.current=false;currentCloudState=undefined;acceptCloudState=undefined;removeEventListener('focus',focus);configureOnboardingTransport(null);clearCloudMockSnapshot();};
  },[]);
  const transact=action=>{
    const execute=async()=>{
      const id=crypto.randomUUID(),body={operationId:id,expectedRevision:current.current.revision,action};
      let result;
      try{result=await api('/model-operations/commands',{method:'POST',body,operationId:id});}
      catch(issue){
        if(!issue.status || issue.status>=500){try{result=await api('/operations/'+id);}catch{throw new Error('提交结果待确认，请保留当前输入并重载核对；操作 ID：'+id);}}
        else{if(issue.status===409)setConflict(true);if(issue.status===401)setLogin({accountId:current.current.adminSession.accountId});throw issue;}
      }
      const next=applyResult(current.current,result);accept(next);return next;
    };
    const result=queue.current.then(execute);queue.current=result.catch(()=>{});return result;
  };
  const dispatch=action=>{if(action.type==='enterAdmin'){setCode('');setError('');setLogin({accountId:action.accountId});return;}throw Error('此操作不属于模型运营');};
  const submit=async event=>{event.preventDefault();setBusy(true);setError('');try{await api('/auth/login',{method:'POST',body:{accountId:login.accountId,accessCode:code}});setCode('');await load();}catch(issue){setError(issue.message);}finally{setBusy(false);}};
  const form=<AdminUIContext.Provider value={true}>
    <div className="mo-cloud-login">
      <section className="mo-cloud-login-card" aria-labelledby="mo-cloud-login-title">
        <h1 id="mo-cloud-login-title">模型运营登录</h1>
        <form onSubmit={submit}>
          <label>后台账号<Input aria-label="后台账号" autoComplete="username" value={login?.accountId || 'admin-001'} onChange={e=>setLogin({accountId:e.target.value})}/></label>
          <label>后台密码<Input aria-label="后台密码" type="password" autoComplete="current-password" value={code} onChange={e=>setCode(e.target.value)}/></label>
          <Button disabled={busy || !code} type="submit">{busy?'正在登录…':'登录'}</Button>
        </form>
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  </AdminUIContext.Provider>;
  if(login)return form;
  if(!state)return <AdminUIContext.Provider value={true}><div className="admin-v2"><section className="mo-workbench"><p role={error?'alert':'status'}>{error || '正在加载模型运营…'}</p>{error && <Button onClick={()=>void load()}>重新加载</Button>}</section></div></AdminUIContext.Provider>;
  return children({state,transactModel:transact,transact,dispatch,transactIndividual:()=>{throw Error('此入口不处理客户数据');},transactAdminAccount:()=>{throw Error('此入口不处理后台账号配置');},reload:load,conflict});
}
