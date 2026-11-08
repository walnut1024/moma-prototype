export const PACKAGE_KINDS = { subscription: '订阅套餐', pack: '资源包' };
export const PACKAGE_STATUS = { draft: '草稿', ready: '待上架', listed: '已上架', unlisted: '已下架' };
export const PACKAGE_PERIODS = { month: '月', quarter: '季', year: '年' };
export const PACKAGE_USER_TYPES = { enterprise: '政企用户', individual: '个人用户' };
export const MAX_PACKAGE_DISPLAY_ORDER = 200;
export const MAX_PACKAGE_TYPE_LENGTH = 24;
export const MAX_PACKAGE_USAGE_LENGTH = 500;
const DEFAULT_PACKAGE_TYPES = [['personal', '个人版'], ['team', '团队版']];

export function packageTypeOptions(state) {
  return [...DEFAULT_PACKAGE_TYPES, ...state.tokenPackageTypes.map(row => [row.id, row.name])];
}

export function canManagePackages(role, operation) {
  return role === '平台管理员' || (role === '运营人员' && !['addType', 'deleteType'].includes(operation));
}

export function canDeletePackage(record) {
  return record?.status === 'draft' && !record.everPublished;
}

export function packageModelBillingItems(model, billingItems) {
  return billingItems.filter(item => model?.billingItemIds.includes(item.id));
}

export function packageModelsWithRules(state) {
  const factors = new Map(state.tokenPackageFactors.map(row => [row.id, row]));
  const names = new Map(state.packageBillingItems.map(row => [row.id, row.name]));
  return state.packageModels.map(model => {
    const config = factors.get(model.id);
    return { ...model, configured: Boolean(config), enabled: config?.enabled === true, legacyFactor: config?.legacyFactor,
      draft: config?.draft, version: packageFactorVersion(config), publishedAt: config?.publishedAt,
      rules: (config?.rules ?? []).map(rule => ({ ...rule, billingItem: names.get(rule.billingItemId) })) };
  });
}

export function packageFactorVersion(config) {
  return config?.version ?? (config?.rules?.length ? 1 : 0);
}

export function packageFactorRuleInputs(rules) {
  return rules.map(({ billingItemId, lower, upper, factor }) => ({
    billingItemId, tiered: lower != null || upper != null, lower: String(lower ?? ''), upper: String(upper ?? ''), factor,
  }));
}

export function packageFactorRange({ lower, upper }) {
  if (lower === null && upper === null) return '不分档';
  if (upper === null) return `> ${lower.toLocaleString('en-US')}`;
  return lower === null
    ? `≤ ${upper.toLocaleString('en-US')}`
    : `${lower.toLocaleString('en-US')} < Token ≤ ${upper.toLocaleString('en-US')}`;
}

export const EMPTY_PACKAGE = {
  kind: 'subscription', name: '', displayName: '', description: '', displayOrder: '', limited: false, purchaseLimit: '',
  quota: '', price: '', period: 'month', cycles: '1', rollover: 'none', validDays: '',
  userTypes: Object.keys(PACKAGE_USER_TYPES),
  packageType: '', usageInstructions: '', usageScope: '',
  modelIds: [],
};

function text(value, label, max, required = false) {
  if (typeof value !== 'string' && value != null) throw new Error(`${label}格式不正确`);
  const result = (value || '').trim();
  if (required && !result) throw new Error(`请填写${label}`);
  if (result.length > max) throw new Error(`${label}最多 ${max} 个字符`);
  return result;
}

function packageFactor(value) {
  const factor = text(value, '抵扣系数', 20, true);
  if (!/^\d+(\.\d{1,2})?$/.test(factor) || Number(factor) <= 0) {
    throw new Error('抵扣系数须为大于 0 的数字，最多两位小数');
  }
  return factor;
}

export const MAX_PACKAGE_FACTOR_RULES = 100;

export function packageFactorRules(rows, billingItems) {
  if (!Array.isArray(rows) || rows.length > MAX_PACKAGE_FACTOR_RULES) {
    throw new Error(`每个模型最多配置 ${MAX_PACKAGE_FACTOR_RULES} 条抵扣规则`);
  }
  const names = new Map(billingItems.map(item => [item.id, item.name]));
  const byItem = new Map();
  for (const [index, row] of rows.entries()) {
    try {
      if (!names.has(row?.billingItemId)) throw new Error('请选择当前模型售价中的有效计费项');
      const bound = (value, label) => {
        const result = integer(value, label, 0);
        return result === '' ? null : Number(result);
      };
      if (typeof row.tiered !== 'boolean') throw new Error('请选择档位方式');
      const lower = row.tiered ? bound(row.lower, '档位下限') : null;
      const upper = row.tiered ? bound(row.upper, '档位上限') : null;
      if (row.tiered && lower === null && upper === null) throw new Error('请填写至少一个档位端点，或选择不分档');
      if (lower !== null && (lower === Number.MAX_SAFE_INTEGER || (upper !== null && lower >= upper))) throw new Error('档位下限须小于上限');
      const factor = packageFactor(row.factor);
      const rules = byItem.get(row.billingItemId) ?? [];
      rules.push({ billingItemId: row.billingItemId, lower, upper, factor });
      byItem.set(row.billingItemId, rules);
    } catch (error) {
      throw new Error(`第 ${index + 1} 条规则：${error.message}`);
    }
  }
  for (const [id, rules] of byItem) {
    rules.sort((a, b) => (a.lower ?? -1) - (b.lower ?? -1));
    for (let index = 1; index < rules.length; index += 1) {
      if ((rules[index].lower ?? -1) < (rules[index - 1].upper ?? Infinity)) {
        throw new Error(`「${names.get(id)}」的规则重叠；同一计费项只能配置一条不分档规则，或配置互不重叠的档位`);
      }
    }
  }
  return [...byItem.values()].flat();
}

