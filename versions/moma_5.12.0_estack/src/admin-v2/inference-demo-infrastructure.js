import { infrastructurePages } from './infrastructure-state.js';
import { inferenceDemoOpsModels } from './ops-models.js';
import { inferenceDemoOpsResources } from './ops-resources.js';

export function readInferenceDemoInfrastructure() {
  const seeds = Object.fromEntries(Object.entries(infrastructurePages).map(([id, page]) => [id, page.seed]));
  return inferenceDemoOpsResources(inferenceDemoOpsModels(seeds));
}
