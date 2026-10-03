import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageData, usageKeys, usageCSV, usageViews, observationData, observationView, meteringView, usageModels, usageModelGroups, usagePeriod, selectedUsageData, selectedUsageTypes, selectedMeteringView } from '../src/usage-data.mjs';
const options = { billing: '按量付费', type: '文本模型', start: '2026-09-17', end: '2026-09-19', now: new Date('2026-09-19T12:00:00+08:00') };
test('模型请求趋势按模型拆分且与总请求数一致', () => {
  const data = usageData(options);
  assert.equal(Object.values(data.summary.modelRequests).reduce((sum, count) => sum + count, 0), data.summary.requests);
  assert.ok(data.buckets.every(row => Object.values(row.modelRequests).reduce((sum, count) => sum + count, 0) === row.requests));
  const selected = usageData({ ...options, targets: ['GLM-5.2'] });
  assert.deepEqual(Object.keys(selected.summary.modelRequests), ['GLM-5.2']);
  assert.equal(meteringView('文本模型').charts[0][0], '总 Token 数');
});
test('模型用量趋势逐模型拆线，与汇总守恒且导出保留模型 ID', () => {
  const data = selectedUsageData({ ...options, groups: ['语言模型'], start: '2026-09-19', minutes: 60 });
  const models = Object.keys(data.buckets[0].modelUsage);
  assert.ok(models.length > 1);
  for (const row of data.buckets) for (const key of ['total', 'input', 'output'])
    assert.equal(Object.values(row.modelUsage).reduce((sum, model) => sum + (model[key] || 0), 0), row[key]);
  assert.equal(data.buckets[0].modelUsage['DeepSeek-V4-Flash'].cacheReadTotal, undefined);
  const csv = usageCSV(data, selectedMeteringView(data.types), options.billing, '语言模型');
  assert.ok(csv.includes('模型 ID') && csv.includes('GLM-5.2'));
});
test('用量图表包含 14 项且速率、缓存与单次平均由同一窗口原始量计算', () => {
  const titles = meteringView('文本模型').charts.map(([title]) => title);
  assert.deepEqual(titles, ['总 Token 数', '输入 Token 数', '输出 Token 数', '每分钟总 Token 数（TPM）', '每分钟输入 Token 数（TPM）', '每分钟输出 Token 数（TPM）', '每分钟读缓存 Token 数', '每分钟写入缓存 Token 数', '读缓存总 Token 数', '写入缓存总 Token 数', '每分钟读显式缓存 Token 数', '区间内命中显式缓存总 Token 数', '平均输入 Token（TPR）', '平均输出 Token（TPR）']);
  for (const minutes of [5, 10, 60, 1440]) {
    const { summary, buckets } = usageData({ ...options, minutes });
    for (const row of [summary, ...buckets]) {
      assert.equal(row.tpm, row.total / row.observedMinutes);
      assert.equal(row.inputMinute, row.input / row.observedMinutes);
      assert.equal(row.outputMinute, row.output / row.observedMinutes);
      assert.equal(row.cacheReadTotal, row.cache + row.cacheRead);
      assert.equal(row.cacheReadMinute, row.cacheReadTotal / row.observedMinutes);
      assert.equal(row.cacheCreateMinute, row.cacheCreate / row.observedMinutes);
      assert.equal(row.explicitReadMinute, row.cacheRead / row.observedMinutes);
      assert.equal(row.inputPerRequest, row.input / row.requests);
      assert.equal(row.outputPerRequest, row.output / row.requests);
    }
  }
  assert.ok(meteringView('多模态模型').charts.every(([, [key]]) => !key.toLowerCase().includes('cache')));
  assert.deepEqual(meteringView('向量模型').charts.map(([title]) => title), ['输入 Token 数', '每分钟输入 Token 数（TPM）', '平均输入 Token（TPR）']);
});
test('时间快捷项按北京时间取值，多类型与模型 ID 筛选不混用计量单位', () => {
  const clock = new Date('2026-09-25T00:30:00+08:00');
  assert.deepEqual(usagePeriod('today', clock), { start: '2026-09-25', end: '2026-09-25' });
  assert.deepEqual(usagePeriod('yesterday', clock), { start: '2026-09-24', end: '2026-09-24' });
  assert.deepEqual(usagePeriod('7d', clock), { start: '2026-09-18', end: '2026-09-24' });
  assert.deepEqual(usagePeriod('30d', clock), { start: '2026-08-26', end: '2026-09-24' });
  assert.deepEqual(usageModelGroups.map(group => group.name), ['语言模型', '多模态理解', '视觉模型', '语音模型', '向量模型', '排序模型']);
  const all = selectedUsageData({ ...options, groups: null });
  const parts = Object.keys(usageModels).map(type => usageData({ ...options, type }));
  assert.equal(all.summary.requests, parts.reduce((sum, data) => sum + data.summary.requests, 0));
  assert.equal(all.summary.total, parts.reduce((sum, data) => sum + (data.summary.total ?? data.summary.metered ?? data.summary.input ?? 0), 0));
  assert.equal(all.summary.images, parts.reduce((sum, data) => sum + (data.summary.images || 0), 0));
  assert.equal(all.summary.tpm, all.summary.total / all.summary.observedMinutes);
  assert.equal(all.buckets.reduce((sum, bucket) => sum + bucket.total, 0), all.summary.total);
  const selected = selectedUsageData({ ...options, groups: ['语言模型', '视觉模型'], modelIds: ['GLM-5.2', 'Qwen-Image'] });
  assert.deepEqual(selected.types, ['文本模型', '图片生成']);
  assert.equal(selected.summary.total, usageData({ ...options, type: '文本模型', targets: ['GLM-5.2'] }).summary.total);
  assert.equal(selected.summary.images, usageData({ ...options, type: '图片生成', targets: ['Qwen-Image'] }).summary.images);
  assert.ok(selectedMeteringView(selected.types).charts.some(([title]) => title === '图片生成量'));
  assert.deepEqual(selectedUsageTypes(['视觉模型'], ['Qwen-Image']), ['图片生成']);
  assert.equal(selectedUsageData({ ...options, groups: ['视觉模型'], modelIds: [] }).summary.requests, 0);
});
test('TPM 峰值按请求分钟合并模型类型，不取小时或日均值', () => {
  const settings = { ...options, minutes: 1440 };
  const parts = ['文本模型', '多模态模型'].map(type => usageData({ ...settings, type }));
  const minuteTotals = new Map();
  for (const part of parts) for (const [minute, tokens] of part.minuteTokens) minuteTotals.set(minute, (minuteTotals.get(minute) || 0) + tokens);
  const selected = selectedUsageData({ ...settings, groups: ['语言模型', '多模态理解'] });
  assert.equal(selected.summary.peakTpm, Math.max(...minuteTotals.values()));
  assert.ok(selected.summary.peakTpm > Math.max(...selected.buckets.map(bucket => bucket.tpm)));
  assert.equal(selected.summary.tpm, selected.summary.total / selected.summary.observedMinutes);
  assert.equal(selectedUsageData({ ...settings, groups: ['语音模型'] }).summary.peakTpm, 0);
});
test('用量汇总、筛选、粒度和导出保持同一统计口径', () => {
  const data = usageData(options);
  assert.ok(data.summary.requests > 0);
  assert.equal(data.summary.total, data.summary.input + data.summary.output);
  assert.ok(data.summary.cache <= data.summary.input);
  for (const minutes of [5, 10, 60, 1440]) {
    const result = usageData({ ...options, minutes });
    for (const field of ['requests', 'total', 'input', 'output', 'cache']) {
      assert.equal(result.summary[field], data.summary[field]);
      assert.equal(result.buckets.reduce((sum, row) => sum + row[field], 0), data.summary[field]);
    }
  }
  const parts = usageKeys('按量付费').map(key => usageData({ ...options, dimension: 'API Key', targets: [key] }));
  assert.equal(parts.reduce((sum, part) => sum + part.summary.total, 0), data.summary.total);
  assert.equal(usageData({ ...options, billing: 'Token Plan', dimension: 'API Key', targets: [usageKeys('按量付费')[0]] }).summary.requests, 0);
  assert.notEqual(usageData({ ...options, billing: 'Token Plan' }).summary.total, data.summary.total);
  assert.equal(usageData({ ...options, start: '2026-09-20' }).buckets.length, 0);
  for (const type of Object.keys(usageViews)) {
    const sample = usageData({ ...options, type });
    assert.ok(sample.summary.requests > 0);
    assert.ok(usageCSV(sample, usageViews[type], options.billing, type).includes('北京时间'));
    assert.equal(usageCSV(sample, usageViews[type], options.billing, type).split('\n').length, sample.buckets.length + 1);
  }
});