function integer(value, label, minimum, required = false, maximum = Number.MAX_SAFE_INTEGER) {
  const result = text(value, label, 16, required);
  if (!result) return '';
  const number = Number(result);
  if (!/^\d+$/.test(result) || number < minimum || number > maximum) {
    throw new Error(`${label}须为 ${minimum} 至 ${maximum} 之间的整数`);
  }
  return String(number);
}

export function packageConfig(values, publish, packageTypes, eligibleModels) {
  if (!values || typeof values !== 'object') throw new Error('请填写套餐配置');
  if (!Object.hasOwn(PACKAGE_KINDS, values.kind)) throw new Error('请选择套餐形式');
  const subscription = values.kind === 'subscription';
  const price = text(values.price, '售价', 15, publish);
  if (typeof values.limited !== 'boolean') throw new Error('请选择每人限购规则');
  if (price && !/^\d+(\.\d{1,2})?$/.test(price)) throw new Error('售价须为非负金额，最多保留两位小数');
  const userTypes = values.userTypes ?? [];
  if (!Array.isArray(userTypes) || userTypes.some(type => typeof type !== 'string' || !Object.hasOwn(PACKAGE_USER_TYPES, type))) {
    throw new Error('支持订购的用户类型无效');
  }
  if (publish && !userTypes.length) throw new Error('请至少选择一种支持订购的用户类型');
  const packageType = text(values.packageType, '套餐类型', MAX_PACKAGE_TYPE_LENGTH);
  if (packageType && !packageTypes.some(([id]) => id === packageType)) throw new Error('请选择已有的套餐类型');
  const modelIds = values.modelIds ?? [];
  if (!Array.isArray(modelIds) || modelIds.some(id => typeof id !== 'string' || !eligibleModels.has(id))) {
    throw new Error('套餐只能包含已允许加入套餐且已配置抵扣规则的模型服务');
  }
  if (publish && !modelIds.length) throw new Error('请至少选择一个已允许加入套餐且已配置抵扣规则的模型服务');
  const config = {
    kind: values.kind,
    name: text(values.name, '套餐名称', 40, publish),
    packageType,
    modelIds: [...new Set(modelIds)],
    usageInstructions: text(values.usageInstructions, '使用说明', MAX_PACKAGE_USAGE_LENGTH),
    usageScope: text(values.usageScope, '使用范围', MAX_PACKAGE_USAGE_LENGTH),
    userTypes: Object.keys(PACKAGE_USER_TYPES).filter(type => userTypes.includes(type)),
    displayName: text(values.displayName, '购买页展示名称', 40),
    description: text(values.description, '套餐简介', 300),
    displayOrder: integer(values.displayOrder, '展示顺序', 0, false, MAX_PACKAGE_DISPLAY_ORDER),
    limited: values.limited,
    purchaseLimit: values.limited ? integer(values.purchaseLimit, '每人限购份数', 1, publish) : '',
    quota: integer(values.quota, 'Token 额度（万）', 1, publish, Math.floor(Number.MAX_SAFE_INTEGER / 10_000)),
    price,
    period: '', cycles: '', rollover: '', validDays: '',
  };
  if (subscription) {
    if (!Object.hasOwn(PACKAGE_PERIODS, values.period)) throw new Error('请选择订阅周期');
    if (!['none', 'next'].includes(values.rollover)) throw new Error('请选择额度结转规则');
    return { ...config, period: values.period, cycles: integer(values.cycles, '总订阅周期数', 1, publish), rollover: values.rollover };
  }
  return { ...config, validDays: integer(values.validDays, '有效天数', 1, publish) };
}

