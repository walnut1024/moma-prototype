import { useState } from 'react';
import { Choice, Field } from './ModelMetadataForm';
import { getMockScenario, setMockScenario, SCENARIOS } from './mock-onboarding-service';

export default function OnboardingScenarioControl({ onConnected, disabled = false }) {
  const [scenario, setScenario] = useState(getMockScenario);
  return <Field label="测试场景"><Choice label="测试场景" value={scenario} options={SCENARIOS} disabled={disabled} onChange={value => { setMockScenario(value); setScenario(value); onConnected?.(); }}/></Field>;
}
