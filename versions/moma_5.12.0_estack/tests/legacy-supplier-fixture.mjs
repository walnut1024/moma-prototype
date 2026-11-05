import { parseAdminState } from '../src/admin-v2/store.js';
import fixture from './fixtures/moma-legacy-channels.json' with {type:'json'};
import { withAdminSession } from './admin-session-fixture.mjs';

// Historical-channel behavior uses an explicit test fixture, never production defaults.
export function legacySupplierState() {
  const state = parseAdminState(null);
  const legacy = JSON.parse(JSON.stringify(fixture).replaceAll('@initializedAt', new Date().toISOString()));
  state.endpoints.push(...legacy.endpoints);
  state.providers.find(row => row.id === 'provider-moma').catalogConnections.push(...legacy.connections);
  return withAdminSession(state);
}
