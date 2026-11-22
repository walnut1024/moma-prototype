import { modelChanges } from '../server/model-repository.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';

// Seed a previously saved service for tests of its orders, pricing and history.
export async function seedExistingService(db, state, data) {
  const operation = data.libraryIds ? 'createServiceModels' : 'createServiceModel';
  const saved = commitAdminState(state, { type: 'modelOperations', operation, data }, '平台管理员');
  await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'), ...modelChanges(db, state, saved)]);
  return saved;
}