test('单日十分钟与多日小时聚合只改变图表点数，不改变计量总量', () => {
  const day = { ...options, start: '2026-09-17', end: '2026-09-17' };
  const tenMinutes = selectedUsageData({ ...day, groups: ['语言模型'], minutes: 10 });
  const oneHour = selectedUsageData({ ...day, groups: ['语言模型'], minutes: 60 });
  assert.equal(tenMinutes.buckets.length, 144);
  assert.equal(oneHour.buckets.length, 24);
  assert.equal(tenMinutes.summary.total, oneHour.summary.total);
  assert.equal(tenMinutes.summary.peakTpm, oneHour.summary.peakTpm);
  assert.equal(tenMinutes.buckets.reduce((sum, row) => sum + row.total, 0), oneHour.summary.total);
  const twoDays = selectedUsageData({ ...options, start: '2026-09-17', end: '2026-09-18', groups: ['语言模型'], minutes: 60 });
  assert.equal(twoDays.buckets.length, 48);
});

test('模型指标遵守计量能力，状态与拆分守恒', () => {
  for (const type of Object.keys(usageViews)) {
    const { summary: s } = usageData({ ...options, type });
    assert.equal(s.requests, s.success + s.failure);
    assert.equal(s.requests, s.status2 + s.status4 + s.status5 + s.statusOther);
    assert.equal(s.failureRate, s.failure / s.requests * 100);
    assert.equal(s.latency, s.duration / s.success);
    assert.ok(s.latencyMin <= s.latency && s.latency <= s.latencyMax);
    const configured = [...usageViews[type].summary, ...usageViews[type].charts.flatMap(([, keys, config]) => [...keys, ...Object.values(config?.variants ?? {}).flat()])];
    for (const key of configured) assert.ok(Number.isFinite(s[key]), `${type}: ${key}`);
    if (['语音合成', '语音识别', '图片生成'].includes(type)) {
      for (const key of ['input', 'output', 'total', 'tpm', 'ttft', 'cache']) assert.equal(s[key], undefined, `${type}: ${key}`);
    }
    if (['向量模型', '重排模型'].includes(type)) {
      assert.ok(s.input > 0);
      for (const key of ['output', 'ttft', 'cache']) assert.equal(s[key], undefined);
    }
    if (['文本模型', '视觉理解'].includes(type)) {
      assert.equal(s.paidOutput, s.thinking + s.nonThinking);
      assert.ok(s.paidInput <= s.input);
      assert.equal(s.cacheRate, s.cache / s.input * 100);
      assert.equal(s.outputSecond, s.outputMinute / 60);
      assert.equal(s.images, undefined);
    }
    if (type === '多模态模型') {
      assert.equal(s.input, s.textIn + s.imageIn + s.videoIn + s.audioIn);
      assert.equal(s.output, s.textOut + s.audioOut);
    }
    if (type === '视频生成') {
      assert.equal(s.metered, s.videoNormal + s.video1080 + s.noVideoNormal + s.noVideo1080);
      assert.equal(s.seconds, undefined);
    }
  }
});

