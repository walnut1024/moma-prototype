import test from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { readSheet } from 'read-excel-file/node';
import { callLogWorkbook } from '../src/admin-v2/call-log-xlsx.mjs';

test('call log XLSX preserves headings, exact IDs, numbers, blanks and literal text through Excel import', async () => {
  const sheetName = '客户请求 & 明细';
  const heading = ['请求 ID', '耗时（ms）', 'Token', '首包（ms）', '流式', '模型名'];
  const records = [
    ['000012345678901234567890', 13.5, 0, null, false, '  语言模型 & <测试> "😀"  '],
    ['=A2+B2', 0, Number.NaN, undefined, true, '@模型\u0000'],
  ];
  const workbook = callLogWorkbook([heading, ...records], sheetName);
  assert.ok(workbook instanceof Uint8Array);
  const extracted = await readSheet(Buffer.from(workbook), sheetName, { trim: false });
  assert.deepEqual(extracted, [
    heading,
    records[0],
    ['=A2+B2', 0, null, null, true, '@模型'],
  ]);
  const worksheet = strFromU8(unzipSync(workbook)['xl/worksheets/sheet1.xml']);
  assert.doesNotMatch(worksheet, /<f(?:\s|>)/);
  assert.match(worksheet, /r="A3" t="inlineStr"/);
});

test('call log XLSX retains later column positions after blanks and beyond column Z', async () => {
  const headers = Array.from({ length: 28 }, (_, index) => `字段 ${index + 1}`);
  const data = Array(28).fill(null);
  data[26] = '+0000000001';
  data[27] = '-模型';
  const workbook = callLogWorkbook([headers, data], '上游尝试');
  assert.deepEqual(await readSheet(Buffer.from(workbook), '上游尝试'), [headers, data]);
});
