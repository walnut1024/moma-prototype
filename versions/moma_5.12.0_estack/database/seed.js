import { MODEL_DATASET, validateModelDataset } from '../src/mock/model-data.js';
import { APPLICATION_CONFIG, initialTariffDictionary } from '../src/mock/application-data.js';

import {storedModel} from '../src/mock/model-fields.js';
const json = JSON.stringify;
const timestamp = value => {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) throw Error('初始化时间无效');
  return at;
};
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));

// Import the two current managed cases; historical system examples are a separate reviewed import.
export async function createSeed(dataset = MODEL_DATASET) {
  validateModelDataset(dataset);
  const c = dataset.collections, tables = {}, pointers = [];
  const add = (table, row) => (tables[table] ||= []).push(row);
  const at = timestamp(c.models[0].createdAt), actorId = 'admin-001';
  for (const account of APPLICATION_CONFIG.initial.admins) add('admin_accounts', {
    id: account.id, name: account.name, role: account.role, enabled: Number(account.status === '已启用'), revision: 1,
  });
  for (const m of c.modelTemplates) add('materials', {
    id: m.id, canonical_slug: m.modelId, name: m.name, model_type: m.type, maker: m.maker || '', description: m.description || '', usage_unit: m.usageUnit || null,
    metadata_json: json(storedModel({profile:m.profile || {},capabilities:m.capabilities || {}})), origin: 'seed', revision: m.revision || 1,
    created_at: timestamp(m.createdAt), updated_at: timestamp(m.updatedAt),
  });
  const dict = initialTariffDictionary();
  for (const item of dict.filter(row => row.kind === 'unit')) add('billing_units', {
    id: item.id, name: item.name, name_en: item.englishName || '', dimension: item.name, builtin: Number(item.builtin), enabled: Number(item.status === '已启用'),
  });
  for (const item of dict.filter(row => row.kind === 'currency')) add('currencies', {
    id: item.id, code: item.code, name: item.name, name_en: item.englishName || '', builtin: Number(item.builtin), enabled: Number(item.status === '已启用'),
  });
  for (const item of dict.filter(row => row.kind === 'scenario')) add('billing_items', {
    id: item.id, record_json: json(item), name: item.name, name_en: item.englishName || '', description: item.description || '', builtin: Number(item.builtin), enabled: Number(item.status === '已启用'),
  });
  for (const p of c.providers) {
    add('suppliers', { id: p.id, code: p.code, name: p.name, builtin: Number(p.id === dataset.platformProviderId), enabled: Number(p.status === '已启用'), origin: 'seed',
      profile_json: json(pick(p, ['sourceType','integrationType','contact','contactInfo','description','contractEnd'])), created_at: timestamp(p.createdAt), updated_at: timestamp(p.updatedAt) });
    for (const k of p.apiKeys || []) add('credentials', {
      id: k.id, supplier_id: p.id, name: k.name, masked_value: k.maskedKey, fingerprint: k.fingerprint, version: k.version || 1,
      enabled: Number(!['disabled','已停用'].includes(k.status)), created_at: timestamp(k.createdAt), revoked_at: k.revokedAt ? timestamp(k.revokedAt) : null,
    });
    for (const m of p.catalogModels || []) {
      if (!c.modelTemplates.some(row => row.id === m.libraryId)) throw Error('供应模型必须明确关联主档');
      add('supplier_models', { id: `supplier-model:${p.id}:${m.libraryId}`, supplier_id: p.id, material_id: m.libraryId,
        declaration_json: json(pick(m, ['modelId','name','type','parameters','capabilities'])), created_at: at, updated_at: at });
    }
  }
  for (const ep of c.endpoints) {
    if (ep.authMode !== 'specific' || !ep.apiKeyId) throw Error('当前种子只支持明确的专属密钥引用，不能猜测默认凭证');
    add('channels', { id: ep.id, supplier_id: ep.providerId, code: ep.channelCode || ep.endpointId, name: ep.name, protocol: ep.protocol, base_url: ep.baseUrl,
      connection_json: json(pick(ep, ['interfaceType','timeoutSeconds','adapterOptions','taskUrls'])), credential_mode: 'direct', credential_id: ep.apiKeyId,
      enabled: Number(ep.status === '已启用'), created_at: timestamp(ep.createdAt), updated_at: timestamp(ep.updatedAt) });
  }
  for (const m of c.models) {
    if (m.listingStatus === '已上架') throw Error('种子上架状态需要有效发布证据，不能凭空补造');
    add('services', { id: m.id, material_id: m.templateId, code: m.modelId, mode: m.serviceMode, mode_epoch: m.serviceModeRevision || 1,
      listing_status: m.listingStatus === '已下架' ? 'withdrawn' : 'unlisted', calls_enabled: 0, market_visible: Number(m.marketVisible !== false),
      scope_json: json({ openScope: m.openScope, tenantIds: m.tenantIds || [] }), created_at: timestamp(m.createdAt), updated_at: timestamp(m.updatedAt) });
    const offers = m.serviceMode === 'standard' ? [{ id: `standard:${m.id}`, callId: m.modelId, providerId: null }] : m.serviceProviders.map(p => ({ ...p, id: `provider:${m.id}:${p.providerId}` }));
    for (const o of offers) add('offers', { record_id: o.id, service_id: m.id, material_id: m.templateId, mode_epoch: m.serviceModeRevision || 1, mode: m.serviceMode,
      supplier_id: o.providerId, id: o.callId, market_visible: Number(o.marketVisible !== false), calls_enabled: Number(o.callsEnabled !== false), created_at: at });
  }
  for (const s of c.modelSupplies) {
    const material = c.models.find(m => m.id === s.modelId)?.templateId;
    const association = c.providers.find(p => p.id === s.providerId)?.catalogConnections.find(a => a.id === s.channelId);
    if (!association || association.endpointId !== s.endpointId) throw Error('供应映射缺少精确渠道关联');
    add('channel_models', { id: s.id, channel_id: s.endpointId, supplier_id: s.providerId, supplier_model_id: `supplier-model:${s.providerId}:${material}`, material_id: material,
      upstream_model_id: s.upstreamModelId, mapping_json: json({ sourceAssociationId: s.channelId, capabilities: s.capabilities || {} }), enabled: Number(s.status === '已启用'), created_at: timestamp(s.createdAt), updated_at: timestamp(s.updatedAt) });
    for (const v of association.procurementVersions || []) {
      if (v.status !== '已发布') throw Error('未发布采购版本须单独审阅');
      add('price_versions', { id: v.id, kind: 'purchase', channel_model_id: s.id, version: v.version, source_json: json({ source: 'seed', associationId: association.id }), created_at: timestamp(v.effectiveAt), actor_id: actorId });
      await priceRows(v.id, v.pricing.scenarios, true);
    }
    const active = association.procurementVersions?.filter(v => v.status === '已发布').at(-1);
    if (active) pointers.push({ table: 'channel_models', id: s.id, column: 'active_purchase_price_id', value: active.id });
  }
  async function priceRows(versionId, items, purchase = false) {
    for (const [position, item] of items.entries()) {
      const billing = dict.find(row => row.kind === 'scenario' && row.name === item.name), unit = dict.find(row => row.kind === 'unit' && row.name === item.unit), currency = dict.find(row => row.kind === 'currency' && row.code === item.currency);
      if (!billing || !unit || !currency || billing.unitId !== unit.id) throw Error('种子价格的计费项、单位或币种不匹配');
      const amount = purchase ? item.listPrice : item.amount;
      if (!Number.isSafeInteger(amount) || amount < 0) throw Error('种子价格不能缺失或使用浮点金额');
      const condition = json({ text: item.condition || '' });
      add('price_items', { id: `${versionId}:item:${position}`, price_version_id: versionId, billing_item_id: billing.id, unit_id: unit.id, currency_id: currency.id,
        amount_micros: amount, unit_quantity: 1, condition_json: condition, condition_hash: await hash(condition), labels_json: json(pick(item, ['name','unit','currency','condition'])), position });
    }
  }
  for (const v of c.modelSalePrices) {
    add('price_versions', { id: v.id, kind: 'sale', offer_id: v.serviceId, version: v.version, source_json: json({ source: 'seed' }), created_at: timestamp(v.effectiveAt), actor_id: actorId });
    await priceRows(v.id, v.items);
    pointers.push({ table: 'offers', id: v.serviceId, column: 'active_sale_price_id', value: v.id });
  }
  for (const route of c.serviceRoutes) {
    const offer = tables.offers.find(o => o.record_id === route.serviceId);
    if (!offer) throw Error('路由引用未知服务');
    for (const supply of c.modelSupplies.filter(s => s.modelId === offer.service_id && (!offer.supplier_id || s.providerId === offer.supplier_id))) add('offer_channels', {
      offer_id: offer.record_id, channel_model_id: supply.id, material_id: offer.material_id, supplier_id: supply.providerId, created_at: at,
    });
    for (const v of route.versions) {
      add('route_versions', { id: v.id, offer_id: offer.record_id, version: v.version, strategy: v.config.strategy, config_json: json(v.config), created_at: timestamp(v.publishedAt), actor_id: actorId });
      for (const [position, member] of v.config.channels.filter(row => row.enabled).entries()) add('route_members', { route_version_id: v.id, offer_id: offer.record_id, channel_model_id: member.supplyId, weight: member.weight, position });
    }
    pointers.push({ table: 'offers', id: offer.record_id, column: 'active_route_id', value: route.versions.find(v => v.version === route.activeVersion).id });
  }
  const manifest = { scope: 'current-managed-cases', sourceId: dataset.id, sourceVersion: dataset.version, counts: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length])), omitted: ['historical-system-examples','chart-requests','old-test-evidence'], pointers: pointers.length };
  const identityTables=Object.fromEntries(Object.entries(tables).map(([table,rows])=>[table,rows.map(row=>Object.fromEntries(Object.entries(row).flatMap(([key,value])=>{if(table==='materials' && key==='canonical_slug')return [['code',value]];if(table==='materials' && key==='metadata_json'){const original=c.modelTemplates.find(model=>model.id===row.id);return [['profile_json',json(original.profile || {})],['capabilities_json',json(original.capabilities || {})]];}if(table==='offers' && key==='record_id')return [['id',value]];if(table==='offers' && key==='id')return [['call_id',value]];return [[key,value]];})))]));
  return { id: dataset.id, contentHash: await hash(json({ tables:identityTables, pointers })), importedAt: at, tables, pointers, manifest };
}

