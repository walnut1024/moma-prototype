import test from 'node:test';
import assert from 'node:assert/strict';
import { readOperationRecords, filterOperationRecords, operationRecordsCsv } from '../src/operation-records.mjs';

const rows = [{ id: 'a', actor: 'estack-yy', time: '2026-10-04 23:59:00', description: '新增成员：林雨' }, { id: 'b', actor: '管理员', time: '2026-10-05 00:00:00', description: '调整主部门：研发中心' }];
test('standalone history reads existing audit without rewriting member storage', () => {
  const serialized = JSON.stringify({ members: [{ id: 'm1' }], audit: rows });
  const storage = { getItem: () => serialized };
  assert.deepEqual(readOperationRecords(storage, 'organization'), rows);
  assert.equal(storage.getItem(), serialized);
  assert.deepEqual(readOperationRecords({ getItem: () => null }, 'organization'), []);
  assert.throws(() => readOperationRecords({ getItem: () => '{' }, 'organization'));
});
test('date bounds are inclusive and combine with actor or content search', () => {
  assert.deepEqual(filterOperationRecords(rows, { start: '2026-10-05', end: '2026-10-05' }), [rows[1]]);
  assert.deepEqual(filterOperationRecords(rows, { query: 'ESTACK' }), [rows[0]]);
  assert.deepEqual(filterOperationRecords(rows, { query: '研发', end: '2026-10-04' }), []);
});
test('export keeps complete audit text and escapes spreadsheet formulas', () => {
  const csv = operationRecordsCsv([{ ...rows[0], actor: '=1+1', description: '新增成员："林雨"' }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('新增成员：""林雨""'));
});
