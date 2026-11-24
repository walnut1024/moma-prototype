import AdminPageLoading from './AdminPageLoading';
import {useEffect,useRef,useState} from 'react';
import {Banner, Button, Toast} from '@douyinfe/semi-ui';
import { cloudAdminRequest as api } from './admin-client.mjs';
import './cloud-model-login.css';

let currentCloudState,acceptCloudState;
export const loadAdminState=()=>currentCloudState || {models:[]};
async function saveCloudState(previous,action){const operationId=crypto.randomUUID();const result=await api('/model-operations/commands',{method:'POST',operationId,body:{operationId,expectedRevision:previous.revision,action}});const next=applyResult(previous,result);acceptCloudState?.(next);return next;}
export async function prepareModelServiceShowcase(){if(!currentCloudState)throw Error('请先进入模型运营并登录');if(currentCloudState.modelData?.datasetId || currentCloudState.models.some(m=>m.serviceShowcase))return false;await saveCloudState(currentCloudState,{type:'modelOperations',operation:'prepareServiceShowcase',data:{confirmed:true}});return true;}
export async function completeModelServiceShowcase(onProgress) {
  const { completeServiceShowcase } = await import('./service-showcase-client.js');
  if (!currentCloudState) throw Error('请先进入模型运营并登录');
  return completeServiceShowcase(currentCloudState, saveCloudState, { onProgress });
}

function applyResult(state,result){
  if(result.revision<state.revision)return state;
  const next={...state,revision:result.revision,updatedAt:result.updatedAt || state.updatedAt,modelData:result.modelData || state.modelData,supplyRelations:result.supplyRelations || state.supplyRelations,cloudMockState:result.mockState || state.cloudMockState};
  for(const [key,patch]of Object.entries(result.patches || {})){
    const rows=new Map((state[key] || []).map(r=>[r.id,r]));for(const id of patch.remove)rows.delete(id);for(const row of patch.upsert)rows.set(row.id,row);
    next[key]=[...patch.upsert,...[...rows.values()].filter(row=>!patch.upsert.some(r=>r.id===row.id))];
  }
  return next;
}

export default function CloudModelOperations({children, packageWorkspace=false, applicationWorkspace=false}){
  const [state,setState]=useState(null),[error,setError]=useState(''),[conflict,setConflict]=useState(false);
  const current=useRef(null),queue=useRef(Promise.resolve()),alive=useRef(true);
  const simulation = useRef(null);
  const modelWorkspace = !packageWorkspace && !applicationWorkspace;
  const workspacePath=applicationWorkspace?'/application':packageWorkspace?'/package-management':'/model-operations';
  const workspaceLabel=applicationWorkspace?'平台后台':packageWorkspace?'套餐运营':'模型运营';
  const accept=next=>{
    if(!alive.current)return;
    current.current=next;
    if(modelWorkspace){currentCloudState=next;simulation.current.useCloudMockSnapshot(next,next.cloudMockState);}
    setState(next);
  };
  const load = async () => {
    try {
      const [next, runtime] = await Promise.all([
        applicationWorkspace ? api('/application/open', { method:'POST', body:{} }) : api(workspacePath),
        modelWorkspace ? import('./model-workspace-simulation.js') : null,
      ]);
      if (!alive.current) return;
      if (runtime && !simulation.current) {
        simulation.current = runtime;
        runtime.startModelWorkspaceSimulation(api, current);
      }
      accept(next);
      setConflict(false);
      setError('');
    } catch (issue) {
      if (alive.current) setError(issue.message);
    }
  };
  const refreshRead = async signal => {
    const previous = current.current;
    const next = await api(workspacePath, { signal });
    if (signal?.aborted || !alive.current || previous !== current.current) return;
    accept(next);
    setConflict(false);
    setError('');
  };
  useEffect(()=>{
    alive.current=true;
    if (modelWorkspace) acceptCloudState=accept;
    void load();
    const focus=async()=>{if(!current.current)return;try{const next=await api(workspacePath);if(next.revision!==current.current.revision || next.modelRevision!==current.current.modelRevision)setConflict(true);else if(applicationWorkspace)accept(next);}catch(issue){setError(issue.message);}};
    addEventListener('focus',focus);
    return()=>{
      alive.current=false;
      removeEventListener('focus',focus);
      if(modelWorkspace){currentCloudState=undefined;acceptCloudState=undefined;simulation.current?.stopModelWorkspaceSimulation();simulation.current=null;}
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
        else{if(issue.status===409)setConflict(true);throw issue;}
      }
      let next;
      try { next=applicationWorkspace?await api(workspacePath):applyResult(current.current,result); }
      catch (issue) { throw new Error('操作已保存，请重新载入核对', {cause:issue}); }
      accept(next);return next;
    };
    const result=queue.current.then(execute);queue.current=result.catch(()=>{});return result;
  };
  const dispatch=async action=>{
    if(!applicationWorkspace)throw Error('此操作不属于当前工作区');
    try {
      const next=await transact(action);
      if(action.feedback!==false)Toast.success(typeof action.feedback==='string'?action.feedback:'操作已保存');
      return next;
    } catch (issue) {Toast.error(issue.message);return null;}
  };
  if(!state)return <div className="mo-cloud-login">{error
    ? <Banner type="danger" closeIcon={null} description={<>{error} <Button onClick={()=>void load()}>重新加载</Button></>}/>
    : <AdminPageLoading label={workspaceLabel}/>}</div>;
  return children({state,transactModel:transact,transact,dispatch,transactIndividual:transact,transactAdminAccount:transact,reload:load,refreshRead,conflict});
}
