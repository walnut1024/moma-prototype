import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelOrderRows, modelBillingItems, billingUsageModels, orderBillingScene} from '../src/model-billing-data.mjs';
import {selectedMeteringView, selectedUsageTypes, selectedUsageData, usageCSV} from '../src/usage-data.mjs';
const view = ids => selectedMeteringView(selectedUsageTypes(['语言模型','多模态理解','语音模型','视觉模型'],ids,billingUsageModels),ids,billingUsageModels);
const config = {catalog:billingUsageModels,billing:'按量付费',groups:['语言模型'],start:'2026-10-10',end:'2026-10-10',now:new Date('2026-10-11T00:00:00+08:00'),minutes:60};
test('订购模型的计费项驱动汇总与图表，不从模型类别推测缓存',()=>{
  assert.deepEqual(view(['AITC-DeepSeek-V4-flash']).summary,['total','input','output']);
  assert.equal(view(['AITC-DeepSeek-V4-flash']).charts.length,3);
  assert.deepEqual(view(['deepseek-v3.2']).summary,['total','input','output','cacheReadTotal']);
  assert.equal(view(['deepseek-v3.2']).charts.length,4);
  assert.equal(view(['Qwen3.7-Max']).charts.length,4);
  for(const row of modelOrderRows) for(const id of row[0].split(',')) {
    const actual=view([id]);
    if(!modelBillingItems[id]) {assert.deepEqual(actual.pending,[id]);assert.equal(actual.charts.length,0);continue;}
    assert.equal(actual.charts.length,modelBillingItems[id].filter(item=>item!=='cacheCreate').length+(actual.summary.includes('total')?1:0));
    assert.equal(orderBillingScene(row).split('\n').length,modelBillingItems[id].length);
  }
});
test('缓存与普通输入互斥，多模型指标只合计适用模型，原始总量守恒',()=>{
  const models=['AITC-DeepSeek-V4-flash','deepseek-v3.2'];
  const all=selectedUsageData({...config,modelIds:models});
  const parts=models.map(id=>selectedUsageData({...config,modelIds:[id]}));
  assert.deepEqual(view(models).applicable.cacheReadTotal,['deepseek-v3.2']);
  assert.equal(all.summary.cacheReadTotal,parts[1].summary.cacheReadTotal);
  for(const row of [all.summary,...all.buckets]) { assert.equal(row.uncachedInput+row.cacheReadTotal,row.input); assert.equal(row.total,row.input+row.output); }
  for(const key of ['input','output','uncachedInput']) assert.equal(all.summary[key],parts.reduce((sum,part)=>sum+part.summary[key],0));
  assert.equal(all.buckets[0].modelUsage[models[0]].cacheReadTotal,undefined);
  const csv=usageCSV(all,view(models),'按量付费','语言模型');
  assert.ok(csv.includes('缓存命中 Token（Token）'));assert.ok(csv.includes(models[0]));
});
test('未明确的资费场景保持待配置，不假设输入输出或缓存',()=>{
  const ids=['GLM-5.3-Flash'];
  const actual=view(ids);
  assert.deepEqual(actual.summary,[]);assert.deepEqual(actual.pending,ids);
  assert.equal(selectedUsageData({...config,groups:['多模态理解'],modelIds:ids}).summary.requests,0);
});
test('计量单位保持独立，已观测零调用为零，未观测时段为缺失',()=>{
  assert.deepEqual(view(['CosyVoice']).summary,['characters']);
  assert.deepEqual(view(['Qwen-Image']).summary,['images']);
  const zero=selectedUsageData({...config,modelIds:['AITC-DeepSeek-V4-flash'],apiKeyId:'no-match'});
  assert.equal(zero.summary.input,0);assert.equal(zero.summary.output,0);
  const cachedZero=selectedUsageData({...config,modelIds:['Qwen3.7-Max'],apiKeyId:'no-match'});
  for(const row of [cachedZero.summary,...cachedZero.buckets]) for(const [,keys] of view(['Qwen3.7-Max']).charts) for(const key of keys) assert.equal(row[key],0);
  const future=selectedUsageData({...config,modelIds:['AITC-DeepSeek-V4-flash'],start:'2026-10-12',end:'2026-10-12'});
  assert.equal(future.summary.input,undefined);
});
