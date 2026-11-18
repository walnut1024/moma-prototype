import AdminPageLoading from './AdminPageLoading';
import {useEffect,useRef,useState} from 'react';
import {Banner, Button} from '@douyinfe/semi-ui';
import { cloudAdminRequest as api } from './admin-client.mjs';
import {configureOnboardingTransport} from './onboarding-client.js';
import {useCloudMockSnapshot,clearCloudMockSnapshot} from './mock-onboarding-service.js';
import './cloud-model-login.css';
function applyResult(state,result){
  if(result.revision<state.revision)return state;
  const next={...state,revision:result.revision,updatedAt:result.updatedAt || state.updatedAt,modelData:result.modelData || state.modelData,supplyRelations:result.supplyRelations || state.supplyRelations,cloudMockState:result.mockState || state.cloudMockState};
  for(const [key,patch]of Object.entries(result.patches || {})){
    const rows=new Map((state[key] || []).map(r=>[r.id,r]));for(const id of patch.remove)rows.delete(id);for(const row of patch.upsert)rows.set(row.id,row);
    next[key]=[...patch.upsert,...[...rows.values()].filter(row=>!patch.upsert.some(r=>r.id===row.id))];
  }
  return next;
}

export default function CloudModelOperations({children, packageWorkspace=false}){
  const [state,setState]=useState(null),[error,setError]=useState(''),[conflict,setConflict]=useState(false);
  const current=useRef(null),queue=useRef(Promise.resolve()),alive=useRef(true);
  const workspacePath=packageWorkspace?'/package-management':'/model-operations';
  const workspaceLabel=packageWorkspace?'套餐运营':'模型运营';
  const accept=next=>{
    if(!alive.current)return;
    current.current=next;
    if(!packageWorkspace)useCloudMockSnapshot(next,next.cloudMockState);
    setState(next);
  };
  const load=async()=>{try{const next=await api(workspacePath);accept(next);setConflict(false);setError('');}catch(issue){setError(issue.message);}};
  useEffect(()=>{
    alive.current=true;
    if(!packageWorkspace) configureOnboardingTransport(async(path,options={})=>{
      const method=options.method || 'GET',operationId=method==='GET'?undefined:options.body?.operationId || crypto.randomUUID();
      const response=await api('/simulation'+path,{method,body:method==='GET'?undefined:{...options.body,operationId},operationId,signal:options.signal});
      if(current.current){current.current.cloudMockState=response.mockState;useCloudMockSnapshot(current.current,response.mockState);}
      return response.result;
    });
    void load();
    const focus=async()=>{if(!current.current)return;try{const next=await api(workspacePath);if(next.revision!==current.current.revision || (packageWorkspace && next.modelRevision!==current.current.modelRevision))setConflict(true);}catch(issue){setError(issue.message);}};
    addEventListener('focus',focus);
    return()=>{
      alive.current=false;
      removeEventListener('focus',focus);
      if(!packageWorkspace){configureOnboardingTransport(null);clearCloudMockSnapshot();}
    };
  },[]);
  const transact=action=>{
    const execute=async()=>{
      const id=crypto.randomUUID(),body={operationId:id,expectedRevision:current.current.revision,action};
      let result;
      try{result=await api(workspacePath+'/commands',{method:'POST',body,operationId:id});}
      catch(issue){
        if(!issue.status || issue.status>=500){try{result=await api('/operations/'+id);}catch{throw new Error('提交结果待确认，请保留当前输入并重载核对；操作 ID：'+id);}}
        else{if(issue.status===409)setConflict(true);throw issue;}
      }
      const next=applyResult(current.current,result);accept(next);return next;
    };
    const result=queue.current.then(execute);queue.current=result.catch(()=>{});return result;
  };
  const dispatch=()=>{throw Error('此操作不属于模型运营');};
  if(!state)return <div className="mo-cloud-login">{error
    ? <Banner type="danger" closeIcon={null} description={<>{error} <Button onClick={()=>void load()}>重新加载</Button></>}/>
    : <AdminPageLoading label={workspaceLabel}/>}</div>;
  return children({state,transactModel:transact,transact,dispatch,transactIndividual:()=>{throw Error('此入口不处理客户数据');},transactAdminAccount:()=>{throw Error('此入口不处理后台账号配置');},reload:load,conflict});
}
