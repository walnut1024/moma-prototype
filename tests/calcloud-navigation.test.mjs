import assert from 'node:assert/strict';
import test from 'node:test';
import { sections, pages, canAccessPage, pageFromHash, pageWorkspace } from '../src/admin-v2/navigation.mjs';
import { pages as versionPages } from '../versions/moma_5.12.0_estack/src/admin-v2/navigation.mjs';

const operations = ['base-models', 'model-providers', 'cost-analysis', 'customer-analysis', 'provider-analysis', 'model-analysis'];
const maintenance = ['business-call-statistics', 'performance-statistics', 'error-statistics', 'traffic-management', 'model-routing'];
test('11个参考功能为独立导航、独立地址，不改变现有页面或5.12.0', () => {
  for (const [workspace, ids] of [['operations', operations], ['maintenance', maintenance]]) for (const id of ids) {
    const entries=sections.flatMap(section=>section.items).filter(item=>item.children.some(([child])=>child===id));
    assert.equal(entries.length,1,id);assert.equal(entries[0].children.length,1,id);
    assert.equal(pageWorkspace(id),workspace);assert.equal(pageFromHash(`#/admin-2/${id}`, '平台管理员'),id);
    assert.equal(canAccessPage('平台管理员', id),true);
    assert.equal(canAccessPage('运营人员', id),workspace==='operations');
    assert.equal(canAccessPage('运维人员', id),workspace==='maintenance');
    assert.equal(Object.hasOwn(versionPages,id),false);
  }
  assert.equal(pages.listing.label,'模型管理');assert.equal(pages.providers.label,'模型供应');
  assert.equal(pages['call-analysis'].label,'调用分析');assert.equal(pages.routes.label,'路由策略');
});