test('吞吐、极值、去重模型和延迟窗口不受图表粒度误导', () => {
  const data = usageData(options);
  for (const minutes of [5, 60, 1440]) {
    const { summary: s, buckets } = usageData({ ...options, minutes });
    assert.equal(s.rpm, s.requests / s.observedMinutes);
    assert.equal(s.tpm, s.total / s.observedMinutes);
    assert.equal(s.latencyMin, Math.min(...buckets.map(row => row.latencyMin)));
    assert.equal(s.latencyMax, Math.max(...buckets.map(row => row.latencyMax)));
    assert.equal(s.models, data.summary.models);
  }
  assert.equal(usageData({ ...options, targets: ['DeepSeek-V4-Pro'] }).summary.models, 1);
  const delayed = usageData({ ...options, source: 'aicc' });
  assert.equal(delayed.availableUntil, options.now.getTime() - 3 * 3600000);
  assert.ok(delayed.buckets.at(-1).time < delayed.availableUntil);
  assert.equal(data.summary.observedMinutes - delayed.summary.observedMinutes, 180);
  assert.equal(usageData({ ...options, minutes: 0 }).buckets.length, 0);
});

test('调用观测跨模型与计费方式汇总，并保持计量和性能边界', () => {
 const all = observationData({...options,billing:'全部'});
 const parts = ['按量付费','Token Plan'].flatMap(billing => [options.type].map(type => usageData({...options,billing,type})));
 assert.equal(all.summary.requests,parts.reduce((n,p)=>n+p.summary.requests,0));
 assert.equal(all.summary.rpm,all.summary.requests/all.summary.observedMinutes);
 assert.equal(all.summary.latency,all.summary.duration/all.summary.success);
 assert.ok(all.summary.latencyP95 >= all.summary.latencyMin && all.summary.latencyP95 <= all.summary.latencyMax);
 assert.ok(all.summary.ttft > 0);
 const selected = observationData({...options,billing:'全部',dimension:'Model ID',targets:['DeepSeek-V4-Pro']});
 assert.ok(selected.summary.ttft>0);
 const key = usageKeys('按量付费')[0];
 const combined = observationData({...options,billing:'全部',modelIds:['DeepSeek-V4-Pro'],apiKeyIds:[key]});
 assert.equal(combined.summary.requests,usageData({...options,billing:'按量付费',targets:['DeepSeek-V4-Pro'],apiKeyId:key}).summary.requests);
 assert.equal(observationData({...options,billing:'全部',modelIds:[]}).summary.requests,0);
 const embed = observationData({...options,billing:'全部',dimension:'Model ID',type:'向量模型',targets:['BGE-M3']});
 assert.equal(embed.summary.ttft,undefined);
 assert.equal(observationData({...options,billing:'Token Plan',dimension:'API Key',targets:[usageKeys('按量付费')[0]]}).summary.requests,0);
 for(const type of Object.keys(usageModels)) assert.ok(!meteringView(type).charts.some(([title])=>['响应时延','首 Token 时延','调用状态分布'].includes(title)));
 assert.ok(usageCSV(all,observationView,'全部','全部模型类型').includes('P95'));
});

