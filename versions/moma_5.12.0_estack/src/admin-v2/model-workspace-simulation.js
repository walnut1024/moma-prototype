import { configureOnboardingTransport } from './onboarding-client.js';
import { clearCloudMockSnapshot, useCloudMockSnapshot } from './mock-onboarding-service.js';

export { useCloudMockSnapshot };

export function startModelWorkspaceSimulation(api, current) {
  configureOnboardingTransport(async (path, options = {}) => {
    const method = options.method || 'GET';
    const operationId = method === 'GET' ? undefined : options.body?.operationId || crypto.randomUUID();
    const response = await api('/simulation' + path, {
      method, body: method === 'GET' ? undefined : { ...options.body, operationId }, operationId, signal: options.signal,
    });
    if (current.current && response.mockState) {
      current.current.cloudMockState = response.mockState;
      useCloudMockSnapshot(current.current, response.mockState);
    }
    return response.result;
  });
}

export function stopModelWorkspaceSimulation() {
  configureOnboardingTransport(null);
  clearCloudMockSnapshot();
}
