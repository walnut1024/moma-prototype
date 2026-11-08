import { IconTickCircle, IconAlertCircle } from '@douyinfe/semi-icons';
import { useState } from 'react';
import { Button } from '@douyinfe/semi-ui';
import { Modal, Notice } from './ServiceUI';
import { PlatformTrialDialog } from './ServicePlatformTrial';
import { publicationChecks } from './model-management';
import { serviceConfigurationTarget } from './service-workspace';

export default function ServicePublicationDialog({ state, model, ops, close, chooseMode }) {
  const [trial, setTrial] = useState(null), [busy, setBusy] = useState(false);
  const checks = publicationChecks(state,model,{technical:true}), ready = checks.every(row=>row.passed);
  const basicReady = checks.filter(row=>row.tab!=='platform').every(row=>row.passed);
  if (trial) return <PlatformTrialDialog key={trial.providerId || 'standard'} state={state} model={model} ops={ops} providerId={trial.providerId} close={()=>setTrial(null)} onPublished={()=>setTrial(null)}/>;
  return <Modal wide title={`启用 ${model.name}`} description="核对当前技术配置与管理端验证结果。" onClose={()=>{if(!busy)close();}} footer={<><Button theme="light" disabled={busy} onClick={close}>取消</Button><Button theme="light" disabled={busy} onClick={ops.reload}>重新检查</Button><Button disabled={!ops.can || !ready || busy} onClick={async()=>{setBusy(true);try{if(await ops.run('enableService',{expectedUpdatedAt:model.updatedAt},model.id,true))close();}finally{setBusy(false);}}}>{busy?'正在提交…':'确认启用'}</Button></>}>
    <ul className="ss-checks">{checks.map(check=><li key={check.label}>{check.passed?<IconTickCircle aria-hidden="true"/>:<IconAlertCircle aria-hidden="true"/>}<span>{check.tab==='platform'?(check.passed?'当前服务验证有效':'当前服务待验证'):check.label}</span>{!check.passed && (check.tab==='platform'?<Button theme="borderless" disabled={!ops.can || !basicReady} onClick={()=>setTrial({providerId:check.providerId})}>验证当前服务</Button>:<Button theme="borderless" disabled={busy} onClick={()=>{if(check.tab==='serviceMode'){chooseMode();return;}close();const {page,...target}=serviceConfigurationTarget(model,check);ops.go({...target,returnTo:location.hash},{base:page,reset:true});}}>前往配置</Button>)}</li>)}</ul>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