test('调用观测严格按模型类型隔离，两种计费汇总且不暴露不支持指标',()=>{
 for(const type of Object.keys(usageModels)){
 const result=observationData({...options,billing:'全部',type});
 const expected=['按量付费','Token Plan'].map(billing=>usageData({...options,billing,type}));
 assert.equal(result.summary.requests,expected.reduce((n,d)=>n+d.summary.requests,0));
 if(!['文本模型','视觉理解'].includes(type)) assert.equal(result.summary.ttft,undefined);
 }
});

test('用量统计 API Key 与模型交叉筛选，分 Key 汇总等于全部', () => {
  const config = { ...options, groups: ['语言模型'], modelIds: ['GLM-5.2'] };
  const all = selectedUsageData(config);
  const parts = usageKeys(options.billing).map(apiKeyId => selectedUsageData({ ...config, apiKeyId }));
  assert.equal(all.summary.requests, parts.reduce((sum, part) => sum + part.summary.requests, 0));
  assert.equal(all.summary.total, parts.reduce((sum, part) => sum + part.summary.total, 0));
  assert.ok(parts[0].summary.requests > 0 && parts[0].summary.requests < all.summary.requests);
  assert.equal(selectedUsageData({ ...config, apiKeyId: 'missing' }).summary.requests, 0);
  assert.equal(parts[0].summary.total, usageData({ ...options, targets: ['GLM-5.2'], apiKeyId: usageKeys(options.billing)[0] }).summary.total);
});

test('语言模型计量分项直接作为同图多条线，且与筛选后的总量守恒', () => {
  const settings = { ...options, start: '2026-09-19', end: '2026-09-19' };
  const check = (model, title, count, totalKey) => {
    const data = selectedUsageData({ ...settings, groups: ['语言模型'], modelIds: [model] });
    const chart = selectedMeteringView(['文本模型'], [model]).charts.find(([name]) => name === title);
    assert.equal(chart[1].length, count, `${model}: ${title}`);
    assert.equal(chart[2]?.variants, undefined);
    assert.equal(chart[1].reduce((sum, key) => sum + data.summary[key], 0), data.summary[totalKey]);
    assert.ok(usageCSV(data, selectedMeteringView(['文本模型'], [model]), settings.billing, model).includes(chart[2].series[0].fullLabel ?? chart[2].series[0].label));
  };
  check('Qwen3.5-35B-A3B', '输入 Token 数', 2, 'input');
  check('Qwen3.5-35B-A3B', '输出 Token 数', 4, 'output');
  check('Qwen3-32B', '输出 Token 数', 2, 'output');
  check('Kimi-K3', '输入 Token 数', 2, 'input');
  check('GLM-5.1', '读缓存总 Token 数', 2, 'cacheReadTotal');
  check('MiniMax-M3', '输出 Token 数', 2, 'output');
  check('qwen3-max', '写入缓存总 Token 数', 3, 'cacheCreate');
  check('qwen3.7-plus', '区间内命中显式缓存总 Token 数', 2, 'cacheRead');
  const ordinary = selectedMeteringView(['文本模型'], ['DeepSeek-V4-Flash']);
  assert.deepEqual(ordinary.charts.find(([title]) => title === '输入 Token 数')[1], ['input']);
  assert.ok(ordinary.charts.every(([title]) => !title.includes('夜间')));
  assert.ok(ordinary.charts.every(([title]) => !title.includes('缓存')));
  assert.deepEqual(selectedMeteringView(['文本模型'], ['GLM-5.1', 'MiniMax-M3']).charts.find(([title]) => title === '输入 Token 数')[1], ['input']);
});
