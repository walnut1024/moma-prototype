import { useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Modal, Notice } from './ModelOperationsUI';
import { PlatformTrialDialog } from './ServicePlatformTrial';
import { publicationChecks } from './model-management';
import { serviceConfigurationTarget } from './service-workspace';

export default function ServicePublicationDialog({ state, model, ops, close, chooseMode, technical = false }) {
  const [trial, setTrial] = useState(null), [busy, setBusy] = useState(false);
  const checks = publicationChecks(state,model,{technical}), ready = checks.every(row=>row.passed);
  const basicReady = checks.filter(row=>row.tab!=='platform').every(row=>row.passed);
  if (trial) return <PlatformTrialDialog key={trial.providerId || 'standard'} review state={state} model={model} ops={ops} providerId={trial.providerId} close={()=>setTrial(null)} onPublished={()=>setTrial(null)}/>;
  return <Modal wide title={`${technical?'启用':'上架'} ${model.name}`} description={technical?'核对当前技术配置、客户开放范围与管理端验证结果。':'核对当前技术服务、售价与销售配置。'} onClose={()=>{if(!busy)close();}} footer={<><Button variant="outline" disabled={busy} onClick={close}>取消</Button><Button variant="outline" disabled={busy} onClick={ops.reload}>重新检查</Button><Button disabled={!ops.can || !ready || busy} onClick={async()=>{setBusy(true);try{if(await ops.run(technical?'enableService':'publish',technical?{expectedUpdatedAt:model.updatedAt}:{},model.id,true))close();}finally{setBusy(false);}}}>{busy?'正在提交…':technical?'确认启用':'确认上架'}</Button></>}>
    <ul className="mo-checks">{checks.map(check=><li key={check.label}>{check.passed?<CheckCircle2/>:<AlertCircle/>}<span>{check.tab==='platform'?(check.passed?'当前服务验证有效':'当前服务待验证'):check.label}</span>{!check.passed && (check.tab==='platform'?<Button variant="link" disabled={!ops.can || !basicReady} onClick={()=>setTrial({providerId:check.providerId})}>验证当前服务</Button>:<Button variant="link" disabled={busy} onClick={()=>{if(check.tab==='serviceMode'){chooseMode();return;}close();ops.go({view:null,perspective:'models',model:model.id,publicationReturn:model.id,...serviceConfigurationTarget(model,check)});}}>前往配置</Button>)}</li>)}</ul>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
