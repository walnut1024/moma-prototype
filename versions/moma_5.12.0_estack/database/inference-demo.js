import { resourceId } from '../src/resource-id.mjs';
import { createInferenceDemoFixtures, demoProviderId } from '../src/admin-v2/inference-demo-data.js';
import { loadModelWorkspace, modelChanges } from '../server/model-repository.js';

export async function initializeInferenceDemo(db, now = Date.now()) {
  const recorded = await db.prepare('SELECT reference_json, application_revision FROM model_workspace WHERE id=1').first();
  if (!recorded?.application_revision) throw Error('请先初始化本地演示工作区');
  const reference = JSON.parse(recorded.reference_json);
  const before = await loadModelWorkspace(db, { id: 'admin-001', role: '平台管理员' }, { simulation: false });
  if (before.providers.some(row => row.id === demoProviderId)) return;
  const fixtures = createInferenceDemoFixtures(before, reference.deployments, now, () => resourceId('model'));
  const after = {
    ...structuredClone(before),
    modelTemplates: fixtures.modelTemplates,
    endpoints: [...before.endpoints, ...fixtures.endpoints],
    providers: [...before.providers, ...fixtures.providers],
  };
  reference.deployments = fixtures.deployments;
  reference.routes.push(...fixtures.routes);
  await db.batch([
    db.prepare('PRAGMA defer_foreign_keys=ON'),
    ...modelChanges(db, before, after),
    db.prepare('UPDATE model_workspace SET reference_json=?, application_revision=application_revision+1 WHERE id=1')
      .bind(JSON.stringify(reference)),
    db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1'),
  ]);
}
