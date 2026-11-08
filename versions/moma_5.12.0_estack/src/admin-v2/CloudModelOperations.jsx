import { API_PREFIX } from '../../api-path.js';
import AdminPageLoading from './AdminPageLoading';
import {useEffect,useRef,useState} from 'react';
import {Banner, Button, Card, Form, Input, Toast, Typography} from '@douyinfe/semi-ui';
import {configureOnboardingTransport} from './onboarding-client.js';
import {useCloudMockSnapshot,clearCloudMockSnapshot} from './mock-onboarding-service.js';
import {completeServiceShowcase} from './service-showcase-client.js';
import './cloud-model-login.css';
import {domainModelWorkspace} from '../mock/model-fields.js';

let currentCloudState,acceptCloudState;
export const loadAdminState=()=>currentCloudState || {models:[]};
async function saveCloudState(previous,action){const operationId=crypto.randomUUID();const result=await api('/model-operations/commands',{method:'POST',operationId,body:{operationId,expectedRevision:previous.revision,action}});const next=applyResult(previous,result);acceptCloudState?.(next);return next;}
export async function prepareModelServiceShowcase(){if(!currentCloudState)throw Error('请先进入模型运营并登录');if(currentCloudState.modelData?.datasetId || currentCloudState.models.some(m=>m.serviceShowcase))return false;await saveCloudState(currentCloudState,{type:'modelOperations',operation:'prepareServiceShowcase',data:{confirmed:true}});return true;}
export async function completeModelServiceShowcase(onProgress){if(!currentCloudState)throw Error('请先进入模型运营并登录');return completeServiceShowcase(currentCloudState,saveCloudState,{onProgress});}

