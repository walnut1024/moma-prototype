import mockConfig from '../mock/catalogues.json' with { type: 'json' };
import {initialApplicationData} from '../mock/application-data.js';
import {systemModelData} from '../mock/model-data.js';
import { usageMeter } from './usage-analysis.js';

const initialResources={...initialApplicationData(0),...systemModelData()};
const DAY = 86400000;
const hourlyTraffic = mockConfig["admin-v2/usage-demo.js"]["hourlyTraffic"];
const customerWeights = mockConfig["admin-v2/usage-demo.js"]["customerWeights"];
const typeWeights = mockConfig["admin-v2/usage-demo.js"]["typeWeights"];
const hash = text => [...text].reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
const randomFor = key => {
  let value = hash(key);
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
};
const choose = (items, weight, random) => {
  let remaining = random() * items.reduce((sum, item, index) => sum + weight(item, index), 0);
  return items.find((item, index) => (remaining -= weight(item, index)) < 0) || items.at(-1);
};

export function usageDemoRequests(state, now) {
  if(!state.initialData)return [];
  const {models,tenants,projects,apiKeys,endpoints,memberships}=initialResources;
  const ids=Object.fromEntries(['models','tenants','projects','apiKeys','endpoints','users'].map(collection=>[collection,new Set(state[collection].map(row=>row.id))]));
  const candidates = models.map(model => ({ model, channels: endpoints.filter(endpoint => endpoint.modelIds?.includes(model.id) && endpoint.status !== '草稿') })).filter(item => item.channels.length && typeWeights[item.model.type]);
  const types = Object.keys(typeWeights).filter(type => candidates.some(item => item.model.type === type));
  const customers = tenants.filter(tenant => customerWeights[tenant.id]).map(tenant => ({ tenant, projects: projects.filter(project => project.tenantId === tenant.id && apiKeys.some(key => key.projectId === project.id && key.status === '有效' && key.modelIds?.length)) })).filter(item => item.projects.length);
  if(!candidates.length || !customers.length)return [];
  const today = Math.floor((now + 8 * 3600000) / DAY) * DAY - 8 * 3600000;
  const requests = [];
  for (let day = 0; day < 36; day++) {
    const midnight = today - day * DAY, stamp = new Date(midnight + 8 * 3600000).toISOString().slice(0, 10);
    const weekday = new Date(midnight + 8 * 3600000).getUTCDay(), weekend = weekday === 0 || weekday === 6;
    const dailyScale = (0.82 + hash(stamp) / 4294967296 * 0.42) * (weekend ? 0.58 : 1);
    for (let hour = 0; hour < 24; hour++) {
      const start = midnight + hour * 3600000;
      if (start >= now) continue;
      const random = randomFor(`${stamp}-${hour}`), office = hour >= 8 && hour < 18;
      const count = Math.round(hourlyTraffic[hour] * dailyScale * (0.72 + random() * 0.56));
      for (let index = 0; index < count; index++) {
        const at = start + Math.floor(random() * 3600000);
        const customer = choose(customers, item => customerWeights[item.tenant.id] * (item.tenant.id === 'tenant-usage-1' ? office ? 1 : 1.7 : office ? 1.15 : 0.35), random);
        const project = choose(customer.projects, item => item.name.includes('生产') ? 9 : 1, random);
        const eligible=candidates.filter(item=>apiKeys.some(key=>key.projectId===project.id&&key.status==='有效'&&key.modelIds?.includes(item.model.id)));
        if(!eligible.length)continue;
        const type = choose(types.filter(type=>eligible.some(item=>item.model.type===type)), item => typeWeights[item] * (office || ['embedding', 'rerank'].includes(item) ? 1 : 0.7), random);
        const { model, channels } = choose(eligible.filter(item => item.model.type === type), (_, rank) => 1 / (rank + 1) ** 1.5, random);
        const endpoint = choose(channels, (_, rank) => rank === 0 ? 3 : 1, random);
        const key = apiKeys.find(item => item.projectId === project.id && item.status === '有效' && item.modelIds.includes(model.id));
        const actors = memberships.filter(member => member.tenantId === customer.tenant.id && member.projectIds?.includes(project.id));
        const actor = choose(actors, () => 1, random), anonymous = random() < 0.06;
        const failed = random() < 0.012, tier = random();
        const target = tier < 0.22 ? 120 + random() * 800 : tier < 0.60 ? 1100 + random() * 2800 : tier < 0.88 ? 4200 + random() * 11000 : tier < 0.975 ? 17000 + random() * 35000 : 66000 + random() * 24000;
        const unit = usageMeter(model, /tts|cosyvoice/i.test(model.modelId) ? { usage: { characters: 1 } } : undefined).unit;
        const inputOnly = ['embedding', 'rerank'].includes(type);
        const total = Math.round(type === 'embedding' ? 80 + random() * 3600 : type === 'rerank' ? 600 + random() * 14000 : target);
        const input = failed ? 0 : inputOnly ? total : Math.round(total * (0.78 + random() * 0.14));
        const output = failed || inputOnly ? 0 : total - input;
        const usage = unit === 'Token' ? { input, output, cached: Math.round(input * (random() < 0.35 ? 0.15 + random() * 0.40 : 0)) } : unit === '张' ? { images: failed ? 0 : 1 + Math.floor(random() * 4) } : unit === '字符' ? { characters: failed ? 0 : Math.round(200 + random() * 1800) } : { seconds: failed ? 0 : type === 'video' ? 4 + Math.floor(random() * 9) : Math.round(10 + random() * 170) };
        const ttftMs = failed || unit !== 'Token' ? null : 130 + Math.round(random() * 620);
        const durationMs = failed ? 2000 + Math.round(random() * 3000) : unit === 'Token' ? Math.round((ttftMs || 0) + 180 + output / (45 + random() * 65) * 1000) : Math.round(700 + random() * 12000);
        const createdAt = new Date(at).toISOString(), id = `${stamp.replaceAll('-', '')}-${String(hour).padStart(2, '0')}-${String(index).padStart(3, '0')}`;
        const attempt = { dispatched: true, startedAt: createdAt, endpointId: endpoint.id, channelId: endpoint.id,
          providerId: endpoint.providerId, durationMs, error: failed ? 'upstream_timeout' : null, usage, usageUnit: unit };
        const row = { id: `usage-demo-${id}`, requestId: `req_${id}`, tenantId: customer.tenant.id, projectId: project.id, keyId: key.id, userId: anonymous ? undefined : actor?.userId, modelId: model.id, publicModelId: model.modelId, versionId: model.defaultVersionId, endpointId: endpoint.id, releaseId: 'release-2', source: random() < 0.92 ? 'API 调用' : '网页端调用', attempts: [attempt], usage, usageUnit: unit, usageConfirmed: true, httpStatus: failed ? 504 : 200, ttftMs, durationMs, createdAt, updatedAt: createdAt };
        // Generate the whole hour before clipping, so reloads keep earlier requests stable.
        if (at < now && ids.models.has(row.modelId) && ids.tenants.has(row.tenantId) && ids.projects.has(row.projectId) && ids.apiKeys.has(row.keyId) && ids.endpoints.has(row.endpointId)) {
          const currentKey=state.apiKeys.find(item=>item.id===row.keyId);
          if(currentKey.tenantId!==row.tenantId || currentKey.projectId!==row.projectId)continue;
          if(row.userId&&!ids.users.has(row.userId))row.userId=undefined;
          requests.push(row);
        }
      }
    }
  }
  return requests;
}
