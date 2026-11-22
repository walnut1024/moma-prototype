import { modelChanges } from '../server/model-repository.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { supplierDirectory, displayedCatalogueIds } from '../src/admin-v2/moma-provider.js';
import { availableServiceChannels } from '../src/admin-v2/service-workspace.js';

// Seed a previously saved service for tests of its orders, pricing and history.
export async function seedExistingService(db, state, data) {
  const operation = data.libraryIds ? 'createServiceModels' : 'createServiceModel';
  const saved = commitAdminState(state, { type: 'modelOperations', operation, data }, '平台管理员');
  await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'), ...modelChanges(db, state, saved)]);
  return saved;
}

export function storedServiceChannels(state) {
  return supplierDirectory(state).flatMap(provider => displayedCatalogueIds(provider, state).flatMap(catalogueModelId =>
    availableServiceChannels(state, provider, catalogueModelId).map(channel => ({ ...channel, provider, catalogueModelId }))));
}
