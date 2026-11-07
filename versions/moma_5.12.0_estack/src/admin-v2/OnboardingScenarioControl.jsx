import {onboardingApi} from './onboarding-client';
import { useState } from 'react';
import { Choice, Field } from './ServiceUI';
import {getMockScenario,SCENARIOS} from "./mock-onboarding-service";

export default function OnboardingScenarioControl({ onConnected, disabled = false }) {
  const [scenario, setScenario] = useState(getMockScenario);
  if (typeof location === 'undefined' || new URLSearchParams(location.hash.split('?')[1] || '').get('devtools') !== '1') return null;
  return <Field label="测试场景"><Choice label="测试场景" value={scenario} options={SCENARIOS} disabled={disabled} onChange={async value => { await onboardingApi('/scenario',{method:'POST',body:{operationId:crypto.randomUUID(),scenario:value}}); setScenario(value); onConnected?.(); }}/></Field>;
}