async function api(path,{method='GET',body,operationId,signal}={}){
  const response=await fetch(API_PREFIX+path,{method,credentials:'same-origin',signal,headers:{...(method==='GET'?{}:{'content-type':'application/json','x-moma-request':'1'}),...(operationId?{'Idempotency-Key':operationId}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();
  if(!response.ok || data.error)throw Object.assign(new Error(data.error?.message || '请求失败'),{code:data.error?.code,status:response.status});
  return path==='/model-operations'?domainModelWorkspace(data):data;
}
export { api as cloudAdminRequest };
export const loadPackageFactorHistory = (modelId, signal) =>
  api('/package-management/factor-history?' + new URLSearchParams({ model: modelId }), { signal });
function applyResult(state,result){
  if(result.revision<state.revision)return state;
  const next={...state,revision:result.revision,updatedAt:result.updatedAt || state.updatedAt,modelData:result.modelData || state.modelData,cloudMockState:result.mockState || state.cloudMockState};
  for(const [key,patch]of Object.entries(result.patches || {})){
    const rows=new Map((state[key] || []).map(r=>[r.id,r]));for(const id of patch.remove)rows.delete(id);for(const row of patch.upsert)rows.set(row.id,row);
    next[key]=[...patch.upsert,...[...rows.values()].filter(row=>!patch.upsert.some(r=>r.id===row.id))];
  }
  return next;
}

export default function CloudModelOperations({children, packageWorkspace=false, applicationWorkspace=false}){
  const [state,setState]=useState(null),[error,setError]=useState(''),[conflict,setConflict]=useState(false),[login,setLogin]=useState(null),[code,setCode]=useState(''),[busy,setBusy]=useState(false);
  const current=useRef(null),queue=useRef(Promise.resolve()),alive=useRef(true);
  const modelWorkspace = !packageWorkspace && !applicationWorkspace;
  const workspacePath=applicationWorkspace?'/application':packageWorkspace?'/package-management':'/model-operations';
  const workspaceLabel=applicationWorkspace?'平台后台':packageWorkspace?'套餐运营':'模型运营';
  const accept=next=>{
    if(!alive.current)return;
    current.current=next;
    if(modelWorkspace){currentCloudState=next;useCloudMockSnapshot(next,next.cloudMockState);}
    setState(next);
  };
  const load=async()=>{try{const next=await (applicationWorkspace?api('/application/open',{method:'POST',body:{}}):api(workspacePath));accept(next);setConflict(false);setError('');setLogin(null);}catch(issue){if(issue.status===401 || issue.status===403)setLogin({accountId:'yyg'});setError(issue.message);}};
  useEffect(()=>{
    alive.current=true;
    if(modelWorkspace) acceptCloudState=accept;
    if(modelWorkspace) configureOnboardingTransport(async(path,options={})=>{
      const method=options.method || 'GET',operationId=method==='GET'?undefined:options.body?.operationId || crypto.randomUUID();
      const response=await api('/simulation'+path,{method,body:method==='GET'?undefined:{...options.body,operationId},operationId,signal:options.signal});
      if(current.current && response.mockState){current.current.cloudMockState=response.mockState;useCloudMockSnapshot(current.current,response.mockState);}
      return response.result;
    });
    void load();
    const focus=async()=>{if(!current.current)return;try{const next=await api(workspacePath);if(next.revision!==current.current.revision || next.modelRevision!==current.current.modelRevision)setConflict(true);else if(applicationWorkspace)accept(next);}catch(issue){setError(issue.message);}};
    addEventListener('focus',focus);
    return()=>{
      alive.current=false;
      removeEventListener('focus',focus);
      if(modelWorkspace){currentCloudState=undefined;acceptCloudState=undefined;configureOnboardingTransport(null);clearCloudMockSnapshot();}
    };
  },[]);
  const transact=(action, expectedRevision)=>{
    const revision=expectedRevision ?? current.current.revision;
    const execute=async()=>{
      const id=crypto.randomUUID(),body={operationId:id,expectedRevision:revision,action};
      let result;
      try{result=await api(workspacePath+'/commands',{method:'POST',body,operationId:id});}
      catch(issue){
        if(!issue.status || issue.status>=500){try{result=await api('/operations/'+id);}catch{throw new Error('提交结果待确认，请保留当前输入并重载核对；操作 ID：'+id);}}
        else{if(issue.status===409)setConflict(true);if(issue.status===401 && !packageWorkspace)setLogin({accountId:current.current.adminSession.accountId});throw issue;}
      }
      let next;
      try { next=applicationWorkspace?await api(workspacePath):applyResult(current.current,result); }
      catch (issue) { throw new Error('操作已保存，请重新载入核对', {cause:issue}); }
      accept(next);return next;
    };
    const result=queue.current.then(execute);queue.current=result.catch(()=>{});return result;
  };
  const dispatch=async action=>{
    if(action.type==='enterAdmin'){setCode('');setError('');setLogin({accountId:action.accountId});return null;}
    if(!applicationWorkspace)throw Error('此操作不属于当前工作区');
    try {
      const next=await transact(action);
      if(action.feedback!==false)Toast.success(typeof action.feedback==='string'?action.feedback:'操作已保存');
      return next;
    } catch (issue) {Toast.error(issue.message);return null;}
  };
  const submit=async event=>{event.preventDefault();if(busy || !login?.accountId || !code)return;setBusy(true);setError('');try{await api('/auth/login',{method:'POST',body:{accountId:login.accountId,accessCode:code}});setCode('');await load();}catch(issue){setError(issue.message);}finally{setBusy(false);}};
  if(login)return <div className="mo-cloud-login">
    <Card className="mo-cloud-login-card">
      <Typography.Title heading={3} id="mo-cloud-login-title">{workspaceLabel}登录</Typography.Title>
      <form onSubmit={submit} aria-labelledby="mo-cloud-login-title">
        <Form.Slot label={{ text: '后台账号', name: 'mo-cloud-account' }}>
          <Input id="mo-cloud-account" autoComplete="username" value={login.accountId} onChange={accountId=>setLogin({accountId})}/>
        </Form.Slot>
        <Form.Slot label={{ text: '后台密码', name: 'mo-cloud-password' }}>
          <Input id="mo-cloud-password" mode="password" autoComplete="current-password" value={code} onChange={setCode}/>
        </Form.Slot>
        <Button block theme="solid" htmlType="submit" loading={busy} disabled={!login.accountId || !code}>登录</Button>
      </form>
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
    </Card>
  </div>;
  if(!state)return <div className="mo-cloud-login">{error
    ? <Banner type="danger" closeIcon={null} description={<>{error} <Button onClick={()=>void load()}>重新加载</Button></>}/>
    : <AdminPageLoading label={workspaceLabel}/>}</div>;
  return children({state,transactModel:transact,transact,dispatch,transactIndividual:transact,transactAdminAccount:transact,reload:load,conflict});
}