export function tokenPackageTransaction(state, action) {
  const { operation, id, revision, values } = action;
  if (operation === 'saveFactorDraft' || operation === 'publishFactorRules') {
    const modelId = values?.modelId;
    const model = state.packageModels.find(item => item.id === modelId);
    if (!model) throw new Error('模型服务不存在或已归档');
    const billingItems = packageModelBillingItems(model, state.packageBillingItems);
    const previous = state.tokenPackageFactors.find(row => row.id === modelId);
    const collection = 'tokenPackageFactors';
    if (operation === 'saveFactorDraft') {
      const { enabled } = values;
      if (typeof enabled !== 'boolean') throw new Error('允许加入套餐须为布尔值');
      if (!previous && !billingItems.length) throw new Error('该模型暂无生效售价计费项，请先配置并发布模型售价');
      const rules = packageFactorRules(values.rules, billingItems);
      if (enabled && !rules.length) throw new Error('允许加入套餐前，请至少配置一条抵扣规则');
      if (!previous && !rules.length) throw new Error('添加模型前，请至少配置一条抵扣规则');
      const draft = { enabled, rules, changeNote: text(values.changeNote, '修改说明', 300) };
      const label = '保存模型抵扣系数草稿';
      return previous
        ? { type: 'update', collection, id: modelId, changes: { draft }, label }
        : { type: 'add', collection, record: { id: modelId, rules: [], enabled: false, draft }, label };
    }
    if (!previous?.draft) throw new Error('没有待发布的模型抵扣系数');
    const { enabled, changeNote } = previous.draft;
    const rules = packageFactorRules(packageFactorRuleInputs(previous.draft.rules), billingItems);
    if ((!enabled || !rules.length) && state.tokenPackages.some(item => item.modelIds?.includes(modelId))) {
      throw new Error('该模型仍被套餐引用，请先从相关套餐中移除');
    }
    return { type: 'update', collection, id: modelId,
      changes: { rules, enabled, changeNote, draft: null, version: packageFactorVersion(previous) + 1 }, label: '发布模型抵扣系数' };
  }
  const packageTypes = packageTypeOptions(state);
  if (operation === 'addType') {
    const name = text(values?.name, '类型名称', MAX_PACKAGE_TYPE_LENGTH, true);
    if (/[\r\n]/.test(name)) throw new Error('类型名称须为单行文字');
    const normalized = name.normalize('NFKC').toLowerCase();
    if (packageTypes.some(([, label]) => label.normalize('NFKC').toLowerCase() === normalized)) throw new Error('套餐类型已存在');
    const typeId = `TPT-${String(state.revision + 1).padStart(4, '0')}`;
    return { type: 'add', collection: 'tokenPackageTypes', record: { id: typeId, name }, label: '添加套餐类型' };
  }
  if (operation === 'deleteType') {
    const typeId = values?.typeId;
    if (DEFAULT_PACKAGE_TYPES.some(([id]) => id === typeId)) throw new Error('内置套餐类型不可删除');
    if (!state.tokenPackageTypes.some(type => type.id === typeId)) throw new Error('套餐类型不存在或已删除');
    const references = state.tokenPackages.filter(item => item.packageType === typeId).length;
    if (references) throw new Error(`仍有 ${references} 个套餐使用该类型，请先更换或清除这些套餐的类型`);
    return { type: 'remove', collection: 'tokenPackageTypes', id: typeId, label: '删除套餐类型' };
  }
  const previous = state.tokenPackages.find(row => row.id === id);
  if (id && (!previous || previous.revision !== revision)) throw new Error('套餐已变化，请重新打开后再操作');
  if (operation === 'deletePackage') {
    if (!canDeletePackage(previous)) throw new Error('仅可删除从未发布的套餐草稿');
    return { type: 'remove', collection: 'tokenPackages', id, label: '删除套餐草稿' };
  }
  const configured = new Set(state.tokenPackageFactors.filter(row => row.enabled && row.rules.length).map(row => row.id));
  const eligibleModels = new Set(state.packageModels.filter(model => configured.has(model.id)).map(model => model.id));
  if (operation === 'save' || operation === 'publishPackage') {
    if (previous?.status === 'listed') throw new Error('请先下架套餐再编辑');
    if (previous && values?.kind !== previous.kind) throw new Error('套餐创建后不可修改套餐形式');
    const publish = operation === 'publishPackage';
    const changes = { ...packageConfig(values, publish, packageTypes, eligibleModels), status: publish ? 'ready' : 'draft', revision: (previous?.revision || 0) + 1 };
    if (publish) changes.everPublished = true;
    const label = publish ? '发布套餐' : '保存套餐草稿';
    return previous
      ? { type: 'update', collection: 'tokenPackages', id, changes, label }
      : { type: 'add', collection: 'tokenPackages', record: { id: `TP-${String(state.revision + 1).padStart(4, '0')}`, ...changes }, label };
  }
  if (operation === 'list' && ['ready', 'unlisted'].includes(previous?.status)) {
    packageConfig(previous, true, packageTypes, eligibleModels);
    return { type: 'update', collection: 'tokenPackages', id, changes: { status: 'listed', revision: revision + 1 }, label: previous.status === 'unlisted' ? '重新上架套餐' : '上架套餐' };
  }
  if (operation === 'unlist' && previous?.status === 'listed') {
    return { type: 'update', collection: 'tokenPackages', id, changes: { status: 'unlisted', revision: revision + 1 }, label: '下架套餐' };
  }
  throw new Error('当前套餐状态不支持此操作');
}
