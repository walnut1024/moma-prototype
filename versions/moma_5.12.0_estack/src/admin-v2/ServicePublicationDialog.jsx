import { IconTickCircle, IconAlertCircle } from '@douyinfe/semi-icons';
import { useState } from 'react';
import { Button } from '@douyinfe/semi-ui';
import { Modal, Notice } from './ServiceUI';
import { PlatformTrialDialog } from './ServicePlatformTrial';
import { publicationChecks } from './model-management';
import { serviceConfigurationTarget } from './service-workspace';
import { providerOffer } from '../service-access.mjs';

export default function ServicePublicationDialog({ state, model, providerId, ops, close, chooseMode }) {
  const [trial, setTrial] = useState(null), [busy, setBusy] = useState(false);
  const entry = providerId && providerOffer(model, providerId);
  const serviceId = providerId ? `provider:${model.id}:${providerId}` : undefined;
  const checks = publicationChecks(state,model,{technical:true,serviceId}), ready = checks.every(row=>row.passed);
  const basicReady = checks.filter(row=>row.tab!=='platform').every(row=>row.passed);
  if (trial) return <PlatformTrialDialog key={trial.providerId || 'standard'} state={state} model={model} ops={ops} providerId={trial.providerId} close={()=>setTrial(null)} onPublished={()=>setTrial(null)}/>;
  return <Modal wide title="启动服务" description={entry?.callId || model.name} onClose={()=>{if(!busy)close();}} footer={<>
    <Button theme="light" disabled={busy} onClick={close}>取消</Button>
    <Button theme="light" disabled={busy} onClick={ops.reload}>重新检查</Button>
    <Button loading={busy} disabled={!ops.can || !ready || busy || Boolean(ops.conflict)} onClick={async()=>{
      setBusy(true);
      try {
        const data = { expectedUpdatedAt: model.updatedAt };
        const saved = providerId
          ? await ops.run('serviceProviderServing', { ...data, providerId, enabled: true }, model.id)
          : await ops.run('enableService', data, model.id);
        if (saved) close();
      } finally { setBusy(false); }
    }}>确认启动服务</Button>
  </>}>
    <ul className="ss-checks">{checks.map(check=><li key={check.label}>{check.passed?<IconTickCircle aria-hidden="true"/>:<IconAlertCircle aria-hidden="true"/>}<span>{check.tab==='platform'?(check.passed?'当前服务验证有效':'当前服务待验证'):check.label}</span>{!check.passed && (check.tab==='platform' || serviceConfigurationTarget(model,check)) && (check.tab==='platform'?<Button theme="borderless" disabled={!ops.can || !basicReady} onClick={()=>setTrial({providerId:check.providerId})}>验证当前服务</Button>:<Button theme="borderless" disabled={busy} onClick={()=>{if(check.tab==='serviceMode'){chooseMode();return;}close();const {page,...target}=serviceConfigurationTarget(model,check);ops.go({...target,returnTo:location.hash},{base:page,reset:true});}}>前往配置</Button>)}</li>)}</ul>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