export function seedStatements(db, seed) {
  const statements = [db.prepare('INSERT INTO seed_runs(id,content_hash,imported_at,manifest_json) VALUES(?,?,?,?)').bind(seed.id, seed.contentHash, seed.importedAt, json(seed.manifest))];
  for (const [table, rows] of Object.entries(seed.tables)) for (const row of rows) {
    const keys = Object.keys(row);
    statements.push(db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).bind(...Object.values(row)));
  }
  for (const p of seed.pointers) statements.push(db.prepare(`UPDATE ${p.table} SET ${p.column}=? WHERE ${p.table==='offers'?'record_id':'id'}=?`).bind(p.value, p.id));
  return statements;
}

export async function initializeDatabase(db, seed) {
  const existing = await db.prepare('SELECT id,content_hash FROM seed_runs').all();
  if (existing.results.length) {
    if (existing.results.length === 1 && existing.results[0].id === seed.id && existing.results[0].content_hash === seed.contentHash) return { initialized: false, manifest: seed.manifest };
    throw Error('数据库已有其他初始化包，拒绝覆盖');
  }
  const count = await db.prepare('SELECT (SELECT count(*) FROM materials)+(SELECT count(*) FROM suppliers)+(SELECT count(*) FROM services) AS n').first();
  if (count.n) throw Error('数据库已有业务记录，拒绝初始化');
  await db.batch(seedStatements(db, seed));
  return { initialized: true, manifest: seed.manifest };
}
